// Kiểm thử Thành viên + Quản trị (C3, FN-01 → FN-03, đợt 5): CRUD qua API thật, chỉ BA Lead được thêm/sửa/xoá
// (trừ khi hệ thống chưa có BA Lead), chặn xoá người đang giữ task mở, ghi tác giả phiên bản.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, getDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";

let server: Server;
let base = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as any };
}

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const addTask = (projectId: string, assigneeId: string, status: string) => {
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO tasks (id, project_id, title, assignee_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), projectId, "Việc thử", assigneeId, status, now, now);
};

// Mã BA Lead dùng làm người thao tác cho các lệnh quản trị (tạo ở test đầu tiên).
let leadId = "";
const asLead = (body: Record<string, unknown> = {}) => ({ ...body, actorId: leadId });

test("Quản trị: chưa có BA Lead thì ai cũng thêm được; có rồi thì chỉ BA Lead (403 FORBIDDEN)", async () => {
  // Hệ thống trống: không cần actorId để tạo người đầu tiên (kể cả khi đó là BA thường).
  const ba = await api("POST", "/api/members", { name: "Bảo", role: "BA" });
  assert.equal(ba.status, 200);
  const lead = await api("POST", "/api/members", { name: "Lead Một", role: "BA_LEAD" });
  assert.equal(lead.status, 200);
  leadId = lead.data.id;

  // Đã có BA Lead → thiếu actorId, actorId là BA, actorId không tồn tại đều bị chặn.
  for (const actorId of [undefined, ba.data.id, "khong-co"]) {
    const r = await api("POST", "/api/members", { name: "Lạ", role: "BA", actorId });
    assert.equal(r.status, 403, `POST với actorId=${actorId}`);
    assert.equal(r.data.code, "FORBIDDEN");
    assert.match(r.data.error, /Only a BA Lead/);
    assert.equal((await api("PATCH", `/api/members/${ba.data.id}`, { role: "BA_LEAD", actorId })).status, 403, `PATCH với actorId=${actorId}`);
    const q = actorId ? `?actorId=${actorId}` : "";
    assert.equal((await api("DELETE", `/api/members/${ba.data.id}${q}`)).status, 403, `DELETE với actorId=${actorId}`);
  }
  assert.ok(!(await api("GET", "/api/members")).data.some((m: any) => m.name === "Lạ"), "không tạo được người mới");
  assert.equal((await api("GET", "/api/members")).data.find((m: any) => m.id === ba.data.id).role, "BA", "vai không đổi");

  // BA Lead làm được (DELETE gửi actorId qua query).
  assert.equal((await api("PATCH", `/api/members/${ba.data.id}`, asLead({ name: "Bảo Trần" }))).status, 200);
  assert.equal((await api("DELETE", `/api/members/${ba.data.id}?actorId=${leadId}`)).status, 200);
  // Xem danh sách thì ai cũng được.
  assert.equal((await api("GET", "/api/members")).status, 200);
});

test("Quản trị: nhóm luôn còn BA Lead – không tự hạ vai / tự xoá, không hạ vai / xoá BA Lead cuối (400)", async () => {
  const tmp = await api("POST", "/api/members", asLead({ name: "Tạm", role: "BA" }));
  assert.equal(tmp.status, 200);
  // BA Lead tự hạ mình xuống BA hoặc tự xoá → 400, vai không đổi
  const self = await api("PATCH", `/api/members/${leadId}`, asLead({ role: "BA" }));
  assert.equal(self.status, 400);
  assert.match(self.data.error, /can't remove your own BA Lead role/);
  const selfDel = await api("DELETE", `/api/members/${leadId}?actorId=${leadId}`);
  assert.equal(selfDel.status, 400);
  assert.match(selfDel.data.error, /can't delete yourself/);
  assert.equal((await api("GET", "/api/members")).data.find((m: any) => m.id === leadId).role, "BA_LEAD");
  // Tự sửa tên mình / giữ nguyên vai BA Lead vẫn được
  assert.equal((await api("PATCH", `/api/members/${leadId}`, asLead({ name: "Lead Một", role: "BA_LEAD" }))).status, 200);

  // Có BA Lead thứ hai → Lead Một hạ vai / xoá được người đó; người đó hết là BA Lead cuối
  const lead2 = await api("POST", "/api/members", asLead({ name: "Lead Hai", role: "BA_LEAD" }));
  assert.equal((await api("PATCH", `/api/members/${lead2.data.id}`, asLead({ role: "BA" }))).status, 200);
  assert.equal((await api("PATCH", `/api/members/${lead2.data.id}`, asLead({ role: "BA_LEAD" }))).status, 200);
  assert.equal((await api("DELETE", `/api/members/${lead2.data.id}?actorId=${leadId}`)).status, 200);

  // DB cũ không còn BA Lead nào: ai cũng sửa được để đặt lại (ngoại lệ khởi tạo), rồi khoá lại như cũ.
  getDb().prepare("UPDATE members SET role = 'BA' WHERE id = ?").run(leadId);
  assert.equal((await api("PATCH", `/api/members/${leadId}`, { role: "BA_LEAD", actorId: tmp.data.id })).status, 200, "không còn BA Lead → ai cũng đặt lại được");
  assert.equal((await api("PATCH", `/api/members/${leadId}`, { name: "Lead Một", actorId: tmp.data.id })).status, 403, "đã có BA Lead lại → chặn");
  assert.equal((await api("DELETE", `/api/members/${tmp.data.id}?actorId=${leadId}`)).status, 200);
});

test("Quản trị: BA Lead vừa bị hạ vai không đổi vai được nữa; BA Lead cuối vẫn còn", async () => {
  // Hai BA Lead: Lead Một hạ Lead Ba → còn một BA Lead (Lead Một); không ai hạ / xoá được Lead Một nữa.
  const lead3 = await api("POST", "/api/members", asLead({ name: "Lead Ba", role: "BA_LEAD" }));
  assert.equal((await api("PATCH", `/api/members/${lead3.data.id}`, asLead({ role: "BA" }))).status, 200);
  for (const actorId of [lead3.data.id, undefined]) {
    assert.equal((await api("PATCH", `/api/members/${leadId}`, { role: "BA", actorId })).status, 403, "BA không đổi vai được");
  }
  const last = await api("PATCH", `/api/members/${leadId}`, asLead({ role: "BA" }));
  assert.equal(last.status, 400);
  assert.equal((await api("GET", "/api/members")).data.filter((m: any) => m.role === "BA_LEAD").length, 1, "vẫn còn đúng một BA Lead");
  assert.equal((await api("DELETE", `/api/members/${lead3.data.id}?actorId=${leadId}`)).status, 200);
});

test("Quản trị: tên thành viên không trùng (trim, không phân biệt hoa/thường) khi thêm và đổi tên → 409", async () => {
  const a = await api("POST", "/api/members", asLead({ name: "Hoa Mai", role: "BA" }));
  assert.equal(a.status, 200);
  const dup = await api("POST", "/api/members", asLead({ name: "  hoa   MAI ", role: "BA_LEAD" }));
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error, "A member named “hoa   MAI” already exists. Please choose another name.");
  const b = await api("POST", "/api/members", asLead({ name: "Hoa Đào", role: "BA" }));
  assert.equal((await api("PATCH", `/api/members/${b.data.id}`, asLead({ name: "HOA MAI" }))).status, 409, "đổi tên trùng người khác");
  assert.equal((await api("PATCH", `/api/members/${a.data.id}`, asLead({ name: "hoa mai" }))).status, 200, "đổi hoa/thường tên của chính mình vẫn được");
  assert.equal((await api("GET", "/api/members")).data.find((m: any) => m.id === b.data.id).name, "Hoa Đào", "bản bị chặn không ghi");
  for (const m of [a, b]) assert.equal((await api("DELETE", `/api/members/${m.data.id}?actorId=${leadId}`)).status, 200);
});

test("FN-01: thêm, liệt kê theo tên, sửa thành viên", async () => {
  const lan = await api("POST", "/api/members", asLead({ name: "  Trần Lan ", role: "BA" }));
  assert.equal(lan.status, 200);
  assert.equal(lan.data.name, "Trần Lan");
  assert.equal(lan.data.role, "BA");
  assert.ok(lan.data.id && lan.data.createdAt);
  await api("POST", "/api/members", asLead({ name: "An Nguyễn", role: "BA_LEAD" }));

  const list = await api("GET", "/api/members");
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.data.map((m: any) => m.name),
    ["An Nguyễn", "Lead Một", "Trần Lan"],
  );

  const upd = await api("PATCH", `/api/members/${lan.data.id}`, asLead({ role: "BA_LEAD" }));
  assert.equal(upd.status, 200);
  assert.equal(upd.data.role, "BA_LEAD");
  assert.equal(upd.data.name, "Trần Lan", "chỉ đổi trường được gửi");
  const ren = await api("PATCH", `/api/members/${lan.data.id}`, asLead({ name: "Trần Thị Lan" }));
  assert.equal(ren.data.name, "Trần Thị Lan");
  assert.equal(ren.data.role, "BA_LEAD");
});

test("FN-01: dữ liệu sai trả 400, không tìm thấy trả 404", async () => {
  assert.equal((await api("POST", "/api/members", asLead({ name: "   ", role: "BA" }))).status, 400);
  assert.equal((await api("POST", "/api/members", asLead({ name: "Bình", role: "PM" }))).status, 400);
  assert.equal((await api("POST", "/api/members", asLead({ name: "Bình" }))).status, 400);
  const m = await api("POST", "/api/members", asLead({ name: "Bình", role: "BA" }));
  assert.equal((await api("PATCH", `/api/members/${m.data.id}`, asLead({ name: "" }))).status, 400);
  assert.equal((await api("PATCH", `/api/members/${m.data.id}`, asLead({ role: "X" }))).status, 400);
  assert.equal((await api("PATCH", "/api/members/khong-co", asLead({ name: "A" }))).status, 404);
  assert.equal((await api("DELETE", `/api/members/khong-co?actorId=${leadId}`)).status, 404);
});

test("FN-01 + R-032: không xoá người còn task Cần làm / Đang làm (409); Xong và Đã duyệt tính là đã xong", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án thành viên" });
  const m = await api("POST", "/api/members", asLead({ name: "Chi", role: "BA" }));
  addTask(p.data.id, m.data.id, "done");
  addTask(p.data.id, m.data.id, "approved");
  addTask(p.data.id, m.data.id, "todo");
  addTask(p.data.id, m.data.id, "doing");

  const blocked = await api("DELETE", `/api/members/${m.data.id}?actorId=${leadId}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /Chi is assigned to 2 unfinished task/);
  assert.ok((await api("GET", "/api/members")).data.some((x: any) => x.id === m.data.id), "vẫn còn trong danh sách");

  getDb().prepare("UPDATE tasks SET status = 'approved' WHERE assignee_id = ? AND status IN ('todo', 'doing')").run(m.data.id);
  const ok = await api("DELETE", `/api/members/${m.data.id}?actorId=${leadId}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data, { ok: true });
  assert.ok(!(await api("GET", "/api/members")).data.some((x: any) => x.id === m.data.id));
  const left = getDb().prepare("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND assignee_id IS NULL").get(p.data.id) as any;
  assert.equal(Number(left.n), 4, "task đã xong còn nguyên, bỏ trống người làm");
});

test("R-041 (tạm): sửa tên / mô tả dự án", async () => {
  const p = await api("POST", "/api/projects", { name: "Tên cũ", description: "Mô tả cũ" });
  const r = await api("PATCH", `/api/projects/${p.data.id}`, { name: "  Tên mới ", description: "Mô tả mới" });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, "Tên mới");
  assert.equal(r.data.description, "Mô tả mới");
  assert.equal((await api("PATCH", `/api/projects/${p.data.id}`, { description: "Chỉ mô tả" })).data.name, "Tên mới", "chỉ đổi trường được gửi");
  assert.equal((await api("PATCH", `/api/projects/${p.data.id}`, { name: " " })).status, 400);
  assert.equal((await api("PATCH", "/api/projects/khong-co", { name: "A" })).status, 404);
});

test("FN-03: tạo và khôi phục phiên bản màn ghi tên + mã người thao tác", async () => {
  const dung = await api("POST", "/api/members", asLead({ name: "Dung", role: "BA" }));
  const p = await api("POST", "/api/projects", { name: "Dự án FN-03" });
  const mod = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Đăng nhập" });
  const s = await api("POST", `/api/modules/${mod.data.id}/screens`, { prompt: "Màn hình đăng nhập bằng email và mật khẩu", name: "Đăng nhập", actorId: dung.data.id });
  assert.equal(s.status, 200);
  const sid = s.data.screen.id;
  const author = (vid: string) => getDb().prepare("SELECT author, author_id AS authorId FROM screen_versions WHERE id = ?").get(vid) as any;
  assert.deepEqual({ ...author(s.data.version.id) }, { author: "Dung", authorId: dung.data.id });

  const rev = await api("POST", `/api/screens/${sid}/revert`, { versionId: s.data.version.id, actorId: dung.data.id });
  assert.equal(rev.status, 200);
  assert.deepEqual({ ...author(rev.data.id) }, { author: "Dung", authorId: dung.data.id });

  // actorId không tồn tại → không ghi, không lỗi
  const rev2 = await api("POST", `/api/screens/${sid}/revert`, { versionId: s.data.version.id, actorId: "khong-co" });
  assert.equal(rev2.status, 200);
  assert.deepEqual({ ...author(rev2.data.id) }, { author: "", authorId: null });
});

test("FN-03 + quyền góp ý: tác giả chỉ lấy từ hồ sơ thành viên; xoá góp ý chỉ tác giả hoặc BA Lead; đổi trạng thái cả nhóm", async () => {
  const ba1 = await api("POST", "/api/members", asLead({ name: "Góp ý Một", role: "BA" }));
  const ba2 = await api("POST", "/api/members", asLead({ name: "Góp ý Hai", role: "BA" }));
  const p = await api("POST", "/api/projects", { name: "Dự án góp ý" });
  const mod = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Đăng nhập" });
  const s = await api("POST", `/api/modules/${mod.data.id}/screens`, { prompt: "Màn hình đăng nhập bằng email và mật khẩu", name: "Đăng nhập", actorId: ba1.data.id });
  const sid = s.data.screen.id;
  const comment = (body: Record<string, unknown>) => api("POST", `/api/screens/${sid}/annotations`, { comment: "Đổi nhãn nút", nodeIds: [], ...body });

  // body.author bị bỏ qua: có người thao tác → tên + mã của họ; không có → "BA", không mã
  const mine = await comment({ author: "Giả mạo", actorId: ba1.data.id });
  assert.equal(mine.status, 200);
  assert.deepEqual([mine.data.author, mine.data.authorId], ["Góp ý Một", ba1.data.id]);
  const anon = await comment({ author: "Giả mạo" });
  assert.deepEqual([anon.data.author, anon.data.authorId], ["BA", null]);

  // Đổi trạng thái: ai trong nhóm cũng được
  const res = await api("PATCH", `/api/annotations/${mine.data.id}`, { status: "resolved", actorId: ba2.data.id });
  assert.equal(res.status, 200);
  assert.equal(res.data.status, "resolved");

  // Xoá: người khác (BA) / không rõ người → 403; tác giả → được; góp ý không rõ tác giả chỉ BA Lead xoá được
  for (const q of [`?actorId=${ba2.data.id}`, ""]) {
    const r = await api("DELETE", `/api/annotations/${mine.data.id}${q}`);
    assert.equal(r.status, 403, q);
    assert.equal(r.data.code, "FORBIDDEN");
  }
  assert.equal((await api("DELETE", `/api/annotations/${mine.data.id}?actorId=${ba1.data.id}`)).status, 200);
  assert.equal((await api("DELETE", `/api/annotations/${anon.data.id}?actorId=${ba1.data.id}`)).status, 403);
  assert.equal((await api("DELETE", `/api/annotations/${anon.data.id}`, { actorId: leadId })).status, 200, "BA Lead xoá được góp ý của người khác");
  assert.equal((await api("DELETE", `/api/annotations/${anon.data.id}?actorId=${leadId}`)).status, 404);
});

test("đổi tên màn: trim, rỗng → 400, không gửi name thì không đổi; xoá màn gỡ liên kết task và xoá góp ý", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án màn" });
  const mod = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Sản phẩm" });
  const s = await api("POST", `/api/modules/${mod.data.id}/screens`, { prompt: "Danh sách sản phẩm", name: "Danh sách", actorId: leadId });
  const sid = s.data.screen.id;
  const rev = () => (getDb().prepare("SELECT rev FROM screens WHERE id = ?").get(sid) as any).rev;
  const r0 = rev();

  for (const name of ["", "   "]) {
    const r = await api("PATCH", `/api/screens/${sid}`, { name, actorId: leadId });
    assert.equal(r.status, 400, JSON.stringify(name));
    assert.equal(r.data.error, "Screen name cannot be empty");
  }
  const keep = await api("PATCH", `/api/screens/${sid}`, { actorId: leadId });
  assert.equal(keep.status, 200);
  assert.equal(keep.data.name, "Danh sách", "không gửi name → giữ tên");
  assert.equal(rev(), r0, "không đổi gì → không tăng rev");
  const ok = await api("PATCH", `/api/screens/${sid}`, { name: "  Danh sách sản phẩm ", actorId: leadId });
  assert.equal(ok.data.name, "Danh sách sản phẩm");
  assert.equal((await api("PATCH", "/api/screens/khong-co", { name: "X" })).status, 404);

  // Xoá màn có task + góp ý: task còn, bỏ liên kết; góp ý của màn bị xoá
  const t = await api("POST", `/api/projects/${p.data.id}/tasks`, { title: "Thiết kế danh sách", artifactType: "screen", artifactId: sid, actorId: leadId });
  assert.equal(t.status, 200);
  await api("POST", `/api/screens/${sid}/annotations`, { comment: "Thêm bộ lọc", actorId: leadId });
  assert.equal((await api("DELETE", `/api/screens/${sid}?actorId=${leadId}`)).status, 200);
  const task = await api("GET", `/api/tasks/${t.data.id}`);
  assert.deepEqual([task.data.artifactType, task.data.artifactId, task.data.artifactSub], [null, null, null]);
  assert.match(task.data.events.at(-1).reason, /Linked screen “Danh sách sản phẩm” was deleted/);
  assert.equal(Number((getDb().prepare("SELECT COUNT(*) AS n FROM annotations WHERE screen_id = ?").get(sid) as any).n), 0);
});
