// Đối chiếu số học suy luận Recursive TypeScript (shared/recursive.ts) với PyTorch (scripts/paper/export_recursive.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_TYPES, UINode } from "../shared/design.ts";
import { Box, loadRecursive, predictChildren } from "../shared/recursive.ts";

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
