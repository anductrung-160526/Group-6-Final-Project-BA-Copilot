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
        return { nodeId: n.id, code: "R2", message: `"${lb}" nên dùng inputType email`, severity: 2, fixPrompt: `Đổi trường "${lb}" sang inputType email, bắt buộc.` };
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
      return hasBtn ? null : { nodeId: n.id, code: "R3", message: "Form chưa có nút gửi", severity: 3, fixPrompt: 'Thêm nút "Lưu" (variant primary, action submit) vào cuối form này.' };
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
  // R6 điều hướng tới màn chưa tồn tại
  (t, ctx) => {
    if (!ctx.screenNames?.length) return [];
    const names = new Set(ctx.screenNames.map(norm));
    return each(t, (n) => {
      const to = n.props.navigateTo;
      if ((n.type !== "Button" && n.type !== "Link") || typeof to !== "string" || !to.trim() || names.has(norm(to))) return null;
      return { nodeId: n.id, code: "R6", message: `"${label(n)}" dẫn tới màn "${to}" chưa có trong module`, severity: 1, fixPrompt: `Sửa navigateTo của "${label(n)}" sang một màn hiện có (${ctx.screenNames!.slice(0, 5).join(", ")}).` };
    });
  },
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
  kind: "add" | "fix" | "review";
  targetNodeId: string;
  title: string;
  reason: string;
  confidence: number;
  fixPrompt: string;
}

export interface SuggestOptions extends RuleCtx {
  selectedIds?: string[];
  k?: number;
}

const ADD_PROMPT: Record<string, (where: string) => string> = {
  Button: (w) => `Thêm nút "Xác nhận" (variant primary, action submit) vào cuối ${w}.`,
  Input: (w) => `Thêm trường "Thông tin" (bắt buộc) vào cuối ${w}.`,
};

export function suggest(model: NGramModel, tree: UINode, opts: SuggestOptions = {}): Suggestion[] {
  const k = opts.k ?? 5;
  const scope = opts.selectedIds?.length ? regionIds(tree, opts.selectedIds) : null;
  const inScope = (id: string) => !scope || scope.has(id);
  const out: Suggestion[] = [];

  walk(tree, (n) => {
    if (!inScope(n.id) || !isContainer(n.type)) return;
    const last = n.children?.at(-1)?.type;
    const where = nodeLabel(n);
    for (const { type, p } of predictNext(model, tree, n.id, 5).filter((x) => x.p >= ADD_MIN_P && x.type !== last).slice(0, 2)) {
      out.push({
        id: `add:${n.id}:${type}`,
        kind: "add",
        targetNodeId: n.id,
        title: `Thêm ${type} vào ${where}`,
        reason: `${Math.round(p * 100)}% trường hợp tương tự có ${type} tiếp theo`,
        confidence: Math.min(1, p),
        fixPrompt: (ADD_PROMPT[type] ?? ((w: string) => `Thêm một ${type} phù hợp vào cuối ${w}.`))(where),
      });
    }
  });

  for (const f of ruleFindings(tree, opts)) {
    if (!inScope(f.nodeId)) continue;
    out.push({ id: `fix:${f.nodeId}:${f.code}`, kind: "fix", targetNodeId: f.nodeId, title: f.message, reason: `Luật ${f.code}`, confidence: 0.3 + 0.2 * f.severity, fixPrompt: f.fixPrompt });
  }

  walk(tree, (n, parent) => {
    if (!parent || !inScope(n.id)) return;
    const s = surprisal(model, tree, n.id);
    if (s < SURPRISAL_REVIEW) return;
    out.push({
      id: `review:${n.id}`,
      kind: "review",
      targetNodeId: n.id,
      title: `Xem lại ${nodeLabel(n)} trong ${nodeLabel(parent)}`,
      reason: `Hiếm gặp trong ngữ cảnh này (${s.toFixed(1)} bit)`,
      confidence: Math.min(1, s / 12) * 0.6,
      fixPrompt: `Kiểm tra lại ${nodeLabel(n)}: đổi sang thành phần phù hợp hơn hoặc chuyển vị trí.`,
    });
  });

  const seen = new Set<string>();
  return out
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, k);
}
