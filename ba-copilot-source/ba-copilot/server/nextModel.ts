// Nạp mô hình gợi ý bố cục khi cần: Recursive Transformer Tree Decoder (Li et al. 2020) – model/recursive-layout.json.
// Tính năng gợi ý chỉ dùng mô hình này (không luật, không mô hình đối chứng).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRecursive, RecursiveModel } from "../shared/recursive.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let rec: RecursiveModel | null | undefined;
/** null nếu chưa có file mô hình. Đường dẫn đổi được bằng RECURSIVE_FILE. */
export function getRecursive(): RecursiveModel | null {
  if (rec !== undefined) return rec;
  rec = null;
  const file = process.env.RECURSIVE_FILE ?? join(root, "model", "recursive-layout.json");
  if (existsSync(file)) {
    try {
      rec = loadRecursive(JSON.parse(readFileSync(file, "utf8")));
    } catch (e) {
      console.warn(`Could not read ${file}: ${(e as Error).message}`);
    }
  }
  return rec;
}
