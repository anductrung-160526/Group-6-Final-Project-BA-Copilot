// Bước tiên quyết – phần đọc DB cho luật chung ở shared/prereq.ts. Chủ sở hữu: D2 (đợt 6).
// - artifactBlockReason: lý do chưa Xong / Duyệt được (routes/approval.ts dùng, áp cho cả kéo task sang Xong).
// - cascadeOutdated: sau khi một sản phẩm rời Xong / Đã duyệt mà không ghi nội dung mới (Yêu cầu sửa, bỏ duyệt bộ tài
//   liệu cũ), các sản phẩm đang Xong / Đã duyệt dựa trên nó thành Bản cũ (`outdated`) + phát `artifact.stale` (task đi
//   theo) – để không còn sản phẩm Xong / Đã duyệt nào có bước tiên quyết chưa Xong. Gọi trong tx() của nơi đổi trạng thái.

import { getArtifactState, getDb, setArtifactState } from "./db.ts";
import { emit } from "./events.ts";
import { isReady, prereqBlockReason, type PrereqAction, type PrereqFacts } from "../shared/prereq.ts";
import { DIAGRAM_KINDS, DOC_KINDS, type ArtifactRef, type ArtifactStatus, type DocKind } from "../shared/types.ts";

/** Dữ kiện hiện tại của module (đọc thẳng DB mỗi lần gọi `docStatus`, nên đúng cả khi đang đổi trong giao dịch). */
export function prereqFacts(moduleId: string, opts: { stories?: boolean } = {}): PrereqFacts {
  const d = getDb();
  const legacy = d.prepare("SELECT docs_status FROM modules WHERE id = ?").get(moduleId) as { docs_status: string } | undefined;
  return {
    docStatus: (k: DocKind) =>
      ((d.prepare("SELECT status FROM module_docs WHERE module_id = ? AND kind = ?").get(moduleId, k) as { status: ArtifactStatus } | undefined)?.status ?? "none"),
    storyCount: opts.stories === false ? undefined : Number((d.prepare("SELECT COUNT(*) AS n FROM user_stories WHERE module_id = ?").get(moduleId) as { n: number }).n),
    legacyDocsApproved: legacy?.docs_status === "approved",
  };
}

/** Lý do chưa được bấm Xong / Duyệt sản phẩm vì bước tiên quyết; null = được. Màn hình prototype: luôn null. */
export function artifactBlockReason(ref: ArtifactRef, action: Exclude<PrereqAction, "generate">): string | null {
  if (ref.kind !== "doc" && ref.kind !== "diagram" && ref.kind !== "tests") return null;
  return prereqBlockReason({ kind: ref.kind, sub: ref.sub }, prereqFacts(ref.moduleId || ref.id), action);
}

/**
 * Lan Bản cũ theo chuỗi tiên quyết (tài liệu theo thứ tự bước → sơ đồ → bộ test). Luật user story của BRD không xét ở đây.
 * Trả các sản phẩm vừa chuyển sang Bản cũ.
 */
export function cascadeOutdated(moduleId: string, actorId?: string): ArtifactRef[] {
  const facts = prereqFacts(moduleId, { stories: false });
  const refs: ArtifactRef[] = [
    ...DOC_KINDS.map((k): ArtifactRef => ({ kind: "doc", id: moduleId, moduleId, sub: k })),
    ...DIAGRAM_KINDS.map((k): ArtifactRef => ({ kind: "diagram", id: moduleId, moduleId, sub: k })),
    { kind: "tests", id: moduleId, moduleId },
  ];
  const changed: ArtifactRef[] = [];
  // Thứ tự trên đã theo chiều phụ thuộc nên một lượt là đủ (facts đọc lại DB nên thấy thay đổi của bước trước).
  for (const r of refs) {
    const st = getArtifactState(r);
    if (!st || !isReady(st.status)) continue;
    if (!prereqBlockReason({ kind: r.kind, sub: r.sub }, facts, "done")) continue;
    setArtifactState(r, { status: "outdated" });
    emit({ type: "artifact.stale", artifact: r, actorId });
    changed.push(r);
  }
  return changed;
}
