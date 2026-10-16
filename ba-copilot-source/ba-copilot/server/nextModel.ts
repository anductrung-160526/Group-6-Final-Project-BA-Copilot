// Nạp mô hình gợi ý thành phần khi khởi động và học thêm từ các màn được duyệt.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { countTree, emptyModel, mergeModels, NGramModel } from "../shared/nextComponent.ts";
import type { UINode } from "../shared/design.ts";
import { mockScreen } from "./ai/mock.ts";
import { getDb } from "./db.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LEARN_WEIGHT = 5;

let base: NGramModel | null = null;
let model: NGramModel | null = null;

/** Mô hình dự phòng khi chưa có file: đếm từ các mẫu rule-based để app vẫn chạy. */
function fallbackModel(): NGramModel {
  const m = emptyModel();
  for (const p of ["đăng nhập", "đăng ký", "quản lý sản phẩm", "thêm sản phẩm", "dashboard tổng quan"]) countTree(m, mockScreen(p, p), 1, "fallback");
  return m;
}

function loadBase(): NGramModel {
  const file = process.env.NEXT_MODEL_FILE ?? join(root, "model", "next-component.json");
  if (existsSync(file)) {
    try {
      const m = JSON.parse(readFileSync(file, "utf8")) as NGramModel;
      if (m.version === 1 && m.counts?.all) return m;
    } catch (e) {
      console.warn(`Không đọc được ${file}: ${(e as Error).message}`);
    }
  }
  return fallbackModel();
}

/** Mô hình hiện hành = mô hình gốc + phần học thêm đã lưu trong DB. */
export function getModel(): NGramModel {
  if (model) return model;
  base ??= loadBase();
  model = mergeModels(emptyModel(), base);
  model.meta.builtAt = base.meta.builtAt;
  for (const r of getDb().prepare("SELECT tree FROM model_learned_trees").all() as { tree: string }[]) {
    try {
      countTree(model, JSON.parse(r.tree), LEARN_WEIGHT, "learned");
    } catch {
      /* bỏ bản ghi hỏng */
    }
  }
  return model;
}

/** Học thêm khi BA duyệt một màn: lưu cây vào DB và cộng số đếm (trọng số 5). Mỗi phiên bản chỉ học một lần. */
export function learnFromScreen(screenId: string, versionId: string, tree: UINode): void {
  const r = getDb().prepare("INSERT OR IGNORE INTO model_learned_trees (version_id, screen_id, tree, created_at) VALUES (?, ?, ?, ?)").run(versionId, screenId, JSON.stringify(tree), new Date().toISOString());
  if (Number(r.changes) > 0 && model) countTree(model, tree, LEARN_WEIGHT, "learned");
}

/** Dùng trong test: buộc nạp lại. */
export function resetModel(): void {
  base = null;
  model = null;
}
