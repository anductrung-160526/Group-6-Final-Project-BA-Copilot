// SCR-06 – Bảng công việc Kanban (FN-17, FN-18). Chủ sở hữu: A6. Trang đăng ký ở client/routes.ts (key "tasks").
// Kéo thẻ sang cột khác: đổi chỗ ngay trên màn rồi gọi PATCH /api/tasks/:id/status; lỗi thì trả thẻ về cột cũ.

import React, { useCallback, useEffect, useState } from "react";
import type { ArtifactOption, Member, Task, TaskStatus } from "../../shared/types.ts";
import { get, listArtifacts, listMembers, listTasks, setTaskStatus } from "../api.ts";
import { Avatar, Badge, Btn, Empty, KanbanCard, KanbanColumn, Select, useUI } from "../components/ui.tsx";
import type { PageProps } from "../routes.ts";
import { currentMemberId } from "../currentMember.ts";
import { TASK_STATUS, TaskDialog, artifactLabel, fmtDate, isOverdue, priorityBadge } from "./TaskDialog.tsx";

/** Người đang thao tác, gửi kèm `actorId` để ghi task_events.by_member_id (FN-18). */
const currentActorId = (): string | undefined => currentMemberId();

interface Project {
  id: string;
  name: string;
  modules: { id: string; name: string }[];
}

type Editing = { task: Task | null; status?: TaskStatus } | null;

export function TasksView({ projectId }: PageProps) {
  const { toast } = useUI();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactOption[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  useEffect(() => {
    get<Project>(`/api/projects/${encodeURIComponent(projectId)}`).then(setProject).catch((e) => toast(e.message, "err"));
    listMembers().then(setMembers).catch(() => setMembers([])); // API thành viên (A3) chưa có thì bỏ trống
    listArtifacts(projectId).then(setArtifacts).catch(() => setArtifacts([]));
  }, [projectId]);

  const load = useCallback(
    () =>
      listTasks(projectId, { assigneeId: assigneeId || undefined, moduleId: moduleId || undefined })
        .then(setTasks)
        .catch((e) => toast(e.message, "err")),
    [projectId, assigneeId, moduleId],
  );
  useEffect(() => {
    load();
  }, [load]);

  const move = async (cardId: string, to: string) => {
    const t = tasks?.find((x) => x.id === cardId);
    if (!t || t.status === to) return;
    const from = t.status;
    const put = (status: TaskStatus) => setTasks((list) => list?.map((x) => (x.id === cardId ? { ...x, status } : x)) ?? list);
    put(to as TaskStatus);
    try {
      const saved = await setTaskStatus(cardId, to as TaskStatus, currentActorId());
      setTasks((list) => list?.map((x) => (x.id === cardId ? saved : x)) ?? list);
    } catch (e) {
      put(from);
      toast(`Không chuyển được thẻ: ${(e as Error).message}`, "err");
    }
  };

  const saved = (t: Task) => {
    setEditing(null);
    load();
    // Sản phẩm mới tạo sau khi mở trang (màn, module) – tải lại để nhãn gắn kèm đúng.
    if (t.artifactType && !artifacts.some((a) => a.kind === t.artifactType && a.id === t.artifactId)) listArtifacts(projectId).then(setArtifacts).catch(() => {});
  };

  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? null) : null);
  const moduleName = (id: string | null) => (id ? (project?.modules.find((m) => m.id === id)?.name ?? null) : null);
  const filtered = !!(assigneeId || moduleId);

  if (!project || !tasks) return <div className="page muted">Đang tải…</div>;
  return (
    <div className="page" data-testid="tasks-view">
      <div className="crumbs">
        <a href="#/">Dự án</a> / <a href={`#/p/${projectId}/modules`}>{project.name}</a> / <span>Công việc</span>
      </div>
      <div className="page-head">
        <div>
          <h1>Công việc</h1>
          <p className="muted">Kéo thẻ sang cột khác để đổi trạng thái. Bấm vào thẻ để xem và sửa.</p>
        </div>
        <div className="filters">
          <Select value={assigneeId} placeholder="Mọi người làm" options={members.map((m) => ({ value: m.id, label: m.name }))} onChange={setAssigneeId} testId="filter-assignee" />
          <Select value={moduleId} placeholder="Mọi module" options={project.modules.map((m) => ({ value: m.id, label: m.name }))} onChange={setModuleId} testId="filter-module" />
          <Btn kind="primary" onClick={() => setEditing({ task: null })} data-testid="new-task">
            + Công việc mới
          </Btn>
        </div>
      </div>

      {tasks.length === 0 && (
        <Empty title={filtered ? "Không có công việc khớp bộ lọc" : "Chưa có công việc nào"}>
          {filtered ? "Đổi người làm hoặc module ở bộ lọc phía trên." : "Bấm “+ Công việc mới” để giao việc đầu tiên, gắn với màn hình, tài liệu, sơ đồ UC hoặc bộ test."}
        </Empty>
      )}

      <div className="kanban" data-testid="kanban">
        {TASK_STATUS.map((col) => {
          const cards = tasks.filter((t) => t.status === col.key);
          return (
            <KanbanColumn
              key={col.key}
              id={col.key}
              title={col.label}
              count={cards.length}
              onDropCard={move}
              footer={
                <Btn kind="ghost" size="sm" onClick={() => setEditing({ task: null, status: col.key })} data-testid={`add-${col.key}`}>
                  + Thêm
                </Btn>
              }
            >
              {cards.map((t) => {
                const art = artifactLabel(t, artifacts);
                const who = memberName(t.assigneeId);
                const mod = moduleName(t.moduleId);
                return (
                  <KanbanCard
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    onClick={() => setEditing({ task: t })}
                    meta={
                      <>
                        {priorityBadge(t.priority)}
                        {art && <Badge tone={art.missing ? "flag" : "gray"}>{art.text}</Badge>}
                        {!art && mod && <span>{mod}</span>}
                        {t.dueDate && (isOverdue(t) ? <Badge tone="red">Quá hạn {fmtDate(t.dueDate)}</Badge> : <span>Hạn {fmtDate(t.dueDate)}</span>)}
                        <span className="spacer" />
                        <Avatar name={who} size="sm" />
                      </>
                    }
                  />
                );
              })}
            </KanbanColumn>
          );
        })}
      </div>

      {editing && (
        <TaskDialog
          key={editing.task?.id ?? "new"}
          projectId={projectId}
          task={editing.task}
          initial={{ status: editing.status, moduleId: moduleId || undefined, assigneeId: assigneeId || null }}
          members={members}
          modules={project.modules}
          artifacts={artifacts}
          actorId={currentActorId()}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
