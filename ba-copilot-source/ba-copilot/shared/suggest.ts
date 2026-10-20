// UC-29 – Gợi ý màn hình tiếp theo.
// Hàm thuần (không gọi DB, không gọi AI): nhận DesignModel, danh sách FR, danh sách story và danh sách đã bỏ qua.
// Chỉ trả về gợi ý kèm tên và prompt điền sẵn; không bao giờ tự tạo màn (BR-06 / G6).

import type { DesignModel, ScreenModel } from "./extract.ts";
import { slug } from "./extract.ts";
import type { Requirement } from "./types.ts";
import { parseStory } from "./qus.ts";

export type SuggestionKind = "broken-link" | "uncovered-fr" | "uncovered-story";

export interface Suggestion {
  key: string; // mã ổn định để bỏ qua/khôi phục: "link:<screenId>:<nodeId>", "fr:FR-04", "story:<slug>"
  kind: SuggestionKind;
  name: string; // tên màn đề xuất
  reason: string; // lý do hiển thị cho BA
  source: string; // nguồn: mã FR, story, hoặc "<màn nguồn> › <nhãn nút>" (BR-08)
  prompt: string; // prompt điền sẵn cho hộp thoại Màn hình mới
}

export interface SuggestInput {
  model: DesignModel;
  requirements: Requirement[];
  stories: string[];
  dismissed?: string[];
}

// Tỉ lệ từ khoá của FR/story phải xuất hiện trên một màn để coi là đã phủ.
export const COVERAGE_THRESHOLD = 0.6;

// Từ không mang nghĩa nghiệp vụ, bỏ đi khi so khớp (đã bỏ dấu qua slug).
const STOPWORDS = new Set(
  [
    "he thong", "nguoi dung", "cho phep", "co the", "phai", "duoc", "can", "cua", "cho", "voi", "va", "hoac", "cac", "nhung", "mot",
    "la", "toi", "muon", "de", "khi", "theo", "trong", "tren", "tu", "den", "vao", "ra", "nay", "do", "the",
    "system", "user", "shall", "should", "must", "can", "the", "a", "an", "to", "of", "for", "and", "or", "with", "in", "on", "by", "be", "i", "my",
  ].flatMap((w) => w.split(" ")),
);

function keywords(text: string): string[] {
  return [...new Set(slug(text).split("_").filter((t) => t.length > 1 && !STOPWORDS.has(t)))];
}

// Toàn bộ chữ có trên một màn: tên, tiêu đề, heading, nhãn nút, nhãn trường, link, cột bảng.
function screenVocabulary(s: ScreenModel): Set<string> {
  const parts = [
    s.screenName,
    s.title,
    ...s.headings,
    ...s.actions.map((a) => a.label),
    ...s.fields.map((f) => f.label),
    ...s.links.map((l) => l.text),
    ...s.displays.flatMap((d) => [d.title, ...d.columns, ...d.rowActions]),
    ...s.forms.map((f) => f.title),
  ];
  return new Set(parts.flatMap((p) => slug(p).split("_")).filter(Boolean));
}

function isCovered(text: string, vocabularies: Set<string>[]): boolean {
  const kw = keywords(text);
  if (!kw.length) return true; // không có từ khoá nào để so: không gợi ý
  return vocabularies.some((v) => kw.filter((k) => v.has(k)).length / kw.length >= COVERAGE_THRESHOLD);
}

// Tên màn đề xuất: viết hoa chữ đầu, tối đa 6 từ.
function screenName(text: string): string {
  const words = text.replace(/[.。!?]+$/u, "").trim().split(/\s+/).slice(0, 6).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function brokenLinks(model: DesignModel): Suggestion[] {
  const known = new Set(model.screens.flatMap((s) => [slug(s.screenName), slug(s.title)]));
  const out: Suggestion[] = [];
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
        reason: `Nút "${t.label}" ở màn ${s.screenName} chưa có đích`,
        source: `${s.screenName} › ${t.label}`,
        prompt: `Màn hình ${name}. Người dùng tới màn này khi bấm "${t.label}" ở màn ${s.screenName}.`,
      });
    }
  }
  return out;
}

export function suggestNextScreens(input: SuggestInput): Suggestion[] {
  const { model, requirements, stories } = input;
  const dismissed = new Set(input.dismissed ?? []);
  const vocabularies = model.screens.map(screenVocabulary);

  // Thứ tự: link gãy trước, FR/story chưa phủ sau (FN-59)
  const all: Suggestion[] = brokenLinks(model);

  // BR-07 / G5: đã có FR thì dựa trên FR, chưa có FR thì dựa trên user story
  const frs = requirements.filter((r) => r.type === "FR");
  if (frs.length) {
    for (const r of frs) {
      if (isCovered(r.statement, vocabularies)) continue;
      const name = screenName(r.statement);
      all.push({
        key: `fr:${r.code}`,
        kind: "uncovered-fr",
        name,
        reason: `${r.code} chưa có màn nào phủ`,
        source: r.code,
        prompt: `Màn hình ${name} đáp ứng ${r.code}: ${r.statement}`,
      });
    }
  } else {
    for (const story of stories) {
      const means = parseStory(story).means ?? story;
      if (isCovered(means, vocabularies)) continue;
      const name = screenName(means);
      all.push({
        key: `story:${slug(story)}`,
        kind: "uncovered-story",
        name,
        reason: "User story chưa có màn nào phủ",
        source: story,
        prompt: `Màn hình ${name} đáp ứng user story: ${story}`,
      });
    }
  }

  // Bỏ gợi ý đã bị bỏ qua và gộp các gợi ý trùng tên màn (giữ gợi ý đứng trước)
  const seen = new Set<string>();
  return all.filter((s) => {
    if (dismissed.has(s.key)) return false;
    const k = slug(s.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
