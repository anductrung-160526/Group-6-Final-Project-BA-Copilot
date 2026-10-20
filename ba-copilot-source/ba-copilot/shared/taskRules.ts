// Quy tắc tự cập nhật trạng thái task theo sự kiện của sản phẩm gắn kèm (FN-20 → FN-23). Chủ sở hữu: A7.
// Hàm thuần, không đụng DB – server/taskAutomation.ts gọi khi nhận sự kiện từ server/events.ts.

import type { ArtifactEventType, ArtifactKind, TaskStatus } from "./types.ts";

/**
 * Trạng thái mới của task khi sản phẩm gắn kèm phát sự kiện; `null` = giữ nguyên.
 * - drafted: Cần làm / Cần làm lại → Đang làm (FN-20)
 * - approved: → Xong (FN-21)
 * - unapproved, stale: Xong → Cần làm lại (FN-22)
 */
export function nextStatus(current: TaskStatus, event: ArtifactEventType): TaskStatus | null {
  let to: TaskStatus | null = null;
  switch (event) {
    case "artifact.drafted":
      if (current === "todo" || current === "redo") to = "doing";
      break;
    case "artifact.approved":
      to = "done";
      break;
    case "artifact.unapproved":
    case "artifact.stale":
      if (current === "done") to = "redo";
      break;
  }
  return to === current ? null : to;
}

const KIND_LABEL: Record<ArtifactKind, string> = {
  screen: "Màn hình",
  doc: "Tài liệu", // đợt 5 (C2 thêm để biên dịch, R-031) – C7 thay cả tệp
  docs: "Tài liệu",
  diagram: "Sơ đồ UC",
  tests: "Bộ test",
};

/**
 * Lý do ghi vào task_events.reason (FN-23), vd "Màn hình “Đăng nhập” đã được duyệt".
 * `name`: tên màn (screen) hoặc tên module (docs, tests, diagram); trống thì chỉ ghi loại sản phẩm.
 */
export function statusReason(event: ArtifactEventType, kind: ArtifactKind, name = ""): string {
  const what = name ? `${KIND_LABEL[kind]} “${name}”` : KIND_LABEL[kind];
  switch (event) {
    case "artifact.drafted":
      return kind === "tests" ? `${what} vừa được sinh` : `${what} có bản nháp mới`;
    case "artifact.approved":
      return `${what} đã được duyệt`;
    // đợt 5 (C2 thêm để biên dịch, R-031) – C7 thay
    case "artifact.done":
      return `${what} đã Xong`;
    case "artifact.revision_requested":
      return `${what} bị yêu cầu sửa`;
    case "artifact.unapproved":
      return `${what} bị bỏ duyệt`;
    case "artifact.stale":
      return kind === "diagram" ? `${what} thành Lỗi thời do Use Case thay đổi (FN-14)` : `${what} thành Lỗi thời do thiết kế thay đổi (BR-02)`;
  }
}
