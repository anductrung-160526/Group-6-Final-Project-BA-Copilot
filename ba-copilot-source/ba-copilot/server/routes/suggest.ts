// Gợi ý màn tiếp theo (FN-57 → FN-61). Hợp đồng: docs/api.md mục "Gợi ý màn tiếp theo". Chủ sở hữu: A9.
// Tính gợi ý bằng hàm thuần shared/suggest.ts; danh sách Bỏ qua lưu theo module trong bảng suggestion_dismissals.
// Không endpoint nào tạo màn (BR-06): nút Tạo ở client chỉ mở hộp thoại rồi gọi POST /api/modules/:id/screens.

import * as repo from "../repo.ts";
import { getDb } from "../db.ts";
import { BizError } from "../service.ts";
import { route } from "../http.ts";
import { extractModel } from "../../shared/extract.ts";
import { splitStories } from "../../shared/qus.ts";
import { suggestNextScreens } from "../../shared/suggest.ts";
import type { ScreenSuggestions } from "../../shared/types.ts";

const KEY_RE = /^(link|fr|story):\S.{0,299}$/;

function requireModule(id: string) {
  const m = repo.getModule(id);
  if (!m) throw new BizError("Không tìm thấy module", 404);
  return m;
}

function requireKey(key: string): string {
  if (!KEY_RE.test(key)) throw new BizError("Mã gợi ý không hợp lệ");
  return key;
}

function listDismissed(moduleId: string): string[] {
  return (getDb().prepare("SELECT key FROM suggestion_dismissals WHERE module_id = ? ORDER BY created_at").all(moduleId) as { key: string }[]).map((r) => r.key);
}

export function getScreenSuggestions(moduleId: string): ScreenSuggestions {
  const m = requireModule(moduleId);
  const input = {
    model: extractModel(repo.listScreens(m.id).filter((s) => s.tree).map((s) => ({ id: s.id, name: s.name, tree: s.tree! }))),
    requirements: repo.getDocs(m.id).requirements,
    stories: splitStories(m.requirementInput),
  };
  const dismissedKeys = listDismissed(m.id);
  const keys = new Set(dismissedKeys);
  return {
    items: suggestNextScreens({ ...input, dismissed: dismissedKeys }),
    // Chỉ trả các gợi ý bị bỏ qua mà vẫn còn là khoảng trống; khoá cũ đã được phủ thì không hiện để khôi phục.
    dismissed: suggestNextScreens({ ...input, dismissed: [] }).filter((s) => keys.has(s.key)),
  };
}

route("GET", "/api/modules/:id/suggestions", ({ params }) => getScreenSuggestions(params.id));

route("POST", "/api/modules/:id/suggestions/:key/dismiss", ({ params }) => {
  requireModule(params.id);
  getDb()
    .prepare("INSERT OR IGNORE INTO suggestion_dismissals (module_id, key, created_at) VALUES (?, ?, ?)")
    .run(params.id, requireKey(params.key), new Date().toISOString());
  return { ok: true };
});

route("DELETE", "/api/modules/:id/suggestions/:key/dismiss", ({ params }) => {
  requireModule(params.id);
  getDb().prepare("DELETE FROM suggestion_dismissals WHERE module_id = ? AND key = ?").run(params.id, requireKey(params.key));
  return { ok: true };
});
