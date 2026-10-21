// Đối chiếu số học suy luận Recursive TypeScript (shared/recursive.ts) với PyTorch (scripts/paper/export_recursive.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_TYPES, UINode } from "../shared/design.ts";
import { Box, candidateShares, completeLayout, fmtPct, loadRecursive, nextElements, nextInContainer, predictChildren } from "../shared/recursive.ts";

const dir = join(import.meta.dirname, "..", "model");
type PNode = { c: number; t: number; b: number[]; k?: PNode[] };

test("Recursive TS khớp PyTorch (loại, khung bao, xác suất)", { skip: !existsSync(join(dir, "recursive-layout.json")) }, () => {
  const m = loadRecursive(JSON.parse(readFileSync(join(dir, "recursive-layout.json"), "utf8")));
  const parity = JSON.parse(readFileSync(join(dir, "recursive-layout.parity.json"), "utf8")) as { tree: PNode; expected: { path: number[]; children: { c: number; t: number; box: number[]; p: number }[] }[] }[];
  for (const { tree, expected } of parity) {
    const boxes: Record<string, Box> = {};
    const toUI = (n: PNode, id: string): UINode => {
      boxes[id] = n.b as Box;
      return { id, type: ALL_TYPES[n.c] as UINode["type"], props: {}, children: n.k?.map((c, i) => toUI(c, `${id}_${i}`)) ?? (n.t === 0 ? [] : undefined) };
    };
    const ui = toUI(tree, "n");
    const got = predictChildren(m, ui, boxes);
    const want = expected.map((e) => ({ parentId: ["n", ...e.path].join("_"), children: e.children }));
    assert.equal(got.length, want.length);
    for (let i = 0; i < want.length; i++) {
      assert.equal(got[i].parentId, want[i].parentId);
      assert.deepEqual(got[i].children.map((c) => [c.type, c.leaf, ...c.box]), want[i].children.map((c) => [ALL_TYPES[c.c], c.t === 1, ...c.box]));
      got[i].children.forEach((c, j) => assert.ok(Math.abs(c.p - want[i].children[j].p) < 1e-3, `p ${c.p} vs ${want[i].children[j].p}`));
    }
  }
});

type Parity = { tree: PNode; first: { path: number[]; eos: boolean; pEos: number; top: [number, number][]; box: number[] }[]; complete: { parent: string; c: number; t: number; box: number[] }[] };
function toUITree(tree: PNode) {
  const boxes: Record<string, Box> = {};
  const toUI = (n: PNode, id: string): UINode => {
    boxes[id] = n.b as Box;
    return { id, type: ALL_TYPES[n.c] as UINode["type"], props: {}, children: n.k?.map((c, i) => toUI(c, `${id}_${i}`)) ?? (n.t === 0 ? [] : undefined) };
  };
  return { ui: toUI(tree, "n"), boxes };
}

test("Phần tử tiếp theo (top-3) và Hoàn thành bố cục khớp PyTorch", { skip: !existsSync(join(dir, "recursive-layout.json")) }, () => {
  const m = loadRecursive(JSON.parse(readFileSync(join(dir, "recursive-layout.json"), "utf8")));
  const parity = JSON.parse(readFileSync(join(dir, "recursive-layout.parity.json"), "utf8")) as Parity[];
  for (const p of parity) {
    const { ui, boxes } = toUITree(p.tree);
    for (const f of p.first) {
      const id = ["n", ...f.path].join("_");
      const e = nextInContainer(m, ui, boxes, id, 3)!;
      assert.equal(e.eos, f.eos, id);
      assert.ok(Math.abs(e.pEos - f.pEos) < 1e-3, `pEos ${id}`);
      assert.deepEqual(e.candidates.map((c) => c.type), f.top.map(([c]) => ALL_TYPES[c]));
      e.candidates.forEach((c, j) => assert.ok(Math.abs(c.p - f.top[j][1]) < 1e-3));
      assert.deepEqual(e.box, f.box);
    }
    // nextElements = các container không đoán EOS, cùng phân phối với nextInContainer
    const all = nextElements(m, ui, boxes);
    assert.deepEqual(all.map((e) => e.parentId).sort(), p.first.filter((f) => !f.eos).map((f) => ["n", ...f.path].join("_")).sort());
    const got = completeLayout(m, ui, boxes);
    assert.deepEqual(got.map((g) => [g.parentId, g.type, g.leaf, ...g.box]), p.complete.map((c) => [c.parent, ALL_TYPES[c.c], c.t === 1, ...c.box]));
  }
});

test("fmtPct: 0 → 0%, rất nhỏ → <1%, còn lại làm tròn", () => {
  assert.equal(fmtPct(0), "0%");
  assert.equal(fmtPct(0.0004), "<1%");
  assert.equal(fmtPct(0.004), "<1%");
  assert.equal(fmtPct(0.005), "1%");
  assert.equal(fmtPct(0.374), "37%");
  assert.equal(fmtPct(1), "100%");
  assert.equal(fmtPct(Number.NaN), "0%");
});

test("candidateShares: EOS áp đảo → tỉ lệ giữa các ứng viên (tổng 100%), không còn toàn 0%", () => {
  const s = candidateShares([
    { type: "Link", p: 0.0006 },
    { type: "Button", p: 0.0003 },
    { type: "Row", p: 0.0001 },
  ]);
  assert.deepEqual(s.map((c) => fmtPct(c.share)), ["60%", "30%", "10%"]);
  assert.ok(Math.abs(s.reduce((a, c) => a + c.share, 0) - 1) < 1e-9);
  assert.equal(s[0].type, "Link");
  assert.equal(s[0].p, 0.0006);
  // tổng bằng 0 → chia đều
  assert.deepEqual(candidateShares([{ type: "A", p: 0 }, { type: "B", p: 0 }]).map((c) => c.share), [0.5, 0.5]);
});
