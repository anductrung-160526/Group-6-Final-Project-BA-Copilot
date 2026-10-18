// Mô hình ĐỐI CHỨNG n-gram trên cây (stupid backoff): dự đoán con kế tiếp dựa vào cha, anh em liền trước và ông.
// Chỉ dùng trong các script đánh giá (scripts/build-next-model.ts, eval-next.ts, eval-transformer.ts) – KHÔNG dùng trong app.
// Tính năng gợi ý của app dùng Recursive Transformer Tree Decoder (Li et al. 2020) – shared/recursive.ts.

import { ALL_TYPES, findNode, findParent, isContainer, UINode, walk } from "./design.ts";

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
const CONTROL_TYPES = new Set(["Stat", "Input", "Textarea", "Select", "DatePicker", "Checkbox", "Radio", "Button", "Link"]);

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

/** Ngưỡng "có gợi ý thêm" của mô hình đối chứng (Transformer phát hiện chỗ thiếu) – chỉ dùng trong scripts/eval-transformer.ts. */
export const TF_ADD_MIN = 0.3;
