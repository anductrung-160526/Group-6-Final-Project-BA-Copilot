// Điểm QUS của module (FN-56). Hợp đồng: docs/api.md mục "Chất lượng yêu cầu" + "Đợt 5" mục 5.2. Chủ sở hữu: A8 → C4.
// Đợt 5: chấm trên user story có cấu trúc của module (bảng user_stories, ghép "As a X, I want Y, so that Z" + tiêu chí
// chấp nhận) thay cho modules.requirement_input. Điểm chỉ để tư vấn (BR-05): không chặn lưu, không chặn sinh màn/tài liệu.

import * as repo from "../repo.ts";
import { getDb } from "../db.ts";
import { BizError } from "../service.ts";
import { route } from "../http.ts";
import { moduleStories } from "../repo/stories.ts";
import { scoreStructured, storySentence, isBlankStructured, type OtherModuleStories, type QusResult } from "../../shared/qus.ts";
import type { Module, ModuleQus } from "../../shared/types.ts";

// Story của các module khác cùng dự án, để bắt trùng chéo module (G1) – giống cách màn Yêu cầu nghiệp vụ chấm.
function othersOf(m: Module): OtherModuleStories[] {
  return repo
    .listModules(m.projectId)
    .filter((x) => x.id !== m.id)
    .map((x) => ({ moduleName: x.name, stories: moduleStories(x.id).filter((s) => !isBlankStructured(s)).map(storySentence) }));
}

function scoreModule(m: Module): QusResult {
  return scoreStructured(moduleStories(m.id), { others: othersOf(m) });
}

/**
 * FN-56: chấm lại user story hiện tại của module và lưu vào modules.qus_score / qus_checked_at.
 * Gọi sau khi tạo module và sau mỗi lần story của module đổi. Không có story nào → lưu NULL (chưa chấm).
 */
export function saveModuleQus(moduleId: string): number | null {
  const m = repo.getModule(moduleId);
  if (!m) return null;
  const result = scoreModule(m);
  const score = result.stories.length ? result.total : null;
  getDb()
    .prepare("UPDATE modules SET qus_score = ?, qus_checked_at = ? WHERE id = ?")
    .run(score, score === null ? null : new Date().toISOString(), moduleId);
  return score;
}

/** Chấm lại mọi module của dự án (story một module đổi có thể làm đổi lỗi trùng chéo module của module khác). */
export function saveProjectQus(projectId: string): void {
  for (const m of repo.listModules(projectId)) saveModuleQus(m.id);
}

route("GET", "/api/modules/:id/qus", ({ params }): ModuleQus => {
  const m = repo.getModule(params.id);
  if (!m) throw new BizError("Module not found", 404);
  const saved = getDb().prepare("SELECT qus_score, qus_checked_at FROM modules WHERE id = ?").get(m.id) as
    | { qus_score: number | null; qus_checked_at: string | null }
    | undefined;
  return {
    moduleId: m.id,
    score: saved?.qus_score ?? null,
    checkedAt: saved?.qus_checked_at ?? null,
    result: scoreModule(m),
  };
});
