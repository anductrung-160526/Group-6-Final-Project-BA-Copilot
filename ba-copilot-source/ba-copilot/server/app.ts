// HTTP server + REST API (không phụ thuộc framework để dễ chạy, dễ đọc).

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
import { authEnabled, isAuthenticated, login, logout, LOGIN_HTML } from "./auth.ts";
import { buildTrace } from "../shared/trace.ts";
import { saveExport } from "./files.ts";
import { route, matchRoute, FileResponse, HttpError, str, arr, actor } from "./http.ts";
import "./routes/index.ts"; // route v2 theo phân hệ (members, files, diagram, tasks, qus, suggest)

// ---------------------------------------------------------------- API
route("GET", "/api/settings", () => {
  const c = aiConfig();
  return { provider: c.provider, model: c.provider === "mock" ? "rule-based" : c.model, auth: authEnabled() };
});
route("POST", "/api/login", ({ req, res, body }) => {
  const r = login(req, res, str(body.password, 200));
  if (!r.ok) throw new BizError(r.error ?? "Đăng nhập thất bại", r.status ?? 401);
  return { ok: true };
});
route("POST", "/api/logout", ({ req, res }) => (logout(req, res), { ok: true }));

route("GET", "/api/projects", () => repo.listProjects());
route("POST", "/api/projects", ({ body }) => {
  const name = str(body.name, 200).trim();
  if (!name) throw new BizError("Tên dự án không được để trống");
  return repo.createProject(name, str(body.description, 2000));
});
route("GET", "/api/projects/:id", ({ params }) => {
  const p = repo.getProject(params.id);
  if (!p) throw new BizError("Không tìm thấy dự án", 404);
  return { ...p, modules: repo.listModules(p.id) };
});
route("DELETE", "/api/projects/:id", ({ params }) => (repo.deleteProject(params.id), { ok: true }));

route("POST", "/api/projects/:id/modules", ({ params, body }) => {
  if (!repo.getProject(params.id)) throw new BizError("Không tìm thấy dự án", 404);
  const name = str(body.name, 200).trim();
  if (!name) throw new BizError("Tên module không được để trống");
  return repo.createModule(params.id, name, str(body.requirementInput, 50000));
});
route("GET", "/api/modules/:id", ({ params }) => {
  const m = repo.getModuleDetail(params.id);
  if (!m) throw new BizError("Không tìm thấy module", 404);
  return m;
});
route("PATCH", "/api/modules/:id", ({ params, body }) => {
  repo.updateModule(params.id, {
    ...(typeof body.name === "string" ? { name: str(body.name, 200) } : {}),
    ...(typeof body.requirementInput === "string" ? { requirementInput: str(body.requirementInput, 50000) } : {}),
  });
  return repo.getModule(params.id);
});
route("DELETE", "/api/modules/:id", ({ params }) => (repo.deleteModule(params.id), { ok: true }));
route("GET", "/api/modules/:id/model", ({ params }) => svc.getDesignModel(params.id));
route("GET", "/api/modules/:id/runs", ({ params }) => repo.listRuns(params.id));

// Design Studio
route("POST", "/api/modules/:id/screens", ({ params, body }) => svc.createScreenFromPrompt(params.id, str(body.prompt), str(body.name, 120), actor(body)));
route("PATCH", "/api/screens/:id", ({ params, body }) => (repo.updateScreen(params.id, { name: str(body.name, 120) }), repo.getScreen(params.id)));
route("DELETE", "/api/screens/:id", ({ params }) => (repo.deleteScreen(params.id), { ok: true }));
route("GET", "/api/screens/:id/versions", ({ params }) => repo.listVersions(params.id));
route("POST", "/api/screens/:id/edit", ({ params, body }) => svc.editScreenWithPrompt(params.id, { prompt: str(body.prompt), nodeIds: arr(body.nodeIds), annotationIds: arr(body.annotationIds) }, actor(body)));
route("POST", "/api/screens/:id/revert", ({ params, body }) => svc.revertScreen(params.id, str(body.versionId), actor(body)));
route("POST", "/api/screens/:id/approve", ({ params, body }) => svc.setScreenApproval(params.id, body.approved !== false, actor(body)));
route("POST", "/api/screens/:id/annotations", ({ params, body }) => {
  const s = repo.getScreen(params.id);
  if (!s || !s.currentVersionId) throw new BizError("Không tìm thấy màn hình", 404);
  const comment = str(body.comment, 4000).trim();
  if (!comment) throw new BizError("Bình luận không được để trống");
  const b = body.bbox;
  const bbox = b && typeof b === "object" ? { x: Number(b.x) || 0, y: Number(b.y) || 0, w: Number(b.w) || 0, h: Number(b.h) || 0 } : null;
  return repo.createAnnotation({ screenId: s.id, versionId: s.currentVersionId, nodeIds: arr(body.nodeIds), bbox, comment, author: str(body.author, 60) || "BA" });
});
route("PATCH", "/api/annotations/:id", ({ params, body }) => {
  const st = body.status;
  if (!["open", "sent", "resolved"].includes(st)) throw new BizError("Trạng thái không hợp lệ");
  repo.setAnnotationStatus([params.id], st);
  return repo.getAnnotation(params.id);
});
route("DELETE", "/api/annotations/:id", ({ params }) => (repo.deleteAnnotation(params.id), { ok: true }));

// Gợi ý bố cục (Recursive Transformer Tree Decoder, Li et al. 2020): client gửi khung bao đo trên canvas
route("POST", "/api/screens/:id/suggestions", ({ params, body }) => {
  const layout = body.layout && typeof body.layout === "object" ? (body.layout as svc.LayoutBoxes) : undefined;
  const boxes: svc.LayoutBoxes["boxes"] = {};
  for (const [k, v] of Object.entries(layout?.boxes ?? {})) if (Array.isArray(v) && v.length === 4 && v.every((x) => Number.isFinite(x))) boxes[String(k).slice(0, 120)] = v.map(Number) as [number, number, number, number];
  return svc.layoutSuggestions(params.id, { layout: layout ? { pageWidth: Number(layout.pageWidth) || 0, boxes } : undefined, nodeIds: arr(body.nodeIds), mode: body.mode === "complete" ? "complete" : "next" });
});
route("POST", "/api/screens/:id/layout/accept", ({ params, body }) => {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100).map((x: Record<string, unknown>) => ({ ref: str(x?.ref, 60), parentId: str(x?.parentId, 120), index: Math.max(0, Math.floor(Number(x?.index) || 0)), type: str(x?.type, 30) }));
  return svc.acceptLayout(params.id, { versionId: str(body.versionId, 100), items }, actor(body));
});
route("POST", "/api/screens/:id/manual", ({ params, body }) => {
  if (!["remove", "up", "down"].includes(body.op)) throw new svc.BizError("Thao tác không hợp lệ");
  return svc.manualEdit(params.id, { op: body.op, id: str(body.id, 120) }, actor(body));
});
route("POST", "/api/suggestions/events", ({ body }) => {
  const action = body.action;
  if (!["shown", "applied", "dismissed"].includes(action)) throw new BizError("action không hợp lệ");
  const screenId = str(body.screenId, 100);
  if (!repo.getScreen(screenId)) throw new BizError("Không tìm thấy màn hình", 404);
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
route("POST", "/api/modules/:id/docs/approve", ({ params, body }) => svc.approveDocs(params.id, body.approved !== false, actor(body)));
route("PUT", "/api/modules/:id/requirements", ({ params, body }) => svc.updateRequirements(params.id, Array.isArray(body.requirements) ? body.requirements : []));

// Tests & trace
route("POST", "/api/modules/:id/tests/generate", ({ params, body }) => svc.generateTests(params.id, actor(body)));
route("GET", "/api/modules/:id/trace", ({ params }) => svc.trace(params.id));

// Export
route("GET", "/api/modules/:id/export/docx", async ({ params }) => {
  const m = repo.getModuleDetail(params.id);
  if (!m) throw new BizError("Không tìm thấy module", 404);
  if (!m.docs.useCases.length) throw new BizError("Chưa có tài liệu để xuất");
  const names = new Map(m.screens.map((s) => [s.id, s.name]));
  const buf = await buildDocx(m.project, m, m.docs, (id) => names.get(id) ?? id);
  const filename = `${fileSafe(m.name)}_UC_SRS_Sequence.docx`;
  const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  saveExport(m.projectId, m.id, filename, buf, mime);
  return new FileResponse(buf, filename, mime);
});
route("GET", "/api/modules/:id/export/xlsx", async ({ params }) => {
  const m = repo.getModuleDetail(params.id);
  if (!m) throw new BizError("Không tìm thấy module", 404);
  if (!m.tests.length) throw new BizError("Chưa có test case để xuất");
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
  if (!s || !v) throw new BizError("Không tìm thấy màn hình", 404);
  return new FileResponse(Buffer.from(JSON.stringify(v.tree, null, 2)), `${fileSafe(s.name)}.json`, "application/json");
});

// Kho tài liệu: server/routes/files.ts

function fileSafe(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\w-]+/g, "_").slice(0, 60) || "export";
}

// ---------------------------------------------------------------- HTTP plumbing
async function readBody(req: IncomingMessage): Promise<any> {
  if (req.method === "GET" || req.method === "HEAD") return {};
  const isUpload = req.method === "POST" && /^\/api\/projects\/[^/]+\/files(\?.*)?$/.test(req.url ?? "");
  const limit = isUpload ? 15_000_000 : 5_000_000;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new BizError("Dữ liệu gửi lên quá lớn", 413);
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BizError("JSON không hợp lệ");
  }
}

/** Tên tệp ASCII an toàn cho `filename="..."`: bỏ dấu tiếng Việt, ký tự lạ/`"`/`\`/`;` → `_`. */
function asciiFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7e]|["\\;]/g, "_");
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".map": "application/json", ".ico": "image/x-icon" };

export function createApp(opts: { publicDir: string }): Server {
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
      // Bắt buộc đăng nhập khi đặt APP_PASSWORD
      if (!isAuthenticated(req) && url.pathname !== "/api/login") {
        if (url.pathname.startsWith("/api/")) return send(res, 401, { error: "Chưa đăng nhập" });
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(LOGIN_HTML);
      }
      if (url.pathname.startsWith("/api/")) {
        const hit = matchRoute(req.method ?? "GET", url.pathname);
        if (!hit) return send(res, 404, { error: "API không tồn tại" });
        const body = await readBody(req);
        const out = await hit.route.handler({ req, res, params: hit.params, body, query: url.searchParams });
        if (out instanceof FileResponse) {
          res.writeHead(200, {
            "content-type": out.contentType,
            "content-disposition": `${out.disposition}; filename="${asciiFilename(out.filename)}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
            "x-content-type-options": "nosniff",
          });
          res.end(out.data);
        } else send(res, 200, out ?? { ok: true });
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
      if (e instanceof BizError || e instanceof HttpError) return send(res, e.status, { error: e.message });
      if (e instanceof AIError) return send(res, 502, { error: e.message, details: e.details });
      console.error(e);
      return send(res, 500, { error: `Lỗi máy chủ: ${(e as Error).message}` });
    }
  });
}

async function serveFile(res: ServerResponse, file: string) {
  const data = await readFile(file);
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": extname(file) === ".html" ? "no-store" : "public, max-age=60" });
  res.end(data);
}
