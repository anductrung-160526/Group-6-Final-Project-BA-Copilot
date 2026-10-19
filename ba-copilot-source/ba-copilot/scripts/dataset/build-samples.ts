// Sinh mẫu "bổ sung UI" (cách B) từ màn gốc:
//   mỗi mẫu = { requirement, partialTree, targetContainerId, acceptedPatch, completedTree, review, ... }
// Kiểu mẫu:
//   - missing_one   : bỏ 1 phần tử chức năng (nút, ô nhập, bộ lọc, bảng, phân trang, thông báo...)
//   - missing_group : bỏ 1 cụm (Row nút, thanh lọc, Form, Section, Modal...) → patch chèn cả cụm
//   - missing_pair  : bỏ 2 phần tử anh em (vd nút Lưu + Hủy)
//   - missing_multi : bỏ 2–4 phần tử/cụm rải rác (không lồng nhau, không liền kề trong cùng cha) – màn làm dở nhiều chỗ
//   - complete      : màn đủ, đáp án rỗng; nếu màn bị giới hạn quyền (chỉ xem / chỉ tạo / chỉ duyệt) thì là mẫu "bẫy"
// Không xóa Text/Image/Divider/Avatar/Heading đơn lẻ (khó đoán, ít giá trị cho BA).
// Chia tập theo MÀN GỐC trước khi sinh biến thể: mọi biến thể của một màn nằm cùng train/val/test.
// Kiểm nghiệm màn do nhóm làm theo cách riêng; kết quả (nếu có) đưa vào bằng --reviews: file JSON dạng
//   { "reviews": [{ "rootId": "R001", "decision": "accept" | "fix" | "reject", "reviewer": "...", "fixedTree": {...}? }] }
//   màn bị "reject" hoặc "fix" không kèm cây sửa sẽ bị loại; "fix" có cây sửa thì dùng cây sửa.
// Mỗi biến thể là một tập id bị bỏ khác nhau (khử trùng), nên số mẫu/màn ≤ --per-root.
// Mặc định 67: 200 màn gốc → ~10 nghìn mẫu (màn nhỏ có ít tổ hợp nên ít mẫu hơn).
// Dùng: npx tsx scripts/dataset/build-samples.ts [--reviews kq.json,...] [--only-reviewed] [--per-root 67]
//        → data/dataset/samples.jsonl + data/dataset/stats.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { cloneTree, findParent, isContainer, UINode, walk } from "../../shared/design.ts";
import { applyPatch } from "../../shared/patch.ts";
import type { PatchOp } from "../../shared/patch.ts";
import { rng } from "../build-next-model.ts";
import { loadRoots, RootItem, splitOf } from "./roots.ts";

const root = join(import.meta.dirname, "..", "..");
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};

const FUNCTIONAL = new Set(["Button", "Link", "Input", "Textarea", "Select", "Checkbox", "Radio", "DatePicker", "Table", "Pagination", "Stat", "Alert", "Badge"]);
const GROUPS = new Set(["Row", "Column", "Form", "Section", "Card", "Modal", "List", "Header", "Sidebar"]);
const RESTRICTED = /chỉ xem|chỉ được tạo|chỉ được duyệt|bản ghi của chính mình/i;

export interface Sample {
  id: string;
  rootId: string;
  split: "train" | "val" | "test";
  kind: "missing_one" | "missing_group" | "missing_pair" | "missing_multi" | "complete";
  trap: boolean;
  meta: { group: string; screenKind: string; domain: string; permission: string; layout: string };
  requirement: RootItem["requirement"];
  partialTree: UINode;
  targetContainerId: string | null;
  acceptedPatch: PatchOp[];
  acceptedAlternatives: PatchOp[][];
  completedTree: UINode;
  review: { status: "accepted" | "unreviewed"; reviewers: string[]; dataVersion: string; source: "claude-authored" };
  notes?: string;
}

const size = (n: UINode): number => 1 + (n.children ?? []).reduce((a, c) => a + size(c), 0);
const hasFunctional = (n: UINode) => {
  let f = false;
  walk(n, (x) => (f ||= FUNCTIONAL.has(x.type)));
  return f;
};

export { splitOf } from "./roots.ts";

/** Bỏ các node `ids` (kèm cây con) khỏi cây; trả cây thiếu và patch chèn lại đúng vị trí (thứ tự tăng dần theo index). */
function removeWithPatch(tree: UINode, ids: string[]): { partial: UINode; patch: PatchOp[]; container: string } {
  const partial = cloneTree(tree);
  const patch: PatchOp[] = [];
  let container = "";
  // ghi vị trí theo cây gốc, chèn lại theo thứ tự tăng dần nên index gốc vẫn đúng
  const items = ids.map((id) => {
    const p = findParent(tree, id)!;
    return { id, parentId: p.id, index: p.children!.findIndex((c) => c.id === id) };
  }).sort((a, b) => a.index - b.index);
  for (const it of items) {
    const node = cloneTree(walkFind(tree, it.id)!);
    patch.push({ op: "insert", parentId: it.parentId, index: it.index, node } as PatchOp);
    container ||= it.parentId;
  }
  const drop = new Set(ids);
  const prune = (n: UINode) => {
    if (n.children) n.children = n.children.filter((c) => !drop.has(c.id)).map((c) => (prune(c), c));
  };
  prune(partial);
  return { partial, patch, container };
}
function walkFind(t: UINode, id: string): UINode | null {
  let f: UINode | null = null;
  walk(t, (x) => {
    if (!f && x.id === id) f = x;
  });
  return f;
}

export function samplesForRoot(r: RootItem, tree: UINode, review: Sample["review"], perRoot: number, seed: number): Sample[] {
  const rand = rng(seed);
  const shuffle = <T,>(a: T[]) => a.map((x) => [rand(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const singles: string[] = [], groups: string[] = [], pairs: [string, string][] = [];
  walk(tree, (n, parent) => {
    if (!parent) return;
    if (FUNCTIONAL.has(n.type)) singles.push(n.id);
    if (GROUPS.has(n.type) && size(n) >= 3 && size(n) <= 12 && hasFunctional(n) && size(n) < size(tree) * 0.6) groups.push(n.id);
    if (isContainer(n.type)) {
      const kids = (n.children ?? []).filter((c) => FUNCTIONAL.has(c.type));
      for (let i = 0; i + 1 < kids.length; i++) if (kids[i].type === kids[i + 1].type || kids[i].type === "Button") pairs.push([kids[i].id, kids[i + 1].id]);
    }
  });
  const restricted = RESTRICTED.test(`${r.permission} ${r.requirement.permissions.join(" ")}`);
  const plan: { kind: Sample["kind"]; ids: string[] }[] = [{ kind: "complete", ids: [] }];
  const seen = new Set<string>([""]);
  const add = (kind: Sample["kind"], ids: string[]) => {
    const key = [...ids].sort().join(",");
    if (plan.length >= perRoot || seen.has(key)) return;
    seen.add(key);
    plan.push({ kind, ids });
  };
  const nGroup = Math.min(groups.length, Math.round(perRoot * 0.2));
  const nPair = Math.min(pairs.length, Math.round(perRoot * 0.1));
  const nOne = Math.min(singles.length, Math.round(perRoot * 0.4));
  for (const g of shuffle(groups).slice(0, nGroup)) add("missing_group", [g]);
  for (const p of shuffle(pairs).slice(0, nPair)) add("missing_pair", p);
  for (const s of shuffle(singles).slice(0, nOne)) add("missing_one", [s]);
  // nhiều chỗ thiếu: 2–4 phần tử rải rác, không phần tử nào là tổ tiên của phần tử khác, không liền kề trong cùng cha
  const parentOf = new Map<string, string>(), indexOf = new Map<string, number>();
  walk(tree, (n, parent) => {
    if (!parent) return;
    parentOf.set(n.id, parent.id);
    indexOf.set(n.id, parent.children!.indexOf(n));
  });
  const adjacent = (a: string, b: string) => parentOf.get(a) === parentOf.get(b) && Math.abs(indexOf.get(a)! - indexOf.get(b)!) <= 1;
  const ancestors = (id: string) => {
    const a = new Set<string>();
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) a.add(p);
    return a;
  };
  const pool = [...singles, ...groups];
  for (let tries = 0; plan.length < perRoot && tries < perRoot * 40 && pool.length >= 2; tries++) {
    const u = rand();
    const k = u < 0.5 ? 2 : u < 0.85 ? 3 : 4;
    const pick: string[] = [];
    for (const id of shuffle(pool)) {
      if (pick.length === k) break;
      if (pick.some((x) => adjacent(x, id) || ancestors(id).has(x) || ancestors(x).has(id))) continue;
      pick.push(id);
    }
    if (pick.length >= 2) add("missing_multi", pick);
  }
  // màn ít ứng viên: bù bằng phần tử đơn còn lại
  for (const s of shuffle(singles)) add("missing_one", [s]);

  const meta = { group: r.group, screenKind: r.screenKind, domain: r.domain, permission: r.permission, layout: r.layout };
  return plan.map((p, i) => {
    const base = { rootId: r.id, split: splitOf(r.id), kind: p.kind, trap: p.kind === "complete" && restricted, meta, requirement: r.requirement, completedTree: tree, acceptedAlternatives: [], review };
    if (!p.ids.length) return { id: `${r.id}-${String(i).padStart(2, "0")}`, ...base, partialTree: cloneTree(tree), targetContainerId: null, acceptedPatch: [] };
    const { partial, patch, container } = removeWithPatch(tree, p.ids);
    // kiểm tra: áp patch vào cây thiếu phải ra đúng cây đầy đủ
    const back = applyPatch(partial, patch).tree;
    if (JSON.stringify(back) !== JSON.stringify(tree)) throw new Error(`${r.id}: patch không tái tạo đúng cây (${p.ids.join(",")})`);
    return { id: `${r.id}-${String(i).padStart(2, "0")}`, ...base, partialTree: partial, targetContainerId: container, acceptedPatch: patch };
  });
}

/** Gộp kết quả duyệt: màn được dùng khi mọi người duyệt đều Chấp nhận, hoặc có bản sửa được chấp nhận (dùng bản sửa). */
export function mergeReviews(files: string[]) {
  const by = new Map<string, { reviewer: string; decision: string; fixedTree: UINode | null }[]>();
  for (const f of files) for (const r of JSON.parse(readFileSync(f, "utf8")).reviews ?? []) by.set(r.rootId, [...(by.get(r.rootId) ?? []), r]);
  return by;
}

if (process.argv[1]?.endsWith("build-samples.ts")) {
  const perRoot = Number(arg("--per-root", "67"));
  const allowUnreviewed = !process.argv.includes("--only-reviewed");
  const reviews = mergeReviews(arg("--reviews", "").split(",").filter(Boolean));
  const { items, version } = loadRoots();
  const out: Sample[] = [];
  const skipped: Record<string, number> = {};
  for (const r of items) {
    const rv = reviews.get(r.id) ?? [];
    let tree = r.tree, status: Sample["review"]["status"] = "accepted";
    if (rv.some((x) => x.decision === "reject")) { skipped.rejected = (skipped.rejected ?? 0) + 1; continue; }
    const fixed = rv.find((x) => x.decision === "fix" && x.fixedTree);
    if (rv.some((x) => x.decision === "fix") && !fixed) { skipped.needs_fix = (skipped.needs_fix ?? 0) + 1; continue; }
    if (fixed) tree = fixed.fixedTree!;
    if (!rv.length) {
      if (!allowUnreviewed) { skipped.unreviewed = (skipped.unreviewed ?? 0) + 1; continue; }
      status = "unreviewed";
    }
    const seed = parseInt(createHash("sha1").update(r.id).digest("hex").slice(0, 8), 16);
    out.push(...samplesForRoot(r, tree, { status, reviewers: rv.map((x) => x.reviewer), dataVersion: version, source: "claude-authored" }, perRoot, seed));
  }
  const dir = join(root, "data", "dataset");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "samples.jsonl"), out.map((s) => JSON.stringify(s)).join("\n") + "\n");
  const count = (f: (s: Sample) => string) => out.reduce((a, s) => ((a[f(s)] = (a[f(s)] ?? 0) + 1), a), {} as Record<string, number>);
  const stats = { roots: new Set(out.map((s) => s.rootId)).size, samples: out.length, skipped, bySplit: count((s) => s.split), byKind: count((s) => s.kind), traps: out.filter((s) => s.trap).length, byGroup: count((s) => s.meta.group), dataVersion: version };
  writeFileSync(join(dir, "stats.json"), JSON.stringify(stats, null, 1));
  console.log(JSON.stringify(stats, null, 1));
}
