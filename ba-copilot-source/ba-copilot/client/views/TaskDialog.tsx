// SCR-07 – Chi tiết công việc (đợt 5): xem / sửa / xoá, lịch sử trạng thái, mở sản phẩm gắn kèm, Xong / Duyệt / Yêu cầu sửa.
// Chủ sở hữu: C7 (trước: A6). Ngăn phải = Drawer (40%); Sửa / Xoá = RowActions dạng nút; nút duyệt = ApprovalBar.
// Task có gắn sản phẩm (đợt 5) → nút gọi endpoint duyệt của sản phẩm (task tự đi theo); không gắn → đổi trạng thái task.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ArtifactKind, ArtifactOption, ArtifactState, DiagramKind, DocKind, Member, Task, TaskDetail, TaskPriority, TaskStatus } from "../../shared/types.ts";
import { moveError, normStatus, taskMove, artifactTitle } from "../../shared/taskRules.ts";
import {
  approveArtifact,
  createTask,
  deleteTask,
  getArtifactState,
  getTask,
  markArtifactDone,
  requestArtifactChange,
  setTaskStatus,
  updateTask,
  type TaskInput,
} from "../api.ts";
import { ApprovalBar, Badge, Btn, Drawer, Field, Icon, MemberPicker, RevisionTag, RowActions, Select, StatusBadge, fmtTime, useUI, type BadgeTone, type IconName } from "../components/ui.tsx";
import { ROLE_LABEL, useCurrentMember } from "../currentMember.ts";
import { workHref } from "../projectMenu.ts";
import { loadDoneBlockReason } from "../prereq.ts";

// ---------------------------------------------------------------- Nhãn dùng chung cho Kanban, ngăn chi tiết, RelatedTasks
/** 4 cột / trạng thái task đợt 5 (kế hoạch đợt 5, mục 1). */
export const TASK_STATUS: { key: Exclude<TaskStatus, "redo">; label: string; tone: BadgeTone }[] = [
  { key: "todo", label: "Cần làm", tone: "gray" },
  { key: "doing", label: "Đang làm", tone: "blue" },
  { key: "done", label: "Xong", tone: "orange" },
  { key: "approved", label: "Đã duyệt", tone: "green" },
];
export const statusInfo = (s: TaskStatus) => TASK_STATUS.find((x) => x.key === normStatus(s)) ?? TASK_STATUS[0];

export const TASK_PRIORITY: { key: TaskPriority; label: string; tone: BadgeTone }[] = [
  { key: "High", label: "Cao", tone: "red" },
  { key: "Medium", label: "Trung bình", tone: "orange" },
  { key: "Low", label: "Thấp", tone: "gray" },
];
export const priorityInfo = (p: TaskPriority) => TASK_PRIORITY.find((x) => x.key === p) ?? TASK_PRIORITY[1];
export const priorityBadge = (p: TaskPriority) => <Badge tone={priorityInfo(p).tone}>{priorityInfo(p).label}</Badge>;

/** Icon theo loại sản phẩm (bảng icon chung, R-080). "docs" = bộ tài liệu cũ. */
export const ARTIFACT_ICON: Record<ArtifactKind, IconName> = { screen: "screen", doc: "doc", diagram: "diagram", tests: "tests", docs: "doc" };

type ArtifactLike = { kind?: ArtifactKind | null; id?: string | null; sub?: string | null };
/** Khoá chọn sản phẩm "<kind>:<id>:<sub>". */
export const artifactKey = (kind: string | null | undefined, id: string | null | undefined, sub?: string | null) => (kind && id ? `${kind}:${id}:${sub ?? ""}` : "");
const taskArtifactKey = (t: Pick<Task, "artifactType" | "artifactId" | "artifactSub">) => artifactKey(t.artifactType, t.artifactId, t.artifactType === "doc" || t.artifactType === "diagram" ? t.artifactSub : null);
const findArtifact = (t: Pick<Task, "artifactType" | "artifactId" | "artifactSub">, artifacts: ArtifactOption[]) =>
  artifacts.find((a) => artifactKey(a.kind, a.id, a.sub) === taskArtifactKey(t));

/**
 * Nhãn sản phẩm gắn kèm. Bộ tài liệu cũ ("docs") → "Tài liệu (cũ) – <module>"; sản phẩm không còn → "Sản phẩm đã xoá".
 */
export function artifactLabel(
  t: Pick<Task, "artifactType" | "artifactId" | "artifactSub" | "moduleId">,
  artifacts: ArtifactOption[],
  moduleName?: (id: string | null) => string | null,
): { text: string; missing: boolean; kind: ArtifactKind } | null {
  if (!t.artifactType || !t.artifactId) return null;
  if (t.artifactType === "docs") return { text: artifactTitle("docs", null, moduleName?.(t.artifactId) ?? ""), missing: false, kind: "docs" };
  const a = findArtifact(t, artifacts);
  return a ? { text: a.label, missing: false, kind: a.kind } : { text: "Sản phẩm đã xoá", missing: true, kind: t.artifactType };
}

/** Đường dẫn mở sản phẩm trong "Thực hiện công việc". */
export function artifactHref(projectId: string, t: Pick<Task, "artifactType" | "artifactId" | "artifactSub" | "moduleId">): string | null {
  if (!t.artifactType || !t.artifactId) return null;
  switch (t.artifactType) {
    case "screen":
      return t.moduleId ? workHref(projectId, t.moduleId, "prototype", t.artifactId) : null;
    case "doc":
      return workHref(projectId, t.artifactId, "docs", t.artifactSub ?? undefined);
    case "docs":
      return workHref(projectId, t.artifactId, "docs");
    case "diagram":
      return workHref(projectId, t.artifactId, "diagrams", t.artifactSub ?? "UC");
    case "tests":
      return workHref(projectId, t.artifactId, "tests");
  }
}

/** "2026-10-30" → "30/10/2026". */
export const fmtDate = (d: string) => d.split("-").reverse().join("/");
export const isOverdue = (t: Pick<Task, "dueDate" | "status">) => !!t.dueDate && t.status !== "done" && t.status !== "approved" && t.dueDate < new Date().toLocaleDateString("sv-SE");

type V5Kind = Exclude<ArtifactKind, "docs">;
/** Task gắn sản phẩm đợt 5 (đổi trạng thái qua endpoint duyệt của sản phẩm). */
const linkedKind = (t: Task): V5Kind | null => (t.artifactType && t.artifactType !== "docs" && t.artifactId ? t.artifactType : null);

/**
 * Đổi trạng thái task theo đúng mũi tên (shared/taskRules.ts). Sai luật → ném lỗi có lý do tiếng Việt (chưa gọi API).
 * Task gắn sản phẩm (đã có nội dung): Xong / Duyệt / Yêu cầu sửa gọi endpoint duyệt của sản phẩm → mọi task gắn sản phẩm
 * đó đi theo. Còn lại (Bắt đầu làm, task không gắn, sản phẩm chưa có / đã xoá) → PATCH trạng thái task.
 * Trả về task sau khi đổi và thông báo GitHub (khi Duyệt).
 */
export async function moveTask(t: Task, to: TaskStatus, me: Member | null): Promise<{ task: Task; message?: string }> {
  const err = moveError(t.status, to, me);
  if (err) throw new Error(err);
  const mv = taskMove(t.status, to);
  const kind = linkedKind(t);
  if (mv && mv !== "start" && kind) {
    const sub = (t.artifactSub ?? undefined) as DocKind | DiagramKind | undefined;
    const st = await getArtifactState(kind, t.artifactId!, sub).catch(() => null);
    const target = mv === "done" ? "done" : mv === "approve" ? "approved" : "draft";
    const already = st && st.status === target && (mv !== "request-change" || st.revisionRequested);
    if (st && st.status !== "none" && !already) {
      const b = { sub, baseRev: st.rev, actorId: me?.id };
      const r =
        mv === "done"
          ? await markArtifactDone(kind, t.artifactId!, b)
          : mv === "approve"
            ? await approveArtifact(kind, t.artifactId!, b)
            : await requestArtifactChange(kind, t.artifactId!, { sub, actorId: me?.id });
      const task = r.tasks.find((x) => x.id === t.id) ?? (await getTask(t.id));
      return { task, message: r.git?.message };
    }
  }
  return { task: await setTaskStatus(t.id, to, me?.id) };
}

// ---------------------------------------------------------------- Ngăn chi tiết

interface Form {
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string;
  priority: TaskPriority;
  moduleId: string;
  artifact: string; // artifactKey hoặc ""
}

const fromTask = (t: Task): Form => ({
  title: t.title,
  description: t.description,
  assigneeId: t.assigneeId,
  dueDate: t.dueDate ?? "",
  priority: t.priority,
  moduleId: t.moduleId ?? "",
  artifact: taskArtifactKey(t),
});

export function TaskDialog({
  projectId,
  task,
  initial,
  members,
  modules,
  artifacts,
  onClose,
  onSaved,
  onChanged,
  onDeleted,
}: {
  projectId: string;
  /** null = tạo mới. */
  task: Task | null;
  /** Giá trị điền sẵn khi tạo mới (vd trạng thái theo cột bấm "+ Thêm"). */
  initial?: { status?: TaskStatus; moduleId?: string; assigneeId?: string | null };
  members: Member[];
  modules: { id: string; name: string }[];
  artifacts: ArtifactOption[];
  onClose: () => void;
  /** Tạo / sửa xong (đóng ngăn). */
  onSaved: (t: Task) => void;
  /** Trạng thái đổi (Xong / Duyệt / Yêu cầu sửa) – ngăn vẫn mở; trang tải lại bảng. */
  onChanged?: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useUI();
  const { me } = useCurrentMember();
  const isLead = me?.role === "BA_LEAD";
  const [editing, setEditing] = useState(!task);
  const [f, setF] = useState<Form>(() =>
    task ? fromTask(task) : { title: "", description: "", assigneeId: initial?.assigneeId ?? null, dueDate: "", priority: "Medium", moduleId: initial?.moduleId ?? "", artifact: "" },
  );
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [art, setArt] = useState<ArtifactState | null>(null);
  /** Lý do khoá nút Xong: bước tiên quyết của sản phẩm gắn kèm chưa Xong (shared/prereq.ts). */
  const [doneLock, setDoneLock] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const cur: Task | null = detail ?? task;
  const reload = useCallback(async () => {
    if (!task) return;
    const d = await getTask(task.id).catch(() => null);
    setDetail(d);
    const kind = d ? linkedKind(d) : null;
    const sub = (d?.artifactSub ?? undefined) as DocKind | DiagramKind | undefined;
    const [st, lock] = kind && d ? await Promise.all([getArtifactState(kind, d.artifactId!, sub).catch(() => null), loadDoneBlockReason(projectId, kind, d.artifactId!, sub)]) : [null, null];
    setArt(st);
    setDoneLock(lock);
    return d;
  }, [task?.id, projectId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const moduleName = (id: string | null) => (id ? (modules.find((m) => m.id === id)?.name ?? null) : null);
  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? "Thành viên đã xoá") : null);

  // Sản phẩm chọn được: theo module đang chọn (hoặc cả dự án). Giữ lựa chọn cũ nếu sản phẩm đã xoá / bộ tài liệu cũ.
  const artifactOptions = useMemo(() => {
    const list = artifacts.filter((a) => !f.moduleId || a.moduleId === f.moduleId);
    const opts = list.map((a) => ({ value: artifactKey(a.kind, a.id, a.sub), label: f.moduleId ? a.label : `${a.moduleName} · ${a.label}` }));
    if (f.artifact && !artifacts.some((a) => artifactKey(a.kind, a.id, a.sub) === f.artifact)) {
      const lb = task ? artifactLabel(task, artifacts, moduleName) : null;
      opts.unshift({ value: f.artifact, label: lb?.text ?? "Sản phẩm đã xoá" });
    }
    return opts;
  }, [artifacts, f.moduleId, f.artifact]);

  const pickModule = (moduleId: string) =>
    setF((x) => {
      const a = artifacts.find((y) => artifactKey(y.kind, y.id, y.sub) === x.artifact);
      return { ...x, moduleId, artifact: a && moduleId && a.moduleId !== moduleId ? "" : x.artifact };
    });
  const pickArtifact = (key: string) =>
    setF((x) => {
      const a = artifacts.find((y) => artifactKey(y.kind, y.id, y.sub) === key);
      return { ...x, artifact: key, moduleId: a ? a.moduleId : x.moduleId };
    });

  const save = async () => {
    if (!f.title.trim()) return toast("Hãy nhập tiêu đề công việc", "err");
    const body: TaskInput & { artifactSub?: string | null } = {
      title: f.title.trim(),
      description: f.description,
      assigneeId: f.assigneeId,
      dueDate: f.dueDate || null,
      priority: f.priority,
      moduleId: f.moduleId || null,
    };
    // Chỉ gửi sản phẩm khi đổi (task cũ gắn bộ tài liệu "docs" giữ nguyên nếu không chọn lại).
    if (!task || f.artifact !== taskArtifactKey(task)) {
      const [kind, id, sub] = f.artifact ? f.artifact.split(":") : [];
      body.artifactType = (kind as ArtifactKind) || null;
      body.artifactId = id || null;
      body.artifactSub = sub || null;
    }
    setSaving(true);
    try {
      const saved = task ? await updateTask(task.id, body) : await createTask(projectId, { ...body, status: initial?.status === "doing" ? "doing" : "todo", actorId: me?.id });
      toast(task ? "Đã lưu công việc" : "Đã tạo công việc", "ok");
      onSaved(saved);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    try {
      await deleteTask(task.id);
      toast("Đã xoá công việc", "ok");
      onDeleted(task.id);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const move = async (to: TaskStatus, okText: string) => {
    if (!cur) return;
    setBusy(true);
    try {
      const r = await moveTask(cur, to, me);
      toast(r.message ? `${okText} · ${r.message}` : okText, "ok");
      const d = await reload();
      onChanged?.(d ?? r.task);
    } catch (e) {
      toast((e as Error).message, "err");
      reload();
    } finally {
      setBusy(false);
    }
  };

  // ---------- Tạo mới / sửa
  if (editing || !cur) {
    return (
      <Drawer
        title={task ? "Sửa công việc" : "Công việc mới"}
        onClose={onClose}
        testId="task-drawer"
        footer={
          <>
            <span className="spacer" />
            <Btn kind="ghost" onClick={task ? () => (setF(fromTask(cur!)), setEditing(false)) : onClose}>
              Huỷ
            </Btn>
            <Btn kind="primary" onClick={save} disabled={saving} data-testid="task-save">
              {saving ? "Đang lưu…" : task ? "Lưu" : "Tạo công việc"}
            </Btn>
          </>
        }
      >
        <Field label="Tiêu đề *">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="vd Viết BRD module Xác thực" autoFocus data-testid="task-title" />
        </Field>
        <Field label="Mô tả">
          <textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Việc cần làm, tiêu chí xong…" data-testid="task-desc" />
        </Field>
        <Field label="Người làm" hint={members.length ? undefined : "Chưa có thành viên – thêm ở Quản trị hệ thống."}>
          <MemberPicker members={members.map((m) => ({ id: m.id, name: m.name, role: ROLE_LABEL[m.role] }))} value={f.assigneeId} onChange={(v) => set("assigneeId", v)} testId="task-assignee" />
        </Field>
        <Field label="Hạn">
          <input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} data-testid="task-due" />
        </Field>
        <Field label="Ưu tiên">
          <Select value={f.priority} options={TASK_PRIORITY.map((p) => ({ value: p.key, label: p.label }))} onChange={(v) => set("priority", (v || "Medium") as TaskPriority)} testId="task-priority" />
        </Field>
        <Field label="Module">
          <Select value={f.moduleId} placeholder="Cấp dự án (không thuộc module)" options={modules.map((m) => ({ value: m.id, label: m.name }))} onChange={pickModule} testId="task-module" />
        </Field>
        <Field label="Sản phẩm gắn kèm" hint="Màn hình, tài liệu, sơ đồ hoặc bộ test của module. Task gắn sản phẩm đổi trạng thái theo sản phẩm.">
          <Select value={f.artifact} placeholder="Không gắn sản phẩm" options={artifactOptions} onChange={pickArtifact} testId="task-artifact" />
        </Field>
      </Drawer>
    );
  }

  // ---------- Xem chi tiết
  const t = cur;
  const lb = artifactLabel(t, artifacts, moduleName);
  const href = lb && !lb.missing ? artifactHref(projectId, t) : null;
  const linked = !!linkedKind(t) && !!art && art.status !== "none";
  const s = normStatus(t.status);

  return (
    <Drawer
      title={t.title}
      onClose={onClose}
      testId="task-drawer"
      footer={
        <>
          <RowActions
            variant="buttons"
            testId="task"
            onEdit={() => setEditing(true)}
            onDelete={remove}
            deleteConfirm={{ title: "Xoá công việc?", message: `Xoá “${t.title}” cùng toàn bộ lịch sử trạng thái. Không khôi phục được.` }}
          />
          <span className="spacer" />
          <Btn kind="ghost" onClick={onClose}>
            Đóng
          </Btn>
        </>
      }
    >
      {linked ? (
        <ApprovalBar
          status={art!.status}
          revisionRequested={art!.revisionRequested}
          isLead={isLead}
          busy={busy}
          disabledReason={art!.status === "draft" || art!.status === "outdated" ? (doneLock ?? undefined) : undefined}
          onDone={() => move("done", "Đã bấm Xong")}
          onApprove={() => move("approved", "Đã duyệt")}
          onRequestChange={() => move("doing", "Đã yêu cầu sửa")}
          testId="task-approval"
        />
      ) : (
        // Task không gắn sản phẩm: thanh duyệt theo trạng thái task (todo/doing/done/approved).
        <ApprovalBar
          status={s}
          revisionRequested={t.revisionRequested}
          isLead={isLead}
          busy={busy}
          onStart={() => move("doing", "Đã chuyển sang Đang làm")}
          onDone={() => move("done", "Đã bấm Xong")}
          onApprove={() => move("approved", "Đã duyệt")}
          onRequestChange={() => move("doing", "Đã yêu cầu sửa")}
          reopenApproved
          testId="task-approval"
        />
      )}

      {linked && (
        // Không đặt nút trong Field (<label> sẽ chuyển cú bấm vào nút).
        <div className="toolbar" data-testid="task-status-row">
          <span className="muted small">Công việc</span>
          <StatusBadge status={s} testId="task-status" />
          {t.revisionRequested && <RevisionTag testId="task-revision" />}
          {s === "todo" && (
            <Btn size="sm" kind="ghost" onClick={() => move("doing", "Đã chuyển sang Đang làm")} disabled={busy} data-testid="task-start">
              <Icon name="play" size="sm" />
              Bắt đầu làm
            </Btn>
          )}
        </div>
      )}
      <Field label="Sản phẩm gắn kèm">
        {lb ? (
          <span data-testid="task-artifact-view">
            <Icon name={ARTIFACT_ICON[lb.kind]} size="sm" />{" "}
            {href ? (
              <a className="link" href={href} onClick={onClose} data-testid="task-artifact-link">
                {lb.text} <Icon name="external" size="xs" />
              </a>
            ) : (
              <Badge tone={lb.missing ? "flag" : "gray"}>{lb.text}</Badge>
            )}
          </span>
        ) : (
          <span className="muted">Không gắn sản phẩm</span>
        )}
      </Field>
      {t.description && (
        <Field label="Mô tả">
          <span className="clamp">{t.description}</span>
        </Field>
      )}
      <Field label="Người làm">
        <span>{memberName(t.assigneeId) ?? <span className="muted">Chưa giao</span>}</span>
      </Field>
      <Field label="Hạn · Ưu tiên">
        <span>
          {t.dueDate ? isOverdue(t) ? <Badge tone="red">Quá hạn {fmtDate(t.dueDate)}</Badge> : fmtDate(t.dueDate) : <span className="muted">Không có hạn</span>} · {priorityBadge(t.priority)}
        </span>
      </Field>
      <Field label="Module">
        <span>{moduleName(t.moduleId) ?? <span className="muted">Cấp dự án</span>}</span>
      </Field>

      {detail && (
        <div className="box">
          <div className="box-title">
            <Icon name="history" size="sm" /> Lịch sử trạng thái
          </div>
          {detail.events.map((e) => (
            <div key={e.id} className="small" data-testid="task-event">
              <span className="muted">{fmtTime(e.createdAt)}</span> · {e.fromStatus ? (normStatus(e.fromStatus) === normStatus(e.toStatus) ? "Giữ " : `${statusInfo(e.fromStatus).label} → `) : "Tạo ở "}
              <strong>{statusInfo(e.toStatus).label}</strong>
              {" · "}
              {memberName(e.byMemberId) ?? (e.bySystem ? "Hệ thống" : "Không rõ người")}
              {e.reason ? <span className="muted"> ({e.reason})</span> : null}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
