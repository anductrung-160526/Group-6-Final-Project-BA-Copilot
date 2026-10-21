import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";

let server: Server;
let base = "";

before(async () => {
  process.env.APP_PASSWORD = "mat-khau-demo";
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  delete process.env.APP_PASSWORD;
});

test("APP_PASSWORD: chặn truy cập khi chưa đăng nhập, mở khi có cookie hợp lệ", async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  const page = await fetch(`${base}/`);
  assert.match(await page.text(), /Enter the access password/);

  const bad = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "sai" }) });
  assert.equal(bad.status, 401);

  const ok = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-proto": "https" }, body: JSON.stringify({ password: "mat-khau-demo" }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  const token = cookie.split(";")[0];
  assert.equal((await fetch(`${base}/api/projects`, { headers: { cookie: token } })).status, 200);
  assert.equal((await fetch(`${base}/api/projects`, { headers: { cookie: token.replace(/.$/, "x") } })).status, 401, "chữ ký sai bị từ chối");
});

test("giới hạn thử mật khẩu sai", async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ password: "sai" }) });
    last = r.status;
  }
  assert.equal(last, 429);
});
