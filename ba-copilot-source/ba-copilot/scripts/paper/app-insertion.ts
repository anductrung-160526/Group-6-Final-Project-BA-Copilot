// Mốc so sánh cho thí nghiệm tọa độ: "chèn đúng chỗ" của mô hình app (Transformer phát hiện chỗ thiếu) trên đúng các trường hợp
// của scripts/paper/coords_experiment.py – bỏ 1 node có anh em ở màn gốc tập test (trừ R168), xét các khe trong đúng container đó,
// lấy khe có P(thiếu) cao nhất → đúng khe? đúng loại? (giống cách chấm Recursive: chỉ nhìn container chứa phần tử bị bỏ).
// Dùng: npx tsx scripts/paper/app-insertion.ts [--tf model/next-transformer.json]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UINode } from "../../shared/design.ts";
import { loadTransformer, predictSlots } from "../../shared/transformer.ts";
import { loadRoots } from "../dataset/roots.ts";
import { splitOf } from "../dataset/build-samples.ts";

const root = join(import.meta.dirname, "..", "..");
const i = process.argv.indexOf("--tf");
const tf = loadTransformer(JSON.parse(readFileSync(i > -1 ? process.argv[i + 1] : join(root, "model", "next-transformer.json"), "utf8")));
const acc = { n: 0, pos: 0, type: 0, both: 0, mid_n: 0, mid_pos: 0, mid_type: 0, mid_both: 0, no_pred: 0 };
for (const r of loadRoots().items.filter((x) => splitOf(x.id) === "test" && x.id !== "R168")) {
  const cases: { parent: UINode; idx: number }[] = [];
  const visit = (n: UINode) => (n.children ?? []).forEach((c, k, arr) => { if (arr.length >= 2) cases.push({ parent: n, idx: k }); visit(c); });
  visit(r.tree);
  for (const { parent, idx } of cases) {
    const removed = parent.children![idx];
    const strip = (n: UINode): UINode => ({ ...n, children: n.children?.filter((c) => c !== removed).map(strip) });
    const partial = strip(r.tree);
    const slots = predictSlots(tf, partial, 1).filter((s) => s.parentId === parent.id).sort((a, b) => b.pMissing - a.pMissing);
    const mid = idx < parent.children!.length - 1;
    acc.n++; acc.mid_n += +mid;
    if (!slots.length) { acc.no_pred++; continue; }
    const s = slots[0];
    const pos = s.index === idx, type = s.types[0]?.type === removed.type;
    acc.pos += +pos; acc.type += +type; acc.both += +(pos && type);
    if (mid) { acc.mid_pos += +pos; acc.mid_type += +type; acc.mid_both += +(pos && type); }
  }
}
const pct = (a: number, b: number) => Math.round((1000 * a) / Math.max(b, 1)) / 10;
const out = { n: acc.n, mid_n: acc.mid_n, pos: pct(acc.pos, acc.n), type: pct(acc.type, acc.n), both: pct(acc.both, acc.n), no_pred: pct(acc.no_pred, acc.n),
  mid_pos: pct(acc.mid_pos, acc.mid_n), mid_type: pct(acc.mid_type, acc.mid_n), mid_both: pct(acc.mid_both, acc.mid_n) };
writeFileSync(join(root, "dataset", "export", "eval", "app-insertion.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
