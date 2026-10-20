// Kiểm thử tích hợp Công việc Kanban (FN-15 → FN-19): CRUD, đổi trạng thái + task_events, sản phẩm gắn kèm, lọc.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { getDb, openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import * as repo from "../server/repo.ts";
import * as tasks from "../server/repo/tasks.ts";

let server: Server;
let base = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as any };
}

/** Thành viên tạo thẳng trong DB (API thành viên thuộc A3). */
function member(name: string): string {
  const id = randomUUID();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, 'BA', ?)").run(id, name, new Date().toISOString());
  return id;
}

let pid = "";
let otherPid = "";
let modA = "";
let modB = "";
let screenA = "";
let lan = "";
let minh = "";

before(async () => {
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  pid = repo.createProject("Dự án Kanban").id;
  otherPid = repo.createProject("Dự án khác").id;
  modA = repo.createModule(pid, "Xác thực").id;
  modB = repo.createModule(pid, "Giỏ hàng").id;
  screenA = repo.createScreen(modA, "Đăng nhập").id;
  getDb().prepare("INSERT INTO uc_diagrams (module_id, code, status, updated_at) VALUES (?, 'flowchart LR', 'approved', ?)").run(modA, new Date().toISOString());
  lan = member("Nguyễn Thị Lan");
  minh = member("Trần Văn Minh");
});

after(() => server.close());

test("FN-15: tạo task – mặc định Cần làm / Trung bình, ghi 1 sự kiện lúc tạo với người tạo", async () => {
  const r = await api("POST", `/api/projects/${pid}/tasks`, { title: "  Viết SRS đăng nhập  ", assigneeId: lan, dueDate: "2026-10-30", actorId: minh });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.title, "Viết SRS đăng nhập");
  assert.equal(r.data.status, "todo");
  assert.equal(r.data.priority, "Medium");
  assert.equal(r.data.assigneeId, lan);
  assert.equal(r.data.dueDate, "2026-10-30");
  assert.equal(r.data.moduleId, null);

  const d = await api("GET", `/api/tasks/${r.data.id}`);
  assert.equal(d.status, 200);
  assert.equal(d.data.events.length, 1);
  assert.deepEqual(
    { from: d.data.events[0].fromStatus, to: d.data.events[0].toStatus, by: d.data.events[0].byMemberId, sys: d.data.events[0].bySystem },
    { from: null, to: "todo", by: minh, sys: false },
  );
});

test("FN-15: tạo task với trạng thái ban đầu, actorId lạ thì ghi ẩn danh", async () => {
  const r = await api("POST", `/api/projects/${pid}/tasks`, { title: "Đang dở", status: "doing", actorId: "khong-ton-tai" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, "doing");
  const d = await api("GET", `/api/tasks/${r.data.id}`);
  assert.equal(d.data.events[0].toStatus, "doing");
  assert.equal(d.data.events[0].byMemberId, null);
});

test("FN-15: dữ liệu sai → 400 / 404", async () => {
  const bad = async (body: any) => (await api("POST", `/api/projects/${pid}/tasks`, body)).status;
  assert.equal(await bad({ title: "   " }), 400);
  assert.equal(await bad({ title: "T", status: "blocked" }), 400);
  assert.equal(await bad({ title: "T", priority: "Urgent" }), 400);
  assert.equal(await bad({ title: "T", dueDate: "30/10/2026" }), 400);
  assert.equal(await bad({ title: "T", assigneeId: "ai-do" }), 400);
  assert.equal(await bad({ title: "T", moduleId: "khong-co" }), 400);
  const foreignMod = repo.createModule(otherPid, "Ngoài").id;
  assert.equal(await bad({ title: "T", moduleId: foreignMod }), 400, "module của dự án khác");
  assert.equal((await api("POST", `/api/projects/khong-co/tasks`, { title: "T" })).status, 404);
  assert.equal((await api("GET", `/api/tasks/khong-co`)).status, 404);
  assert.equal((await api("PATCH", `/api/tasks/khong-co`, { title: "x" })).status, 404);
  assert.equal((await api("DELETE", `/api/tasks/khong-co`)).status, 404);
});

test("FN-16: danh sách sản phẩm gồm màn và bộ tài liệu / sơ đồ UC / bộ test của từng module", async () => {
  const r = await api("GET", `/api/projects/${pid}/artifacts`);
  assert.equal(r.status, 200);
  const keys = r.data.map((a: any) => `${a.kind}:${a.id}`);
  assert.ok(keys.includes(`screen:${screenA}`));
  for (const m of [modA, modB]) for (const k of ["docs", "diagram", "tests"]) assert.ok(keys.includes(`${k}:${m}`), `${k}:${m}`);
  const scr = r.data.find((a: any) => a.kind === "screen");
  assert.deepEqual({ label: scr.label, moduleId: scr.moduleId, moduleName: scr.moduleName, status: scr.status }, { label: "Màn Đăng nhập", moduleId: modA, moduleName: "Xác thực", status: "draft" });
  assert.equal(r.data.find((a: any) => a.kind === "diagram" && a.id === modA).status, "approved");
  assert.equal(r.data.find((a: any) => a.kind === "diagram" && a.id === modB).status, "none", "chưa sinh sơ đồ");
  assert.equal(r.data.find((a: any) => a.kind === "docs" && a.id === modB).status, "none");
  assert.equal((await api("GET", `/api/projects/${otherPid}/artifacts`)).data.length, 3, "chỉ sản phẩm của dự án đó");
  assert.equal((await api("GET", `/api/projects/khong-co/artifacts`)).status, 404);
});

test("FN-16: gắn sản phẩm – tự điền module, kiểm tra cùng có/cùng trống và đúng module", async () => {
  const s = await api("POST", `/api/projects/${pid}/tasks`, { title: "Duyệt màn đăng nhập", artifactType: "screen", artifactId: screenA });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.moduleId, modA, "tự điền module theo màn");
  const d = await api("POST", `/api/projects/${pid}/tasks`, { title: "Viết test", artifactType: "tests", artifactId: modB });
  assert.equal(d.data.moduleId, modB);

  const bad = async (body: any) => (await api("POST", `/api/projects/${pid}/tasks`, { title: "T", ...body })).status;
  assert.equal(await bad({ artifactType: "screen" }), 400, "thiếu artifactId");
  assert.equal(await bad({ artifactId: screenA }), 400, "thiếu artifactType");
  assert.equal(await bad({ artifactType: "video", artifactId: modA }), 400);
  assert.equal(await bad({ artifactType: "docs", artifactId: modA, moduleId: modB }), 400, "artifactId phải = moduleId");
  assert.equal(await bad({ artifactType: "screen", artifactId: screenA, moduleId: modB }), 400, "màn thuộc module khác");
  assert.equal(await bad({ artifactType: "screen", artifactId: "khong-co" }), 400);
  const foreignScreen = repo.createScreen(repo.createModule(otherPid, "M").id, "S").id;
  assert.equal(await bad({ artifactType: "screen", artifactId: foreignScreen }), 400, "màn của dự án khác");
});

test("FN-15: sửa task – sửa một phần, xoá giá trị bằng null, không nhận status", async () => {
  const c = await api("POST", `/api/projects/${pid}/tasks`, { title: "Ban đầu", description: "mô tả", assigneeId: lan, priority: "Low", moduleId: modA, artifactType: "docs", artifactId: modA });
  const id = c.data.id;
  const u = await api("PATCH", `/api/tasks/${id}`, { title: "Đã sửa", priority: "High" });
  assert.equal(u.status, 200, JSON.stringify(u.data));
  assert.equal(u.data.title, "Đã sửa");
  assert.equal(u.data.priority, "High");
  assert.equal(u.data.description, "mô tả", "trường không gửi giữ nguyên");
  assert.equal(u.data.assigneeId, lan);
  assert.equal(u.data.artifactType, "docs");

  const clr = await api("PATCH", `/api/tasks/${id}`, { assigneeId: null, artifactType: null, artifactId: null, dueDate: null });
  assert.equal(clr.status, 200, JSON.stringify(clr.data));
  assert.equal(clr.data.assigneeId, null);
  assert.equal(clr.data.artifactType, null);
  assert.equal(clr.data.artifactId, null);
  assert.equal(clr.data.moduleId, modA, "bỏ sản phẩm không làm mất module");

  assert.equal((await api("PATCH", `/api/tasks/${id}`, { status: "done" })).status, 400);
  assert.equal((await api("PATCH", `/api/tasks/${id}`, { title: "" })).status, 400);
  assert.equal((await api("GET", `/api/tasks/${id}`)).data.status, "todo");

  // Đổi module khi sản phẩm gắn kèm thuộc module cũ → 400
  await api("PATCH", `/api/tasks/${id}`, { artifactType: "docs", artifactId: modA });
  assert.equal((await api("PATCH", `/api/tasks/${id}`, { moduleId: modB })).status, 400);
});

test("FN-18: đổi trạng thái ghi task_events với by_member_id, trùng trạng thái không ghi", async () => {
  const c = await api("POST", `/api/projects/${pid}/tasks`, { title: "Kéo thẻ" });
  const id = c.data.id;
  const s1 = await api("PATCH", `/api/tasks/${id}/status`, { status: "doing", actorId: lan });
  assert.equal(s1.status, 200, JSON.stringify(s1.data));
  assert.equal(s1.data.status, "doing");
  await api("PATCH", `/api/tasks/${id}/status`, { status: "done" });
  await api("PATCH", `/api/tasks/${id}/status`, { status: "done", actorId: lan });
  await api("PATCH", `/api/tasks/${id}/status`, { status: "redo", actorId: minh });

  const d = await api("GET", `/api/tasks/${id}`);
  assert.equal(d.data.status, "redo", "đọc lại (như tải lại trang) vẫn đúng cột");
  assert.deepEqual(
    d.data.events.map((e: any) => [e.fromStatus, e.toStatus, e.byMemberId, e.bySystem]),
    [
      [null, "todo", null, false],
      ["todo", "doing", lan, false],
      ["doing", "done", null, false],
      ["done", "redo", minh, false],
    ],
  );
  assert.equal((await api("PATCH", `/api/tasks/${id}/status`, { status: "xong" })).status, 400);
  assert.equal((await api("PATCH", `/api/tasks/${id}/status`, {})).status, 400);
  assert.equal((await api("PATCH", `/api/tasks/khong-co/status`, { status: "done" })).status, 404);
});

test("A7 dùng chung repo: setTaskStatus bySystem ghi reason", () => {
  const t = tasks.createTask(pid, { moduleId: null, title: "Tự động", description: "", assigneeId: null, dueDate: null, priority: "Medium", artifactType: null, artifactId: null });
  tasks.setTaskStatus(t.id, "redo", { bySystem: true, reason: "Màn bị bỏ duyệt" });
  const ev = tasks.getTaskDetail(t.id)!.events.at(-1)!;
  assert.deepEqual([ev.fromStatus, ev.toStatus, ev.bySystem, ev.reason, ev.byMemberId], ["todo", "redo", true, "Màn bị bỏ duyệt", null]);
});

test("FN-17: lọc theo người làm và theo module", async () => {
  const p = repo.createProject("Lọc").id;
  const m1 = repo.createModule(p, "M1").id;
  const m2 = repo.createModule(p, "M2").id;
  await api("POST", `/api/projects/${p}/tasks`, { title: "a", assigneeId: lan, moduleId: m1 });
  await api("POST", `/api/projects/${p}/tasks`, { title: "b", assigneeId: minh, moduleId: m1 });
  await api("POST", `/api/projects/${p}/tasks`, { title: "c", assigneeId: lan, moduleId: m2 });
  await api("POST", `/api/projects/${p}/tasks`, { title: "d" });
  const titles = async (q: string) => (await api("GET", `/api/projects/${p}/tasks${q}`)).data.map((t: any) => t.title).sort().join("");
  assert.equal(await titles(""), "abcd");
  assert.equal(await titles(`?assigneeId=${lan}`), "ac");
  assert.equal(await titles(`?moduleId=${m1}`), "ab");
  assert.equal(await titles(`?assigneeId=${lan}&moduleId=${m1}`), "a");
  assert.equal((await api("GET", `/api/projects/khong-co/tasks`)).status, 404);
});

test("FN-19: task theo sản phẩm; xoá màn / module vẫn giữ task", async () => {
  const p = repo.createProject("Liên quan").id;
  const m = repo.createModule(p, "M").id;
  const s = repo.createScreen(m, "Danh sách").id;
  const t1 = (await api("POST", `/api/projects/${p}/tasks`, { title: "Thiết kế màn", artifactType: "screen", artifactId: s })).data;
  await api("POST", `/api/projects/${p}/tasks`, { title: "Viết tài liệu", artifactType: "docs", artifactId: m });
  const rel = await api("GET", `/api/artifacts/screen/${s}/tasks`);
  assert.equal(rel.status, 200);
  assert.deepEqual(rel.data.map((t: any) => t.id), [t1.id]);
  assert.equal((await api("GET", `/api/artifacts/docs/${m}/tasks`)).data.length, 1);
  assert.equal((await api("GET", `/api/artifacts/video/${m}/tasks`)).status, 400);

  repo.deleteScreen(s);
  const kept = await api("GET", `/api/tasks/${t1.id}`);
  assert.equal(kept.status, 200, "xoá màn không xoá task");
  assert.equal(kept.data.artifactId, s, "giữ mã sản phẩm cũ để hiện 'Sản phẩm đã xoá'");
  assert.equal((await api("PATCH", `/api/tasks/${t1.id}`, { title: "Vẫn sửa được" })).status, 200, "task trỏ sản phẩm đã xoá vẫn sửa được");

  repo.deleteModule(m);
  const all = (await api("GET", `/api/projects/${p}/tasks`)).data;
  assert.equal(all.length, 2, "xoá module không xoá task");
  assert.ok(all.every((t: any) => t.moduleId === null), "module_id → NULL");
});

test("FN-15: xoá task xoá cả lịch sử", async () => {
  const c = await api("POST", `/api/projects/${pid}/tasks`, { title: "Sẽ xoá" });
  await api("PATCH", `/api/tasks/${c.data.id}/status`, { status: "doing" });
  const r = await api("DELETE", `/api/tasks/${c.data.id}`);
  assert.deepEqual(r.data, { ok: true });
  assert.equal((await api("GET", `/api/tasks/${c.data.id}`)).status, 404);
  assert.equal(tasks.listEvents(c.data.id).length, 0);
});
