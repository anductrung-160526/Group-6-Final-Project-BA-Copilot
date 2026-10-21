// Bước tiên quyết của từng sản phẩm (kế hoạch đợt 5, quyết định 8: bước sau chỉ cần bước trước ở trạng thái Xong).
// Một chỗ duy nhất cho luật "cần gì trước": dùng khi sinh, khi bấm Xong / Duyệt (server chặn, client khoá nút và hiện
// đúng câu lý do), khi kiểm tra dữ liệu mẫu (tests/seedRules.test.ts). Chủ sở hữu: D2 (đợt 6).
//
//  - Tài liệu: BRD cần ≥ 1 user story của module; bước N cần bước N−1 (DOC_KINDS) Xong / Đã duyệt.
//  - Sơ đồ: mọi tài liệu nguồn (DIAGRAM_SOURCES) Xong / Đã duyệt.
//  - Bộ test case: FRD-NFR Xong / Đã duyệt; module làm theo luồng cũ (chưa có FRD-NFR, bộ tài liệu cũ Đã duyệt) vẫn được.
//  - Màn hình prototype: không có bước tiên quyết (kế hoạch đợt 5 mục C9 không khoá prototype theo tài liệu).

import { DIAGRAM_SOURCES } from "./diagrams.ts";
import { DIAGRAM_KIND_LABEL, DOC_KINDS, DOC_KIND_LABEL, type ArtifactKind, type ArtifactStatus, type DiagramKind, type DocKind } from "./types.ts";

/** Nhãn trạng thái sản phẩm trong câu lý do (khớp StatusBadge). */
export const PREREQ_STATUS_LABEL: Record<ArtifactStatus, string> = { none: "Not started", draft: "Draft", done: "Done", approved: "Approved", outdated: "Outdated" };

export const isReady = (s: ArtifactStatus | string | null | undefined) => s === "done" || s === "approved";

/** Sản phẩm cần xét. `sub`: DocKind (doc) / DiagramKind (diagram, thiếu = "UC"). */
export interface PrereqTarget {
  kind: ArtifactKind;
  sub?: DocKind | DiagramKind | null;
}

/** Dữ kiện của module cần để xét bước tiên quyết. */
export interface PrereqFacts {
  /** Trạng thái tài liệu đợt 5 (`module_docs`) của module; chưa có → undefined / "none". */
  docStatus: (k: DocKind) => ArtifactStatus | null | undefined;
  /** Số user story của module. undefined = chưa biết (client chưa tải) → không chặn ở client, server vẫn chặn. */
  storyCount?: number;
  /** Bộ tài liệu cũ (`modules.docs_status`) Đã duyệt – nhánh legacy của test case. */
  legacyDocsApproved?: boolean;
}

/** Hành động đang bị xét: sinh bằng AI, bấm Xong, Duyệt. */
export type PrereqAction = "generate" | "done" | "approve";

const label = (t: PrereqTarget): string => {
  if (t.kind === "doc") return DOC_KIND_LABEL[t.sub as DocKind] ?? String(t.sub);
  if (t.kind === "diagram") return `the ${DIAGRAM_KIND_LABEL[(t.sub as DiagramKind) ?? "UC"] ?? t.sub} diagram`;
  if (t.kind === "tests") return "the test suite";
  return "the artifact";
};
const verb = (a: PrereqAction, t: PrereqTarget) => (a === "generate" ? `generating ${label(t)}` : a === "done" ? `marking ${label(t)} as done` : `approving ${label(t)}`);

/** Tài liệu tiên quyết (trực tiếp) của sản phẩm. Dùng cho kiểm tra và cho lan "Bản cũ" khi nguồn không còn Xong. */
export function prereqDocs(t: PrereqTarget): DocKind[] {
  if (t.kind === "doc") {
    const i = DOC_KINDS.indexOf(t.sub as DocKind);
    return i > 0 ? [DOC_KINDS[i - 1]] : [];
  }
  if (t.kind === "diagram") return DIAGRAM_SOURCES[(t.sub as DiagramKind) ?? "UC"] ?? [];
  if (t.kind === "tests") return ["FRD_NFR"];
  return [];
}

/**
 * Lý do chưa được làm `action` trên sản phẩm vì bước tiên quyết chưa Xong / Đã duyệt; null = được.
 * Server trả 400 kèm câu này; client khoá nút và hiện đúng câu này.
 */
export function prereqBlockReason(t: PrereqTarget, f: PrereqFacts, action: PrereqAction): string | null {
  const st = (k: DocKind): ArtifactStatus => f.docStatus(k) ?? "none";
  if (t.kind === "doc" && t.sub === "BRD") {
    return f.storyCount === 0 ? `This module has no user stories yet. Add at least one user story under Business Requirements before ${verb(action, t)}.` : null;
  }
  if (t.kind === "doc") {
    const [prev] = prereqDocs(t);
    if (!prev || isReady(st(prev))) return null;
    const head = action === "generate" ? `The previous step (${DOC_KIND_LABEL[prev]}) is not Done` : `The previous step (${DOC_KIND_LABEL[prev]}) is not Done (current: ${PREREQ_STATUS_LABEL[st(prev)]})`;
    return `${head}. Complete ${DOC_KIND_LABEL[prev]} and mark it as done before ${verb(action, t)}.`;
  }
  if (t.kind === "diagram") {
    const missing = prereqDocs(t).filter((k) => !isReady(st(k)));
    if (!missing.length) return null;
    return `Source document ${missing.map((k) => `${DOC_KIND_LABEL[k]} (current: ${PREREQ_STATUS_LABEL[st(k)]})`).join(", ")} must be Done before ${verb(action, t)}.`;
  }
  if (t.kind === "tests") {
    const frd = st("FRD_NFR");
    if (isReady(frd)) return null;
    if (frd === "none" && f.legacyDocsApproved) return null; // luồng cũ: bộ tài liệu cũ đã duyệt
    return `${DOC_KIND_LABEL.FRD_NFR} must be Done before ${verb(action, t)} (current: ${PREREQ_STATUS_LABEL[frd]}).`;
  }
  return null; // màn hình prototype, bộ tài liệu cũ: không có bước tiên quyết
}

/** Lý do chưa bấm Xong được (null = được). Cùng luật với khi sinh. */
export const doneBlockReason = (t: PrereqTarget, f: PrereqFacts) => prereqBlockReason(t, f, "done");
/** Lý do chưa Duyệt được (null = được). */
export const approveBlockReason = (t: PrereqTarget, f: PrereqFacts) => prereqBlockReason(t, f, "approve");
