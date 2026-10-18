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
  setIssues: QusIssue[];
}

interface ParsedStory {
  role?: string;
  means?: string;
  end?: string;
  isTemplate: boolean;
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
function parseStory(rawText: string): ParsedStory {
  const norm = rawText.normalize("NFC").toLowerCase();

  const roleStarter = /^(?:as\s+an?|với\s+tư\s+cách(?:\s+là)?|là(?:\s+một)?)\s+/u;
  const roleMatch = norm.match(roleStarter);
  if (!roleMatch) {
    return { isTemplate: false };
  }

  const afterRolePrefix = norm.slice(roleMatch[0].length);
  const meansStarter = /[,;\s]+(?:i\s+want|tôi\s+muốn)\s+/u;
  const meansMatch = afterRolePrefix.match(meansStarter);
  if (!meansMatch || meansMatch.index === undefined) {
    return { isTemplate: false };
  }

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
    return { role, means, end, isTemplate: false };
  }

  return { role, means, end, isTemplate: true };
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

// Tokenize từ ngữ cho độ đo Jaccard
function extractWords(text: string): Set<string> {
  const norm = text.normalize("NFC").toLowerCase();
  const cleaned = norm.replace(/[^\p{L}\p{N}_\s]/gu, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  return new Set(tokens);
}

// Độ tương đồng Jaccard giữa hai tập từ
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersectionSize = 0;
  for (const item of a) {
    if (b.has(item)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// Chấm chất lượng toàn bộ danh sách User Stories
export function scoreStories(text: string): QusResult {
  const rawStories = splitStories(text);
  if (rawStories.length === 0) {
    return {
      stories: [],
      total: 0,
      setIssues: [],
    };
  }

  const stories: StoryScore[] = [];
  const parsedList: ParsedStory[] = [];

  rawStories.forEach((raw, idx) => {
    const issues: QusIssue[] = [];
    const words = raw.trim().split(/\s+/).filter(Boolean);

    // FULL_SENTENCE: dưới 4 từ
    if (words.length < 4) {
      issues.push({
        code: "FULL_SENTENCE",
        severity: "warn",
        message: `Story quá ngắn (${words.length} từ), chưa đủ cấu trúc tối thiểu 4 từ.`,
        suggestion: "Bổ sung thông tin người dùng, hành động và mục đích để câu có tối thiểu 4 từ.",
      });
    }

    const parsed = parseStory(raw);
    parsedList.push(parsed);

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

    // Tính điểm của story
    let penalty = 0;
    for (const issue of issues) {
      if (issue.severity === "error") penalty += PENALTY_ERROR;
      else if (issue.severity === "warn") penalty += PENALTY_WARN;
      else if (issue.severity === "info") penalty += PENALTY_INFO;
    }
    const score = Math.max(0, BASE_SCORE - penalty);

    stories.push({
      index: idx + 1,
      text: raw,
      score,
      issues,
    });
  });

  // Đánh giá cấp tập hợp (setIssues)
  const setIssues: QusIssue[] = [];

  // DUPLICATE: Jaccard >= 0.7
  const wordSets = rawStories.map(extractWords);
  for (let i = 0; i < rawStories.length; i++) {
    for (let j = i + 1; j < rawStories.length; j++) {
      const sim = jaccardSimilarity(wordSets[i], wordSets[j]);
      if (sim >= 0.7) {
        setIssues.push({
          code: "DUPLICATE",
          severity: "warn",
          message: `Story #${i + 1} và Story #${j + 1} trùng lặp nội dung cao (Jaccard: ${Math.round(sim * 100)}%).`,
          suggestion: `Gộp hoặc loại bỏ một trong hai story #${i + 1} hoặc #${j + 1} để tránh dư thừa.`,
        });
      }
    }
  }

  // NOT_UNIFORM: lẫn lộn story chuẩn template và story tự do
  const templateCount = parsedList.filter((p) => p.isTemplate).length;
  const freeCount = parsedList.length - templateCount;
  if (templateCount > 0 && freeCount > 0) {
    setIssues.push({
      code: "NOT_UNIFORM",
      severity: "info",
      message: `Tập story không đồng nhất: có ${templateCount} story chuẩn mẫu và ${freeCount} story viết tự do.`,
      suggestion: "Chuẩn hóa tất cả các story về cùng một cấu trúc (VD: Connextra template).",
    });
  }

  const total =
    stories.length === 0 ? 0 : Math.round(stories.reduce((acc, s) => acc + s.score, 0) / stories.length);

  return {
    stories,
    total,
    setIssues,
  };
}
