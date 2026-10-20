// Đọc màn gốc của bộ dữ liệu "bổ sung UI" (dataset/roots/*.json) và ghép với ma trận phủ (dataset/matrix.json).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { UINode } from "../../shared/design.ts";

const dir = () => process.env.DATASET_DIR ?? join(import.meta.dirname, "..", "..", "dataset");

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
  // màn bị loại vì giống màn khác ≥ 70% hoặc trùng tên (dataset/excluded-roots.json, kèm lý do) – không nạp
  const excluded = existsSync(join(d, "excluded-roots.json")) ? new Set(Object.keys(JSON.parse(readFileSync(join(d, "excluded-roots.json"), "utf8")))) : new Set<string>();
  const items: RootItem[] = [];
  const hash = createHash("sha1");
  const rd = join(d, "roots");
  for (const f of existsSync(rd) ? readdirSync(rd).filter((x) => x.endsWith(".json")).sort() : []) {
    const text = readFileSync(join(rd, f), "utf8");
    hash.update(text);
    for (const r of JSON.parse(text) as Omit<RootItem, "file">[]) {
      const m = matrix.get(r.id);
      if (m && !excluded.has(r.id)) items.push({ ...m, ...r, file: f });
    }
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  return { items, version: hash.digest("hex").slice(0, 10) };
}

let SPLIT: Map<string, "train" | "val" | "test"> | null = null;
/**
 * Chia theo màn gốc, phân tầng theo nhóm màn: trong mỗi nhóm, sắp các màn theo băm SHA-1 của id rồi cắt
 * 80% train / 10% val / 10% test (làm tròn) – đúng tỷ lệ của bài báo (§5.3). Cố định, tái lập được; mọi biến thể và độ rộng của một màn cùng tập.
 */
export function splitOf(rootId: string): "train" | "val" | "test" {
  if (!SPLIT) {
    SPLIT = new Map();
    const h = (id: string) => createHash("sha1").update(id).digest("hex");
    const groups = new Map<string, string[]>();
    // Màn R401+ (mở rộng 3) chia riêng để 400 màn cũ giữ nguyên tập train/val/test; test của màn mới là "test-mới".
    for (const r of loadRoots().items) { const k = `${Number(r.id.slice(1)) > 400 ? "new" : "old"}:${r.group}`; groups.set(k, [...(groups.get(k) ?? []), r.id]); }
    for (const ids of groups.values()) {
      ids.sort((a, b) => h(a).localeCompare(h(b)));
      const nTr = Math.round(ids.length * 0.8), nVa = Math.round(ids.length * 0.1);
      ids.forEach((id, i) => SPLIT!.set(id, i < nTr ? "train" : i < nTr + nVa ? "val" : "test"));
    }
  }
  return SPLIT.get(rootId) ?? "train";
}
