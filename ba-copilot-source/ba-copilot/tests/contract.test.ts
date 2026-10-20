// Test hợp đồng v2 (A2): schema, migrate(), event bus, registry route. Hợp đồng: docs/erd.md, docs/api.md.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { openDb, getDb, migrate, migrateData, initSchema, tx, COLUMNS, getArtifactState, setArtifactState, bumpRev, parseStoryParts } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { matchRoute, routes, route, FileResponse, assertRev, HttpError, requireLead, requireMember, setMemberPassword, hashPassword, verifyPassword } from "../server/http.ts";
import { on, emit, clearHandlers, EVENT_TYPES, EVENT_TYPES_V5 } from "../server/events.ts";
import { touchPresence, listPresence, clearPresence, PRESENCE_TTL_MS } from "../server/presence.ts";
import * as repo from "../server/repo.ts";
import * as svc from "../server/service.ts";
import type { ArtifactEvent } from "../shared/types.ts";

let server: Server;
let base = "";

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
beforeEach(() => clearHandlers());

const columns = (d: DatabaseSync, table: string) => (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name);

// ------------------------------------------------------------------ schema
const TABLES: Record<string, string[]> = {
  projects: ["id", "name", "description", "created_at"],
  modules: ["id", "project_id", "name", "requirement_input", "docs_status", "tests_status", "created_at", "qus_score", "qus_checked_at", "tests_rev", "tests_revision_requested", "tests_updated_by", "tests_updated_at"],
  screens: ["id", "module_id", "name", "status", "current_version_id", "created_at", "rev", "revision_requested", "updated_by", "updated_at"],
  screen_versions: ["id", "screen_id", "number", "kind", "tree", "created_at", "author", "author_id"],
  annotations: ["id", "screen_id", "version_id", "node_ids", "comment", "author", "author_id", "status"],
  use_cases: ["module_id", "code", "ord", "data"],
  requirements: ["module_id", "code", "ord", "data"],
  srs: ["module_id", "data"],
  sequences: ["module_id", "use_case_code", "ord", "data"],
  test_cases: ["module_id", "code", "ord", "data"],
  prompt_runs: ["id", "module_id", "type", "provider", "model", "created_at"],
  suggestion_events: ["id", "screen_id", "action"],
  model_learned_trees: ["version_id", "screen_id", "tree"],
  files: ["id", "project_id", "module_id", "name", "stored_name", "mime", "size", "source", "created_at", "sender", "received_at", "note", "uploaded_by"],
  members: ["id", "name", "role", "created_at", "password_hash"],
  uc_diagrams: ["module_id", "code", "status", "approved_at", "updated_at"],
  tasks: ["id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "revision_requested", "artifact_type", "artifact_id", "artifact_sub", "created_at", "updated_at"],
  task_events: ["id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at"],
  suggestion_dismissals: ["module_id", "key", "created_at"],
  // Đợt 5
  app_meta: ["key", "value", "updated_at"],
  user_stories: ["id", "project_id", "module_id", "code", "as_a", "i_want", "so_that", "acceptance_criteria", "priority", "ord", "rev", "created_at", "updated_by", "updated_at"],
  module_docs: ["module_id", "kind", "content", "data", "status", "revision_requested", "rev", "updated_by", "updated_at"],
  module_diagrams: ["module_id", "kind", "code", "parts", "status", "revision_requested", "rev", "updated_by", "updated_at"],
  project_git: ["project_id", "repo", "token", "branch", "updated_by", "updated_at"],
  git_pushes: ["id", "project_id", "module_id", "artifact_kind", "artifact_id", "artifact_sub", "task_id", "branch", "commit_sha", "commit_url", "message", "files", "by_member_id", "created_at"],
};

test("schema: đủ bảng và cột trên :memory:", () => {
  const d = getDb();
  for (const [table, cols] of Object.entries(TABLES)) {
    const have = columns(d, table);
    assert.ok(have.length, `thiếu bảng ${table}`);
    for (const c of cols) assert.ok(have.includes(c), `thiếu cột ${table}.${c}`);
  }
});

test("schema: có index tasks(project_id), tasks(artifact_type, artifact_id), files(module_id)", () => {
  const idx = (table: string) =>
    (getDb().prepare(`PRAGMA index_list(${table})`).all() as { name: string }[]).map((i) =>
      (getDb().prepare(`PRAGMA index_info(${i.name})`).all() as { name: string }[]).map((c) => c.name).join(","),
    );
  assert.ok(idx("tasks").includes("project_id"));
  assert.ok(idx("tasks").includes("artifact_type,artifact_id"));
  assert.ok(idx("files").includes("module_id"));
});

test("schema: khoá ngoại và ON DELETE đúng như docs/erd.md", () => {
  const fk = (table: string) =>
    Object.fromEntries((getDb().prepare(`PRAGMA foreign_key_list(${table})`).all() as { from: string; table: string; on_delete: string }[]).map((r) => [r.from, `${r.table}:${r.on_delete}`]));
  assert.deepEqual(fk("tasks"), { project_id: "projects:CASCADE", module_id: "modules:SET NULL", assignee_id: "members:SET NULL" });
  assert.deepEqual(fk("task_events"), { task_id: "tasks:CASCADE", by_member_id: "members:SET NULL" });
  assert.deepEqual(fk("uc_diagrams"), { module_id: "modules:CASCADE" });
  assert.deepEqual(fk("suggestion_dismissals"), { module_id: "modules:CASCADE" });
  assert.equal(fk("files").uploaded_by, "members:SET NULL");
  assert.equal(fk("screen_versions").author_id, "members:SET NULL");
  // Đợt 5
  assert.deepEqual(fk("user_stories"), { project_id: "projects:CASCADE", module_id: "modules:SET NULL", updated_by: "members:SET NULL" });
  assert.deepEqual(fk("module_docs"), { module_id: "modules:CASCADE", updated_by: "members:SET NULL" });
  assert.deepEqual(fk("module_diagrams"), { module_id: "modules:CASCADE", updated_by: "members:SET NULL" });
  assert.deepEqual(fk("project_git"), { project_id: "projects:CASCADE", updated_by: "members:SET NULL" });
  assert.deepEqual(fk("git_pushes"), { project_id: "projects:CASCADE", module_id: "modules:SET NULL", task_id: "tasks:SET NULL", by_member_id: "members:SET NULL" });
  assert.equal(fk("screens").updated_by, "members:SET NULL");
  assert.equal(fk("modules").tests_updated_by, "members:SET NULL");
});

test("schema: CHECK chặn giá trị trạng thái sai", () => {
  const d = getDb();
  const now = new Date().toISOString();
  assert.throws(() => d.prepare("INSERT INTO members (id, name, role, created_at) VALUES ('x', 'A', 'PM', ?)").run(now));
  d.prepare("INSERT INTO projects (id, name, created_at) VALUES ('p-chk', 'P', ?)").run(now);
  assert.throws(() => d.prepare("INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES ('t', 'p-chk', 'T', 'blocked', ?, ?)").run(now, now));
  assert.throws(() => d.prepare("INSERT INTO tasks (id, project_id, title, artifact_type, created_at, updated_at) VALUES ('t', 'p-chk', 'T', 'video', ?, ?)").run(now, now));
  // Đợt 5: 'approved' và artifact 'doc' hợp lệ; kind tài liệu/sơ đồ sai bị chặn
  d.prepare("INSERT INTO tasks (id, project_id, title, status, artifact_type, artifact_id, artifact_sub, created_at, updated_at) VALUES ('t-ok', 'p-chk', 'T', 'approved', 'doc', 'm', 'BRD', ?, ?)").run(now, now);
  d.prepare("INSERT INTO modules (id, project_id, name, created_at) VALUES ('m-chk', 'p-chk', 'M', ?)").run(now);
  assert.throws(() => d.prepare("INSERT INTO module_docs (module_id, kind, updated_at) VALUES ('m-chk', 'PRD', ?)").run(now));
  assert.throws(() => d.prepare("INSERT INTO module_diagrams (module_id, kind, updated_at) VALUES ('m-chk', 'GANTT', ?)").run(now));
  assert.throws(() => d.prepare("INSERT INTO module_docs (module_id, kind, status, updated_at) VALUES ('m-chk', 'BRD', 'stale', ?)").run(now));
  d.prepare("DELETE FROM projects WHERE id = 'p-chk'").run();
});

test("migrate(): DB cũ được thêm cột; gọi 2 lần không lỗi", () => {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = ON");
  // Bảng như trước v2 (thiếu cột mới)
  d.exec(`CREATE TABLE members (id TEXT PRIMARY KEY);
    CREATE TABLE modules (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE screen_versions (id TEXT PRIMARY KEY);
    CREATE TABLE annotations (id TEXT PRIMARY KEY, author TEXT NOT NULL DEFAULT 'BA');
    CREATE TABLE files (id TEXT PRIMARY KEY);
    INSERT INTO modules (id, name) VALUES ('m1', 'Cũ');`);
  const first = migrate(d);
  // Chỉ thêm cột cho bảng đã có (bảng chưa có thì SCHEMA tạo đủ cột)
  const present = new Set(["members", "modules", "screen_versions", "annotations", "files"]);
  assert.equal(first.length, COLUMNS.filter((c) => present.has(c.table)).length);
  assert.deepEqual(migrate(d), []);
  assert.ok(columns(d, "modules").includes("qus_score"));
  assert.deepEqual({ ...d.prepare("SELECT name, qus_score FROM modules").get() }, { name: "Cũ", qus_score: null });
  // DB đã mở bằng openDb: migrate thêm lần nữa vẫn không đổi gì
  assert.deepEqual(migrate(), []);
  assert.deepEqual(migrate(), []);
});

// ------------------------------------------------------------------ event bus
test("events: emit gọi đúng handler theo loại, huỷ đăng ký được", () => {
  const got: string[] = [];
  const offA = on("artifact.approved", (e) => got.push(`A:${e.artifact.id}`));
  on("artifact.stale", (e) => got.push(`S:${e.artifact.kind}`));
  const ev: ArtifactEvent = { type: "artifact.approved", artifact: { kind: "screen", id: "s1", moduleId: "m1" }, actorId: "u1" };
  emit(ev);
  emit({ type: "artifact.drafted", artifact: { kind: "screen", id: "s2", moduleId: "m1" } });
  emit({ type: "artifact.stale", artifact: { kind: "docs", id: "m1", moduleId: "m1" } });
  offA();
  emit(ev);
  assert.deepEqual(got, ["A:s1", "S:docs"]);
  assert.deepEqual(EVENT_TYPES_V5, ["artifact.drafted", "artifact.done", "artifact.approved", "artifact.revision_requested", "artifact.stale"]);
  assert.deepEqual(EVENT_TYPES, [...EVENT_TYPES_V5, "artifact.unapproved"]);
});

test("events: handler chạy chung transaction – handler lỗi thì thao tác bị huỷ", () => {
  const p = repo.createProject("P-ev", "");
  const m = repo.createModule(p.id, "M", "");
  const s = repo.createScreen(m.id, "Đăng nhập");
  repo.addVersion(s.id, { kind: "generate", prompt: "x", tree: { id: "root", type: "Page", props: {}, children: [] } as any });
  // tx lồng nhau: handler gọi tx() vẫn chạy được
  on("artifact.approved", () => tx(() => getDb().prepare("UPDATE screens SET name = 'Đổi trong handler' WHERE id = ?").run(s.id)));
  svc.setScreenApproval(s.id, true);
  assert.equal(repo.getScreen(s.id)!.name, "Đổi trong handler");
  svc.setScreenApproval(s.id, false);
  clearHandlers();
  on("artifact.approved", () => {
    throw new Error("handler lỗi");
  });
  assert.throws(() => svc.setScreenApproval(s.id, true), /handler lỗi/);
  assert.equal(repo.getScreen(s.id)!.status, "draft");
});

test("events: service phát đúng sự kiện ở luồng màn → tài liệu (BR-02)", async () => {
  const log: ArtifactEvent[] = [];
  for (const t of EVENT_TYPES) on(t, (e) => log.push(e));
  const p = repo.createProject("P-flow", "");
  const m = repo.createModule(p.id, "Xác thực", "Là khách hàng, tôi muốn đăng nhập.");
  const { screen } = await svc.createScreenFromPrompt(m.id, "Màn đăng nhập email mật khẩu", "Đăng nhập", "u1");
  const sid = screen!.id;
  svc.setScreenApproval(sid, true, "lead");
  await svc.generateDocs(m.id);
  svc.approveDocs(m.id, true, "lead");
  // Sửa tay màn đã duyệt → màn về nháp, tài liệu thành Lỗi thời
  const tree = repo.getVersion(repo.getScreen(sid)!.currentVersionId!)!.tree;
  svc.manualEdit(sid, { op: "remove", id: tree.children![0].id }, "u2");
  const brief = log.map((e) => `${e.type}:${e.artifact.kind}${e.actorId ? "@" + e.actorId : ""}`);
  assert.deepEqual(brief, [
    "artifact.drafted:screen@u1",
    "artifact.approved:screen@lead",
    "artifact.drafted:docs",
    "artifact.approved:docs@lead",
    "artifact.drafted:screen@u2",
    "artifact.unapproved:screen@u2",
    "artifact.stale:docs@u2",
  ]);
  assert.ok(log.every((e) => e.artifact.moduleId === m.id));
  assert.equal(log.find((e) => e.artifact.kind === "docs")!.artifact.id, m.id);
  assert.equal(repo.getModule(m.id)!.docsStatus, "outdated");
});

// ------------------------------------------------------------------ registry route
// Mọi endpoint mới trong docs/api.md phải được đăng ký (stub hoặc đã làm).
const CONTRACT: [string, string][] = [
  ["GET", "/api/members"],
  ["POST", "/api/members"],
  ["PATCH", "/api/members/x"],
  ["DELETE", "/api/members/x"],
  ["GET", "/api/projects/x/files"],
  ["POST", "/api/projects/x/files"],
  ["GET", "/api/files/x"],
  ["PATCH", "/api/files/x"],
  ["GET", "/api/files/x/preview"],
  ["GET", "/api/files/x/download"],
  ["DELETE", "/api/files/x"],
  ["GET", "/api/modules/x/diagram"],
  ["POST", "/api/modules/x/diagram/generate"],
  ["PUT", "/api/modules/x/diagram"],
  ["POST", "/api/modules/x/diagram/approve"],
  ["GET", "/api/projects/x/tasks"],
  ["POST", "/api/projects/x/tasks"],
  ["GET", "/api/projects/x/artifacts"],
  ["GET", "/api/tasks/x"],
  ["PATCH", "/api/tasks/x"],
  ["DELETE", "/api/tasks/x"],
  ["PATCH", "/api/tasks/x/status"],
  ["GET", "/api/artifacts/screen/x/tasks"],
  ["GET", "/api/modules/x/qus"],
  ["GET", "/api/modules/x/suggestions"],
  ["POST", "/api/modules/x/suggestions/fr%3AFR-04/dismiss"],
  ["DELETE", "/api/modules/x/suggestions/fr%3AFR-04/dismiss"],
  // Đợt 5 (docs/api.md mục "Đợt 5")
  ["POST", "/api/login"],
  ["POST", "/api/logout"],
  ["GET", "/api/me"],
  ["PUT", "/api/members/x/password"],
  ["POST", "/api/presence"],
  ["GET", "/api/presence"],
  ["DELETE", "/api/presence"],
  ["GET", "/api/projects/x/runs"],
  ["GET", "/api/projects/x/stories"],
  ["POST", "/api/projects/x/stories"],
  ["POST", "/api/projects/x/stories/reorder"],
  ["GET", "/api/stories/x"],
  ["PATCH", "/api/stories/x"],
  ["DELETE", "/api/stories/x"],
  ["GET", "/api/modules/x/docs"],
  ["GET", "/api/modules/x/docs/BRD"],
  ["PUT", "/api/modules/x/docs/BRD"],
  ["POST", "/api/modules/x/docs/BRD/generate"],
  ["POST", "/api/modules/x/docs/BRD/refine"],
  ["GET", "/api/modules/x/diagrams"],
  ["GET", "/api/modules/x/diagrams/ERD"],
  ["PUT", "/api/modules/x/diagrams/ERD"],
  ["POST", "/api/modules/x/diagrams/ERD/generate"],
  ["GET", "/api/artifacts/doc/x/state"],
  ["POST", "/api/artifacts/doc/x/done"],
  ["POST", "/api/artifacts/doc/x/approve"],
  ["POST", "/api/artifacts/doc/x/request-change"],
  ["GET", "/api/projects/x/git"],
  ["PUT", "/api/projects/x/git"],
  ["POST", "/api/projects/x/git/test"],
  ["GET", "/api/projects/x/git/history"],
  ["GET", "/api/screens/x/export/html"],
];

test("route: mọi endpoint trong docs/api.md đã được đăng ký", () => {
  for (const [method, path] of CONTRACT) assert.ok(matchRoute(method, path), `chưa đăng ký ${method} ${path}`);
  const hit = matchRoute("POST", "/api/modules/m1/suggestions/link%3As1%3An2/dismiss")!;
  assert.deepEqual(hit.params, { id: "m1", key: "link:s1:n2" });
});

test("route: endpoint còn là stub trả 501", async () => {
  const stubs = routes.filter((r) => r.stub);
  for (const r of stubs) {
    const path = r.path.replace(/:(\w+)/g, "x");
    const res = await fetch(base + path, { method: r.method, headers: { "content-type": "application/json" }, body: r.method === "GET" ? undefined : "{}" });
    assert.equal(res.status, 501, `${r.method} ${r.path}`);
    assert.match((await res.json()).error, /Chưa triển khai/);
  }
});

test("route: endpoint cũ vẫn chạy qua registry", async () => {
  const res = await fetch(base + "/api/projects");
  assert.equal(res.status, 200);
  assert.equal((await fetch(base + "/api/khong-co")).status, 404);
});

// ------------------------------------------------------------------ FileResponse (R-005)
// Route thử chỉ đăng ký trong tiến trình test này (đường dẫn không có trong docs/api.md).
const VN_NAME = "Tài liệu đặc tả \"Đợt 1\"; bản\\mới.pdf";
route("GET", "/api/__test/file/attachment", () => new FileResponse(Buffer.from("%PDF-1.4"), VN_NAME, "application/pdf"));
route("GET", "/api/__test/file/inline", () => new FileResponse(Buffer.from("%PDF-1.4"), VN_NAME, "application/pdf", "inline"));
route("GET", "/api/__test/file/ascii", () => new FileResponse(Buffer.from("a,b\n"), "bao-cao.csv", "text/csv"));

test("FileResponse: tên tiếng Việt tải về 200, filename= ASCII an toàn, filename*= giữ tên gốc", async () => {
  const res = await fetch(base + "/api/__test/file/attachment");
  assert.equal(res.status, 200);
  const cd = res.headers.get("content-disposition")!;
  assert.equal(cd, `attachment; filename="Tai lieu dac ta _Dot 1__ ban_moi.pdf"; filename*=UTF-8''${encodeURIComponent(VN_NAME)}`);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "%PDF-1.4");
});

test("FileResponse: disposition \"inline\" cho xem trước", async () => {
  const res = await fetch(base + "/api/__test/file/inline");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition")!, /^inline; filename="Tai lieu dac ta /);
});

test("FileResponse: mặc định vẫn attachment (tương thích chỗ gọi cũ)", async () => {
  assert.equal(new FileResponse(Buffer.alloc(0), "a.txt", "text/plain").disposition, "attachment");
  const res = await fetch(base + "/api/__test/file/ascii");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-disposition"), `attachment; filename="bao-cao.csv"; filename*=UTF-8''bao-cao.csv`);
});

// =================================================================== Đợt 5 (C2)

// ------------------------------------------------------------------ migration DB v2 → đợt 5
// Các bảng đúng như v2-demo trước đợt 5 (tasks có CHECK cũ, chưa có 'approved'/'doc', chưa có cột mới).
const OLD_V2 = `
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE modules (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, requirement_input TEXT NOT NULL DEFAULT '', docs_status TEXT NOT NULL DEFAULT 'none', tests_status TEXT NOT NULL DEFAULT 'none', created_at TEXT NOT NULL);
CREATE TABLE screens (id TEXT PRIMARY KEY, module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', current_version_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE use_cases (module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (module_id, code));
CREATE TABLE requirements (module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (module_id, code));
CREATE TABLE srs (module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE sequences (module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, use_case_code TEXT NOT NULL, ord INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (module_id, use_case_code));
CREATE TABLE members (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'BA' CHECK(role IN ('BA','BA_LEAD')), created_at TEXT NOT NULL);
CREATE TABLE uc_diagrams (module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','stale')), approved_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  assignee_id TEXT REFERENCES members(id) ON DELETE SET NULL, due_date TEXT, priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High','Medium','Low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','redo')),
  artifact_type TEXT CHECK(artifact_type IN ('screen','docs','diagram','tests')), artifact_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE TABLE task_events (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, from_status TEXT, to_status TEXT NOT NULL,
  by_member_id TEXT REFERENCES members(id) ON DELETE SET NULL, by_system INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
`;

function oldDb(): DatabaseSync {
  const d = new DatabaseSync(":memory:");
  d.exec("PRAGMA foreign_keys = ON");
  d.exec(OLD_V2);
  const at = "2026-10-01T00:00:00.000Z";
  const uc = { code: "UC-01", name: "Đăng nhập", actors: ["Khách hàng"], description: "Đăng nhập hệ thống", trigger: "", preconditions: [], postconditions: [], mainFlow: [{ no: 1, actor: "Khách hàng", text: "Nhập email" }], altFlows: [], exceptions: [], businessRules: [], screenIds: [], assumptions: [] };
  const fr = { code: "FR-01", type: "FR", statement: "Cho phép đăng nhập | bằng email", priority: "High", useCaseCodes: ["UC-01"], source: "", isAssumption: false };
  d.exec(`
    INSERT INTO projects VALUES ('p1', 'Shop', '', '${at}');
    INSERT INTO members VALUES ('lead', 'Lan', 'BA_LEAD', '${at}'), ('ba', 'Minh', 'BA', '${at}');
    INSERT INTO modules (id, project_id, name, requirement_input, docs_status, tests_status, created_at) VALUES
      ('m1', 'p1', 'Xác thực', 'As a customer, I want to log in with email so that I can see my orders.\nLà quản trị viên, tôi muốn khoá tài khoản để ngăn gian lận.\n\nHệ thống phải gửi email xác nhận.', 'approved', 'draft', '${at}'),
      ('m2', 'p1', 'Giỏ hàng', '', 'none', 'none', '${at}');
    INSERT INTO screens VALUES ('s1', 'm1', 'Đăng nhập', 'approved', NULL, '${at}');
    INSERT INTO use_cases VALUES ('m1', 'UC-01', 0, '${JSON.stringify(uc)}');
    INSERT INTO requirements VALUES ('m1', 'FR-01', 0, '${JSON.stringify(fr)}');
    INSERT INTO srs VALUES ('m1', '${JSON.stringify({ sections: [{ key: "intro", title: "Giới thiệu", content: "Phạm vi" }] })}');
    INSERT INTO sequences VALUES ('m1', 'UC-01', 0, '${JSON.stringify({ useCaseCode: "UC-01", title: "Đăng nhập", mermaid: "sequenceDiagram\\n A->>B: x" })}');
    INSERT INTO uc_diagrams VALUES ('m1', 'flowchart LR\n a-->b', 'stale', NULL, '${at}');
    INSERT INTO tasks (id, project_id, module_id, title, assignee_id, status, artifact_type, artifact_id, created_at, updated_at) VALUES
      ('t1', 'p1', 'm1', 'Sửa màn', 'ba', 'redo', 'screen', 's1', '${at}', '${at}'),
      ('t2', 'p1', 'm1', 'Tài liệu', 'ba', 'done', 'docs', 'm1', '${at}', '${at}');
    INSERT INTO task_events VALUES ('e1', 't1', NULL, 'todo', 'lead', 0, '', '${at}'), ('e2', 't1', 'done', 'redo', NULL, 1, 'Màn bị bỏ duyệt', '${at}');
  `);
  return d;
}

test("migration: DB v2 cũ → đợt 5 (tasks, tài liệu, sơ đồ, user story), chạy lại không đổi gì", () => {
  const d = oldDb();
  initSchema(d);
  const all = (sql: string, ...a: string[]) => d.prepare(sql).all(...a).map((r) => ({ ...r }));
  const one = (sql: string, ...a: string[]) => ({ ...(d.prepare(sql).get(...a) as object) }) as Record<string, any>;

  // tasks: dựng lại bảng, redo → doing + cờ; lịch sử task_events còn nguyên (không bị CASCADE khi DROP)
  assert.deepEqual(all("SELECT id, status, revision_requested AS rr, artifact_type AS t FROM tasks ORDER BY id"), [
    { id: "t1", status: "doing", rr: 1, t: "screen" },
    { id: "t2", status: "done", rr: 0, t: "docs" },
  ]);
  assert.equal(all("SELECT id FROM task_events").length, 2);
  d.prepare("UPDATE tasks SET status = 'approved', artifact_type = 'doc', artifact_sub = 'BRD' WHERE id = 't2'").run();
  assert.deepEqual(d.prepare("PRAGMA foreign_key_check").all(), []);
  assert.deepEqual(all("PRAGMA foreign_key_list(tasks)").map((r: any) => `${r.from}:${r.table}:${r.on_delete}`).sort(), [
    "assignee_id:members:SET NULL",
    "module_id:modules:SET NULL",
    "project_id:projects:CASCADE",
  ]);

  // Tài liệu cũ → module_docs, giữ trạng thái (approved)
  const docs = all("SELECT kind, status, rev, content, data FROM module_docs WHERE module_id = 'm1' ORDER BY kind");
  assert.deepEqual(docs.map((r: any) => `${r.kind}:${r.status}:${r.rev}`), ["FRD_NFR:approved:1", "SRS:approved:1", "UC_SPEC:approved:1"]);
  const uc = docs.find((r: any) => r.kind === "UC_SPEC") as any;
  assert.match(uc.content, /## UC-01 – Đăng nhập/);
  assert.equal(JSON.parse(uc.data).useCases[0].code, "UC-01");
  assert.match((docs.find((r: any) => r.kind === "FRD_NFR") as any).content, /\| FR-01 \| Cho phép đăng nhập \\\| bằng email/);
  assert.equal(all("SELECT 1 FROM module_docs WHERE module_id = 'm2'").length, 0, "module chưa có tài liệu thì không tạo dòng");

  // Sơ đồ: sequences → SEQUENCE (parts), uc_diagrams → UC (stale → outdated)
  const seq = one("SELECT code, parts, status FROM module_diagrams WHERE module_id = 'm1' AND kind = 'SEQUENCE'");
  assert.equal(seq.status, "approved");
  assert.deepEqual(JSON.parse(seq.parts).map((p: any) => p.key), ["UC-01"]);
  assert.deepEqual(one("SELECT code, status FROM module_diagrams WHERE module_id = 'm1' AND kind = 'UC'"), { code: "flowchart LR\n a-->b", status: "outdated" });

  // requirement_input → user_stories (splitStories + tách As a / I want / so that, giữ hoa thường)
  assert.deepEqual(all("SELECT code, module_id AS m, as_a AS a, i_want AS w, so_that AS s, priority AS p FROM user_stories ORDER BY ord"), [
    { code: "US-01", m: "m1", a: "customer", w: "to log in with email", s: "I can see my orders", p: "Medium" },
    { code: "US-02", m: "m1", a: "quản trị viên", w: "khoá tài khoản", s: "ngăn gian lận", p: "Medium" },
    { code: "US-03", m: "m1", a: "", w: "Hệ thống phải gửi email xác nhận.", s: "", p: "Medium" },
  ]);

  // Cột/bảng cũ vẫn còn (màn cũ còn chạy)
  assert.ok(columns(d, "modules").includes("requirement_input"));
  assert.ok(columns(d, "uc_diagrams").length);
  // Cột mới có giá trị mặc định cho dữ liệu cũ
  assert.deepEqual(one("SELECT status, rev, revision_requested AS rr FROM screens WHERE id = 's1'"), { status: "approved", rev: 1, rr: 0 });

  // Chạy lại: không thêm cột, không thêm story/tài liệu, không dựng lại bảng
  d.prepare("DELETE FROM user_stories WHERE code = 'US-03'").run();
  assert.deepEqual(initSchema(d), []);
  assert.deepEqual(migrateData(d), []);
  assert.equal(all("SELECT 1 FROM user_stories").length, 2, "story đã xoá không bị tạo lại");
  // Mã cũ còn ghi 'redo' (taskRules v2) → lần khởi động sau đổi lại
  d.prepare("UPDATE tasks SET status = 'redo', revision_requested = 0 WHERE id = 't1'").run();
  assert.deepEqual(migrateData(d), ["tasks.redo→doing:1"]);
});

test("parseStoryParts: khuôn mẫu Anh/Việt, câu tự do → null", () => {
  assert.deepEqual(parseStoryParts("As an admin I want to lock accounts"), { asA: "admin", iWant: "to lock accounts", soThat: "" });
  assert.deepEqual(parseStoryParts("Với tư cách là Khách, tôi muốn Xem giỏ hàng, để Thanh toán."), { asA: "Khách", iWant: "Xem giỏ hàng", soThat: "Thanh toán" });
  assert.equal(parseStoryParts("Hệ thống phải nhanh"), null);
});

// ------------------------------------------------------------------ trạng thái sản phẩm + chặn đè
test("getArtifactState / setArtifactState / bumpRev: ánh xạ đúng bảng, tài liệu chưa sinh = none/rev 0", () => {
  const p = repo.createProject("P-state", "");
  const m = repo.createModule(p.id, "M", "");
  const s = repo.createScreen(m.id, "Màn");
  const scr = { kind: "screen" as const, id: s.id, moduleId: m.id };
  assert.deepEqual(
    (({ status, rev, revisionRequested }) => ({ status, rev, revisionRequested }))(getArtifactState(scr)!),
    { status: "draft", rev: 1, revisionRequested: false },
  );
  assert.equal(bumpRev(scr, "khong-ton-tai"), 2, "người sửa không có thật → updated_by NULL, vẫn tăng rev");
  assert.equal(getArtifactState(scr)!.updatedBy, null);
  setArtifactState(scr, { status: "done", revisionRequested: true });
  assert.equal(repo.getScreen(s.id)!.status, "done");
  assert.equal(getArtifactState(scr)!.revisionRequested, true);

  const brd = { kind: "doc" as const, id: m.id, moduleId: m.id, sub: "BRD" as const };
  assert.deepEqual((({ status, rev }) => ({ status, rev }))(getArtifactState(brd)!), { status: "none", rev: 0 });
  assert.equal(setArtifactState(brd, { status: "done" }), null, "tài liệu chưa sinh thì không đổi trạng thái được");
  getDb().prepare("INSERT INTO module_docs (module_id, kind, content, updated_at) VALUES (?, 'BRD', '# BRD', ?)").run(m.id, new Date().toISOString());
  assert.equal(setArtifactState(brd, { status: "approved" })!.status, "approved");
  assert.equal(getArtifactState({ kind: "diagram", id: m.id, moduleId: m.id })!.ref.sub, "UC", "diagram thiếu sub = UC");
  assert.equal(getArtifactState({ kind: "tests", id: m.id, moduleId: m.id })!.status, "none");
  assert.equal(getArtifactState({ kind: "screen", id: "khong-co", moduleId: "" }), null);
});

test("assertRev: thiếu baseRev cho qua, lệch → HttpError 409 CONFLICT kèm rev hiện tại", () => {
  assert.doesNotThrow(() => assertRev(3, undefined));
  assert.doesNotThrow(() => assertRev(3, null));
  assert.doesNotThrow(() => assertRev(3, 3));
  assert.throws(
    () => assertRev(4, 3),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === "CONFLICT" && (e.data as any).rev === 4,
  );
});

test("assertRev qua HTTP: sửa màn với baseRev cũ → 409 { code: CONFLICT, rev }, đúng baseRev → 200 và rev + 1", async () => {
  const p = repo.createProject("P-rev", "");
  const m = repo.createModule(p.id, "M", "");
  const s = repo.createScreen(m.id, "Màn A");
  const patch = (b: object) => fetch(`${base}/api/screens/${s.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const ok = await patch({ name: "Màn B", baseRev: 1 });
  assert.equal(ok.status, 200);
  const state = await (await fetch(`${base}/api/artifacts/screen/${s.id}/state`)).json();
  assert.equal(state.rev, 2);
  assert.equal(state.ref.moduleId, m.id);
  const stale = await patch({ name: "Màn C", baseRev: 1 });
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "Bản đã thay đổi – tải lại", code: "CONFLICT", rev: 2 });
  assert.equal(repo.getScreen(s.id)!.name, "Màn B", "bản bị chặn không được ghi");
  assert.equal((await patch({ name: "Màn D" })).status, 200, "client cũ không gửi baseRev vẫn ghi được");
});

// ------------------------------------------------------------------ presence
test("presence: còn trong 90 giây, hết hạn sau 90 giây, không trả chính mình", () => {
  clearPresence();
  const t = { kind: "doc" as const, id: "m1", sub: "BRD" };
  const t0 = 1_000_000;
  touchPresence(t, { id: "a", name: "An" }, t0);
  touchPresence(t, { id: "b", name: "Bình" }, t0 + 1000);
  assert.deepEqual(listPresence(t, "a", t0 + 60_000).map((e) => e.name), ["Bình"]);
  assert.deepEqual(listPresence(t, null, t0 + 60_000).map((e) => e.name), ["An", "Bình"]);
  assert.deepEqual(listPresence({ ...t, sub: "SRS" }, null, t0), [], "khác tài liệu thì không thấy");
  touchPresence(t, { id: "a", name: "An" }, t0 + 60_000); // nhịp tiếp → gia hạn
  assert.deepEqual(listPresence(t, null, t0 + 1000 + PRESENCE_TTL_MS + 1).map((e) => e.name), ["An"], "Bình quá 90 giây không nhịp");
  assert.equal(listPresence(t, null, t0 + 1000 + PRESENCE_TTL_MS + 1)[0].since, new Date(t0).toISOString(), "since giữ lúc mở đầu tiên");
  assert.deepEqual(listPresence(t, null, t0 + 60_000 + PRESENCE_TTL_MS + 1), []);
});

test("presence qua HTTP (chế độ demo, người gửi = actorId)", async () => {
  clearPresence();
  const mk = (id: string, name: string) => getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, 'BA', ?)").run(id, name, new Date().toISOString());
  mk("pr-ha", "Hà");
  mk("pr-tu", "Tú");
  const post = (actorId: string) => fetch(`${base}/api/presence`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "screen", id: "s9", actorId }) }).then((r) => r.json());
  assert.deepEqual(await post("pr-ha"), []);
  assert.deepEqual((await post("pr-tu")).map((e: any) => e.name), ["Hà"]);
  const list = await (await fetch(`${base}/api/presence?kind=screen&id=s9&actorId=pr-ha`)).json();
  assert.deepEqual(list.map((e: any) => e.name), ["Tú"]);
  assert.equal((await fetch(`${base}/api/presence?kind=video&id=1`)).status, 400);
});

// ------------------------------------------------------------------ phân quyền
const fakeCtx = (actorId?: string) => ({ req: { headers: {} } as any, body: actorId ? { actorId } : {}, query: new URLSearchParams() });

test("mật khẩu: scrypt băm có muối, kiểm tra đúng/sai", () => {
  const h = hashPassword("bi-mat-123");
  assert.match(h, /^scrypt\$/);
  assert.notEqual(h, hashPassword("bi-mat-123"));
  assert.ok(verifyPassword("bi-mat-123", h));
  assert.ok(!verifyPassword("sai", h));
  assert.ok(!verifyPassword("bi-mat-123", null));
});

test("requireLead / requireMember: chế độ demo (chưa ai có mật khẩu)", () => {
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES ('rl-lead', 'Trưởng', 'BA_LEAD', ?), ('rl-ba', 'Nhân viên', 'BA', ?)").run(now, now);
  assert.equal(requireMember(fakeCtx()), null, "demo: không rõ người vẫn cho qua");
  assert.equal(requireLead(fakeCtx())?.id, undefined);
  assert.equal(requireLead(fakeCtx("rl-lead"))!.id, "rl-lead");
  assert.throws(() => requireLead(fakeCtx("rl-ba")), (e: unknown) => e instanceof HttpError && e.status === 403 && e.code === "FORBIDDEN");
  assert.throws(() => setMemberPassword("rl-ba", "matkhau1"), /BA Lead trước/, "mật khẩu đầu tiên phải của BA Lead");
});

// Chạy CUỐI file: bật chế độ member cho cả server test, dọn lại ở cuối.
test("phân quyền chế độ member: đăng nhập, actor lấy từ phiên, requireLead chặn BA, 401 khi chưa đăng nhập", async () => {
  const json = { "content-type": "application/json" };
  setMemberPassword("rl-lead", "lead-pass-1");
  setMemberPassword("rl-ba", "ba-pass-1");
  try {
    // requireLead/requireMember không phiên → 401, actorId client gửi bị bỏ qua
    assert.throws(() => requireMember(fakeCtx("rl-lead")), (e: unknown) => e instanceof HttpError && e.status === 401);
    assert.throws(() => requireLead(fakeCtx("rl-lead")), (e: unknown) => e instanceof HttpError && e.status === 401);
    const anon = await fetch(`${base}/api/projects`);
    assert.equal(anon.status, 401);
    assert.deepEqual(await anon.json(), { error: "Chưa đăng nhập", code: "UNAUTHENTICATED", mode: "member" });
    assert.deepEqual(await (await fetch(`${base}/api/me`)).json(), { member: null, mode: "member", appAuth: false });

    const bad = await fetch(`${base}/api/login`, { method: "POST", headers: json, body: JSON.stringify({ name: "nhân viên", password: "sai-mat-khau" }) });
    assert.equal(bad.status, 401);
    const login = async (name: string, password: string) => {
      const r = await fetch(`${base}/api/login`, { method: "POST", headers: json, body: JSON.stringify({ name, password }) });
      assert.equal(r.status, 200, name);
      const body = await r.json();
      assert.equal(body.member.hasPassword, true);
      assert.equal(body.member.password_hash, undefined);
      return r.headers.get("set-cookie")!.split(";")[0];
    };
    const baCookie = await login("nhân viên", "ba-pass-1"); // tên không phân biệt hoa thường
    const leadCookie = await login("Trưởng", "lead-pass-1");

    const me = await (await fetch(`${base}/api/me`, { headers: { cookie: baCookie } })).json();
    assert.equal(me.member.id, "rl-ba");
    assert.equal((await fetch(`${base}/api/projects`, { headers: { cookie: baCookie } })).status, 200);

    // Actor lấy từ phiên: BA gửi actorId của Lead vẫn bị coi là BA → 403 khi đặt mật khẩu cho người khác
    const setPw = (cookie: string, id: string, password: string, actorId?: string) =>
      fetch(`${base}/api/members/${id}/password`, { method: "PUT", headers: { ...json, cookie }, body: JSON.stringify({ password, actorId }) });
    const forbidden = await setPw(baCookie, "rl-lead", "doi-mat-khau", "rl-lead");
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).code, "FORBIDDEN");
    assert.equal((await setPw(leadCookie, "rl-ba", "ba-pass-2")).status, 200, "BA Lead đặt được cho người khác");
    assert.equal((await fetch(`${base}/api/me`, { headers: { cookie: baCookie } }).then((r) => r.json())).member, null, "đổi mật khẩu → phiên cũ hết hiệu lực");

    // Presence trong chế độ member: người gửi lấy từ phiên
    clearPresence();
    await fetch(`${base}/api/presence`, { method: "POST", headers: { ...json, cookie: leadCookie }, body: JSON.stringify({ kind: "story", id: "st1", actorId: "rl-ba" }) });
    assert.deepEqual(listPresence({ kind: "story", id: "st1" }).map((e) => e.memberId), ["rl-lead"]);

    const out = await fetch(`${base}/api/logout`, { method: "POST", headers: { ...json, cookie: leadCookie } });
    assert.match(out.headers.get("set-cookie") ?? "", /bac_member=;/);
  } finally {
    getDb().prepare("UPDATE members SET password_hash = NULL").run();
  }
  assert.equal((await fetch(`${base}/api/projects`)).status, 200, "hết mật khẩu → về chế độ demo");
});
