// UC-29 – Gợi ý màn hình tiếp theo.
// Quy ước tính năng AI: màn còn thiếu (FR / user story chưa có màn phủ) do Claude đề xuất – server/ai/pipelines.ts
// suggestMissingScreens (chế độ Mock: so khớp từ khoá ở server/ai/mock.ts). Tệp này chỉ là phần KHÔNG phải AI, hàm thuần:
//  - chọn nguồn để hỏi (BR-07 / G5): đã có FR thì dựa trên FR, chưa có FR thì dựa trên user story;
//  - link gãy (nút / link trỏ tới màn chưa có) – kiểm tra dữ liệu, không cần AI;
//  - gộp link gãy + màn còn thiếu, bỏ trùng tên, bỏ màn đã có, bỏ gợi ý đã bị Bỏ qua.
// Chỉ trả về gợi ý kèm tên và prompt điền sẵn; không bao giờ tự tạo màn (BR-06 / G6).

import type { DesignModel } from "./extract.ts";
import { slug } from "./extract.ts";
import type { Requirement, ScreenSuggestion } from "./types.ts";
import { isBlankStructured, storySentence, type StructuredStory } from "./qus.ts";

/** Một FR hoặc một user story được đưa cho AI để xét đã có màn phủ chưa. */
export interface SuggestSource {
  key: string; // khoá gợi ý ổn định: "fr:<code>" hoặc "story:<hash>"
  kind: "fr" | "story";
  code?: string; // mã FR / mã story (US-xx); story tự do cũ không có mã
  text: string; // phát biểu FR hoặc câu story
}

/** Màn còn thiếu do AI đề xuất cho một nguồn. */
export interface MissingScreen {
  key: string; // khoá của SuggestSource
  name: string;
  reason?: string;
}

// Khoá ổn định của story: "story:<hash>" – FNV-1a 32 bit trên story đã chuẩn hoá (bỏ dấu, bỏ dấu câu),
// nên sửa khoảng trắng/dấu câu không làm mất trạng thái Bỏ qua. Chạy được cả trên trình duyệt lẫn server.
export function storyKey(story: string): string {
  let h = 0x811c9dc5;
  for (const ch of slug(story)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `story:${h.toString(36)}`;
}

/**
 * BR-07 / G5: đã có FR thì dựa trên FR (bỏ NFR), chưa có FR thì dựa trên user story.
 * stories: story có cấu trúc (bảng user_stories, ghép câu bằng storySentence) hoặc chuỗi tự do cũ (splitStories).
 */
export function suggestionSources(requirements: Requirement[], stories: (string | StructuredStory)[]): SuggestSource[] {
  const frs = requirements.filter((r) => r.type === "FR" && r.statement.trim());
  if (frs.length) return frs.map((r) => ({ key: `fr:${r.code}`, kind: "fr", code: r.code, text: r.statement.trim() }));
  const out: SuggestSource[] = [];
  for (const item of stories) {
    if (typeof item !== "string" && isBlankStructured(item)) continue;
    const text = (typeof item === "string" ? item : storySentence(item)).trim();
    if (!text) continue;
    out.push({ key: storyKey(text), kind: "story", code: typeof item === "string" ? undefined : item.code, text });
  }
  return out;
}

/** Gợi ý màn từ một nguồn chưa có màn phủ (FN-59: lý do kèm nguồn; FN-60: prompt điền sẵn). */
export function toSuggestion(src: SuggestSource, name: string, reason?: string): ScreenSuggestion {
  const label = src.kind === "fr" ? src.code! : src.code ? `User story ${src.code}` : "User story";
  return {
    key: src.key,
    kind: src.kind === "fr" ? "uncovered-fr" : "uncovered-story",
    name,
    reason: reason?.trim() || `${label} is not covered by any screen`,
    source: src.kind === "fr" ? src.code! : src.code ?? src.text,
    prompt: src.kind === "fr" ? `Screen ${name} satisfying ${src.code}: ${src.text}` : `Screen ${name} satisfying user story${src.code ? ` ${src.code}` : ""}: ${src.text}`,
  };
}

// Tên và tiêu đề của các màn đã có (đã chuẩn hoá) – dùng để biết đích điều hướng hay tên đề xuất đã tồn tại.
export function knownNames(model: DesignModel): Set<string> {
  return new Set(model.screens.flatMap((s) => [slug(s.screenName), slug(s.title)]).filter(Boolean));
}

export function brokenLinks(model: DesignModel, known = knownNames(model)): ScreenSuggestion[] {
  const out: ScreenSuggestion[] = [];
  for (const s of model.screens) {
    const targets = [
      ...s.actions.map((a) => ({ nodeId: a.nodeId, label: a.label, to: a.navigateTo })),
      ...s.links.map((l) => ({ nodeId: l.nodeId, label: l.text, to: l.navigateTo })),
    ];
    for (const t of targets) {
      if (!t.to.trim() || known.has(slug(t.to))) continue;
      const name = t.to.trim();
      out.push({
        key: `link:${s.screenId}:${t.nodeId}`,
        kind: "broken-link",
        name,
        reason: `Button "${t.label}" on screen ${s.screenName} has no target`,
        source: `${s.screenName} › ${t.label}`,
        prompt: `Screen ${name}. Users reach this screen by clicking "${t.label}" on screen ${s.screenName}.`,
      });
    }
  }
  return out;
}

export interface SuggestInput {
  model: DesignModel;
  /** Màn còn thiếu do AI đề xuất (lần chạy gần nhất), đã đổi sang ScreenSuggestion bằng toSuggestion. */
  uncovered: ScreenSuggestion[];
  dismissed?: string[];
}

/** Danh sách hiển thị: link gãy trước, màn còn thiếu sau (FN-59). */
export function suggestNextScreens(input: SuggestInput): ScreenSuggestion[] {
  const { model } = input;
  const dismissed = new Set(input.dismissed ?? []);
  const known = knownNames(model);
  // Đã có màn trùng tên đề xuất (thường là màn vừa tạo từ chính gợi ý này) thì coi như đã phủ
  const all = [...brokenLinks(model, known), ...input.uncovered.filter((s) => !known.has(slug(s.name)))];

  // Gộp các gợi ý trùng tên màn (giữ gợi ý đứng trước) rồi mới bỏ gợi ý đã bị bỏ qua:
  // Bỏ qua một gợi ý là ẩn màn đề xuất đó, không để gợi ý trùng tên ở nguồn khác hiện lên thay.
  const seen = new Set<string>();
  return all
    .filter((s) => {
      const k = slug(s.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .filter((s) => !dismissed.has(s.key));
}
