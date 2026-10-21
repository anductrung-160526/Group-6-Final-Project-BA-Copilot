// Sơ đồ theo bước Context → UC → Sequence → BPMN → ERD (kế hoạch đợt 5, mục 3 "C6"). Chủ sở hữu: C6.
// Hợp đồng: docs/api.md "Đợt 5" mục 5.4. Bảng `module_diagrams` (server/db.ts). `:kind` ∈ DIAGRAM_KINDS.
// - Sinh loại X cần mọi tài liệu nguồn (DIAGRAM_SOURCES) ở trạng thái Xong / Đã duyệt (quyết định 8).
// - Ghi: assertRev → ghi → về Đang làm (giữ cờ Yêu cầu sửa) → bumpRev → phát "artifact.drafted" { kind: "diagram", sub }.
// - Tài liệu nguồn có bản mới ("artifact.drafted" của doc) → sơ đồ phụ thuộc thành Bản cũ + "artifact.stale".
// Tài liệu, story, màn đọc thẳng bảng (không import tệp của C4/C5/C9). Route cũ /api/modules/:id/diagram (số ít,
// bảng uc_diagrams) ở server/routes/diagram.ts giữ nguyên để màn cũ còn chạy.

import { getDb, tx, getArtifactState, setArtifactState, bumpRev } from "../db.ts";
import { emit, on } from "../events.ts";
import { actor, assertRev, baseRevOf, HttpError, requireMember, route, type HandlerCtx } from "../http.ts";
import { generateDiagram, type DiagramSources } from "../ai/diagramPipelines.ts";
import { checkDiagram, DIAGRAM_SOURCES, diagramBlockReason, MAX_DIAGRAM_CODE, normalizeParts } from "../../shared/diagrams.ts";
import {
  DIAGRAM_KINDS,
  type ArtifactRef,
  type ArtifactStatus,
  type DiagramKind,
  type DiagramPart,
  type DocKind,
  type ModuleDiagram,
  type Requirement,
  type SrsDoc,
  type UseCase,
} from "../../shared/types.ts";

interface Row {
  module_id: string;
  kind: DiagramKind;
  code: string;
  parts: string;
  status: ArtifactStatus;
  revision_requested: number;
  rev: number;
  updated_by: string | null;
  updated_at: string | null;
}

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const toDiagram = (r: Row): ModuleDiagram => ({
  moduleId: r.module_id,
  kind: r.kind,
  code: r.code ?? "",
  parts: parseJson<DiagramPart[]>(r.parts, []),
  status: r.status,
  revisionRequested: !!r.revision_requested,
  rev: Number(r.rev),
  updatedBy: r.updated_by ?? null,
  updatedAt: r.updated_at ?? null,
});

const emptyDiagram = (moduleId: string, kind: DiagramKind): ModuleDiagram => ({ moduleId, kind, code: "", parts: [], status: "none", revisionRequested: false, rev: 0, updatedBy: null, updatedAt: null });

const ref = (moduleId: string, kind: DiagramKind): ArtifactRef => ({ kind: "diagram", id: moduleId, moduleId, sub: kind });

function mustModule(id: string): { id: string; name: string; project_id: string } {
  const m = getDb().prepare("SELECT id, name, project_id FROM modules WHERE id = ?").get(id) as { id: string; name: string; project_id: string } | undefined;
  if (!m) throw new HttpError("Module not found", 404);
  return m;
}

function parseKind(raw: string): DiagramKind {
  const k = String(raw ?? "").toUpperCase() as DiagramKind;
  if (!DIAGRAM_KINDS.includes(k)) throw new HttpError(`Invalid diagram type: ${raw}. Choose one of ${DIAGRAM_KINDS.join(", ")}`, 400);
  return k;
}

export function getModuleDiagram(moduleId: string, kind: DiagramKind): ModuleDiagram {
  const r = getDb().prepare("SELECT * FROM module_diagrams WHERE module_id = ? AND kind = ?").get(moduleId, kind) as Row | undefined;
  return r ? toDiagram(r) : emptyDiagram(moduleId, kind);
}

export function listModuleDiagrams(moduleId: string): ModuleDiagram[] {
  return DIAGRAM_KINDS.map((k) => getModuleDiagram(moduleId, k));
}

// ---------------------------------------------------------------- tài liệu nguồn

interface DocRow {
  kind: DocKind;
  content: string;
  data: string | null;
  status: ArtifactStatus;
}

function readDocs(moduleId: string): Map<DocKind, DocRow> {
  const rows = getDb().prepare("SELECT kind, content, data, status FROM module_docs WHERE module_id = ?").all(moduleId) as unknown as DocRow[];
  return new Map(rows.map((r) => [r.kind, r]));
}

/** Lý do chưa sinh được loại sơ đồ (nguồn chưa Xong / Đã duyệt); null = sinh được. */
export function generateBlockReason(moduleId: string, kind: DiagramKind, docs = readDocs(moduleId)): string | null {
  return diagramBlockReason(kind, (k) => docs.get(k)?.status ?? "none");
}

/** UC_SPEC.data: `{ useCases }` (hợp đồng C2) hoặc mảng `UseCase[]`. */
function useCasesOf(d: DocRow | undefined): UseCase[] {
  const v = parseJson<any>(d?.data, null);
  const list = Array.isArray(v) ? v : Array.isArray(v?.useCases) ? v.useCases : [];
  return list.filter((u: any) => u && typeof u.code === "string") as UseCase[];
}
function requirementsOf(d: DocRow | undefined): Requirement[] {
  const v = parseJson<any>(d?.data, null);
  const list = Array.isArray(v) ? v : Array.isArray(v?.requirements) ? v.requirements : [];
  return list.filter((r: any) => r && typeof r.statement === "string") as Requirement[];
}
function srsTextOf(d: DocRow | undefined): string {
  if (d?.content?.trim()) return d.content;
  const v = parseJson<any>(d?.data, null);
  const srs: SrsDoc | null = v?.srs ?? (Array.isArray(v?.sections) ? v : null);
  return srs?.sections ? srs.sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n") : "";
}

export function loadSources(moduleId: string): DiagramSources {
  const d = getDb();
  const m = mustModule(moduleId);
  const docs = readDocs(moduleId);
  const project = d.prepare("SELECT name FROM projects WHERE id = ?").get(m.project_id) as { name: string } | undefined;
  const stories = d.prepare("SELECT code, as_a, i_want, so_that FROM user_stories WHERE module_id = ? ORDER BY ord").all(moduleId) as { code: string; as_a: string; i_want: string; so_that: string }[];
  const screens = d.prepare("SELECT id, name FROM screens WHERE module_id = ?").all(moduleId) as { id: string; name: string }[];
  return {
    moduleId,
    moduleName: m.name,
    projectName: project?.name ?? "",
    brd: docs.get("BRD")?.content ?? "",
    useCases: useCasesOf(docs.get("UC_SPEC")),
    requirements: requirementsOf(docs.get("FRD_NFR")),
    srs: srsTextOf(docs.get("SRS")),
    stories: stories.map((s) => ({ code: s.code, asA: s.as_a ?? "", iWant: s.i_want ?? "", soThat: s.so_that ?? "" })),
    screenNames: Object.fromEntries(screens.map((s) => [s.id, s.name])),
  };
}

// ---------------------------------------------------------------- ghi

/**
 * Ghi nội dung sơ đồ (luật chung đợt 5): kiểm rev → ghi → về Đang làm (giữ cờ Yêu cầu sửa) → tăng rev → "artifact.drafted".
 * `baseRev` thiếu thì cho qua (client cũ).
 */
export function writeDiagram(
  moduleId: string,
  kind: DiagramKind,
  content: { code: string; parts: DiagramPart[] },
  baseRev: number | undefined,
  actorId: string | undefined,
  check?: () => void,
): ModuleDiagram {
  return tx(() => {
    const r = ref(moduleId, kind);
    const cur = getArtifactState(r);
    if (!cur) throw new HttpError("Module not found", 404);
    assertRev(cur.rev, baseRev);
    check?.();
    const d = getDb();
    const exists = !!d.prepare("SELECT 1 FROM module_diagrams WHERE module_id = ? AND kind = ?").get(moduleId, kind);
    if (!exists) {
      d.prepare("INSERT INTO module_diagrams (module_id, kind, code, parts, status, revision_requested, rev, updated_at) VALUES (?, ?, ?, ?, 'draft', 0, 0, ?)").run(
        moduleId,
        kind,
        content.code,
        JSON.stringify(content.parts),
        new Date().toISOString(),
      );
    } else {
      d.prepare("UPDATE module_diagrams SET code = ?, parts = ? WHERE module_id = ? AND kind = ?").run(content.code, JSON.stringify(content.parts), moduleId, kind);
      if (cur.status !== "draft") setArtifactState(r, { status: "draft" });
    }
    bumpRev(r, actorId);
    emit({ type: "artifact.drafted", artifact: r, actorId });
    return getModuleDiagram(moduleId, kind);
  });
}

/** Tài liệu nguồn có bản mới → các sơ đồ dựa trên nó (đã có) thành Bản cũ. Trả các loại vừa đổi. */
export function markDiagramsOutdated(moduleId: string, doc: DocKind, actorId?: string): DiagramKind[] {
  const changed: DiagramKind[] = [];
  for (const kind of DIAGRAM_KINDS) {
    if (!DIAGRAM_SOURCES[kind].includes(doc)) continue;
    const r = ref(moduleId, kind);
    const s = getArtifactState(r);
    if (!s || s.status === "none" || s.status === "outdated") continue;
    setArtifactState(r, { status: "outdated" });
    emit({ type: "artifact.stale", artifact: r, actorId });
    changed.push(kind);
  }
  return changed;
}

on("artifact.drafted", (e) => {
  if (e.artifact.kind !== "doc" || !e.artifact.sub) return;
  const doc = e.artifact.sub as DocKind;
  if (!Object.values(DIAGRAM_SOURCES).some((list) => list.includes(doc))) return;
  tx(() => markDiagramsOutdated(e.artifact.id, doc, e.actorId));
});

const actorOf = (ctx: HandlerCtx) => requireMember(ctx)?.id ?? actor(ctx.body);

// ---------------------------------------------------------------- route

route("GET", "/api/modules/:id/diagrams", (ctx) => {
  requireMember(ctx);
  mustModule(ctx.params.id);
  return listModuleDiagrams(ctx.params.id);
});

route("GET", "/api/modules/:id/diagrams/:kind", (ctx) => {
  requireMember(ctx);
  const kind = parseKind(ctx.params.kind);
  mustModule(ctx.params.id);
  return getModuleDiagram(ctx.params.id, kind);
});

// Lưu mã Mermaid do BA sửa. SEQUENCE: `code` rỗng, sơ đồ nằm trong `parts`.
route("PUT", "/api/modules/:id/diagrams/:kind", (ctx) => {
  const actorId = actorOf(ctx);
  const kind = parseKind(ctx.params.kind);
  mustModule(ctx.params.id);
  const body = ctx.body ?? {};
  if (typeof body.code === "string" && body.code.length > MAX_DIAGRAM_CODE) throw new HttpError("Diagram code is too long", 413);
  if (kind !== "SEQUENCE" && typeof body.code !== "string") throw new HttpError("Missing diagram code (code)", 400);
  const code = kind === "SEQUENCE" ? "" : String(body.code);
  const parts = kind === "SEQUENCE" ? normalizeParts(body.parts) : [];
  const errors = checkDiagram(kind, { code, parts });
  if (errors.length) throw new HttpError(`Invalid Mermaid code – ${errors[0]}`, 400, undefined, { details: errors });
  return writeDiagram(ctx.params.id, kind, { code, parts }, baseRevOf(body), actorId);
});

// Sinh (hoặc sinh lại) bằng AI; Mock khi không có API key. Nguồn chưa Xong → 400 kèm lý do.
route("POST", "/api/modules/:id/diagrams/:kind/generate", async (ctx) => {
  const actorId = actorOf(ctx);
  const kind = parseKind(ctx.params.kind);
  const moduleId = ctx.params.id;
  mustModule(moduleId);
  const reason = generateBlockReason(moduleId, kind);
  if (reason) throw new HttpError(reason, 400);
  const baseRev = baseRevOf(ctx.body);
  // Báo sớm khi bản đã đổi – không tốn lượt AI. writeDiagram kiểm lại sau khi AI trả kết quả.
  assertRev(getArtifactState(ref(moduleId, kind))?.rev ?? 0, baseRev);
  const src = loadSources(moduleId);
  if ((kind === "UC" || kind === "SEQUENCE" || kind === "BPMN") && !src.useCases.length) throw new HttpError("The UC Specification has no use cases – regenerate the UC Specification", 400);
  const result = await generateDiagram(kind, src);
  const errors = checkDiagram(kind, result);
  if (errors.length) throw new HttpError(`The AI returned an invalid diagram – ${errors[0]}`, 502, undefined, { details: errors });
  // AI chạy lâu: tài liệu nguồn có thể vừa rời Xong (Yêu cầu sửa, sinh lại) → kiểm lại trong giao dịch ghi (D2 đợt 6).
  return writeDiagram(moduleId, kind, result, baseRev, actorId, () => {
    const r = generateBlockReason(moduleId, kind);
    if (r) throw new HttpError(r, 400);
  });
});
