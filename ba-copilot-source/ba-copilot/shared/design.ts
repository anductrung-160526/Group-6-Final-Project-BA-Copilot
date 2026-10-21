// Mô hình thiết kế màn hình: component tree JSON.
// Mỗi node có id ổn định để có thể khoanh vùng, bình luận và sửa đúng phần tử.

export type Props = Record<string, unknown>;

export interface UINode {
  id: string;
  type: ComponentType;
  props: Props;
  children?: UINode[];
}

export const CONTAINER_TYPES = [
  "Page",
  "Header",
  "Sidebar",
  "Section",
  "Card",
  "Row",
  "Column",
  "Form",
  "List",
  "Modal",
] as const;

export const LEAF_TYPES = [
  "Heading",
  "Text",
  "Button",
  "Link",
  "Input",
  "Textarea",
  "Select",
  "Checkbox",
  "Radio",
  "DatePicker",
  "Table",
  "Image",
  "Badge",
  "Alert",
  "Stat",
  "Avatar",
  "Divider",
  "Pagination",
] as const;

export type ComponentType = (typeof CONTAINER_TYPES)[number] | (typeof LEAF_TYPES)[number];

export const ALL_TYPES: readonly string[] = [...CONTAINER_TYPES, ...LEAF_TYPES];

export function isContainer(type: string): boolean {
  return (CONTAINER_TYPES as readonly string[]).includes(type);
}

/** Mô tả props của từng component – dùng trong prompt AI và tài liệu luận án. */
export const COMPONENT_CATALOG: Record<ComponentType, string> = {
  Page: "Screen root. props: { title }",
  Header: "Page header bar. props: { title? }",
  Sidebar: "Side navigation bar. props: {}",
  Section: "Titled content group. props: { title? }",
  Card: "Card container. props: { title? }",
  Row: "Lays out children horizontally. props: { gap?: number, align?: 'start'|'center'|'end'|'between' }",
  Column: "Lays out children vertically. props: { gap?: number, width?: 'auto'|'1/3'|'1/2'|'2/3'|'full' }",
  Form: "Form. props: { title?, submitAction? }",
  List: "Repeating list. props: { title? }",
  Modal: "Dialog. props: { title, open?: boolean }",
  Heading: "Heading. props: { text, level?: 1|2|3 }",
  Text: "Paragraph. props: { text, tone?: 'default'|'muted' }",
  Button: "Button. props: { label, variant?: 'primary'|'secondary'|'danger'|'ghost', action?: string, navigateTo?: string }",
  Link: "Link. props: { text, navigateTo? }",
  Input: "Text input. props: { label, name?, placeholder?, inputType?: 'text'|'email'|'password'|'number'|'tel', required?: boolean, minLength?, maxLength?, min?, max?, pattern? }",
  Textarea: "Multi-line text input. props: { label, name?, placeholder?, required?, maxLength? }",
  Select: "Drop-down list. props: { label, name?, options: string[], required? }",
  Checkbox: "Checkbox. props: { label, name? }",
  Radio: "Radio button group. props: { label, name?, options: string[], required? }",
  DatePicker: "Date picker. props: { label, name?, required? }",
  Table: "Data table. props: { columns: string[], rows?: string[][], rowActions?: string[] }",
  Image: "Illustration image. props: { alt, height?: number }",
  Badge: "Status badge. props: { text, tone?: 'info'|'success'|'warning'|'danger' }",
  Alert: "Alert message. props: { text, tone?: 'info'|'success'|'warning'|'danger' }",
  Stat: "Metric. props: { label, value }",
  Avatar: "Avatar. props: { name }",
  Divider: "Divider line. props: {}",
  Pagination: "Pagination. props: { pages?: number }",
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

let idCounter = 0;
export function newId(prefix = "n"): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}${idCounter.toString(36)}`;
}

/**
 * Chuẩn hóa cây do AI trả về: bổ sung id thiếu, loại id trùng, ép props thành object,
 * bỏ children của leaf. Không thay đổi id đã hợp lệ (để giữ ổn định giữa các phiên bản).
 */
export function normalizeTree(input: unknown, seen: Set<string> = new Set()): UINode {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  let id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newId();
  if (seen.has(id)) id = newId();
  seen.add(id);
  const type = String(raw.type ?? "Text") as ComponentType;
  const props = raw.props && typeof raw.props === "object" && !Array.isArray(raw.props) ? { ...(raw.props as Props) } : {};
  const node: UINode = { id, type, props };
  if (isContainer(type)) {
    const kids = Array.isArray(raw.children) ? raw.children : [];
    node.children = kids.map((c) => normalizeTree(c, seen));
  }
  return node;
}

export function validateTree(root: UINode): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (root.type !== "Page") errors.push(`The root node must be a Page (currently ${root.type})`);
  walk(root, (n, parent) => {
    if (!n.id) errors.push("A node is missing its id");
    if (ids.has(n.id)) errors.push(`Duplicate id: ${n.id}`);
    ids.add(n.id);
    if (!ALL_TYPES.includes(n.type)) errors.push(`Unsupported component type: ${n.type} (id ${n.id})`);
    if (!isContainer(n.type) && n.children && n.children.length) errors.push(`${n.type} (id ${n.id}) cannot have children`);
    if (n.type === "Page" && parent) errors.push(`Page can only be the root node (id ${n.id})`);
    const p = n.props ?? {};
    const needText = ["Heading", "Text", "Badge", "Alert", "Link"];
    if (needText.includes(n.type) && typeof p.text !== "string") errors.push(`${n.type} (id ${n.id}) is missing props.text`);
    const needLabel = ["Button", "Input", "Textarea", "Select", "Checkbox", "Radio", "DatePicker", "Stat"];
    if (needLabel.includes(n.type) && typeof p.label !== "string") errors.push(`${n.type} (id ${n.id}) is missing props.label`);
    if ((n.type === "Select" || n.type === "Radio") && !Array.isArray(p.options)) errors.push(`${n.type} (id ${n.id}) is missing props.options`);
    if (n.type === "Table" && !Array.isArray(p.columns)) errors.push(`Table (id ${n.id}) is missing props.columns`);
  });
  return { ok: errors.length === 0, errors };
}

export function walk(root: UINode, fn: (n: UINode, parent: UINode | null, depth: number) => void, parent: UINode | null = null, depth = 0): void {
  fn(root, parent, depth);
  for (const c of root.children ?? []) walk(c, fn, root, depth + 1);
}

export function findNode(root: UINode, id: string): UINode | null {
  let found: UINode | null = null;
  walk(root, (n) => {
    if (!found && n.id === id) found = n;
  });
  return found;
}

export function findParent(root: UINode, id: string): UINode | null {
  let found: UINode | null = null;
  walk(root, (n, parent) => {
    if (!found && n.id === id) found = parent;
  });
  return found;
}

export function collectIds(root: UINode): string[] {
  const out: string[] = [];
  walk(root, (n) => out.push(n.id));
  return out;
}

export function cloneTree<T>(t: T): T {
  return JSON.parse(JSON.stringify(t));
}

/** Nhãn ngắn gọn của một node để hiển thị và đưa vào prompt. */
export function nodeLabel(n: UINode): string {
  const p = n.props ?? {};
  const txt = (p.label ?? p.text ?? p.title ?? p.alt ?? p.name ?? "") as string;
  return txt ? `${n.type} "${String(txt).slice(0, 40)}"` : n.type;
}

/** Bỏ các node có tổ tiên cũng nằm trong danh sách (giữ node cao nhất của vùng). */
export function topMostIds(root: UINode, ids: string[]): string[] {
  const set = new Set(ids);
  const result: string[] = [];
  const visit = (n: UINode, covered: boolean) => {
    const isSel = set.has(n.id);
    if (isSel && !covered) result.push(n.id);
    for (const c of n.children ?? []) visit(c, covered || isSel);
  };
  visit(root, false);
  return result;
}

/** Tập id được phép sửa khi khoanh vùng: các node được chọn + toàn bộ con cháu. */
export function regionIds(root: UINode, selected: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const id of selected) {
    const n = findNode(root, id);
    if (n) walk(n, (d) => allowed.add(d.id));
  }
  return allowed;
}

export interface TreeDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/** So sánh hai phiên bản: node thêm, xóa, đổi props hoặc đổi thứ tự con. */
export function diffTrees(a: UINode, b: UINode): TreeDiff {
  const mapA = new Map<string, UINode>();
  const mapB = new Map<string, UINode>();
  walk(a, (n) => mapA.set(n.id, n));
  walk(b, (n) => mapB.set(n.id, n));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [id, nb] of mapB) {
    const na = mapA.get(id);
    if (!na) added.push(id);
    else {
      const propsDiff = JSON.stringify(na.props) !== JSON.stringify(nb.props) || na.type !== nb.type;
      const kidsA = (na.children ?? []).map((c) => c.id).join(",");
      const kidsB = (nb.children ?? []).map((c) => c.id).join(",");
      if (propsDiff || kidsA !== kidsB) changed.push(id);
    }
  }
  for (const id of mapA.keys()) if (!mapB.has(id)) removed.push(id);
  return { added, removed, changed };
}

/** Bản rút gọn cây (cho prompt) – bỏ rows dữ liệu mẫu dài. */
export function compactTree(n: UINode): unknown {
  const props = { ...n.props };
  if (Array.isArray(props.rows) && props.rows.length > 2) props.rows = (props.rows as unknown[]).slice(0, 2);
  const out: Record<string, unknown> = { id: n.id, type: n.type, props };
  if (n.children) out.children = n.children.map(compactTree);
  return out;
}

/**
 * Chỉ số các cột dữ liệu cần vẽ của một Table. Có `rowActions` thì cột thao tác do bộ vẽ tự thêm ("Actions"),
 * nên cột tên "Actions" / "Thao tác" đã ghi sẵn trong `columns` (mock, dữ liệu cũ) bị bỏ để không ra hai cột "Actions".
 */
export function tableDataColumns(columns: string[], rowActions: string[]): number[] {
  const idx = columns.map((_, i) => i);
  if (!rowActions.length) return idx;
  return idx.filter((i) => !/^(?:actions?|thao tác)$/iu.test(columns[i].trim())); // vi-keep: cột "Thao tác" của bảng cũ
}
