// Quy tắc trạng thái công việc đợt 5 (kế hoạch đợt 5, mục 1 "Trạng thái công việc"). Chủ sở hữu: C7.
// Hàm thuần, không đụng DB – dùng chung cho server (taskAutomation, routes/tasks, routes/approval) và client (Kanban).
//
//   Cần làm ──► Đang làm ──[Xong · BA]──► Xong ──[Duyệt · BA Lead]──► Đã duyệt
//                   ▲                      │
//                   └──[Yêu cầu sửa · BA Lead]┘  + tag "Yêu cầu sửa" (giữ tới khi Duyệt)

import { DIAGRAM_KIND_LABEL, DOC_KIND_LABEL, type ArtifactEventType, type ArtifactKind, type DiagramKind, type DocKind, type TaskStatus } from "./types.ts";

/** Trạng thái task + cờ "Yêu cầu sửa". */
export interface TaskState {
  status: TaskStatus;
  revisionRequested: boolean;
}

/** "redo" cũ = Đang làm (+ cờ). Mã mới không ghi "redo". */
export const normStatus = (s: TaskStatus): Exclude<TaskStatus, "redo"> => (s === "redo" ? "doing" : s);

/**
 * Trạng thái mới của task khi sản phẩm gắn kèm phát sự kiện; `null` = giữ nguyên (cả trạng thái lẫn cờ).
 * - drafted (sinh / sửa nội dung): Cần làm, Xong, Đã duyệt → Đang làm (sửa sản phẩm đã Xong/Đã duyệt phải bấm Xong lại). Giữ cờ.
 * - done (BA bấm Xong): → Xong. Giữ cờ.
 * - approved (BA Lead Duyệt): → Đã duyệt, xoá cờ.
 * - revision_requested (BA Lead Yêu cầu sửa): → Đang làm + cờ.
 * - stale (bước trước đổi): Xong / Đã duyệt → Đang làm. Giữ cờ.
 * - unapproved (sự kiện cũ của mã v2 – bỏ duyệt): như stale.
 */
export function nextTaskState(cur: TaskState, event: ArtifactEventType): TaskState | null {
  const s = normStatus(cur.status);
  const rr = cur.revisionRequested || cur.status === "redo";
  let to: TaskState | null = null;
  switch (event) {
    case "artifact.drafted":
      if (s !== "doing") to = { status: "doing", revisionRequested: rr };
      break;
    case "artifact.done":
      to = { status: "done", revisionRequested: rr };
      break;
    case "artifact.approved":
      to = { status: "approved", revisionRequested: false };
      break;
    case "artifact.revision_requested":
      to = { status: "doing", revisionRequested: true };
      break;
    case "artifact.stale":
    case "artifact.unapproved":
      if (s === "done" || s === "approved") to = { status: "doing", revisionRequested: rr };
      break;
  }
  if (!to && cur.status === "redo") to = { status: "doing", revisionRequested: true }; // dữ liệu cũ: chuẩn hoá luôn
  if (!to) return null;
  return to.status === cur.status && to.revisionRequested === cur.revisionRequested ? null : to;
}

/** Chỉ trạng thái mới (bỏ qua cờ); `null` = giữ nguyên trạng thái. */
export function nextStatus(current: TaskStatus, event: ArtifactEventType, revisionRequested = false): TaskStatus | null {
  const n = nextTaskState({ status: current, revisionRequested }, event);
  return n && n.status !== current ? n.status : null;
}

// ---------------------------------------------------------------- Đổi trạng thái bằng tay (kéo thẻ / ngăn chi tiết)

/** Thao tác tương ứng một lần đổi trạng thái bằng tay. */
export type TaskMove = "start" | "done" | "approve" | "request-change";

/**
 * Mũi tên hợp lệ từ `from` sang `to`, hoặc null nếu không có mũi tên.
 * todo → doing (bắt đầu) · doing → done (Xong) · done → approved (Duyệt) · done/approved → doing (Yêu cầu sửa).
 */
export function taskMove(from: TaskStatus, to: TaskStatus): TaskMove | null {
  const f = normStatus(from);
  const t = normStatus(to);
  if (f === "todo" && t === "doing") return "start";
  if (f === "doing" && t === "done") return "done";
  if (f === "done" && t === "approved") return "approve";
  if ((f === "done" || f === "approved") && t === "doing") return "request-change";
  return null;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", doing: "In progress", done: "Done", approved: "Approved", redo: "In progress" };

/**
 * Kiểm tra một lần đổi trạng thái bằng tay. Trả về lý do tiếng Việt khi KHÔNG được phép, `null` khi được.
 * `actor`: người đang chọn ở ô "Tôi là…" (null = chưa chọn). Xong cần biết ai làm; Duyệt và Yêu cầu sửa chỉ BA Lead.
 */
export function moveError(from: TaskStatus, to: TaskStatus, actor: { role: string } | null): string | null {
  if (normStatus(from) === normStatus(to)) return null;
  const mv = taskMove(from, to);
  if (!mv) return `Cannot move directly from “${TASK_STATUS_LABEL[from]}” to “${TASK_STATUS_LABEL[to]}”`;
  if (mv === "done" && !actor) return "Select a person in the “Acting as” box before marking as done";
  if (mv === "approve" && actor?.role !== "BA_LEAD") return "Only a BA Lead can approve";
  if (mv === "request-change" && actor?.role !== "BA_LEAD") return "Only a BA Lead can request changes";
  return null;
}

// ---------------------------------------------------------------- Nhãn sản phẩm + lý do ghi task_events

/** Loại sản phẩm (không tên), vd "Tài liệu BRD", "Sơ đồ Use Case", "Màn hình". */
export function artifactKindLabel(kind: ArtifactKind, sub?: string | null): string {
  switch (kind) {
    case "screen":
      return "Screen";
    case "doc":
      return `${DOC_KIND_LABEL[sub as DocKind] ?? sub ?? ""} document`.trim();
    case "diagram":
      return `${DIAGRAM_KIND_LABEL[(sub || "UC") as DiagramKind] ?? sub} diagram`;
    case "tests":
      return "Test suite";
    case "docs":
      return "Documents (legacy)";
  }
}

/**
 * Tên đầy đủ của sản phẩm trong lý do / nhãn: "Màn hình “Đăng nhập”", "Tài liệu BRD – Xác thực", "Bộ test – Xác thực".
 * `name`: tên màn (screen) hoặc tên module (còn lại); trống thì chỉ ghi loại.
 */
export function artifactTitle(kind: ArtifactKind, sub?: string | null, name = ""): string {
  const what = artifactKindLabel(kind, sub);
  if (!name) return what;
  return kind === "screen" ? `${what} “${name}”` : `${what} – ${name}`;
}

/** Lý do ghi vào task_events.reason khi task đi theo sự kiện sản phẩm, vd "BA Lead yêu cầu sửa Tài liệu BRD – Xác thực". */
export function statusReason(event: ArtifactEventType, kind: ArtifactKind, name = "", sub?: string | null): string {
  const what = artifactTitle(kind, sub, name);
  switch (event) {
    case "artifact.drafted":
      return kind === "tests" ? `${what} was generated` : `${what} has a new draft`;
    case "artifact.done":
      return `BA marked ${what} as done`;
    case "artifact.approved":
      return `BA Lead approved ${what}`;
    case "artifact.revision_requested":
      return `BA Lead requested changes to ${what}`;
    case "artifact.stale":
      return `${what} became Outdated because a previous step changed`;
    case "artifact.unapproved":
      return `${what} approval was withdrawn`;
  }
}
