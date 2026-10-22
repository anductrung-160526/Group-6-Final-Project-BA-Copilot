// HTTP server + REST API (không phụ thuộc framework để dễ chạy, dễ đọc).

import "../shared/nlp-node.ts"; // mô hình NLP cho bộ chấm QUS (AQUSA)
import { createServer, IncomingMessage, ServerResponse, Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { createRequire } from "node:module";
import * as repo from "./repo.ts";
import * as svc from "./service.ts";
import { BizError } from "./service.ts";
import { AIError, aiConfig } from "./ai/client.ts";
import { buildDocx } from "./export/docx.ts";
import { testWorkbook } from "./export/xlsx.ts";
import { authEnabled, isAuthenticated, login, logout, LOGIN_HTML, PUBLIC_PATHS } from "./auth.ts";
import { buildTrace } from "../shared/trace.ts";
import { MSG, moduleNameError, projectDescError, projectNameError } from "../shared/projectName.ts";
import { saveExport } from "./files.ts";
import {
  route,
  matchRoute,
  FileResponse,
  HttpError,
  str,
  arr,
  actor,
  assertRev,
  baseRevOf,
  currentMember,
  loginMember,
  logoutMemberCookie,
  memberAuthEnabled,
  requireLead,
  requireMember,
  sessionMember,
  setMemberPassword,
  type HandlerCtx,
} from "./http.ts";
import "./routes/index.ts"; // route theo phân hệ (v2 + khung đợt 5)
import { registerTaskAutomation } from "./taskAutomation.ts";
import { saveModuleQus } from "./routes/qus.ts";
import { getMember, hasLead } from "./repo/members.ts";
import { getStory } from "./repo/stories.ts";
import { bumpRev, getArtifactState } from "./db.ts";
import { leavePresence, listPresence, PRESENCE_KINDS, touchPresence } from "./presence.ts";
import type { MeInfo, PresenceKind, PresenceTarget, PromptRun } from "../shared/types.ts";

// ---------------------------------------------------------------- API
route("GET", "/api/settings", () => {
  const c = aiConfig();
  return { provider: c.provider, model: c.provider === "mock" ? "rule-based" : c.model, auth: authEnabled(), memberAuth: memberAuthEnabled() };
});
// Đợt 5: có memberId hoặc name → đăng nhập thành viên (phiên gắn memberId); chỉ có password → cổng APP_PASSWORD cũ.
route("POST", "/api/login", ({ req, res, body }) => {
  if (typeof body.memberId === "string" || typeof body.name === "string") {
    const member = loginMember(req, res, { memberId: str(body.memberId, 100) || undefined, name: str(body.name, 200), password: str(body.password, 200) });
    return { ok: true, member };
  }
  const r = login(req, res, str(body.password, 200));
  if (!r.ok) throw new BizError(r.error ?? "Sign-in failed", r.status ?? 401);
  return { ok: true };
});
route("POST", "/api/logout", ({ req, res }) => {
  logout(req, res);
  const appCookie = res.getHeader("set-cookie");
  res.setHeader("set-cookie", [...(appCookie ? [String(appCookie)] : []), logoutMemberCookie(req)]);
  return { ok: true };
});
route("GET", "/api/me", (ctx): MeInfo => ({ member: currentMember(ctx), mode: memberAuthEnabled() ? "member" : "demo", appAuth: authEnabled() }));
// Đặt / xoá mật khẩu thành viên (màn Quản trị của C3). BA Lead đặt cho mọi người; thành viên tự đổi của mình.
route("PUT", "/api/members/:id/password", (ctx) => {
  const me = requireMember(ctx);
  if (!me || me.id !== ctx.params.id) requireLead(ctx);
  const pw = ctx.body.password;
  return setMemberPassword(ctx.params.id, typeof pw === "string" && pw ? str(pw, 200) : null);
});

// Hiện diện "Đang được sửa bởi …" (server/presence.ts). Chế độ demo: người gửi lấy từ actorId.
function presenceTarget(src: { kind?: unknown; id?: unknown; sub?: unknown }): PresenceTarget {
  const kind = String(src.kind ?? "") as PresenceKind;
  const id = str(src.id, 200).trim();
  if (!PRESENCE_KINDS.includes(kind) || !id) throw new HttpError("Invalid kind/id", 400);
  const sub = str(src.sub, 40).trim();
  return { kind, id, ...(sub ? { sub } : {}) };
}
/** Nhịp chỉ ghi cho thứ có thật: màn (screen), story, còn doc / diagram / tests thì id là module. */
function assertPresenceTargetExists(t: PresenceTarget): void {
  const found = t.kind === "screen" ? repo.getScreen(t.id) : t.kind === "story" ? getStory(t.id) : repo.getModule(t.id);
  if (!found) throw new HttpError("The item being edited no longer exists", 404);
}
route("POST", "/api/presence", (ctx) => {
  const t = presenceTarget(ctx.body);
  assertPresenceTargetExists(t);
  const me = requireMember(ctx);
  if (me) touchPresence(t, me);
  return listPresence(t, me?.id);
});
route("GET", "/api/presence", (ctx) => {
  const t = presenceTarget({ kind: ctx.query.get("kind"), id: ctx.query.get("id"), sub: ctx.query.get("sub") });
  return listPresence(t, requireMember(ctx)?.id);
});
// Chỉ gỡ nhịp của chính người gọi (phiên / actorId), không nhận mã người khác.
route("DELETE", "/api/presence", (ctx) => {
  const t = presenceTarget(ctx.body);
  const me = requireMember(ctx);
  if (me) leavePresence(t, me.id);
  return { ok: true };
});

/** Chuỗi đã trim, KHÔNG cắt bớt – quá dài thì route báo lỗi thay vì lặng lẽ cắt (shared/projectName.ts). */
const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const check = (err: string | null) => {
  if (err) throw new BizError(err);
};
/**
 * Tên module hợp lệ (tạo + sửa): trim, không rỗng, tối đa MODULE_NAME_MAX ký tự, không trùng module KHÁC của dự án
 * (cùng khoá so sánh với tên dự án – projectNameKey) → 409. Đổi về chính tên mình (kể cả hoa/thường) vẫn được.
 */
function moduleName(v: unknown, projectId: string, exceptId?: string): string {
  const name = trimmed(v);
  check(moduleNameError(name));
  if (repo.findModuleByName(projectId, name, exceptId)) throw new BizError(MSG.duplicateModule(name), 409);
  return name;
}

/**
 * Xoá dự án / module: chỉ BA Lead (403 FORBIDDEN). Chặt hơn requireLead ở chế độ demo: thiếu hoặc sai actorId cũng
 * bị chặn khi nhóm đã có BA Lead (client luôn gửi actorId); nhóm chưa có BA Lead nào thì cho qua như màn Quản trị.
 */
function requireLeadToDelete(ctx: HandlerCtx): void {
  const m = requireLead(ctx);
  if (!m && hasLead()) throw new HttpError("Only a BA Lead can perform this action", 403, "FORBIDDEN");
}

route("GET", "/api/projects", () => repo.listProjects());
route("POST", "/api/projects", ({ body }) => {
  const name = trimmed(body.name);
  check(projectNameError(name));
  const description = trimmed(body.description);
  check(projectDescError(description));
  if (repo.findProjectByName(name)) throw new BizError(MSG.duplicateProject(name), 409);
  return repo.createProject(name, description);
});
route("GET", "/api/projects/:id", ({ params }) => {
  const p = repo.getProject(params.id);
  if (!p) throw new BizError("Project not found", 404);
  return { ...p, modules: repo.listModules(p.id) };
});
route("DELETE", "/api/projects/:id", (ctx) => {
  requireLeadToDelete(ctx);
  if (!repo.getProject(ctx.params.id)) throw new BizError("Project not found", 404);
  repo.deleteProject(ctx.params.id);
  return { ok: true };
});

route("POST", "/api/projects/:id/modules", ({ params, body }) => {
  if (!repo.getProject(params.id)) throw new BizError("Project not found", 404);
  const m = repo.createModule(params.id, moduleName(body.name, params.id), str(body.requirementInput, 50000));
  saveModuleQus(m.id); // FN-56 (R-020)
  return repo.getModule(m.id);
});
route("GET", "/api/modules/:id", ({ params }) => {
  const m = repo.getModuleDetail(params.id);
  if (!m) throw new BizError("Module not found", 404);
  return m;
});
route("PATCH", "/api/modules/:id", ({ params, body }) => {
  const cur = repo.getModule(params.id);
  if (!cur) throw new BizError("Module not found", 404);
  repo.updateModule(params.id, {
    ...(typeof body.name === "string" ? { name: moduleName(body.name, cur.projectId, cur.id) } : {}),
    ...(typeof body.requirementInput === "string" ? { requirementInput: str(body.requirementInput, 50000) } : {}),
  });
  if (typeof body.requirementInput === "string") saveModuleQus(params.id); // FN-56 (R-020)
  return repo.getModule(params.id);
});
route("DELETE", "/api/modules/:id", (ctx) => {
  requireLeadToDelete(ctx);
  if (!repo.getModule(ctx.params.id)) throw new BizError("Module not found", 404);
  repo.deleteModule(ctx.params.id);
  return { ok: true };
});
route("GET", "/api/modules/:id/model", ({ params }) => svc.getDesignModel(params.id));
route("GET", "/api/modules/:id/runs", ({ params }) => repo.listRuns(params.id));
// Đợt 5: nhật ký AI cấp dự án (màn #/p/:pid/logs của C3), lọc ?moduleId=. Mới nhất trước.
route("GET", "/api/projects/:id/runs", ({ params, query }) => {
  if (!repo.getProject(params.id)) throw new BizError("Project not found", 404);
  const only = query.get("moduleId");
  const runs: PromptRun[] = repo.listModules(params.id).filter((m) => !only || m.id === only).flatMap((m) => repo.listRuns(m.id));
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

// Đợt 5 – chặn đè cho màn: nhận `baseRev`, lệch → 409 CONFLICT; ghi xong tăng `screens.rev` + người/lúc sửa.
// (Kiểm tra trước khi gọi AI; sửa bằng AI kiểm lại phiên bản hiện tại trong tx lúc ghi – service.editScreenWithPrompt.)
// AI không đổi gì (`version: null`) thì không tăng rev, để người khác không bị báo xung đột giả.
async function screenWrite<T>(ctx: HandlerCtx, fn: () => T | Promise<T>): Promise<T> {
  const ref = { kind: "screen" as const, id: ctx.params.id, moduleId: "" };
  const st = getArtifactState(ref);
  if (st) assertRev(st.rev, baseRevOf(ctx.body, ctx.query));
  const out = await fn();
  const noChange = !!out && typeof out === "object" && "version" in out && (out as { version: unknown }).version === null;
  if (st && !noChange) bumpRev(ref, actor(ctx.body));
  return out;
}

// Design Studio
route("POST", "/api/modules/:id/screens", ({ params, body }) => svc.createScreenFromPrompt(params.id, str(body.prompt), str(body.name, 120), actor(body)));
// Đổi tên màn: trim, rỗng / chỉ khoảng trắng → 400; không gửi `name` thì không đổi gì (không tăng rev).
route("PATCH", "/api/screens/:id", (ctx) => {
  if (!repo.getScreen(ctx.params.id)) throw new BizError("Screen not found", 404);
  if (ctx.body.name === undefined) return repo.getScreen(ctx.params.id);
  const name = str(ctx.body.name, 120).trim();
  if (!name) throw new BizError("Screen name cannot be empty");
  return screenWrite(ctx, () => (repo.updateScreen(ctx.params.id, { name }), repo.getScreen(ctx.params.id)));
});
route("DELETE", "/api/screens/:id", (ctx) => {
  requireMember(ctx);
  const st = getArtifactState({ kind: "screen", id: ctx.params.id, moduleId: "" });
  if (!st) throw new BizError("Screen not found", 404);
  assertRev(st.rev, baseRevOf(ctx.body, ctx.query)); // người khác vừa sửa màn → không xoá mất bản của họ
  repo.deleteScreen(ctx.params.id);
  return { ok: true };
});
route("GET", "/api/screens/:id/versions", ({ params }) => repo.listVersions(params.id));
route("POST", "/api/screens/:id/edit", (ctx) =>
  screenWrite(ctx, () => svc.editScreenWithPrompt(ctx.params.id, { prompt: str(ctx.body.prompt), nodeIds: arr(ctx.body.nodeIds), annotationIds: arr(ctx.body.annotationIds) }, actor(ctx.body))),
);
route("POST", "/api/screens/:id/revert", (ctx) => screenWrite(ctx, () => svc.revertScreen(ctx.params.id, str(ctx.body.versionId), actor(ctx.body))));
// v2 (client không còn gọi): chỉ BA Lead, như POST /api/artifacts/screen/:id/approve
route("POST", "/api/screens/:id/approve", (ctx) => (requireLead(ctx), svc.setScreenApproval(ctx.params.id, ctx.body.approved !== false, actor(ctx.body))));
route("POST", "/api/screens/:id/annotations", ({ params, body }) => {
  const s = repo.getScreen(params.id);
  if (!s || !s.currentVersionId) throw new BizError("Screen not found", 404);
  const comment = str(body.comment, 4000).trim();
  if (!comment) throw new BizError("Comment cannot be empty");
  const b = body.bbox;
  const bbox = b && typeof b === "object" ? { x: Number(b.x) || 0, y: Number(b.y) || 0, w: Number(b.w) || 0, h: Number(b.h) || 0 } : null;
  const id = actor(body);
  // FN-03 (R-007): tác giả chỉ lấy từ hồ sơ thành viên của người thao tác, không tin `body.author` client gửi.
  const member = id ? getMember(id) : null;
  return repo.createAnnotation({ screenId: s.id, versionId: s.currentVersionId, nodeIds: arr(body.nodeIds), bbox, comment, author: member?.name ?? "BA", authorId: member?.id ?? null });
});
route("PATCH", "/api/annotations/:id", ({ params, body }) => {
  const st = body.status;
  if (!["open", "sent", "resolved"].includes(st)) throw new BizError("Invalid status");
  repo.setAnnotationStatus([params.id], st);
  return repo.getAnnotation(params.id);
});
// Đổi trạng thái góp ý (gửi AI / đã xử lý / mở lại): cả nhóm. Xoá: chỉ tác giả hoặc BA Lead (403); nhóm chưa có BA Lead
// thì cho qua. Góp ý cũ không rõ tác giả chỉ BA Lead xoá được.
route("DELETE", "/api/annotations/:id", (ctx) => {
  const me = requireMember(ctx);
  const a = repo.getAnnotation(ctx.params.id);
  if (!a) throw new BizError("Comment not found", 404);
  const allowed = !hasLead() || me?.role === "BA_LEAD" || (!!me && !!a.authorId && a.authorId === me.id);
  if (!allowed) throw new HttpError("Only the comment's author or a BA Lead can delete this comment", 403, "FORBIDDEN");
  repo.deleteAnnotation(ctx.params.id);
  return { ok: true };
});

// Gợi ý element (mô hình trong model/: Recursive, xem service.layoutSuggestions): client gửi khung bao đo trên canvas
route("POST", "/api/screens/:id/suggestions", ({ params, body }) => {
  const layout = body.layout && typeof body.layout === "object" ? (body.layout as svc.LayoutBoxes) : undefined;
  const boxes: svc.LayoutBoxes["boxes"] = {};
  for (const [k, v] of Object.entries(layout?.boxes ?? {})) if (Array.isArray(v) && v.length === 4 && v.every((x) => Number.isFinite(x))) boxes[String(k).slice(0, 120)] = v.map(Number) as [number, number, number, number];
  return svc.layoutSuggestions(params.id, { layout: layout ? { pageWidth: Number(layout.pageWidth) || 0, boxes } : undefined, nodeIds: arr(body.nodeIds), mode: body.mode === "complete" ? "complete" : "next", at: slotOf(body.at) });
});
function slotOf(a: unknown) {
  const o = a && typeof a === "object" ? (a as Record<string, unknown>) : null;
  return o && typeof o.parentId === "string" && Number.isInteger(o.index) && (o.index as number) >= 0 ? { parentId: o.parentId.slice(0, 120), index: o.index as number } : undefined;
}
route("POST", "/api/screens/:id/layout/accept", (ctx) => {
  const { params, body } = ctx;
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100).map((x: Record<string, unknown>) => ({ ref: str(x?.ref, 60), parentId: str(x?.parentId, 120), index: Math.max(0, Math.floor(Number(x?.index) || 0)), type: str(x?.type, 30) }));
  return screenWrite(ctx, () => svc.acceptLayout(params.id, { versionId: str(body.versionId, 100), items }, actor(body)));
});
route("POST", "/api/screens/:id/manual", (ctx) => {
  const { params, body } = ctx;
  if (!["remove", "up", "down"].includes(body.op)) throw new svc.BizError("Invalid operation");
  return screenWrite(ctx, () => svc.manualEdit(params.id, { op: body.op, id: str(body.id, 120) }, actor(body)));
});
route("POST", "/api/suggestions/events", ({ body }) => {
  const action = body.action;
  if (!["shown", "applied", "dismissed"].includes(action)) throw new BizError("Invalid action");
  const screenId = str(body.screenId, 100);
  if (!repo.getScreen(screenId)) throw new BizError("Screen not found", 404);
  repo.logSuggestionEvent({
    screenId,
    versionId: str(body.versionId, 100) || null,
    kind: str(body.kind, 20) || "add",
    targetNodeId: str(body.targetNodeId, 200) || null,
    title: str(body.title, 300),
    confidence: Math.max(0, Math.min(1, Number(body.confidence) || 0)),
    action,
  });
  return { ok: true };
});
route("GET", "/api/modules/:id/suggestion-stats", ({ params }) => repo.suggestionStats(params.id));

// Docs
route("POST", "/api/modules/:id/docs/generate", ({ params, body }) => svc.generateDocs(params.id, actor(body)));
route("POST", "/api/modules/:id/docs/refine", ({ params, body }) => svc.refineDoc(params.id, str(body.target, 100), str(body.instruction), actor(body)));
route("POST", "/api/modules/:id/docs/approve", (ctx) => (requireLead(ctx), svc.approveDocs(ctx.params.id, ctx.body.approved !== false, actor(ctx.body)))); // v2: chỉ BA Lead
route("PUT", "/api/modules/:id/requirements", ({ params, body }) => svc.updateRequirements(params.id, Array.isArray(body.requirements) ? body.requirements : []));

// Tests & trace
// POST /api/modules/:id/tests/generate: chuyển sang server/routes/prototype.ts (C9, nhận baseRev) – R-101.
route("GET", "/api/modules/:id/trace", ({ params }) => svc.trace(params.id));

// Export
route("GET", "/api/modules/:id/export/docx", async ({ params }) => {
  const m = repo.getModuleDetail(params.id);
  if (!m) throw new BizError("Module not found", 404);
  if (!m.docs.useCases.length) throw new BizError("There are no documents to export yet");
  const names = new Map(m.screens.map((s) => [s.id, s.name]));
  const buf = await buildDocx(m.project, m, m.docs, (id) => names.get(id) ?? id);
  const filename = `${fileSafe(m.name)}_UC_SRS_Sequence.docx`;
  const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  saveExport(m.projectId, m.id, filename, buf, mime);
  return new FileResponse(buf, filename, mime);
});
route("GET", "/api/modules/:id/export/xlsx", async ({ params }) => {
  const m = repo.getModuleDetail(params.id);
  if (!m) throw new BizError("Module not found", 404);
  if (!m.tests.length) throw new BizError("There are no test cases to export yet");
  const names = new Map(m.screens.map((s) => [s.id, s.name]));
  const buf = await testWorkbook(m.tests, buildTrace(m.docs.useCases, m.docs.requirements, m.tests), (id) => names.get(id) ?? id);
  const filename = `${fileSafe(m.name)}_TestCase.xlsx`;
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  saveExport(m.projectId, m.id, filename, buf, mime);
  return new FileResponse(buf, filename, mime);
});
route("GET", "/api/screens/:id/export/json", ({ params }) => {
  const s = repo.getScreen(params.id);
  const v = s?.currentVersionId ? repo.getVersion(s.currentVersionId) : null;
  if (!s || !v) throw new BizError("Screen not found", 404);
  return new FileResponse(Buffer.from(JSON.stringify(v.tree, null, 2)), `${fileSafe(s.name)}.json`, "application/json");
});

// Kho tài liệu: server/routes/files.ts

function fileSafe(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\w-]+/g, "_").slice(0, 60) || "export"; // vi-keep: bỏ dấu tiếng Việt trong tên tệp
}

// ---------------------------------------------------------------- HTTP plumbing
/** API gọi được khi chưa có phiên thành viên (chế độ member). */
const PUBLIC_API = new Set(["/api/login", "/api/logout", "/api/me", "/api/settings"]);

async function readBody(req: IncomingMessage): Promise<any> {
  if (req.method === "GET" || req.method === "HEAD") return {};
  const isUpload = req.method === "POST" && /^\/api\/projects\/[^/]+\/files(\?.*)?$/.test(req.url ?? "");
  const limit = isUpload ? 15_000_000 : 5_000_000;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new BizError("Request payload is too large", 413);
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BizError("Invalid JSON");
  }
}

/** Tên tệp ASCII an toàn cho `filename="..."`: bỏ dấu tiếng Việt, ký tự lạ/`"`/`\`/`;` → `_`. */
function asciiFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d") // vi-keep: bỏ dấu tiếng Việt trong tên tệp
    .replace(/Đ/g, "D") // vi-keep: bỏ dấu tiếng Việt trong tên tệp
    .replace(/[^\x20-\x7e]|["\\;]/g, "_");
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".map": "application/json", ".ico": "image/x-icon" };

export function createApp(opts: { publicDir: string }): Server {
  registerTaskAutomation(); // FN-20 → FN-23 (R-011); gọi nhiều lần vẫn chỉ một bộ handler
  const require = createRequire(import.meta.url);
  let mermaidPath = "";
  try {
    mermaidPath = join(resolve(require.resolve("mermaid/package.json"), ".."), "dist", "mermaid.min.js");
  } catch {
    /* mermaid chưa cài – sơ đồ sẽ hiện dạng mã */
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      // Kiểm tra sống cho nền tảng deploy (không cần đăng nhập)
      if (url.pathname === "/health") return send(res, 200, { ok: true });
      // Bắt buộc đăng nhập khi đặt APP_PASSWORD (phiên thành viên hợp lệ cũng qua cổng này – đợt 5).
      // PUBLIC_PATHS: chỉ stylesheet để trang đăng nhập dùng chung giao diện (không mở app.js / API).
      const member = sessionMember(req);
      if (!isAuthenticated(req) && !member && url.pathname !== "/api/login" && !PUBLIC_PATHS.has(url.pathname)) {
        if (url.pathname.startsWith("/api/")) return send(res, 401, { error: "Not signed in", code: "UNAUTHENTICATED", mode: "app" });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(LOGIN_HTML);
      }
      if (url.pathname.startsWith("/api/")) {
        // Đợt 5: có thành viên đặt mật khẩu (chế độ member) → mọi API cần phiên thành viên, trừ đăng nhập/đăng xuất/me/settings.
        if (!member && !PUBLIC_API.has(url.pathname) && memberAuthEnabled()) return send(res, 401, { error: "Not signed in", code: "UNAUTHENTICATED", mode: "member" });
        const hit = matchRoute(req.method ?? "GET", url.pathname);
        if (!hit) return send(res, 404, { error: "API not found" });
        const body = await readBody(req);
        // Actor lấy từ phiên, không tin actorId client gửi (chế độ member). Chế độ demo giữ actorId như cũ.
        if (member && body && typeof body === "object" && !Array.isArray(body)) body.actorId = member.id;
        const out = await hit.route.handler({ req, res, params: hit.params, body, query: url.searchParams });
        if (out instanceof FileResponse) {
          res.writeHead(200, {
            "content-type": out.contentType,
            "content-disposition": `${out.disposition}; filename="${asciiFilename(out.filename)}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
            "x-content-type-options": "nosniff",
          });
          res.end(out.data);
        } else send(res, 200, out === undefined ? { ok: true } : out);
        return;
      }
      // static
      if (url.pathname === "/vendor/mermaid.min.js" && mermaidPath) return serveFile(res, mermaidPath);
      const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = resolve(opts.publicDir, "." + safePath);
      if (!file.startsWith(resolve(opts.publicDir))) return send(res, 403, { error: "Forbidden" });
      const st = await stat(file).catch(() => null);
      if (st?.isFile()) return serveFile(res, file);
      return serveFile(res, join(opts.publicDir, "index.html"));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.data ?? {}) });
      if (e instanceof BizError) return send(res, e.status, { error: e.message });
      if (e instanceof AIError) return send(res, 502, { error: e.message, details: e.details });
      console.error(e);
      return send(res, 500, { error: `Server error: ${(e as Error).message}` });
    }
  });
}

async function serveFile(res: ServerResponse, file: string) {
  const data = await readFile(file);
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": extname(file) === ".html" ? "no-store" : "public, max-age=60" });
  res.end(data);
}
