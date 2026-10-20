// Kho dữ liệu công việc (FN-15 → FN-19). Bảng: docs/erd.md `tasks`, `task_events`. Chủ sở hữu: A6.
// A7 (tự cập nhật trạng thái) dùng lại setTaskStatus() với bySystem = true và listTasksByArtifact().

import { randomUUID } from "node:crypto";
import { getDb, tx } from "../db.ts";
import type { ArtifactKind, ArtifactOption, Task, TaskDetail, TaskEvent, TaskPriority, TaskStatus } from "../../shared/types.ts";

type Row = Record<string, any>;
const now = () => new Date().toISOString();

export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "done", "redo"];
export const TASK_PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];
export const ARTIFACT_KINDS: ArtifactKind[] = ["screen", "docs", "diagram", "tests"];

const toTask = (r: Row): Task => ({
  id: r.id,
  projectId: r.project_id,
  moduleId: r.module_id ?? null,
  title: r.title,
  description: r.description,
  assigneeId: r.assignee_id ?? null,
  dueDate: r.due_date ?? null,
  priority: r.priority,
  status: r.status,
  artifactType: r.artifact_type ?? null,
  artifactId: r.artifact_id ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toEvent = (r: Row): TaskEvent => ({
  id: r.id,
  taskId: r.task_id,
  fromStatus: r.from_status ?? null,
  toStatus: r.to_status,
  byMemberId: r.by_member_id ?? null,
  bySystem: !!r.by_system,
  reason: r.reason,
  createdAt: r.created_at,
});

/** Các trường ghi được của task (đã kiểm tra hợp lệ ở route). */
export interface TaskFields {
  moduleId: string | null;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  artifactType: ArtifactKind | null;
  artifactId: string | null;
}

/** Ai đổi trạng thái: thành viên (kéo thẻ) hoặc hệ thống (A7, FN-20 → FN-23). */
export interface StatusBy {
  byMemberId?: string | null;
  bySystem?: boolean;
  reason?: string;
}

export function getTask(id: string): Task | null {
  const r = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Row | undefined;
  return r ? toTask(r) : null;
}

/** Task của dự án, lọc theo người làm / module (FN-17). Mới tạo trước. */
export function listTasks(projectId: string, q: { assigneeId?: string; moduleId?: string } = {}): Task[] {
  const where = ["project_id = ?"];
  const vals: string[] = [projectId];
  if (q.assigneeId) (where.push("assignee_id = ?"), vals.push(q.assigneeId));
  if (q.moduleId) (where.push("module_id = ?"), vals.push(q.moduleId));
  return (getDb().prepare(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY created_at DESC, rowid DESC`).all(...vals) as Row[]).map(toTask);
}

/** Task gắn với một sản phẩm (FN-19, và A7 tìm task cần đổi trạng thái). */
export function listTasksByArtifact(kind: ArtifactKind, id: string): Task[] {
  return (getDb().prepare("SELECT * FROM tasks WHERE artifact_type = ? AND artifact_id = ? ORDER BY created_at DESC, rowid DESC").all(kind, id) as Row[]).map(toTask);
}

export function listEvents(taskId: string): TaskEvent[] {
  return (getDb().prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at, rowid").all(taskId) as Row[]).map(toEvent);
}

export function getTaskDetail(id: string): TaskDetail | null {
  const t = getTask(id);
  return t ? { ...t, events: listEvents(id) } : null;
}

function addEvent(taskId: string, from: TaskStatus | null, to: TaskStatus, by: StatusBy, at: string): void {
  getDb()
    .prepare("INSERT INTO task_events (id, task_id, from_status, to_status, by_member_id, by_system, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), taskId, from, to, by.byMemberId ?? null, by.bySystem ? 1 : 0, by.reason ?? "", at);
}

/** Tạo task và ghi một TaskEvent lúc tạo (fromStatus = null). */
export function createTask(projectId: string, f: TaskFields, status: TaskStatus = "todo", by: StatusBy = {}): Task {
  return tx(() => {
    const id = randomUUID();
    const at = now();
    getDb()
      .prepare(
        `INSERT INTO tasks (id, project_id, module_id, title, description, assignee_id, due_date, priority, status, artifact_type, artifact_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, f.moduleId, f.title, f.description, f.assigneeId, f.dueDate, f.priority, status, f.artifactType, f.artifactId, at, at);
    addEvent(id, null, status, by, at);
    return getTask(id)!;
  });
}

/** Sửa các trường (không đổi trạng thái – dùng setTaskStatus). */
export function updateTask(id: string, f: TaskFields): Task | null {
  getDb()
    .prepare(
      `UPDATE tasks SET module_id = ?, title = ?, description = ?, assignee_id = ?, due_date = ?, priority = ?, artifact_type = ?, artifact_id = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(f.moduleId, f.title, f.description, f.assigneeId, f.dueDate, f.priority, f.artifactType, f.artifactId, now(), id);
  return getTask(id);
}

/** Đổi trạng thái và ghi TaskEvent (FN-18). Trùng trạng thái hiện tại thì không ghi gì. */
export function setTaskStatus(id: string, to: TaskStatus, by: StatusBy = {}): Task | null {
  return tx(() => {
    const t = getTask(id);
    if (!t || t.status === to) return t;
    const at = now();
    getDb().prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(to, at, id);
    addEvent(id, t.status, to, by, at);
    return getTask(id);
  });
}

export function deleteTask(id: string): void {
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

export function memberExists(id: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM members WHERE id = ?").get(id);
}

/** Module của một màn (để kiểm tra màn thuộc dự án). */
export function screenModule(screenId: string): { moduleId: string; projectId: string } | null {
  const r = getDb().prepare("SELECT s.module_id, m.project_id FROM screens s JOIN modules m ON m.id = s.module_id WHERE s.id = ?").get(screenId) as Row | undefined;
  return r ? { moduleId: r.module_id, projectId: r.project_id } : null;
}

/**
 * Sản phẩm gắn được vào task (FN-16): theo từng module – các màn, rồi bộ tài liệu, sơ đồ UC, bộ test.
 * Tài liệu / test / sơ đồ chưa sinh vẫn có trong danh sách (trạng thái `none`) để giao task "làm mới".
 */
export function listArtifacts(projectId: string): ArtifactOption[] {
  const d = getDb();
  const modules = d.prepare("SELECT id, name, docs_status, tests_status FROM modules WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as Row[];
  const out: ArtifactOption[] = [];
  for (const m of modules) {
    const screens = d.prepare("SELECT id, name, status FROM screens WHERE module_id = ? ORDER BY created_at, rowid").all(m.id) as Row[];
    for (const s of screens) out.push({ kind: "screen", id: s.id, moduleId: m.id, moduleName: m.name, label: `Màn ${s.name}`, status: s.status });
    const diagram = d.prepare("SELECT status FROM uc_diagrams WHERE module_id = ?").get(m.id) as Row | undefined;
    out.push({ kind: "docs", id: m.id, moduleId: m.id, moduleName: m.name, label: `Tài liệu – ${m.name}`, status: m.docs_status });
    out.push({ kind: "diagram", id: m.id, moduleId: m.id, moduleName: m.name, label: `Sơ đồ UC – ${m.name}`, status: diagram?.status ?? "none" });
    out.push({ kind: "tests", id: m.id, moduleId: m.id, moduleName: m.name, label: `Bộ test – ${m.name}`, status: m.tests_status });
  }
  return out;
}
