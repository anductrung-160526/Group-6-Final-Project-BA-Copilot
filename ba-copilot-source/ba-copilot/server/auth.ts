// Bảo vệ truy cập khi deploy: đặt APP_PASSWORD → mọi trang và API đều cần đăng nhập.
// Phiên đăng nhập là cookie HttpOnly ký HMAC (không lưu server), hạn 30 ngày.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const COOKIE = "bac_session";
const TTL_MS = 30 * 24 * 3600 * 1000;
const attempts = new Map<string, { n: number; reset: number }>();

/**
 * Tệp tĩnh mở công khai (không cần đăng nhập) để trang đăng nhập dùng chung giao diện với app.
 * Chỉ stylesheet – KHÔNG bao giờ thêm /app.js, *.map hay /api/* vào đây.
 */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(["/app-style.css"]);

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

function secret(): string {
  // SESSION_SECRET tùy chọn; mặc định suy ra từ mật khẩu (đổi mật khẩu = đăng xuất mọi phiên)
  return process.env.SESSION_SECRET?.trim() || createHash("sha256").update("ba-copilot:" + (process.env.APP_PASSWORD ?? "")).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function isAuthenticated(req: IncomingMessage): boolean {
  if (!authEnabled()) return true;
  const raw = readCookie(req, COOKIE);
  if (!raw) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEq(sig, sign(`v1:${exp}`));
}

function isHttps(req: IncomingMessage): boolean {
  return (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() === "https";
}

function clientIp(req: IncomingMessage): string {
  return ((req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0] ?? req.socket.remoteAddress ?? "?").trim();
}

/** Giới hạn 10 lần thử/10 phút/IP. Trả về số giây phải chờ nếu bị khóa. */
function rateLimited(ip: string): number {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { n: 1, reset: now + 10 * 60_000 });
    return 0;
  }
  a.n++;
  return a.n > 10 ? Math.ceil((a.reset - now) / 1000) : 0;
}

export function login(req: IncomingMessage, res: ServerResponse, password: string): { ok: boolean; error?: string; status?: number } {
  const wait = rateLimited(clientIp(req));
  if (wait) return { ok: false, status: 429, error: `Too many failed attempts. Please wait ${Math.ceil(wait / 60)} minute(s).` };
  const expected = process.env.APP_PASSWORD?.trim() ?? "";
  const h = (s: string) => createHash("sha256").update(s).digest("hex");
  if (!expected || !safeEq(h(password), h(expected))) return { ok: false, status: 401, error: "Incorrect password" };
  const exp = String(Date.now() + TTL_MS);
  res.setHeader("set-cookie", `${COOKIE}=${exp}.${sign(`v1:${exp}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${isHttps(req) ? "; Secure" : ""}`);
  attempts.delete(clientIp(req));
  return { ok: true };
}

export function logout(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("set-cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`);
}

// Biểu tượng tab: data-URI SVG không đọc được biến CSS nên ghi thẳng mã màu Mint
// (#16A6AE → #0F5A6E = --color-mint-500 → --color-mint-700). Giữ khớp với public/index.html.
const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='%2316A6AE'/><stop offset='1' stop-color='%230F5A6E'/></linearGradient></defs><rect width='32' height='32' rx='7' fill='url(%23g)'/><text x='16' y='21' font-size='13' font-family='Arial' font-weight='700' fill='white' text-anchor='middle'>BA</text></svg>";

// Trang đăng nhập (cổng APP_PASSWORD) dùng chung stylesheet của app (/app-style.css, mở công khai qua PUBLIC_PATHS):
// token, font, .brand/.logo như thanh trên, .field/.field-label, .btn-primary; bố cục ở khối "Sign-in page" cuối client/styles.css.
// Căn giữa trên khung bọc .login-page, không trên <body> (tiện ích trình duyệt chèn phần tử vào body làm lệch lưới).
// Khối <style> nhỏ chỉ có hiệu lực khi stylesheet không tải được (lớp .no-css) để trang vẫn dùng được.
export const LOGIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sign in – BA Copilot</title>
<link rel="icon" href="${FAVICON}"/>
<style>.no-css body{font-family:system-ui,sans-serif;max-width:360px;margin:10vh auto;padding:0 16px}.no-css input,.no-css button{display:block;width:100%;margin:8px 0;padding:8px}</style>
<link rel="stylesheet" href="/app-style.css" onerror="document.documentElement.classList.add('no-css')"/>
</head><body>
<div class="login-page"><main class="login-card">
<div class="brand"><span class="logo">BA</span><span>BA Copilot<span class="brand-sub">Requirements → Documents → Diagrams → Prototype → Test</span></span></div>
<div class="login-head"><h1>Sign in</h1><p class="muted">Enter the access password to continue.</p></div>
<form class="login-form" id="f" novalidate>
<label class="field" for="p"><span class="field-label">Password</span>
<input id="p" name="password" type="password" placeholder="Enter the password" autocomplete="current-password" aria-describedby="e" autofocus required/></label>
<p class="login-error" id="e" role="alert" aria-live="polite"></p>
<button class="btn btn-primary login-submit" id="b" type="submit">Sign in</button>
</form>
</main></div>
<script>
(function(){var f=document.getElementById('f'),p=document.getElementById('p'),e=document.getElementById('e'),b=document.getElementById('b');
f.addEventListener('submit',async function(ev){ev.preventDefault();if(b.disabled)return;e.textContent='';
if(!p.value){e.textContent='Please enter the password';p.focus();return}
b.disabled=true;b.textContent='Signing in…';
try{var r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:p.value})});
if(r.ok){location.reload();return}
var d=await r.json().catch(function(){return{}});e.textContent=d.error||'Sign-in failed'}
catch(err){e.textContent='Could not reach the server. Please try again.'}
b.disabled=false;b.textContent='Sign in';p.select()});})();
</script></body></html>`;
