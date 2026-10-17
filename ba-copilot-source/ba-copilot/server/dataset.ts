// Duyệt màn gốc của bộ dữ liệu "bổ sung UI" (dataset/roots/*.json) – mỗi BA duyệt trên máy mình rồi xuất file
// kết quả (JSON) gửi lại nhóm để gộp. Phân công: đợt thử mỗi màn có 2 BA duyệt độc lập (đo độ đồng thuận).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTree, UINode, validateTree } from "../shared/design.ts";
import { getDb } from "./db.ts";
import { BizError } from "./service.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = () => process.env.DATASET_DIR ?? join(root, "dataset");
export const REVIEWERS = 10;
export const CRITERIA = [
  { key: "requirement", label: "Đúng yêu cầu nghiệp vụ và quyền người dùng" },
  { key: "complete", label: "Đầy đủ: không thiếu thành phần cần thiết" },
  { key: "noExtra", label: "Không thừa, không trùng, không thêm chức năng ngoài yêu cầu" },
  { key: "layout", label: "Vị trí và bố cục hợp lý" },
  { key: "components", label: "Dùng đúng component và thuộc tính (required, kiểu ô nhập…)" },
  { key: "wording", label: "Nhãn tiếng Việt rõ ràng, đúng miền nghiệp vụ" },
] as const;

interface Matrix { id: string; batch: string; group: string; screenKind: string; domain: string; permission: string; layout: string }
export interface RootItem extends Matrix {
  requirement: { title: string; actor: string; description: string; permissions: string[]; rules?: string[] };
  tree: UINode;
  notes?: string;
  file: string;
}

export function loadRoots(): { items: RootItem[]; version: string } {
  const d = dir();
  if (!existsSync(join(d, "matrix.json"))) return { items: [], version: "" };
  const matrix = new Map((JSON.parse(readFileSync(join(d, "matrix.json"), "utf8")) as Matrix[]).map((m) => [m.id, m]));
  const items: RootItem[] = [];
  const hash = createHash("sha1");
  const rd = join(d, "roots");
  for (const f of existsSync(rd) ? readdirSync(rd).filter((x) => x.endsWith(".json")).sort() : []) {
    const text = readFileSync(join(rd, f), "utf8");
    hash.update(text);
    for (const r of JSON.parse(text) as Omit<RootItem, "file">[]) {
      const m = matrix.get(r.id);
      if (m) items.push({ ...m, ...r, file: f });
    }
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return { items, version: hash.digest("hex").slice(0, 10) };
}

/** BA số k (1..10) được giao màn có thứ tự i khi i % 10 == k−1 hoặc (đợt thử) i % 10 == k % 10 → mỗi màn đợt thử có 2 người. */
export function assigned(items: RootItem[], reviewerNo: number, batch: string): RootItem[] {
  const list = items.filter((x) => x.batch === batch);
  return list.filter((_, i) => i % REVIEWERS === reviewerNo - 1 || (batch === "pilot" && i % REVIEWERS === reviewerNo % REVIEWERS));
}

export function listForReviewer(reviewer: string, reviewerNo: number, batch: string) {
  const { items, version } = loadRoots();
  const rows = getDb().prepare("SELECT root_id, decision, created_at FROM dataset_reviews WHERE reviewer = ? ORDER BY created_at").all(reviewer) as { root_id: string; decision: string }[];
  const last = new Map(rows.map((r) => [r.root_id, r.decision]));
  return {
    version,
    criteria: CRITERIA,
    total: items.length,
    items: assigned(items, reviewerNo, batch).map((x) => ({ id: x.id, title: x.requirement.title, group: x.group, screenKind: x.screenKind, domain: x.domain, decision: last.get(x.id) ?? null })),
  };
}

export function getRoot(id: string, reviewer: string) {
  const { items, version } = loadRoots();
  const item = items.find((x) => x.id === id);
  if (!item) throw new BizError("Không tìm thấy màn", 404);
  const review = getDb().prepare("SELECT decision, criteria, comment, fixed_tree FROM dataset_reviews WHERE root_id = ? AND reviewer = ? ORDER BY created_at DESC LIMIT 1").get(id, reviewer) as
    | { decision: string; criteria: string; comment: string; fixed_tree: string | null }
    | undefined;
  return { item, version, review: review ? { decision: review.decision, criteria: JSON.parse(review.criteria), comment: review.comment, fixedTree: review.fixed_tree ? JSON.parse(review.fixed_tree) : null } : null };
}

export function saveReview(input: { rootId: string; reviewer: string; decision: string; criteria: Record<string, boolean>; comment: string; fixedTree?: unknown }) {
  const { items, version } = loadRoots();
  if (!items.some((x) => x.id === input.rootId)) throw new BizError("Không tìm thấy màn", 404);
  if (!input.reviewer.trim()) throw new BizError("Nhập tên người duyệt");
  if (!["accept", "fix", "reject"].includes(input.decision)) throw new BizError("Quyết định không hợp lệ");
  const failed = CRITERIA.filter((c) => input.criteria[c.key] === false);
  if (input.decision === "accept" && failed.length) throw new BizError(`Không thể chấp nhận khi chưa đạt: ${failed.map((c) => c.label).join("; ")}`);
  if (input.decision !== "accept" && !input.comment.trim()) throw new BizError("Ghi lý do khi chọn Cần sửa hoặc Loại");
  let fixed: string | null = null;
  if (input.fixedTree) {
    const t = normalizeTree(input.fixedTree);
    const v = validateTree(t);
    if (!v.ok) throw new BizError(`Cây đã sửa không hợp lệ: ${v.errors.slice(0, 5).join("; ")}`);
    fixed = JSON.stringify(t);
  }
  getDb()
    .prepare("INSERT INTO dataset_reviews (id, root_id, reviewer, decision, criteria, comment, fixed_tree, data_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), input.rootId, input.reviewer.trim(), input.decision, JSON.stringify(input.criteria), input.comment.trim(), fixed, version, new Date().toISOString());
  return { ok: true };
}

/** Xuất bản duyệt mới nhất của từng (màn, người duyệt). */
export function exportReviews(reviewer?: string) {
  const rows = getDb().prepare("SELECT * FROM dataset_reviews ORDER BY created_at").all() as Record<string, string | null>[];
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    if (reviewer && r.reviewer !== reviewer) continue;
    latest.set(`${r.root_id}|${r.reviewer}`, {
      rootId: r.root_id, reviewer: r.reviewer, decision: r.decision, criteria: JSON.parse(r.criteria as string), comment: r.comment,
      fixedTree: r.fixed_tree ? JSON.parse(r.fixed_tree) : null, dataVersion: r.data_version, reviewedAt: r.created_at,
    });
  }
  return [...latest.values()];
}
