// Tạo dự án mẫu để demo nhanh: 3 màn hình đã duyệt → tài liệu → test case.
// Dùng: npm run seed   (dùng Claude nếu có ANTHROPIC_API_KEY trong .env, ngược lại dùng Mock)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../server/db.ts";
import * as repo from "../server/repo.ts";
import * as svc from "../server/service.ts";

const root = join(import.meta.dirname, "..");
const envFile = join(root, ".env");
if (existsSync(envFile))
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
openDb(process.env.DB_FILE ?? join(root, "data", "ba-copilot.db"));

const p = repo.createProject("Cửa hàng điện tử (mẫu)", "Dự án mẫu cho luận án: website bán hàng điện tử.");
const m = repo.createModule(
  p.id,
  "Quản lý sản phẩm",
  `- As a Quản trị viên, I want tìm kiếm và lọc sản phẩm, so that tôi quản lý kho nhanh hơn.
- As a Quản trị viên, I want thêm sản phẩm mới với tên, SKU, giá, tồn kho.
- Cho phép quản trị viên đăng nhập bằng email và mật khẩu.`,
);
const screens = [
  ["Đăng nhập", "Màn hình đăng nhập quản trị bằng email và mật khẩu, có ghi nhớ đăng nhập."],
  ["Quản lý sản phẩm", "Quản lý sản phẩm: tìm kiếm theo tên, lọc theo trạng thái, bảng danh sách có xem/sửa/xóa, nút thêm mới, phân trang."],
  ["Thêm sản phẩm", "Form thêm sản phẩm: tên (bắt buộc, tối đa 100 ký tự), danh mục, ngày hiệu lực, mô tả; nút Lưu và Hủy."],
];
for (const [name, prompt] of screens) {
  console.log(`Sinh màn hình: ${name}`);
  const r = await svc.createScreenFromPrompt(m.id, prompt, name);
  svc.setScreenApproval(r.screen!.id, true);
}
console.log("Sinh tài liệu…");
await svc.generateDocs(m.id);
svc.approveDocs(m.id, true);
console.log("Sinh test case…");
await svc.generateTests(m.id);
console.log(`Xong. Mở http://localhost:${process.env.PORT ?? 3000}/#/m/${m.id}/design`);
