// Gợi ý thành phần UI tiếp theo: mô hình n-gram trên cây (stupid backoff) + bộ luật thiếu sót.
// Đặt bài toán theo Li et al. (2020, arXiv:2001.05308): hoàn thiện cây giao diện đang dựng dở,
// dự đoán con kế tiếp dựa vào cha, anh em liền trước và ông. "Huấn luyện" = đếm tần suất.

import { ALL_TYPES, findNode, findParent, isContainer, nodeLabel, regionIds, UINode, walk } from "./design.ts";

export const END = "<END>";
export const START = "<START>";
export const ROOT = "<ROOT>";
export const MIN_COUNT = 5;
export const BACKOFF = 0.4;
export const ADD_MIN_P = 0.15;
export const SURPRISAL_REVIEW = 6;
/** Container bố cục thường được đặt tự do – không đánh dấu "Xem lại". */
const LAYOUT_TYPES = new Set(["Card", "Section", "Row", "Column", "Header", "Sidebar"]);
const OUTCOMES = [...ALL_TYPES, END];

type Table = Record<string, Record<string, number>>;

export interface NGramModel {
  version: 1;
  counts: { tri: Table; bi: Table; uni: Table; all: Record<string, number> };
  meta: { trees: number; events: number; sources: Record<string, number>; builtAt: string };
}

export function emptyModel(): NGramModel {
  return { version: 1, counts: { tri: {}, bi: {}, uni: {}, all: {} }, meta: { trees: 0, events: 0, sources: {}, builtAt: new Date().toISOString() } };
}

const add = (t: Table, key: string, x: string, w: number) => {
  const row = (t[key] ??= {});
  row[x] = (row[x] ?? 0) + w;
};
const sum = (row: Record<string, number> | undefined) => (row ? Object.values(row).reduce((a, b) => a + b, 0) : 0);

/** Ngữ cảnh của một vị trí con: (loại ông, loại cha, loại anh em liền trước). */
export interface Ctx {
  g: string;
  p: string;
  s: string;
}

/** Cộng dồn số đếm của một cây vào mô hình (có trọng số). */
export function countTree(model: NGramModel, tree: UINode, weight = 1, source = "unknown"): NGramModel {
  const { tri, bi, uni, all } = model.counts;
  const emit = (c: Ctx, x: string) => {
    add(tri, `${c.g}|${c.p}|${c.s}`, x, weight);
    add(bi, `${c.p}|${c.s}`, x, weight);
    add(uni, c.p, x, weight);
    all[x] = (all[x] ?? 0) + weight;
    model.meta.events += weight;
  };
  walk(tree, (n, parent) => {
    if (!isContainer(n.type)) return;
    const g = parent?.type ?? ROOT;
    let s = START;
    for (const c of n.children ?? []) {
      emit({ g, p: n.type, s }, c.type);
      s = c.type;
    }
    emit({ g, p: n.type, s }, END);
  });
  model.meta.trees += 1;
  model.meta.sources[source] = (model.meta.sources[source] ?? 0) + 1;
  return model;
}

/** Gộp b vào a (trọng số wb). Trả về a. */
export function mergeModels(a: NGramModel, b: NGramModel, wb = 1): NGramModel {
  for (const k of ["tri", "bi", "uni"] as const) for (const [key, row] of Object.entries(b.counts[k])) for (const [x, c] of Object.entries(row)) add(a.counts[k], key, x, c * wb);
  for (const [x, c] of Object.entries(b.counts.all)) a.counts.all[x] = (a.counts.all[x] ?? 0) + c * wb;
  a.meta.trees += b.meta.trees;
  a.meta.events += b.meta.events * wb;
  for (const [s, n] of Object.entries(b.meta.sources)) a.meta.sources[s] = (a.meta.sources[s] ?? 0) + n;
  return a;
}

/** Xác suất mức chung, làm mượt Laplace (+1) trên 28 loại + <END> – không bao giờ bằng 0. */
export function allProb(model: NGramModel, x: string): number {
  return ((model.counts.all[x] ?? 0) + 1) / (sum(model.counts.all) + OUTCOMES.length);
}

/** Điểm stupid backoff (Brants et al. 2007): dùng ngữ cảnh dài nhất có đủ dữ liệu, lùi dần ×0.4. */
export function prob(model: NGramModel, ctx: Ctx, x: string): number {
  const levels: Record<string, number>[] = [model.counts.tri[`${ctx.g}|${ctx.p}|${ctx.s}`], model.counts.bi[`${ctx.p}|${ctx.s}`], model.counts.uni[ctx.p]];
  let factor = 1;
  for (const row of levels) {
    const total = sum(row);
    if (total >= MIN_COUNT && row[x]) return factor * (row[x] / total);
    factor *= BACKOFF;
  }
  return factor * allProb(model, x);
}

/** Ngữ cảnh để đoán con kế tiếp ở cuối một container. */
export function ctxForAppend(tree: UINode, containerId: string): Ctx | null {
  const n = findNode(tree, containerId);
  if (!n || !isContainer(n.type)) return null;
  const kids = n.children ?? [];
  return { g: findParent(tree, n.id)?.type ?? ROOT, p: n.type, s: kids.length ? kids[kids.length - 1].type : START };
}

/** Top-k loại component có thể thêm vào cuối container (bỏ <END>). */
export function predictNext(model: NGramModel, tree: UINode, containerId: string, k = 5): { type: string; p: number }[] {
  const ctx = ctxForAppend(tree, containerId);
  if (!ctx) return [];
  return rankTypes(model, ctx, k);
}

export function rankTypes(model: NGramModel, ctx: Ctx, k = 5): { type: string; p: number }[] {
  return ALL_TYPES.filter((t) => t !== "Page")
    .map((type) => ({ type, p: prob(model, ctx, type) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, k);
}

/** Độ "lạ" của node trong ngữ cảnh: −log2 P(loại thực tế | ngữ cảnh). Node gốc trả 0. */
export function surprisal(model: NGramModel, tree: UINode, nodeId: string): number {
  const parent = findParent(tree, nodeId);
  const n = findNode(tree, nodeId);
  if (!parent || !n) return 0;
  const kids = parent.children ?? [];
  const i = kids.findIndex((c) => c.id === nodeId);
  const ctx = { g: findParent(tree, parent.id)?.type ?? ROOT, p: parent.type, s: i > 0 ? kids[i - 1].type : START };
  return -Math.log2(prob(model, ctx, n.type));
}

/** Baseline cho đánh giá: luôn đoán loại phổ biến nhất. */
export function baselinePredict(model: NGramModel): string {
  let best = "Text";
  let bestC = -1;
  for (const [x, c] of Object.entries(model.counts.all)) if (x !== END && c > bestC) (best = x), (bestC = c);
  return best;
}

// ------------------------------------------------------------------ Bộ luật thiếu sót
export interface Finding {
  nodeId: string;
  code: string;
  message: string;
  severity: 1 | 2 | 3;
  fixPrompt: string;
  /** Có giá trị khi cách sửa đúng là tạo màn mới (R6), không phải sửa phần tử. */
  createScreen?: string;
}

export interface RuleCtx {
  screenNames?: string[];
  openAnnotationNodeIds?: string[];
}

type Rule = (tree: UINode, ctx: RuleCtx) => Finding[];

const FIELD_TYPES = ["Input", "Textarea", "Select", "DatePicker"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const label = (n: UINode) => String(n.props.label ?? n.props.text ?? "");

const each = (tree: UINode, fn: (n: UINode) => Finding | Finding[] | null | undefined): Finding[] => {
  const out: Finding[] = [];
  walk(tree, (n) => {
    const r = fn(n);
    if (Array.isArray(r)) out.push(...r);
    else if (r) out.push(r);
  });
  return out;
};

export const RULES: Rule[] = [
  // R1 trường nhập thiếu name / thiếu required khi nhãn ghi bắt buộc
  (t) =>
    each(t, (n) => {
      if (!FIELD_TYPES.includes(n.type)) return null;
      const lb = label(n);
      if (/bắt buộc|\*/i.test(lb) && !n.props.required)
        return { nodeId: n.id, code: "R1", message: `"${lb}" ghi bắt buộc nhưng chưa đặt required`, severity: 2, fixPrompt: `Đặt trường "${lb}" là bắt buộc.` };
      if (!n.props.name) return { nodeId: n.id, code: "R1", message: `Trường "${lb}" chưa có name`, severity: 1, fixPrompt: `Bổ sung name (snake_case) cho trường "${lb}".` };
      return null;
    }),
  // R2 email / mật khẩu sai kiểu hoặc thiếu ràng buộc
  (t) =>
    each(t, (n) => {
      if (n.type !== "Input") return null;
      const lb = label(n);
      if (/email/i.test(lb) && n.props.inputType !== "email")
        return { nodeId: n.id, code: "R2", message: `"${lb}" nên dùng inputType email`, severity: 2, fixPrompt: `Đặt trường "${lb}" kiểu email, bắt buộc.` };
      if (/mật khẩu|password/i.test(lb) && (n.props.inputType !== "password" || n.props.minLength === undefined))
        return { nodeId: n.id, code: "R2", message: `"${lb}" cần inputType password và minLength`, severity: 2, fixPrompt: `Đặt trường "${lb}" kiểu password, bắt buộc, tối thiểu 8 ký tự.` };
      return null;
    }),
  // R3 Form không có nút gửi
  (t) =>
    each(t, (n) => {
      if (n.type !== "Form") return null;
      let hasBtn = false;
      walk(n, (d) => (hasBtn ||= d.type === "Button"));
      if (hasBtn) return null;
      const b = submitLabel(t, n);
      return { nodeId: n.id, code: "R3", message: "Form chưa có nút gửi", severity: 3, fixPrompt: `Thêm nút "${b.label}" (variant primary, action ${b.action}) vào cuối form này.` };
    }),
  // R4 nút không có hành động
  (t) =>
    each(t, (n) =>
      n.type === "Button" && !n.props.action && !n.props.navigateTo
        ? { nodeId: n.id, code: "R4", message: `Nút "${label(n)}" chưa có action/navigateTo`, severity: 1, fixPrompt: `Bổ sung action cho nút "${label(n)}".` }
        : null,
    ),
  // R5 bảng thiếu cột
  (t) =>
    each(t, (n) =>
      n.type === "Table" && (!Array.isArray(n.props.columns) || !(n.props.columns as unknown[]).length)
        ? { nodeId: n.id, code: "R5", message: "Bảng chưa có cột", severity: 2, fixPrompt: "Bổ sung danh sách cột cho bảng này." }
        : null,
    ),
  // R6 điều hướng tới màn chưa tồn tại → gợi ý tạo màn đó (mỗi màn đích một lần)
  (t, ctx) => {
    if (!ctx.screenNames?.length) return [];
    const names = new Set(ctx.screenNames.map(norm));
    const seen = new Set<string>();
    return each(t, (n) => {
      const to = n.props.navigateTo;
      if ((n.type !== "Button" && n.type !== "Link") || typeof to !== "string" || !to.trim() || names.has(norm(to)) || seen.has(norm(to))) return null;
      seen.add(norm(to));
      return { nodeId: n.id, code: "R6", message: `Màn "${to}" chưa được thiết kế`, severity: 1, fixPrompt: `Màn hình ${to}`, createScreen: to };
    });
  },
  // R8 trường nhập chưa có placeholder hướng dẫn
  (t) =>
    each(t, (n) => {
      if ((n.type !== "Input" && n.type !== "Textarea") || n.props.placeholder) return null;
      const lb = label(n);
      return { nodeId: n.id, code: "R8", message: `Trường "${lb}" chưa có placeholder`, severity: 1, fixPrompt: `Thêm placeholder "Nhập ${lb.toLowerCase()}" cho trường "${lb}".` };
    }),
  // R9 ô nhập chữ chưa giới hạn độ dài
  (t) =>
    each(t, (n) => {
      if (n.type !== "Input" || n.props.maxLength !== undefined) return null;
      const kind = String(n.props.inputType ?? "text");
      if (!["text", "email", "tel", "password"].includes(kind)) return null;
      const max = kind === "password" ? 32 : kind === "tel" ? 15 : 100;
      return { nodeId: n.id, code: "R9", message: `Trường "${label(n)}" chưa giới hạn độ dài`, severity: 1, fixPrompt: `Đặt trường "${label(n)}" tối đa ${max} ký tự.` };
    }),
  // R7 node còn bình luận chưa xử lý
  (t, ctx) => {
    const open = new Set(ctx.openAnnotationNodeIds ?? []);
    return each(t, (n) => (open.has(n.id) ? { nodeId: n.id, code: "R7", message: `${nodeLabel(n)} còn bình luận chưa xử lý`, severity: 2, fixPrompt: "Xử lý bình luận đang mở của phần tử này." } : null));
  },
];

export function ruleFindings(tree: UINode, ctx: RuleCtx = {}): Finding[] {
  return RULES.flatMap((r) => r(tree, ctx));
}

// ------------------------------------------------------------------ Xếp hạng gợi ý
export interface Suggestion {
  id: string;
  kind: "add" | "fix" | "review" | "screen";
  targetNodeId: string;
  title: string;
  reason: string;
  confidence: number;
  fixPrompt: string;
  createScreen?: string;
}

export interface SuggestOptions extends RuleCtx {
  selectedIds?: string[];
  k?: number;
}

// ------------------------------------------------------------------ Câu gợi ý theo ngữ cảnh
const has = (texts: string[], re: RegExp) => texts.some((t) => re.test(t));

/** Gom chữ trong container và tiêu đề màn để đoán mục đích (đăng nhập, đăng ký, tìm kiếm...). */
function contextTexts(tree: UINode, container: UINode): string[] {
  const out = [String(tree.props.title ?? ""), String(container.props.title ?? "")];
  walk(container, (d) => out.push(String(d.props.label ?? d.props.text ?? d.props.title ?? "")));
  return out.map((t) => t.toLowerCase());
}

/** Nhãn nút gửi phù hợp với mục đích của form. */
export function submitLabel(tree: UINode, container: UINode): { label: string; action: string } {
  const t = contextTexts(tree, container);
  const pw = has(t, /mật khẩu|password/);
  if (has(t, /xác nhận mật khẩu|đăng ký|register|sign up/)) return { label: "Đăng ký", action: "register" };
  if (has(t, /quên mật khẩu|đặt lại/) && !has(t, /^mật khẩu$/)) return { label: "Gửi liên kết", action: "send_reset" };
  if (pw && has(t, /email|tên đăng nhập|username|tài khoản/)) return { label: "Đăng nhập", action: "login" };
  if (has(t, /tìm kiếm|tra cứu|search|lọc/)) return { label: "Tìm kiếm", action: "search" };
  if (has(t, /thanh toán|checkout/)) return { label: "Đặt hàng", action: "checkout" };
  if (has(t, /chỉnh sửa|cập nhật/)) return { label: "Cập nhật", action: "update" };
  return { label: "Lưu", action: "save" };
}

/** Trường còn thiếu hợp lý nhất cho form. */
function missingField(tree: UINode, container: UINode): { label: string; extra: string } {
  const t = contextTexts(tree, container);
  if (has(t, /email/) && !has(t, /mật khẩu|password/) && !has(t, /quên/)) return { label: "Mật khẩu", extra: "bắt buộc, kiểu password, tối thiểu 8 ký tự" };
  if (has(t, /^mật khẩu/) && has(t, /đăng ký/) && !has(t, /xác nhận mật khẩu/)) return { label: "Xác nhận mật khẩu", extra: "bắt buộc, kiểu password" };
  if (has(t, /tìm kiếm|tra cứu/)) return { label: "Từ khóa", extra: "không bắt buộc" };
  return { label: "Ghi chú", extra: "không bắt buộc" };
}

/** Câu prompt cụ thể cho gợi ý "Thêm <type>" vào container (dùng thẳng cho "Sửa vùng đã khoanh"). */
export function addPrompt(tree: UINode, container: UINode, type: string): string {
  const where = nodeLabel(container);
  const kids = container.children ?? [];
  switch (type) {
    case "Button": {
      if (container.type === "Form" || kids.some((k) => FIELD_TYPES.includes(k.type))) {
        const b = submitLabel(tree, container);
        return `Thêm nút "${b.label}" (variant primary, action ${b.action}) vào cuối ${where}.`;
      }
      const parent = findParent(tree, container.id);
      if ((parent?.children ?? []).some((c) => c.type === "Table")) return `Thêm nút "Thêm mới" (variant primary, action create) vào cuối ${where}.`;
      return `Thêm nút "Xem chi tiết" (variant secondary) vào cuối ${where}.`;
    }
    case "Input": {
      const f = missingField(tree, container);
      return `Thêm trường "${f.label}" (${f.extra}) vào cuối ${where}.`;
    }
    case "Link":
      return has(contextTexts(tree, container), /mật khẩu|password/) ? `Thêm link "Quên mật khẩu?" vào cuối ${where}.` : `Thêm một Link điều hướng phù hợp vào cuối ${where}.`;
    case "Pagination":
      return `Thêm phân trang (Pagination) ngay sau bảng trong ${where}.`;
    case "Heading":
      return `Thêm tiêu đề (Heading) mô tả nội dung của ${where}.`;
    case "Text":
      return `Thêm đoạn mô tả ngắn (Text) hướng dẫn người dùng trong ${where}.`;
    case "Checkbox":
      return has(contextTexts(tree, container), /mật khẩu/) ? `Thêm ô tích "Ghi nhớ đăng nhập" vào ${where}.` : `Thêm ô tích (Checkbox) phù hợp vào ${where}.`;
    default:
      return `Thêm một ${type} phù hợp vào cuối ${where}.`;
  }
}

/** Mô tả ngữ cảnh n-gram cho người đọc: "Sau Input trong Form". */
function ctxText(ctx: Ctx | null): string {
  if (!ctx) return "";
  return ctx.s === START ? `Đầu ${ctx.p}` : `Sau ${ctx.s} trong ${ctx.p}`;
}

export function suggest(model: NGramModel, tree: UINode, opts: SuggestOptions = {}): Suggestion[] {
  const k = opts.k ?? 5;
  const scope = opts.selectedIds?.length ? regionIds(tree, opts.selectedIds) : null;
  const inScope = (id: string) => !scope || scope.has(id);
  const out: Suggestion[] = [];

  walk(tree, (n) => {
    if (!inScope(n.id) || !isContainer(n.type)) return;
    const last = n.children?.at(-1)?.type;
    const where = nodeLabel(n);
    for (const { type, p } of predictNext(model, tree, n.id, 5).filter((x) => x.p >= ADD_MIN_P && (x.type !== last || x.p >= 0.3)).slice(0, 2)) {
      out.push({
        id: `add:${n.id}:${type}`,
        kind: "add",
        targetNodeId: n.id,
        title: `Thêm ${type} vào ${where}`,
        reason: `${ctxText(ctxForAppend(tree, n.id))}: ${Math.round(p * 100)}% trường hợp tương tự là ${type}`,
        confidence: Math.min(1, p),
        fixPrompt: addPrompt(tree, n, type),
      });
    }
  });

  for (const f of ruleFindings(tree, opts)) {
    if (!inScope(f.nodeId)) continue;
    out.push({
      id: `${f.createScreen ? "screen" : "fix"}:${f.nodeId}:${f.code}`,
      kind: f.createScreen ? "screen" : "fix",
      targetNodeId: f.nodeId,
      title: f.message,
      reason: f.createScreen ? `"${label(findNode(tree, f.nodeId)!)}" dẫn tới màn này (luật ${f.code})` : `Luật ${f.code}`,
      confidence: 0.3 + 0.2 * f.severity,
      fixPrompt: f.fixPrompt,
      ...(f.createScreen ? { createScreen: f.createScreen } : {}),
    });
  }

  walk(tree, (n, parent) => {
    if (!parent || !inScope(n.id) || LAYOUT_TYPES.has(n.type) || isContainer(n.type)) return;
    const s = surprisal(model, tree, n.id);
    if (s < SURPRISAL_REVIEW) return;
    out.push({
      id: `review:${n.id}`,
      kind: "review",
      targetNodeId: n.id,
      title: `Xem lại ${nodeLabel(n)} trong ${nodeLabel(parent)}`,
      reason: `Hiếm gặp trong ngữ cảnh này (${s.toFixed(1)} bit)`,
      confidence: Math.min(1, s / 12) * 0.6,
      fixPrompt: `Kiểm tra lại ${nodeLabel(n)} – cân nhắc dùng loại component khác hoặc dời vị trí.`,
    });
  });

  // top-k là phần tử TRONG màn; gợi ý tạo màn liên quan xếp riêng ở cuối, không chiếm chỗ
  const seen = new Set<string>();
  const uniq = out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true))).sort((a, b) => b.confidence - a.confidence);
  return [...uniq.filter((s) => s.kind !== "screen").slice(0, k), ...uniq.filter((s) => s.kind === "screen")];
}
