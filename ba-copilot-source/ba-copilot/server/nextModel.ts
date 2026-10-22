// Nạp các mô hình gợi ý element khi cần (quy ước: gợi ý element chỉ dùng mô hình trong model/, không luật, không Claude).
//  - Recursive Transformer Tree Decoder (Li et al. 2020) – model/recursive-layout.json: phần tử tiếp theo + hoàn thành bố cục.
//    Chèn GIỮA các phần tử đã có: người dùng chọn khe, Recursive gợi ý từ các con đứng trước khe (nextAtSlot).
// next-component.json (n-gram) chỉ là mô hình đối chứng cho script đánh giá, không nạp ở đây.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRecursive, RecursiveModel } from "../shared/recursive.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function load<T>(file: string, parse: (json: any) => T): T | null {
  if (!existsSync(file)) return null;
  try {
    return parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (e) {
    console.warn(`Could not read ${file}: ${(e as Error).message}`);
    return null;
  }
}

let rec: RecursiveModel | null | undefined;
/** null nếu chưa có file mô hình. Đường dẫn đổi được bằng RECURSIVE_FILE. */
export function getRecursive(): RecursiveModel | null {
  if (rec === undefined) rec = load(process.env.RECURSIVE_FILE ?? join(root, "model", "recursive-layout.json"), loadRecursive);
  return rec;
}
