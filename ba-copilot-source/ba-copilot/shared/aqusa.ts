// Bộ chấm QUS theo AQUSA (Lucassen, Dalpiaz, van der Werf, Brinkkemper 2016 – "Improving agile requirements: the Quality
// User Story framework and tool", Requirements Engineering 21:383–403). Chỉ áp cho story tiếng Anh.
// Phiên bản dùng trong app (tốt nhất khi đánh giá – xem dataset/export/eval/QUS-AQUSA.md):
// - 5 tiêu chí AQUSA v1 (§4): well-formed, atomic, minimal, uniform, unique;
// - 7 cải tiến v2 của bài báo (§6);
// - các luật ngôn ngữ của nhóm (ngoài bài báo), ghi chú "nhóm:" tại chỗ.
// Gán nhãn từ loại bằng wink-nlp thay cho Stanford CoreNLP (lựa chọn của nhóm). Các tiêu chí ngữ nghĩa (conceptually sound,
// problem-oriented, unambiguous, conflict-free…) KHÔNG kiểm ở đây: bài báo loại chúng vì cần hiểu nội dung (§4).
// Hàm thuần, chạy được cả client và server. Mô hình wink-nlp (~3,5 MB) được nạp từ ngoài để không vào bundle app.js:
// server nạp qua shared/nlp-node.ts; trình duyệt tải public/nlp.js khi cần (client/useAqusa.ts). Chưa nạp → qus.ts báo lỗi,
// không chấm thay bằng luật.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nlp = any;
let nlp: Nlp = null;
let its: Nlp;
/** Số từ trong từ điển gốc của mô hình: token có uniqueId từ đây trở lên là từ ngoài từ điển (OOV). */
let vocabSize = 0;
export function setNlp(n: Nlp) {
  nlp = n;
  its = n.its;
  // Mô hình không công khai kích thước từ điển: từ lạ đầu tiên mà bản mô hình mới tạo gặp nhận đúng id = kích thước đó.
  // Bản mô hình đã đọc từ lạ trước đó cho số lớn hơn → kiểm từ lạ chỉ lỏng hơn, không bắt nhầm.
  vocabSize = n.readDoc("qzxqzxqzxq").tokens().out(its.uniqueId)[0];
}
export const nlpReady = () => {
  if (!nlp && (globalThis as { __winkNlp?: Nlp }).__winkNlp) setNlp((globalThis as { __winkNlp?: Nlp }).__winkNlp);
  return !!nlp;
};

export type QusCriterion = "well-formed" | "atomic" | "minimal" | "uniform" | "unique";

export interface AqusaDefect {
  criterion: QusCriterion;
  code: string;
  message: string;
  suggestion: string;
  excerpt?: string;
  /** Mục của bài báo làm căn cứ ("team rule" = luật ngoài bài báo). */
  paperRef: string;
}

export interface Chunks {
  /** Chữ thừa trước cụm chỉ dấu vai trò (vd "[Analytics]", "*"). */
  lead: string;
  roleIndicator?: string;
  role?: string;
  meansIndicator?: string;
  means?: string;
  endsIndicator?: string;
  ends?: string;
}

// Cụm chỉ dấu: v1 "As a", "I want (to)", "so that" (§4.1) cộng các cách viết khác của v2 (§6.1).
const ROLE_IND = ["as an", "as a", "as the", "as"];
const MEANS_IND = ["i want to", "i want", "i don't want to", "i don't want", "i do not want to", "i do not want", "i only want to", "i only want", "i'd like to", "i would like to", "i would like", "i need to", "i need", "i can", "i am able to", "i should be able to", "i want to be able to"];
const ENDS_IND = ["so that", "in order to", "so i can", "so we can", "so as to", "this way", "to be able to", "so"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const longestFirst = (a: string[]) => [...a].sort((x, y) => y.length - x.length);
const indicatorRe = (inds: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(${longestFirst(inds).map(esc).join("|").replace(/ /g, "\\s+")})(?![\\p{L}\\p{N}])`, "iu");

/** Tách story thành vai trò / hành động / lý do theo cụm chỉ dấu (StoryChunker, §4.2). */
export function chunk(text: string): Chunks {
  const t = text.normalize("NFC").trim();
  const out: Chunks = { lead: "" };
  const r = t.match(indicatorRe(ROLE_IND));
  let rest = t;
  if (r && r.index !== undefined) {
    out.lead = t.slice(0, r.index).trim();
    out.roleIndicator = r[1].toLowerCase().replace(/\s+/g, " ");
    rest = t.slice(r.index + r[0].length);
  }
  const m = rest.match(indicatorRe(MEANS_IND));
  if (m && m.index !== undefined) {
    if (out.roleIndicator) out.role = rest.slice(0, m.index).replace(/[\s,;]+$/u, "").trim();
    else out.lead = rest.slice(0, m.index).trim();
    out.meansIndicator = m[1].toLowerCase().replace(/\s+/g, " ");
    rest = rest.slice(m.index + m[0].length);
    const e = rest.match(indicatorRe(ENDS_IND));
    if (e && e.index !== undefined && e.index > 0) {
      out.means = rest.slice(0, e.index).replace(/[\s,;]+$/u, "").trim();
      out.endsIndicator = e[1].toLowerCase().replace(/\s+/g, " ");
      out.ends = rest.slice(e.index + e[0].length).trim();
    } else out.means = rest.trim();
  } else if (out.roleIndicator) out.role = rest.trim();
  return out;
}

// §6.4: động từ hay bị bộ gán nhãn hiểu nhầm thành danh từ trong ngữ cảnh phần mềm.
const VERB_EXCEPTIONS = new Set(["select", "support", "import", "export", "filter", "search", "view", "update", "upload", "download", "edit", "print", "sort", "share", "log", "sign", "access", "manage", "review", "track", "tag", "comment", "rate", "book", "order", "schedule", "post", "list", "copy", "move", "archive", "save", "add", "delete", "remove", "create", "change", "do", "get", "keep", "check", "enter", "browse", "give", "receive", "send"]);

function hasNoun(s: string): boolean {
  const pos = nlp.readDoc(s).tokens().out(its.pos) as string[];
  return pos.some((p) => p === "NOUN" || p === "PROPN" || p === "PRON");
}

// ---------------------------------------------------------------- các bộ phân tích (§4.3)

function wellFormed(c: Chunks): AqusaDefect[] {
  if (!c.roleIndicator || !c.role)
    return [{ criterion: "well-formed", code: "WF_NO_ROLE", message: "The story has no role (\"As a <role>\").", suggestion: "Start with \"As a <role>, …\".", paperRef: "§3.1, §4.3" }];
  if (!c.meansIndicator || !c.means)
    return [{ criterion: "well-formed", code: "WF_NO_MEANS", message: "The story has no means (\"I want <action>\").", suggestion: "Add \"I want <action>\".", paperRef: "§3.1, §4.3" }];
  // nhóm: vai trò phải chứa danh từ (chỉ một loại người dùng).
  if (!hasNoun(c.role))
    return [{ criterion: "well-formed", code: "WF_ROLE_CONTENT", message: `The role "${c.role}" contains no noun.`, suggestion: "Name a user type, e.g. \"As a store manager\".", excerpt: c.role, paperRef: "team rule (not in the paper)" }];
  return [];
}

// nhóm: mỗi phần (vai trò / hành động / lý do) phải là tiếng Anh đọc được. AQUSA chỉ kiểm cú pháp, nên "As a asdf, I want
// qwer, so that zxcv" qua hết (bộ gán nhãn coi từ lạ là danh từ). Một từ được coi là biết khi nó, dạng gốc (lemma) hoặc gốc
// từ (stem) do mô hình sinh có trong từ điển của mô hình, hoặc tách được thành các từ có trong từ điển ("VisualDesigner",
// "corporatesponsor", "non-existent"). Bỏ qua viết tắt viết hoa, từ có chữ số và từ rút gọn (I'm). Từ 1 chữ cái chỉ biết
// "a" / "I", từ 2 chữ cái phải có trong từ điển – để "As a j, I want j, so that j" hay "kk" không còn lọt.
// Một phần bị coi là không đọc được khi hơn nửa số từ là từ lạ. Đo trên 671 story thật (dataset/qus-eval): chỉ bắt nhầm
// "admin" – từ điển bản lite thiếu một số từ phần mềm, bổ sung ở SOFTWARE_TERMS.
const SOFTWARE_TERMS = new Set(["admin", "admins", "superuser", "dev", "devops", "app", "apps", "frontend", "backend", "plugin", "plugins", "json", "csv", "api", "apis", "ui", "ux", "analytics", "onboard", "onboarding", "checkin", "checkout", "iframe", "unpublish", "undelete", "embeddable", "stats", "login", "logout", "signup", "username", "email", "emails", "dashboard", "chatbot", "webhook", "sync", "inbox", "url", "urls", "faq", "otp", "sms", "pdf", "crm", "erp", "sku", "kpi", "todo", "workflow", "timestamp", "metadata", "config", "repo", "backlog", "kanban", "scrum", "sprint", "wishlist", "e-commerce", "ecommerce"]);

function inVocab(w: string): boolean {
  const ids = nlp.readDoc(w).tokens().out(its.uniqueId) as number[];
  return ids.length === 1 && ids[0] < vocabSize;
}

// Tách từ dính liền thành tối đa 3 từ có trong từ điển, mỗi từ ≥ 3 chữ cái ("corporatesponsor" = corporate + sponsor).
function segmentable(w: string, depth = 0): boolean {
  if (depth > 2 || w.length > 30) return false;
  for (let i = 3; i <= w.length - 3; i++) if (inVocab(w.slice(0, i)) && (inVocab(w.slice(i)) || segmentable(w.slice(i), depth + 1))) return true;
  return false;
}

function knownPiece(piece: string): boolean {
  const w = piece.toLowerCase();
  if (w.length === 1) return w === "a" || w === "i";
  if (SOFTWARE_TERMS.has(w) || inVocab(w)) return true;
  if (w.length < 3) return false;
  const t = nlp.readDoc(w).tokens();
  const lemma = (t.out(its.lemma) as string[])[0];
  const stem = (t.out(its.stem) as string[])[0];
  return (!!lemma && inVocab(lemma)) || (!!stem && inVocab(stem)) || segmentable(w);
}

/** Các từ lạ (không có trong từ điển của mô hình) trong một phần của story, và số từ đã xét. */
export function unknownWords(part: string): { words: number; unknown: string[] } {
  const t = nlp.readDoc(part).tokens();
  const vals = t.out(its.value) as string[];
  const types = t.out(its.type) as string[];
  // chữ cái đơn ngay sau số là đơn vị ("2 s", "5 m"), không xét
  const words = vals.filter((w, i) => types[i] === "word" && !/\d|['’]|[A-Z]{2}/.test(w) && !(w.length === 1 && types[i - 1] === "number"));
  const unknown = words.filter((w) => !SOFTWARE_TERMS.has(w.toLowerCase()) && !w.split(/-|(?<=[a-z])(?=[A-Z])/).every(knownPiece));
  return { words: words.length, unknown };
}

const PART_LABEL = { role: "role (As a)", means: "goal (I want)", ends: "benefit (So that)" } as const;

function readable(c: Chunks): AqusaDefect[] {
  const out: AqusaDefect[] = [];
  for (const k of ["role", "means", "ends"] as const) {
    const part = c[k]?.replace(/[\s.!?]+$/u, "");
    if (!part) continue;
    const r = unknownWords(part);
    if (r.words > 0 && r.unknown.length * 2 > r.words)
      out.push({ criterion: "well-formed", code: "WF_UNREADABLE", message: `The ${PART_LABEL[k]} "${part.slice(0, 60)}" is not recognisable English (unknown words: ${r.unknown.slice(0, 5).join(", ")}).`, suggestion: "Write it in plain English words, or check the spelling.", excerpt: r.unknown.join(" "), paperRef: "team rule (not in the paper)" });
  }
  return out;
}

// Liên từ trong phần hành động nối hai vế đều là cụm động từ (§4.3, §6.3 "/" ">" , §6.4 ngoại lệ động từ).
// nhóm: gán nhãn trên cả câu "I want to <means>" để có ngữ cảnh; vế sau phải MỞ ĐẦU bằng động từ ("update my info and the type
// of material I accept" không tính); bỏ qua liên từ trong mệnh đề phụ ("codes that reflect … and provide"); "/" chỉ tính khi nối
// hai động từ kề nhau và không đứng sau mạo từ/tính từ ("a custom query/report"); "+" dính chữ ("ZIP+4", "C++") không phải liên từ.
const CONJ = new Set(["and", "or", "/", "\\", ">"]);
const SKIP = new Set(["to", "also", "then", "can", "be", "able", "directly"]);
const SUB = new Set(["that", "which", "who", "how", "what", "when", "where", "whether", "if", "while"]);

function atomic(c: Chunks): AqusaDefect[] {
  const out: AqusaDefect[] = [];
  const means = c.means ?? "";
  if (means) {
    const doc = nlp.readDoc(`I want to ${means}`);
    const w = (doc.tokens().out(its.normal) as string[]).slice(3);
    const p = (doc.tokens().out(its.pos) as string[]).slice(3);
    const isV = (i: number) => p[i] === "VERB" || VERB_EXCEPTIONS.has(w[i]);
    const subAt = w.findIndex((x, k) => k > 0 && SUB.has(x));
    for (let i = 1; i < w.length - 1; i++) {
      if (!CONJ.has(w[i])) continue;
      if (subAt > 0 && i > subAt) break;
      if (w[i] === "/" && ["DET", "ADJ", "NUM"].includes(p[i - 2] ?? "")) continue;
      let j = i + 1;
      while (j < w.length && SKIP.has(w[j])) j++;
      const word = w[i] === "and" || w[i] === "or";
      const ok = word ? w.slice(0, i).some((_, k) => isV(k)) && j < w.length && isV(j) : isV(i - 1) && isV(i + 1);
      if (ok) {
        out.push({ criterion: "atomic", code: "AT_CONJ", message: `The means joins two actions with "${w[i]}".`, suggestion: "Split it into one story per action.", excerpt: w.slice(Math.max(0, i - 2), j + 1).join(" "), paperRef: word ? "§3.1 atomic, §4.3, §6.4" : "§6.3" });
        break;
      }
    }
    if (!out.length) {
      const m = means.match(/;|\s[&+]\s/);
      if (m) out.push({ criterion: "atomic", code: "AT_SYMBOL", message: `The means contains "${m[0].trim()}", which usually joins two requirements.`, suggestion: "Split it into one story per action.", excerpt: m[0].trim(), paperRef: "§4.3" });
    }
  }
  // Ký hiệu trong vai trò (§6.5): "R&D Manager" không phải hai vai trò. Diễn giải của nhóm cho 3 phép kiểm ở §6.5: coi là hai
  // vai trò khi ít nhất 2/3 phép kiểm cho kết quả "là hai từ riêng".
  const role = c.role ?? "";
  const rm = role.match(/^(.*?)\s*([&+]|\band\b|\bor\b)\s*(.*)$/iu);
  if (rm) {
    const [, l, sep, r] = rm;
    let separate = true;
    if (sep === "&" || sep === "+") {
      const spaced = new RegExp(`\\s\\${sep}|\\${sep}\\s`).test(role);
      const lw = l.split(/\s+/).pop() ?? "";
      const rw = r.split(/\s+/)[0] ?? "";
      const long = lw.length > 3 && rw.length > 3;
      const words = hasNoun(lw) && hasNoun(rw) && lw.length > 1 && rw.length > 1;
      separate = [spaced, long, words].filter(Boolean).length >= 2;
    }
    if (separate && l && r) out.push({ criterion: "atomic", code: "AT_ROLE", message: `The role names more than one user type ("${role}").`, suggestion: "Write one story per role.", excerpt: role, paperRef: "§4.3, §6.5" });
  }
  // Lặp cụm chỉ dấu trong phần vai trò và hành động (§6.2): "As a pharmacist, I want …, I as a wholesaler will …".
  const roles = `${c.role ?? ""} ${means}`.match(new RegExp(indicatorRe(["as an", "as a"]).source, "giu")) ?? [];
  const wants = means.match(new RegExp(indicatorRe(["i want"]).source, "giu")) ?? [];
  if (c.roleIndicator && (roles.length > 0 || wants.length > 0))
    out.push({ criterion: "atomic", code: "AT_REPEAT", message: `An indicator occurs twice ("${roles[0] ?? wants[0]}"), so the story probably holds two requirements.`, suggestion: "Split it into separate stories.", paperRef: "§6.2" });
  return out;
}

// §6.6: một cụm trong ngoặc là viết tắt của các chữ ngay trước nó, vd "Content Management System (CMS)".
function isAbbreviation(before: string, inner: string): boolean {
  const w = inner.trim();
  if (!/^[A-Za-z0-9.&-]{2,8}$/.test(w)) return false;
  const letters = w.replace(/[^A-Za-z]/g, "").toLowerCase();
  const prev = before.trim().split(/\s+/).slice(-letters.length - 2);
  const initials = prev.map((x) => x[0]?.toLowerCase() ?? "").join("");
  return initials.includes(letters) || letters.length <= 3;
}

const EXAMPLE_MARKERS = /(?<![\p{L}])(e\.g\.|i\.e\.|for example|for instance|such as|note:|etc\.?|like:)/iu;

function minimal(c: Chunks, raw: string): AqusaDefect[] {
  const out: AqusaDefect[] = [];
  // Chữ hoặc ký hiệu thừa ở đầu story (§5.1, §6.5).
  if (c.lead && (c.roleIndicator || c.meansIndicator))
    out.push({ criterion: "minimal", code: "MN_LEAD", message: `Extra text before the story: "${c.lead}".`, suggestion: "Remove it, or move it to a tag or the description.", excerpt: c.lead, paperRef: "§5.1, §6.5" });
  // Ngoặc (§3.1); bỏ qua viết tắt (§6.6) và dấu số nhiều "(s)" (nhóm).
  for (const m of raw.matchAll(/[([{]([^)\]}]*)[)\]}]/g)) {
    if (isAbbreviation(raw.slice(0, m.index), m[1]) || /^(s|es)$/i.test(m[1])) continue;
    out.push({ criterion: "minimal", code: "MN_BRACKET", message: `Extra detail in brackets: "${m[0]}".`, suggestion: "Move notes and examples to the acceptance criteria or the description.", excerpt: m[0], paperRef: "§3.1, §6.6" });
    break;
  }
  // Câu thêm sau story, hoặc ví dụ / ghi chú (§3.1). nhóm: câu thứ hai mở bằng "So that" là phần lý do; "such as" là ví dụ.
  const body = raw.trim().replace(/[.!]+$/u, "");
  const second = body.match(/[.!?;:]\s+(\S.*)$/u);
  const extra = (second && !/^so\s+that\b/i.test(second[1]) ? second : null) ?? body.match(EXAMPLE_MARKERS);
  if (extra && !out.some((d) => d.code === "MN_BRACKET"))
    out.push({ criterion: "minimal", code: "MN_EXTRA", message: `The story contains more than role, means and ends: "${extra[0].trim().slice(0, 60)}".`, suggestion: "Keep only role, means and ends; move the rest to the acceptance criteria.", excerpt: extra[0].trim().slice(0, 60), paperRef: "§3.1" });
  // nhóm (mở rộng §6.2 cho phần lý do): hai phần lý do lồng nhau ("…, so I have …, so that …").
  if (c.ends && /(?<![\p{L}])so that(?![\p{L}])/iu.test(c.ends))
    out.push({ criterion: "minimal", code: "MN_ENDS_REPEAT", message: "The story has two reasons (ends) one after another.", suggestion: "Keep one reason; move the rest to the description.", excerpt: c.ends.slice(0, 50), paperRef: "§6.2, team rule (not in the paper)" });
  return out;
}

/** Mẫu story = họ cụm chỉ dấu đã dùng (UniformAnalyzer, §4.3), vd "as a|i want|so that". */
// nhóm: "I want to", "I want to be able to" cùng họ "I want"; "As a/an" cùng họ.
const family = (ind?: string) => (!ind ? "-" : ind === "as an" ? "as a" : ind.replace(/^i (don't|do not) want( to)?$/, "i don't want").replace(/^i only want( to)?$/, "i only want").replace(/^i want( to( be able to)?)?$/, "i want").replace(/^i would like( to)?$|^i'd like to$/, "i would like").replace(/^i need( to)?$/, "i need"));
export function templateOf(c: Chunks): string {
  return [family(c.roleIndicator), family(c.meansIndicator), family(c.endsIndicator)].join("|");
}

const normText = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Chấm một bộ story (cùng module/dự án). Trả về lỗi theo từng story. */
export function analyzeSet(texts: string[]): AqusaDefect[][] {
  const chunks = texts.map((t) => chunk(t));
  const res = texts.map((t, i) => [...wellFormed(chunks[i]), ...readable(chunks[i]), ...atomic(chunks[i]), ...minimal(chunks[i], t)]);
  // Uniform (§3.3, §4.3): lệch mẫu chiếm đa số trong bộ (cần ít nhất 2 story). nhóm: đa số xác định riêng cho từng phần (vai
  // trò, hành động, lý do); phần lý do chỉ xét các story có lý do – ends là tuỳ chọn (§3.1), thiếu ends không tính là lệch.
  if (texts.length > 1) {
    const slots = chunks.map((c) => templateOf(c).split("|"));
    const major = [0, 1, 2].map((k) => {
      const count = new Map<string, number>();
      for (const t of slots) if (k < 2 || t[2] !== "-") count.set(t[k], (count.get(t[k]) ?? 0) + 1);
      const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      return top && top[1] > 1 ? top[0] : null;
    });
    slots.forEach((t, i) => {
      const off = (major[0] !== null && t[0] !== major[0]) || (major[1] !== null && t[1] !== major[1]) || (major[2] !== null && t[2] !== "-" && t[2] !== major[2]);
      if (off) res[i].push({ criterion: "uniform", code: "UN_TEMPLATE", message: `The story uses the template "${t.join(" … ")}", unlike most stories ("${major.map((m) => m ?? "…").join(" … ")}").`, suggestion: "Use the same template as the rest of the set.", paperRef: "§3.3 uniform, §4.3" });
    });
  }
  // Unique: trùng chính xác (sau khi chuẩn hoá chữ hoa và dấu câu), như AQUSA (§5.1).
  const seen = new Map<string, number>();
  texts.forEach((t, i) => {
    const k = normText(t);
    if (!k) return;
    if (seen.has(k)) res[i].push({ criterion: "unique", code: "UQ_DUPLICATE", message: `Exact duplicate of story #${(seen.get(k) ?? 0) + 1}.`, suggestion: "Remove one of the duplicates.", paperRef: "§3.3 unique, §5.1" });
    else seen.set(k, i);
  });
  return res;
}

/** Nhận diện story tiếng Anh (bộ chấm AQUSA chỉ dành cho tiếng Anh). */
export const isEnglishStory = (t: string) => !/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(t); // vi-keep: chữ cái có dấu để nhận diện story tiếng Việt
