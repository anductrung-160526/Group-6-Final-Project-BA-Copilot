// UC-29 – Gợi ý màn hình tiếp theo.
// Hàm thuần (không gọi DB, không gọi AI): nhận DesignModel, danh sách FR, danh sách story và danh sách đã bỏ qua.
// Chỉ trả về gợi ý kèm tên và prompt điền sẵn; không bao giờ tự tạo màn (BR-06 / G6).

import type { DesignModel, ScreenModel } from "./extract.ts";
import { slug } from "./extract.ts";
import type { Requirement, ScreenSuggestion } from "./types.ts";
import { parseStory } from "./qus.ts";

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

// FR kiểm tra dữ liệu ("Hệ thống phải kiểm tra: Tên là bắt buộc") là quy tắc của trường trên màn đã có, không phải màn mới.
const VALIDATION_FR = /^(?:(?:hệ thống|the system)\s+(?:phải|shall|must|should)\s+)?(?:kiểm tra|validate)\s*:/iu;
// Phần mở đầu không mang tên màn: "Hệ thống phải (cho phép <vai trò> thực hiện)", "The system shall (allow <role> to)".
const LEAD = /^(?:hệ thống|the system)\s+(?:phải|shall|must|should)\s+(?:cho phép\s+(?:\S+\s+){0,4}?thực hiện\s+|allow\s+(?:\S+\s+){0,3}?to\s+)?/iu;
// Từ mở đầu mệnh đề phụ: tên màn dừng trước chúng ("… theo trạng thái", "… để xử lý").
const CLAUSE_WORDS = new Set(["để", "nhằm", "theo", "khi", "trong", "cho", "when", "for", "by"]);
// Từ nối không được đứng cuối tên.
const TRAILING_WORDS = new Set(["và", "hoặc", "của", "các", "với", "and", "or", "of", "the", "a", "an"]);
const MAX_NAME_WORDS = 8;

// Tên màn đề xuất: bỏ phần mở đầu chung, dừng ở mệnh đề phụ, tối đa 8 từ, không kết thúc bằng từ nối, viết hoa chữ đầu.
// FR dạng 'cho phép Quản trị viên thực hiện "Thêm sản phẩm"' lấy tên là thao tác trong ngoặc kép.
function screenName(text: string): string {
  const quoted = text.match(/["“]([^"”]+)["”]/u)?.[1];
  let words: string[] = [];
  if (quoted) {
    words = quoted.trim().replace(/^mở màn hình\s+/iu, "").replace(/\s*\(([^)]+)\)\s*$/u, " – $1").split(/\s+/);
  } else {
    // Bỏ chú thích trong ngoặc ("… ra Excel (ví dụ theo tháng)"), kể cả ngoặc chưa đóng
    const core = text.replace(/\s*[(（][^)）]*[)）]?/gu, " ").replace(/[.。!?]+$/u, "").trim().replace(LEAD, "");
    for (const w of core.split(/\s+/)) {
      if (words.length && CLAUSE_WORDS.has(w.toLowerCase())) break;
      words.push(w);
    }
  }
  words = words.slice(0, MAX_NAME_WORDS);
  while (words.length > 1 && TRAILING_WORDS.has(words[words.length - 1].toLowerCase())) words.pop();
  const name = words.join(" ").replace(/[\s:;,–-]+$/u, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Tên và tiêu đề của các màn đã có (đã chuẩn hoá) – dùng để biết đích điều hướng hay tên đề xuất đã tồn tại.
function knownNames(model: DesignModel): Set<string> {
  return new Set(model.screens.flatMap((s) => [slug(s.screenName), slug(s.title)]).filter(Boolean));
}

function brokenLinks(model: DesignModel, known: Set<string>): ScreenSuggestion[] {
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
        reason: `Nút "${t.label}" ở màn ${s.screenName} chưa có đích`,
        source: `${s.screenName} › ${t.label}`,
        prompt: `Màn hình ${name}. Người dùng tới màn này khi bấm "${t.label}" ở màn ${s.screenName}.`,
      });
    }
  }
  return out;
}

export function suggestNextScreens(input: SuggestInput): ScreenSuggestion[] {
  const { model, requirements, stories } = input;
  const dismissed = new Set(input.dismissed ?? []);
  const vocabularies = model.screens.map(screenVocabulary);
  const known = knownNames(model);
  // Đã có màn trùng tên đề xuất (thường là màn vừa tạo từ chính gợi ý này) thì coi như đã phủ
  const uncovered = (text: string, name: string) => !known.has(slug(name)) && !isCovered(text, vocabularies);

  // Thứ tự: link gãy trước, FR/story chưa phủ sau (FN-59)
  const all: ScreenSuggestion[] = brokenLinks(model, known);

  // BR-07 / G5: đã có FR thì dựa trên FR, chưa có FR thì dựa trên user story
  const frs = requirements.filter((r) => r.type === "FR" && !VALIDATION_FR.test(r.statement.trim()));
  if (frs.length) {
    for (const r of frs) {
      const name = screenName(r.statement);
      if (!uncovered(r.statement, name)) continue;
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
      const name = screenName(means);
      if (!uncovered(means, name)) continue;
      all.push({
        key: storyKey(story),
        kind: "uncovered-story",
        name,
        reason: "User story chưa có màn nào phủ",
        source: story,
        prompt: `Màn hình ${name} đáp ứng user story: ${story}`,
      });
    }
  }

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
