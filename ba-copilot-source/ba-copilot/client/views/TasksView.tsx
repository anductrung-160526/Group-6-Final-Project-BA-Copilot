// SCR-06 – Quản lý công việc: Kanban 4 cột Cần làm · Đang làm · Xong · Đã duyệt (đợt 5). Chủ sở hữu: C7 (trước: A6).
// Đăng ký ở client/projectMenu.ts (mục "tasks") và client/routes.ts cũ.
// Kéo thẻ chỉ theo mũi tên (shared/taskRules.ts): Cần làm → Đang làm → Xong (BA) → Đã duyệt (chỉ BA Lead);
// Xong / Đã duyệt → Đang làm = Yêu cầu sửa (chỉ BA Lead). Kéo sai → thẻ ở lại cột cũ + toast lý do.
// Task gắn sản phẩm đổi trạng thái qua endpoint duyệt của sản phẩm (moveTask trong TaskDialog.tsx).

import React, { useCallback, useEffect, useState } from "react";
import type { ArtifactOption, Member, Task, TaskStatus } from "../../shared/types.ts";
import { moveError } from "../../shared/taskRules.ts";
import { get, listArtifacts, listMembers, listTasks } from "../api.ts";
import { Avatar, Badge, Btn, Empty, Icon, KanbanCard, KanbanColumn, RevisionTag, Select, useUI } from "../components/ui.tsx";
import { useCurrentMember } from "../currentMember.ts";
import { ARTIFACT_ICON, TASK_STATUS, TaskDialog, artifactLabel, fmtDate, isOverdue, moveTask, priorityBadge, statusInfo } from "./TaskDialog.tsx";

interface Project {
  id: string;
  name: string;
  modules: { id: string; name: string }[];
}

type Editing = { task: Task | null; status?: TaskStatus } | null;

export function TasksView({ projectId }: { projectId: string; params?: string[] }) {
  const { toast } = useUI();
  const { me } = useCurrentMember();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactOption[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  const loadArtifacts = () => listArtifacts(projectId).then(setArtifacts).catch(() => setArtifacts([]));
  useEffect(() => {
    get<Project>(`/api/projects/${encodeURIComponent(projectId)}`).then(setProject).catch((e) => toast(e.message, "err"));
    listMembers().then(setMembers).catch(() => setMembers([]));
    loadArtifacts();
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

  const move = async (cardId: string, col: string) => {
    const t = tasks?.find((x) => x.id === cardId);
    const to = col as TaskStatus;
    if (!t || statusInfo(t.status).key === to) return;
    // Kéo sai luật: thẻ ở lại cột cũ, báo lý do.
    const err = moveError(t.status, to, me);
    if (err) return toast(err, "err");
    const from = t.status;
    const put = (status: TaskStatus) => setTasks((list) => list?.map((x) => (x.id === cardId ? { ...x, status } : x)) ?? list);
    put(to);
    try {
      const r = await moveTask(t, to, me);
      if (r.message) toast(r.message, "info");
      // Mọi task gắn cùng sản phẩm cũng đổi theo → tải lại cả bảng.
      load();
      if (t.artifactType) loadArtifacts();
    } catch (e) {
      put(from);
      toast(`Không chuyển được thẻ: ${(e as Error).message}`, "err");
    }
  };

  const saved = (t: Task) => {
    setEditing(null);
    load();
    // Sản phẩm mới tạo sau khi mở trang (màn, module) – tải lại để nhãn gắn kèm đúng.
    if (t.artifactType) loadArtifacts();
  };

  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? null) : null);
  const moduleName = (id: string | null) => (id ? (project?.modules.find((m) => m.id === id)?.name ?? null) : null);
  const filtered = !!(assigneeId || moduleId);

  if (!project || !tasks) return <div className="page muted">Đang tải…</div>;
  return (
    <div className="page" data-testid="tasks-view">
      <div className="page-head">
        <div>
          <h1>Quản lý công việc</h1>
          <p className="muted">Kéo thẻ theo luồng Cần làm → Đang làm → Xong → Đã duyệt. Duyệt và Yêu cầu sửa chỉ BA Lead. Bấm vào thẻ để xem chi tiết.</p>
        </div>
        <div className="filters">
          <Select value={assigneeId} placeholder="Mọi người làm" options={members.map((m) => ({ value: m.id, label: m.name }))} onChange={setAssigneeId} testId="filter-assignee" />
          <Select value={moduleId} placeholder="Mọi module" options={project.modules.map((m) => ({ value: m.id, label: m.name }))} onChange={setModuleId} testId="filter-module" />
          <Btn kind="primary" onClick={() => setEditing({ task: null })} data-testid="new-task">
            <Icon name="plus" size="sm" />
            Công việc mới
          </Btn>
        </div>
      </div>

      {tasks.length === 0 && (
        <Empty title={filtered ? "Không có công việc khớp bộ lọc" : "Chưa có công việc nào"}>
          {filtered ? "Đổi người làm hoặc module ở bộ lọc phía trên." : "Bấm “Công việc mới” để giao việc đầu tiên, gắn với màn hình, tài liệu, sơ đồ hoặc bộ test."}
        </Empty>
      )}

      <div className="kanban" data-testid="kanban">
        {TASK_STATUS.map((col) => {
          const cards = tasks.filter((t) => statusInfo(t.status).key === col.key);
          return (
            <KanbanColumn
              key={col.key}
              id={col.key}
              title={col.label}
              count={cards.length}
              onDropCard={move}
              footer={
                col.key === "todo" || col.key === "doing" ? (
                  <Btn kind="ghost" size="sm" onClick={() => setEditing({ task: null, status: col.key })} data-testid={`add-${col.key}`}>
                    <Icon name="plus" size="sm" />
                    Thêm
                  </Btn>
                ) : undefined
              }
            >
              {cards.map((t) => {
                const art = artifactLabel(t, artifacts, moduleName);
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
                        {t.revisionRequested && <RevisionTag testId={`revision-${t.id}`} />}
                        {priorityBadge(t.priority)}
                        {art && (
                          <Badge tone={art.missing ? "flag" : "gray"}>
                            <Icon name={ARTIFACT_ICON[art.kind]} size="xs" />
                            {art.text}
                          </Badge>
                        )}
                        {!art && mod && <span>{mod}</span>}
                        {t.dueDate && (isOverdue(t) ? <Badge tone="red">Quá hạn {fmtDate(t.dueDate)}</Badge> : <span>Hạn {fmtDate(t.dueDate)}</span>)}
                        <span className="spacer" />
                        {who && <span className="small">{who}</span>}
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
          onClose={() => setEditing(null)}
          onSaved={saved}
          onChanged={() => {
            load();
            loadArtifacts();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
