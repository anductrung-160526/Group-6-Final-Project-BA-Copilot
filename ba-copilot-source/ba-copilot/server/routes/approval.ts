// Xong / Duyệt / Yêu cầu sửa cho mọi sản phẩm (kế hoạch đợt 5, mục 1 quyết định 10–12, 15; mục 3 "C7"). Chủ sở hữu: C7.
// Hợp đồng: docs/api.md "Đợt 5" mục 5.5. Khung (parseArtifactRef, GET .../state) do C2 tạo.
//
// - done: mọi thành viên, cần biết người bấm (actorId / phiên). Chỉ từ draft/outdated; giữ cờ revisionRequested.
//   Bước tiên quyết chưa Xong / Đã duyệt → 400 kèm lý do (shared/prereq.ts – cùng luật với khi sinh; D2 đợt 6).
// - approve: CHỈ BA Lead (thiếu actorId hoặc là BA → 403, chặt hơn requireLead chế độ demo). Chỉ từ done; cũng kiểm
//   bước tiên quyết. Gọi pushApproved() (C8 đăng ký trong server/events.ts) TRƯỚC khi đổi trạng thái: lỗi → trạng thái
//   giữ nguyên. Thành công → approved, xoá cờ.
// - request-change: CHỈ BA Lead, không cần lý do. Chỉ từ done/approved → draft + cờ revisionRequested. Sản phẩm đang
//   Xong / Đã duyệt dựa trên nó → Bản cũ (server/prereq.ts cascadeOutdated) để không còn bước sau Xong khi bước trước chưa.
// Đổi trạng thái bằng setArtifactState() (không tăng rev), phát artifact.done | approved | revision_requested trong
// cùng giao dịch → taskAutomation.ts kéo task gắn kèm theo và ghi task_events.

import { getArtifactState, getDb, setArtifactState, tx } from "../db.ts";
import { emit, pushApproved } from "../events.ts";
import { HttpError, assertRev, baseRevOf, currentMember, requireMember, route, type HandlerCtx } from "../http.ts";
import { listTasksByArtifact } from "../repo/tasks.ts";
import { artifactBlockReason, cascadeOutdated } from "../prereq.ts";
import {
  ARTIFACT_KINDS_V5,
  DIAGRAM_KINDS,
  DOC_KINDS,
  type ApprovalResult,
  type ArtifactRef,
  type ArtifactState,
  type ArtifactStatus,
  type DiagramKind,
  type DocKind,
  type GitPushOutcome,
  type Member,
} from "../../shared/types.ts";

/** Dựng ArtifactRef từ `:kind/:id` + `sub` (query hoặc body). Kiểm tra giá trị hợp lệ → 400. */
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

// ---------------------------------------------------------------- Luồng duyệt

export type ApprovalAction = "done" | "approve" | "request-change";

const STATUS_LABEL: Record<ArtifactStatus, string> = { none: "Chưa có", draft: "Bản nháp", done: "Xong", approved: "Đã duyệt", outdated: "Bản cũ" };
const FROM: Record<ApprovalAction, ArtifactStatus[]> = {
  done: ["draft", "outdated"],
  approve: ["done"],
  "request-change": ["done", "approved"],
};
const WRONG_STATE: Record<ApprovalAction, string> = {
  done: "Chỉ bấm Xong khi sản phẩm đang Bản nháp hoặc Bản cũ",
  approve: "Chỉ duyệt được sản phẩm đang Xong",
  "request-change": "Chỉ yêu cầu sửa được sản phẩm đang Xong hoặc Đã duyệt",
};
const forbidden = (msg: string) => new HttpError(msg, 403, "FORBIDDEN");

/** Người thao tác + kiểm quyền theo thao tác. Chế độ member: thiếu phiên → 401 (requireMember). */
function actorFor(action: ApprovalAction, ctx: Pick<HandlerCtx, "req" | "body" | "query">): Member {
  requireMember(ctx);
  const m = currentMember(ctx);
  if (action === "done") {
    if (!m) throw forbidden("Chọn người ở ô “Tôi là…” trước khi bấm Xong");
    return m;
  }
  if (!m || m.role !== "BA_LEAD") throw forbidden(action === "approve" ? "Chỉ BA Lead được duyệt" : "Chỉ BA Lead được yêu cầu sửa");
  return m;
}

/** Trạng thái hiện tại, kiểm tra tồn tại + đúng trạng thái nguồn. */
function stateFor(action: ApprovalAction, ref: ArtifactRef): ArtifactState {
  const st = getArtifactState(ref);
  if (!st) throw new HttpError("Không tìm thấy sản phẩm", 404);
  if (st.status === "none") throw new HttpError("Sản phẩm chưa có nội dung – hãy sinh hoặc soạn trước", 400);
  if (!FROM[action].includes(st.status)) throw new HttpError(`${WRONG_STATE[action]} (hiện: ${STATUS_LABEL[st.status]})`, 400);
  if (action !== "request-change") {
    const reason = artifactBlockReason(ref, action);
    if (reason) throw new HttpError(reason, 400);
  }
  return st;
}

const result = (ref: ArtifactRef, git?: GitPushOutcome): ApprovalResult => ({
  state: getArtifactState(ref)!,
  tasks: listTasksByArtifact(ref.kind, ref.id, ref.sub),
  ...(git ? { git } : {}),
});

/**
 * Thực hiện Xong / Duyệt / Yêu cầu sửa trên một sản phẩm. Dùng cho 3 endpoint dưới đây và cho
 * PATCH /api/tasks/:id/status khi task có gắn sản phẩm (routes/tasks.ts) – để task và sản phẩm luôn đồng bộ.
 * `body`: `{ baseRev? }` – có thì phải khớp rev hiện tại (409 CONFLICT).
 */
export async function applyApproval(action: ApprovalAction, ref: ArtifactRef, ctx: Pick<HandlerCtx, "req" | "body" | "query">): Promise<ApprovalResult> {
  const actor = actorFor(action, ctx);
  const st = stateFor(action, ref);
  assertRev(st.rev, baseRevOf(ctx.body));

  if (action === "done") {
    tx(() => {
      setArtifactState(ref, { status: "done" });
      emit({ type: "artifact.done", artifact: ref, actorId: actor.id });
    });
    return result(ref);
  }

  if (action === "request-change") {
    tx(() => {
      setArtifactState(ref, { status: "draft", revisionRequested: true });
      emit({ type: "artifact.revision_requested", artifact: ref, actorId: actor.id });
      cascadeOutdated(ref.moduleId || ref.id, actor.id);
    });
    return result(ref);
  }

  // approve: đẩy GitHub trước; lỗi thì trạng thái giữ nguyên và báo rõ.
  let git: GitPushOutcome;
  try {
    git = await pushApproved(ref, actor.id);
  } catch (e) {
    const msg = (e as Error)?.message || "lỗi không rõ";
    throw new HttpError(`Không đẩy được lên GitHub – chưa duyệt. Lý do: ${msg}`, e instanceof HttpError && e.status >= 400 && e.status < 500 ? e.status : 502);
  }
  tx(() => {
    // Trong lúc đẩy có người sửa / thao tác khác → không duyệt bản đã đổi.
    const now = getArtifactState(ref);
    if (!now || now.status !== "done" || now.rev !== st.rev) throw new HttpError("Bản đã thay đổi – tải lại", 409, "CONFLICT", { rev: now?.rev ?? 0 });
    const reason = artifactBlockReason(ref, "approve"); // bước trước vừa đổi trong lúc đẩy GitHub
    if (reason) throw new HttpError(reason, 400);
    setArtifactState(ref, { status: "approved", revisionRequested: false });
    emit({ type: "artifact.approved", artifact: ref, actorId: actor.id });
  });
  return result(ref, git);
}

const handler = (action: ApprovalAction) => (ctx: HandlerCtx) => applyApproval(action, parseArtifactRef(ctx.params.kind, ctx.params.id, ctx.body?.sub ?? ctx.query.get("sub")), ctx);

route("POST", "/api/artifacts/:kind/:id/done", handler("done"));
route("POST", "/api/artifacts/:kind/:id/approve", handler("approve"));
route("POST", "/api/artifacts/:kind/:id/request-change", handler("request-change"));
