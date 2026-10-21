// Bộ phát sự kiện đồng bộ cho vòng đời sản phẩm (màn, tài liệu, sơ đồ, test).
// emit() gọi lần lượt từng handler ngay trong lời gọi hiện tại, nên handler chạy chung transaction với nơi phát
// (service bọc thao tác ghi + emit trong tx()). Handler ném lỗi → lỗi truyền ra ngoài và transaction bị huỷ.
//
// Đợt 5 (C2): drafted · done · approved · revision_requested · stale. "artifact.unapproved" là sự kiện cũ, chỉ
// còn để mã v2 (service.ts, routes/diagram.ts, taskRules.ts) chạy tới khi C7/C9/C6 thay – mã mới không phát.

import type { ArtifactEvent, ArtifactEventType, ArtifactRef, GitPushOutcome } from "../shared/types.ts";

export type { ArtifactEvent, ArtifactEventType } from "../shared/types.ts";
export type EventHandler = (event: ArtifactEvent) => void;

/** Sự kiện đợt 5, theo thứ tự vòng đời. */
export const EVENT_TYPES_V5: ArtifactEventType[] = ["artifact.drafted", "artifact.done", "artifact.approved", "artifact.revision_requested", "artifact.stale"];
/** Mọi sự kiện còn được phát (đợt 5 + "artifact.unapproved" cũ). Đăng ký handler cho "mọi loại" thì dùng danh sách này. */
export const EVENT_TYPES: ArtifactEventType[] = [...EVENT_TYPES_V5, "artifact.unapproved"];

const handlers = new Map<ArtifactEventType, EventHandler[]>();

/** Đăng ký handler; trả về hàm huỷ đăng ký. */
export function on(type: ArtifactEventType, handler: EventHandler): () => void {
  handlers.set(type, [...(handlers.get(type) ?? []), handler]);
  return () => handlers.set(type, (handlers.get(type) ?? []).filter((h) => h !== handler));
}

export function emit(event: ArtifactEvent): void {
  for (const h of handlers.get(event.type) ?? []) h(event);
}

/** Chỉ dùng trong test. */
export function clearHandlers(): void {
  handlers.clear();
}

// ---------- Điểm nối Duyệt → GitHub (C0 thêm, đợt 5). C8 đăng ký khi nạp server/github.ts; C7 gọi trong POST .../approve.
// Chưa đăng ký (C8 chưa gộp) → coi như dự án chưa cấu hình repo.
export type ApprovedPusher = (ref: ArtifactRef, actorId: string | null) => Promise<GitPushOutcome>;
let approvedPusher: ApprovedPusher | null = null;
export function registerApprovedPusher(fn: ApprovedPusher | null): void {
  approvedPusher = fn;
}
export function pushApproved(ref: ArtifactRef, actorId: string | null): Promise<GitPushOutcome> {
  return approvedPusher ? approvedPusher(ref, actorId) : Promise.resolve({ pushed: false, message: "GitHub is not configured – nothing was pushed" });
}
