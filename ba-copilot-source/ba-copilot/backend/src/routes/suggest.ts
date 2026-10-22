// Gợi ý màn tiếp theo (FN-57 → FN-61). Hợp đồng: docs/api.md mục "Gợi ý màn tiếp theo". Chủ sở hữu: A9.
// Link gãy tính bằng hàm thuần shared/suggest.ts mỗi lần GET. Màn còn thiếu (FR / story chưa có màn phủ) do Claude đề xuất
// (ai/pipelines.ts suggestMissingScreens) – chỉ gọi khi BA bấm (POST …/suggestions/refresh), kết quả lưu ở screen_suggestion_runs.
// Danh sách Bỏ qua lưu theo module trong bảng suggestion_dismissals.
// Không endpoint nào tạo màn (BR-06): nút Tạo ở client chỉ mở hộp thoại rồi gọi POST /api/modules/:id/screens.

import { createHash } from "node:crypto";
import * as repo from "../repo.ts";
import { getDb } from "../db.ts";
import { BizError } from "../service.ts";
import { route } from "../http.ts";
import { moduleStories } from "../repo/stories.ts";
import { suggestMissingScreens } from "../ai/pipelines.ts";
import { aiConfig } from "../ai/client.ts";
import { extractModel, type DesignModel } from "../../../shared/extract.ts";
import { splitStories } from "../../../shared/qus.ts";
import { suggestionSources, suggestNextScreens, toSuggestion, type MissingScreen, type SuggestSource } from "../../../shared/suggest.ts";
import type { Module, ScreenSuggestion, ScreenSuggestions } from "../../../shared/types.ts";

const KEY_RE = /^(link|fr|story):\S.{0,299}$/;

function requireModule(id: string) {
  const m = repo.getModule(id);
  if (!m) throw new BizError("Module not found", 404);
  return m;
}

function requireKey(key: string): string {
  if (!KEY_RE.test(key)) throw new BizError("Invalid suggestion key");
  return key;
}

function listDismissed(moduleId: string): string[] {
  return (getDb().prepare("SELECT key FROM suggestion_dismissals WHERE module_id = ? ORDER BY created_at").all(moduleId) as { key: string }[]).map((r) => r.key);
}

/** Đầu vào của module: mô hình màn + nguồn để hỏi AI (BR-07). Story lấy ở bảng user_stories (đợt 5), chưa có thì requirementInput cũ. */
function inputsOf(m: Module): { model: DesignModel; sources: SuggestSource[] } {
  const model = extractModel(repo.listScreens(m.id).filter((s) => s.tree).map((s) => ({ id: s.id, name: s.name, tree: s.tree! })));
  const structured = moduleStories(m.id);
  const stories = structured.length ? structured : splitStories(m.requirementInput);
  return { model, sources: suggestionSources(repo.getDocs(m.id).requirements, stories) };
}

// Dấu vân tay đầu vào của lần chạy AI: đổi FR / story hoặc nội dung màn (tên, nhãn, nút, bảng) thì kết quả cũ được báo là đã cũ.
function fingerprint(model: DesignModel, sources: SuggestSource[]): string {
  const screens = model.screens.map((s) => [s.screenName, s.title, s.headings, s.fields.map((f) => f.label), s.actions.map((a) => a.label), s.displays.map((d) => d.title)]);
  return createHash("sha1").update(JSON.stringify([sources.map((s) => [s.key, s.text]), screens])).digest("hex");
}

interface SavedRun { items: MissingScreen[]; fingerprint: string; provider: "claude" | "mock"; created_at: string }
function savedRun(moduleId: string): SavedRun | null {
  const r = getDb().prepare("SELECT items, fingerprint, provider, created_at FROM screen_suggestion_runs WHERE module_id = ?").get(moduleId) as
    | { items: string; fingerprint: string; provider: "claude" | "mock"; created_at: string }
    | undefined;
  return r ? { ...r, items: JSON.parse(r.items) as MissingScreen[] } : null;
}

export function getScreenSuggestions(moduleId: string): ScreenSuggestions {
  const m = requireModule(moduleId);
  const { model, sources } = inputsOf(m);
  const run = savedRun(m.id);
  // Chỉ giữ màn còn thiếu có nguồn vẫn còn (FR / story bị xoá thì gợi ý của nó mất theo)
  const byKey = new Map(sources.map((s) => [s.key, s]));
  const uncovered: ScreenSuggestion[] = (run?.items ?? []).flatMap((x) => (byKey.has(x.key) ? [toSuggestion(byKey.get(x.key)!, x.name, x.reason)] : []));
  const dismissedKeys = listDismissed(m.id);
  const keys = new Set(dismissedKeys);
  return {
    items: suggestNextScreens({ model, uncovered, dismissed: dismissedKeys }),
    // Chỉ trả các gợi ý bị bỏ qua mà vẫn còn là khoảng trống; khoá cũ đã được phủ thì không hiện để khôi phục.
    dismissed: suggestNextScreens({ model, uncovered, dismissed: [] }).filter((s) => keys.has(s.key)),
    ai: {
      hasSource: sources.length > 0,
      checkedAt: run?.created_at ?? null,
      outdated: !!run && run.fingerprint !== fingerprint(model, sources),
      provider: run?.provider ?? null,
    },
  };
}

/** FN-58: hỏi AI màn còn thiếu cho module (gọi Claude; Mock khi chưa có khoá), lưu lại, trả danh sách mới. */
export async function refreshScreenSuggestions(moduleId: string): Promise<ScreenSuggestions> {
  const m = requireModule(moduleId);
  const { model, sources } = inputsOf(m);
  if (!sources.length) throw new BizError("Add functional requirements or user stories to this module first");
  const items = await suggestMissingScreens({ moduleId: m.id, moduleName: m.name, model, sources });
  getDb()
    .prepare(
      `INSERT INTO screen_suggestion_runs (module_id, items, fingerprint, provider, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(module_id) DO UPDATE SET items = excluded.items, fingerprint = excluded.fingerprint, provider = excluded.provider, created_at = excluded.created_at`,
    )
    .run(m.id, JSON.stringify(items), fingerprint(model, sources), aiConfig().provider, new Date().toISOString());
  return getScreenSuggestions(m.id);
}

route("GET", "/api/modules/:id/suggestions", ({ params }) => getScreenSuggestions(params.id));
route("POST", "/api/modules/:id/suggestions/refresh", ({ params }) => refreshScreenSuggestions(params.id));

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
