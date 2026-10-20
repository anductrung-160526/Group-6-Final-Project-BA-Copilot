// Kiểm thử Thành viên (A3, FN-01 → FN-03): CRUD qua API thật, chặn xoá người đang giữ task mở, ghi tác giả phiên bản.
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

test("FN-01: thêm, liệt kê theo tên, sửa thành viên", async () => {
  const lan = await api("POST", "/api/members", { name: "  Trần Lan ", role: "BA" });
  assert.equal(lan.status, 200);
  assert.equal(lan.data.name, "Trần Lan");
  assert.equal(lan.data.role, "BA");
  assert.ok(lan.data.id && lan.data.createdAt);
  await api("POST", "/api/members", { name: "An Nguyễn", role: "BA_LEAD" });

  const list = await api("GET", "/api/members");
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.data.map((m: any) => m.name),
    ["An Nguyễn", "Trần Lan"],
  );

  const upd = await api("PATCH", `/api/members/${lan.data.id}`, { role: "BA_LEAD" });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.role, "BA_LEAD");
  assert.equal(upd.data.name, "Trần Lan", "chỉ đổi trường được gửi");
  const ren = await api("PATCH", `/api/members/${lan.data.id}`, { name: "Trần Thị Lan" });
  assert.equal(ren.data.name, "Trần Thị Lan");
  assert.equal(ren.data.role, "BA_LEAD");
});

test("FN-01: dữ liệu sai trả 400, không tìm thấy trả 404", async () => {
  assert.equal((await api("POST", "/api/members", { name: "   ", role: "BA" })).status, 400);
  assert.equal((await api("POST", "/api/members", { name: "Bình", role: "PM" })).status, 400);
  assert.equal((await api("POST", "/api/members", { name: "Bình" })).status, 400);
  const m = await api("POST", "/api/members", { name: "Bình", role: "BA" });
  assert.equal((await api("PATCH", `/api/members/${m.data.id}`, { name: "" })).status, 400);
  assert.equal((await api("PATCH", `/api/members/${m.data.id}`, { role: "X" })).status, 400);
  assert.equal((await api("PATCH", "/api/members/khong-co", { name: "A" })).status, 404);
  assert.equal((await api("DELETE", "/api/members/khong-co")).status, 404);
});

test("FN-01: không xoá người đang làm task chưa Xong (409); xoá được khi mọi task đã Xong", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án thành viên" });
  const m = await api("POST", "/api/members", { name: "Chi", role: "BA" });
  addTask(p.data.id, m.data.id, "done");
  addTask(p.data.id, m.data.id, "redo");

  const blocked = await api("DELETE", `/api/members/${m.data.id}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /Chi đang phụ trách 1 công việc chưa xong/);
  assert.ok((await api("GET", "/api/members")).data.some((x: any) => x.id === m.data.id), "vẫn còn trong danh sách");

  getDb().prepare("UPDATE tasks SET status = 'done' WHERE assignee_id = ?").run(m.data.id);
  const ok = await api("DELETE", `/api/members/${m.data.id}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data, { ok: true });
  assert.ok(!(await api("GET", "/api/members")).data.some((x: any) => x.id === m.data.id));
  const left = getDb().prepare("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND assignee_id IS NULL").get(p.data.id) as any;
  assert.equal(Number(left.n), 2, "task đã xong còn nguyên, bỏ trống người làm");
});

test("FN-03: tạo và khôi phục phiên bản màn ghi tên + mã người thao tác", async () => {
  const dung = await api("POST", "/api/members", { name: "Dung", role: "BA" });
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
