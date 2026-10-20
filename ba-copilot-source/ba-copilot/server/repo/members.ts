// Kho dữ liệu thành viên nhóm (FN-01 → FN-03). Bảng: docs/erd.md `members`. Chủ sở hữu: A3.

import { randomUUID } from "node:crypto";
import { getDb } from "../db.ts";
import type { Member, MemberRole } from "../../shared/types.ts";

type Row = Record<string, any>;

export const MEMBER_ROLES: MemberRole[] = ["BA", "BA_LEAD"];

const toMember = (r: Row): Member => ({ id: r.id, name: r.name, role: r.role, createdAt: r.created_at });

export function listMembers(): Member[] {
  return (getDb().prepare("SELECT * FROM members ORDER BY name COLLATE NOCASE, created_at").all() as Row[]).map(toMember);
}

export function getMember(id: string): Member | null {
  const r = getDb().prepare("SELECT * FROM members WHERE id = ?").get(id) as Row | undefined;
  return r ? toMember(r) : null;
}

export function createMember(input: { name: string; role: MemberRole }): Member {
  const m: Member = { id: randomUUID(), name: input.name, role: input.role, createdAt: new Date().toISOString() };
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)").run(m.id, m.name, m.role, m.createdAt);
  return m;
}

export function updateMember(id: string, patch: Partial<Pick<Member, "name" | "role">>): Member | null {
  const cols: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined) (cols.push("name = ?"), vals.push(patch.name));
  if (patch.role !== undefined) (cols.push("role = ?"), vals.push(patch.role));
  if (cols.length) getDb().prepare(`UPDATE members SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
  return getMember(id);
}

/** Số task chưa Xong (todo, doing, redo) đang giao cho thành viên – khác 0 thì không cho xoá. */
export function countOpenTasks(memberId: string): number {
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id = ? AND status <> 'done'").get(memberId) as Row;
  return Number(r.n);
}

export function deleteMember(id: string): void {
  getDb().prepare("DELETE FROM members WHERE id = ?").run(id);
}

/** FN-03: ghi tên (chụp lại lúc tạo) và mã người tạo vào phiên bản màn. */
export function stampVersionAuthor(versionId: string, member: Member): void {
  getDb().prepare("UPDATE screen_versions SET author = ?, author_id = ? WHERE id = ?").run(member.name, member.id, versionId);
}

/** Phiên bản hiện tại của màn (vừa được tạo khi service phát `artifact.drafted`). */
export function currentVersionId(screenId: string): string | null {
  const r = getDb().prepare("SELECT current_version_id AS v FROM screens WHERE id = ?").get(screenId) as Row | undefined;
  return r?.v ?? null;
}
