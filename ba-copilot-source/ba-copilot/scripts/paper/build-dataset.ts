// Bộ dữ liệu kiểu Rico cho tái lập Li et al. 2020 (mục 5.1): mỗi màn gốc của dataset/roots được render trong Chromium
// ở 3 độ rộng màn hình (1024/1280/1440 px) để lấy khung bao thật của từng node, rồi rời rạc hóa tọa độ thành lưới 10 px
// (x, y ∈ [0, 127]; phần dưới 1280 px bị kẹp). Lọc như bài báo: node ra ngoài khung cha/màn → bỏ cây; >100 node hoặc cha >30 con → bỏ.
// Chia theo màn gốc (splitOf), mọi biến thể của một màn cùng tập. Test chỉ dùng độ rộng 1280 px.
// Dùng: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/paper/build-dataset.ts → data/paper/*.jsonl
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";
import { ALL_TYPES, UINode } from "../../shared/design.ts";
import { loadRoots } from "../dataset/roots.ts";
import { splitOf } from "../dataset/build-samples.ts";

const root = join(import.meta.dirname, "..", "..");
const CELL = 10, GRID = 128, WIDTHS = [1024, 1280, 1440];
type PNode = { c: number; t: number; b: number[]; k?: PNode[] };

const js = await esbuild.build({ entryPoints: [join(import.meta.dirname, "measure-entry.tsx")], bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const css = readFileSync(join(root, "client", "styles.css"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css} body{margin:0;background:#fff}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text}</script></body></html>`;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const q = (v: number) => Math.max(0, Math.min(GRID - 1, Math.round(v / CELL)));

const out: Record<string, string[]> = { train: [], val: [], test: [] };
const drop: Record<string, number> = {};
for (const w of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  await page.setContent(html);
  for (const r of loadRoots().items) {
    const split = splitOf(r.id);
    if (split === "test" && w !== 1280) continue;
    const box = await page.evaluate((t) => (window as any).measure(t), r.tree as any);
    let bad = "";
    let n = 0;
    const conv = (x: UINode, parent: number[] | null): PNode => {
      n++;
      const b = box[x.id];
      if (!b || b[2] - b[0] <= 0 || b[3] - b[1] <= 0) bad ||= "không hiển thị";
      else if (parent && (b[0] < parent[0] - 2 || b[1] < parent[1] - 2 || b[2] > parent[2] + 2 || b[3] > parent[3] + 2)) bad ||= "ra ngoài khung cha";
      if ((x.children?.length ?? 0) > 30) bad ||= "cha > 30 con";
      const node: PNode = { c: ALL_TYPES.indexOf(x.type), t: x.children?.length ? 0 : 1, b: b ? b.map(q) : [0, 0, 0, 0] };
      if (x.children?.length) node.k = x.children.map((c) => conv(c, b ?? parent));
      return node;
    };
    const tree = conv(r.tree, null);
    if (n > 100) bad ||= "> 100 node";
    if (bad) { drop[bad] = (drop[bad] ?? 0) + 1; continue; }
    out[split].push(JSON.stringify({ id: `${r.id}@${w}`, rootId: r.id, width: w, tree }));
  }
  await page.close();
}
await browser.close();
mkdirSync(join(root, "data", "paper"), { recursive: true });
for (const [k, v] of Object.entries(out)) writeFileSync(join(root, "data", "paper", `${k}.jsonl`), v.join("\n") + "\n");
const stats = { cell: CELL, grid: GRID, widths: WIDTHS, trees: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), dropped: drop };
writeFileSync(join(root, "data", "paper", "stats.json"), JSON.stringify(stats, null, 1));
console.log(JSON.stringify(stats));
