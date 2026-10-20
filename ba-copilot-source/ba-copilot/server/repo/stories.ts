// Kho dữ liệu user story cấp dự án (kế hoạch đợt 5, mục 3 "C4"). Bảng: docs/erd.md mục 8 `user_stories`. Chủ sở hữu: C4.
//
// - Mã US-xx đánh tiếp theo dự án: storyCode(nextStoryNumber(db, projectId)) – không dùng lại mã của story đã xoá
//   trừ khi đó là mã lớn nhất.
// - Chặn đè theo từng story: `rev` bắt đầu 1, +1 mỗi lần sửa; sửa/xoá kiểm `assertRev(rev, baseRev)`.
// - Story đổi (thêm / sửa / xoá) → tài liệu đang có của module đó chuyển "Lỗi thời" + phát `artifact.stale`
//   (xem `markModuleDocsOutdated`). Đổi thứ tự không làm tài liệu lỗi thời.
// - `storiesText(moduleId)`: văn bản story của module, đầu vào thống nhất cho AI (tài liệu C5, prototype C9).

import { randomUUID } from "node:crypto";
import { getDb, nextStoryNumber, storyCode, tx } from "../db.ts";
import { assertRev, HttpError } from "../http.ts";
import { emit } from "../events.ts";
import { storySentence } from "../../shared/qus.ts";
import { DOC_KINDS, type DocKind, type StoryPriority, type UserStory, type UserStoryInput } from "../../shared/types.ts";

type Row = Record<string, any>;

export const STORY_PRIORITIES: StoryPriority[] = ["High", "Medium", "Low"];
/** Giá trị lọc "chưa gắn module" cho `listStories(pid, NO_MODULE)` / `?moduleId=none`. */
export const NO_MODULE = "none";

const MAX_TEXT = 2000;
const MAX_CRITERIA = 50;

function parseCriteria(raw: unknown): string[] {
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export const toStory = (r: Row): UserStory => ({
  id: r.id,
  projectId: r.project_id,
  moduleId: r.module_id ?? null,
  code: r.code,
  asA: r.as_a ?? "",
  iWant: r.i_want ?? "",
  soThat: r.so_that ?? "",
  acceptanceCriteria: parseCriteria(r.acceptance_criteria),
  priority: r.priority as StoryPriority,
  order: Number(r.ord),
  rev: Number(r.rev),
  createdAt: r.created_at,
  updatedBy: r.updated_by ?? null,
  updatedAt: r.updated_at ?? null,
});

const ORDER_BY = "ORDER BY ord, created_at, code";

/** Story của dự án theo thứ tự hiển thị. `moduleId` = NO_MODULE → chỉ story chưa gắn module. */
export function listStories(projectId: string, moduleId?: string | null): UserStory[] {
  const d = getDb();
  const rows = !moduleId
    ? d.prepare(`SELECT * FROM user_stories WHERE project_id = ? ${ORDER_BY}`).all(projectId)
    : moduleId === NO_MODULE
      ? d.prepare(`SELECT * FROM user_stories WHERE project_id = ? AND module_id IS NULL ${ORDER_BY}`).all(projectId)
      : d.prepare(`SELECT * FROM user_stories WHERE project_id = ? AND module_id = ? ${ORDER_BY}`).all(projectId, moduleId);
  return (rows as Row[]).map(toStory);
}

/** Story của một module (theo thứ tự dự án) – C5, C9, QUS, gợi ý màn dùng chung. */
export function moduleStories(moduleId: string): UserStory[] {
  return (getDb().prepare(`SELECT * FROM user_stories WHERE module_id = ? ${ORDER_BY}`).all(moduleId) as Row[]).map(toStory);
}

export function getStory(id: string): UserStory | null {
  const r = getDb().prepare("SELECT * FROM user_stories WHERE id = ?").get(id) as Row | undefined;
  return r ? toStory(r) : null;
}

/** Story còn trống cả 3 phần (dòng mới chưa nhập) – bỏ qua khi chấm QUS và khi ghép văn bản cho AI. */
export const isBlankStory = (s: Pick<UserStory, "asA" | "iWant" | "soThat">) => !s.asA.trim() && !s.iWant.trim() && !s.soThat.trim();

/**
 * Văn bản user story của module cho AI (BRD, UC Spec, prototype…). Mỗi story một khối:
 *   US-01 (High): As a Khách hàng, I want xem đơn hàng, so that theo dõi giao hàng.
 *     Tiêu chí chấp nhận:
 *     - Hiện 20 đơn mới nhất
 * Module chưa có story → chuỗi rỗng.
 */
export function storiesText(moduleId: string): string {
  return moduleStories(moduleId)
    .filter((s) => !isBlankStory(s))
    .map((s) => {
      const lines = [`${s.code} (${s.priority}): ${storySentence(s)}`];
      const ac = s.acceptanceCriteria.filter((c) => c.trim());
      if (ac.length) lines.push("  Tiêu chí chấp nhận:", ...ac.map((c) => `  - ${c.trim()}`));
      return lines.join("\n");
    })
    .join("\n");
}

// ---------------------------------------------------------------- kiểm dữ liệu vào

const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "");

function criteriaOf(v: unknown): string[] {
  if (!Array.isArray(v)) throw new HttpError("Tiêu chí chấp nhận phải là danh sách", 400);
  return v
    .map((x) => (typeof x === "string" ? x.trim().slice(0, MAX_TEXT) : ""))
    .filter(Boolean)
    .slice(0, MAX_CRITERIA);
}

function priorityOf(v: unknown): StoryPriority {
  if (!STORY_PRIORITIES.includes(v as StoryPriority)) throw new HttpError("Độ ưu tiên phải là High, Medium hoặc Low", 400);
  return v as StoryPriority;
}

/** moduleId rỗng/null → chưa gắn; có giá trị thì phải là module của dự án (400). */
function moduleOf(projectId: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const id = String(v);
  if (!getDb().prepare("SELECT 1 FROM modules WHERE id = ? AND project_id = ?").get(id, projectId)) {
    throw new HttpError("Module không thuộc dự án này", 400);
  }
  return id;
}

/** Người sửa phải là thành viên có thật (FK members) – không rõ thì để NULL. */
function memberOrNull(id: string | null | undefined): string | null {
  return id && getDb().prepare("SELECT 1 FROM members WHERE id = ?").get(id) ? id : null;
}

// ---------------------------------------------------------------- tài liệu lỗi thời

/**
 * Story của module đổi → mọi tài liệu đang có của module (dòng `module_docs` ở Bản nháp / Xong / Đã duyệt) chuyển
 * "Lỗi thời" (giữ cờ Yêu cầu sửa, không tăng rev) và phát `artifact.stale { kind: "doc", id: moduleId, sub }`.
 * BRD sinh trực tiếp từ story; các bước sau (UC Spec, SRS, FRD-NFR, API Spec) dẫn xuất từ BRD/story nên cũng lỗi thời.
 * Tài liệu chưa sinh (không có dòng) hoặc đã lỗi thời thì bỏ qua. Trả về các loại tài liệu vừa chuyển.
 */
export function markModuleDocsOutdated(moduleId: string | null, actorId?: string | null): DocKind[] {
  if (!moduleId) return [];
  const d = getDb();
  const rows = d
    .prepare("SELECT kind FROM module_docs WHERE module_id = ? AND status IN ('draft','done','approved')")
    .all(moduleId) as { kind: DocKind }[];
  const kinds = DOC_KINDS.filter((k) => rows.some((r) => r.kind === k));
  for (const kind of kinds) {
    d.prepare("UPDATE module_docs SET status = 'outdated' WHERE module_id = ? AND kind = ?").run(moduleId, kind);
    emit({ type: "artifact.stale", artifact: { kind: "doc", id: moduleId, moduleId, sub: kind }, actorId: actorId ?? undefined });
  }
  return kinds;
}

// ---------------------------------------------------------------- ghi

export interface StoryChange {
  story: UserStory;
  /** Module có story thay đổi (cũ và mới khi chuyển module) – để chấm lại QUS. */
  modules: string[];
}

export function createStory(projectId: string, input: UserStoryInput, actorId?: string | null): StoryChange {
  const d = getDb();
  if (!d.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) throw new HttpError("Không tìm thấy dự án", 404);
  const moduleId = moduleOf(projectId, input.moduleId);
  const priority = input.priority === undefined ? "Medium" : priorityOf(input.priority);
  const criteria = input.acceptanceCriteria === undefined ? [] : criteriaOf(input.acceptanceCriteria);
  return tx(() => {
    const id = randomUUID();
    const at = new Date().toISOString();
    const code = storyCode(nextStoryNumber(d, projectId));
    const ord = Number((d.prepare("SELECT COALESCE(MAX(ord), 0) AS n FROM user_stories WHERE project_id = ?").get(projectId) as Row).n) + 1;
    d.prepare(
      `INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, acceptance_criteria, priority, ord, rev, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(id, projectId, moduleId, code, text(input.asA), text(input.iWant), text(input.soThat), JSON.stringify(criteria), priority, ord, at, memberOrNull(actorId), at);
    const story = getStory(id)!;
    if (!isBlankStory(story)) markModuleDocsOutdated(moduleId, actorId);
    return { story, modules: moduleId ? [moduleId] : [] };
  });
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Sửa story (chỉ các trường có trong input). Lệch rev → 409. Không đổi gì thì không tăng rev. */
export function updateStory(id: string, input: UserStoryInput, baseRev?: number, actorId?: string | null): StoryChange {
  return tx(() => {
    const cur = getStory(id);
    if (!cur) throw new HttpError("Không tìm thấy user story", 404);
    assertRev(cur.rev, baseRev);
    const next: UserStory = {
      ...cur,
      moduleId: input.moduleId === undefined ? cur.moduleId : moduleOf(cur.projectId, input.moduleId),
      asA: input.asA === undefined ? cur.asA : text(input.asA),
      iWant: input.iWant === undefined ? cur.iWant : text(input.iWant),
      soThat: input.soThat === undefined ? cur.soThat : text(input.soThat),
      acceptanceCriteria: input.acceptanceCriteria === undefined ? cur.acceptanceCriteria : criteriaOf(input.acceptanceCriteria),
      priority: input.priority === undefined ? cur.priority : priorityOf(input.priority),
    };
    const changed =
      next.moduleId !== cur.moduleId ||
      next.asA !== cur.asA ||
      next.iWant !== cur.iWant ||
      next.soThat !== cur.soThat ||
      next.priority !== cur.priority ||
      !sameList(next.acceptanceCriteria, cur.acceptanceCriteria);
    if (!changed) return { story: cur, modules: [] };
    getDb()
      .prepare(
        `UPDATE user_stories SET module_id = ?, as_a = ?, i_want = ?, so_that = ?, acceptance_criteria = ?, priority = ?,
           rev = rev + 1, updated_by = ?, updated_at = ? WHERE id = ?`,
      )
      .run(next.moduleId, next.asA, next.iWant, next.soThat, JSON.stringify(next.acceptanceCriteria), next.priority, memberOrNull(actorId), new Date().toISOString(), id);
    const modules = [...new Set([cur.moduleId, next.moduleId].filter((m): m is string => !!m))];
    for (const m of modules) markModuleDocsOutdated(m, actorId);
    return { story: getStory(id)!, modules };
  });
}

/** Xoá story. `baseRev` có thì kiểm chặn đè. Trả về module bị ảnh hưởng. */
export function deleteStory(id: string, baseRev?: number, actorId?: string | null): { projectId: string; modules: string[] } {
  return tx(() => {
    const cur = getStory(id);
    if (!cur) throw new HttpError("Không tìm thấy user story", 404);
    assertRev(cur.rev, baseRev);
    getDb().prepare("DELETE FROM user_stories WHERE id = ?").run(id);
    if (!isBlankStory(cur)) markModuleDocsOutdated(cur.moduleId, actorId);
    return { projectId: cur.projectId, modules: cur.moduleId ? [cur.moduleId] : [] };
  });
}

/**
 * Đặt lại thứ tự: `ids` theo thứ tự mới. Story của dự án không có trong `ids` giữ thứ tự tương đối và xếp sau
 * (cho phép gửi danh sách đang lọc theo module). Id lạ / của dự án khác → 400. Không tăng rev, không làm tài liệu lỗi thời.
 */
export function reorderStories(projectId: string, ids: string[]): UserStory[] {
  const all = listStories(projectId);
  const known = new Set(all.map((s) => s.id));
  const uniq = [...new Set(ids.map(String))];
  const bad = uniq.find((id) => !known.has(id));
  if (bad) throw new HttpError("Danh sách sắp xếp có user story không thuộc dự án", 400);
  const picked = new Set(uniq);
  const ordered = [...uniq, ...all.filter((s) => !picked.has(s.id)).map((s) => s.id)];
  tx(() => {
    const upd = getDb().prepare("UPDATE user_stories SET ord = ? WHERE id = ?");
    ordered.forEach((id, i) => upd.run(i + 1, id));
  });
  return listStories(projectId);
}
