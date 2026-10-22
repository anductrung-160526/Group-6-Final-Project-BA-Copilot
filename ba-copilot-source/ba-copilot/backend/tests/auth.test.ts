import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../src/db.ts";
import { createApp } from "../src/app.ts";

let server: Server;
let base = "";

before(async () => {
  process.env.APP_PASSWORD = "mat-khau-demo";
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/frontend/public" });
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

test("trang đăng nhập dùng stylesheet chung; chỉ /app-style.css mở công khai", async () => {
  const css = await fetch(`${base}/app-style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  const cssText = await css.text();
  assert.match(cssText, /--color-mint-500/);
  assert.match(cssText, /\.login-card/);

  // app.js, source map và mọi trang khác vẫn trả về trang đăng nhập; API vẫn 401
  const js = await fetch(`${base}/app.js`);
  assert.match(js.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await js.text(), /Enter the access password/);
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  const map = await fetch(`${base}/app-style.css.map`);
  assert.match(map.headers.get("content-type") ?? "", /text\/html/, ".css.map không công khai");
  assert.match(await map.text(), /Enter the access password/);

  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<link rel="stylesheet" href="\/app-style\.css"/);
  assert.match(html, /<label[^>]*>\s*<span class="field-label">Password<\/span>/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /class="btn btn-primary login-submit"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /<div class="login-page">/, "căn giữa trên khung bọc, không trên body");
  assert.doesNotMatch(html, /2f5bea/i, "không còn màu xanh cũ");
});

test("giới hạn thử mật khẩu sai", async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ password: "sai" }) });
    last = r.status;
  }
  assert.equal(last, 429);
});
