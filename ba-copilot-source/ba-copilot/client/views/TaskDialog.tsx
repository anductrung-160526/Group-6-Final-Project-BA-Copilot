// SCR-07 – Tạo / sửa công việc, chọn sản phẩm gắn kèm (FN-15, FN-16). Chủ sở hữu: A6.
// Theo docs/design-system.md: panel xem/sửa chi tiết bên phải dùng Drawer; xác nhận xoá dùng Modal.

import React, { useEffect, useMemo, useState } from "react";
import type { ArtifactKind, ArtifactOption, Member, Task, TaskDetail, TaskPriority, TaskStatus } from "../../shared/types.ts";
import { createTask, deleteTask, getTask, setTaskStatus, updateTask, type TaskInput } from "../api.ts";
import { Badge, Btn, Drawer, Field, MemberPicker, Modal, Select, fmtTime, useUI, type BadgeTone } from "../components/ui.tsx";

// ---------------------------------------------------------------- Nhãn dùng chung cho SCR-06, SCR-07, RelatedTasks
export const TASK_STATUS: { key: TaskStatus; label: string; tone: BadgeTone }[] = [
  { key: "todo", label: "Cần làm", tone: "gray" },
  { key: "doing", label: "Đang làm", tone: "blue" },
  { key: "done", label: "Xong", tone: "green" },
  { key: "redo", label: "Cần làm lại", tone: "amber" },
];
export const statusInfo = (s: TaskStatus) => TASK_STATUS.find((x) => x.key === s) ?? TASK_STATUS[0];

export const TASK_PRIORITY: { key: TaskPriority; label: string; tone: BadgeTone }[] = [
  { key: "High", label: "Cao", tone: "red" },
  { key: "Medium", label: "Trung bình", tone: "orange" },
  { key: "Low", label: "Thấp", tone: "gray" },
];
export const priorityInfo = (p: TaskPriority) => TASK_PRIORITY.find((x) => x.key === p) ?? TASK_PRIORITY[1];

export const artifactKey = (kind: string | null, id: string | null) => (kind && id ? `${kind}:${id}` : "");

/** Nhãn sản phẩm gắn kèm; sản phẩm không còn (màn / module đã xoá) → "Sản phẩm đã xoá" (A0 chốt, đợt 1). */
export function artifactLabel(t: Pick<Task, "artifactType" | "artifactId">, artifacts: ArtifactOption[]): { text: string; missing: boolean } | null {
  if (!t.artifactType || !t.artifactId) return null;
  const a = artifacts.find((x) => x.kind === t.artifactType && x.id === t.artifactId);
  return a ? { text: a.label, missing: false } : { text: "Sản phẩm đã xoá", missing: true };
}

/** "2026-10-30" → "30/10/2026". */
export const fmtDate = (d: string) => d.split("-").reverse().join("/");
export const isOverdue = (t: Pick<Task, "dueDate" | "status">) => !!t.dueDate && t.status !== "done" && t.dueDate < new Date().toLocaleDateString("sv-SE");

interface Form {
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string;
  priority: TaskPriority;
  moduleId: string;
  artifact: string; // "<kind>:<id>" hoặc ""
  status: TaskStatus;
}

const fromTask = (t: Task): Form => ({
  title: t.title,
  description: t.description,
  assigneeId: t.assigneeId,
  dueDate: t.dueDate ?? "",
  priority: t.priority,
  moduleId: t.moduleId ?? "",
  artifact: artifactKey(t.artifactType, t.artifactId),
  status: t.status,
});

export function TaskDialog({
  projectId,
  task,
  initial,
  members,
  modules,
  artifacts,
  actorId,
  onClose,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  /** null = tạo mới. */
  task: Task | null;
  /** Giá trị điền sẵn khi tạo mới (vd trạng thái theo cột bấm "+ Thêm"). */
  initial?: Partial<Pick<Form, "status" | "moduleId" | "assigneeId">>;
  members: Member[];
  modules: { id: string; name: string }[];
  artifacts: ArtifactOption[];
  actorId?: string;
  onClose: () => void;
  onSaved: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useUI();
  const [f, setF] = useState<Form>(() =>
    task
      ? fromTask(task)
      : { title: "", description: "", assigneeId: initial?.assigneeId ?? null, dueDate: "", priority: "Medium", moduleId: initial?.moduleId ?? "", artifact: "", status: initial?.status ?? "todo" },
  );
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (task) getTask(task.id).then(setDetail).catch(() => setDetail(null));
  }, [task?.id]);

  // Sản phẩm chọn được: theo module đang chọn (hoặc cả dự án). Giữ lựa chọn cũ nếu sản phẩm đã bị xoá.
  const artifactOptions = useMemo(() => {
    const list = artifacts.filter((a) => !f.moduleId || a.moduleId === f.moduleId);
    const opts = list.map((a) => ({ value: artifactKey(a.kind, a.id), label: f.moduleId ? a.label : `${a.moduleName} · ${a.label}` }));
    if (f.artifact && !artifacts.some((a) => artifactKey(a.kind, a.id) === f.artifact)) opts.unshift({ value: f.artifact, label: "Sản phẩm đã xoá" });
    return opts;
  }, [artifacts, f.moduleId, f.artifact]);

  const pickModule = (moduleId: string) =>
    setF((x) => {
      const a = artifacts.find((y) => artifactKey(y.kind, y.id) === x.artifact);
      return { ...x, moduleId, artifact: a && moduleId && a.moduleId !== moduleId ? "" : x.artifact };
    });
  const pickArtifact = (key: string) =>
    setF((x) => {
      const a = artifacts.find((y) => artifactKey(y.kind, y.id) === key);
      return { ...x, artifact: key, moduleId: a ? a.moduleId : x.moduleId };
    });

  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? "Thành viên đã xoá") : null);

  const save = async () => {
    if (!f.title.trim()) return toast("Hãy nhập tiêu đề công việc", "err");
    const [kind, ...rest] = f.artifact ? f.artifact.split(":") : [];
    const body: TaskInput = {
      title: f.title.trim(),
      description: f.description,
      assigneeId: f.assigneeId,
      dueDate: f.dueDate || null,
      priority: f.priority,
      moduleId: f.moduleId || null,
      artifactType: (kind as ArtifactKind) || null,
      artifactId: rest.join(":") || null,
    };
    setSaving(true);
    try {
      let saved: Task;
      if (task) {
        saved = await updateTask(task.id, body);
        if (f.status !== task.status) saved = await setTaskStatus(task.id, f.status, actorId);
      } else saved = await createTask(projectId, { ...body, status: f.status, actorId });
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

  return (
    <>
      <Drawer
        title={task ? "Sửa công việc" : "Công việc mới"}
        onClose={onClose}
        footer={
          <>
            {task && (
              <Btn kind="danger" onClick={() => setConfirmDel(true)} data-testid="task-delete">
                Xoá
              </Btn>
            )}
            <span className="spacer" />
            <Btn kind="ghost" onClick={onClose}>
              Huỷ
            </Btn>
            <Btn kind="primary" onClick={save} disabled={saving} data-testid="task-save">
              {saving ? "Đang lưu…" : task ? "Lưu" : "Tạo công việc"}
            </Btn>
          </>
        }
      >
        <Field label="Tiêu đề *">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="vd Viết SRS màn Đăng nhập" autoFocus data-testid="task-title" />
        </Field>
        <Field label="Mô tả">
          <textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Việc cần làm, tiêu chí xong…" data-testid="task-desc" />
        </Field>
        <Field label="Người làm" hint={members.length ? undefined : "Chưa có thành viên – thêm ở trang Thành viên."}>
          <MemberPicker members={members} value={f.assigneeId} onChange={(v) => set("assigneeId", v)} testId="task-assignee" />
        </Field>
        <Field label="Hạn">
          <input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} data-testid="task-due" />
        </Field>
        <Field label="Ưu tiên">
          <Select value={f.priority} options={TASK_PRIORITY.map((p) => ({ value: p.key, label: p.label }))} onChange={(v) => set("priority", (v || "Medium") as TaskPriority)} testId="task-priority" />
        </Field>
        <Field label="Trạng thái">
          <Select value={f.status} options={TASK_STATUS.map((s) => ({ value: s.key, label: s.label }))} onChange={(v) => set("status", (v || "todo") as TaskStatus)} testId="task-status" />
        </Field>
        <Field label="Module">
          <Select value={f.moduleId} placeholder="Cấp dự án (không thuộc module)" options={modules.map((m) => ({ value: m.id, label: m.name }))} onChange={pickModule} testId="task-module" />
        </Field>
        <Field label="Sản phẩm gắn kèm" hint="Màn hình, bộ tài liệu, sơ đồ UC hoặc bộ test của module.">
          <Select value={f.artifact} placeholder="Không gắn sản phẩm" options={artifactOptions} onChange={pickArtifact} testId="task-artifact" />
        </Field>

        {task && detail && (
          <div className="box">
            <div className="box-title">Lịch sử trạng thái</div>
            {detail.events.map((e) => (
              <div key={e.id} className="small" data-testid="task-event">
                <span className="muted">{fmtTime(e.createdAt)}</span> · {e.fromStatus ? `${statusInfo(e.fromStatus).label} → ` : "Tạo ở "}
                <strong>{statusInfo(e.toStatus).label}</strong>
                {" · "}
                {e.bySystem ? `Hệ thống${e.reason ? ` (${e.reason})` : ""}` : (memberName(e.byMemberId) ?? "Không rõ người")}
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {confirmDel && task && (
        <Modal
          title="Xoá công việc?"
          onClose={() => setConfirmDel(false)}
          footer={
            <>
              <Btn kind="ghost" onClick={() => setConfirmDel(false)}>
                Huỷ
              </Btn>
              <Btn kind="danger" onClick={remove} data-testid="task-delete-confirm">
                Xoá
              </Btn>
            </>
          }
        >
          <p>
            Xoá <strong>{task.title}</strong> cùng toàn bộ lịch sử trạng thái. Không khôi phục được.
          </p>
        </Modal>
      )}
    </>
  );
}

export const priorityBadge = (p: TaskPriority) => <Badge tone={priorityInfo(p).tone}>{priorityInfo(p).label}</Badge>;
