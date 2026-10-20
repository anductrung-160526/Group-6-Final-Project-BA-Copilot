// Tầng nghiệp vụ: áp dụng quy tắc BR-01..BR-04 và điều phối pipeline AI.

import * as repo from "./repo.ts";
import * as ai from "./ai/pipelines.ts";
import { applyPatch } from "../shared/patch.ts";
import { cloneTree, collectIds, diffTrees, findNode, findParent, isContainer, newId, nodeLabel, topMostIds, UINode, validateTree } from "../shared/design.ts";
import { extractModel, DesignModel } from "../shared/extract.ts";
import { buildTrace } from "../shared/trace.ts";
import type { ArtifactEventType, DocStatus, Requirement, SequenceDiagram, UseCase } from "../shared/types.ts";
import { Box, completeLayout, nextElements, nextInContainer, RecursiveModel, toGrid } from "../shared/recursive.ts";
import { defaultNode } from "../shared/layoutDefaults.ts";
import { getRecursive } from "./nextModel.ts";
import { tx } from "./db.ts";
import { emit } from "./events.ts";

export class BizError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function mustModule(id: string) {
  const m = repo.getModule(id);
  if (!m) throw new BizError("Không tìm thấy module", 404);
  return m;
}

function mustScreen(id: string) {
  const s = repo.getScreen(id);
  if (!s) throw new BizError("Không tìm thấy màn hình", 404);
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

/** BR-02: tài liệu và test của module thành Lỗi thời; phát artifact.stale cho phần vừa chuyển sang Lỗi thời. */
function markStale(moduleId: string, actorId?: string) {
  const before = repo.getModule(moduleId);
  repo.markOutdated(moduleId);
  if (before && live(before.docsStatus)) moduleEvent("artifact.stale", "docs", moduleId, actorId);
  if (before && live(before.testsStatus)) moduleEvent("artifact.stale", "tests", moduleId, actorId);
}

// ------------------------------------------------------------- Design Studio
export async function createScreenFromPrompt(moduleId: string, prompt: string, name: string, actorId?: string) {
  const m = mustModule(moduleId);
  if (!prompt.trim()) throw new BizError("Prompt không được để trống");
  const others = repo.listScreens(moduleId).map((s) => s.name);
  const result = await ai.generateScreen({ moduleId, prompt, name: name.trim(), requirementInput: m.requirementInput, otherScreens: others });
  return tx(() => {
    const screen = repo.createScreen(moduleId, result.name);
    const version = repo.addVersion(screen.id, { kind: "generate", prompt, tree: result.tree });
    screenEvent("artifact.drafted", screen, actorId);
    return { screen: repo.getScreen(screen.id), version };
  });
}

export async function editScreenWithPrompt(screenId: string, input: { prompt: string; nodeIds: string[]; annotationIds: string[] }, actorId?: string) {
  const screen = mustScreen(screenId);
  if (!screen.currentVersionId) throw new BizError("Màn hình chưa có phiên bản");
  const current = repo.getVersion(screen.currentVersionId)!;
  const annotations = repo.getAnnotations(input.annotationIds).filter((a) => a.screenId === screenId);
  if (!input.prompt.trim() && !annotations.length) throw new BizError("Cần nhập yêu cầu sửa hoặc chọn ít nhất một bình luận");

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
  });
  const result = applyPatch(current.tree, ops, { selectedIds: selected });
  const valid = validateTree(result.tree);
  if (!valid.ok) throw new BizError(`Kết quả sửa không hợp lệ: ${valid.errors.slice(0, 3).join("; ")}`);
  const diff = diffTrees(current.tree, result.tree);
  const changed = [...new Set([...diff.added, ...diff.changed])];
  if (!changed.length && !diff.removed.length) {
    return { version: null, summary: summary || "Không có thay đổi nào được áp dụng", rejected: result.rejected.map((r) => ({ reason: r.reason })), diff };
  }
  const version = tx(() => {
    const version = repo.addVersion(screenId, {
      kind: "edit",
      prompt: [input.prompt, ...annotations.map((a) => `[Bình luận] ${a.comment}`)].filter(Boolean).join("\n"),
      scope: selected.length ? "region" : "global",
      selectedIds: selected,
      changedIds: changed,
      rejected: result.rejected.map((r) => ({ reason: r.reason })),
      tree: result.tree,
    });
    if (annotations.length) repo.setAnnotationStatus(annotations.map((a) => a.id), "sent");
    draftAfterChange(screen, actorId);
    return version;
  });
  return { version, summary, rejected: version.rejected, diff };
}

export function revertScreen(screenId: string, versionId: string, actorId?: string) {
  const screen = mustScreen(screenId);
  const target = repo.getVersion(versionId);
  if (!target || target.screenId !== screenId) throw new BizError("Phiên bản không hợp lệ");
  const current = screen.currentVersionId ? repo.getVersion(screen.currentVersionId) : null;
  const diff = current ? diffTrees(current.tree, target.tree) : { added: [], changed: [], removed: [] };
  return tx(() => {
    const version = repo.addVersion(screenId, { kind: "revert", prompt: `Khôi phục phiên bản v${target.number}`, changedIds: [...diff.added, ...diff.changed], tree: target.tree });
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

// ------------------------------------------------------------- Gợi ý bố cục (Li et al. 2020: layout auto-completion)
// Toàn bộ gợi ý lấy từ Recursive Transformer Tree Decoder (shared/recursive.ts); không có luật hay bộ lọc nào khác.
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
  if (!rm) throw new BizError("Chưa có mô hình gợi ý bố cục (model/recursive-layout.json)", 503);
  return rm;
}

function currentVersion(screenId: string) {
  const screen = mustScreen(screenId);
  if (!screen.currentVersionId) throw new BizError("Màn hình chưa có phiên bản");
  return { screen, v: repo.getVersion(screen.currentVersionId)! };
}

/** Container mà gợi ý nhắm tới khi người dùng đang chọn phần tử: chính nó nếu là container, ngược lại là cha. */
function focusContainer(tree: UINode, nodeIds: string[]): string | null {
  const n = nodeIds.map((id) => findNode(tree, id)).find(Boolean);
  if (!n) return null;
  return isContainer(n.type) ? n.id : findParent(tree, n.id)?.id ?? null;
}

/**
 * mode "next": phần tử tiếp theo (một bước giải mã) – trong container đang chọn, hoặc nếu không chọn gì thì ở các container
 *              mà mô hình không đoán EOS, xếp theo xác suất loại cao nhất (tối đa 3 vị trí).
 * mode "complete": hoàn thành bố cục (giải mã tham lam tới EOS, kể cả container mới sinh) trong vùng chọn hoặc cả màn.
 */
export function layoutSuggestions(screenId: string, input: { layout?: LayoutBoxes; nodeIds: string[]; mode: "next" | "complete" }) {
  const rm = mustRecursive();
  const { v } = currentVersion(screenId);
  const layout = input.layout;
  if (!layout || !(layout.pageWidth > 0) || !Object.keys(layout.boxes).length) throw new BizError("Thiếu khung bao của các phần tử trên canvas");
  const boxes: Record<string, Box> = {};
  for (const [id, b] of Object.entries(layout.boxes)) boxes[id] = toGrid(rm, { x: b[0], y: b[1], x2: b[2], y2: b[3] }, layout.pageWidth);
  const focus = focusContainer(v.tree, input.nodeIds);
  const model = { kind: "recursive", trees: Number(rm.meta.trees ?? 0), roots: Number(rm.meta.roots ?? 0) };
  if (input.mode === "complete") {
    const items = completeLayout(rm, v.tree, boxes, focus ?? v.tree.id).map((g) => ({ ...g, boxPx: toPx(rm, g.box, layout.pageWidth) }));
    return { mode: "complete" as const, versionId: v.id, focusId: focus, items, model };
  }
  const found = focus ? [nextInContainer(rm, v.tree, boxes, focus)].filter((x) => x !== null) : nextElements(rm, v.tree, boxes).slice(0, 3);
  const items = found.map((e) => ({ ...e, boxPx: toPx(rm, e.box, layout.pageWidth), parentLabel: nodeLabel(findNode(v.tree, e.parentId)!) }));
  return { mode: "next" as const, versionId: v.id, focusId: focus, items, model };
}

export interface AcceptItem { ref: string; parentId: string; index: number; type: string }

/**
 * Chấp nhận gợi ý bố cục: chèn phần tử (props mặc định trung tính) vào đúng container và vị trí chèn của gợi ý → phiên bản mới.
 * items: phần tử có parentId là node đã có, hoặc là `ref` (tempId) của phần tử khác trong cùng lần chấp nhận.
 */
export function acceptLayout(screenId: string, input: { versionId: string; items: AcceptItem[] }, actorId?: string) {
  const { screen, v } = currentVersion(screenId);
  if (input.versionId && input.versionId !== v.id) throw new BizError("Màn hình đã thay đổi – gợi ý cũ không còn đúng, hãy tải lại gợi ý", 409);
  if (!input.items.length || input.items.length > 100) throw new BizError("Danh sách phần tử không hợp lệ");
  const refs = new Map<string, UINode>();
  const roots: { item: AcceptItem; node: UINode }[] = [];
  for (const it of input.items) {
    const node = defaultNode(it.type, newId(it.type.toLowerCase()));
    if (!node) throw new BizError(`Loại phần tử không hợp lệ: ${it.type}`);
    refs.set(it.ref, node);
    const parentRef = refs.get(it.parentId);
    if (parentRef) {
      if (!isContainer(parentRef.type)) throw new BizError(`${parentRef.type} không chứa được phần tử con`);
      (parentRef.children ??= []).push(node);
    } else {
      const parent = findNode(v.tree, it.parentId);
      if (!parent || !isContainer(parent.type)) throw new BizError(`Không tìm thấy container ${it.parentId}`);
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
  if (!valid.ok) throw new BizError(`Kết quả không hợp lệ: ${valid.errors.slice(0, 3).join("; ")}`);
  const desc = roots.map((r) => `${r.node.type} vào ${nodeLabel(findNode(v.tree, r.item.parentId)!)}`).join(", ");
  const version = tx(() => {
    const version = repo.addVersion(screenId, {
      kind: "layout",
      prompt: `Chấp nhận gợi ý bố cục (Recursive, Li et al. 2020): thêm ${added.length} phần tử – ${desc}`,
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
  if (!node || !parent) throw new BizError("Không tìm thấy phần tử (không xóa/di chuyển được gốc Page)");
  const kids = parent.children!;
  const i = kids.indexOf(node);
  let changed: string[] = [];
  let what = "";
  if (input.op === "remove") {
    kids.splice(i, 1);
    what = `xóa ${nodeLabel(node)}`;
  } else {
    const j = input.op === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= kids.length) throw new BizError("Phần tử đã ở đầu/cuối container");
    [kids[i], kids[j]] = [kids[j], kids[i]];
    changed = [node.id];
    what = `chuyển ${nodeLabel(node)} ${input.op === "up" ? "lên" : "xuống"}`;
  }
  const version = tx(() => {
    const version = repo.addVersion(screenId, { kind: "manual", prompt: `Sửa tay: ${what}`, scope: "region", selectedIds: [parent.id], changedIds: changed, tree });
    draftAfterChange(screen, actorId);
    return version;
  });
  return { version };
}

/** Màn vừa có phiên bản mới: phát artifact.drafted; nếu màn đang Đã duyệt thì về Nháp và áp BR-02. Gọi trong tx(). */
function draftAfterChange(screen: { id: string; status: string; moduleId: string }, actorId?: string) {
  screenEvent("artifact.drafted", screen, actorId);
  if (screen.status === "approved") {
    repo.updateScreen(screen.id, { status: "draft" });
    screenEvent("artifact.unapproved", screen, actorId);
    markStale(screen.moduleId, actorId); // BR-02
  }
}

// ------------------------------------------------------------- Docs
function approvedModel(moduleId: string): DesignModel {
  const screens = repo.listScreens(moduleId).filter((s) => s.status === "approved" && s.tree);
  if (!screens.length) throw new BizError("BR-01: Cần ít nhất một màn hình ở trạng thái Đã duyệt trước khi sinh tài liệu");
  return extractModel(screens.map((s) => ({ id: s.id, name: s.name, tree: s.tree! })));
}

export function getDesignModel(moduleId: string): DesignModel {
  mustModule(moduleId);
  const screens = repo.listScreens(moduleId).filter((s) => s.tree);
  return extractModel(screens.map((s) => ({ id: s.id, name: s.name, tree: s.tree! })));
}

export async function generateDocs(moduleId: string, actorId?: string) {
  const m = mustModule(moduleId);
  const model = approvedModel(moduleId);
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
  return repo.getDocs(moduleId);
}

export async function refineDoc(moduleId: string, target: string, instruction: string, actorId?: string) {
  const m = mustModule(moduleId);
  if (!instruction.trim()) throw new BizError("Nhập yêu cầu chỉnh");
  const docs = repo.getDocs(moduleId);
  const model = getDesignModel(moduleId);
  if (target.startsWith("SEQ:")) {
    const code = target.slice(4);
    const seq = docs.sequences.find((s) => s.useCaseCode === code);
    if (!seq) throw new BizError("Không tìm thấy sơ đồ");
    const next: SequenceDiagram = await ai.refineSequence({ moduleId, seq, instruction, uc: docs.useCases.find((u) => u.code === code) });
    repo.saveSequence(moduleId, next);
  } else if (target.startsWith("SRS:")) {
    const key = target.slice(4);
    if (!docs.srs) throw new BizError("Chưa có SRS");
    const section = docs.srs.sections.find((s) => s.key === key);
    if (!section) throw new BizError("Không tìm thấy mục SRS");
    const next = await ai.refineSrsSection({ moduleId, section, instruction, context: `Module ${m.name}. UC: ${docs.useCases.map((u) => `${u.code} ${u.name}`).join("; ")}` });
    repo.saveSrs(moduleId, { sections: docs.srs.sections.map((s) => (s.key === key ? next : s)) });
  } else {
    const uc = docs.useCases.find((u) => u.code === target);
    if (!uc) throw new BizError("Không tìm thấy Use Case");
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
  return repo.getDocs(moduleId);
}

export function updateRequirements(moduleId: string, reqs: Requirement[]) {
  mustModule(moduleId);
  repo.saveRequirements(moduleId, reqs);
  return repo.getDocs(moduleId);
}

export function approveDocs(moduleId: string, approved: boolean, actorId?: string) {
  const m = mustModule(moduleId);
  if (m.docsStatus === "none") throw new BizError("Chưa có tài liệu để duyệt");
  return tx(() => {
    repo.updateModule(moduleId, { docsStatus: approved ? "approved" : "draft" });
    moduleEvent(approved ? "artifact.approved" : "artifact.unapproved", "docs", moduleId, actorId);
    return repo.getModule(moduleId);
  });
}

// ------------------------------------------------------------- Tests
export async function generateTests(moduleId: string, actorId?: string) {
  const m = mustModule(moduleId);
  if (m.docsStatus !== "approved") throw new BizError("Cần duyệt tài liệu (Approved) trước khi sinh test case");
  const docs = repo.getDocs(moduleId);
  const model = getDesignModel(moduleId);
  const tests = await ai.generateTests({ moduleId, useCases: docs.useCases, requirements: docs.requirements, model });
  tx(() => {
    repo.saveTests(moduleId, tests);
    repo.updateModule(moduleId, { testsStatus: "draft" });
    moduleEvent("artifact.drafted", "tests", moduleId, actorId);
  });
  return tests;
}

export function trace(moduleId: string) {
  mustModule(moduleId);
  const docs = repo.getDocs(moduleId);
  const tests = repo.getTests(moduleId);
  const screens = repo.listScreens(moduleId).map((s) => ({ id: s.id, name: s.name }));
  return { ...buildTrace(docs.useCases, docs.requirements, tests), screens, useCases: docs.useCases.map((u) => ({ code: u.code, name: u.name, screenIds: u.screenIds })) };
}
