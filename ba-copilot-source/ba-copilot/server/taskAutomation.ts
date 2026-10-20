// Task gắn sản phẩm đi theo vòng đời sản phẩm (đợt 5). Chủ sở hữu: C7 (trước: A7).
// Nghe sự kiện của server/events.ts, tìm task có artifact_type/artifact_id(/artifact_sub) khớp, đổi trạng thái + cờ
// "Yêu cầu sửa" theo shared/taskRules.ts (nextTaskState) và ghi task_events với by_system = 1 cùng lý do tiếng Việt,
// vd "BA Lead yêu cầu sửa Tài liệu BRD – Xác thực". Handler chạy chung transaction với thao tác phát ra sự kiện.
//
// Ánh xạ: screen → artifact_id = mã màn; doc, diagram, tests (và docs cũ) → artifact_id = mã module, doc/diagram so thêm sub.

import { getDb } from "./db.ts";
import { on, EVENT_TYPES, type ArtifactEvent } from "./events.ts";
import { nextTaskState, statusReason } from "../shared/taskRules.ts";
import type { ArtifactKind, TaskStatus } from "../shared/types.ts";
import { listTasksByArtifact, memberExists, setTaskStatus } from "./repo/tasks.ts";

/** Một lần đổi trạng thái do hệ thống thực hiện. */
export interface AutoChange {
  taskId: string;
  from: TaskStatus;
  to: TaskStatus;
  revisionRequested: boolean;
  reason: string;
}

/** Xử lý một sự kiện: đổi trạng thái mọi task gắn với sản phẩm đó. Gọi trong tx() của nơi phát. */
export function applyArtifactEvent(event: ArtifactEvent): AutoChange[] {
  const { kind, id } = event.artifact;
  const sub = kind === "diagram" ? (event.artifact.sub ?? "UC") : kind === "doc" ? (event.artifact.sub ?? null) : null;
  // doc thiếu sub (không đúng hợp đồng) → không đoán, bỏ qua để không kéo nhầm task của tài liệu khác.
  if (kind === "doc" && !sub) return [];
  // listTasksByArtifact xếp mới nhất trước; đảo lại để xử lý theo thứ tự tạo
  const tasks = listTasksByArtifact(kind, id, sub).reverse();
  if (!tasks.length) return [];

  const reason = statusReason(event.type, kind, artifactName(kind, id), sub);
  // actorId chưa chắc là thành viên còn tồn tại (client cũ, thành viên đã xoá…) – chỉ ghi khi có, tránh lỗi khoá ngoại làm huỷ thao tác.
  const byMemberId = event.actorId && memberExists(event.actorId) ? event.actorId : null;

  const changes: AutoChange[] = [];
  for (const t of tasks) {
    const next = nextTaskState({ status: t.status, revisionRequested: !!t.revisionRequested }, event.type);
    if (!next) continue;
    setTaskStatus(t.id, next.status, { bySystem: true, byMemberId, reason }, next.revisionRequested);
    changes.push({ taskId: t.id, from: t.status, to: next.status, revisionRequested: next.revisionRequested, reason });
  }
  return changes;
}

/** Tên hiển thị trong lý do: tên màn, hoặc tên module với tài liệu/sơ đồ/test. */
function artifactName(kind: ArtifactKind, id: string): string {
  const sql = kind === "screen" ? "SELECT name FROM screens WHERE id = ?" : "SELECT name FROM modules WHERE id = ?";
  return (getDb().prepare(sql).get(id) as { name: string } | undefined)?.name ?? "";
}

let offs: (() => void)[] = [];

/**
 * Đăng ký handler cho mọi loại sự kiện. Gọi lại bao nhiêu lần cũng chỉ có một bộ handler
 * (huỷ bộ cũ trước khi đăng ký), nên gọi được trong createApp(). Trả về hàm huỷ đăng ký.
 */
export function registerTaskAutomation(): () => void {
  unregisterTaskAutomation();
  offs = EVENT_TYPES.map((type) => on(type, (e) => void applyArtifactEvent(e)));
  return unregisterTaskAutomation;
}

export function unregisterTaskAutomation(): void {
  for (const off of offs) off();
  offs = [];
}
