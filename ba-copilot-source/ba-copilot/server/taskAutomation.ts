// Tự cập nhật trạng thái task theo vòng đời sản phẩm gắn kèm (FN-20 → FN-23). Chủ sở hữu: A7.
// Nghe sự kiện của server/events.ts, tìm task có artifact_type/artifact_id khớp, đổi trạng thái theo shared/taskRules.ts
// và ghi task_events với by_system = 1 cùng lý do. Handler chạy chung transaction với thao tác ghi phát ra sự kiện.
//
// Ánh xạ sản phẩm: screen → artifact_id = mã màn; docs, tests, diagram → artifact_id = mã module (= event.artifact.id).
// BR-02 phát `stale` cho docs và tests của module, nên task gắn docs/tests đang Xong chuyển sang Cần làm lại.
//
// Đọc/ghi bảng qua server/repo/tasks.ts của A6 (listTasksByArtifact, setTaskStatus, memberExists).

import { getDb } from "./db.ts";
import { on, EVENT_TYPES, type ArtifactEvent } from "./events.ts";
import { nextStatus, statusReason } from "../shared/taskRules.ts";
import type { ArtifactKind, TaskStatus } from "../shared/types.ts";
import { listTasksByArtifact, memberExists, setTaskStatus } from "./repo/tasks.ts";

/** Một lần đổi trạng thái do hệ thống thực hiện. */
export interface AutoChange {
  taskId: string;
  from: TaskStatus;
  to: TaskStatus;
  reason: string;
}

/** Xử lý một sự kiện: đổi trạng thái mọi task gắn với sản phẩm đó. Gọi trong tx() (events.ts đảm bảo khi phát từ service). */
export function applyArtifactEvent(event: ArtifactEvent): AutoChange[] {
  const { kind, id } = event.artifact;
  // listTasksByArtifact xếp mới nhất trước; đảo lại để xử lý theo thứ tự tạo
  const tasks = listTasksByArtifact(kind, id).reverse();
  if (!tasks.length) return [];

  const reason = statusReason(event.type, kind, artifactName(kind, id));
  // actorId chưa chắc là thành viên còn tồn tại (client cũ, thành viên đã xoá…) – chỉ ghi khi có, tránh lỗi khoá ngoại làm huỷ thao tác.
  const byMemberId = event.actorId && memberExists(event.actorId) ? event.actorId : null;

  const changes: AutoChange[] = [];
  for (const t of tasks) {
    const to = nextStatus(t.status, event.type);
    if (!to) continue;
    setTaskStatus(t.id, to, { bySystem: true, byMemberId, reason });
    changes.push({ taskId: t.id, from: t.status, to, reason });
  }
  return changes;
}

/** Tên hiển thị trong lý do: tên màn, hoặc tên module với docs/tests/diagram. */
function artifactName(kind: ArtifactKind, id: string): string {
  const sql = kind === "screen" ? "SELECT name FROM screens WHERE id = ?" : "SELECT name FROM modules WHERE id = ?";
  return (getDb().prepare(sql).get(id) as { name: string } | undefined)?.name ?? "";
}

let offs: (() => void)[] = [];

/**
 * Đăng ký handler cho cả 4 loại sự kiện. Gọi lại bao nhiêu lần cũng chỉ có một bộ handler
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
