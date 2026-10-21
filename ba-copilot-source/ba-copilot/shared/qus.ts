// Chấm chất lượng User Story theo khung QUS (Quality User Story).
// Hàm thuần: không gọi AI, không phụ thuộc Node API hay browser API, chạy được cả client và server.

export const BASE_SCORE = 100;
export const PENALTY_ERROR = 30;
export const PENALTY_WARN = 15;
export const PENALTY_INFO = 5;

export interface QusIssue {
  code: string;
  severity: "error" | "warn" | "info";
  message: string;
  suggestion?: string;
  /** Đoạn chữ trong story gây ra lỗi (FN-55), ví dụ từ mơ hồ "nhanh" hoặc cụm "và xóa". */
  excerpt?: string;
}

export interface StoryScore {
  index: number;
  /** Đợt 5: mã và id của user story có cấu trúc (chỉ có khi chấm bằng scoreStructured). */
  id?: string;
  code?: string;
  text: string;
  score: number;
  issues: QusIssue[];
}

export interface QusResult {
  stories: StoryScore[];
  total: number;
}

// Story của các module khác trong cùng dự án, dùng để phát hiện trùng chéo module (G1).
export interface OtherModuleStories {
  moduleName: string;
  /** Văn bản tự do (cách cũ, tách bằng splitStories). */
  text?: string;
  /** Đợt 5: từng story đã ghép thành câu (storySentence) – có thì dùng thay cho `text`. */
  stories?: string[];
}

export interface ScoreOptions {
  others?: OtherModuleStories[];
}

// Ngưỡng Jaccard để coi hai story là trùng (G1).
export const DUPLICATE_THRESHOLD = 0.8;

// Xếp hạng điểm (FN-52): Tốt ≥ 80, Khá 60–79, Cần sửa < 60.
export type QusRating = "good" | "fair" | "poor";
export const RATING_LABEL: Record<QusRating, string> = { good: "Good", fair: "Fair", poor: "Poor" };
export function qusRating(score: number): QusRating {
  return score >= 80 ? "good" : score >= 60 ? "fair" : "poor";
}

// Khuôn mẫu của story, dùng cho NOT_UNIFORM (G2).
export type StoryTemplate = "en" | "vi" | "free";

export interface ParsedStory {
  role?: string;
  means?: string;
  end?: string;
  isTemplate: boolean;
  template: StoryTemplate;
}

// vi-keep-start: từ khoá NLP tiếng Việt (nhận diện story cũ viết tiếng Việt trong DB), có bản tiếng Anh song song
const AMBIGUOUS_WORDS: string[] = [
  "user-friendly",
  "user friendly",
  "thân thiện",
  "linh hoạt",
  "hiệu quả",
  "dễ dàng",
  "dễ dùng",
  "dễ sử dụng",
  "tối ưu",
  "nhanh",
  "tốt",
  "etc",
  "v.v",
  "fast",
  "easy",
  "easily",
  "quick",
  "quickly",
  "flexible",
  "efficient",
  "intuitive",
  "optimal",
  "simple",
  "and so on",
];

const ACTION_VERBS: string[] = [
  // Vietnamese action verbs
  "xem",
  "tra cứu",
  "tìm kiếm",
  "tìm",
  "lọc",
  "hiển thị",
  "theo dõi",
  "thống kê",
  "báo cáo",
  "thêm",
  "tạo mới",
  "tạo",
  "nhập",
  "ghi",
  "lưu trữ",
  "lưu",
  "chỉnh sửa",
  "cập nhật",
  "thay đổi",
  "sửa",
  "đổi",
  "chỉnh",
  "xóa",
  "hủy bỏ",
  "hủy",
  "gỡ bỏ",
  "gỡ",
  "loại bỏ",
  "quản lý",
  "phân quyền",
  "thiết lập",
  "cài đặt",
  "cấu hình",
  "gửi",
  "nhận",
  "chuyển",
  "chia sẻ",
  "tải lên",
  "tải xuống",
  "tải",
  "xuất",
  "chọn",
  "đặt hàng",
  "đặt",
  "mua hàng",
  "mua",
  "thanh toán",
  "hoàn tiền",
  "phê duyệt",
  "duyệt",
  "từ chối",
  "xác nhận",
  "kích hoạt",
  "mở khóa",
  "khóa",
  "đăng nhập",
  "đăng xuất",
  "đăng ký",
  "in",
  // English action verbs
  "create",
  "read",
  "update",
  "delete",
  "edit",
  "add",
  "remove",
  "view",
  "show",
  "search",
  "filter",
  "find",
  "track",
  "login",
  "logout",
  "register",
  "manage",
  "configure",
  "set",
  "send",
  "receive",
  "share",
  "export",
  "import",
  "download",
  "upload",
  "select",
  "order",
  "buy",
  "pay",
  "checkout",
  "approve",
  "reject",
  "confirm",
  "print",
  "generate",
  "modify",
  "change",
  "save",
  "store",
  "enter",
  "input",
  "cancel",
  "submit",
  "assign",
  "transfer",
  "refund",
  "activate",
  "lock",
  "unlock",
  "sign in",
  "sign up",
  "sign out",
  "log in",
  "log out",
  "list",
  "browse",
];
// vi-keep-end

// Regex kiểm tra từ mơ hồ với Unicode boundary an toàn (không dùng \b với tiếng Việt)
function findAmbiguous(text: string): string[] {
  const norm = text.normalize("NFC").toLowerCase();
  const matched: string[] = [];
  for (const w of AMBIGUOUS_WORDS) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<=^|[^\\p{L}\\p{N}_])${escaped}(?=[^\\p{L}\\p{N}_]|$)`, "u");
    if (re.test(norm)) {
      matched.push(w);
    }
  }
  return matched;
}

// Tách các user story từ văn bản
export function splitStories(text: string): string[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const stories: string[] = [];
  let current: string[] = [];

  const isMarkerLine = (line: string) => /^\s*(?:[-*•]|\d+[\.\)])\s+/.test(line);
  const hasMarkerLines = lines.some(isMarkerLine);

  if (hasMarkerLines) {
    for (const line of lines) {
      if (isMarkerLine(line)) {
        if (current.length > 0) {
          const s = current.join(" ").trim();
          if (s) stories.push(s);
          current = [];
        }
        const stripped = line.replace(/^\s*(?:[-*•]|\d+[\.\)])\s+/, "").trim();
        if (stripped) current.push(stripped);
      } else if (line.trim() === "") {
        if (current.length > 0) {
          const s = current.join(" ").trim();
          if (s) stories.push(s);
          current = [];
        }
      } else {
        current.push(line.trim());
      }
    }
    if (current.length > 0) {
      const s = current.join(" ").trim();
      if (s) stories.push(s);
    }
  } else {
    const paras = text.split(/\r?\n\s*\r?\n/);
    for (const p of paras) {
      const subLines = p
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (subLines.length > 1) {
        const allLookLikeStories = subLines.every(
          (l) =>
            /^(?:as\s+an?|với\s+tư\s+cách(?:\s+là)?|là(?:\s+một)?|cho\s+phép)\b/i.test(l.normalize("NFC")) || // vi-keep: nhận diện story tiếng Việt cũ
            l.split(/\s+/).length >= 4,
        );
        if (allLookLikeStories) {
          for (const sl of subLines) {
            stories.push(sl);
          }
          continue;
        }
      }
      const s = p.replace(/\s+/g, " ").trim();
      if (s) stories.push(s);
    }
  }

  // Mỗi câu bắt đầu bằng "As a" hay "Là" (UC-28 bước 2) là một story, kể cả khi viết liền trên một dòng.
  return stories.flatMap(splitSentences).filter((s) => s.length > 0);
}

// Ranh giới câu ngay trước "As a/an", "Là", "Với tư cách" viết hoa (giữa câu không viết hoa nên không bị tách nhầm).
const SENTENCE_STORY_START = /(?<=[.!?])\s+(?=(?:As\s+an?|Là|Với\s+tư\s+cách)\s)/u; // vi-keep: nhận diện story tiếng Việt cũ
function splitSentences(story: string): string[] {
  return story
    .normalize("NFC")
    .split(SENTENCE_STORY_START)
    .map((s) => s.trim());
}

// Phân tích cấu trúc User Story (English + Tiếng Việt)
export function parseStory(rawText: string): ParsedStory {
  const norm = rawText.normalize("NFC").toLowerCase();

  const roleStarter = /^(?:as\s+an?|với\s+tư\s+cách(?:\s+là)?|là(?:\s+một)?)\s+/u; // vi-keep: khuôn mẫu story tiếng Việt cũ
  const roleMatch = norm.match(roleStarter);
  if (!roleMatch) {
    return { isTemplate: false, template: "free" };
  }

  const afterRolePrefix = norm.slice(roleMatch[0].length);
  const meansStarter = /[,;\s]+(?:i\s+want|tôi\s+muốn)\s+/u; // vi-keep: khuôn mẫu story tiếng Việt cũ
  const meansMatch = afterRolePrefix.match(meansStarter);
  if (!meansMatch || meansMatch.index === undefined) {
    return { isTemplate: false, template: "free" };
  }
  // Khuôn mẫu xác định theo cụm mở đầu vai trò ("As a" hay "Là"/"Với tư cách là").
  const template: StoryTemplate = roleMatch[0].startsWith("as") ? "en" : "vi";

  const role = afterRolePrefix.slice(0, meansMatch.index).trim();
  const afterMeansPrefix = afterRolePrefix.slice(meansMatch.index + meansMatch[0].length);

  const endStarter = /(?:^|[,;\s]+)(?:so\s+that|để)\s+/u; // vi-keep: khuôn mẫu story tiếng Việt cũ
  const endMatch = afterMeansPrefix.match(endStarter);

  let means = "";
  let end: string | undefined = undefined;

  if (endMatch && endMatch.index !== undefined) {
    means = afterMeansPrefix.slice(0, endMatch.index).trim();
    end = afterMeansPrefix.slice(endMatch.index + endMatch[0].length).trim();
  } else {
    means = afterMeansPrefix.trim();
  }

  // Cần có cả role và means không rỗng
  if (!role || !means) {
    return { role, means, end, isTemplate: false, template: "free" };
  }

  return { role, means, end, isTemplate: true, template };
}

// Kiểm tra phần means có nhiều hành động nối bằng và / and / ; – trả về đoạn chữ nối (FN-55), không vi phạm thì null.
function checkAtomic(means: string): string | null {
  if (!means) return null;
  if (means.includes(";")) return ";";

  const verbsPattern = ACTION_VERBS.join("|");
  // vi-keep: từ nối tiếng Việt song song tiếng Anh
  const re = new RegExp(`(?:và|and)\\s+(?:có\\s+thể\\s+|can\\s+|also\\s+)?(?:${verbsPattern})(?=[^\\p{L}\\p{N}_]|$)`, "u");
  const m = means.match(re);
  if (m) return m[0];

  // vi-keep: từ nối tiếng Việt song song tiếng Anh
  const reDongThoi = new RegExp(`(?:đồng\\s+thời|cũng\\s+như|as\\s+well\\s+as)\\s+(?:${verbsPattern})(?=[^\\p{L}\\p{N}_]|$)`, "u");
  const m2 = means.match(reDongThoi);
  if (m2) return m2[0];

  return null;
}

// Kiểm tra ghi chú dài trong ngoặc hoặc chứa các từ ví dụ, lưu ý, e.g., note: – trả về đoạn chữ gây lỗi (FN-55), không vi phạm thì null.
function checkMinimal(text: string): string | null {
  const norm = text.normalize("NFC").toLowerCase();
  const note = norm.match(/(?:ví\s+dụ|lưu\s+ý|e\.g\.|note:|for\s+example|for\s+instance)/u); // vi-keep: từ khoá ghi chú tiếng Việt song song tiếng Anh
  if (note) return note[0];
  const parenMatches = norm.match(/\(([^)]+)\)/g);
  if (parenMatches) {
    for (const pm of parenMatches) {
      const inner = pm.slice(1, -1).trim();
      if (inner.length >= 15 || inner.split(/\s+/).length >= 4) {
        return pm;
      }
    }
  }
  return null;
}

// Từ khung của khuôn mẫu story: bỏ đi khi so trùng để chỉ so phần nội dung (G1).
const TEMPLATE_WORDS = new Set(["as", "a", "an", "i", "want", "to", "so", "that", "là", "một", "tôi", "muốn", "để", "với", "tư", "cách"]); // vi-keep: từ khung khuôn mẫu tiếng Việt

// Chuẩn hoá và tách từ cho độ đo Jaccard: NFC, chữ thường, bỏ dấu câu, bỏ từ khung khuôn mẫu.
export function extractWords(text: string): Set<string> {
  const norm = text.normalize("NFC").toLowerCase();
  const cleaned = norm.replace(/[^\p{L}\p{N}_\s]/gu, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0 && !TEMPLATE_WORDS.has(t));
  return new Set(tokens);
}

// Độ tương đồng Jaccard giữa hai tập từ
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersectionSize = 0;
  for (const item of a) {
    if (b.has(item)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}


function penaltyOf(issues: QusIssue[]): number {
  let penalty = 0;
  for (const issue of issues) {
    if (issue.severity === "error") penalty += PENALTY_ERROR;
    else if (issue.severity === "warn") penalty += PENALTY_WARN;
    else penalty += PENALTY_INFO;
  }
  return penalty;
}

// Điểm một story (G4, FN-52): 100 − 30/error − 15/warn − 5/info, thấp nhất 0.
export function storyScore(issues: QusIssue[]): number {
  return Math.max(0, BASE_SCORE - penaltyOf(issues));
}

const TEMPLATE_LABEL: Record<StoryTemplate, string> = {
  en: '"As a… I want… so that…"',
  vi: 'Vietnamese "Là… tôi muốn… để…"', // vi-keep: tên khuôn mẫu story tiếng Việt (chỉ hiện khi story cũ viết tiếng Việt)
  free: "free-form text",
};

// Khuôn mẫu chiếm đa số trong module (G2): chỉ xét 2 khuôn mẫu chuẩn "As a…" (en) và "Là…" (vi), hoà thì lấy
// khuôn mẫu xuất hiện trước. Không story nào theo khuôn mẫu chuẩn thì trả null (bỏ qua NOT_UNIFORM).
function majorityTemplate(parsed: ParsedStory[]): StoryTemplate | null {
  const std = parsed.filter((p) => p.template !== "free");
  if (std.length === 0) return null;
  const en = std.filter((p) => p.template === "en").length;
  const vi = std.length - en;
  return en === vi ? std[0].template : en > vi ? "en" : "vi";
}

// Chấm chất lượng toàn bộ danh sách User Stories.
// options.others: story của các module khác trong cùng dự án, để bắt trùng chéo module (G1).
export function scoreStories(text: string, options: ScoreOptions = {}): QusResult {
  return scoreTexts(splitStories(text), options);
}

interface TextExtras {
  /** Lỗi bổ sung cho từng story (vd tiêu chí chấp nhận), cộng vào trước khi tính điểm. */
  extra?: QusIssue[][];
  /** Nhãn dùng trong thông báo trùng (mặc định "#<số thứ tự>"). */
  labels?: string[];
  ids?: (string | undefined)[];
  codes?: (string | undefined)[];
}

// Lõi chấm điểm trên danh sách câu story đã tách sẵn (dùng chung cho văn bản tự do và story có cấu trúc).
function scoreTexts(rawStories: string[], options: ScoreOptions = {}, ex: TextExtras = {}): QusResult {
  if (rawStories.length === 0) {
    return { stories: [], total: 0 };
  }
  const label = (i: number) => ex.labels?.[i] ?? `#${i + 1}`;

  const parsedList = rawStories.map(parseStory);
  const issuesList: QusIssue[][] = rawStories.map((raw, idx) => {
    const issues: QusIssue[] = [];
    const words = raw.trim().split(/\s+/).filter(Boolean);
    const parsed = parsedList[idx];

    // FULL_SENTENCE: dưới 4 từ
    if (words.length < 4) {
      issues.push({
        code: "FULL_SENTENCE",
        severity: "warn",
        message: `Story is too short (${words.length} words); a well-formed story needs at least 4 words.`,
        suggestion: "Add the user role, the action and the goal so the sentence has at least 4 words.",
      });
    }

    // WELL_FORMED: thiếu vai trò hoặc thiếu hành động
    if (!parsed.isTemplate) {
      issues.push({
        code: "WELL_FORMED",
        severity: "error",
        message: "Story is missing the role or the action (means) of the standard template.",
        suggestion: "Use the template: 'As a <role>, I want <action> so that <benefit>'.",
      });
    } else {
      // NO_END: có role và means nhưng thiếu mục đích
      if (!parsed.end || parsed.end.trim().length === 0) {
        issues.push({
          code: "NO_END",
          severity: "warn",
          message: "Story is missing the goal or business value (end).",
          suggestion: "Add 'so that <benefit>' to make the delivered value explicit.",
        });
      }

      // ATOMIC: phần means có nhiều hành động nối bằng và / and / ;
      const atomic = parsed.means ? checkAtomic(parsed.means) : null;
      if (atomic) {
        issues.push({
          code: "ATOMIC",
          severity: "warn",
          message: `The action part (means) contains more than one action, joined by "${atomic}".`,
          suggestion: "Split it into separate user stories, one per action, so each story is atomic.",
          excerpt: atomic,
        });
      }
    }

    // MINIMAL: ghi chú dài trong ngoặc hoặc ví dụ, lưu ý
    const minimal = checkMinimal(raw);
    if (minimal) {
      issues.push({
        code: "MINIMAL",
        severity: "info",
        message: `Story contains notes, examples or extra detail: "${minimal}".`,
        suggestion: "Move detailed notes and examples into the Acceptance Criteria.",
        excerpt: minimal,
      });
    }

    // AMBIGUOUS: chứa từ ngữ mơ hồ
    const ambiguous = findAmbiguous(raw);
    if (ambiguous.length > 0) {
      const wordsStr = ambiguous.join(", ");
      issues.push({
        code: "AMBIGUOUS",
        severity: "warn",
        message: `Story contains ambiguous terms: "${wordsStr}".`,
        suggestion: `Replace "${wordsStr}" with a measurable criterion, e.g. "≤ 2 seconds" or "at most 3 steps".`,
        excerpt: wordsStr,
      });
    }
    return issues;
  });

  // DUPLICATE (G1): so với các story đứng trước trong cùng module, rồi với story của module khác cùng dự án.
  // Chỉ gắn lỗi cho story đứng sau để một cặp trùng không bị trừ điểm hai lần.
  const wordSets = rawStories.map(extractWords);
  const others = (options.others ?? []).flatMap((o) =>
    (o.stories ?? splitStories(o.text ?? "")).map((t) => ({ moduleName: o.moduleName, words: extractWords(t) })),
  );
  for (let j = 0; j < rawStories.length; j++) {
    let dupMessage: string | null = null;
    let dupSuggestion = "";
    for (let i = 0; i < j && !dupMessage; i++) {
      const sim = jaccardSimilarity(wordSets[i], wordSets[j]);
      if (sim >= DUPLICATE_THRESHOLD) {
        dupMessage = `Duplicates story ${label(i)} in this module (similarity ${Math.round(sim * 100)}%).`;
        dupSuggestion = `Merge stories ${label(i)} and ${label(j)}, or remove one of them.`;
      }
    }
    for (const o of others) {
      if (dupMessage) break;
      const sim = jaccardSimilarity(o.words, wordSets[j]);
      if (sim >= DUPLICATE_THRESHOLD) {
        dupMessage = `Duplicates a story in module "${o.moduleName}" (similarity ${Math.round(sim * 100)}%).`;
        dupSuggestion = `Review the scope: should this story belong to the current module or to module "${o.moduleName}"?`;
      }
    }
    if (dupMessage) issuesList[j].push({ code: "DUPLICATE", severity: "warn", message: dupMessage, suggestion: dupSuggestion });
  }

  // NOT_UNIFORM (G2): story lệch khuôn mẫu chiếm đa số nhận mức info. Module chỉ có 1 story thì bỏ qua.
  const majority = rawStories.length > 1 ? majorityTemplate(parsedList) : null;
  if (majority) {
    parsedList.forEach((p, idx) => {
      if (p.template !== majority) {
        issuesList[idx].push({
          code: "NOT_UNIFORM",
          severity: "info",
          message: `Story uses the ${TEMPLATE_LABEL[p.template]} template, unlike most stories in this module (${TEMPLATE_LABEL[majority]}).`,
          suggestion: `Rewrite it using the ${TEMPLATE_LABEL[majority]} template so the whole module is uniform.`,
        });
      }
    });
  }

  // Điểm story (G4): 100 − 30/error − 15/warn − 5/info, thấp nhất 0. Điểm module = trung bình cộng.
  ex.extra?.forEach((list, idx) => issuesList[idx]?.push(...list));
  const stories: StoryScore[] = rawStories.map((raw, idx) => ({
    index: idx + 1,
    ...(ex.ids?.[idx] ? { id: ex.ids[idx] } : {}),
    ...(ex.codes?.[idx] ? { code: ex.codes[idx] } : {}),
    text: raw,
    score: storyScore(issuesList[idx]),
    issues: issuesList[idx],
  }));
  const total = Math.round(stories.reduce((acc, s) => acc + s.score, 0) / stories.length);

  return { stories, total };
}

// =============================================================== Đợt 5 – user story có cấu trúc (C4)

/** Story có cấu trúc (bảng user_stories): vai trò / mong muốn / lợi ích + tiêu chí chấp nhận. */
export interface StructuredStory {
  id?: string;
  code?: string;
  asA?: string;
  iWant?: string;
  soThat?: string;
  acceptanceCriteria?: string[];
}

// vi-keep-start: cụm mở đầu khuôn mẫu story tiếng Việt cũ, song song tiếng Anh
const ROLE_PREFIX = /^(?:as\s+an?|với\s+tư\s+cách(?:\s+là)?|là(?:\s+một)?)\s+/iu;
const MEANS_PREFIX = /^(?:i\s+want|tôi\s+muốn)\s+/iu;
const END_PREFIX = /^(?:so\s+that|để)\s+/iu;
// vi-keep-end
// Bỏ cụm mở đầu BA lỡ gõ lại trong ô (vd "As a Khách hàng" trong ô vai trò) và dấu câu cuối.
const cleanPart = (v: string | undefined, prefix: RegExp) =>
  (v ?? "").normalize("NFC").trim().replace(prefix, "").replace(/[\s,;.]+$/u, "").trim();

/** true khi cả 3 phần đều trống (dòng mới chưa nhập) – không chấm, không đưa vào AI. */
export const isBlankStructured = (s: StructuredStory) => !cleanPart(s.asA, ROLE_PREFIX) && !cleanPart(s.iWant, MEANS_PREFIX) && !cleanPart(s.soThat, END_PREFIX);

/**
 * Ghép story có cấu trúc thành câu "As a X, I want Y, so that Z." để chấm QUS / đưa cho AI.
 * Thiếu phần nào thì bỏ phần đó (thiếu vai trò → câu bắt đầu bằng "I want" → bị WELL_FORMED). Trống hết → "".
 */
export function storySentence(s: StructuredStory): string {
  const role = cleanPart(s.asA, ROLE_PREFIX);
  const means = cleanPart(s.iWant, MEANS_PREFIX);
  const end = cleanPart(s.soThat, END_PREFIX);
  const parts = [role && `As a ${role}`, means && `I want ${means}`, end && `so that ${end}`].filter(Boolean);
  return parts.length ? parts.join(", ") + "." : "";
}

/** Lỗi riêng của tiêu chí chấp nhận: chưa có tiêu chí (gợi ý), tiêu chí chứa từ mơ hồ (cảnh báo, gộp một lỗi). */
function criteriaIssues(criteria: string[]): QusIssue[] {
  const list = criteria.map((c) => c.trim()).filter(Boolean);
  if (!list.length) {
    return [
      {
        code: "NO_CRITERIA",
        severity: "info",
        message: "Story has no acceptance criteria.",
        suggestion: "Add at least one verifiable criterion, e.g. \"Shows at most 20 orders, newest first\".",
      },
    ];
  }
  const hits = list.flatMap((c, i) => findAmbiguous(c).map((w) => ({ w, i })));
  if (!hits.length) return [];
  const words = [...new Set(hits.map((h) => h.w))].join(", ");
  const rows = [...new Set(hits.map((h) => h.i + 1))].join(", ");
  return [
    {
      code: "AMBIGUOUS",
      severity: "warn",
      message: `Acceptance criteria (line ${rows}) contain ambiguous terms: "${words}".`,
      suggestion: `Replace "${words}" with a measurable, testable condition, e.g. "≤ 2 seconds".`,
      excerpt: words,
    },
  ];
}

/**
 * Chấm QUS trên danh sách story có cấu trúc của một module (đợt 5). Mỗi story được ghép thành câu
 * (storySentence) rồi chấm như cũ (G1–G4); cộng thêm lỗi của tiêu chí chấp nhận. Story trống được bỏ qua.
 * Kết quả mỗi story có `id`, `code` để giao diện gắn đúng dòng. Điểm module = trung bình các story được chấm.
 */
export function scoreStructured(stories: StructuredStory[], options: ScoreOptions = {}): QusResult {
  const list = stories.filter((s) => !isBlankStructured(s));
  return scoreTexts(list.map(storySentence), options, {
    extra: list.map((s) => criteriaIssues(s.acceptanceCriteria ?? [])),
    labels: list.map((s, i) => s.code ?? `#${i + 1}`),
    ids: list.map((s) => s.id),
    codes: list.map((s) => s.code),
  });
}
