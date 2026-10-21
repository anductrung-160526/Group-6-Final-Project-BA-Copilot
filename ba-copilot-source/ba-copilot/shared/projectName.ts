// Quy tắc tên / độ dài dự án và module, dùng chung cho server (chặn quá dài, chặn trùng tên) và client.

export const PROJECT_NAME_MAX = 200;
export const PROJECT_DESC_MAX = 2000;
export const MODULE_NAME_MAX = 200;

/**
 * Khoá so sánh tên dự án: Unicode NFC, bỏ khoảng trắng đầu/cuối, gộp khoảng trắng liên tiếp,
 * không phân biệt hoa/thường. Dấu vẫn được giữ ("Bán hàng" ≠ "Ban hang").
 */
export function projectNameKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase().normalize("NFC");
}

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); // 2000 → "2,000" (không phụ thuộc ICU)

// Thông báo lỗi (tiếng Anh, giọng giao diện) – server trả nguyên văn, client có thể dùng để báo trước.
export const MSG = {
  projectNameRequired: "Project name is required",
  projectNameTooLong: `Project name must be at most ${PROJECT_NAME_MAX} characters`,
  projectDescTooLong: `Description must be at most ${thousands(PROJECT_DESC_MAX)} characters`,
  moduleNameRequired: "Module name is required",
  moduleNameTooLong: `Module name must be at most ${MODULE_NAME_MAX} characters`,
  duplicateProject: (name: string) => `A project named “${name}” already exists. Please choose another name.`,
};

/** Lỗi của tên dự án (đã trim) – null nếu hợp lệ. Không cắt bớt: quá dài thì báo lỗi. */
export function projectNameError(name: string): string | null {
  if (!name) return MSG.projectNameRequired;
  return name.length > PROJECT_NAME_MAX ? MSG.projectNameTooLong : null;
}

/** Lỗi của mô tả dự án (đã trim) – null nếu hợp lệ. */
export function projectDescError(description: string): string | null {
  return description.length > PROJECT_DESC_MAX ? MSG.projectDescTooLong : null;
}

/** Lỗi của tên module (đã trim) – null nếu hợp lệ. */
export function moduleNameError(name: string): string | null {
  if (!name) return MSG.moduleNameRequired;
  return name.length > MODULE_NAME_MAX ? MSG.moduleNameTooLong : null;
}
