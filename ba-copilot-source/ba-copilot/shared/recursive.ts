// Recursive Transformer Tree Decoder (Li et al. 2020, mục 4.1 và 4.4) – suy luận thuần TypeScript cho tab Gợi ý (phương án B).
// Huấn luyện ở scripts/paper/train_faithful.py, xuất trọng số bằng scripts/paper/export_recursive.py → model/recursive-layout.json.
//  - Node = (loại c, cờ lá t, khung bao x, y, x2, y2 trên lưới); embedding e = e_b + e_c + e_t (Eq.1–5), e_b ghép 4 embedding tọa độ.
//  - Với mỗi container, cùng một bộ giải mã sinh danh sách con: self-attention nhân quả trên [cha, các anh em] (Eq.9),
//    rồi chú ý trạng thái ẩn tầng cuối của các tổ tiên (Eq.10); softmax riêng cho từng thuộc tính và EOS (Eq.7).
//  - Giải mã tham lam từ gốc xuống, các con đã có được đưa vào trước, mô hình sinh tiếp con còn thiếu cho tới EOS.
// Khung bao của cây đang thiết kế được đo trên canvas (client) và rời rạc hóa theo cùng lưới lúc huấn luyện:
// x → 128 ô theo tỷ lệ độ rộng trang, y → ô `cellY` px (mặc định 20), tối đa 256 ô.
import { ALL_TYPES, isContainer, UINode } from "./design.ts";

export interface RecursiveModel {
  config: { d: number; layers: number; heads: number; gx: number; gy: number; cellY: number; nTypes: number; maxLen: number };
  meta: Record<string, unknown>;
  w: Record<string, { shape: number[]; data: Float32Array }>;
}
export type Box = [number, number, number, number];
export interface GeneratedChild { type: string; leaf: boolean; box: Box; p: number; pEos: number; index: number }
export interface ContainerPrediction { parentId: string; children: GeneratedChild[] }

const b64 = (s: string) => {
  const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
};

export function loadRecursive(json: { config: RecursiveModel["config"]; meta?: Record<string, unknown>; tensors: Record<string, { shape: number[]; b64: string }> }): RecursiveModel {
  const w: RecursiveModel["w"] = {};
  for (const [k, v] of Object.entries(json.tensors)) w[k] = { shape: v.shape, data: b64(v.b64) };
  return { config: json.config, meta: json.meta ?? {}, w };
}

// ------------------------------------------------------------------ đại số tuyến tính nhỏ
type Mat = Float32Array[]; // mảng hàng

function linear(m: RecursiveModel, x: Mat, name: string): Mat {
  const W = m.w[`${name}.weight`], B = m.w[`${name}.bias`];
  const [out, inn] = W.shape;
  return x.map((r) => {
    const y = new Float32Array(out);
    for (let o = 0; o < out; o++) {
      let s = B ? B.data[o] : 0;
      const off = o * inn;
      for (let i = 0; i < inn; i++) s += W.data[off + i] * r[i];
      y[o] = s;
    }
    return y;
  });
}

function layerNorm(m: RecursiveModel, x: Mat, name: string): Mat {
  const g = m.w[`${name}.weight`].data, b = m.w[`${name}.bias`].data;
  return x.map((r) => {
    let mu = 0;
    for (const v of r) mu += v;
    mu /= r.length;
    let va = 0;
    for (const v of r) va += (v - mu) ** 2;
    const inv = 1 / Math.sqrt(va / r.length + 1e-5);
    return r.map((v, i) => (v - mu) * inv * g[i] + b[i]);
  });
}

// erf theo Abramowitz–Stegun 7.1.26 (sai số < 1,5e-7) – GELU chính xác như nn.GELU() của PyTorch
function erf(x: number) {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const gelu = (v: number) => 0.5 * v * (1 + erf(v / Math.SQRT2));

/** nn.MultiheadAttention (batch_first), không dropout. causal: che vị trí tương lai. */
function mha(m: RecursiveModel, name: string, q: Mat, kv: Mat, causal: boolean): Mat {
  const { d, heads } = m.config;
  const dh = d / heads;
  const Wi = m.w[`${name}.in_proj_weight`].data, Bi = m.w[`${name}.in_proj_bias`].data;
  const proj = (x: Mat, part: number) => x.map((r) => {
    const y = new Float32Array(d);
    for (let o = 0; o < d; o++) {
      let s = Bi[part * d + o];
      const off = (part * d + o) * d;
      for (let i = 0; i < d; i++) s += Wi[off + i] * r[i];
      y[o] = s;
    }
    return y;
  });
  const Q = proj(q, 0), K = proj(kv, 1), V = proj(kv, 2);
  const out: Mat = q.map(() => new Float32Array(d));
  const scale = 1 / Math.sqrt(dh);
  for (let h = 0; h < heads; h++) {
    const o0 = h * dh;
    for (let i = 0; i < Q.length; i++) {
      const lim = causal ? i + 1 : K.length;
      const sc = new Float32Array(lim);
      let mx = -Infinity;
      for (let j = 0; j < lim; j++) {
        let s = 0;
        for (let t = 0; t < dh; t++) s += Q[i][o0 + t] * K[j][o0 + t];
        sc[j] = s * scale;
        if (sc[j] > mx) mx = sc[j];
      }
      let z = 0;
      for (let j = 0; j < lim; j++) z += (sc[j] = Math.exp(sc[j] - mx));
      for (let j = 0; j < lim; j++) {
        const a = sc[j] / z;
        for (let t = 0; t < dh; t++) out[i][o0 + t] += a * V[j][o0 + t];
      }
    }
  }
  return linear(m, out, `${name}.out_proj`);
}

const add = (a: Mat, b: Mat): Mat => a.map((r, i) => r.map((v, j) => v + b[i][j]));

type Tok = [number, number, number, number, number, number]; // c, t, x, y, x2, y2

function embed(m: RecursiveModel, toks: Tok[]): Mat {
  const { d } = m.config;
  const q = d / 4;
  const row = (name: string, idx: number) => m.w[name].data.subarray(idx * m.w[name].shape[1], (idx + 1) * m.w[name].shape[1]);
  return toks.map(([c, t, x, y, x2, y2]) => {
    const e = new Float32Array(d);
    const parts = [row("emb.x.weight", x), row("emb.y.weight", y), row("emb.x2.weight", x2), row("emb.y2.weight", y2)];
    parts.forEach((p, k) => e.set(p, k * q));
    const ec = row("emb.c.weight", c), et = row("emb.t.weight", t);
    for (let i = 0; i < d; i++) e[i] += ec[i] + et[i];
    return e;
  });
}

/** Một lượt bộ giải mã: trả trạng thái ẩn tầng cuối và logits của vị trí cuối. */
function run(m: RecursiveModel, toks: Tok[], mem: Mat) {
  let x = embed(m, toks);
  for (let l = 0; l < m.config.layers; l++) {
    const p = `layers.${l}`;
    x = add(x, mha(m, `${p}.self_attn`, layerNorm(m, x, `${p}.ln1`), layerNorm(m, x, `${p}.ln1`), true)); // Eq.9
    x = add(x, mha(m, `${p}.cross`, layerNorm(m, x, `${p}.ln2`), mem, false)); // Eq.10
    const hh = layerNorm(m, x, `${p}.ln3`);
    const f1 = linear(m, hh, `${p}.ff.0`).map((r) => r.map(gelu));
    x = add(x, linear(m, f1, `${p}.ff.2`));
  }
  const h = layerNorm(m, x, "ln");
  const last = [h[h.length - 1]];
  const heads = Object.fromEntries(["c", "t", "x", "y", "x2", "y2"].map((k) => [k, linear(m, last, `out.${k}`)[0]])) as Record<string, Float32Array>;
  return { h, heads };
}

const argmax = (a: Float32Array) => a.reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0);
const softmax = (a: Float32Array) => {
  const mx = Math.max(...a);
  const e = a.map((v) => Math.exp(v - mx));
  const z = e.reduce((s, v) => s + v, 0);
  return e.map((v) => v / z);
};

/** Rời rạc hóa khung bao pixel (so với góc trên trái của trang) theo lưới lúc huấn luyện. */
export function toGrid(m: RecursiveModel, px: { x: number; y: number; x2: number; y2: number }, pageWidth: number): Box {
  const { gx, gy, cellY } = m.config;
  const qx = (v: number) => Math.max(0, Math.min(gx - 1, Math.floor((v / pageWidth) * gx)));
  const qy = (v: number) => Math.max(0, Math.min(gy - 1, Math.floor(v / cellY)));
  return [qx(px.x), qy(px.y), qx(px.x2), qy(px.y2)];
}

/**
 * Sinh các con còn thiếu cho mọi container của cây đang thiết kế (từ gốc xuống, như recursive_complete trong Python).
 * boxes: khung bao lưới của từng node (theo id). Node thiếu khung bao (chưa render) nhận khung của cha.
 * Chỉ các container ĐÃ CÓ trong cây được dự đoán; con sinh ra không được mở rộng tiếp (gợi ý từng phần tử).
 */
export function predictChildren(m: RecursiveModel, tree: UINode, boxes: Record<string, Box>, maxPerContainer = 6): ContainerPrediction[] {
  const { d, nTypes, maxLen } = m.config;
  const EOS = nTypes;
  const canvas = m.w["canvas"].data.subarray(0, d);
  const out: ContainerPrediction[] = [];
  const tok = (n: UINode, fallback: Box): Tok => {
    const b = boxes[n.id] ?? fallback;
    return [ALL_TYPES.indexOf(n.type), isContainer(n.type) ? 0 : 1, b[0], b[1], b[2], b[3]];
  };
  const visit = (n: UINode, anc: Float32Array[], own: Float32Array | null, box: Box) => {
    if (!isContainer(n.type)) return;
    const given = n.children ?? [];
    const seq: Tok[] = [tok(n, box), ...given.slice(0, maxLen - 1).map((c) => tok(c, boxes[n.id] ?? box))];
    const mem: Mat = own ? [...anc, own] : [...anc];
    const gen: GeneratedChild[] = [];
    let h0: Mat | null = null;
    while (seq.length < maxLen && gen.length < maxPerContainer) {
      const r = run(m, seq, mem);
      h0 ??= r.h;
      const lc = Float32Array.from(r.heads.c);
      lc[nTypes + 1] = -1e9; // BOS không bao giờ là đầu ra
      const pr = softmax(lc);
      const c = argmax(lc);
      if (c === EOS) break;
      const t = argmax(r.heads.t);
      const b: Box = [argmax(r.heads.x), argmax(r.heads.y), argmax(r.heads.x2), argmax(r.heads.y2)];
      gen.push({ type: ALL_TYPES[c], leaf: t === 1, box: b, p: pr[c], pEos: pr[EOS], index: 0 });
      seq.push([c, t, ...b]);
    }
    // vị trí chèn: theo thứ tự đọc của khung bao (y rồi x) giữa các con đã có – vị trí do tọa độ quyết định như bài báo
    for (const g of gen) {
      g.index = given.filter((c) => {
        const cb = boxes[c.id];
        return cb && (cb[1] < g.box[1] || (cb[1] === g.box[1] && cb[0] <= g.box[0]));
      }).length;
    }
    if (gen.length) out.push({ parentId: n.id, children: gen });
    const hs = h0 ?? run(m, seq, mem).h;
    const ownH = own ?? hs[0];
    given.slice(0, maxLen - 1).forEach((c, j) => visit(c, [...anc, ownH], hs[j + 1], boxes[c.id] ?? boxes[n.id] ?? box));
  };
  visit(tree, [canvas], null, boxes[tree.id] ?? [0, 0, m.config.gx - 1, m.config.gy - 1]);
  return out;
}

// ------------------------------------------------------------------ dùng cho tính năng gợi ý bố cục (layout auto-completion)
export interface Candidate { type: string; p: number }
export interface NextElement {
  parentId: string;
  /** vị trí chèn giữa các con đã có, theo thứ tự đọc của khung bao dự đoán */
  index: number;
  box: Box;
  leaf: boolean;
  /** top-k loại (không gồm EOS) theo softmax của đầu ra loại tại bước sinh */
  candidates: Candidate[];
  pEos: number;
  /** true nếu loại có xác suất cao nhất là EOS – mô hình cho rằng container đã đủ */
  eos: boolean;
}

interface Ctx { seq: Tok[]; mem: Mat; given: UINode[]; box: Box; anc: Float32Array[]; own: Float32Array | null }

/** Ngữ cảnh giải mã của một container: chuỗi [cha, các con đã có] và bộ nhớ trạng thái ẩn của tổ tiên (Eq.10). */
function contextOf(m: RecursiveModel, tree: UINode, boxes: Record<string, Box>, containerId: string): Ctx | null {
  const { d, maxLen } = m.config;
  const canvas = m.w["canvas"].data.subarray(0, d);
  const path: UINode[] = [];
  const find = (n: UINode): boolean => {
    path.push(n);
    if (n.id === containerId) return true;
    for (const c of n.children ?? []) if (find(c)) return true;
    path.pop();
    return false;
  };
  if (!find(tree) || !isContainer(path[path.length - 1].type)) return null;
  const tok = (n: UINode, fallback: Box): Tok => {
    const b = boxes[n.id] ?? fallback;
    return [ALL_TYPES.indexOf(n.type), isContainer(n.type) ? 0 : 1, b[0], b[1], b[2], b[3]];
  };
  let anc: Float32Array[] = [canvas];
  let own: Float32Array | null = null;
  let box: Box = boxes[tree.id] ?? [0, 0, m.config.gx - 1, m.config.gy - 1];
  for (let i = 0; ; i++) {
    const n = path[i];
    box = boxes[n.id] ?? box;
    const given = (n.children ?? []).slice(0, maxLen - 1);
    const seq: Tok[] = [tok(n, box), ...given.map((c) => tok(c, box))];
    const mem: Mat = own ? [...anc, own] : [...anc];
    if (i === path.length - 1) return { seq, mem, given, box, anc, own };
    const h = run(m, seq, mem).h;
    const j = given.indexOf(path[i + 1]);
    if (j < 0) return null; // con nằm ngoài maxLen
    anc = [...anc, own ?? h[0]];
    own = h[j + 1];
  }
}

function readingIndex(given: UINode[], boxes: Record<string, Box>, b: Box) {
  return given.filter((c) => {
    const cb = boxes[c.id];
    return cb && (cb[1] < b[1] || (cb[1] === b[1] && cb[0] <= b[0]));
  }).length;
}

function step(m: RecursiveModel, ctx: Ctx, boxes: Record<string, Box>, parentId: string, k: number): NextElement {
  const { nTypes } = m.config;
  const r = run(m, ctx.seq, ctx.mem);
  const lc = Float32Array.from(r.heads.c);
  lc[nTypes + 1] = -1e9; // BOS không bao giờ là đầu ra
  const pr = softmax(lc);
  const order = [...Array(nTypes).keys()].sort((a, b) => pr[b] - pr[a]);
  const box: Box = [argmax(r.heads.x), argmax(r.heads.y), argmax(r.heads.x2), argmax(r.heads.y2)];
  return {
    parentId,
    index: readingIndex(ctx.given, boxes, box),
    box,
    leaf: argmax(r.heads.t) === 1,
    candidates: order.slice(0, k).map((c) => ({ type: ALL_TYPES[c], p: pr[c] })),
    pEos: pr[nTypes],
    eos: argmax(lc) === nTypes,
  };
}

/** Phần tử tiếp theo cho một container đã có (một bước giải mã, top-k loại). */
export function nextInContainer(m: RecursiveModel, tree: UINode, boxes: Record<string, Box>, containerId: string, k = 3): NextElement | null {
  const ctx = contextOf(m, tree, boxes, containerId);
  if (!ctx || ctx.seq.length >= m.config.maxLen) return null;
  return step(m, ctx, boxes, containerId, k);
}

/**
 * Phần tử tiếp theo cho cả cây: một bước giải mã ở MỌI container đã có (cùng một lượt duyệt từ gốc xuống),
 * trả các container mà mô hình KHÔNG đoán EOS, xếp theo xác suất loại cao nhất giảm dần.
 */
export function nextElements(m: RecursiveModel, tree: UINode, boxes: Record<string, Box>, k = 3): NextElement[] {
  const { d, maxLen } = m.config;
  const canvas = m.w["canvas"].data.subarray(0, d);
  const out: NextElement[] = [];
  const tok = (n: UINode, fallback: Box): Tok => {
    const b = boxes[n.id] ?? fallback;
    return [ALL_TYPES.indexOf(n.type), isContainer(n.type) ? 0 : 1, b[0], b[1], b[2], b[3]];
  };
  const visit = (n: UINode, anc: Float32Array[], own: Float32Array | null, box: Box) => {
    if (!isContainer(n.type)) return;
    box = boxes[n.id] ?? box;
    const given = (n.children ?? []).slice(0, maxLen - 1);
    const ctx: Ctx = { seq: [tok(n, box), ...given.map((c) => tok(c, box))], mem: own ? [...anc, own] : [...anc], given, box, anc, own };
    if (ctx.seq.length < maxLen) {
      const e = step(m, ctx, boxes, n.id, k);
      if (!e.eos) out.push(e);
    }
    const h = run(m, ctx.seq, ctx.mem).h;
    given.forEach((c, j) => visit(c, [...anc, own ?? h[0]], h[j + 1], box));
  };
  visit(tree, [canvas], null, boxes[tree.id] ?? [0, 0, m.config.gx - 1, m.config.gy - 1]);
  return out.sort((a, b) => b.candidates[0].p - a.candidates[0].p);
}

export interface GeneratedNode { tempId: string; parentId: string; index: number; type: string; leaf: boolean; box: Box; p: number }

/**
 * "Hoàn thành bố cục": giải mã tham lam từ container `rootId` (mặc định gốc) xuống, sinh con còn thiếu cho mọi container –
 * kể cả container vừa sinh – tới EOS, đúng như recursive_complete (scripts/paper/tree_decoders.py), giới hạn maxNodes node cả cây.
 * Node sinh ra có tempId g1, g2…; parentId là id node đã có hoặc tempId của node vừa sinh.
 */
export function completeLayout(m: RecursiveModel, tree: UINode, boxes: Record<string, Box>, rootId = tree.id, maxNodes = 100): GeneratedNode[] {
  const { nTypes, maxLen } = m.config;
  const start = contextOf(m, tree, boxes, rootId);
  if (!start) return [];
  let count = 0;
  walkCount(tree, () => count++);
  const out: GeneratedNode[] = [];
  // mỗi node trong lúc giải mã: id (thật hoặc tạm), token, và các con đã có (chỉ node thật)
  type DNode = { id: string; tok: Tok; given: UINode[] };
  const expand = (n: DNode, anc: Float32Array[], own: Float32Array | null) => {
    if (n.tok[1] !== 0) return; // phần tử lá
    const box: Box = [n.tok[2], n.tok[3], n.tok[4], n.tok[5]];
    const kids: DNode[] = n.given.map((c) => ({ id: c.id, tok: tokOf(c, boxes, box), given: (c.children ?? []).slice(0, maxLen - 1) }));
    const seq: Tok[] = [n.tok, ...kids.map((k) => k.tok)];
    const mem: Mat = own ? [...anc, own] : [...anc];
    let gen = 0;
    while (seq.length < maxLen && count < maxNodes) {
      const r = run(m, seq, mem);
      const lc = Float32Array.from(r.heads.c);
      lc[nTypes + 1] = -1e9;
      const c = argmax(lc);
      if (c === nTypes) break; // EOS
      const t = argmax(r.heads.t);
      const b: Box = [argmax(r.heads.x), argmax(r.heads.y), argmax(r.heads.x2), argmax(r.heads.y2)];
      const g: DNode = { id: `g${out.length + 1}`, tok: [c, t, ...b], given: [] };
      out.push({ tempId: g.id, parentId: n.id, index: n.given.length ? readingIndex(n.given, boxes, b) : gen, type: ALL_TYPES[c], leaf: t === 1, box: b, p: softmax(lc)[c] });
      kids.push(g);
      seq.push(g.tok);
      gen++;
      count++;
    }
    const h = run(m, seq, mem).h;
    const ownH = own ?? h[0];
    kids.forEach((k, j) => expand(k, [...anc, ownH], h[j + 1]));
  };
  expand({ id: rootId, tok: start.seq[0], given: start.given }, start.anc, start.own);
  return out;
}

function tokOf(n: UINode, boxes: Record<string, Box>, fallback: Box): Tok {
  const b = boxes[n.id] ?? fallback;
  return [ALL_TYPES.indexOf(n.type), isContainer(n.type) ? 0 : 1, b[0], b[1], b[2], b[3]];
}
function walkCount(n: UINode, f: () => void) {
  f();
  (n.children ?? []).forEach((c) => walkCount(c, f));
}
