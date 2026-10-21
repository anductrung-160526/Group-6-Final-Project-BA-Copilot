// Sơ đồ UC của module (FN-11 → FN-14). Hợp đồng: docs/api.md mục "Sơ đồ UC". Chủ sở hữu: A5.
// Bảng uc_diagrams (docs/erd.md): mỗi module tối đa 1 sơ đồ, status ∈ draft | approved | stale.

import * as repo from "../repo.ts";
import { BizError } from "../service.ts";
import { generateUcDiagram } from "../ai/pipelines.ts";
import { getDb, tx } from "../db.ts";
import { emit, on } from "../events.ts";
import { route, str, actor, requireLead } from "../http.ts";
import { readSourceHash, ucSourceHash } from "../../shared/ucDiagram.ts";
import type { ArtifactEventType, UcDiagram, UcDiagramStatus } from "../../shared/types.ts";

const MAX_CODE = 100_000;

interface Row {
  module_id: string;
  code: string;
  status: UcDiagramStatus;
  approved_at: string | null;
  updated_at: string;
}

const toDiagram = (r: Row): UcDiagram => ({ moduleId: r.module_id, code: r.code, status: r.status, approvedAt: r.approved_at, updatedAt: r.updated_at });

export function getDiagram(moduleId: string): UcDiagram | null {
  const r = getDb().prepare("SELECT * FROM uc_diagrams WHERE module_id = ?").get(moduleId) as Row | undefined;
  return r ? toDiagram(r) : null;
}

function write(moduleId: string, d: { code: string; status: UcDiagramStatus; approvedAt: string | null }) {
  getDb()
    .prepare(
      `INSERT INTO uc_diagrams (module_id, code, status, approved_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(module_id) DO UPDATE SET code = excluded.code, status = excluded.status, approved_at = excluded.approved_at, updated_at = excluded.updated_at`,
    )
    .run(moduleId, d.code, d.status, d.approvedAt, new Date().toISOString());
}

function diagramEvent(type: ArtifactEventType, moduleId: string, actorId?: string) {
  emit({ type, artifact: { kind: "diagram", id: moduleId, moduleId }, actorId });
}

function mustModule(id: string) {
  const m = repo.getModule(id);
  if (!m) throw new BizError("Module not found", 404);
  return m;
}

/** Lưu mã mới về Nháp: phát `unapproved` nếu đang Đã duyệt, rồi `drafted` (cùng thứ tự với sinh lại tài liệu). */
function saveDraft(moduleId: string, code: string, actorId?: string): UcDiagram {
  return tx(() => {
    const before = getDiagram(moduleId);
    write(moduleId, { code, status: "draft", approvedAt: null });
    if (before?.status === "approved") diagramEvent("artifact.unapproved", moduleId, actorId);
    diagramEvent("artifact.drafted", moduleId, actorId);
    return getDiagram(moduleId)!;
  });
}

route("GET", "/api/modules/:id/diagram", ({ params }) => {
  mustModule(params.id);
  return getDiagram(params.id);
});

// FN-11: sinh sơ đồ từ UC đã có (AI, hoặc buildUcMermaid khi chạy Mock). Nhật ký AI do runAI ghi.
route("POST", "/api/modules/:id/diagram/generate", async ({ params, body }) => {
  const m = mustModule(params.id);
  const useCases = repo.getDocs(m.id).useCases;
  if (!useCases.length) throw new BizError("The module has no use cases yet. Generate the documents before drawing the diagram.");
  const { code } = await generateUcDiagram({ moduleId: m.id, moduleName: m.name, useCases });
  return saveDraft(m.id, code, actor(body));
});

// FN-12: BA sửa mã Mermaid và lưu.
route("PUT", "/api/modules/:id/diagram", ({ params, body }) => {
  mustModule(params.id);
  if (typeof body?.code !== "string") throw new BizError("Missing diagram code (code)");
  if (body.code.length > MAX_CODE) throw new BizError("Diagram code is too long", 413);
  const code = str(body.code, MAX_CODE);
  if (!code.trim()) throw new BizError("Diagram code cannot be empty");
  return saveDraft(params.id, code, actor(body));
});

// FN-13: duyệt / bỏ duyệt (mặc định approved = true). Chỉ phát sự kiện khi trạng thái thật sự đổi. Chỉ BA Lead.
route("POST", "/api/modules/:id/diagram/approve", (ctx) => {
  const { params, body } = ctx;
  requireLead(ctx);
  mustModule(params.id);
  const approved = body?.approved !== false;
  return tx(() => {
    const d = getDiagram(params.id);
    if (!d) throw new BizError("There is no diagram to approve yet");
    if (approved && d.status !== "approved") {
      write(params.id, { code: d.code, status: "approved", approvedAt: new Date().toISOString() });
      diagramEvent("artifact.approved", params.id, actor(body));
    } else if (!approved && d.status === "approved") {
      write(params.id, { code: d.code, status: "draft", approvedAt: null });
      diagramEvent("artifact.unapproved", params.id, actor(body));
    }
    return getDiagram(params.id);
  });
});

// FN-14: UC đổi (sinh lại / chỉnh tài liệu phát `drafted` docs) → sơ đồ Nháp/Đã duyệt thành Bản cũ.
// Sơ đồ mang dòng "%% nguon-uc: <mã băm>" của UC lúc vẽ; mã băm còn khớp (vd chỉ chỉnh SRS, Sequence) thì giữ nguyên.
// BA xoá dòng đó thì không so được → coi như UC đã đổi.
export function markDiagramStaleIfUcChanged(moduleId: string, actorId?: string): boolean {
  const d = getDiagram(moduleId);
  if (!d || d.status === "stale") return false;
  const hash = readSourceHash(d.code);
  if (hash && hash === ucSourceHash(repo.getDocs(moduleId).useCases)) return false;
  return tx(() => {
    write(moduleId, { code: d.code, status: "stale", approvedAt: d.approvedAt });
    diagramEvent("artifact.stale", moduleId, actorId);
    return true;
  });
}

on("artifact.drafted", (e) => {
  if (e.artifact.kind === "docs") markDiagramStaleIfUcChanged(e.artifact.moduleId, e.actorId);
});
