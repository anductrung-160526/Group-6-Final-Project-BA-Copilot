// Bảo vệ truy cập khi deploy: đặt APP_PASSWORD → mọi trang và API đều cần đăng nhập.
// Phiên đăng nhập là cookie HttpOnly ký HMAC (không lưu server), hạn 30 ngày.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const COOKIE = "bac_session";
const TTL_MS = 30 * 24 * 3600 * 1000;
const attempts = new Map<string, { n: number; reset: number }>();

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

export const LOGIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sign in – BA Copilot</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6f8;font:14px Inter,"Segoe UI",system-ui,-apple-system,Arial,sans-serif;color:#1c2430}
.card{background:#fff;border:1px solid #e3e6eb;border-radius:12px;padding:28px;width:min(360px,92vw);box-shadow:0 8px 30px rgba(16,24,40,.08)}
.logo{width:40px;height:40px;border-radius:10px;background:#2f5bea;color:#fff;display:grid;place-items:center;font-weight:700;margin-bottom:14px}
h1{font-size:18px;margin:0 0 4px}p{color:#677283;margin:0 0 18px}
input{width:100%;font:inherit;padding:10px 12px;border:1px solid #cfd4dc;border-radius:8px;margin-bottom:12px}
button{width:100%;font:inherit;font-weight:600;padding:10px;border:0;border-radius:8px;background:#2f5bea;color:#fff;cursor:pointer}
.err{color:#b42318;min-height:20px;margin-top:10px;font-size:13px}
</style></head><body>
<form class="card" id="f"><div class="logo">BA</div><h1>BA Copilot</h1><p>Enter the access password to continue.</p>
<input id="p" type="password" placeholder="Password" autocomplete="current-password" autofocus required/>
<button type="submit">Sign in</button><div class="err" id="e"></div></form>
<script>
document.getElementById('f').addEventListener('submit',async function(ev){ev.preventDefault();var e=document.getElementById('e');e.textContent='';
var r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});
if(r.ok){location.reload()}else{var d=await r.json().catch(function(){return{}});e.textContent=d.error||'Sign-in failed'}});
</script></body></html>`;
