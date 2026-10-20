// FN-19 – Công việc gắn với một sản phẩm (màn, tài liệu, sơ đồ, bộ test). Chủ sở hữu: C7 (trước: A6).
// Màn sản phẩm nhúng:  <RelatedTasks kind="doc" id={moduleId} sub="BRD" />  ·  <RelatedTasks kind="screen" id={screen.id} />
// Hiện trạng thái đợt 5 (Cần làm / Đang làm / Xong / Đã duyệt) + tag "Yêu cầu sửa". Bấm thẻ → Quản lý công việc.

import React, { useEffect, useState } from "react";
import type { ArtifactKind, Member, Task } from "../../shared/types.ts";
import { get, listMembers } from "../api.ts";
import { Avatar, Badge, KanbanCard, RevisionTag, StatusBadge } from "./ui.tsx";
import { fmtDate, isOverdue, priorityBadge, statusInfo } from "../views/TaskDialog.tsx";
import { tasksHref } from "../projectMenu.ts";

export function RelatedTasks({ kind, id, sub, title = "Công việc liên quan" }: { kind: ArtifactKind; id: string; sub?: string; title?: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    setTasks(null);
    get<Task[]>(`/api/artifacts/${kind}/${encodeURIComponent(id)}/tasks${sub ? `?sub=${encodeURIComponent(sub)}` : ""}`)
      .then(setTasks)
      .catch(() => setTasks([]));
  }, [kind, id, sub]);
  useEffect(() => {
    listMembers().then(setMembers).catch(() => setMembers([]));
  }, []);

  const name = (mid: string | null) => (mid ? (members.find((m) => m.id === mid)?.name ?? null) : null);
  return (
    <div className="box" data-testid="related-tasks">
      <div className="box-title">
        {title}
        {tasks ? ` (${tasks.length})` : ""}
      </div>
      {!tasks && <div className="muted small">Đang tải…</div>}
      {tasks?.length === 0 && <div className="muted small">Chưa có công việc nào gắn với sản phẩm này.</div>}
      {tasks?.map((t) => (
        <KanbanCard
          key={t.id}
          id={t.id}
          draggable={false}
          title={t.title}
          onClick={() => (window.location.hash = tasksHref(t.projectId))}
          meta={
            <>
              <StatusBadge status={statusInfo(t.status).key} />
              {t.revisionRequested && <RevisionTag testId={`related-revision-${t.id}`} />}
              {priorityBadge(t.priority)}
              {t.dueDate && (isOverdue(t) ? <Badge tone="red">Quá hạn {fmtDate(t.dueDate)}</Badge> : <span>Hạn {fmtDate(t.dueDate)}</span>)}
              <span className="spacer" />
              <Avatar name={name(t.assigneeId)} size="sm" />
            </>
          }
        />
      ))}
    </div>
  );
}
