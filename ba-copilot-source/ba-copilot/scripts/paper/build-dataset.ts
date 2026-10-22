// Bộ dữ liệu cây UI web có tọa độ để tái lập Vanilla Transformer Tree Decoder (Li et al. 2020, mục 4.2, 5.1).
// Chỉ dùng dataset/roots/*.json (màn web nghiệp vụ do nhóm tạo) – không WebSight, không Rico.
// Mỗi màn được render bằng Renderer của app trong Chromium ở độ rộng desktop (test: 1280 px; train/val thêm 1024, 1440 px),
// đo khung bao toàn trang, rời rạc hóa: x → 128 ô theo tỷ lệ độ rộng, y → ô 10 px, tối đa 256 ô (2560 px, phần dài hơn kẹp).
// Lọc như bài báo: node không hiển thị hoặc ra ngoài khung cha (dung sai 2 px) → bỏ cây; > 100 node hoặc cha > 30 con → bỏ cây.
// Chia theo màn gốc (splitOf), mọi biến thể của một màn cùng tập.
// Dùng: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/paper/build-dataset.ts [--widths 1024,1280,1440] [--cell-y 10] [--cell-x 128] [--gy 256] [--max-root 800] [--out data/paper]
//   --cell-x: số ô theo chiều ngang (thí nghiệm lưới, STRICT-NEXT.md – ngoài bài báo); --max-root: chỉ lấy màn R001..R<n>.
//   Màn R401+ có test riêng → test_new.jsonl ("test-mới"); test của 400 màn cũ (38 màn, chia 80/10/10) giữ nguyên.
//   → <out>/{train,val,test}.jsonl + stats.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";
import { ALL_TYPES, UINode } from "../../shared/design.ts";
import { loadRoots } from "../dataset/roots.ts";
import { splitOf } from "../dataset/build-samples.ts";

const root = join(import.meta.dirname, "..", "..");
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};
const GX = Number(arg("--cell-x", "128")), GY = Number(arg("--gy", "256")), TOL = 2;
const MAX_ROOT = Number(arg("--max-root", "100000"));
// --aug K: thêm K biến thể bố cục cho mỗi màn TRAIN ở mỗi độ rộng (val/test giữ nguyên). Biến thể giữ nguyên cấu trúc cây và
// loại phần tử, chỉ đổi thuộc tính làm thay đổi khung bao: độ dài chữ, số dòng bảng, khoảng cách Row, chiều cao ảnh.
// Đây là tăng cường dữ liệu của nhóm (ngoài bài báo); mô hình và cách huấn luyện giữ nguyên. DATA-LIMITED.md.
const AUG = Number(arg("--aug", "0"));
// --trees file.jsonl: dựng từ kho cây ngoài (vd WebSight đã chuyển sang 28 loại của app) thay cho dataset/roots – dùng cho
// TIỀN HUẤN LUYỆN (ngoài bài báo). Mỗi cây render ở MỘT độ rộng chọn theo băm trong --widths; ~2% cây vào val để dừng sớm.
const TREES = arg("--trees", "");
function rngOf(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}
function scaleText(t: unknown, f: number): unknown {
  if (typeof t !== "string" || !t.trim()) return t;
  const w = t.split(/\s+/);
  const n = Math.max(1, Math.round(w.length * f));
  return Array.from({ length: n }, (_, i) => w[i % w.length]).join(" ");
}
function augment(tree: UINode, seed: string): UINode {
  const r = rngOf(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const walkA = (n: UINode): UINode => {
    const p = { ...n.props };
    if (["Text", "Heading", "Link", "Badge", "Alert"].includes(n.type)) p.text = scaleText(p.text, 0.5 + r() * 1.5);
    if (["Button", "Input", "Textarea", "Select", "Checkbox", "Radio", "DatePicker", "Stat"].includes(n.type)) p.label = scaleText(p.label, 0.6 + r());
    if (n.type === "Table") {
      const rows = Array.isArray(p.rows) && p.rows.length ? (p.rows as unknown[]) : [((p.columns as string[]) ?? []).map(() => "…")];
      p.rows = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => rows[i % rows.length]);
    }
    if (n.type === "Row") p.gap = pick([4, 8, 12, 16, 24]);
    if (n.type === "Image") p.height = 100 + Math.floor(r() * 220);
    return { ...n, props: p, ...(n.children ? { children: n.children.map(walkA) } : {}) };
  };
  return walkA(tree);
}
const CELL_Y = Number(arg("--cell-y", "10"));
const WIDTHS = arg("--widths", "1024,1280,1440").split(",").map(Number);
const OUT = join(root, arg("--out", "data/paper"));
type PNode = { c: number; t: number; b: number[]; k?: PNode[] };

const js = await esbuild.build({ entryPoints: [join(import.meta.dirname, "measure-entry.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const css = readFileSync(join(root, "frontend", "src", "styles.css"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{margin:0;background:#fff}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text}</script></body></html>`;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

const out: Record<string, string[]> = { train: [], val: [], test: [], test_new: [] };
const dropped: Record<string, number> = {};
const droppedRoots: Record<string, string[]> = {};
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  await page.setContent(html);
  const qx = (v: number) => Math.max(0, Math.min(GX - 1, Math.floor((v / w) * GX)));
  const qy = (v: number) => Math.max(0, Math.min(GY - 1, Math.floor(v / CELL_Y)));
  const items = TREES
    ? readFileSync(TREES, "utf8").split("\n").filter(Boolean).map((l, i) => ({ id: `W${i}`, group: "websight", tree: JSON.parse(l).tree as UINode }))
    : loadRoots().items;
  for (const r of items) {
    if (TREES) {
      const h = [...r.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      if (WIDTHS[h % WIDTHS.length] !== w) continue;
      const split = h % 50 === 0 ? "val" : "train";
      const box: Record<string, number[]> = await page.evaluate((t) => (window as any).measure(t), r.tree as any);
      let bad = "", n = 0;
      const conv = (x: UINode, parent: number[] | null): PNode => {
        n++;
        const b = box[x.id];
        if (!b || b[2] - b[0] <= 0 || b[3] - b[1] <= 0) bad ||= `không hiển thị (${x.type})`;
        else if (parent && (b[0] < parent[0] - TOL || b[1] < parent[1] - TOL || b[2] > parent[2] + TOL || b[3] > parent[3] + TOL)) bad ||= `ra ngoài khung cha (${x.type})`;
        if ((x.children?.length ?? 0) > 30) bad ||= "cha > 30 con";
        const node: PNode = { c: ALL_TYPES.indexOf(x.type), t: x.children?.length ? 0 : 1, b: b ? [qx(b[0]), qy(b[1]), qx(b[2]), qy(b[3])] : [0, 0, 0, 0] };
        if (x.children?.length) node.k = x.children.map((c) => conv(c, b ?? parent));
        return node;
      };
      const tree = conv(r.tree, null);
      if (n > 100) bad ||= "> 100 node";
      if (bad) { dropped[bad] = (dropped[bad] ?? 0) + 1; continue; }
      out[split].push(JSON.stringify({ id: `${r.id}@${w}`, rootId: r.id, width: w, cellY: CELL_Y, group: "websight", tree }));
      continue;
    }
    const num = Number(r.id.slice(1));
    if (num > MAX_ROOT) continue;
    const split = splitOf(r.id) === "test" && num > 400 ? "test_new" : splitOf(r.id);
    if (split.startsWith("test") && w !== 1280) continue;
    const variants: { tree: UINode; id: string }[] = [{ tree: r.tree, id: `${r.id}@${w}` }];
    if (split === "train") for (let k = 1; k <= AUG; k++) variants.push({ tree: augment(r.tree, `${r.id}|${w}|${k}`), id: `${r.id}~a${k}@${w}` });
    for (const v of variants) {
    const box: Record<string, number[]> = await page.evaluate((t) => (window as any).measure(t), v.tree as any);
    let bad = "", n = 0;
    const conv = (x: UINode, parent: number[] | null): PNode => {
      n++;
      const b = box[x.id];
      if (!b || b[2] - b[0] <= 0 || b[3] - b[1] <= 0) bad ||= `không hiển thị (${x.type})`;
      else if (parent && (b[0] < parent[0] - TOL || b[1] < parent[1] - TOL || b[2] > parent[2] + TOL || b[3] > parent[3] + TOL)) bad ||= `ra ngoài khung cha (${x.type})`;
      if ((x.children?.length ?? 0) > 30) bad ||= "cha > 30 con";
      const node: PNode = { c: ALL_TYPES.indexOf(x.type), t: x.children?.length ? 0 : 1, b: b ? [qx(b[0]), qy(b[1]), qx(b[2]), qy(b[3])] : [0, 0, 0, 0] };
      if (x.children?.length) node.k = x.children.map((c) => conv(c, b ?? parent));
      return node;
    };
    const tree = conv(v.tree, null);
    if (n > 100) bad ||= "> 100 node";
    if (bad) {
      dropped[bad] = (dropped[bad] ?? 0) + 1;
      (droppedRoots[bad] ??= []).push(v.id);
      continue;
    }
    out[split].push(JSON.stringify({ id: v.id, rootId: r.id, width: w, cellY: CELL_Y, group: r.group, tree }));
    }
  }
  await page.close();
}
await browser.close();

// thống kê như mục 5.1
const trees = Object.values(out).flat().map((l) => JSON.parse(l).tree as PNode);
const sizes: number[] = [], depths: number[] = [];
const types: Record<string, number> = {};
const walkP = (n: PNode, d: number, acc: { n: number; d: number }) => {
  acc.n++; acc.d = Math.max(acc.d, d);
  types[ALL_TYPES[n.c]] = (types[ALL_TYPES[n.c]] ?? 0) + 1;
  (n.k ?? []).forEach((c) => walkP(c, d + 1, acc));
};
for (const t of trees) { const a = { n: 0, d: 0 }; walkP(t, 1, a); sizes.push(a.n); depths.push(a.d); }
const mean = (v: number[]) => +(v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1)).toFixed(2);
mkdirSync(OUT, { recursive: true });
for (const [k, v] of Object.entries(out)) writeFileSync(join(OUT, `${k}.jsonl`), v.join("\n") + "\n");
const stats = {
  source: "dataset/roots (UI web nghiệp vụ do nhóm tạo, không WebSight)", grid: { x: `${GX} ô theo tỷ lệ độ rộng`, y: `ô ${CELL_Y} px, tối đa ${GY}` }, widths: WIDTHS, aug: AUG, gx: GX, gy: GY, cellY: CELL_Y, maxRoot: MAX_ROOT,
  trees: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), roots: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, new Set(v.map((l) => JSON.parse(l).rootId)).size])),
  nodes: { mean: mean(sizes), min: Math.min(...sizes), max: Math.max(...sizes) }, depth: { mean: mean(depths), min: Math.min(...depths), max: Math.max(...depths) },
  types, dropped, droppedRoots,
};
writeFileSync(join(OUT, "stats.json"), JSON.stringify(stats, null, 1));
console.log(JSON.stringify({ ...stats, types: undefined, droppedRoots: undefined }, null, 1));
