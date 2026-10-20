// Bộ phát sự kiện đồng bộ cho vòng đời sản phẩm (màn, tài liệu, sơ đồ, test).
// emit() gọi lần lượt từng handler ngay trong lời gọi hiện tại, nên handler chạy chung transaction với nơi phát
// (service bọc thao tác ghi + emit trong tx()). Handler ném lỗi → lỗi truyền ra ngoài và transaction bị huỷ.

import type { ArtifactEvent, ArtifactEventType } from "../shared/types.ts";

export type { ArtifactEvent, ArtifactEventType } from "../shared/types.ts";
export type EventHandler = (event: ArtifactEvent) => void;

export const EVENT_TYPES: ArtifactEventType[] = ["artifact.drafted", "artifact.approved", "artifact.unapproved", "artifact.stale"];

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
