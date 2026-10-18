// Đánh giá gợi ý "Thêm" của tab Gợi ý đúng như BA nhìn thấy: Recursive (Li et al. 2020) + recursiveAdds, có / không có bộ lọc ứng dụng.
// Trường hợp: ở màn gốc tập val/test (độ rộng 1280 px), bỏ 1 phần tử lá có anh em → chạy predictChildren trên cây thiếu với khung bao
// đo sẵn (data/paper-w7c20, cùng thứ tự node với màn gốc) → lấy tối đa 5 gợi ý "Thêm" có độ tin cậy cao nhất (như tab Gợi ý, k = 5).
//   trúng  : có gợi ý đúng container + đúng loại của phần tử bị bỏ (trúng + khe: thêm đúng vị trí chèn)
//   chính xác: số gợi ý trúng / số gợi ý hiển thị;  báo động giả: số gợi ý trên màn ĐẦY ĐỦ (không bỏ gì).
// Ngưỡng của bộ lọc chọn trên val (F1 giữa tỷ lệ trúng và độ chính xác), báo cáo test.
// Bộ lọc là lớp ứng dụng, không thuộc bài báo – xem RECURSIVE_FILTER trong shared/nextComponent.ts.
// Dùng: npx tsx scripts/paper/eval-filter.ts [--data data/paper-w7c20] [--model model/recursive-layout.json] [--out eval-filter.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isContainer, UINode } from "../../shared/design.ts";
import { NO_FILTER, RECURSIVE_FILTER, RecursiveFilter, recursiveAdds } from "../../shared/nextComponent.ts";
import { Box, ContainerPrediction, loadRecursive, predictChildren } from "../../shared/recursive.ts";
import { loadRoots } from "../dataset/roots.ts";

const root = join(import.meta.dirname, "..", "..");
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};
const DATA = join(root, arg("--data", "data/paper-w7c20"));
const m = loadRecursive(JSON.parse(readFileSync(join(root, arg("--model", "model/recursive-layout.json")), "utf8")));
type PNode = { b: number[]; k?: PNode[] };
const roots = new Map(loadRoots().items.map((r) => [r.id, r]));

interface Case { rootId: string; preds: ContainerPrediction[]; tree: UINode; parent?: string; type?: string; idx?: number }
function cases(split: string): Case[] {
  const out: Case[] = [];
  const lines = readFileSync(join(DATA, `${split}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const rec of lines.filter((x) => x.width === 1280)) {
    const r = roots.get(rec.rootId);
    if (!r) continue;
    const boxes: Record<string, Box> = {};
    const zip = (u: UINode, p: PNode) => { boxes[u.id] = p.b as Box; (u.children ?? []).forEach((c, i) => zip(c, p.k![i])); };
    zip(r.tree, rec.tree);
    out.push({ rootId: r.id, tree: r.tree, preds: predictChildren(m, r.tree, boxes) }); // màn đầy đủ
    const visit = (n: UINode) => (n.children ?? []).forEach((c, idx, arr) => {
      if (!isContainer(c.type) && arr.length >= 2) {
        const strip = (x: UINode): UINode => ({ ...x, children: x.children?.filter((k) => k !== c).map(strip) });
        const partial = strip(r.tree);
        out.push({ rootId: r.id, tree: partial, preds: predictChildren(m, partial, boxes), parent: n.id, type: c.type, idx });
      }
      visit(c);
    });
    visit(r.tree);
  }
  return out;
}

function score(cs: Case[], f: RecursiveFilter) {
  let n = 0, hit = 0, hitPos = 0, shown = 0, good = 0, full = 0, fullShown = 0, top1 = 0;
  for (const c of cs) {
    const s = recursiveAdds(c.preds, c.tree, [], f).sort((a, b) => b.confidence - a.confidence).slice(0, 5);
    if (!c.parent) { full++; fullShown += s.length; continue; }
    n++; shown += s.length;
    const ok = s.filter((x) => x.targetNodeId === c.parent && x.id.endsWith(`:${c.type}`));
    good += ok.length;
    hit += +(ok.length > 0);
    hitPos += +ok.some((x) => x.id === `add:${c.parent}:${c.idx}:${c.type}`);
    top1 += +(s[0] && ok.includes(s[0]) ? 1 : 0);
  }
  const pct = (a: number, b: number) => Math.round((1000 * a) / Math.max(b, 1)) / 10;
  const recall = hit / Math.max(n, 1), prec = good / Math.max(shown, 1);
  return { cases: n, hit: pct(hit, n), hit_pos: pct(hitPos, n), top1: pct(top1, n), precision: pct(good, shown), shown_per_screen: +(shown / Math.max(n, 1)).toFixed(2),
    full_screens: full, false_alarms_per_full_screen: +(fullShown / Math.max(full, 1)).toFixed(2), f1: Math.round((1000 * 2 * recall * prec) / (recall + prec || 1)) / 10 };
}

const t0 = Date.now();
const val = cases("val"), test = cases("test");
console.log(`dự đoán xong ${val.length + test.length} trường hợp trong ${Math.round((Date.now() - t0) / 1000)} s`);
const grid = [0.3, 0.4, 0.5, 0.6, 0.7].map((minP) => ({ ...RECURSIVE_FILTER, minP }));
const valRows = grid.map((f) => ({ minP: f.minP, ...score(val, f) }));
const best = grid[valRows.reduce((bi, r, i) => (r.f1 > valRows[bi].f1 ? i : bi), 0)];
const old = (cs: Case[]) => cs.filter((c) => Number(c.rootId.slice(1)) <= 200);
const res = {
  model: arg("--model", "model/recursive-layout.json"), data: arg("--data", "data/paper-w7c20"),
  val_threshold_search: valRows, chosen_minP: best.minP, default_minP: RECURSIVE_FILTER.minP,
  test: { no_filter: score(test, NO_FILTER), filter: score(test, best),
    rules_only: score(test, { ...NO_FILTER, unique: true }), one_per_container_only: score(test, { ...NO_FILTER, onePerContainer: true }) },
  test_old_roots: { no_filter: score(old(test), NO_FILTER), filter: score(old(test), best) },
};
writeFileSync(join(root, "dataset", "export", "eval", arg("--out", "eval-filter.json")), JSON.stringify(res, null, 1));
console.log(JSON.stringify({ val_threshold_search: valRows.map((r) => [r.minP, r.hit, r.precision, r.f1]), chosen: best.minP, test: res.test }, null, 1));
