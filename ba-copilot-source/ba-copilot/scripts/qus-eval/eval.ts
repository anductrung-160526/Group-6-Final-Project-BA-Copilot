// Đánh giá bộ chấm QUS theo cách của Lucassen et al. 2016 (§5): recall / precision theo từng tiêu chí (Bảng 5),
// micro và macro theo bộ (Bảng 4), khoảng tin cậy bootstrap 95% (ngoài bài báo), ablation từng cải tiến v2.
// Dùng: npx tsx scripts/qus-eval/eval.ts --stories dataset/qus-eval/stories.jsonl --labels dataset/qus-eval/labels.jsonl
//        [--split dev|test|all] [--out dataset/export/eval/qus-eval.json]
// stories.jsonl: { id, set, text, split? }   labels.jsonl: { id, defects: { "well-formed": bool, atomic, minimal, uniform, unique } }
import "../../shared/nlp-node.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { ALL_V2, analyzeSet, type QusCriterion, type V2Feature } from "../../shared/aqusa.ts";
import { scoreStories as legacyScore } from "./qus-legacy.ts";

const CRIT: QusCriterion[] = ["well-formed", "atomic", "minimal", "uniform", "unique"];
const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const jsonl = (f: string) => readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

interface Story { id: string; set: string; text: string; split?: string }
type Pred = Record<string, Set<QusCriterion>>; // id -> tiêu chí bị báo lỗi

const split = arg("split", "all");
const stories: Story[] = jsonl(arg("stories", "dataset/qus-eval/stories.jsonl")).filter((s: Story) => split === "all" || split.split(",").includes(s.split ?? ""));
const labels = new Map<string, Record<QusCriterion, boolean>>(jsonl(arg("labels", "dataset/qus-eval/labels.jsonl")).map((l: any) => [l.id, l.defects]));
const bySet = new Map<string, Story[]>();
for (const s of stories) if (labels.has(s.id)) bySet.set(s.set, [...(bySet.get(s.set) ?? []), s]);
const evalStories = [...bySet.values()].flat();

// Tiêu chí uniform/unique xét trong từng bộ gốc (như bài báo chấm từng bộ của từng công ty).
function predictAqusa(v2: V2Feature[]): Pred {
  const p: Pred = {};
  for (const list of bySet.values()) analyzeSet(list.map((s) => s.text), { v2 }).forEach((d, i) => (p[list[i].id] = new Set(d.map((x) => x.criterion))));
  return p;
}
const LEGACY_MAP: Record<string, QusCriterion> = { WELL_FORMED: "well-formed", ATOMIC: "atomic", MINIMAL: "minimal", NOT_UNIFORM: "uniform", DUPLICATE: "unique" };
function predictLegacy(): Pred {
  const p: Pred = {};
  for (const list of bySet.values()) {
    // Mỗi story một dòng có gạch đầu dòng để bộ tách story cũ không gộp/tách sai.
    const r = legacyScore(list.map((s) => `- ${s.text.replace(/\s+/g, " ")}`).join("\n"));
    list.forEach((s, i) => (p[s.id] = new Set((r.stories[i]?.issues ?? []).map((x) => LEGACY_MAP[x.code]).filter(Boolean))));
  }
  return p;
}

interface Counts { def: number; tp: number; fp: number; fn: number }
function counts(pred: Pred, ids: string[], c?: QusCriterion): Counts {
  const k = { def: 0, tp: 0, fp: 0, fn: 0 };
  for (const id of ids)
    for (const cr of c ? [c] : CRIT) {
      const g = !!labels.get(id)![cr];
      const y = pred[id]?.has(cr) ?? false;
      if (y) k.def++;
      if (g && y) k.tp++;
      else if (!g && y) k.fp++;
      else if (g && !y) k.fn++;
    }
  return k;
}
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
const rp = (k: Counts) => ({ ...k, recall: pct(k.tp, k.tp + k.fn), precision: pct(k.tp, k.tp + k.fp), f1: k.tp ? Math.round((2000 * k.tp) / (2 * k.tp + k.fp + k.fn)) / 10 : 0 });

// Bootstrap theo story (ngoài bài báo): 1000 lần, seed cố định.
function bootstrap(pred: Pred, ids: string[], n = 1000) {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const R: number[] = [], P: number[] = [];
  for (let b = 0; b < n; b++) {
    const sample = ids.map(() => ids[Math.floor(rnd() * ids.length)]);
    const k = counts(pred, sample);
    if (k.tp + k.fn) R.push((100 * k.tp) / (k.tp + k.fn));
    if (k.tp + k.fp) P.push((100 * k.tp) / (k.tp + k.fp));
  }
  const ci = (a: number[]) => { a.sort((x, y) => x - y); return [Math.round(a[Math.floor(0.025 * a.length)] * 10) / 10, Math.round(a[Math.floor(0.975 * a.length)] * 10) / 10]; };
  return { recall95: ci(R), precision95: ci(P) };
}

function report(name: string, pred: Pred) {
  const ids = evalStories.map((s) => s.id);
  const perCrit = Object.fromEntries(CRIT.map((c) => [c, rp(counts(pred, ids, c))]));
  const micro = rp(counts(pred, ids));
  // Macro: trung bình recall/precision của từng bộ (bỏ bộ không có lỗi thật / không báo lỗi nào).
  const sets = [...bySet.values()].map((l) => rp(counts(pred, l.map((s) => s.id))));
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null; };
  const anyDefect = pct(ids.filter((id) => (pred[id]?.size ?? 0) > 0).length, ids.length);
  return { name, perCriterion: perCrit, micro, macro: { recall: avg(sets.map((x) => x.recall)), precision: avg(sets.map((x) => x.precision)) }, storiesWithDefectPct: anyDefect, ...bootstrap(pred, ids) };
}

// --tagger corenlp: thay bộ gán nhãn bằng Stanford CoreNLP (thí nghiệm so sánh); --jars <đường dẫn jar CoreNLP và models>.
const tagger = arg("tagger", "wink");
if (tagger === "corenlp") {
  const { useCoreNLP } = await import("./corenlp-tagger.ts");
  const info = useCoreNLP(arg("jars", ""), () => { predictAqusa(ALL_V2); predictAqusa([]); for (const f of ALL_V2) predictAqusa(ALL_V2.filter((x) => x !== f)); });
  console.log(`CoreNLP: ${info.strings} chuỗi, ${info.passes} lượt`);
}
const t0 = performance.now();
const full = predictAqusa(ALL_V2);
const msPerStory = Math.round(((performance.now() - t0) / Math.max(evalStories.length, 1)) * 10) / 10;
const results = [report("legacy (main)", predictLegacy()), report("AQUSA v1", predictAqusa([])), report("AQUSA v1+v2", full)];
const ablation = ALL_V2.map((f) => ({ without: f, ...report(`v1+v2 − ${f}`, predictAqusa(ALL_V2.filter((x) => x !== f))).micro }));
const goldAny = pct(evalStories.filter((s) => CRIT.some((c) => labels.get(s.id)![c])).length, evalStories.length);
// Danh sách lỗi của bản đầy đủ để phân tích lỗi (§5.1).
const errors = evalStories.flatMap((s) => CRIT.flatMap((c) => {
  const g = !!labels.get(s.id)![c], y = full[s.id]?.has(c) ?? false;
  return g === y ? [] : [{ id: s.id, set: s.set, criterion: c, type: y ? "FP" : "FN", text: s.text }];
}));

const out = { split, tagger, nStories: evalStories.length, nSets: bySet.size, goldStoriesWithDefectPct: goldAny, msPerStory, results, ablation, errors };
writeFileSync(arg("out", `dataset/export/eval/qus-eval-${split}.json`), JSON.stringify(out, null, 1));
console.log(`${split}: ${evalStories.length} stories, ${bySet.size} sets, gold ≥1 defect ${goldAny}%, ${msPerStory} ms/story`);
for (const r of results) {
  console.log(`\n${r.name}: micro R ${r.micro.recall} P ${r.micro.precision} F1 ${r.micro.f1} | macro R ${r.macro.recall} P ${r.macro.precision} | CI R ${r.recall95} P ${r.precision95} | flagged ${r.storiesWithDefectPct}%`);
  for (const c of CRIT) { const k = r.perCriterion[c]; console.log(`  ${c.padEnd(12)} def ${k.def} TP ${k.tp} FP ${k.fp} FN ${k.fn}  R ${k.recall} P ${k.precision}`); }
}
console.log("\nablation (micro):"); for (const a of ablation) console.log(`  − ${a.without.padEnd(18)} R ${a.recall} P ${a.precision} F1 ${a.f1}`);
