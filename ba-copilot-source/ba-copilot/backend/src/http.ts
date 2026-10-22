// Cơ chế đăng ký route dùng chung cho app.ts và server/routes/*.ts (không phụ thuộc framework).

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, getMeta, setMeta } from "./db.ts";
import type { ApiErrorCode, Member, MemberRole } from "../../shared/types.ts";

export interface HandlerCtx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  body: any;
  query: URLSearchParams;
}
export type Handler = (ctx: HandlerCtx) => Promise<unknown> | unknown;

export interface Route {
  method: string;
  path: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  /** true khi handler là stub notImplemented() – agent tính năng thay bằng handler thật. */
  stub: boolean;
}

export const routes: Route[] = [];

const STUB = Symbol("stub");

export function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, path, pattern, keys, handler, stub: STUB in handler });
}

/** Route khớp method + đường dẫn (route đăng ký trước được ưu tiên). */
export function matchRoute(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return { route: r, params };
  }
  return null;
}

/** Lỗi HTTP. `code` (máy đọc) và `data` (trường thêm) được gửi kèm body lỗi: `{ error, code?, ...data }`. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: ApiErrorCode,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Handler giữ chỗ cho endpoint đã có trong docs/api.md nhưng chưa làm: trả 501. */
export function notImplemented(fn: string): Handler {
  const h: Handler = () => {
    throw new HttpError(`Not implemented (${fn})`, 501);
  };
  return Object.assign(h, { [STUB]: true });
}

/** Phản hồi tệp nhị phân. disposition: "inline" (xem trong trình duyệt/iframe) hoặc "attachment" (tải về, mặc định). */
export class FileResponse {
  constructor(
    public data: Buffer,
    public filename: string,
    public contentType: string,
    public disposition: "inline" | "attachment" = "attachment",
  ) {}
}

export const str = (v: unknown, max = 20000) => (typeof v === "string" ? v.slice(0, max) : "");
export const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
/**
 * actorId của người thao tác (FN-03); rỗng → undefined.
 * Đợt 5: khi có phiên thành viên, app.ts ghi đè `body.actorId` bằng mã trong phiên trước khi gọi handler
 * (client không giả mạo được), nên mọi chỗ gọi `actor(body)` cũ tự lấy actor từ phiên.
 */
export const actor = (body: any) => str(body?.actorId, 100) || undefined;

// =============================================================== Đợt 5 – chặn đè (rev / baseRev)

/** `baseRev` client gửi (body hoặc query). Thiếu / không phải số → undefined (cho qua, tương thích client cũ). */
export function baseRevOf(body: any, query?: URLSearchParams): number | undefined {
  const raw = body?.baseRev ?? query?.get("baseRev") ?? undefined;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

/**
 * Chặn ghi đè: `baseRev` (bản client đang sửa) phải bằng `currentRev` (bản trong DB).
 * Lệch → HttpError 409 `{ error: "Bản đã thay đổi – tải lại", code: "CONFLICT", rev: currentRev }`.
 * `baseRev` thiếu (undefined/null) → cho qua.
 */
export function assertRev(currentRev: number, baseRev: number | null | undefined): void {
  if (baseRev === undefined || baseRev === null) return;
  if (Number(baseRev) !== Number(currentRev)) throw new HttpError("This version has changed – reload", 409, "CONFLICT", { rev: currentRev });
}

// =============================================================== Đợt 5 – đăng nhập theo thành viên
// Chế độ "demo": chưa thành viên nào có mật khẩu → mọi API chạy như cũ, actor lấy từ `actorId` client gửi.
// Chế độ "member": có ít nhất một mật khẩu → bắt buộc phiên thành viên (cookie `bac_member`), actor lấy từ phiên.
// Cổng APP_PASSWORD cũ (server/auth.ts, chủ C3 ở đợt 2) vẫn giữ; phiên thành viên hợp lệ cũng qua được cổng đó.
// Ghi chú cho C3: màn đăng nhập gọi POST /api/login { name|memberId, password }; quản trị mật khẩu dùng
// PUT /api/members/:id/password (app.ts) hoặc `setMemberPassword()` dưới đây.

export const MEMBER_COOKIE = "bac_member";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const MIN_PASSWORD = 6;

interface MemberRow {
  id: string;
  name: string;
  role: MemberRole;
  created_at: string;
  password_hash: string | null;
}
const toMember = (r: MemberRow): Member => ({ id: r.id, name: r.name, role: r.role, createdAt: r.created_at, hasPassword: !!r.password_hash });
const memberRow = (id: string) => getDb().prepare("SELECT id, name, role, created_at, password_hash FROM members WHERE id = ?").get(id) as MemberRow | undefined;

/** Băm mật khẩu bằng scrypt: `scrypt$<saltB64>$<hashB64>` (N=16384, r=8, p=1, 64 byte). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 64).toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const [algo, salt, hash] = (stored ?? "").split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = scryptSync(password, Buffer.from(salt, "base64"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** true khi có ít nhất một thành viên đặt mật khẩu (chế độ "member"). */
export function memberAuthEnabled(): boolean {
  return !!getDb().prepare("SELECT 1 FROM members WHERE password_hash IS NOT NULL AND password_hash <> '' LIMIT 1").get();
}

let secretCache: { db: unknown; value: string } | null = null;
function sessionSecret(): string {
  const env = process.env.SESSION_SECRET?.trim();
  if (env) return env;
  const d = getDb();
  if (secretCache?.db === d) return secretCache.value;
  let value = getMeta("session_secret", d);
  if (!value) setMeta("session_secret", (value = randomBytes(32).toString("hex")), d);
  secretCache = { db: d, value };
  return value;
}

// Chữ ký gắn 12 ký tự cuối của mật khẩu băm: đổi/xoá mật khẩu = mọi phiên cũ của người đó hết hiệu lực.
const signSession = (memberId: string, exp: string, pw: string) => createHmac("sha256", sessionSecret()).update(`m1:${memberId}:${exp}:${pw.slice(-12)}`).digest("base64url");

function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

const isHttps = (req: IncomingMessage) => (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() === "https";
const clientIp = (req: IncomingMessage) => ((req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0] ?? req.socket.remoteAddress ?? "?").trim();

/** Thành viên của phiên đăng nhập (cookie hợp lệ, chưa hết hạn, mật khẩu chưa đổi), không thì null. */
export function sessionMember(req: IncomingMessage): Member | null {
  const raw = readCookie(req, MEMBER_COOKIE);
  if (!raw) return null;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const r = memberRow(id);
  if (!r?.password_hash) return null;
  const want = Buffer.from(signSession(id, exp, r.password_hash));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? toMember(r) : null;
}

const attempts = new Map<string, { n: number; reset: number }>();
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

/** Đăng nhập thành viên: đúng mật khẩu → đặt cookie phiên và trả Member; sai → HttpError 401 / 429. */
export function loginMember(req: IncomingMessage, res: ServerResponse, input: { memberId?: string; name?: string; password: string }): Member {
  const wait = rateLimited(clientIp(req));
  if (wait) throw new HttpError(`Too many failed attempts. Please wait ${Math.ceil(wait / 60)} minute(s).`, 429);
  const d = getDb();
  const r = (
    input.memberId
      ? memberRow(input.memberId)
      : (d.prepare("SELECT id, name, role, created_at, password_hash FROM members WHERE name = ? COLLATE NOCASE ORDER BY created_at LIMIT 1").get((input.name ?? "").trim()) as MemberRow | undefined)
  ) as MemberRow | undefined;
  if (!r || !r.password_hash || !verifyPassword(input.password, r.password_hash)) throw new HttpError("Incorrect username or password", 401, "UNAUTHENTICATED");
  const exp = String(Date.now() + SESSION_TTL_MS);
  const value = `${r.id}.${exp}.${signSession(r.id, exp, r.password_hash)}`;
  res.setHeader("set-cookie", `${MEMBER_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${isHttps(req) ? "; Secure" : ""}`);
  attempts.delete(clientIp(req));
  return toMember(r);
}

/** Cookie xoá phiên thành viên (app.ts gộp với cookie xoá của auth.ts). */
export function logoutMemberCookie(req: IncomingMessage): string {
  return `${MEMBER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(req) ? "; Secure" : ""}`;
}

/**
 * Đặt / xoá (null hoặc "") mật khẩu thành viên. Chặn tự khoá app:
 * - mật khẩu đầu tiên của hệ thống phải đặt cho một BA Lead;
 * - không xoá mật khẩu của BA Lead cuối cùng có mật khẩu khi còn người khác có mật khẩu.
 */
export function setMemberPassword(memberId: string, password: string | null): Member {
  const d = getDb();
  const r = memberRow(memberId);
  if (!r) throw new HttpError("Member not found", 404);
  if (password) {
    if (password.length < MIN_PASSWORD) throw new HttpError(`Password must be at least ${MIN_PASSWORD} characters`, 400);
    if (!memberAuthEnabled() && r.role !== "BA_LEAD") throw new HttpError("Set a password for a BA Lead first", 400);
    d.prepare("UPDATE members SET password_hash = ? WHERE id = ?").run(hashPassword(password), memberId);
  } else if (r.password_hash) {
    const leadsWithPw = Number((d.prepare("SELECT COUNT(*) AS n FROM members WHERE role = 'BA_LEAD' AND password_hash IS NOT NULL AND password_hash <> ''").get() as { n: number }).n);
    const othersWithPw = Number((d.prepare("SELECT COUNT(*) AS n FROM members WHERE id <> ? AND password_hash IS NOT NULL AND password_hash <> ''").get(memberId) as { n: number }).n);
    if (r.role === "BA_LEAD" && leadsWithPw === 1 && othersWithPw > 0) throw new HttpError("Cannot remove the last BA Lead's password while other members still have passwords", 400);
    d.prepare("UPDATE members SET password_hash = NULL WHERE id = ?").run(memberId);
  }
  return toMember(memberRow(memberId)!);
}

/**
 * Người thao tác của request: phiên thành viên (chế độ member) hoặc `actorId` client gửi (chế độ demo,
 * body hoặc query `actorId`). Không xác định được → null.
 */
export function currentMember(ctx: Pick<HandlerCtx, "req" | "body" | "query">): Member | null {
  const s = sessionMember(ctx.req);
  if (s) return s;
  if (memberAuthEnabled()) return null;
  const id = str(ctx.body?.actorId, 100) || ctx.query?.get("actorId") || "";
  const r = id ? memberRow(id) : undefined;
  return r ? toMember(r) : null;
}

/** Bắt buộc là thành viên đã đăng nhập (chế độ member) → Member; chế độ demo luôn cho qua (có thể trả null). */
export function requireMember(ctx: Pick<HandlerCtx, "req" | "body" | "query">): Member | null {
  const m = currentMember(ctx);
  if (!m && memberAuthEnabled()) throw new HttpError("Not signed in", 401, "UNAUTHENTICATED", { mode: "member" });
  return m;
}

/**
 * Chỉ BA Lead. Chế độ member: phải đăng nhập và có vai BA_LEAD (401 / 403).
 * Chế độ demo: chặn 403 khi người thao tác (actorId) là BA; không rõ người thao tác thì cho qua như trước đợt 5.
 */
export function requireLead(ctx: Pick<HandlerCtx, "req" | "body" | "query">): Member | null {
  const m = requireMember(ctx);
  if (m && m.role !== "BA_LEAD") throw new HttpError("Only a BA Lead can perform this action", 403, "FORBIDDEN");
  return m;
}
