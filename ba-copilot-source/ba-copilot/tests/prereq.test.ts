// Bước tiên quyết khi bấm Xong / Duyệt (D2 đợt 6): shared/prereq.ts + server/prereq.ts + routes/approval.ts.
// Luật giống khi sinh: tài liệu cần bước trước Xong / Đã duyệt (BRD cần ≥ 1 user story); sơ đồ cần mọi tài liệu nguồn;
// bộ test cần FRD-NFR (giữ nhánh legacy); màn hình không có bước tiên quyết. Yêu cầu sửa → bước sau đang Xong thành Bản cũ.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { getDb, openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import * as repo from "../server/repo.ts";
import { doneBlockReason, prereqBlockReason, prereqDocs, type PrereqFacts } from "../shared/prereq.ts";
import type { ArtifactStatus, DocKind } from "../shared/types.ts";

// ---------------------------------------------------------------- hàm thuần

const facts = (docs: Partial<Record<DocKind, ArtifactStatus>>, extra: Partial<PrereqFacts> = {}): PrereqFacts => ({ docStatus: (k) => docs[k], ...extra });

test("doneBlockReason: tài liệu theo chuỗi BRD → UC Spec → SRS → FRD-NFR → API Spec", () => {
  assert.equal(doneBlockReason({ kind: "doc", sub: "BRD" }, facts({}, { storyCount: 2 })), null);
  assert.match(doneBlockReason({ kind: "doc", sub: "BRD" }, facts({}, { storyCount: 0 }))!, /chưa có user story.*trước khi bấm Xong cho BRD/);
  assert.equal(doneBlockReason({ kind: "doc", sub: "BRD" }, facts({})), null, "chưa biết số story (client) → không chặn, server chặn");
  assert.equal(
    doneBlockReason({ kind: "doc", sub: "UC_SPEC" }, facts({ BRD: "draft" })),
    "Bước trước (BRD) chưa Xong (hiện: Đang làm). Hãy hoàn thành và bấm Xong cho BRD trước khi bấm Xong cho UC Specification.",
  );
  assert.match(doneBlockReason({ kind: "doc", sub: "SRS" }, facts({ UC_SPEC: "outdated" }))!, /UC Specification\) chưa Xong \(hiện: Bản cũ\)/);
  assert.match(doneBlockReason({ kind: "doc", sub: "API_SPEC" }, facts({}))!, /FRD-NFR\) chưa Xong \(hiện: Chưa có\)/);
  for (const ok of ["done", "approved"] as ArtifactStatus[]) assert.equal(doneBlockReason({ kind: "doc", sub: "SRS" }, facts({ UC_SPEC: ok })), null);
});

test("doneBlockReason: sơ đồ cần mọi tài liệu nguồn; bộ test cần FRD-NFR (giữ nhánh legacy); màn hình không chặn", () => {
  assert.deepEqual(prereqDocs({ kind: "diagram", sub: "BPMN" }), ["BRD", "UC_SPEC"]);
  assert.equal(
    doneBlockReason({ kind: "diagram", sub: "BPMN" }, facts({ BRD: "done", UC_SPEC: "draft" })),
    "Cần tài liệu UC Specification (hiện: Đang làm) ở trạng thái Xong trước khi bấm Xong cho sơ đồ BPMN.",
  );
  assert.equal(doneBlockReason({ kind: "diagram", sub: "BPMN" }, facts({ BRD: "approved", UC_SPEC: "done" })), null);
  assert.match(doneBlockReason({ kind: "diagram", sub: "ERD" }, facts({ SRS: "done" }))!, /FRD-NFR \(hiện: Chưa có\)/);
  assert.match(doneBlockReason({ kind: "diagram" }, facts({}))!, /UC Specification.*sơ đồ Use Case/, "thiếu sub = sơ đồ UC");

  assert.match(doneBlockReason({ kind: "tests" }, facts({ FRD_NFR: "draft" }))!, /Cần FRD-NFR ở trạng thái Xong trước khi bấm Xong cho bộ test case \(hiện: Đang làm\)/);
  assert.equal(doneBlockReason({ kind: "tests" }, facts({ FRD_NFR: "done" })), null);
  assert.equal(doneBlockReason({ kind: "tests" }, facts({}, { legacyDocsApproved: true })), null, "luồng cũ: chưa có FRD-NFR, bộ tài liệu cũ Đã duyệt");
  assert.notEqual(doneBlockReason({ kind: "tests" }, facts({ FRD_NFR: "draft" }, { legacyDocsApproved: true })), null, "đã có FRD-NFR thì theo FRD-NFR");

  assert.equal(doneBlockReason({ kind: "screen" }, facts({})), null);
});

test("prereqBlockReason 'generate' giữ đúng câu cũ của nút Sinh bằng AI", () => {
  assert.equal(
    prereqBlockReason({ kind: "doc", sub: "SRS" }, facts({ UC_SPEC: "draft" }), "generate"),
    "Bước trước (UC Specification) chưa Xong. Hãy hoàn thành và bấm Xong cho UC Specification trước khi sinh SRS.",
  );
  assert.equal(
    prereqBlockReason({ kind: "doc", sub: "BRD" }, facts({}, { storyCount: 0 }), "generate"),
    "Module chưa có user story. Hãy thêm ít nhất một user story ở mục Yêu cầu nghiệp vụ trước khi sinh BRD.",
  );
  assert.match(prereqBlockReason({ kind: "doc", sub: "SRS" }, facts({ UC_SPEC: "done" }), "approve") ?? "null", /^null$/);
  assert.match(prereqBlockReason({ kind: "tests" }, facts({}), "approve")!, /trước khi duyệt bộ test case/);
});

// ---------------------------------------------------------------- API

let server: Server;
let base = "";
let pid = "";
let ba = "";
let lead = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as any };
}
const now = () => new Date().toISOString();
function member(name: string, role: "BA" | "BA_LEAD"): string {
  const id = randomUUID();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)").run(id, name, role, now());
  return id;
}
function newModule(name: string, stories = 1): string {
  const id = repo.createModule(pid, name).id;
  for (let i = 0; i < stories; i++)
    getDb().prepare("INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, created_at, updated_at) VALUES (?, ?, ?, ?, 'khách', 'mua hàng', ?, ?)").run(randomUUID(), pid, id, `US-${randomUUID().slice(0, 4)}`, now(), now());
  return id;
}
const setDoc = (m: string, kind: DocKind, status: ArtifactStatus) =>
  getDb()
    .prepare("INSERT INTO module_docs (module_id, kind, content, status, rev, updated_at) VALUES (?, ?, '# Nội dung', ?, 1, ?) ON CONFLICT(module_id, kind) DO UPDATE SET status = excluded.status")
    .run(m, kind, status, now());
const setDiagram = (m: string, kind: string, status: ArtifactStatus) =>
  getDb()
    .prepare("INSERT INTO module_diagrams (module_id, kind, code, status, rev, updated_at) VALUES (?, ?, 'flowchart LR', ?, 1, ?) ON CONFLICT(module_id, kind) DO UPDATE SET status = excluded.status")
    .run(m, kind, status, now());
const docSt = (m: string, k: string) => (getDb().prepare("SELECT status FROM module_docs WHERE module_id = ? AND kind = ?").get(m, k) as { status: string }).status;
const diaSt = (m: string, k: string) => (getDb().prepare("SELECT status FROM module_diagrams WHERE module_id = ? AND kind = ?").get(m, k) as { status: string }).status;
const testsSt = (m: string) => (getDb().prepare("SELECT tests_status AS s FROM modules WHERE id = ?").get(m) as { s: string }).s;
const done = (path: string, b: any) => api("POST", `/api/artifacts/${path}/done`, b);
const approve = (path: string, b: any) => api("POST", `/api/artifacts/${path}/approve`, b);
const reqChange = (path: string, b: any) => api("POST", `/api/artifacts/${path}/request-change`, b);

before(async () => {
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  pid = repo.createProject("Dự án tiên quyết").id;
  ba = member("Đức", "BA");
  lead = member("Lan", "BA_LEAD");
});
after(() => server.close());

test("API Xong tài liệu: bước trước chưa Xong → 400 kèm lý do, trạng thái giữ nguyên; Xong rồi thì cho", async () => {
  const m = newModule("Tài liệu");
  setDoc(m, "BRD", "draft");
  setDoc(m, "UC_SPEC", "draft");
  const r = await done(`doc/${m}`, { sub: "UC_SPEC", actorId: ba });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "Bước trước (BRD) chưa Xong (hiện: Đang làm). Hãy hoàn thành và bấm Xong cho BRD trước khi bấm Xong cho UC Specification.");
  assert.equal(docSt(m, "UC_SPEC"), "draft");

  assert.equal((await done(`doc/${m}`, { sub: "BRD", actorId: ba })).status, 200);
  assert.equal((await done(`doc/${m}`, { sub: "UC_SPEC", actorId: ba })).status, 200);
  assert.equal(docSt(m, "UC_SPEC"), "done");

  // BRD không có user story → chặn
  const empty = newModule("Không story", 0);
  setDoc(empty, "BRD", "draft");
  const b = await done(`doc/${empty}`, { sub: "BRD", actorId: ba });
  assert.equal(b.status, 400);
  assert.match(b.data.error, /chưa có user story/);
});

test("API Xong trên bản Bản cũ cũng phải có bước trước Xong (lỗ hổng đợt 5)", async () => {
  const m = newModule("Bản cũ");
  setDoc(m, "BRD", "draft");
  setDoc(m, "UC_SPEC", "outdated");
  const r = await done(`doc/${m}`, { sub: "UC_SPEC", actorId: ba });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal(docSt(m, "UC_SPEC"), "outdated");
});

test("API Duyệt: kiểm cả bước tiên quyết (dữ liệu lệch: bản Xong nhưng bước trước chưa)", async () => {
  const m = newModule("Duyệt");
  setDoc(m, "BRD", "draft");
  setDoc(m, "UC_SPEC", "done");
  const r = await approve(`doc/${m}`, { sub: "UC_SPEC", actorId: lead });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Bước trước \(BRD\) chưa Xong.*trước khi duyệt UC Specification/);
  assert.equal(docSt(m, "UC_SPEC"), "done");
  // Quyền vẫn xét trước: BA → 403
  assert.equal((await approve(`doc/${m}`, { sub: "UC_SPEC", actorId: ba })).status, 403);
});

test("API Xong sơ đồ: mọi tài liệu nguồn phải Xong / Đã duyệt", async () => {
  const m = newModule("Sơ đồ");
  setDoc(m, "BRD", "approved");
  setDoc(m, "UC_SPEC", "draft");
  setDiagram(m, "BPMN", "draft");
  setDiagram(m, "CONTEXT", "draft");
  const r = await done(`diagram/${m}`, { sub: "BPMN", actorId: ba });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, "Cần tài liệu UC Specification (hiện: Đang làm) ở trạng thái Xong trước khi bấm Xong cho sơ đồ BPMN.");
  assert.equal(diaSt(m, "BPMN"), "draft");
  assert.equal((await done(`diagram/${m}`, { sub: "CONTEXT", actorId: ba })).status, 200, "Context chỉ cần BRD");
  setDoc(m, "UC_SPEC", "done");
  assert.equal((await done(`diagram/${m}`, { sub: "BPMN", actorId: ba })).status, 200);
});

test("API Xong bộ test: cần FRD-NFR Xong; nhánh legacy (bộ tài liệu cũ Đã duyệt, chưa có FRD-NFR) vẫn cho", async () => {
  const m = newModule("Test");
  getDb().prepare("UPDATE modules SET tests_status = 'draft', tests_rev = 1 WHERE id = ?").run(m);
  setDoc(m, "FRD_NFR", "draft");
  const r = await done(`tests/${m}`, { actorId: ba });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Cần FRD-NFR ở trạng thái Xong trước khi bấm Xong cho bộ test case \(hiện: Đang làm\)/);
  assert.equal(testsSt(m), "draft");
  setDoc(m, "FRD_NFR", "done");
  assert.equal((await done(`tests/${m}`, { actorId: ba })).status, 200);

  const legacy = newModule("Test cũ");
  getDb().prepare("UPDATE modules SET tests_status = 'draft', tests_rev = 1, docs_status = 'approved' WHERE id = ?").run(legacy);
  assert.equal((await done(`tests/${legacy}`, { actorId: ba })).status, 200);
});

test("API Xong màn hình: không có bước tiên quyết", async () => {
  const m = newModule("Màn", 0);
  const sid = repo.createScreen(m, "Danh sách").id;
  assert.equal((await done(`screen/${sid}`, { actorId: ba })).status, 200);
});

test("Kéo task gắn sản phẩm sang Xong: bị chặn đúng lý do, task và sản phẩm giữ nguyên", async () => {
  const m = newModule("Kanban");
  setDoc(m, "BRD", "draft");
  setDoc(m, "UC_SPEC", "draft");
  const t = (await api("POST", `/api/projects/${pid}/tasks`, { title: "Viết UC", artifactType: "doc", artifactId: m, artifactSub: "UC_SPEC", assigneeId: ba })).data;
  assert.equal((await api("PATCH", `/api/tasks/${t.id}/status`, { status: "doing", actorId: ba })).status, 200);
  const r = await api("PATCH", `/api/tasks/${t.id}/status`, { status: "done", actorId: ba });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Bước trước \(BRD\) chưa Xong/);
  assert.equal((await api("GET", `/api/tasks/${t.id}`)).data.status, "doing");
  assert.equal(docSt(m, "UC_SPEC"), "draft");
});

test("Yêu cầu sửa bước trước → bước sau đang Xong / Đã duyệt thành Bản cũ, task đi theo; bước đang làm giữ nguyên", async () => {
  const m = newModule("Lan truyền");
  for (const k of ["BRD", "UC_SPEC", "SRS", "FRD_NFR"] as DocKind[]) setDoc(m, k, "approved");
  setDoc(m, "API_SPEC", "draft");
  setDiagram(m, "CONTEXT", "approved");
  setDiagram(m, "UC", "done");
  setDiagram(m, "ERD", "done");
  getDb().prepare("UPDATE modules SET tests_status = 'done', tests_rev = 1 WHERE id = ?").run(m);
  const t = (await api("POST", `/api/projects/${pid}/tasks`, { title: "Viết SRS", artifactType: "doc", artifactId: m, artifactSub: "SRS", assigneeId: ba })).data;
  getDb().prepare("UPDATE tasks SET status = 'approved' WHERE id = ?").run(t.id);

  const r = await reqChange(`doc/${m}`, { sub: "UC_SPEC", actorId: lead });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(docSt(m, "UC_SPEC"), "draft");
  assert.equal(docSt(m, "BRD"), "approved", "bước trước không đổi");
  assert.equal(diaSt(m, "CONTEXT"), "approved", "Context chỉ dựa trên BRD");
  assert.deepEqual([docSt(m, "SRS"), docSt(m, "FRD_NFR"), diaSt(m, "UC"), diaSt(m, "ERD"), testsSt(m)], ["outdated", "outdated", "outdated", "outdated", "outdated"]);
  assert.equal(docSt(m, "API_SPEC"), "draft", "bản đang làm không bị đổi");
  assert.equal((await api("GET", `/api/tasks/${t.id}`)).data.status, "doing", "task gắn SRS lùi về Đang làm");
});
