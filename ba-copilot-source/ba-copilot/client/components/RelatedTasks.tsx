// FN-19 – Công việc gắn với một sản phẩm (màn, tài liệu, sơ đồ UC, bộ test). Chủ sở hữu: A6.
// A6 chỉ viết component; A0 chèn vào DesignTab (kind "screen", id = screenId) và DocsTab (kind "docs", id = moduleId) khi gộp:
//   <RelatedTasks kind="screen" id={screen.id} />

import React, { useEffect, useState } from "react";
import type { ArtifactKind, Member, Task } from "../../shared/types.ts";
import { listArtifactTasks, listMembers } from "../api.ts";
import { Avatar, Badge, KanbanCard } from "./ui.tsx";
import { fmtDate, isOverdue, priorityBadge, statusInfo } from "../views/TaskDialog.tsx";

export function RelatedTasks({ kind, id, title = "Công việc liên quan" }: { kind: ArtifactKind; id: string; title?: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    setTasks(null);
    listArtifactTasks(kind, id).then(setTasks).catch(() => setTasks([]));
  }, [kind, id]);
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
      {tasks?.map((t) => {
        const st = statusInfo(t.status);
        return (
          <KanbanCard
            key={t.id}
            id={t.id}
            draggable={false}
            title={t.title}
            onClick={() => (window.location.hash = `#/p/${t.projectId}/tasks`)}
            meta={
              <>
                <Badge tone={st.tone}>{st.label}</Badge>
                {priorityBadge(t.priority)}
                {t.dueDate && (isOverdue(t) ? <Badge tone="red">Quá hạn {fmtDate(t.dueDate)}</Badge> : <span>Hạn {fmtDate(t.dueDate)}</span>)}
                <span className="spacer" />
                <Avatar name={name(t.assigneeId)} size="sm" />
              </>
            }
          />
        );
      })}
    </div>
  );
}
