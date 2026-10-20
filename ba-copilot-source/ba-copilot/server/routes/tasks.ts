// Công việc Kanban (FN-15 → FN-19). Hợp đồng: docs/api.md mục "Công việc". Chủ sở hữu: A6.

import * as repo from "../repo.ts";
import * as tasks from "../repo/tasks.ts";
import { BizError } from "../service.ts";
import { route, str, actor } from "../http.ts";
import type { ArtifactKind, Task, TaskPriority, TaskStatus } from "../../shared/types.ts";

const mustProject = (id: string) => {
  if (!repo.getProject(id)) throw new BizError("Không tìm thấy dự án", 404);
};
const mustTask = (id: string): Task => {
  const t = tasks.getTask(id);
  if (!t) throw new BizError("Không tìm thấy công việc", 404);
  return t;
};

/** Chuỗi tuỳ chọn: undefined = không gửi, null / "" = xoá giá trị. */
const opt = (v: unknown, max = 200): string | null | undefined => (v === undefined ? undefined : v === null ? null : str(v, max).trim() || null);

const status = (v: unknown): TaskStatus => {
  if (!tasks.TASK_STATUSES.includes(v as TaskStatus)) throw new BizError("Trạng thái phải là Cần làm, Đang làm, Xong hoặc Cần làm lại");
  return v as TaskStatus;
};

/** Người thao tác ghi vào task_events: chỉ nhận mã thành viên còn tồn tại, không thì coi là ẩn danh. */
const byMember = (body: any): string | null => {
  const id = actor(body);
  return id && tasks.memberExists(id) ? id : null;
};

/** Module chứa sản phẩm; null nếu sản phẩm không còn (màn đã xoá) hoặc không thuộc dự án. */
function artifactModule(projectId: string, kind: ArtifactKind, id: string): string | null {
  if (kind === "screen") {
    const s = tasks.screenModule(id);
    return s && s.projectId === projectId ? s.moduleId : null;
  }
  const m = repo.getModule(id);
  return m && m.projectId === projectId ? m.id : null;
}

/**
 * Gộp body (TaskInput, có thể chỉ một phần) vào giá trị hiện có rồi kiểm tra theo quy tắc docs/api.md mục 4.
 * Sản phẩm gắn kèm phải cùng module với task (docs/tests/diagram: artifactId = moduleId). Thiếu moduleId thì tự điền theo sản phẩm.
 * Task cũ trỏ tới sản phẩm đã xoá vẫn sửa được các trường khác (A0 chốt: không báo lỗi).
 */
function fields(projectId: string, body: any, base?: Task): tasks.TaskFields {
  const title = body.title !== undefined ? str(body.title, 300).trim() : (base?.title ?? "");
  if (!title) throw new BizError("Tiêu đề công việc không được để trống");
  const description = body.description !== undefined ? str(body.description, 20000) : (base?.description ?? "");

  const priority = (body.priority !== undefined && body.priority !== null ? body.priority : (base?.priority ?? "Medium")) as TaskPriority;
  if (!tasks.TASK_PRIORITIES.includes(priority)) throw new BizError("Ưu tiên phải là Cao, Trung bình hoặc Thấp");

  const due = opt(body.dueDate, 10);
  const dueDate = due !== undefined ? due : (base?.dueDate ?? null);
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || isNaN(Date.parse(due)))) throw new BizError("Hạn phải có dạng YYYY-MM-DD");

  const asg = opt(body.assigneeId, 100);
  const assigneeId = asg !== undefined ? asg : (base?.assigneeId ?? null);
  if (asg && !tasks.memberExists(asg)) throw new BizError("Người làm không tồn tại");

  const mod = opt(body.moduleId, 100);
  let moduleId = mod !== undefined ? mod : (base?.moduleId ?? null);
  if (mod) {
    const m = repo.getModule(mod);
    if (!m || m.projectId !== projectId) throw new BizError("Module không thuộc dự án này");
  }

  const touchArtifact = body.artifactType !== undefined || body.artifactId !== undefined;
  const artifactType = (touchArtifact ? (opt(body.artifactType, 20) ?? null) : (base?.artifactType ?? null)) as ArtifactKind | null;
  const artifactId = touchArtifact ? (opt(body.artifactId, 100) ?? null) : (base?.artifactId ?? null);
  if (!!artifactType !== !!artifactId) throw new BizError("Loại sản phẩm và sản phẩm gắn kèm phải cùng có hoặc cùng để trống");
  if (artifactType && touchArtifact) {
    if (!tasks.ARTIFACT_KINDS.includes(artifactType)) throw new BizError("Loại sản phẩm phải là màn hình, tài liệu, sơ đồ UC hoặc bộ test");
    const am = artifactModule(projectId, artifactType, artifactId!);
    if (!am) throw new BizError("Sản phẩm gắn kèm không thuộc dự án này");
    if (mod === undefined && !moduleId) moduleId = am;
    if (moduleId !== am) throw new BizError("Sản phẩm gắn kèm phải thuộc đúng module của công việc");
  } else if (artifactType && mod !== undefined) {
    // Chỉ đổi module: sản phẩm đang gắn (nếu còn) phải nằm trong module mới.
    const am = artifactModule(projectId, artifactType, artifactId!);
    if (am && am !== moduleId) throw new BizError("Sản phẩm gắn kèm phải thuộc đúng module của công việc");
  }
  return { moduleId, title, description, assigneeId, dueDate, priority, artifactType, artifactId };
}

route("GET", "/api/projects/:id/tasks", ({ params, query }) => {
  mustProject(params.id);
  return tasks.listTasks(params.id, { assigneeId: query.get("assigneeId") || undefined, moduleId: query.get("moduleId") || undefined });
});

route("POST", "/api/projects/:id/tasks", ({ params, body }) => {
  mustProject(params.id);
  const st = body.status === undefined || body.status === null ? "todo" : status(body.status);
  return tasks.createTask(params.id, fields(params.id, body), st, { byMemberId: byMember(body) });
});

route("GET", "/api/projects/:id/artifacts", ({ params }) => {
  mustProject(params.id);
  return tasks.listArtifacts(params.id);
});

route("GET", "/api/tasks/:id", ({ params }) => {
  mustTask(params.id);
  return tasks.getTaskDetail(params.id);
});

route("PATCH", "/api/tasks/:id", ({ params, body }) => {
  const t = mustTask(params.id);
  if (body.status !== undefined) throw new BizError("Không đổi trạng thái ở đây – hãy kéo thẻ sang cột khác (PATCH /api/tasks/:id/status)");
  return tasks.updateTask(t.id, fields(t.projectId, body, t));
});

route("DELETE", "/api/tasks/:id", ({ params }) => {
  mustTask(params.id);
  tasks.deleteTask(params.id);
  return { ok: true };
});

route("PATCH", "/api/tasks/:id/status", ({ params, body }) => {
  const t = mustTask(params.id);
  return tasks.setTaskStatus(t.id, status(body.status), { byMemberId: byMember(body), bySystem: false });
});

route("GET", "/api/artifacts/:kind/:id/tasks", ({ params }) => {
  if (!tasks.ARTIFACT_KINDS.includes(params.kind as ArtifactKind)) throw new BizError("Loại sản phẩm không hợp lệ");
  return tasks.listTasksByArtifact(params.kind as ArtifactKind, params.id);
});
