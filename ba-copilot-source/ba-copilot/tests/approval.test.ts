// Xong / Duyệt / Yêu cầu sửa (docs/api.md "Đợt 5" mục 5.5) + task đi theo sản phẩm. Chủ sở hữu: C7.
// Chạy server thật, DB trong bộ nhớ; GitHub giả lập bằng registerApprovedPusher (điểm nối của C8).
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { getDb, openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { registerApprovedPusher } from "../server/events.ts";
import * as repo from "../server/repo.ts";

let server: Server;
let base = "";
let pid = "";
let mid = "";
let sid = "";
let ba = "";
let lead = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as any };
}

function member(name: string, role: "BA" | "BA_LEAD"): string {
  const id = randomUUID();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)").run(id, name, role, new Date().toISOString());
  return id;
}

/** Tài liệu đã sinh (như C5 ghi): Bản nháp, rev 1. */
function makeDoc(moduleId: string, kind: string, status = "draft") {
  getDb()
    .prepare("INSERT INTO module_docs (module_id, kind, content, status, rev, updated_at) VALUES (?, ?, '# Nội dung', ?, 1, ?)")
    .run(moduleId, kind, status, new Date().toISOString());
}

const docState = (kind: string) => getDb().prepare("SELECT status, revision_requested AS rr, rev FROM module_docs WHERE module_id = ? AND kind = ?").get(mid, kind) as { status: string; rr: number; rev: number };
const taskRow = (id: string) => ({ ...(getDb().prepare("SELECT status, revision_requested AS rr FROM tasks WHERE id = ?").get(id) as object) }) as { status: string; rr: number };
const lastEvent = (id: string) => getDb().prepare("SELECT from_status, to_status, by_member_id, by_system, reason FROM task_events WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(id) as any;

before(async () => {
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  pid = repo.createProject("Dự án duyệt").id;
  mid = repo.createModule(pid, "Xác thực").id;
  sid = repo.createScreen(mid, "Đăng nhập").id;
  ba = member("Lan", "BA");
  lead = member("Hùng", "BA_LEAD");
  // BRD chỉ Xong được khi module có ≥ 1 user story (shared/prereq.ts, D2 đợt 6)
  getDb()
    .prepare("INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, created_at, updated_at) VALUES (?, ?, ?, 'US-01', 'khách', 'đăng nhập', 'mua hàng', ?, ?)")
    .run(randomUUID(), pid, mid, new Date().toISOString(), new Date().toISOString());
});
after(() => server.close());
afterEach(() => registerApprovedPusher(null));

const done = (path: string, b: any) => api("POST", `/api/artifacts/${path}/done`, b);
const approve = (path: string, b: any) => api("POST", `/api/artifacts/${path}/approve`, b);
const reqChange = (path: string, b: any) => api("POST", `/api/artifacts/${path}/request-change`, b);

test("vòng đầy đủ: Xong → Yêu cầu sửa → Xong → Duyệt; task gắn tài liệu BRD đi theo, ghi lý do", async () => {
  makeDoc(mid, "BRD");
  const t = await api("POST", `/api/projects/${pid}/tasks`, { title: "Viết BRD", artifactType: "doc", artifactId: mid, artifactSub: "BRD", assigneeId: ba });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  assert.equal(t.data.artifactSub, "BRD");
  const other = await api("POST", `/api/projects/${pid}/tasks`, { title: "Viết SRS", artifactType: "doc", artifactId: mid, artifactSub: "SRS" });
  const tid = t.data.id;

  const d1 = await done(`doc/${mid}`, { sub: "BRD", actorId: ba, baseRev: 1 });
  assert.equal(d1.status, 200, JSON.stringify(d1.data));
  assert.equal(d1.data.state.status, "done");
  assert.equal(d1.data.state.rev, 2, "đổi trạng thái cũng tăng rev (chặn ghi từ bản còn thấy trạng thái cũ)");
  assert.equal(d1.data.state.updatedBy, ba);
  assert.deepEqual(d1.data.tasks.map((x: any) => [x.id, x.status]), [[tid, "done"]]);
  assert.equal(lastEvent(tid).reason, "BA marked BRD document – Xác thực as done");
  assert.equal(lastEvent(tid).by_member_id, ba);

  const rc = await reqChange(`doc/${mid}`, { sub: "BRD", actorId: lead });
  assert.equal(rc.status, 200, JSON.stringify(rc.data));
  assert.deepEqual([rc.data.state.status, rc.data.state.revisionRequested], ["draft", true]);
  assert.deepEqual([rc.data.state.rev, rc.data.state.updatedBy], [3, lead], "Yêu cầu sửa ghi người + lúc, tăng rev");
  assert.ok(rc.data.state.updatedAt);
  assert.deepEqual(taskRow(tid), { status: "doing", rr: 1 });
  assert.equal(lastEvent(tid).reason, "BA Lead requested changes to BRD document – Xác thực");

  const d2 = await done(`doc/${mid}`, { sub: "BRD", actorId: ba });
  assert.equal(d2.status, 200);
  assert.deepEqual([d2.data.state.status, d2.data.state.revisionRequested], ["done", true], "cờ giữ tới khi Duyệt");
  assert.deepEqual(taskRow(tid), { status: "done", rr: 1 });

  const ap = await approve(`doc/${mid}`, { sub: "BRD", actorId: lead });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  assert.deepEqual([ap.data.state.status, ap.data.state.revisionRequested], ["approved", false]);
  assert.deepEqual([ap.data.state.rev, ap.data.state.updatedBy], [5, lead], "Duyệt ghi người + lúc, tăng rev");
  assert.deepEqual(ap.data.git, { pushed: false, message: "GitHub is not configured – nothing was pushed" });
  assert.deepEqual(taskRow(tid), { status: "approved", rr: 0 });
  assert.equal(lastEvent(tid).reason, "BA Lead approved BRD document – Xác thực");

  // Task gắn tài liệu khác của cùng module không bị động tới
  assert.deepEqual(taskRow(other.data.id), { status: "todo", rr: 0 });

  // Yêu cầu sửa cả bản đã duyệt
  const rc2 = await reqChange(`doc/${mid}`, { sub: "BRD", actorId: lead });
  assert.equal(rc2.status, 200);
  assert.deepEqual(taskRow(tid), { status: "doing", rr: 1 });
});

test("quyền: BA không Duyệt / Yêu cầu sửa được; thiếu actorId bị chặn cả Xong", async () => {
  makeDoc(mid, "UC_SPEC", "done");
  for (const body of [{ sub: "UC_SPEC", actorId: ba }, { sub: "UC_SPEC" }, { sub: "UC_SPEC", actorId: "khong-co" }]) {
    const r = await approve(`doc/${mid}`, body);
    assert.equal(r.status, 403, JSON.stringify(body));
    assert.equal(r.data.error, "Only a BA Lead can approve");
    assert.equal(r.data.code, "FORBIDDEN");
    const c = await reqChange(`doc/${mid}`, body);
    assert.equal(c.status, 403);
  }
  assert.equal(docState("UC_SPEC").status, "done", "trạng thái giữ nguyên");

  makeDoc(mid, "SRS");
  assert.equal((await done(`doc/${mid}`, { sub: "SRS" })).status, 403, "Xong cần biết ai bấm");
  assert.equal((await done(`doc/${mid}`, { sub: "SRS", actorId: "khong-co" })).status, 403);
  assert.equal(docState("SRS").status, "draft");
  assert.equal((await done(`doc/${mid}`, { sub: "SRS", actorId: lead })).status, 200, "BA Lead cũng bấm Xong được");
});

test("pushApproved lỗi → trạng thái giữ nguyên, báo rõ; thành công → trả kết quả GitHub", async () => {
  makeDoc(mid, "FRD_NFR", "done");
  const t = await api("POST", `/api/projects/${pid}/tasks`, { title: "FRD", artifactType: "doc", artifactId: mid, artifactSub: "FRD_NFR" });
  registerApprovedPusher(async () => {
    throw new Error("Token hết hạn");
  });
  const bad = await approve(`doc/${mid}`, { sub: "FRD_NFR", actorId: lead });
  assert.equal(bad.status, 502);
  assert.match(bad.data.error, /not approved.*Token hết hạn/);
  assert.equal(docState("FRD_NFR").status, "done");
  assert.equal(docState("FRD_NFR").rev, 1, "duyệt lỗi → không tăng rev");
  assert.equal(taskRow(t.data.id).status, "done", "task mới gắn tài liệu đã Xong bắt đầu ở Xong");

  let got: any = null;
  registerApprovedPusher(async (ref, actorId) => {
    got = { ref, actorId };
    return { pushed: true, message: "Đã đẩy", commitSha: "abc123" };
  });
  const ok = await approve(`doc/${mid}`, { sub: "FRD_NFR", actorId: lead });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.git.commitSha, "abc123");
  assert.deepEqual(got, { ref: { kind: "doc", id: mid, moduleId: mid, sub: "FRD_NFR" }, actorId: lead });
  assert.equal(docState("FRD_NFR").status, "approved");
  assert.equal(taskRow(t.data.id).status, "approved");
});

test("sai trạng thái nguồn / tham số / rev → 400 / 404 / 409", async () => {
  makeDoc(mid, "API_SPEC");
  assert.equal((await approve(`doc/${mid}`, { sub: "API_SPEC", actorId: lead })).status, 400, "duyệt bản nháp");
  assert.equal((await reqChange(`doc/${mid}`, { sub: "API_SPEC", actorId: lead })).status, 400, "yêu cầu sửa bản nháp");
  const conflict = await done(`doc/${mid}`, { sub: "API_SPEC", actorId: ba, baseRev: 7 });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.data.code, "CONFLICT");
  assert.equal(conflict.data.rev, 1);
  assert.equal((await done(`doc/${mid}`, { sub: "API_SPEC", actorId: ba })).status, 200);
  assert.equal((await done(`doc/${mid}`, { sub: "API_SPEC", actorId: ba })).status, 400, "Xong hai lần");

  assert.equal((await done(`doc/${mid}`, { actorId: ba })).status, 400, "doc thiếu sub");
  assert.equal((await done(`video/${mid}`, { actorId: ba })).status, 400);
  assert.equal((await done(`diagram/${mid}`, { sub: "ERD", actorId: ba })).status, 400, "sơ đồ chưa sinh");
  assert.equal((await done(`screen/khong-co`, { actorId: ba })).status, 404);
});

test("màn hình: Xong / Duyệt qua endpoint chung, task gắn màn đi theo", async () => {
  const t = await api("POST", `/api/projects/${pid}/tasks`, { title: "Thiết kế màn", artifactType: "screen", artifactId: sid });
  assert.equal((await done(`screen/${sid}`, { actorId: ba })).status, 200);
  const ap = await approve(`screen/${sid}`, { actorId: lead });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  assert.equal(ap.data.state.status, "approved");
  assert.equal(taskRow(t.data.id).status, "approved");
  assert.equal(lastEvent(t.data.id).reason, "BA Lead approved Screen “Đăng nhập”");
});

test("kéo thẻ task gắn sản phẩm (PATCH status) đi qua luồng duyệt của sản phẩm", async () => {
  const m2 = repo.createModule(pid, "Giỏ hàng").id;
  makeDoc(m2, "BRD", "done"); // nguồn của BPMN phải Xong mới bấm Xong sơ đồ được (D2 đợt 6)
  makeDoc(m2, "UC_SPEC", "approved");
  getDb().prepare("INSERT INTO module_diagrams (module_id, kind, code, status, rev, updated_at) VALUES (?, 'BPMN', 'flowchart LR', 'draft', 1, ?)").run(m2, new Date().toISOString());
  const t = (await api("POST", `/api/projects/${pid}/tasks`, { title: "Vẽ BPMN", artifactType: "diagram", artifactId: m2, artifactSub: "BPMN" })).data;
  const st = () => ({ ...(getDb().prepare("SELECT status, revision_requested AS rr FROM module_diagrams WHERE module_id = ? AND kind = 'BPMN'").get(m2) as object) }) as any;

  assert.equal((await api("PATCH", `/api/tasks/${t.id}/status`, { status: "doing", actorId: ba })).status, 200);
  assert.equal(st().status, "draft", "bắt đầu làm không đổi sản phẩm");
  const d = await api("PATCH", `/api/tasks/${t.id}/status`, { status: "done", actorId: ba });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal(d.data.status, "done");
  assert.equal(st().status, "done");

  assert.equal((await api("PATCH", `/api/tasks/${t.id}/status`, { status: "approved", actorId: ba })).status, 403, "BA không kéo vào Đã duyệt");
  const r = await api("PATCH", `/api/tasks/${t.id}/status`, { status: "doing", actorId: lead });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual([r.data.status, r.data.revisionRequested], ["doing", true]);
  assert.deepEqual(st(), { status: "draft", rr: 1 });

  await api("PATCH", `/api/tasks/${t.id}/status`, { status: "done", actorId: ba });
  const a = await api("PATCH", `/api/tasks/${t.id}/status`, { status: "approved", actorId: lead });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.deepEqual([a.data.status, a.data.revisionRequested], ["approved", false]);
  assert.deepEqual(st(), { status: "approved", rr: 0 });
});

test("đổi trạng thái tăng rev: bản còn thấy “Xong” lưu tài liệu với rev cũ → 409, bản đã duyệt giữ nguyên; rev mới lưu được", async () => {
  const m3 = repo.createModule(pid, "Thanh toán").id;
  getDb()
    .prepare("INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, created_at, updated_at) VALUES (?, ?, ?, 'US-31', 'khách', 'thanh toán', 'nhận hàng', ?, ?)")
    .run(randomUUID(), pid, m3, new Date().toISOString(), new Date().toISOString());
  makeDoc(m3, "BRD");
  const st = () => getDb().prepare("SELECT status, rev, updated_by AS by FROM module_docs WHERE module_id = ? AND kind = 'BRD'").get(m3) as any;
  const d = await done(`doc/${m3}`, { sub: "BRD", actorId: ba, baseRev: 1 });
  assert.equal(d.data.state.rev, 2);
  const a = await approve(`doc/${m3}`, { sub: "BRD", actorId: lead, baseRev: 2 });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.deepEqual({ ...st() }, { status: "approved", rev: 3, by: lead });
  // Đức vẫn thấy "Xong" ở rev 2 và lưu → 409 thay vì lặng lẽ đưa bản đã duyệt về Bản nháp
  const w = await api("PUT", `/api/modules/${m3}/docs/BRD`, { content: "# BRD sửa", baseRev: 2, actorId: ba });
  assert.equal(w.status, 409);
  assert.equal(w.data.rev, 3);
  assert.equal(st().status, "approved");
  // Tải lại (rev 3) thì lưu được, tài liệu về Bản nháp
  const ok = await api("PUT", `/api/modules/${m3}/docs/BRD`, { content: "# BRD sửa", baseRev: 3, actorId: ba });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual([ok.data.status, ok.data.rev], ["draft", 4]);
});

test("kéo thẻ task gửi baseRev: lệch rev sản phẩm → 409, sản phẩm và task giữ nguyên; đúng rev → đi qua luồng duyệt", async () => {
  const m4 = repo.createModule(pid, "Kho").id;
  makeDoc(m4, "BRD", "done");
  makeDoc(m4, "UC_SPEC", "approved");
  getDb().prepare("INSERT INTO module_diagrams (module_id, kind, code, status, rev, updated_at) VALUES (?, 'BPMN', 'flowchart LR', 'draft', 1, ?)").run(m4, new Date().toISOString());
  const t = (await api("POST", `/api/projects/${pid}/tasks`, { title: "Vẽ BPMN", status: "doing", artifactType: "diagram", artifactId: m4, artifactSub: "BPMN" })).data;
  const st = () => ({ ...(getDb().prepare("SELECT status, rev FROM module_diagrams WHERE module_id = ? AND kind = 'BPMN'").get(m4) as object) }) as any;

  const bad = await api("PATCH", `/api/tasks/${t.id}/status`, { status: "done", actorId: ba, baseRev: 7 });
  assert.equal(bad.status, 409);
  assert.equal(bad.data.code, "CONFLICT");
  assert.deepEqual(st(), { status: "draft", rev: 1 });
  assert.equal(taskRow(t.id).status, "doing");

  const ok = await api("PATCH", `/api/tasks/${t.id}/status`, { status: "done", actorId: ba, baseRev: 1 });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(st(), { status: "done", rev: 2 });
  // BA Lead còn thấy rev 1 → không duyệt được bản đã đổi
  assert.equal((await api("PATCH", `/api/tasks/${t.id}/status`, { status: "approved", actorId: lead, baseRev: 1 })).status, 409);
  assert.equal(st().status, "done");
  const ap = await api("PATCH", `/api/tasks/${t.id}/status`, { status: "approved", actorId: lead, baseRev: 2 });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  assert.deepEqual([ap.data.status, st().status, st().rev], ["approved", "approved", 3]);
});

test("task mới gắn sản phẩm: trạng thái ban đầu khớp sản phẩm (Xong / Đã duyệt / đang chờ sửa)", async () => {
  const m5 = repo.createModule(pid, "Báo cáo").id;
  makeDoc(m5, "BRD", "done");
  makeDoc(m5, "UC_SPEC", "approved");
  makeDoc(m5, "SRS", "draft");
  getDb().prepare("UPDATE module_docs SET revision_requested = 1 WHERE module_id = ? AND kind = 'SRS'").run(m5);
  makeDoc(m5, "FRD_NFR", "draft");
  const create = async (sub: string, extra: object = {}) => {
    const r = await api("POST", `/api/projects/${pid}/tasks`, { title: sub, artifactType: "doc", artifactId: m5, artifactSub: sub, actorId: ba, ...extra });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  const brd = await create("BRD");
  assert.deepEqual([brd.status, brd.revisionRequested], ["done", false]);
  assert.deepEqual([lastEvent(brd.id).from_status, lastEvent(brd.id).to_status, lastEvent(brd.id).by_member_id], [null, "done", ba]);
  const uc = await create("UC_SPEC");
  assert.deepEqual([uc.status, uc.revisionRequested], ["approved", false]);
  const srs = await create("SRS");
  assert.deepEqual([srs.status, srs.revisionRequested], ["doing", true]);
  assert.deepEqual([(await create("FRD_NFR")).status, (await create("FRD_NFR", { status: "doing" })).status], ["todo", "doing"], "Bản nháp: giữ trạng thái người tạo chọn");
  assert.equal((await create("API_SPEC")).status, "todo", "chưa sinh");
  // Màn đã Duyệt
  const s2 = repo.createScreen(m5, "Tổng hợp").id;
  getDb().prepare("UPDATE screens SET status = 'approved' WHERE id = ?").run(s2);
  assert.equal((await api("POST", `/api/projects/${pid}/tasks`, { title: "Màn", artifactType: "screen", artifactId: s2 })).data.status, "approved");
});
