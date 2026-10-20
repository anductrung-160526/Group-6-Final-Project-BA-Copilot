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
}

export interface StoryScore {
  index: number;
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
  text: string;
}

export interface ScoreOptions {
  others?: OtherModuleStories[];
}

// Ngưỡng Jaccard để coi hai story là trùng (G1).
export const DUPLICATE_THRESHOLD = 0.8;

// Xếp hạng điểm (FN-52): Tốt ≥ 80, Khá 60–79, Cần sửa < 60.
export type QusRating = "good" | "fair" | "poor";
export const RATING_LABEL: Record<QusRating, string> = { good: "Tốt", fair: "Khá", poor: "Cần sửa" };
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

const AMBIGUOUS_WORDS: string[] = [
  "user-friendly",
  "thân thiện",
  "linh hoạt",
  "hiệu quả",
  "dễ dàng",
  "tối ưu",
  "nhanh",
  "tốt",
  "etc",
  "v.v",
  "fast",
  "easy",
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
];

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
            /^(?:as\s+an?|với\s+tư\s+cách(?:\s+là)?|là(?:\s+một)?|cho\s+phép)\b/i.test(l.normalize("NFC")) ||
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

  return stories.filter((s) => s.length > 0);
}

// Phân tích cấu trúc User Story (English + Tiếng Việt)
export function parseStory(rawText: string): ParsedStory {
  const norm = rawText.normalize("NFC").toLowerCase();

  const roleStarter = /^(?:as\s+an?|với\s+tư\s+cách(?:\s+là)?|là(?:\s+một)?)\s+/u;
  const roleMatch = norm.match(roleStarter);
  if (!roleMatch) {
    return { isTemplate: false, template: "free" };
  }

  const afterRolePrefix = norm.slice(roleMatch[0].length);
  const meansStarter = /[,;\s]+(?:i\s+want|tôi\s+muốn)\s+/u;
  const meansMatch = afterRolePrefix.match(meansStarter);
  if (!meansMatch || meansMatch.index === undefined) {
    return { isTemplate: false, template: "free" };
  }
  // Khuôn mẫu xác định theo cụm mở đầu vai trò ("As a" hay "Là"/"Với tư cách là").
  const template: StoryTemplate = roleMatch[0].startsWith("as") ? "en" : "vi";

  const role = afterRolePrefix.slice(0, meansMatch.index).trim();
  const afterMeansPrefix = afterRolePrefix.slice(meansMatch.index + meansMatch[0].length);

  const endStarter = /(?:^|[,;\s]+)(?:so\s+that|để)\s+/u;
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

// Kiểm tra phần means có nhiều hành động nối bằng và / and / ;
function checkAtomic(means: string): boolean {
  if (!means) return false;
  if (means.includes(";")) return true;

  const verbsPattern = ACTION_VERBS.join("|");
  const re = new RegExp(`(?:,\\s*)?(?:và|and)\\s+(?:có\\s+thể\\s+)?(?:${verbsPattern})(?=[^\\p{L}\\p{N}_]|$)`, "u");
  if (re.test(means)) return true;

  const reDongThoi = new RegExp(`(?:đồng\\s+thời|cũng\\s+như)\\s+(?:${verbsPattern})(?=[^\\p{L}\\p{N}_]|$)`, "u");
  if (reDongThoi.test(means)) return true;

  return false;
}

// Kiểm tra ghi chú dài trong ngoặc hoặc chứa các từ ví dụ, lưu ý, e.g., note:
function checkMinimal(text: string): boolean {
  const norm = text.normalize("NFC").toLowerCase();
  if (/(?:ví\s+dụ|lưu\s+ý|e\.g\.|note:)/u.test(norm)) {
    return true;
  }
  const parenMatches = norm.match(/\(([^)]+)\)/g);
  if (parenMatches) {
    for (const pm of parenMatches) {
      const inner = pm.slice(1, -1).trim();
      if (inner.length >= 15 || inner.split(/\s+/).length >= 4) {
        return true;
      }
    }
  }
  return false;
}

// Từ khung của khuôn mẫu story: bỏ đi khi so trùng để chỉ so phần nội dung (G1).
const TEMPLATE_WORDS = new Set(["as", "a", "an", "i", "want", "to", "so", "that", "là", "một", "tôi", "muốn", "để", "với", "tư", "cách"]);

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

const TEMPLATE_LABEL: Record<StoryTemplate, string> = {
  en: '"As a… I want… so that…"',
  vi: '"Là… tôi muốn… để…"',
  free: "viết tự do",
};

// Khuôn mẫu chiếm đa số trong module (G2). Hoà thì ưu tiên khuôn mẫu chuẩn (en, vi) rồi đến khuôn mẫu xuất hiện trước.
function majorityTemplate(parsed: ParsedStory[]): StoryTemplate {
  const count = new Map<StoryTemplate, number>();
  for (const p of parsed) count.set(p.template, (count.get(p.template) ?? 0) + 1);
  let best: StoryTemplate = parsed[0].template;
  for (const p of parsed) {
    const c = count.get(p.template)!;
    const b = count.get(best)!;
    if (c > b || (c === b && best === "free" && p.template !== "free")) best = p.template;
  }
  return best;
}

// Chấm chất lượng toàn bộ danh sách User Stories.
// options.others: story của các module khác trong cùng dự án, để bắt trùng chéo module (G1).
export function scoreStories(text: string, options: ScoreOptions = {}): QusResult {
  const rawStories = splitStories(text);
  if (rawStories.length === 0) {
    return { stories: [], total: 0 };
  }

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
        message: `Story quá ngắn (${words.length} từ), chưa đủ cấu trúc tối thiểu 4 từ.`,
        suggestion: "Bổ sung thông tin người dùng, hành động và mục đích để câu có tối thiểu 4 từ.",
      });
    }

    // WELL_FORMED: thiếu vai trò hoặc thiếu hành động
    if (!parsed.isTemplate) {
      issues.push({
        code: "WELL_FORMED",
        severity: "error",
        message: "Story thiếu vai trò hoặc thiếu hành động (means) theo cấu trúc chuẩn.",
        suggestion: "Viết theo mẫu: 'As a <vai trò>, I want <hành động> so that <mục đích>' hoặc 'Là một <vai trò>, tôi muốn <hành động> để <mục đích>'.",
      });
    } else {
      // NO_END: có role và means nhưng thiếu mục đích
      if (!parsed.end || parsed.end.trim().length === 0) {
        issues.push({
          code: "NO_END",
          severity: "warn",
          message: "Story thiếu mục đích hoặc giá trị kinh doanh (end).",
          suggestion: "Bổ sung 'so that <mục đích>' hoặc 'để <mục đích>' để làm rõ giá trị mang lại.",
        });
      }

      // ATOMIC: phần means có nhiều hành động nối bằng và / and / ;
      if (parsed.means && checkAtomic(parsed.means)) {
        issues.push({
          code: "ATOMIC",
          severity: "warn",
          message: "Phần hành động (means) chứa nhiều hành động nối bằng 'và', 'and' hoặc ';'.",
          suggestion: "Tách thành các user story riêng biệt cho từng hành động để đảm bảo tính độc lập (atomic).",
        });
      }
    }

    // MINIMAL: ghi chú dài trong ngoặc hoặc ví dụ, lưu ý
    if (checkMinimal(raw)) {
      issues.push({
        code: "MINIMAL",
        severity: "info",
        message: "Story chứa ghi chú, ví dụ hoặc chi tiết phụ trong ngoặc đơn.",
        suggestion: "Chuyển các ghi chú chi tiết hoặc ví dụ vào Acceptance Criteria (tiêu chí nghiệm thu).",
      });
    }

    // AMBIGUOUS: chứa từ ngữ mơ hồ
    const ambiguous = findAmbiguous(raw);
    if (ambiguous.length > 0) {
      const wordsStr = ambiguous.join(", ");
      issues.push({
        code: "AMBIGUOUS",
        severity: "warn",
        message: `Story chứa từ ngữ mơ hồ: "${wordsStr}".`,
        suggestion: `Thay thế "${wordsStr}" bằng tiêu chí cụ thể có thể đo lường hoặc kiểm thử được.`,
      });
    }
    return issues;
  });

  // DUPLICATE (G1): so với các story đứng trước trong cùng module, rồi với story của module khác cùng dự án.
  // Chỉ gắn lỗi cho story đứng sau để một cặp trùng không bị trừ điểm hai lần.
  const wordSets = rawStories.map(extractWords);
  const others = (options.others ?? []).flatMap((o) =>
    splitStories(o.text).map((t) => ({ moduleName: o.moduleName, words: extractWords(t) })),
  );
  for (let j = 0; j < rawStories.length; j++) {
    let dupMessage: string | null = null;
    let dupSuggestion = "";
    for (let i = 0; i < j && !dupMessage; i++) {
      const sim = jaccardSimilarity(wordSets[i], wordSets[j]);
      if (sim >= DUPLICATE_THRESHOLD) {
        dupMessage = `Trùng nội dung với story #${i + 1} trong module (độ tương đồng ${Math.round(sim * 100)}%).`;
        dupSuggestion = `Gộp hoặc bỏ một trong hai story #${i + 1} và #${j + 1}.`;
      }
    }
    for (const o of others) {
      if (dupMessage) break;
      const sim = jaccardSimilarity(o.words, wordSets[j]);
      if (sim >= DUPLICATE_THRESHOLD) {
        dupMessage = `Trùng nội dung với một story của module "${o.moduleName}" (độ tương đồng ${Math.round(sim * 100)}%).`;
        dupSuggestion = `Kiểm tra lại phạm vi: story này nên thuộc module hiện tại hay module "${o.moduleName}".`;
      }
    }
    if (dupMessage) issuesList[j].push({ code: "DUPLICATE", severity: "warn", message: dupMessage, suggestion: dupSuggestion });
  }

  // NOT_UNIFORM (G2): story lệch khuôn mẫu chiếm đa số nhận mức info. Module chỉ có 1 story thì bỏ qua.
  if (rawStories.length > 1) {
    const majority = majorityTemplate(parsedList);
    parsedList.forEach((p, idx) => {
      if (p.template !== majority) {
        issuesList[idx].push({
          code: "NOT_UNIFORM",
          severity: "info",
          message: `Story viết theo khuôn mẫu ${TEMPLATE_LABEL[p.template]}, khác khuôn mẫu chiếm đa số trong module (${TEMPLATE_LABEL[majority]}).`,
          suggestion: `Viết lại theo khuôn mẫu ${TEMPLATE_LABEL[majority]} để cả module đồng nhất.`,
        });
      }
    });
  }

  // Điểm story (G4): 100 − 30/error − 15/warn − 5/info, thấp nhất 0. Điểm module = trung bình cộng.
  const stories: StoryScore[] = rawStories.map((raw, idx) => ({
    index: idx + 1,
    text: raw,
    score: Math.max(0, BASE_SCORE - penaltyOf(issuesList[idx])),
    issues: issuesList[idx],
  }));
  const total = Math.round(stories.reduce((acc, s) => acc + s.score, 0) / stories.length);

  return { stories, total };
}
