// Công việc Kanban (FN-15 → FN-19, đợt 5). Hợp đồng: docs/api.md mục "Công việc" + "Đợt 5". Chủ sở hữu: C7 (trước: A6).
// Đổi trạng thái bằng tay theo đúng mũi tên (shared/taskRules.ts): todo→doing · doing→done (cần người bấm) ·
// done→approved và done/approved→doing (+ cờ Yêu cầu sửa) chỉ BA Lead. Task có gắn sản phẩm (đợt 5) thì đổi qua
// luồng duyệt của sản phẩm (routes/approval.ts applyApproval) để task và sản phẩm luôn đồng bộ.

import * as repo from "../repo.ts";
import * as tasks from "../repo/tasks.ts";
import { BizError } from "../service.ts";
import { route, str, actor, currentMember, HttpError, type HandlerCtx } from "../http.ts";
import { getArtifactState } from "../db.ts";
import { initialTaskState, moveError, taskMove } from "../../shared/taskRules.ts";
import { applyApproval, parseArtifactRef } from "./approval.ts";
import { DIAGRAM_KINDS, DOC_KINDS, type ArtifactKind, type DiagramKind, type DocKind, type Task, type TaskPriority, type TaskStatus } from "../../shared/types.ts";

const mustProject = (id: string) => {
  if (!repo.getProject(id)) throw new BizError("Project not found", 404);
};
const mustTask = (id: string): Task => {
  const t = tasks.getTask(id);
  if (!t) throw new BizError("Task not found", 404);
  return t;
};

/** Chuỗi tuỳ chọn: undefined = không gửi, null / "" = xoá giá trị. */
const opt = (v: unknown, max = 200): string | null | undefined => (v === undefined ? undefined : v === null ? null : str(v, max).trim() || null);

const status = (v: unknown): TaskStatus => {
  if (!tasks.TASK_STATUSES.includes(v as TaskStatus)) throw new BizError("Status must be To do, In progress, Done or Approved");
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

/** sub của tài liệu/sơ đồ: doc bắt buộc DocKind, diagram mặc định UC, loại khác bỏ qua. */
function artifactSub(kind: ArtifactKind | null, v: unknown): DocKind | DiagramKind | null {
  const s = typeof v === "string" && v ? v : null;
  if (kind === "doc") {
    if (!s || !(DOC_KINDS as string[]).includes(s)) throw new BizError("Choose a document type (BRD, UC Specification, SRS, FRD-NFR, API Spec)");
    return s as DocKind;
  }
  if (kind === "diagram") {
    if (s && !(DIAGRAM_KINDS as string[]).includes(s)) throw new BizError("Invalid diagram type");
    return (s ?? "UC") as DiagramKind;
  }
  return null;
}

/**
 * Gộp body (TaskInput + artifactSub, có thể chỉ một phần) vào giá trị hiện có rồi kiểm tra theo quy tắc docs/api.md mục 4.
 * Sản phẩm gắn kèm phải cùng module với task (doc/diagram/tests: artifactId = moduleId). Thiếu moduleId thì tự điền theo sản phẩm.
 * Task cũ trỏ tới sản phẩm đã xoá (hoặc bộ tài liệu cũ "docs") vẫn sửa được các trường khác.
 */
function fields(projectId: string, body: any, base?: Task): tasks.TaskFields {
  const title = body.title !== undefined ? str(body.title, 300).trim() : (base?.title ?? "");
  if (!title) throw new BizError("Task title is required");
  const description = body.description !== undefined ? str(body.description, 20000) : (base?.description ?? "");

  const priority = (body.priority !== undefined && body.priority !== null ? body.priority : (base?.priority ?? "Medium")) as TaskPriority;
  if (!tasks.TASK_PRIORITIES.includes(priority)) throw new BizError("Priority must be High, Medium or Low");

  const due = opt(body.dueDate, 10);
  const dueDate = due !== undefined ? due : (base?.dueDate ?? null);
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || isNaN(Date.parse(due)))) throw new BizError("Due date must be in YYYY-MM-DD format");

  const asg = opt(body.assigneeId, 100);
  const assigneeId = asg !== undefined ? asg : (base?.assigneeId ?? null);
  if (asg && !tasks.memberExists(asg)) throw new BizError("Assignee does not exist");

  const mod = opt(body.moduleId, 100);
  let moduleId = mod !== undefined ? mod : (base?.moduleId ?? null);
  if (mod) {
    const m = repo.getModule(mod);
    if (!m || m.projectId !== projectId) throw new BizError("The module does not belong to this project");
  }

  const touchArtifact = body.artifactType !== undefined || body.artifactId !== undefined || body.artifactSub !== undefined;
  const artifactType = (touchArtifact ? (opt(body.artifactType, 20) ?? null) : (base?.artifactType ?? null)) as ArtifactKind | null;
  const artifactId = touchArtifact ? (opt(body.artifactId, 100) ?? null) : (base?.artifactId ?? null);
  let sub = touchArtifact ? null : (base?.artifactSub ?? null);
  if (!!artifactType !== !!artifactId) throw new BizError("Artifact type and linked artifact must both be set or both be empty");
  if (artifactType && touchArtifact) {
    if (!tasks.ARTIFACT_KINDS.includes(artifactType)) throw new BizError("Artifact type must be screen, document, diagram or test suite");
    sub = artifactSub(artifactType, body.artifactSub);
    const am = artifactModule(projectId, artifactType, artifactId!);
    if (!am) throw new BizError("The linked artifact does not belong to this project");
    if (mod === undefined && !moduleId) moduleId = am;
    if (moduleId !== am) throw new BizError("The linked artifact must belong to the task's module");
  } else if (artifactType && mod !== undefined) {
    // Chỉ đổi module: sản phẩm đang gắn (nếu còn) phải nằm trong module mới.
    const am = artifactModule(projectId, artifactType, artifactId!);
    if (am && am !== moduleId) throw new BizError("The linked artifact must belong to the task's module");
  }
  return { moduleId, title, description, assigneeId, dueDate, priority, artifactType, artifactId, artifactSub: sub };
}

route("GET", "/api/projects/:id/tasks", ({ params, query }) => {
  mustProject(params.id);
  return tasks.listTasks(params.id, { assigneeId: query.get("assigneeId") || undefined, moduleId: query.get("moduleId") || undefined });
});

/** Trạng thái hiện tại của sản phẩm gắn task (đợt 5); không gắn / bộ tài liệu cũ / sản phẩm đã xoá → null. */
function linkedState(f: tasks.TaskFields) {
  if (!f.artifactType || f.artifactType === "docs" || !f.artifactId) return null;
  return getArtifactState(parseArtifactRef(f.artifactType, f.artifactId, f.artifactSub ?? undefined));
}

route("POST", "/api/projects/:id/tasks", ({ params, body }) => {
  mustProject(params.id);
  const st = body.status === undefined || body.status === null ? "todo" : status(body.status);
  if (st !== "todo" && st !== "doing") throw new BizError("A new task can only be To do or In progress");
  const f = fields(params.id, body);
  // Gắn sản phẩm đã Xong / Đã duyệt (hoặc đang chờ sửa) → task bắt đầu đúng trạng thái đó (shared/taskRules.ts).
  const init = initialTaskState(st, linkedState(f));
  return tasks.createTask(params.id, f, init.status, { byMemberId: byMember(body) }, init.revisionRequested);
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
  if (body.status !== undefined) throw new BizError("Status cannot be changed here – drag the card to another column (PATCH /api/tasks/:id/status)");
  return tasks.updateTask(t.id, fields(t.projectId, body, t));
});

route("DELETE", "/api/tasks/:id", ({ params }) => {
  mustTask(params.id);
  tasks.deleteTask(params.id);
  return { ok: true };
});

/**
 * Đổi trạng thái bằng tay (body `{ status, actorId?, baseRev? }`). Sai mũi tên → 400; thiếu quyền (Xong không rõ người, Duyệt / Yêu cầu sửa không phải BA Lead) → 403.
 * Task gắn sản phẩm đợt 5 còn tồn tại: Xong / Duyệt / Yêu cầu sửa đi qua luồng duyệt của sản phẩm (task tự đi theo).
 * Sản phẩm đã ở đúng trạng thái đích (lệch do dữ liệu cũ) thì chỉ đồng bộ task.
 */
route("PATCH", "/api/tasks/:id/status", async (ctx: HandlerCtx) => {
  const { params, body } = ctx;
  const t = mustTask(params.id);
  const to = status(body.status);
  if (t.status === to) return t;
  const me = currentMember(ctx);
  const mv = taskMove(t.status, to);
  const err = moveError(t.status, to, me);
  if (err) throw new HttpError(err, mv ? 403 : 400, mv ? "FORBIDDEN" : undefined);
  const by = { byMemberId: me?.id ?? byMember(body), bySystem: false };

  if (mv !== "start" && t.artifactType && t.artifactType !== "docs" && t.artifactId) {
    const ref = parseArtifactRef(t.artifactType, t.artifactId, t.artifactSub ?? undefined);
    const st = getArtifactState(ref);
    if (st && st.status !== "none") {
      const target = mv === "done" ? "done" : mv === "approve" ? "approved" : "draft";
      const alreadyThere = st.status === target && (mv !== "request-change" || st.revisionRequested);
      if (!alreadyThere) {
        // baseRev (rev sản phẩm client đang thấy) đi kèm nếu có → lệch thì 409 như khi bấm trên màn sản phẩm.
        await applyApproval(mv!, ref, { req: ctx.req, query: ctx.query, body: { actorId: body.actorId, baseRev: body.baseRev } });
        const after = tasks.getTask(t.id)!;
        if (after.status === to) return after; // sự kiện đã kéo task theo
      }
    }
  }
  return tasks.setTaskStatus(t.id, to, by, mv === "request-change" ? true : mv === "approve" ? false : undefined);
});

route("GET", "/api/artifacts/:kind/:id/tasks", ({ params, query }) => {
  if (!tasks.ARTIFACT_KINDS.includes(params.kind as ArtifactKind) && params.kind !== "docs") throw new BizError("Invalid artifact type");
  return tasks.listTasksByArtifact(params.kind as ArtifactKind, params.id, query.get("sub") || undefined);
});
