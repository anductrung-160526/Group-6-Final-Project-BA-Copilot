// Xong / Duyệt / Yêu cầu sửa cho mọi sản phẩm (kế hoạch đợt 5, mục 3 "C7"). Chủ sở hữu: C7.
// Khung do C2 tạo. Hợp đồng: docs/api.md "Đợt 5" mục 5.5.
// - done: requireMember; approve, request-change: requireLead (server/http.ts). Body { sub?, baseRev? }.
// - Đổi trạng thái bằng setArtifactState() (server/db.ts), task gắn kèm, ghi task_events, phát
//   artifact.done | artifact.approved | artifact.revision_requested. approve gọi pushApproved() của C8.
// GET .../state đã chạy thật (C2) để các màn đọc rev/trạng thái trước khi C7 gộp.

import { getArtifactState, getDb } from "../db.ts";
import { HttpError, notImplemented, requireMember, route } from "../http.ts";
import { ARTIFACT_KINDS_V5, DIAGRAM_KINDS, DOC_KINDS, type ArtifactRef, type DiagramKind, type DocKind } from "../../shared/types.ts";

/** Dựng ArtifactRef từ `:kind/:id` + `sub` (query hoặc body). Kiểm tra giá trị hợp lệ → 400. C7 dùng lại. */
export function parseArtifactRef(kind: string, id: string, sub: unknown): ArtifactRef {
  if (!(ARTIFACT_KINDS_V5 as string[]).includes(kind)) throw new HttpError("Loại sản phẩm không hợp lệ", 400);
  const s = typeof sub === "string" && sub ? sub : undefined;
  if (kind === "doc" && !(s && (DOC_KINDS as string[]).includes(s))) throw new HttpError("Thiếu hoặc sai loại tài liệu (sub)", 400);
  if (kind === "diagram" && s && !(DIAGRAM_KINDS as string[]).includes(s)) throw new HttpError("Sai loại sơ đồ (sub)", 400);
  const sv = s as DocKind | DiagramKind | undefined;
  const moduleId =
    kind === "screen" ? ((getDb().prepare("SELECT module_id FROM screens WHERE id = ?").get(id) as { module_id: string } | undefined)?.module_id ?? "") : id;
  return { kind: kind as ArtifactRef["kind"], id, moduleId, ...(kind === "doc" || kind === "diagram" ? { sub: sv ?? "UC" } : {}) };
}

route("GET", "/api/artifacts/:kind/:id/state", (ctx) => {
  requireMember(ctx);
  const ref = parseArtifactRef(ctx.params.kind, ctx.params.id, ctx.query.get("sub"));
  const st = getArtifactState(ref);
  if (!st) throw new HttpError("Không tìm thấy sản phẩm", 404);
  return st;
});
route("POST", "/api/artifacts/:kind/:id/done", notImplemented("C7 – BA bấm Xong"));
route("POST", "/api/artifacts/:kind/:id/approve", notImplemented("C7 – BA Lead Duyệt (+ đẩy GitHub của C8)"));
route("POST", "/api/artifacts/:kind/:id/request-change", notImplemented("C7 – BA Lead Yêu cầu sửa"));
