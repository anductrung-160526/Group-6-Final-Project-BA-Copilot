// Patch engine: AI trả về danh sách thao tác thay vì cả màn hình.
// Server kiểm tra mọi thao tác phải nằm trong vùng khoanh (region-scoped editing).

import { cloneTree, findNode, findParent, normalizeTree, regionIds, UINode, isContainer, collectIds, Props } from "./design.ts";

export type PatchOp =
  | { op: "update"; id: string; props: Props }
  | { op: "replace"; id: string; node: unknown }
  | { op: "insert"; parentId: string; index?: number; node: unknown }
  | { op: "remove"; id: string };

export interface PatchResult {
  tree: UINode;
  applied: PatchOp[];
  rejected: { op: PatchOp; reason: string }[];
  touchedIds: string[];
}

export interface PatchOptions {
  /** id các node được khoanh. Rỗng = sửa toàn màn hình (global). */
  selectedIds?: string[];
}

/** Kiểm tra một thao tác có nằm trong vùng cho phép hay không. */
export function checkScope(tree: UINode, op: PatchOp, selectedIds: string[]): string | null {
  if (!selectedIds.length) return null;
  const allowed = regionIds(tree, selectedIds);
  // Cho phép chèn phần tử anh em ngay cạnh vùng chọn (vào node cha của node được chọn).
  const parentsOfSelected = new Set(
    selectedIds.map((id) => findParent(tree, id)?.id).filter((x): x is string => Boolean(x)),
  );
  switch (op.op) {
    case "update":
    case "replace":
    case "remove":
      return allowed.has(op.id) ? null : `Node ${op.id} nằm ngoài vùng khoanh`;
    case "insert":
      return allowed.has(op.parentId) || parentsOfSelected.has(op.parentId)
        ? null
        : `Không được chèn vào ${op.parentId} (ngoài vùng khoanh)`;
    default:
      return "Thao tác không hợp lệ";
  }
}

export function applyPatch(tree: UINode, ops: PatchOp[], opts: PatchOptions = {}): PatchResult {
  const selected = opts.selectedIds ?? [];
  let working = cloneTree(tree);
  const applied: PatchOp[] = [];
  const rejected: { op: PatchOp; reason: string }[] = [];
  const touched = new Set<string>();

  for (const op of ops) {
    if (!op || typeof op !== "object" || !("op" in op)) {
      rejected.push({ op, reason: "Thao tác không đúng định dạng" });
      continue;
    }
    // Kiểm tra phạm vi so với cây GỐC (vùng BA đã khoanh), không phải cây đang sửa,
    // để node mới chèn vẫn sửa được nếu nằm trong vùng.
    const scopeErr = checkScope(tree, op, selected);
    const insideNew = op.op !== "insert" && !findNode(tree, (op as { id: string }).id) && findNode(working, (op as { id: string }).id);
    if (scopeErr && !insideNew) {
      rejected.push({ op, reason: scopeErr });
      continue;
    }
    const err = applyOne(working, op, touched);
    if (err) rejected.push({ op, reason: err });
    else applied.push(op);
  }
  return { tree: working, applied, rejected, touchedIds: [...touched] };

  function applyOne(root: UINode, op: PatchOp, touchedSet: Set<string>): string | null {
    const existing = new Set(collectIds(root));
    switch (op.op) {
      case "update": {
        const n = findNode(root, op.id);
        if (!n) return `Không tìm thấy node ${op.id}`;
        const next = { ...n.props };
        for (const [k, v] of Object.entries(op.props ?? {})) {
          if (v === null) delete next[k];
          else next[k] = v;
        }
        n.props = next;
        touchedSet.add(n.id);
        return null;
      }
      case "replace": {
        const n = findNode(root, op.id);
        if (!n) return `Không tìm thấy node ${op.id}`;
        if (n === root) {
          const fresh = normalizeTree(op.node, new Set());
          if (fresh.type !== "Page") return "Node gốc phải là Page";
          working = fresh;
          touchedSet.add(fresh.id);
          return null;
        }
        existing.delete(op.id);
        // giữ id của node bị thay để bình luận cũ vẫn gắn được
        const raw = { ...(op.node as Record<string, unknown>), id: (op.node as { id?: string })?.id ?? op.id };
        const fresh = normalizeTree(raw, subtreeExclusive(root, op.id, existing));
        Object.assign(n, { id: fresh.id, type: fresh.type, props: fresh.props });
        if (fresh.children) n.children = fresh.children;
        else delete n.children;
        touchedSet.add(fresh.id);
        return null;
      }
      case "insert": {
        const parent = findNode(root, op.parentId);
        if (!parent) return `Không tìm thấy node cha ${op.parentId}`;
        if (!isContainer(parent.type)) return `${parent.type} không chứa được node con`;
        const fresh = normalizeTree(op.node, existing);
        parent.children = parent.children ?? [];
        const idx = typeof op.index === "number" ? Math.max(0, Math.min(op.index, parent.children.length)) : parent.children.length;
        parent.children.splice(idx, 0, fresh);
        touchedSet.add(fresh.id);
        touchedSet.add(parent.id);
        return null;
      }
      case "remove": {
        if (root.id === op.id) return "Không được xóa node gốc";
        const parent = findParent(root, op.id);
        if (!parent || !parent.children) return `Không tìm thấy node ${op.id}`;
        parent.children = parent.children.filter((c) => c.id !== op.id);
        touchedSet.add(parent.id);
        return null;
      }
    }
    return "Thao tác không hỗ trợ";
  }
}

/** Tập id đã dùng ngoài cây con đang bị thay thế (để tránh trùng id khi chuẩn hóa). */
function subtreeExclusive(root: UINode, subtreeId: string, existing: Set<string>): Set<string> {
  const sub = findNode(root, subtreeId);
  const out = new Set(existing);
  if (sub) for (const id of collectIds(sub)) out.delete(id);
  return out;
}
