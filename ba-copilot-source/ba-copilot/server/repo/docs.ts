// Truy vấn bảng `module_docs` (5 tài liệu theo bước) và đọc user story của module làm đầu vào AI. Chủ sở hữu: C5.
// Hợp đồng: docs/api.md "Đợt 5" mục 5.3, docs/erd.md mục 8. Trạng thái/rev dùng chung qua getArtifactState/bumpRev (server/db.ts).
// Story đọc thẳng bảng `user_stories` (không import tệp của C4 – luật chung đợt 5 mục 3).

import { getDb } from "../db.ts";
import { DOC_KINDS } from "../../shared/types.ts";
import type { ArtifactRef, ArtifactStatus, DocKind, ModuleDoc, ModuleDocData, StoryPriority, UserStory } from "../../shared/types.ts";

interface DocRow {
  module_id: string;
  kind: DocKind;
  content: string;
  data: string | null;
  status: ArtifactStatus;
  revision_requested: number;
  rev: number;
  updated_by: string | null;
  updated_at: string | null;
}

const parseData = (s: string | null): ModuleDocData | null => {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as ModuleDocData) : null;
  } catch {
    return null;
  }
};

const toDoc = (r: DocRow): ModuleDoc => ({
  moduleId: r.module_id,
  kind: r.kind,
  content: r.content ?? "",
  data: parseData(r.data),
  status: r.status,
  revisionRequested: !!r.revision_requested,
  rev: Number(r.rev),
  updatedBy: r.updated_by ?? null,
  updatedAt: r.updated_at ?? null,
});

/** Tài liệu chưa sinh: `none`, rev 0, nội dung rỗng (API vẫn trả đủ 5 loại). */
export const emptyDoc = (moduleId: string, kind: DocKind): ModuleDoc => ({
  moduleId,
  kind,
  content: "",
  data: null,
  status: "none",
  revisionRequested: false,
  rev: 0,
  updatedBy: null,
  updatedAt: null,
});

export const isDocKind = (k: unknown): k is DocKind => typeof k === "string" && (DOC_KINDS as string[]).includes(k);
export const docRef = (moduleId: string, kind: DocKind): ArtifactRef => ({ kind: "doc", id: moduleId, moduleId, sub: kind });

export interface ModuleInfo {
  id: string;
  projectId: string;
  name: string;
}
export function getModuleInfo(moduleId: string): ModuleInfo | null {
  const r = getDb().prepare("SELECT id, project_id, name FROM modules WHERE id = ?").get(moduleId) as { id: string; project_id: string; name: string } | undefined;
  return r ? { id: r.id, projectId: r.project_id, name: r.name } : null;
}

export function getDoc(moduleId: string, kind: DocKind): ModuleDoc {
  const r = getDb().prepare("SELECT * FROM module_docs WHERE module_id = ? AND kind = ?").get(moduleId, kind) as DocRow | undefined;
  return r ? toDoc(r) : emptyDoc(moduleId, kind);
}

/** Đủ 5 loại theo thứ tự DOC_KINDS. */
export function listDocs(moduleId: string): ModuleDoc[] {
  const rows = getDb().prepare("SELECT * FROM module_docs WHERE module_id = ?").all(moduleId) as unknown as DocRow[];
  const by = new Map(rows.map((r) => [r.kind, toDoc(r)]));
  return DOC_KINDS.map((k) => by.get(k) ?? emptyDoc(moduleId, k));
}

/**
 * Ghi nội dung (Markdown + dữ liệu cấu trúc). Chưa có dòng → tạo với `draft`, rev 0 (người gọi `bumpRev` ngay sau → rev 1).
 * Không đổi trạng thái của dòng đã có – việc đó do tầng route quyết (setArtifactState).
 */
export function writeDocContent(moduleId: string, kind: DocKind, content: string, data: ModuleDocData | null): void {
  const d = getDb();
  const json = data ? JSON.stringify(data) : null;
  const at = new Date().toISOString();
  const exists = d.prepare("SELECT 1 FROM module_docs WHERE module_id = ? AND kind = ?").get(moduleId, kind);
  if (exists) d.prepare("UPDATE module_docs SET content = ?, data = ?, updated_at = ? WHERE module_id = ? AND kind = ?").run(content, json, at, moduleId, kind);
  else d.prepare("INSERT INTO module_docs (module_id, kind, content, data, status, revision_requested, rev, updated_at) VALUES (?, ?, ?, ?, 'draft', 0, 0, ?)").run(moduleId, kind, content, json, at);
}

// ---------------------------------------------------------------- User story của module (đầu vào BRD, UC Spec)
interface StoryRow {
  id: string;
  project_id: string;
  module_id: string | null;
  code: string;
  as_a: string;
  i_want: string;
  so_that: string;
  acceptance_criteria: string;
  priority: StoryPriority;
  ord: number;
  rev: number;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

const toStory = (r: StoryRow): UserStory => {
  let ac: string[] = [];
  try {
    const v = JSON.parse(r.acceptance_criteria || "[]");
    if (Array.isArray(v)) ac = v.map(String).filter((x) => x.trim());
  } catch {
    ac = [];
  }
  return {
    id: r.id,
    projectId: r.project_id,
    moduleId: r.module_id,
    code: r.code,
    asA: r.as_a ?? "",
    iWant: r.i_want ?? "",
    soThat: r.so_that ?? "",
    acceptanceCriteria: ac,
    priority: r.priority,
    order: Number(r.ord),
    createdAt: r.created_at,
    rev: Number(r.rev),
    updatedBy: r.updated_by ?? null,
    updatedAt: r.updated_at ?? null,
  };
};

/** Story gắn với module, theo thứ tự hiển thị. Bỏ story rỗng (chưa nhập "I want"). */
export function listModuleStories(moduleId: string): UserStory[] {
  const rows = getDb().prepare("SELECT * FROM user_stories WHERE module_id = ? ORDER BY ord, code").all(moduleId) as unknown as StoryRow[];
  return rows.map(toStory).filter((s) => s.iWant.trim() || s.asA.trim() || s.soThat.trim());
}

/** Ghép story thành văn bản cho prompt AI. */
export function storiesText(stories: UserStory[]): string {
  return stories
    .map((s) => {
      const head = `- ${s.code} [${s.priority}]: As a ${s.asA || "…"}, I want ${s.iWant || "…"}${s.soThat ? `, so that ${s.soThat}` : ""}`;
      const ac = s.acceptanceCriteria.map((a) => `    - AC: ${a}`);
      return [head, ...ac].join("\n");
    })
    .join("\n");
}
