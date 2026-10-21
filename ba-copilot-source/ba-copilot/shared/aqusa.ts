// Bộ chấm QUS theo AQUSA (Lucassen, Dalpiaz, van der Werf, Brinkkemper 2016 – "Improving agile requirements: the Quality
// User Story framework and tool", Requirements Engineering 21:383–403). Chỉ áp cho story tiếng Anh.
// - Đúng bài báo: 5 tiêu chí AQUSA v1 kiểm (§4): well-formed, atomic, minimal, uniform, unique, cộng các cải tiến v2 (§6).
// - Gán nhãn từ loại bằng wink-nlp thay cho Stanford CoreNLP (lựa chọn của nhóm – ngoài bài báo).
// - Các tiêu chí ngữ nghĩa (conceptually sound, problem-oriented, unambiguous, conflict-free…) KHÔNG kiểm ở đây: bài báo
//   loại chúng vì cần hiểu nội dung (§4).
// Hàm thuần, chạy được cả client và server. Mô hình wink-nlp (~3,5 MB) được nạp từ ngoài để không vào bundle app.js:
// server nạp qua shared/nlp-node.ts; trình duyệt tải public/nlp.js khi cần (client/useAqusa.ts). Chưa nạp → qus.ts dùng bộ luật cũ.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nlp = any;
let nlp: Nlp = (globalThis as { __winkNlp?: Nlp }).__winkNlp ?? null;
let its: Nlp = nlp?.its;
export function setNlp(n: Nlp) {
  nlp = n;
  its = n.its;
}
export const nlpReady = () => {
  if (!nlp && (globalThis as { __winkNlp?: Nlp }).__winkNlp) setNlp((globalThis as { __winkNlp?: Nlp }).__winkNlp);
  return !!nlp;
};

export type QusCriterion = "well-formed" | "atomic" | "minimal" | "uniform" | "unique";
/** Các cải tiến v2 (§6) – bật/tắt riêng để làm ablation. */
export type V2Feature = "ends-indicators" | "chunk-repetition" | "slash-gt" | "verb-exceptions" | "symbol-role" | "starting-text" | "abbreviation";
export const ALL_V2: V2Feature[] = ["ends-indicators", "chunk-repetition", "slash-gt", "verb-exceptions", "symbol-role", "starting-text", "abbreviation"];

export interface AqusaDefect {
  criterion: QusCriterion;
  code: string;
  message: string;
  suggestion: string;
  excerpt?: string;
  /** Mục của bài báo làm căn cứ. */
  paperRef: string;
}

export interface AqusaOptions {
  /** Cải tiến v2 được bật (mặc định: tất cả). [] = AQUSA v1. */
  v2?: V2Feature[];
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

// Cụm chỉ dấu (§4.1). Bản v1: "As a", "I want (to)", "so that". v2 §6.1: thêm các cách viết khác.
const ROLE_IND = ["as an", "as a", "as the", "as"];
const MEANS_IND_V1 = ["i want to", "i want"];
const MEANS_IND_V2 = ["i don't want to", "i don't want", "i do not want to", "i do not want", "i only want to", "i only want", "i'd like to", "i would like to", "i would like", "i need to", "i need", "i can", "i am able to", "i should be able to", "i want to be able to"];
const ENDS_IND_V1 = ["so that"];
const ENDS_IND_V2 = ["in order to", "so i can", "so we can", "so as to", "this way", "to be able to", "so"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const longestFirst = (a: string[]) => [...a].sort((x, y) => y.length - x.length);
const indicatorRe = (inds: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(${longestFirst(inds).map(esc).join("|").replace(/ /g, "\\s+")})(?![\\p{L}\\p{N}])`, "iu");

const on = (o: AqusaOptions, f: V2Feature) => (o.v2 ?? ALL_V2).includes(f);

/** Tách story thành vai trò / hành động / lý do theo cụm chỉ dấu (StoryChunker, §4.2). */
export function chunk(text: string, o: AqusaOptions = {}): Chunks {
  const t = text.normalize("NFC").trim();
  const meansInd = on(o, "ends-indicators") ? [...MEANS_IND_V1, ...MEANS_IND_V2] : MEANS_IND_V1;
  const endsInd = on(o, "ends-indicators") ? [...ENDS_IND_V1, ...ENDS_IND_V2] : ENDS_IND_V1;
  const out: Chunks = { lead: "" };
  const r = t.match(indicatorRe(ROLE_IND));
  let rest = t;
  if (r && r.index !== undefined) {
    out.lead = t.slice(0, r.index).trim();
    out.roleIndicator = r[1].toLowerCase().replace(/\s+/g, " ");
    rest = t.slice(r.index + r[0].length);
  }
  const m = rest.match(indicatorRe(meansInd));
  if (m && m.index !== undefined) {
    if (out.roleIndicator) out.role = rest.slice(0, m.index).replace(/[\s,;]+$/u, "").trim();
    else out.lead = rest.slice(0, m.index).trim();
    out.meansIndicator = m[1].toLowerCase().replace(/\s+/g, " ");
    rest = rest.slice(m.index + m[0].length);
    const e = rest.match(indicatorRe(endsInd));
    if (e && e.index !== undefined && e.index > 0) {
      out.means = rest.slice(0, e.index).replace(/[\s,;]+$/u, "").trim();
      out.endsIndicator = e[1].toLowerCase().replace(/\s+/g, " ");
      out.ends = rest.slice(e.index + e[0].length).trim();
    } else out.means = rest.trim();
  } else if (out.roleIndicator) out.role = rest.trim();
  return out;
}

// §6.4: động từ hay bị bộ gán nhãn hiểu nhầm thành danh từ trong ngữ cảnh phần mềm.
const VERB_EXCEPTIONS = new Set(["select", "support", "import", "export", "filter", "search", "view", "update", "upload", "download", "edit", "print", "sort", "share", "log", "sign", "access", "manage", "review", "track", "tag", "comment", "rate", "book", "order", "schedule", "post", "list", "copy", "move", "archive", "save", "add", "delete", "remove", "create", "change", "do", "get", "keep", "check", "enter", "browse", "give", "receive", "send", "post"]);

function hasVerb(s: string, o: AqusaOptions): boolean {
  const doc = nlp.readDoc(s);
  const words = doc.tokens().out(its.normal) as string[];
  const pos = doc.tokens().out(its.pos) as string[];
  // "to be up-to-date", "to be appropriate": "be" + tính từ là vị ngữ hợp lệ (vòng 2, thiết kế của nhóm).
  return pos.some((p, i) => p === "VERB" || (words[i] === "be" && i + 1 < pos.length) || (on(o, "verb-exceptions") && VERB_EXCEPTIONS.has(words[i])));
}

function hasNoun(s: string): boolean {
  const pos = nlp.readDoc(s).tokens().out(its.pos) as string[];
  return pos.some((p) => p === "NOUN" || p === "PROPN" || p === "PRON");
}

// ---------------------------------------------------------------- các bộ phân tích (§4.3)

function wellFormed(c: Chunks, o: AqusaOptions): AqusaDefect[] {
  if (!c.roleIndicator || !c.role)
    return [{ criterion: "well-formed", code: "WF_NO_ROLE", message: "The story has no role (\"As a <role>\").", suggestion: "Start with \"As a <role>, …\".", paperRef: "§3.1, §4.3" }];
  if (!c.meansIndicator || !c.means)
    return [{ criterion: "well-formed", code: "WF_NO_MEANS", message: "The story has no means (\"I want <action>\").", suggestion: "Add \"I want <action>\".", paperRef: "§3.1, §4.3" }];
  const out: AqusaDefect[] = [];
  // Nội dung chunk (WellFormedContentAnalyzer): vai trò phải có danh từ, hành động phải có động từ.
  if (!hasNoun(c.role)) out.push({ criterion: "well-formed", code: "WF_ROLE_CONTENT", message: `The role "${c.role}" contains no noun.`, suggestion: "Name a user type, e.g. \"As a store manager\".", excerpt: c.role, paperRef: "§4.3" });
  // "I want to <X>": X đứng ngay sau "to"/"can" là động từ theo ngữ pháp, kể cả khi bộ gán nhãn hiểu khác.
  const verbSlot = /(?:to|can|need)$/.test(c.meansIndicator) || /^to\s/i.test(c.means);
  if (!verbSlot && !hasVerb(c.means, o)) out.push({ criterion: "well-formed", code: "WF_MEANS_CONTENT", message: `The means "${c.means}" contains no verb.`, suggestion: "Describe an action, e.g. \"I want to export orders\".", excerpt: c.means, paperRef: "§4.3" });
  return out;
}

const CONJ_WORDS = ["and", "or", "as well as", "and/or"];

function atomic(c: Chunks, raw: string, o: AqusaOptions): AqusaDefect[] {
  const out: AqusaDefect[] = [];
  const means = c.means ?? "";
  // Liên từ (and/or, và v2 §6.3: "/", "\\", ">") trong phần hành động: vi phạm khi hai vế đều là cụm động từ (§4.3, §6.4).
  // Gán nhãn từ loại trên cả câu "I want to <means>" để bộ gán nhãn có ngữ cảnh. Vế sau phải MỞ ĐẦU bằng động từ
  // (bỏ qua "to/also/then/can"), để "update my info and the type of material I accept" không bị tính – tinh chỉnh của nhóm trên tập dev.
  if (means) {
    const doc = nlp.readDoc(`I want to ${means}`);
    const w = (doc.tokens().out(its.normal) as string[]).slice(3);
    const p = (doc.tokens().out(its.pos) as string[]).slice(3);
    const isV = (i: number) => p[i] === "VERB" || (on(o, "verb-exceptions") && VERB_EXCEPTIONS.has(w[i]));
    const conj = new Set(["and", "or", ...(on(o, "slash-gt") ? ["/", "\\", ">"] : [])]);
    const skip = new Set(["to", "also", "then", "can", "be", "able", "directly"]);
    // Liên từ nằm trong mệnh đề phụ ("codes that reflect … and provide", "determine how agencies will generate and validate")
    // nối hai vị ngữ của mệnh đề phụ, không phải hai tính năng (vòng 2, thiết kế của nhóm).
    const SUB = new Set(["that", "which", "who", "how", "what", "when", "where", "whether", "if", "while"]);
    const subAt = w.findIndex((x, k) => k > 0 && SUB.has(x));
    for (let i = 1; i < w.length - 1; i++) {
      if (!conj.has(w[i])) continue;
      if (subAt > 0 && i > subAt) break;
      if (w[i] === "/" && ["DET", "ADJ", "NUM"].includes(p[i - 2] ?? "")) continue; // "a custom query/report": danh từ ghép
      let j = i + 1;
      while (j < w.length && skip.has(w[j])) j++;
      const leftVerb = w.slice(0, i).some((_, k) => isV(k));
      const rightVerb = j < w.length && isV(j);
      // "/" chỉ nối khi hai từ kề nhau đều là động từ ("create/edit"), không tính "UI/UX", "query/report".
      const ok = w[i] === "and" || w[i] === "or" ? leftVerb && rightVerb : isV(i - 1) && isV(i + 1);
      if (ok) {
        out.push({ criterion: "atomic", code: "AT_CONJ", message: `The means joins two actions with "${w[i]}".`, suggestion: "Split it into one story per action.", excerpt: w.slice(Math.max(0, i - 2), j + 1).join(" "), paperRef: w[i] === "and" || w[i] === "or" ? "§3.1 atomic, §4.3, §6.4" : "§6.3" });
        break;
      }
    }
    if (!out.length) {
      const m = means.match(/;|\s[&+]\s/); // "ZIP+4", "C++" không phải liên từ
      if (m) out.push({ criterion: "atomic", code: "AT_SYMBOL", message: `The means contains "${m[0].trim()}", which usually joins two requirements.`, suggestion: "Split it into one story per action.", excerpt: m[0].trim(), paperRef: "§4.3" });
    }
  }
  // Ký hiệu trong vai trò (§6.5): "R&D Manager" không phải hai vai trò.
  const role = c.role ?? "";
  const rm = role.match(/^(.*?)\s*([&+]|\band\b|\bor\b)\s*(.*)$/iu);
  if (rm) {
    const [, l, sep, r] = rm;
    let separate = true;
    if (on(o, "symbol-role") && (sep === "&" || sep === "+")) {
      // Diễn giải của nhóm cho 3 phép kiểm ở §6.5: coi là hai vai trò khi ít nhất 2/3 phép kiểm cho kết quả "là hai từ riêng".
      const spaced = new RegExp(`\\s\\${sep}|\\${sep}\\s`).test(role);
      const lw = l.split(/\s+/).pop() ?? "";
      const rw = r.split(/\s+/)[0] ?? "";
      const long = lw.length > 3 && rw.length > 3;
      const words = hasNoun(lw) && hasNoun(rw) && lw.length > 1 && rw.length > 1;
      separate = [spaced, long, words].filter(Boolean).length >= 2;
    }
    if (separate && l && r) out.push({ criterion: "atomic", code: "AT_ROLE", message: `The role names more than one user type ("${role}").`, suggestion: "Write one story per role.", excerpt: role, paperRef: on(o, "symbol-role") ? "§4.3, §6.5" : "§4.3" });
  }
  // Lặp cụm chỉ dấu (§6.2): "As a pharmacist, I want …, I as a wholesaler will …".
  if (on(o, "chunk-repetition")) {
    const roles = raw.match(new RegExp(indicatorRe(["as an", "as a"]).source, "giu")) ?? [];
    const wants = raw.match(new RegExp(indicatorRe(["i want"]).source, "giu")) ?? [];
    if (roles.length > 1 || wants.length > 1)
      out.push({ criterion: "atomic", code: "AT_REPEAT", message: `An indicator occurs twice ("${roles.length > 1 ? roles[1] : wants[1]}"), so the story probably holds two requirements.`, suggestion: "Split it into separate stories.", paperRef: "§6.2" });
  }
  return out;
}

// §6.2 mở rộng cho phần ends: hai cụm lý do lồng nhau ("…, so I have …, so that …") – xếp vào minimal (thiết kế của nhóm).
function endsRepeat(c: Chunks, o: AqusaOptions): AqusaDefect[] {
  if (!on(o, "chunk-repetition") || !c.ends) return [];
  const m = c.ends.match(/(?<![\p{L}])so that(?![\p{L}])/iu);
  return m ? [{ criterion: "minimal", code: "MN_ENDS_REPEAT", message: "The story has two reasons (ends) one after another.", suggestion: "Keep one reason; move the rest to the description.", excerpt: c.ends.slice(0, 50), paperRef: "§6.2" }] : [];
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

function minimal(c: Chunks, raw: string, o: AqusaOptions): AqusaDefect[] {
  const out: AqusaDefect[] = [];
  // Chữ hoặc ký hiệu thừa ở đầu story (§5.1, §6.5).
  if (c.lead && (c.roleIndicator || c.meansIndicator))
    out.push({ criterion: "minimal", code: "MN_LEAD", message: `Extra text before the story: "${c.lead}".`, suggestion: "Remove it, or move it to a tag or the description.", excerpt: c.lead, paperRef: on(o, "starting-text") ? "§5.1, §6.5" : "§5.1" });
  // Ngoặc (§3.1 minimal, §4.3); v2 §6.6 bỏ qua viết tắt.
  for (const m of raw.matchAll(/[([{]([^)\]}]*)[)\]}]/g)) {
    if (on(o, "abbreviation") && isAbbreviation(raw.slice(0, m.index), m[1])) continue;
    if (/^(s|es)$/i.test(m[1])) continue; // "Plan(s)": dấu số nhiều, không phải chú thích (vòng 2)
    out.push({ criterion: "minimal", code: "MN_BRACKET", message: `Extra detail in brackets: "${m[0]}".`, suggestion: "Move notes and examples to the acceptance criteria or the description.", excerpt: m[0], paperRef: on(o, "abbreviation") ? "§3.1, §6.6" : "§3.1" });
    break;
  }
  // Câu thêm sau story, hoặc ví dụ / ghi chú (§3.1: chỉ gồm role, means, ends).
  const body = raw.trim().replace(/[.!]+$/u, "");
  // Câu thứ hai bắt đầu bằng "So that" chính là phần ends (vòng 2); "such as" là dấu hiệu ví dụ (vòng 2).
  const second = body.match(/[.!?;:]\s+(\S.*)$/u);
  const extra = (second && !/^so\s+that\b/i.test(second[1]) ? second : null) ?? body.match(/(?<![\p{L}])(e\.g\.|i\.e\.|for example|for instance|such as|note:|etc\.?|like:)/iu);
  if (extra && !out.some((d) => d.code === "MN_BRACKET"))
    out.push({ criterion: "minimal", code: "MN_EXTRA", message: `The story contains more than role, means and ends: "${extra[0].trim().slice(0, 60)}".`, suggestion: "Keep only role, means and ends; move the rest to the acceptance criteria.", excerpt: extra[0].trim().slice(0, 60), paperRef: "§3.1" });
  return out;
}

/** Mẫu story = chuỗi cụm chỉ dấu đã dùng (UniformAnalyzer, §4.3), vd "as a|i want to|so that". */
// Họ cụm chỉ dấu: "I want to", "I want to be able to" cùng mẫu "I want" (tinh chỉnh của nhóm trên tập dev).
const family = (ind?: string) => (!ind ? "-" : ind === "as an" ? "as a" : ind.replace(/^i (don't|do not) want( to)?$/, "i don't want").replace(/^i only want( to)?$/, "i only want").replace(/^i want( to( be able to)?)?$/, "i want").replace(/^i would like( to)?$|^i'd like to$/, "i would like").replace(/^i need( to)?$/, "i need"));
export function templateOf(c: Chunks): string {
  return [family(c.roleIndicator), family(c.meansIndicator), family(c.endsIndicator)].join("|");
}

const normText = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Chấm một bộ story (cùng module/dự án). Trả về lỗi theo từng story. */
export function analyzeSet(texts: string[], o: AqusaOptions = {}): AqusaDefect[][] {
  const chunks = texts.map((t) => chunk(t, o));
  const res = texts.map((t, i) => [...wellFormed(chunks[i], o), ...atomic(chunks[i], t, o), ...minimal(chunks[i], t, o), ...endsRepeat(chunks[i], o)]);
  // Uniform: lệch mẫu chiếm đa số trong bộ (cần ít nhất 2 story). Đa số xác định riêng cho từng phần (vai trò, hành động,
  // lý do); phần lý do chỉ xét các story có lý do – vì ends là tuỳ chọn (§3.1), story thiếu ends không tính là lệch (vòng 2).
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
  // Unique: trùng chính xác (sau khi chuẩn hoá chữ hoa và dấu câu), như AQUSA v1 (§5.1).
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
export const isEnglishStory = (t: string) => !/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(t);
