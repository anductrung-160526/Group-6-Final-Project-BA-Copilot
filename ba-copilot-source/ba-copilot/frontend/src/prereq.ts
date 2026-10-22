// Lý do khoá nút "Xong" theo bước tiên quyết (shared/prereq.ts) cho nơi không có sẵn trạng thái các bước – ngăn chi
// tiết task. Màn Tài liệu / Sơ đồ / Test case tự tính từ dữ liệu đã tải. Chủ sở hữu: D2 (đợt 6).
// Lỗi tải → null (không khoá ở client; server vẫn chặn và trả đúng câu lý do).

import { doneBlockReason } from "../../shared/prereq.ts";
import type { ArtifactKind, DiagramKind, DocKind, ModuleDetail } from "../../shared/types.ts";
import { get, listModuleDocs, listStories } from "./api.ts";

export async function loadDoneBlockReason(projectId: string, kind: ArtifactKind, moduleId: string, sub?: DocKind | DiagramKind | null): Promise<string | null> {
  if (kind !== "doc" && kind !== "diagram" && kind !== "tests") return null; // màn hình: không có bước tiên quyết
  try {
    const [docs, stories, mod] = await Promise.all([
      listModuleDocs(moduleId),
      kind === "doc" && sub === "BRD" ? listStories(projectId, { moduleId }) : Promise.resolve(null),
      kind === "tests" ? get<ModuleDetail>(`/api/modules/${encodeURIComponent(moduleId)}`) : Promise.resolve(null),
    ]);
    return doneBlockReason(
      { kind, sub: sub ?? undefined },
      {
        docStatus: (k) => docs.find((d) => d.kind === k)?.status,
        storyCount: stories ? stories.length : undefined,
        legacyDocsApproved: mod ? mod.docsStatus === "approved" : undefined,
      },
    );
  } catch {
    return null;
  }
}
