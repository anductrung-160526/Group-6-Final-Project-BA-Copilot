// Tài liệu theo bước BRD → UC Spec → SRS → FRD-NFR → API Spec (kế hoạch đợt 5, mục 3 "C5"). Chủ sở hữu: C5.
// Hợp đồng: docs/api.md "Đợt 5" mục 5.3. Bảng `module_docs` (server/repo/docs.ts). Pipeline AI: server/ai/docsPipelines.ts.
// Quy tắc:
//  - Sinh bước N cần bước N−1 ở trạng thái Xong/Đã duyệt (quyết định 8); BRD cần ≥ 1 user story của module.
//    Bỏ BR-01: không cần màn hình đã duyệt.
//  - Mọi lần ghi nội dung: assertRev → ghi → bumpRev → về `draft` (sinh lại luôn về draft; sửa tay / chỉnh AI khi đang
//    none/done/approved, Bản cũ giữ nguyên) → phát `artifact.drafted` { kind "doc", sub }.
//  - Các bước sau đang có (không phải none/outdated) → `outdated` + `artifact.stale`. Bước BRD…FRD-NFR đổi → bộ test
//    của module (kind "tests") đang có → `outdated` + `artifact.stale` (test dựa trên UC/FRD, đổi bắc cầu).
//  - Nhật ký AI (prompt_runs) do runAI ghi.
// Route cũ /api/modules/:id/docs/generate|refine|approve (app.ts) có số đoạn đường dẫn khác nên không trùng route ở đây.

import { actor, assertRev, baseRevOf, HttpError, requireMember, route, str } from "../http.ts";
import { bumpRev, getArtifactState, setArtifactState, tx } from "../db.ts";
import { emit } from "../events.ts";
import { DOC_KINDS, DOC_KIND_LABEL } from "../../shared/types.ts";
import type { ArtifactRef, DocKind, ModuleDoc, ModuleDocData, Requirement } from "../../shared/types.ts";
import * as docs from "../repo/docs.ts";
import { prereqBlockReason } from "../../shared/prereq.ts";
import {
  coerceDocRequirement,
  coerceDocUseCase,
  deriveDocData,
  generateDoc,
  refineDocSection,
  reqMarkdown,
  replaceSection,
  splitSections,
  ucMarkdown,
  type DocGenInput,
  type DocUseCase,
} from "../ai/docsPipelines.ts";

const MAX_CONTENT = 400_000;
const LIVE = (s: string) => s !== "none" && s !== "outdated";

function mustModule(id: string) {
  const m = docs.getModuleInfo(id);
  if (!m) throw new HttpError("Module not found", 404);
  return m;
}

function mustKind(k: string): DocKind {
  if (!docs.isDocKind(k)) throw new HttpError(`Invalid document type: ${k} (expected one of ${DOC_KINDS.join(", ")})`, 400);
  return k;
}

const label = (k: DocKind) => DOC_KIND_LABEL[k];
const prevKind = (k: DocKind): DocKind | null => DOC_KINDS[DOC_KINDS.indexOf(k) - 1] ?? null;

/**
 * Lý do chưa sinh được bước `kind` (null = sinh được). Dùng cho kiểm tra trước và sau khi gọi AI.
 * Luật chung với nút Xong / Duyệt: shared/prereq.ts (D2 đợt 6).
 */
export function generateBlockReason(moduleId: string, kind: DocKind): string | null {
  return prereqBlockReason(
    { kind: "doc", sub: kind },
    { docStatus: (k) => docs.getDoc(moduleId, k).status, storyCount: prevKind(kind) ? undefined : docs.listModuleStories(moduleId).length },
    "generate",
  );
}

/**
 * Ghi nội dung một tài liệu trong một giao dịch, theo quy ước chung đợt 5. `mode`:
 * - "generate": sinh lại → luôn về `draft`;
 * - "edit": sửa tay / chỉnh AI → về `draft` khi đang none/done/approved (Bản cũ giữ nguyên).
 */
function commit(
  moduleId: string,
  kind: DocKind,
  content: string,
  data: ModuleDocData | null,
  opts: { actorId?: string; baseRev?: number; mode: "generate" | "edit"; check?: () => void },
): ModuleDoc {
  return tx(() => {
    const ref = docs.docRef(moduleId, kind);
    const before = getArtifactState(ref)!;
    assertRev(before.rev, opts.baseRev);
    opts.check?.();
    docs.writeDocContent(moduleId, kind, content, data);
    bumpRev(ref, opts.actorId);
    if ((opts.mode === "generate" || before.status !== "outdated") && before.status !== "draft") setArtifactState(ref, { status: "draft" });
    emit({ type: "artifact.drafted", artifact: ref, actorId: opts.actorId });
    // Các bước sau thành Bản cũ
    for (const k of DOC_KINDS.slice(DOC_KINDS.indexOf(kind) + 1)) {
      const r = docs.docRef(moduleId, k);
      const s = getArtifactState(r);
      if (s && LIVE(s.status)) {
        setArtifactState(r, { status: "outdated" });
        emit({ type: "artifact.stale", artifact: r, actorId: opts.actorId });
      }
    }
    // Bộ test của module dựa trên UC Spec + FRD-NFR (và bắc cầu các bước trước chúng)
    if (DOC_KINDS.indexOf(kind) <= DOC_KINDS.indexOf("FRD_NFR")) {
      const tr: ArtifactRef = { kind: "tests", id: moduleId, moduleId };
      const ts = getArtifactState(tr);
      if (ts && LIVE(ts.status)) {
        setArtifactState(tr, { status: "outdated" });
        emit({ type: "artifact.stale", artifact: tr, actorId: opts.actorId });
      }
    }
    return docs.getDoc(moduleId, kind);
  });
}

/** Đầu vào AI từ story + các bước trước đang có trong DB. */
function genInput(m: { id: string; name: string }): DocGenInput {
  const stories = docs.listModuleStories(m.id);
  const get = (k: DocKind) => docs.getDoc(m.id, k);
  const uc = get("UC_SPEC");
  const srs = get("SRS");
  const frd = get("FRD_NFR");
  return {
    moduleId: m.id,
    moduleName: m.name,
    stories,
    storiesText: docs.storiesText(stories),
    brd: get("BRD").content,
    ucSpec: { content: uc.content, useCases: (uc.data?.useCases as DocUseCase[] | undefined) ?? deriveDocData("UC_SPEC", uc.content, null)?.useCases ?? [] },
    srs: { content: srs.content, srs: srs.data?.srs ?? null },
    frd: { content: frd.content, requirements: frd.data?.requirements ?? deriveDocData("FRD_NFR", frd.content, null)?.requirements ?? [] },
  };
}

route("GET", "/api/modules/:id/docs", (ctx) => {
  requireMember(ctx);
  mustModule(ctx.params.id);
  return docs.listDocs(ctx.params.id);
});

route("GET", "/api/modules/:id/docs/:kind", (ctx) => {
  requireMember(ctx);
  mustModule(ctx.params.id);
  return docs.getDoc(ctx.params.id, mustKind(ctx.params.kind));
});

// Sửa tay: { content, data?, baseRev? }. UC Spec / FRD-NFR: có `data` thì dùng cấu trúc đó (content rỗng → sinh từ cấu trúc),
// không có thì đọc ngược cấu trúc từ Markdown.
route("PUT", "/api/modules/:id/docs/:kind", (ctx) => {
  requireMember(ctx);
  const m = mustModule(ctx.params.id);
  const kind = mustKind(ctx.params.kind);
  const body = ctx.body ?? {};
  if (typeof body.content !== "string" && !body.data) throw new HttpError("Missing document content (content)", 400);
  if (typeof body.content === "string" && body.content.length > MAX_CONTENT) throw new HttpError("The document is too long", 413);
  let content = str(body.content, MAX_CONTENT);
  const prev = docs.getDoc(m.id, kind);
  let data: ModuleDocData | null;
  if (kind === "UC_SPEC" && Array.isArray(body.data?.useCases)) {
    const useCases = body.data.useCases.map(coerceDocUseCase) as DocUseCase[];
    data = { useCases };
    if (!content.trim()) content = ucMarkdown(useCases, m.name);
  } else if (kind === "FRD_NFR" && Array.isArray(body.data?.requirements)) {
    const requirements = body.data.requirements.map(coerceDocRequirement) as Requirement[];
    data = { requirements };
    if (!content.trim()) content = reqMarkdown(requirements, m.name);
  } else data = deriveDocData(kind, content, prev.data);
  if (!content.trim()) throw new HttpError("Document content cannot be empty", 400);
  return commit(m.id, kind, content, data, { actorId: actor(body), baseRev: baseRevOf(body), mode: "edit" });
});

route("POST", "/api/modules/:id/docs/:kind/generate", async (ctx) => {
  requireMember(ctx);
  const m = mustModule(ctx.params.id);
  const kind = mustKind(ctx.params.kind);
  const body = ctx.body ?? {};
  // Kiểm tra trước khi gọi AI (không tốn lượt), rồi kiểm tra lại trong giao dịch ghi: AI chạy lâu, người khác có thể
  // đã sửa (so với rev lúc bắt đầu) hoặc bước trước đã đổi trạng thái.
  const rev0 = docs.getDoc(m.id, kind).rev;
  const baseRev = baseRevOf(body);
  assertRev(rev0, baseRev);
  const reason = generateBlockReason(m.id, kind);
  if (reason) throw new HttpError(reason, 400);
  const { content, data } = await generateDoc(kind, genInput(m));
  return commit(m.id, kind, content, data, {
    actorId: actor(body),
    baseRev: baseRev ?? rev0,
    mode: "generate",
    check: () => {
      const r = generateBlockReason(m.id, kind);
      if (r) throw new HttpError(r, 400);
    },
  });
});

// Chỉnh bằng AI: { instruction, section?, baseRev? }. section = tiêu đề mục (chữ sau "## "); thiếu = cả tài liệu.
route("POST", "/api/modules/:id/docs/:kind/refine", async (ctx) => {
  requireMember(ctx);
  const m = mustModule(ctx.params.id);
  const kind = mustKind(ctx.params.kind);
  const body = ctx.body ?? {};
  const instruction = str(body.instruction, 4000).trim();
  if (!instruction) throw new HttpError("Enter a refinement instruction", 400);
  const baseRev = baseRevOf(body);
  const doc = docs.getDoc(m.id, kind);
  if (doc.status === "none" || !doc.content.trim()) throw new HttpError(`There is no ${label(kind)} to refine yet – generate the document first`, 400);
  assertRev(doc.rev, baseRev);
  const section = str(body.section, 300).trim() || null;
  const target = section ? splitSections(doc.content).sections.find((s) => s.title === section) : null;
  if (section && !target) throw new HttpError(`Section "${section}" not found in ${label(kind)}`, 400);
  const ucList = genInput(m).ucSpec?.useCases.map((u) => `${u.code} – ${u.name}`).join("; ");
  const next = await refineDocSection({
    moduleId: m.id,
    moduleName: m.name,
    kind,
    section,
    markdown: target ? target.text : doc.content,
    instruction,
    context: `Module ${m.name}. Use cases: ${ucList || "(none yet)"}`,
  });
  const content = target ? replaceSection(doc.content, target.title, next) : next;
  return commit(m.id, kind, content, deriveDocData(kind, content, doc.data), { actorId: actor(body), baseRev: baseRev ?? doc.rev, mode: "edit" });
});
