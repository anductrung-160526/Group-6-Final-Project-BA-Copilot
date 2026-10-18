// Kiểm tra màn gốc: cây hợp lệ theo schema của app, id snake_case duy nhất, kích thước, quy tắc quyền (cảnh báo),
// và độ đa dạng của cả bộ: cặp màn giống nhau ≥ 70% (Jaccard trên đa tập cặp loại cha–con), tỷ trọng component, tên lặp.
// Dùng: npx tsx scripts/dataset/validate-roots.ts dataset/roots/*.json
import { readFileSync } from "node:fs";
import { isContainer, UINode, validateTree, walk } from "../../shared/design.ts";

export interface RootRecord {
  id: string;
  requirement: { title: string; actor: string; description: string; permissions: string[]; rules?: string[] };
  tree: UINode;
  notes?: string;
}

export function checkRoot(r: RootRecord, permission = ""): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (!r.id || !r.requirement?.title || !r.requirement?.description || !Array.isArray(r.requirement?.permissions)) errors.push("thiếu id/requirement.title/description/permissions");
  if (!r.tree) return { errors: [...errors, "thiếu tree"], warnings };
  const v = validateTree(r.tree);
  errors.push(...v.errors);
  let n = 0;
  const labels: string[] = [];
  walk(r.tree, (x) => {
    n++;
    if (!/^[a-z][a-z0-9_]*$/.test(x.id)) errors.push(`id không phải snake_case: ${x.id}`);
    if (isContainer(x.type) && !(x.children ?? []).length) errors.push(`${x.type} ${x.id} rỗng`);
    if (x.type === "Button") labels.push(String(x.props.label ?? "").toLowerCase());
    if (x.type === "Table") labels.push(...((x.props.rowActions as string[]) ?? []).map((s) => s.toLowerCase()));
    if (["Input", "Textarea", "Select", "DatePicker", "Checkbox", "Radio"].includes(x.type) && !x.props.name) errors.push(`${x.type} ${x.id} thiếu name`);
  });
  if (n < 10 || n > 70) errors.push(`kích thước ${n} node (cần 10–70)`);
  const perm = `${permission} ${r.requirement?.permissions?.join(" ")}`.toLowerCase();
  if (/chỉ xem/.test(perm) && labels.some((l) => /^(thêm|tạo|sửa|xóa|xoá|chỉnh sửa|lưu)/.test(l) && !/bộ lọc|tìm kiếm/.test(l))) warnings.push("màn 'chỉ xem' có nút thêm/sửa/xóa/lưu");
  if (/chỉ được tạo/.test(perm) && labels.some((l) => /^(sửa|xóa|xoá)/.test(l))) warnings.push("màn 'chỉ tạo' có sửa/xóa");
  return { errors, warnings };
}

export function diversity(roots: RootRecord[], threshold = 0.7) {
  const bags = roots.map((r) => {
    const b = new Map<string, number>();
    walk(r.tree, (n, p) => b.set(`${p?.type ?? "^"}>${n.type}`, (b.get(`${p?.type ?? "^"}>${n.type}`) ?? 0) + 1));
    return b;
  });
  const jac = (a: Map<string, number>, b: Map<string, number>) => {
    let i = 0, u = 0;
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      i += Math.min(a.get(k) ?? 0, b.get(k) ?? 0);
      u += Math.max(a.get(k) ?? 0, b.get(k) ?? 0);
    }
    return i / Math.max(u, 1);
  };
  let sum = 0, n = 0;
  const similar: { a: string; b: string; j: number }[] = [];
  for (let x = 0; x < roots.length; x++)
    for (let y = x + 1; y < roots.length; y++) {
      const j = jac(bags[x], bags[y]);
      sum += j; n++;
      if (j >= threshold) similar.push({ a: roots[x].id, b: roots[y].id, j });
    }
  const types = new Map<string, number>();
  for (const r of roots) walk(r.tree, (t) => types.set(t.type, (types.get(t.type) ?? 0) + 1));
  const total = [...types.values()].reduce((a, b) => a + b, 0);
  const [topType, top] = [...types.entries()].filter(([t]) => t !== "Page").sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  return { meanJaccard: sum / Math.max(n, 1), similar: similar.sort((p, q) => q.j - p.j), types: types.size, topType, topShare: top / Math.max(total, 1),
    uniqueTitles: new Set(roots.map((r) => r.requirement?.title)).size };
}

if (process.argv[1]?.endsWith("validate-roots.ts")) {
  const matrix = JSON.parse(readFileSync(new URL("../../dataset/matrix.json", import.meta.url), "utf8")) as { id: string; permission: string }[];
  const perm = new Map(matrix.map((m) => [m.id, m.permission]));
  let bad = 0, total = 0;
  for (const f of process.argv.slice(2)) {
    for (const r of JSON.parse(readFileSync(f, "utf8")) as RootRecord[]) {
      total++;
      const { errors, warnings } = checkRoot(r, perm.get(r.id));
      if (errors.length) bad++;
      if (errors.length || warnings.length) console.log(`${r.id}: ${[...errors.map((e) => "LỖI " + e), ...warnings.map((w) => "CẢNH BÁO " + w)].join(" | ")}`);
    }
  }
  console.log(`${total} màn, ${bad} màn lỗi`);
  const all = process.argv.slice(2).flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as RootRecord[]);
  const d = diversity(all);
  for (const p of d.similar) console.log(`CẢNH BÁO giống nhau ${(p.j * 100).toFixed(0)}%: ${p.a} ~ ${p.b}`);
  console.log(`Đa dạng: Jaccard TB ${d.meanJaccard.toFixed(3)} · ${d.similar.length} cặp ≥ 70% · ${d.types} loại component · nhiều nhất ${d.topType} (${(d.topShare * 100).toFixed(1)}%) · ${d.uniqueTitles}/${all.length} tên khác nhau`);
  process.exit(bad ? 1 : 0);
}
