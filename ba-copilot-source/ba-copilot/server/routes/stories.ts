// Yêu cầu nghiệp vụ – user story cấp dự án (kế hoạch đợt 5, mục 3 "C4"). Chủ sở hữu: C4.
// Hợp đồng: docs/api.md "Đợt 5" mục 5.2. Truy vấn: server/repo/stories.ts.
// Ghi: requireMember(ctx) → assertRev(rev, baseRevOf(body)) (trong repo) → rev + 1, updated_by = người thao tác.
// Tạo story bắt buộc `moduleId` hợp lệ của dự án (đợt 6 – D3), thiếu → 400 kèm câu nhắc tạo module trước.
// Story đổi → tài liệu đang có của module chuyển Lỗi thời (artifact.stale) và chấm lại QUS của dự án.

import { arr, baseRevOf, currentMember, HttpError, requireMember, route, type HandlerCtx } from "../http.ts";
import * as stories from "../repo/stories.ts";
import { saveProjectQus } from "./qus.ts";
import type { UserStoryInput } from "../../shared/types.ts";

/** Người thao tác: thành viên trong phiên / actorId (body hoặc query). */
const actorOf = (ctx: HandlerCtx) => requireMember(ctx)?.id ?? currentMember(ctx)?.id ?? null;

/** Chỉ lấy các trường của UserStoryInput có trong body (PATCH chỉ đổi trường được gửi). */
function inputOf(body: any): UserStoryInput {
  const b = body ?? {};
  const out: UserStoryInput = {};
  if ("moduleId" in b) out.moduleId = b.moduleId === null ? null : String(b.moduleId ?? "");
  for (const k of ["asA", "iWant", "soThat"] as const) if (k in b) out[k] = typeof b[k] === "string" ? b[k] : "";
  if ("acceptanceCriteria" in b) out.acceptanceCriteria = b.acceptanceCriteria;
  if ("priority" in b) out.priority = b.priority;
  return out;
}

route("GET", "/api/projects/:id/stories", (ctx) => {
  requireMember(ctx);
  return stories.listStories(ctx.params.id, ctx.query.get("moduleId") || undefined);
});

route("POST", "/api/projects/:id/stories", (ctx) => {
  const actorId = actorOf(ctx);
  const { story } = stories.createStory(ctx.params.id, inputOf(ctx.body), actorId);
  saveProjectQus(story.projectId);
  return story;
});

route("POST", "/api/projects/:id/stories/reorder", (ctx) => {
  requireMember(ctx);
  if (!Array.isArray(ctx.body?.ids)) throw new HttpError("Thiếu danh sách ids", 400);
  return stories.reorderStories(ctx.params.id, arr(ctx.body.ids));
});

route("GET", "/api/stories/:id", (ctx) => {
  requireMember(ctx);
  const s = stories.getStory(ctx.params.id);
  if (!s) throw new HttpError("Không tìm thấy user story", 404);
  return s;
});

route("PATCH", "/api/stories/:id", (ctx) => {
  const actorId = actorOf(ctx);
  const { story, modules } = stories.updateStory(ctx.params.id, inputOf(ctx.body), baseRevOf(ctx.body, ctx.query), actorId);
  if (modules.length) saveProjectQus(story.projectId);
  return story;
});

route("DELETE", "/api/stories/:id", (ctx) => {
  const actorId = actorOf(ctx);
  const { projectId } = stories.deleteStory(ctx.params.id, baseRevOf(ctx.body, ctx.query), actorId);
  saveProjectQus(projectId);
  return { ok: true };
});
