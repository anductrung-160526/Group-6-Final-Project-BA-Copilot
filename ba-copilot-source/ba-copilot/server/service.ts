// Tầng nghiệp vụ: điều phối pipeline AI cho prototype, test case, truy vết (chủ sở hữu: C9).
// Đợt 5: bỏ BR-01 (tài liệu không còn cần màn đã duyệt – tài liệu đi trước prototype, quyết định 6);
// prototype sinh từ SRS + FRD-NFR (`module_docs`) + user story (`user_stories`); test case sinh khi FRD-NFR đã Xong.
// Các hàm tài liệu cũ (generateDocs, refineDoc, approveDocs, updateRequirements) giữ cho màn Tài liệu cũ, ghi bảng cũ.

import * as repo from "./repo.ts";
import * as ai from "./ai/pipelines.ts";
import { applyPatch } from "../shared/patch.ts";
import { cloneTree, collectIds, diffTrees, findNode, findParent, isContainer, newId, nodeLabel, topMostIds, UINode, validateTree } from "../shared/design.ts";
import { extractModel, DesignModel } from "../shared/extract.ts";
import { buildTrace, buildTraceMatrix } from "../shared/trace.ts";
import { DOC_KIND_LABEL, type ArtifactEventType, type ArtifactRef, type ArtifactStatus, type DocStatus, type Requirement, type SequenceDiagram, type UseCase } from "../shared/types.ts";
import { Box, completeLayout, nextElements, nextInContainer, RecursiveModel, toGrid } from "../shared/recursive.ts";
import { predictSlots, propsForSubtype, SUBTYPES, type Subtype, type TransformerModel } from "../shared/transformer.ts";
import { defaultNode } from "../shared/layoutDefaults.ts";
import { getRecursive, getTransformer } from "./nextModel.ts";
import { getArtifactState, setArtifactState, bumpRev, tx } from "./db.ts";
import { assertRev, HttpError } from "./http.ts";
import { emit } from "./events.ts";
import { cascadeOutdated } from "./prereq.ts";

export class BizError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function mustModule(id: string) {
  const m = repo.getModule(id);
  if (!m) throw new BizError("Module not found", 404);
  return m;
}

function mustScreen(id: string) {
  const s = repo.getScreen(id);
  if (!s) throw new BizError("Screen not found", 404);
  return s;
}

// ------------------------------------------------------------- Sự kiện vòng đời sản phẩm (server/events.ts)
// Gọi bên trong tx() để handler (vd tự cập nhật task – A7) chạy chung transaction với thao tác ghi.
function screenEvent(type: "artifact.drafted" | "artifact.approved" | "artifact.unapproved", screen: { id: string; moduleId: string }, actorId?: string) {
  emit({ type, artifact: { kind: "screen", id: screen.id, moduleId: screen.moduleId }, actorId });
}
function moduleEvent(type: ArtifactEventType, kind: "docs" | "tests", moduleId: string, actorId?: string) {
  emit({ type, artifact: { kind, id: moduleId, moduleId }, actorId });
}
const live = (s: DocStatus) => s !== "none" && s !== "outdated";

/** BR-02: tài liệu và test của module thành Bản cũ; phát artifact.stale cho phần vừa chuyển sang Bản cũ. */
function markStale(moduleId: string, actorId?: string) {
  const before = repo.getModule(moduleId);
  repo.markOutdated(moduleId);
  if (before && live(before.docsStatus)) moduleEvent("artifact.stale", "docs", moduleId, actorId);
  if (before && live(before.testsStatus)) moduleEvent("artifact.stale", "tests", moduleId, actorId);
}

// ------------------------------------------------------------- Design Studio
// ------------------------------------------------------------- Bối cảnh tài liệu cho AI (đợt 5)
const STATUS_VI: Record<ArtifactStatus, string> = { none: "Not started", draft: "Draft", done: "Done", approved: "Approved", outdated: "Outdated" };
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "\n…(truncated)" : t);

function storyLines(moduleId: string): string[] {
  return repo.listModuleStories(moduleId).map((st) => {
    const ac = st.acceptanceCriteria.filter(Boolean);
    return `- ${st.code} [${st.priority}]: As a ${st.asA || "…"}, I want ${st.iWant || "…"}${st.soThat ? `, so that ${st.soThat}` : ""}${ac.length ? `\n  Acceptance criteria: ${ac.join("; ")}` : ""}`;
  });
}

/**
 * Bối cảnh sinh/sửa màn: user story của module + SRS (Markdown) + FRD-NFR (danh sách yêu cầu) đọc thẳng từ
 * `user_stories` / `module_docs`. Module chưa có gì ở đợt 5 thì dùng ô yêu cầu cũ (`requirementInput`).
 * `full = false` (sửa màn): bỏ SRS cho gọn.
 */
export function moduleContext(moduleId: string, full = true): string {
  const m = mustModule(moduleId);
  const parts: string[] = [];
  const stories = storyLines(moduleId);
  if (stories.length) parts.push(`### User story\n${stories.join("\n")}`);
  const srs = repo.getModuleDocRow(moduleId, "SRS");
  if (full && srs?.content.trim()) parts.push(`### SRS (${STATUS_VI[srs.status] ?? srs.status})\n${clip(srs.content.trim(), 8000)}`);
  const frd = repo.getModuleDocRow(moduleId, "FRD_NFR");
  const reqs = frd ? repo.getDocs(moduleId).requirements : [];
  if (frd && reqs.length)
    parts.push(`### FRD-NFR (${STATUS_VI[frd.status] ?? frd.status})\n${reqs.map((r) => `- ${r.code} (${r.type}, ${r.priority}${r.useCaseCodes.length ? `, ${r.useCaseCodes.join("/")}` : ""}): ${r.statement}`).join("\n")}`);
  else if (frd?.content.trim()) parts.push(`### FRD-NFR (${STATUS_VI[frd.status] ?? frd.status})\n${clip(frd.content.trim(), 6000)}`);
  if (!parts.length && m.requirementInput.trim()) parts.push(`### Business requirements (legacy)\n${m.requirementInput.trim()}`);
  return parts.join("\n\n");
}

const foldVi = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim(); // vi-keep: bỏ dấu tiếng Việt khi so khớp

/** Prompt cho bản Mock (rule-based) khi BA để trống prompt: tên màn + các story/FR nhắc tới tên màn. */
function mockPromptFor(moduleId: string, name: string): string {
  const words = foldVi(name).split(/\s+/).filter((w) => w.length >= 2);
  const hit = (t: string) => words.length > 0 && words.every((w) => foldVi(t).includes(w));
  const reqs = repo.getDocs(moduleId).requirements.filter((r) => r.type === "FR" && hit(r.statement)).map((r) => r.statement);
  const stories = repo.listModuleStories(moduleId).filter((st) => hit(st.iWant)).map((st) => st.iWant);
  return [`Screen ${name}.`, ...stories, ...reqs].join(" ");
}

export async function createScreenFromPrompt(moduleId: string, prompt: string, name: string, actorId?: string) {
  mustModule(moduleId);
  if (!prompt.trim() && !name.trim()) throw new BizError("Enter a screen name or a screen description");
  const others = repo.listScreens(moduleId).map((s) => s.name);
  const context = moduleContext(moduleId);
  const mockPrompt = prompt.trim() ? undefined : mockPromptFor(moduleId, name.trim());
  const result = await ai.generateScreen({ moduleId, prompt, name: name.trim(), context, otherScreens: others, mockPrompt });
  return tx(() => {
    const screen = repo.createScreen(moduleId, result.name, actorId);
    const version = repo.addVersion(screen.id, { kind: "generate", prompt, tree: result.tree });
    screenEvent("artifact.drafted", screen, actorId);
    return { screen: repo.getScreen(screen.id), version };
  });
}

export async function editScreenWithPrompt(screenId: string, input: { prompt: string; nodeIds: string[]; annotationIds: string[] }, actorId?: string) {
  const screen = mustScreen(screenId);
  if (!screen.currentVersionId) throw new BizError("The screen has no versions yet");
  const current = repo.getVersion(screen.currentVersionId)!;
  const annotations = repo.getAnnotations(input.annotationIds).filter((a) => a.screenId === screenId);
  if (!input.prompt.trim() && !annotations.length) throw new BizError("Enter an edit request or select at least one comment");

  // Vùng sửa = vùng đang chọn ∪ vùng của các bình luận được gửi (chỉ giữ node còn tồn tại)
  const idSet = new Set(collectIds(current.tree));
  const exists = (id: string) => idSet.has(id);
  const selected = topMostIds(current.tree, [...new Set([...input.nodeIds, ...annotations.flatMap((a) => a.nodeIds)])].filter(exists));

  const { ops, summary } = await ai.editScreen({
    moduleId: screen.moduleId,
    tree: current.tree,
    selectedIds: selected,
    instruction: input.prompt,
    comments: annotations.map((a) => ({ comment: a.comment, nodeIds: a.nodeIds })),
    context: moduleContext(screen.moduleId, false),
  });
  const result = applyPatch(current.tree, ops, { selectedIds: selected });
  const valid = validateTree(result.tree);
  if (!valid.ok) throw new BizError(`Invalid edit result: ${valid.errors.slice(0, 3).join("; ")}`);
  const diff = diffTrees(current.tree, result.tree);
  const changed = [...new Set([...diff.added, ...diff.changed])];
  if (!changed.length && !diff.removed.length) {
    return { version: null, summary: summary || "No changes were applied", rejected: result.rejected.map((r) => ({ reason: r.reason })), diff };
  }
  const version = tx(() => {
    // AI chạy vài giây: trong lúc đó người khác có thể đã lưu phiên bản khác hoặc xoá màn → kiểm lại trong tx,
    // không ghi đè lên bản của họ (409 như chặn đè) và lấy trạng thái mới nhất cho draftAfterChange.
    const now = repo.getScreen(screenId);
    if (!now) throw new HttpError("This screen has just been deleted", 404);
    if (now.currentVersionId !== current.id) {
      const rev = getArtifactState({ kind: "screen", id: screenId, moduleId: now.moduleId })?.rev ?? 0;
      throw new HttpError("This version has changed – reload", 409, "CONFLICT", { rev });
    }
    const version = repo.addVersion(screenId, {
      kind: "edit",
      prompt: [input.prompt, ...annotations.map((a) => `[Comment] ${a.comment}`)].filter(Boolean).join("\n"),
      scope: selected.length ? "region" : "global",
      selectedIds: selected,
      changedIds: changed,
      rejected: result.rejected.map((r) => ({ reason: r.reason })),
      tree: result.tree,
    });
    if (annotations.length) repo.setAnnotationStatus(annotations.map((a) => a.id), "sent");
    draftAfterChange(now, actorId);
    return version;
  });
  return { version, summary, rejected: version.rejected, diff };
}

export function revertScreen(screenId: string, versionId: string, actorId?: string) {
  const screen = mustScreen(screenId);
  const target = repo.getVersion(versionId);
  if (!target || target.screenId !== screenId) throw new BizError("Invalid version");
  const current = screen.currentVersionId ? repo.getVersion(screen.currentVersionId) : null;
  const diff = current ? diffTrees(current.tree, target.tree) : { added: [], changed: [], removed: [] };
  return tx(() => {
    const version = repo.addVersion(screenId, { kind: "revert", prompt: `Restore version v${target.number}`, changedIds: [...diff.added, ...diff.changed], tree: target.tree });
    draftAfterChange(screen, actorId);
    return version;
  });
}

export function setScreenApproval(screenId: string, approved: boolean, actorId?: string) {
  const screen = mustScreen(screenId);
  return tx(() => {
    repo.updateScreen(screenId, { status: approved ? "approved" : "draft" });
    screenEvent(approved ? "artifact.approved" : "artifact.unapproved", screen, actorId);
    if (!approved) markStale(screen.moduleId, actorId);
    return repo.getScreen(screenId);
  });
}

// ------------------------------------------------------------- Gợi ý element (Li et al. 2020: layout auto-completion)
// Toàn bộ gợi ý lấy từ mô hình trong model/ (server/nextModel.ts), chia vai – không có luật hay bộ lọc nào khác:
//  - Recursive Transformer Tree Decoder (shared/recursive.ts): phần tử tiếp theo + hoàn thành bố cục, có khung bao.
//  - Transformer phát hiện chỗ thiếu (shared/transformer.ts): phần tử còn thiếu GIỮA các phần tử đã có (`gaps`).
export interface LayoutBoxes {
  pageWidth: number;
  boxes: Record<string, [number, number, number, number]>; // pixel so với góc trên trái của trang: x, y, x2, y2
}
type PxBox = [number, number, number, number];

function toPx(m: RecursiveModel, b: Box, pageWidth: number): PxBox {
  const cx = pageWidth / m.config.gx, cy = m.config.cellY;
  return [Math.round(b[0] * cx), b[1] * cy, Math.round((b[2] + 1) * cx), (b[3] + 1) * cy];
}

function mustRecursive() {
  const rm = getRecursive();
  if (!rm) throw new BizError("The layout suggestion model is not available (model/recursive-layout.json)", 503);
  return rm;
}

function currentVersion(screenId: string) {
  const screen = mustScreen(screenId);
  if (!screen.currentVersionId) throw new BizError("The screen has no versions yet");
  return { screen, v: repo.getVersion(screen.currentVersionId)! };
}

/** Container mà gợi ý nhắm tới khi người dùng đang chọn phần tử: chính nó nếu là container, ngược lại là cha. */
function focusContainer(tree: UINode, nodeIds: string[]): string | null {
  const n = nodeIds.map((id) => findNode(tree, id)).find(Boolean);
  if (!n) return null;
  return isContainer(n.type) ? n.id : findParent(tree, n.id)?.id ?? null;
}

/** Ngưỡng P(thiếu) của một ô để hiện gợi ý chèn giữa – cùng ngưỡng với scripts/eval-transformer.ts. */
export const GAP_MIN_P = 0.5;

/**
 * Phần tử còn thiếu GIỮA các con đã có (Transformer): chỉ xét ô đứng trước một con đã có (ô cuối container là vai của Recursive),
 * P(thiếu) ≥ GAP_MIN_P, trong container đang chọn hoặc cả cây; xếp theo P(thiếu) giảm dần, tối đa 3 ô.
 */
function gapSuggestions(tf: TransformerModel, tree: UINode, focus: string | null) {
  return predictSlots(tf, tree, 3)
    .filter((s) => s.pMissing >= GAP_MIN_P && (!focus || s.parentId === focus))
    .map((s) => ({ s, parent: findNode(tree, s.parentId)! }))
    .filter(({ s, parent }) => s.index < (parent.children?.length ?? 0))
    .sort((a, b) => b.s.pMissing - a.s.pMissing)
    .slice(0, 3)
    .map(({ s, parent }) => ({
      source: "transformer" as const,
      parentId: s.parentId,
      parentLabel: nodeLabel(parent),
      index: s.index,
      beforeId: parent.children![s.index].id,
      beforeLabel: nodeLabel(parent.children![s.index]),
      afterLabel: s.index > 0 ? nodeLabel(parent.children![s.index - 1]) : null,
      pMissing: s.pMissing,
      candidates: s.types.slice(0, 3).map((t) => ({ type: t.type, p: t.p, sub: t.sub })),
    }));
}

/**
 * mode "next": phần tử tiếp theo (Recursive, một bước giải mã) – trong container đang chọn, hoặc nếu không chọn gì thì ở các
 *              container mà mô hình không đoán EOS, xếp theo xác suất loại cao nhất (tối đa 3 vị trí);
 *              kèm `gaps` – phần tử còn thiếu giữa các con đã có (Transformer). Thiếu file Transformer thì gaps rỗng, gapModel null.
 * mode "complete": hoàn thành bố cục (Recursive, giải mã tham lam tới EOS, kể cả container mới sinh) trong vùng chọn hoặc cả màn.
 */
export function layoutSuggestions(screenId: string, input: { layout?: LayoutBoxes; nodeIds: string[]; mode: "next" | "complete" }) {
  const rm = mustRecursive();
  const { v } = currentVersion(screenId);
  const layout = input.layout;
  if (!layout || !(layout.pageWidth > 0) || !Object.keys(layout.boxes).length) throw new BizError("Missing bounding boxes of the elements on the canvas");
  const boxes: Record<string, Box> = {};
  for (const [id, b] of Object.entries(layout.boxes)) boxes[id] = toGrid(rm, { x: b[0], y: b[1], x2: b[2], y2: b[3] }, layout.pageWidth);
  const focus = focusContainer(v.tree, input.nodeIds);
  const model = { kind: "recursive", trees: Number(rm.meta.trees ?? 0), roots: Number(rm.meta.roots ?? 0) };
  if (input.mode === "complete") {
    const items = completeLayout(rm, v.tree, boxes, focus ?? v.tree.id).map((g) => ({ ...g, boxPx: toPx(rm, g.box, layout.pageWidth) }));
    return { mode: "complete" as const, versionId: v.id, focusId: focus, items, model };
  }
  const found = focus ? [nextInContainer(rm, v.tree, boxes, focus)].filter((x) => x !== null) : nextElements(rm, v.tree, boxes).slice(0, 3);
  const items = found.map((e) => ({ ...e, source: "recursive" as const, boxPx: toPx(rm, e.box, layout.pageWidth), parentLabel: nodeLabel(findNode(v.tree, e.parentId)!) }));
  const tf = getTransformer();
  const gaps = tf ? gapSuggestions(tf, v.tree, focus) : [];
  const gapModel = tf ? { kind: "transformer", trees: Number(tf.meta.trees ?? 0) } : null;
  return { mode: "next" as const, versionId: v.id, focusId: focus, items, model, gaps, gapModel };
}

export type SuggestionSource = "recursive" | "transformer";
/** sub: loại con mang nghĩa do Transformer dự đoán (email, password, submit…) – dùng để điền nhãn phù hợp cho phần tử mới. */
export interface AcceptItem { ref: string; parentId: string; index: number; type: string; sub?: string }

// Loại con có props riêng khi chèn; "-", "other", "icon" giữ props mặc định trung tính (UINode không có thuộc tính icon).
const SUB_WITH_PROPS = new Set<string>(SUBTYPES.filter((s) => !["-", "other", "icon"].includes(s)));
const SOURCE_LABEL: Record<SuggestionSource, string> = { recursive: "Recursive, Li et al. 2020", transformer: "Transformer – missing element" };

/**
 * Chấp nhận gợi ý bố cục: chèn phần tử (props mặc định trung tính) vào đúng container và vị trí chèn của gợi ý → phiên bản mới.
 * items: phần tử có parentId là node đã có, hoặc là `ref` (tempId) của phần tử khác trong cùng lần chấp nhận.
 */
export function acceptLayout(screenId: string, input: { versionId: string; items: AcceptItem[]; source?: SuggestionSource }, actorId?: string) {
  const { screen, v } = currentVersion(screenId);
  if (input.versionId && input.versionId !== v.id) throw new BizError("The screen has changed – the old suggestions no longer apply, reload the suggestions", 409);
  if (!input.items.length || input.items.length > 100) throw new BizError("Invalid element list");
  const refs = new Map<string, UINode>();
  const roots: { item: AcceptItem; node: UINode }[] = [];
  for (const it of input.items) {
    const node = defaultNode(it.type, newId(it.type.toLowerCase()));
    if (!node) throw new BizError(`Invalid element type: ${it.type}`);
    if (it.sub && SUB_WITH_PROPS.has(it.sub)) node.props = { ...node.props, ...propsForSubtype(it.type, it.sub as Subtype) };
    refs.set(it.ref, node);
    const parentRef = refs.get(it.parentId);
    if (parentRef) {
      if (!isContainer(parentRef.type)) throw new BizError(`${parentRef.type} cannot contain child elements`);
      (parentRef.children ??= []).push(node);
    } else {
      const parent = findNode(v.tree, it.parentId);
      if (!parent || !isContainer(parent.type)) throw new BizError(`Container ${it.parentId} not found`);
      roots.push({ item: it, node });
    }
  }
  // chèn theo vị trí trong từng container: phần tử thứ k (theo vị trí gợi ý) cùng container dịch thêm k ô
  const tree = cloneTree(v.tree);
  const byParent = new Map<string, { item: AcceptItem; node: UINode }[]>();
  for (const r of roots) byParent.set(r.item.parentId, [...(byParent.get(r.item.parentId) ?? []), r]);
  const added: string[] = [];
  for (const [pid, list] of byParent) {
    const parent = findNode(tree, pid)!;
    const kids = (parent.children ??= []);
    list.sort((a, b) => a.item.index - b.item.index).forEach((r, k) => {
      kids.splice(Math.max(0, Math.min(kids.length, r.item.index + k)), 0, r.node);
    });
  }
  for (const n of refs.values()) added.push(n.id);
  const valid = validateTree(tree);
  if (!valid.ok) throw new BizError(`Invalid result: ${valid.errors.slice(0, 3).join("; ")}`);
  const desc = roots.map((r) => `${r.node.type} into ${nodeLabel(findNode(v.tree, r.item.parentId)!)}`).join(", ");
  const version = tx(() => {
    const version = repo.addVersion(screenId, {
      kind: "layout",
      prompt: `Accepted layout suggestion (${SOURCE_LABEL[input.source ?? "recursive"]}): added ${added.length} element(s) – ${desc}`,
      scope: "region",
      selectedIds: [...byParent.keys()],
      changedIds: added,
      tree,
    });
    draftAfterChange(screen, actorId);
    return version;
  });
  return { version, added };
}

/** Sửa tay trên canvas: xóa phần tử, hoặc đổi thứ tự trong container (lên/xuống). */
export function manualEdit(screenId: string, input: { op: "remove" | "up" | "down"; id: string }, actorId?: string) {
  const { screen, v } = currentVersion(screenId);
  const tree = cloneTree(v.tree);
  const node = findNode(tree, input.id);
  const parent = node ? findParent(tree, input.id) : null;
  if (!node || !parent) throw new BizError("Element not found (the root Page cannot be deleted or moved)");
  const kids = parent.children!;
  const i = kids.indexOf(node);
  let changed: string[] = [];
  let what = "";
  if (input.op === "remove") {
    kids.splice(i, 1);
    what = `delete ${nodeLabel(node)}`;
  } else {
    const j = input.op === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= kids.length) throw new BizError("The element is already at the start/end of the container");
    [kids[i], kids[j]] = [kids[j], kids[i]];
    changed = [node.id];
    what = `move ${nodeLabel(node)} ${input.op === "up" ? "up" : "down"}`;
  }
  const version = tx(() => {
    const version = repo.addVersion(screenId, { kind: "manual", prompt: `Manual edit: ${what}`, scope: "region", selectedIds: [parent.id], changedIds: changed, tree });
    draftAfterChange(screen, actorId);
    return version;
  });
  return { version };
}

/**
 * Màn vừa có phiên bản mới (gọi trong tx()). Đợt 5: màn đang Xong / Đã duyệt / Bản cũ → về Bản nháp (giữ cờ
 * "Yêu cầu sửa"), phát artifact.drafted; màn đang Xong mà bị sửa thì bộ test của module (bước sau) → Bản cũ.
 * Tài liệu mới (`module_docs`) đi trước prototype nên không bị ảnh hưởng.
 * Tương thích v2 tới khi C7 gộp (R-030, R-100): màn đang Đã duyệt vẫn phát thêm "artifact.unapproved" và áp BR-02 cho
 * bộ tài liệu cũ (`modules.docs_status`) + test như trước.
 */
function draftAfterChange(screen: { id: string; status: string; moduleId: string }, actorId?: string) {
  const ref: ArtifactRef = { kind: "screen", id: screen.id, moduleId: screen.moduleId };
  if (screen.status !== "draft") setArtifactState(ref, { status: "draft" });
  screenEvent("artifact.drafted", screen, actorId);
  if (screen.status === "approved") {
    screenEvent("artifact.unapproved", screen, actorId); // v2 – bỏ khi C0 làm R-030
    markStale(screen.moduleId, actorId); // BR-02 cũ: tài liệu cũ + test
  } else if (screen.status === "done") staleTests(screen.moduleId, actorId);
}

/** Bộ test đang có (Bản nháp / Xong / Đã duyệt) → Bản cũ, phát artifact.stale. */
function staleTests(moduleId: string, actorId?: string) {
  const m = repo.getModule(moduleId);
  if (!m || !live(m.testsStatus)) return;
  setArtifactState({ kind: "tests", id: moduleId, moduleId }, { status: "outdated" });
  moduleEvent("artifact.stale", "tests", moduleId, actorId);
}

// ------------------------------------------------------------- Docs (luồng cũ – màn Tài liệu cũ; màn mới của C5 dùng docs.ts riêng)
// Đợt 5: bỏ BR-01 – không còn cần màn Đã duyệt; mô hình thiết kế lấy từ mọi màn đang có (có thể rỗng).

export function getDesignModel(moduleId: string): DesignModel {
  mustModule(moduleId);
  const screens = repo.listScreens(moduleId).filter((s) => s.tree);
  return extractModel(screens.map((s) => ({ id: s.id, name: s.name, tree: s.tree! })));
}

export async function generateDocs(moduleId: string, actorId?: string) {
  const m = mustModule(moduleId);
  const model = getDesignModel(moduleId);
  const { useCases, requirements } = await ai.generateUseCases({ moduleId, moduleName: m.name, requirementInput: m.requirementInput, model });
  repo.saveUseCasesAndRequirements(moduleId, useCases, requirements);
  const [srs, sequences] = await Promise.all([
    ai.generateSrs({ moduleId, moduleName: m.name, requirementInput: m.requirementInput, model, useCases, requirements }),
    ai.generateSequences({ moduleId, useCases, model }),
  ]);
  tx(() => {
    repo.saveSrs(moduleId, srs);
    repo.saveSequences(moduleId, sequences);
    repo.updateModule(moduleId, { docsStatus: "draft", testsStatus: m.testsStatus === "none" ? "none" : "outdated" });
    if (m.docsStatus === "approved") moduleEvent("artifact.unapproved", "docs", moduleId, actorId);
    moduleEvent("artifact.drafted", "docs", moduleId, actorId);
    if (live(m.testsStatus)) moduleEvent("artifact.stale", "tests", moduleId, actorId);
  });
  return repo.getLegacyDocs(moduleId);
}

export async function refineDoc(moduleId: string, target: string, instruction: string, actorId?: string) {
  const m = mustModule(moduleId);
  if (!instruction.trim()) throw new BizError("Enter a refinement instruction");
  const docs = repo.getLegacyDocs(moduleId);
  const model = getDesignModel(moduleId);
  if (target.startsWith("SEQ:")) {
    const code = target.slice(4);
    const seq = docs.sequences.find((s) => s.useCaseCode === code);
    if (!seq) throw new BizError("Diagram not found");
    const next: SequenceDiagram = await ai.refineSequence({ moduleId, seq, instruction, uc: docs.useCases.find((u) => u.code === code) });
    repo.saveSequence(moduleId, next);
  } else if (target.startsWith("SRS:")) {
    const key = target.slice(4);
    if (!docs.srs) throw new BizError("There is no SRS yet");
    const section = docs.srs.sections.find((s) => s.key === key);
    if (!section) throw new BizError("SRS section not found");
    const next = await ai.refineSrsSection({ moduleId, section, instruction, context: `Module ${m.name}. UC: ${docs.useCases.map((u) => `${u.code} ${u.name}`).join("; ")}` });
    repo.saveSrs(moduleId, { sections: docs.srs.sections.map((s) => (s.key === key ? next : s)) });
  } else {
    const uc = docs.useCases.find((u) => u.code === target);
    if (!uc) throw new BizError("Use case not found");
    const next: UseCase = await ai.refineUseCase({ moduleId, uc, instruction, model });
    repo.saveUseCase(moduleId, next);
  }
  tx(() => {
    if (m.docsStatus === "approved") repo.updateModule(moduleId, { docsStatus: "draft" });
    if (m.testsStatus !== "none") repo.updateModule(moduleId, { testsStatus: "outdated" });
    if (m.docsStatus === "approved") moduleEvent("artifact.unapproved", "docs", moduleId, actorId);
    moduleEvent("artifact.drafted", "docs", moduleId, actorId);
    if (live(m.testsStatus)) moduleEvent("artifact.stale", "tests", moduleId, actorId);
  });
  return repo.getLegacyDocs(moduleId);
}

export function updateRequirements(moduleId: string, reqs: Requirement[]) {
  mustModule(moduleId);
  repo.saveRequirements(moduleId, reqs);
  return repo.getLegacyDocs(moduleId);
}

export function approveDocs(moduleId: string, approved: boolean, actorId?: string) {
  const m = mustModule(moduleId);
  if (m.docsStatus === "none") throw new BizError("There are no documents to approve yet");
  return tx(() => {
    repo.updateModule(moduleId, { docsStatus: approved ? "approved" : "draft" });
    moduleEvent(approved ? "artifact.approved" : "artifact.unapproved", "docs", moduleId, actorId);
    // Bỏ duyệt bộ tài liệu cũ: bộ test Xong theo nhánh legacy không còn bước tiên quyết → Bản cũ (D2 đợt 6).
    if (!approved) cascadeOutdated(moduleId, actorId);
    return repo.getModule(moduleId);
  });
}

// ------------------------------------------------------------- Test case (đợt 5)
export interface TestsReadiness {
  ready: boolean;
  /** Lý do chặn (hiển thị cho BA) khi `ready = false`. */
  reason: string;
  /** "v5": nguồn là module_docs (UC_SPEC + FRD_NFR). "legacy": module làm theo luồng cũ (tài liệu cũ đã duyệt). */
  source: "v5" | "legacy" | null;
  frdStatus: ArtifactStatus;
}

/** Điều kiện sinh test case: FRD-NFR ở trạng thái Xong / Đã duyệt (quyết định 8). Module chỉ có tài liệu cũ đã duyệt vẫn sinh được. */
export function testsReadiness(moduleId: string): TestsReadiness {
  const m = mustModule(moduleId);
  const frd = getArtifactState({ kind: "doc", id: moduleId, moduleId, sub: "FRD_NFR" });
  const st = frd?.status ?? "none";
  if (st === "done" || st === "approved") {
    if (!repo.getDocs(moduleId).requirements.length) return { ready: false, reason: `${DOC_KIND_LABEL.FRD_NFR} has no requirements (FR/NFR) to generate test cases from`, source: null, frdStatus: st };
    return { ready: true, reason: "", source: "v5", frdStatus: st };
  }
  if (st === "none" && m.docsStatus === "approved") return { ready: true, reason: "", source: "legacy", frdStatus: st };
  return { ready: false, reason: `${DOC_KIND_LABEL.FRD_NFR} must be Done before generating test cases (current: ${STATUS_VI[st]})`, source: null, frdStatus: st };
}

/**
 * Sinh (lại) bộ test case từ UC Specification + FRD-NFR. Chặn đè theo `modules.tests_rev` (baseRev thiếu thì cho qua).
 * Sau khi ghi: bộ test về Bản nháp (giữ cờ Yêu cầu sửa), rev + 1, phát artifact.drafted.
 */
export async function generateTests(moduleId: string, actorId?: string, baseRev?: number) {
  const m = mustModule(moduleId);
  assertRev(m.testsRev ?? 0, baseRev);
  const r = testsReadiness(moduleId);
  if (!r.ready) throw new BizError(r.reason);
  const docs = r.source === "legacy" ? repo.getLegacyDocs(moduleId) : repo.getDocs(moduleId);
  const model = getDesignModel(moduleId);
  const tests = await ai.generateTests({ moduleId, useCases: docs.useCases, requirements: docs.requirements, model });
  const ref: ArtifactRef = { kind: "tests", id: moduleId, moduleId };
  tx(() => {
    assertRev(repo.getModule(moduleId)?.testsRev ?? 0, baseRev); // có người vừa sinh lại trong lúc AI chạy
    repo.saveTests(moduleId, tests);
    setArtifactState(ref, { status: "draft" });
    bumpRev(ref, actorId);
    moduleEvent("artifact.drafted", "tests", moduleId, actorId);
  });
  return tests;
}

// ------------------------------------------------------------- Truy vết
/** Ma trận cũ (FR ↔ UC ↔ màn ↔ TC, phục vụ xuất Excel) + ma trận đợt 5 Story → UC → FR → Màn → TC (`matrix`). */
export function trace(moduleId: string) {
  mustModule(moduleId);
  const docs = repo.getDocs(moduleId);
  const tests = repo.getTests(moduleId);
  const screenRows = repo.listScreens(moduleId);
  const stories = repo.listModuleStories(moduleId);
  const matrix = buildTraceMatrix({
    stories,
    useCases: docs.useCases,
    requirements: docs.requirements,
    screens: screenRows.map((s) => ({ id: s.id, name: s.name, title: String(s.tree?.props?.title ?? "") })),
    tests,
  });
  return {
    ...buildTrace(docs.useCases, docs.requirements, tests),
    screens: screenRows.map((s) => ({ id: s.id, name: s.name, status: s.status })),
    useCases: docs.useCases.map((u) => ({ code: u.code, name: u.name, screenIds: u.screenIds })),
    stories: stories.map((st) => ({ code: st.code, asA: st.asA, iWant: st.iWant, soThat: st.soThat })),
    requirements: docs.requirements.map((r) => ({ code: r.code, type: r.type, statement: r.statement })),
    tests: tests.map((t) => ({ code: t.code, title: t.title })),
    matrix,
  };
}
