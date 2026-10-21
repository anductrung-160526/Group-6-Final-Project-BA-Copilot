// Ràng buộc dữ liệu dự án / module qua API thật: quá dài → 400 (không cắt bớt), trùng tên dự án → 409 (tạo + đổi tên),
// mô tả chỉ có khoảng trắng lưu thành rỗng, dự án / module không tồn tại → 404. Luật dùng chung: shared/projectName.ts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { MODULE_NAME_MAX, PROJECT_DESC_MAX, PROJECT_NAME_MAX, projectNameKey } from "../shared/projectName.ts";

let server: Server;
let base = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as any };
}
const listNames = async () => ((await api("GET", "/api/projects")).data as { name: string }[]).map((p) => p.name);

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.APP_PASSWORD;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("projectNameKey: NFC, trim, gộp khoảng trắng, không phân biệt hoa/thường, vẫn phân biệt dấu", () => {
  assert.equal(PROJECT_NAME_MAX, 200);
  assert.equal(PROJECT_DESC_MAX, 2000);
  assert.equal(MODULE_NAME_MAX, 200);
  assert.equal(projectNameKey("  Bán   HÀNG\tOnline "), "bán hàng online");
  assert.equal(projectNameKey("Bán hàng"), projectNameKey("Bán hàng")); // NFD = NFC
  assert.notEqual(projectNameKey("Bán hàng"), projectNameKey("Ban hang"));
  assert.equal(projectNameKey("ĐẶT HÀNG"), projectNameKey("đặt hàng"));
});

test("tạo dự án: tên > 200 / mô tả > 2.000 ký tự bị từ chối (không cắt); đúng giới hạn sau trim thì nhận", async () => {
  const long = await api("POST", "/api/projects", { name: "a".repeat(201) });
  assert.equal(long.status, 400);
  assert.equal(long.data.error, "Project name must be at most 200 characters");
  assert.ok(!(await listNames()).some((n) => n.startsWith("aaaa")), "không được lưu bản bị cắt");

  const desc = await api("POST", "/api/projects", { name: "Long description", description: "x".repeat(2001) });
  assert.equal(desc.status, 400);
  assert.equal(desc.data.error, "Description must be at most 2,000 characters");
  assert.ok(!(await listNames()).includes("Long description"));

  // khoảng trắng đầu/cuối không tính vào độ dài
  const ok = await api("POST", "/api/projects", { name: `  ${"b".repeat(200)}  `, description: ` ${"y".repeat(2000)} ` });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.name, "b".repeat(200));
  assert.equal(ok.data.description, "y".repeat(2000));
});

test("sửa dự án (PATCH): tên / mô tả quá dài → 400, giữ nguyên dữ liệu cũ", async () => {
  const p = await api("POST", "/api/projects", { name: "Edit limits", description: "Old" });
  const name = await api("PATCH", `/api/projects/${p.data.id}`, { name: "n".repeat(201) });
  assert.equal(name.status, 400);
  assert.equal(name.data.error, "Project name must be at most 200 characters");
  const desc = await api("PATCH", `/api/projects/${p.data.id}`, { name: "Edit limits 2", description: "d".repeat(2001) });
  assert.equal(desc.status, 400);
  assert.equal(desc.data.error, "Description must be at most 2,000 characters");
  const got = (await api("GET", `/api/projects/${p.data.id}`)).data;
  assert.equal(got.name, "Edit limits", "lỗi mô tả thì tên gửi kèm cũng không được ghi");
  assert.equal(got.description, "Old");
});

test("mô tả chỉ có khoảng trắng lưu thành rỗng; mô tả được trim (tạo + sửa)", async () => {
  const blank = await api("POST", "/api/projects", { name: "Blank description", description: "   \n\t  " });
  assert.equal(blank.status, 200);
  assert.equal(blank.data.description, "");
  assert.equal((await api("GET", `/api/projects/${blank.data.id}`)).data.description, "");

  const trimmed = await api("POST", "/api/projects", { name: "Trimmed description", description: "  Online store  " });
  assert.equal(trimmed.data.description, "Online store");

  const edited = await api("PATCH", `/api/projects/${trimmed.data.id}`, { description: "  \n " });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.description, "");
  assert.equal((await api("PATCH", `/api/projects/${trimmed.data.id}`, { description: " New scope " })).data.description, "New scope");
});

test("trùng tên dự án (hoa/thường, khoảng trắng, dạng Unicode) → 409 khi tạo; khác dấu vẫn tạo được", async () => {
  const first = await api("POST", "/api/projects", { name: "Bán hàng online" });
  assert.equal(first.status, 200);

  for (const name of ["Bán hàng online", "  bán HÀNG   online ", "BÁN HÀNG ONLINE", "Bán hàng online"]) {
    const dup = await api("POST", "/api/projects", { name });
    assert.equal(dup.status, 409, `phải chặn "${name}"`);
    assert.equal(dup.data.error, `A project named “${name.trim()}” already exists. Please choose another name.`);
  }

  const noAccent = await api("POST", "/api/projects", { name: "Ban hang online" });
  assert.equal(noAccent.status, 200, "khác dấu là tên khác");
  assert.equal((await listNames()).filter((n) => projectNameKey(n) === "bán hàng online").length, 1);
});

test("đổi tên dự án: trùng dự án KHÁC → 409; đổi về chính tên mình / chỉ đổi hoa-thường thì được", async () => {
  const a = await api("POST", "/api/projects", { name: "Warehouse" });
  const b = await api("POST", "/api/projects", { name: "Payroll" });

  const clash = await api("PATCH", `/api/projects/${b.data.id}`, { name: "  WAREHOUSE " });
  assert.equal(clash.status, 409);
  assert.equal(clash.data.error, "A project named “WAREHOUSE” already exists. Please choose another name.");
  assert.equal((await api("GET", `/api/projects/${b.data.id}`)).data.name, "Payroll", "tên cũ giữ nguyên");

  const self = await api("PATCH", `/api/projects/${a.data.id}`, { name: "Warehouse", description: "Same name" });
  assert.equal(self.status, 200);
  const caseOnly = await api("PATCH", `/api/projects/${a.data.id}`, { name: "WAREHOUSE" });
  assert.equal(caseOnly.status, 200);
  assert.equal(caseOnly.data.name, "WAREHOUSE");
});

test("tên module > 200 ký tự bị từ chối khi tạo và khi sửa; tên được trim", async () => {
  const p = await api("POST", "/api/projects", { name: "Module limits" });
  const tooLong = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "m".repeat(201) });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.data.error, "Module name must be at most 200 characters");

  const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "  Authentication  " });
  assert.equal(m.status, 200);
  assert.equal(m.data.name, "Authentication");

  const patchLong = await api("PATCH", `/api/modules/${m.data.id}`, { name: "m".repeat(201) });
  assert.equal(patchLong.status, 400);
  assert.equal(patchLong.data.error, "Module name must be at most 200 characters");
  assert.equal((await api("GET", `/api/modules/${m.data.id}`)).data.name, "Authentication", "tên cũ giữ nguyên");

  const patchBlank = await api("PATCH", `/api/modules/${m.data.id}`, { name: "   " });
  assert.equal(patchBlank.status, 400);
  assert.equal(patchBlank.data.error, "Module name is required");

  const patchOk = await api("PATCH", `/api/modules/${m.data.id}`, { name: " Sign in " });
  assert.equal(patchOk.status, 200);
  assert.equal(patchOk.data.name, "Sign in");
});

test("dự án / module không tồn tại → 404", async () => {
  const p = await api("GET", "/api/projects/does-not-exist");
  assert.equal(p.status, 404);
  assert.equal(p.data.error, "Project not found");
  assert.equal((await api("PATCH", "/api/projects/does-not-exist", { name: "X" })).status, 404);
  assert.equal((await api("POST", "/api/projects/does-not-exist/modules", { name: "X" })).status, 404);
  const m = await api("GET", "/api/modules/does-not-exist");
  assert.equal(m.status, 404);
  assert.equal(m.data.error, "Module not found");
  assert.equal((await api("PATCH", "/api/modules/does-not-exist", { name: "X" })).status, 404);
});
