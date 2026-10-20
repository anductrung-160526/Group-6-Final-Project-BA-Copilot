// Kiểm thử tích hợp tự cập nhật trạng thái task (FN-20 → FN-23): chạy server thật (DB trong bộ nhớ, AI Mock)
// và đi luồng demo của bản 4 ngày qua API. Chủ sở hữu: A7.
//
// Tạo task qua POST /api/projects/:id/tasks (A6). Khi route còn là stub 501 (nhánh chưa gộp A6) thì ghi thẳng vào bảng
// đúng như repo/tasks.ts của A6, để test chạy được ở cả hai phía của lần gộp.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, getDb, tx } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { emit } from "../server/events.ts";
import { registerTaskAutomation } from "../server/taskAutomation.ts";
import type { ArtifactKind, TaskStatus } from "../shared/types.ts";

let server: Server;
let base = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get("content-type") ?? "";
  return { status: res.status, data: (ct.includes("json") ? await res.json() : null) as any };
}

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  // Gọi 2 lần: vẫn chỉ một bộ handler (A0 sẽ gọi trong createApp – xem STATUS.md dòng A7).
  registerTaskAutomation();
  registerTaskAutomation();
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

async function createTask(projectId: string, title: string, artifact?: { kind: ArtifactKind; id: string; moduleId: string }): Promise<string> {
  const body = { title, moduleId: artifact?.moduleId, artifactType: artifact?.kind, artifactId: artifact?.id };
  const r = await api("POST", `/api/projects/${projectId}/tasks`, body);
  if (r.status === 200) {
    assert.equal(r.data.status, "todo");
    return r.data.id;
  }
  assert.equal(r.status, 501, JSON.stringify(r.data));
  const id = randomUUID();
  const at = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO tasks (id, project_id, module_id, title, artifact_type, artifact_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, projectId, artifact?.moduleId ?? null, title, artifact?.kind ?? null, artifact?.id ?? null, at, at);
  getDb()
    .prepare("INSERT INTO task_events (id, task_id, from_status, to_status, by_system, reason, created_at) VALUES (?, ?, NULL, 'todo', 0, '', ?)")
    .run(randomUUID(), id, at);
  return id;
}

const status = (taskId: string) => (getDb().prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as { status: TaskStatus }).status;

/** Các lần đổi trạng thái do hệ thống ghi, cũ trước. */
function systemEvents(taskId: string) {
  return getDb()
    .prepare("SELECT from_status, to_status, by_member_id, reason FROM task_events WHERE task_id = ? AND by_system = 1 ORDER BY created_at, rowid")
    .all(taskId) as { from_status: TaskStatus; to_status: TaskStatus; by_member_id: string | null; reason: string }[];
}
const steps = (taskId: string) => systemEvents(taskId).map((e) => `${e.from_status}→${e.to_status}`);

async function setupModule(name: string) {
  const p = await api("POST", "/api/projects", { name: `Dự án ${name}` });
  const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name, requirementInput: "As a Khách hàng, I want đăng nhập để mua hàng" });
  const s = await api("POST", `/api/modules/${m.data.id}/screens`, {
    prompt: "Màn hình đăng nhập bằng email và mật khẩu (bắt buộc, mật khẩu tối thiểu 8 ký tự), nút Đăng nhập",
    name: "Đăng nhập",
  });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  return { pid: p.data.id as string, mid: m.data.id as string, sid: s.data.screen.id as string };
}

test("luồng demo: tạo task gắn màn → sửa màn Đang làm → duyệt màn Xong → tài liệu, test → sửa màn đã duyệt thì task tài liệu Cần làm lại", async () => {
  const { pid, mid, sid } = await setupModule("Xác thực");
  const other = await api("POST", `/api/modules/${mid}/screens`, { prompt: "Màn hình quên mật khẩu, nhập email, nút Gửi", name: "Quên mật khẩu" });
  const ref = (kind: ArtifactKind, id = mid) => ({ kind, id, moduleId: mid });

  const tScreen = await createTask(pid, "Thiết kế màn Đăng nhập", ref("screen", sid));
  const tOther = await createTask(pid, "Thiết kế màn Quên mật khẩu", ref("screen", other.data.screen.id));
  const tDocs = await createTask(pid, "Viết tài liệu Xác thực", ref("docs"));
  const tTests = await createTask(pid, "Sinh test Xác thực", ref("tests"));
  const tDiagram = await createTask(pid, "Vẽ sơ đồ UC Xác thực", ref("diagram"));
  const tFree = await createTask(pid, "Họp với khách hàng");

  // FN-20: sửa màn (bình luận + sửa) → Đang làm
  const ann = await api("POST", `/api/screens/${sid}/annotations`, { nodeIds: ["btn_login"], comment: 'Đổi chữ thành "Vào hệ thống"' });
  const edit = await api("POST", `/api/screens/${sid}/edit`, { prompt: "", nodeIds: [], annotationIds: [ann.data.id] });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(status(tScreen), "doing");

  // FN-21: duyệt màn → Xong, có lý do (FN-23)
  assert.equal((await api("POST", `/api/screens/${sid}/approve`, {})).status, 200);
  assert.equal(status(tScreen), "done");
  assert.deepEqual(steps(tScreen), ["todo→doing", "doing→done"]);
  assert.equal(systemEvents(tScreen)[1].reason, "Màn hình “Đăng nhập” đã được duyệt");

  // Tài liệu: sinh → Đang làm, duyệt → Xong
  const docs = await api("POST", `/api/modules/${mid}/docs/generate`, {});
  assert.equal(docs.status, 200, JSON.stringify(docs.data));
  assert.equal(status(tDocs), "doing");
  assert.equal((await api("POST", `/api/modules/${mid}/docs/approve`, {})).status, 200);
  assert.equal(status(tDocs), "done");

  // Test case: sinh → Đang làm (bản 4 ngày chưa có bước duyệt test)
  assert.equal((await api("POST", `/api/modules/${mid}/tests/generate`, {})).status, 200);
  assert.equal(status(tTests), "doing");

  // FN-22 + BR-02: sửa màn đã duyệt → màn Cần làm lại, tài liệu Lỗi thời → task tài liệu Cần làm lại
  const edit2 = await api("POST", `/api/screens/${sid}/edit`, { prompt: 'Thêm nút "Đăng nhập bằng Google"', nodeIds: ["login_form"], annotationIds: [] });
  assert.equal(edit2.status, 200, JSON.stringify(edit2.data));
  const detail = await api("GET", `/api/modules/${mid}`);
  assert.equal(detail.data.docsStatus, "outdated");
  assert.equal(detail.data.testsStatus, "outdated");
  assert.equal(status(tScreen), "redo");
  assert.equal(status(tDocs), "redo");
  assert.match(systemEvents(tDocs).at(-1)!.reason, /Tài liệu “Xác thực” thành Lỗi thời.*BR-02/);
  // Task test đang làm dở: Lỗi thời chỉ kéo lùi task đã Xong, còn lại giữ nguyên
  assert.equal(status(tTests), "doing");

  // Task gắn sản phẩm khác hoặc không gắn sản phẩm thì không bị động tới
  for (const t of [tOther, tDiagram, tFree]) {
    assert.equal(status(t), "todo");
    assert.deepEqual(steps(t), []);
  }

  // Làm lại: duyệt lại màn → Xong; sinh lại tài liệu (đang Lỗi thời) → Đang làm
  await api("POST", `/api/screens/${sid}/approve`, {});
  assert.equal(status(tScreen), "done");
  await api("POST", `/api/modules/${mid}/docs/generate`, {});
  assert.equal(status(tDocs), "doing");
  assert.deepEqual(steps(tScreen), ["todo→doing", "doing→done", "done→redo", "redo→done"]);
  assert.deepEqual(steps(tDocs), ["todo→doing", "doing→done", "done→redo", "redo→doing"]);
});

test("sinh lại tài liệu đang Đã duyệt: Xong → Cần làm lại → Đang làm (unapproved rồi drafted)", async () => {
  const { pid, mid, sid } = await setupModule("Giỏ hàng");
  await api("POST", `/api/screens/${sid}/approve`, {});
  await api("POST", `/api/modules/${mid}/docs/generate`, {});
  const tDocs = await createTask(pid, "Duyệt tài liệu Giỏ hàng", { kind: "docs", id: mid, moduleId: mid });
  await api("POST", `/api/modules/${mid}/docs/approve`, {});
  assert.equal(status(tDocs), "done");

  await api("POST", `/api/modules/${mid}/docs/generate`, {});
  assert.deepEqual(steps(tDocs), ["todo→done", "done→redo", "redo→doing"]);
  assert.equal(systemEvents(tDocs)[1].reason, "Tài liệu “Giỏ hàng” bị bỏ duyệt");

  // Bỏ duyệt màn: BR-02 phát stale cho tài liệu (đang Nháp) – task đang làm giữ nguyên
  await api("POST", `/api/screens/${sid}/approve`, { approved: false });
  assert.equal(status(tDocs), "doing");
});

test("sơ đồ UC (gắn theo module): drafted → Đang làm, approved → Xong, stale → Cần làm lại", async () => {
  const { pid, mid } = await setupModule("Thanh toán");
  const tDiagram = await createTask(pid, "Vẽ sơ đồ UC", { kind: "diagram", id: mid, moduleId: mid });
  // A5 chưa gộp: phát thẳng sự kiện như route sơ đồ sẽ làm (docs/api.md mục 3), trong tx() như service
  const fire = (type: "artifact.drafted" | "artifact.approved" | "artifact.stale") =>
    tx(() => emit({ type, artifact: { kind: "diagram", id: mid, moduleId: mid } }));
  fire("artifact.drafted");
  fire("artifact.approved");
  fire("artifact.stale");
  assert.deepEqual(steps(tDiagram), ["todo→doing", "doing→done", "done→redo"]);
  assert.match(systemEvents(tDiagram)[2].reason, /Sơ đồ UC “Thanh toán” thành Lỗi thời.*FN-14/);
});

test("người thao tác: actorId là thành viên thì ghi by_member_id; actorId lạ không làm hỏng thao tác", async () => {
  const { pid, mid, sid } = await setupModule("Hồ sơ");
  const tScreen = await createTask(pid, "Duyệt màn Hồ sơ", { kind: "screen", id: sid, moduleId: mid });
  const memberId = randomUUID();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, 'Lan', 'BA_LEAD', ?)").run(memberId, new Date().toISOString());

  const ok = await api("POST", `/api/screens/${sid}/approve`, { actorId: memberId });
  assert.equal(ok.status, 200);
  assert.equal(systemEvents(tScreen)[0].by_member_id, memberId);

  const odd = await api("POST", `/api/screens/${sid}/approve`, { approved: false, actorId: "khong-ton-tai" });
  assert.equal(odd.status, 200, JSON.stringify(odd.data));
  assert.equal(status(tScreen), "redo");
  assert.equal(systemEvents(tScreen)[1].by_member_id, null);
  // Đăng ký 2 lần nhưng mỗi lần đổi chỉ ghi một dòng
  assert.equal(systemEvents(tScreen).length, 2);
});
