// Test hợp đồng v2 (A2): schema, migrate(), event bus, registry route. Hợp đồng: docs/erd.md, docs/api.md.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { openDb, getDb, migrate, tx, COLUMNS } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { matchRoute, routes, route, FileResponse } from "../server/http.ts";
import { on, emit, clearHandlers, EVENT_TYPES } from "../server/events.ts";
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
  modules: ["id", "project_id", "name", "requirement_input", "docs_status", "tests_status", "created_at", "qus_score", "qus_checked_at"],
  screens: ["id", "module_id", "name", "status", "current_version_id", "created_at"],
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
  members: ["id", "name", "role", "created_at"],
  uc_diagrams: ["module_id", "code", "status", "approved_at", "updated_at"],
  tasks: ["id", "project_id", "module_id", "title", "description", "assignee_id", "due_date", "priority", "status", "artifact_type", "artifact_id", "created_at", "updated_at"],
  task_events: ["id", "task_id", "from_status", "to_status", "by_member_id", "by_system", "reason", "created_at"],
  suggestion_dismissals: ["module_id", "key", "created_at"],
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
});

test("schema: CHECK chặn giá trị trạng thái sai", () => {
  const d = getDb();
  const now = new Date().toISOString();
  assert.throws(() => d.prepare("INSERT INTO members (id, name, role, created_at) VALUES ('x', 'A', 'PM', ?)").run(now));
  d.prepare("INSERT INTO projects (id, name, created_at) VALUES ('p-chk', 'P', ?)").run(now);
  assert.throws(() => d.prepare("INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES ('t', 'p-chk', 'T', 'blocked', ?, ?)").run(now, now));
  assert.throws(() => d.prepare("INSERT INTO tasks (id, project_id, title, artifact_type, created_at, updated_at) VALUES ('t', 'p-chk', 'T', 'video', ?, ?)").run(now, now));
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
  assert.equal(first.length, COLUMNS.length);
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
  assert.deepEqual(EVENT_TYPES, ["artifact.drafted", "artifact.approved", "artifact.unapproved", "artifact.stale"]);
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
