// Kho dữ liệu công việc (FN-15 → FN-19, đợt 5). Bảng: docs/erd.md `tasks`, `task_events`. Chủ sở hữu: C7 (trước: A6).
// taskAutomation.ts dùng lại setTaskStatus() với bySystem = true và listTasksByArtifact().

import { randomUUID } from "node:crypto";
import { getDb, tx } from "../db.ts";
import {
  ARTIFACT_KINDS_V5,
  DIAGRAM_KINDS,
  DOC_KINDS,
  TASK_STATUSES_V5,
  type ArtifactKind,
  type ArtifactOption,
  type DiagramKind,
  type DocKind,
  type Task,
  type TaskDetail,
  type TaskEvent,
  type TaskPriority,
  type TaskStatus,
} from "../../shared/types.ts";
import { artifactTitle } from "../../shared/taskRules.ts";

type Row = Record<string, any>;
const now = () => new Date().toISOString();

/** Trạng thái ghi được (đợt 5): Cần làm · Đang làm · Xong · Đã duyệt. "redo" cũ không còn ghi. */
export const TASK_STATUSES: TaskStatus[] = TASK_STATUSES_V5;
export const TASK_PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];
/** Loại sản phẩm gắn được vào task mới. "docs" (bộ tài liệu cũ) chỉ còn đọc – hiển thị "Tài liệu (cũ)". */
export const ARTIFACT_KINDS: ArtifactKind[] = ARTIFACT_KINDS_V5;

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
  artifactSub: r.artifact_sub ?? (r.artifact_type === "diagram" ? "UC" : null),
  revisionRequested: !!r.revision_requested,
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
  /** doc: DocKind (bắt buộc) · diagram: DiagramKind (mặc định UC) · còn lại null. */
  artifactSub?: DocKind | DiagramKind | null;
}

/** Ai đổi trạng thái: thành viên (kéo thẻ) hoặc hệ thống (theo sự kiện sản phẩm). */
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

/**
 * Task gắn với một sản phẩm (FN-19, và taskAutomation tìm task cần đổi trạng thái). Mới tạo trước.
 * doc/diagram: có `sub` thì chỉ task đúng loại tài liệu/sơ đồ (sơ đồ: task cũ chưa có sub = UC); không có `sub` thì mọi loại.
 */
export function listTasksByArtifact(kind: ArtifactKind, id: string, sub?: string | null): Task[] {
  let sql = "SELECT * FROM tasks WHERE artifact_type = ? AND artifact_id = ?";
  const vals: string[] = [kind, id];
  if (sub && kind === "doc") {
    sql += " AND artifact_sub = ?";
    vals.push(sub);
  }
  if (sub && kind === "diagram") {
    sql += sub === "UC" ? " AND (artifact_sub = ? OR artifact_sub IS NULL)" : " AND artifact_sub = ?";
    vals.push(sub);
  }
  return (getDb().prepare(`${sql} ORDER BY created_at DESC, rowid DESC`).all(...vals) as Row[]).map(toTask);
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

const subOf = (f: TaskFields) => (f.artifactType === "doc" || f.artifactType === "diagram" ? (f.artifactSub ?? null) : null);

/** Tạo task và ghi một TaskEvent lúc tạo (fromStatus = null). */
export function createTask(projectId: string, f: TaskFields, status: TaskStatus = "todo", by: StatusBy = {}, revisionRequested = false): Task {
  return tx(() => {
    const id = randomUUID();
    const at = now();
    getDb()
      .prepare(
        `INSERT INTO tasks (id, project_id, module_id, title, description, assignee_id, due_date, priority, status, revision_requested, artifact_type, artifact_id, artifact_sub, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, f.moduleId, f.title, f.description, f.assigneeId, f.dueDate, f.priority, status, revisionRequested ? 1 : 0, f.artifactType, f.artifactId, subOf(f), at, at);
    addEvent(id, null, status, by, at);
    return getTask(id)!;
  });
}

/** Sửa các trường (không đổi trạng thái – dùng setTaskStatus). */
export function updateTask(id: string, f: TaskFields): Task | null {
  getDb()
    .prepare(
      `UPDATE tasks SET module_id = ?, title = ?, description = ?, assignee_id = ?, due_date = ?, priority = ?, artifact_type = ?, artifact_id = ?, artifact_sub = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(f.moduleId, f.title, f.description, f.assigneeId, f.dueDate, f.priority, f.artifactType, f.artifactId, subOf(f), now(), id);
  return getTask(id);
}

/**
 * Đổi trạng thái (và cờ "Yêu cầu sửa" nếu truyền `revisionRequested`), ghi TaskEvent (FN-18).
 * Ghi sự kiện khi trạng thái đổi, hoặc khi cờ vừa được bật (Yêu cầu sửa lúc task đang Đang làm). Không đổi gì thì không ghi.
 */
export function setTaskStatus(id: string, to: TaskStatus, by: StatusBy = {}, revisionRequested?: boolean): Task | null {
  return tx(() => {
    const t = getTask(id);
    if (!t) return null;
    const had = !!t.revisionRequested;
    const rr = revisionRequested ?? had;
    if (t.status === to && rr === had) return t;
    const at = now();
    getDb().prepare("UPDATE tasks SET status = ?, revision_requested = ?, updated_at = ? WHERE id = ?").run(to, rr ? 1 : 0, at, id);
    if (t.status !== to || (rr && !had)) addEvent(id, t.status, to, by, at);
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
 * Sản phẩm gắn được vào task (FN-16, đợt 5): theo từng module – các màn, 5 tài liệu, 5 sơ đồ, bộ test.
 * Mỗi tài liệu/sơ đồ một dòng (`kind "doc"/"diagram"` + `sub`). Chưa sinh vẫn có (trạng thái `none`) để giao task "làm mới".
 */
export function listArtifacts(projectId: string): ArtifactOption[] {
  const d = getDb();
  const modules = d.prepare("SELECT id, name, tests_status FROM modules WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as Row[];
  const out: ArtifactOption[] = [];
  for (const m of modules) {
    const base = { id: m.id, moduleId: m.id, moduleName: m.name };
    const screens = d.prepare("SELECT id, name, status FROM screens WHERE module_id = ? ORDER BY created_at, rowid").all(m.id) as Row[];
    for (const s of screens) out.push({ kind: "screen", id: s.id, moduleId: m.id, moduleName: m.name, label: `Screen ${s.name}`, status: s.status });
    const docs = new Map((d.prepare("SELECT kind, status FROM module_docs WHERE module_id = ?").all(m.id) as Row[]).map((r) => [r.kind, r.status]));
    for (const k of DOC_KINDS) out.push({ ...base, kind: "doc", sub: k, label: artifactTitle("doc", k, m.name), status: docs.get(k) ?? "none" });
    const diagrams = new Map((d.prepare("SELECT kind, status FROM module_diagrams WHERE module_id = ?").all(m.id) as Row[]).map((r) => [r.kind, r.status]));
    for (const k of DIAGRAM_KINDS) out.push({ ...base, kind: "diagram", sub: k, label: artifactTitle("diagram", k, m.name), status: diagrams.get(k) ?? "none" });
    out.push({ ...base, kind: "tests", label: artifactTitle("tests", null, m.name), status: m.tests_status });
  }
  return out;
}
