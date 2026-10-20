// Cơ chế đăng ký route dùng chung cho app.ts và server/routes/*.ts (không phụ thuộc framework).

import type { IncomingMessage, ServerResponse } from "node:http";

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

export class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Handler giữ chỗ cho endpoint đã có trong docs/api.md nhưng chưa làm: trả 501. */
export function notImplemented(fn: string): Handler {
  const h: Handler = () => {
    throw new HttpError(`Chưa triển khai (${fn})`, 501);
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
/** actorId tuỳ chọn gửi kèm body (FN-03); rỗng → undefined. */
export const actor = (body: any) => str(body?.actorId, 100) || undefined;
