// Sơ đồ theo bước Context → UC → Sequence → BPMN → ERD (kế hoạch đợt 5, mục 3 "C6"). Chủ sở hữu: C6.
// Hàm thuần dùng chung cho server (bản AI + bản Mock, kiểm tra trước khi lưu), client (màn Sơ đồ, tải .md) và test:
// - dựng mã Mermaid từ dữ liệu có cấu trúc (AI chỉ trả cấu trúc, mã do hàm ở đây dựng nên luôn đúng cú pháp);
// - kiểm tra cú pháp cơ bản (không thay cho mermaid.parse thật ở client) và báo theo số dòng;
// - xuất Markdown (khối ```mermaid) để tải về / đẩy lên GitHub.

import { DIAGRAM_KIND_LABEL, DOC_KIND_LABEL, type ArtifactStatus, type DiagramKind, type DiagramPart, type DocKind } from "./types.ts";

// ---------------------------------------------------------------- quy ước chung

/** Tài liệu nguồn của từng loại sơ đồ. Sinh sơ đồ cần mọi nguồn ở trạng thái Xong / Đã duyệt (quyết định 8). */
export const DIAGRAM_SOURCES: Record<DiagramKind, DocKind[]> = {
  CONTEXT: ["BRD"],
  UC: ["UC_SPEC"],
  SEQUENCE: ["UC_SPEC"],
  BPMN: ["BRD", "UC_SPEC"],
  ERD: ["SRS", "FRD_NFR"],
};

const STATUS_LABEL: Record<ArtifactStatus, string> = { none: "Not started", draft: "Draft", done: "Done", approved: "Approved", outdated: "Outdated" };

/**
 * Lý do chưa sinh được loại sơ đồ: tài liệu nguồn chưa Xong / Đã duyệt (quyết định 8). null = sinh được.
 * Server chặn bằng lý do này; màn Sơ đồ hiện đúng câu này cạnh nút Sinh bằng AI đang khoá.
 */
export function diagramBlockReason(kind: DiagramKind, statusOf: (doc: DocKind) => ArtifactStatus | undefined): string | null {
  const missing = DIAGRAM_SOURCES[kind].filter((k) => {
    const s = statusOf(k);
    return s !== "done" && s !== "approved";
  });
  if (!missing.length) return null;
  const list = missing.map((k) => `${DOC_KIND_LABEL[k]} (current: ${STATUS_LABEL[statusOf(k) ?? "none"]})`).join(", ");
  return `Source document ${list} must be Done before generating the ${DIAGRAM_KIND_LABEL[kind]} diagram`;
}

/** Loại cú pháp Mermaid mà mỗi sơ đồ phải dùng. */
export type MermaidSyntax = "flowchart" | "sequence" | "er";
export const DIAGRAM_SYNTAX: Record<DiagramKind, MermaidSyntax> = {
  CONTEXT: "flowchart",
  UC: "flowchart",
  SEQUENCE: "sequence",
  BPMN: "flowchart",
  ERD: "er",
};
const SYNTAX_HEAD: Record<MermaidSyntax, string> = { flowchart: '"flowchart LR" (or TB/TD/RL/BT)', sequence: '"sequenceDiagram"', er: '"erDiagram"' };

/** Mô tả ngắn hiện trên màn cho từng loại. */
export const DIAGRAM_HINT: Record<DiagramKind, string> = {
  CONTEXT: "The system in the centre, surrounded by actors and external systems; arrows are data flows. Generated from the BRD.",
  UC: "Actors (circles) and use cases (ellipses) inside the system boundary, with «include»/«extend» relationships. Generated from the UC Specification.",
  SEQUENCE: "One sequence diagram per use case: actor → user interface → API server → database. Generated from the UC Specification.",
  BPMN: "Business process: one lane per actor, start/end events (circles), tasks (rounded rectangles), gateways (diamonds). Generated from the BRD + UC Specification.",
  ERD: "Entities, key attributes and data relationships. Generated from the SRS + FRD-NFR.",
};

/** Chú thích bắt buộc trên màn BPMN (quyết định 7). */
export const BPMN_NOTE = "BPMN simulated with Mermaid";

/** Tên tệp của sơ đồ trong repo GitHub: `<module>/diagrams/<tên>.md` (kế hoạch mục 3 "C8"). */
export const DIAGRAM_FILE: Record<DiagramKind, string> = {
  CONTEXT: "context.md",
  UC: "use-case.md",
  SEQUENCE: "sequence.md",
  BPMN: "bpmn.md",
  ERD: "erd.md",
};

export const MAX_DIAGRAM_CODE = 100_000;
export const MAX_DIAGRAM_PARTS = 100;

// ---------------------------------------------------------------- nhãn và mã định danh an toàn

/** Nhãn an toàn trong chuỗi "…" của Mermaid: bỏ ngoặc kép, dấu #, ;, xuống dòng, ký tự HTML. */
export function mmLabel(s: unknown, max = 80): string {
  const t = String(s ?? "")
    .replace(/["`]/g, "'")
    .replace(/[<>#;]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** Chữ trong sơ đồ tuần tự (không ngoặc kép): bỏ thêm dấu hai chấm và dấu phẩy ở tên tham gia. */
export function seqText(s: unknown, max = 90): string {
  return mmLabel(s, max).replace(/:/g, " ").replace(/\s+/g, " ").trim();
}

/** Bỏ dấu tiếng Việt → chữ ASCII (đ → d). */
export function stripAccents(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d") // vi-keep: bỏ dấu tiếng Việt khi dựng mã ASCII (dữ liệu cũ tiếng Việt)
    .replace(/Đ/g, "D"); // vi-keep: bỏ dấu tiếng Việt khi dựng mã ASCII
}

/** Mã định danh ASCII: "Đơn hàng" → "DON_HANG" (upper) / "don_hang". Rỗng → fallback. */
export function asciiId(s: string, fallback = "X", upper = true): string {
  const t = stripAccents(s)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const out = upper ? t.toUpperCase() : t.toLowerCase();
  if (!out) return fallback;
  return /^[0-9]/.test(out) ? `${upper ? "E" : "f"}_${out}` : out;
}

/** Cấp mã không trùng: unique("A") → "A", "A_2", … */
function idAllocator() {
  const used = new Set<string>();
  return (base: string) => {
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}_${i}`;
    used.add(id);
    return id;
  };
}

const norm = (s: string) => mmLabel(s, 200).toLowerCase();

// ---------------------------------------------------------------- Context

export interface ContextExternal {
  name: string;
  /** actor = con người / tổ chức; system = hệ thống ngoài. */
  kind: "actor" | "system";
}
export interface ContextFlow {
  /** Tên tác nhân/hệ thống ngoài, hoặc "SYSTEM" (hệ thống đang phân tích). */
  from: string;
  to: string;
  label: string;
}
export interface ContextInput {
  system: string;
  externals: ContextExternal[];
  flows: ContextFlow[];
}

export const CONTEXT_SYSTEM = "SYSTEM";

/** Sơ đồ ngữ cảnh: hệ thống (hình tròn) ở giữa, tác nhân (chữ nhật bo) và hệ thống ngoài (hình hộp kép), luồng dữ liệu có nhãn. */
export function buildContextMermaid(input: ContextInput): string {
  const lines = ["flowchart LR", "  %% diagram: CONTEXT – system in the centre, actors (rounded rectangles), external systems (double boxes)"];
  lines.push(`  SYS(("${mmLabel(input.system || "System", 60)}"))`);
  const ids = new Map<string, string>();
  const seen = new Set<string>();
  let a = 0;
  let s = 0;
  for (const e of input.externals ?? []) {
    const name = mmLabel(e?.name, 50);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const id = e.kind === "system" ? `EXT${++s}` : `ACT${++a}`;
    ids.set(name.toLowerCase(), id);
    lines.push(e.kind === "system" ? `  ${id}[["${name}"]]` : `  ${id}("${name}")`);
  }
  const ref = (x: string) => {
    const k = mmLabel(x, 50).toLowerCase();
    if (!k || k === CONTEXT_SYSTEM.toLowerCase() || k === norm(input.system)) return "SYS";
    return ids.get(k);
  };
  for (const f of input.flows ?? []) {
    const from = ref(f.from);
    const to = ref(f.to);
    if (!from || !to || from === to) continue;
    const label = mmLabel(f.label, 50);
    lines.push(label ? `  ${from} -->|"${label}"| ${to}` : `  ${from} --> ${to}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- BPMN (mô phỏng bằng flowchart)

export type BpmnNodeType = "start" | "end" | "task" | "gateway";
export interface BpmnNode {
  id: string;
  lane: string;
  type: BpmnNodeType;
  label: string;
}
export interface BpmnEdge {
  from: string;
  to: string;
  label?: string;
}
export interface BpmnInput {
  lanes: string[];
  nodes: BpmnNode[];
  edges: BpmnEdge[];
}

/**
 * BPMN mô phỏng: mỗi làn một subgraph (theo tác nhân), sự kiện bắt đầu = hình tròn, kết thúc = hình tròn kép,
 * công việc = chữ nhật bo, cổng rẽ nhánh = hình thoi. Node thuộc làn không khai báo thì thêm làn mới.
 */
export function buildBpmnMermaid(input: BpmnInput): string {
  const lines = ["flowchart LR", `  %% ${BPMN_NOTE}: lane = subgraph, event = circle, task = rounded rectangle, gateway = diamond`];
  const lanes: string[] = [];
  const laneKey = (l: string) => mmLabel(l, 50) || "Process";
  for (const l of [...(input.lanes ?? []), ...(input.nodes ?? []).map((n) => n.lane)]) {
    const k = laneKey(l);
    if (!lanes.some((x) => x.toLowerCase() === k.toLowerCase())) lanes.push(k);
  }
  const nodeId = new Map<string, string>();
  (input.nodes ?? []).forEach((n, i) => {
    if (n && n.id && !nodeId.has(String(n.id))) nodeId.set(String(n.id), `N${i + 1}`);
  });
  const shape = (n: BpmnNode) => {
    const label = mmLabel(n.label, 60) || (n.type === "start" ? "Start" : n.type === "end" ? "End" : "Task");
    switch (n.type) {
      case "start":
        return `(("${label}"))`;
      case "end":
        return `((("${label}")))`;
      case "gateway":
        return `{"${label}"}`;
      default:
        return `("${label}")`;
    }
  };
  lanes.forEach((lane, i) => {
    const nodes = (input.nodes ?? []).filter((n) => n && nodeId.get(String(n.id)) && laneKey(n.lane).toLowerCase() === lane.toLowerCase());
    lines.push(`  subgraph L${i + 1}["${lane}"]`, "    direction LR");
    if (!nodes.length) lines.push(`    L${i + 1}_EMPTY[" "]`);
    const emitted = new Set<string>();
    for (const n of nodes) {
      const id = nodeId.get(String(n.id))!;
      if (emitted.has(id)) continue;
      emitted.add(id);
      lines.push(`    ${id}${shape(n)}`);
    }
    lines.push("  end");
  });
  for (const e of input.edges ?? []) {
    const from = nodeId.get(String(e?.from));
    const to = nodeId.get(String(e?.to));
    if (!from || !to) continue;
    const label = mmLabel(e.label, 40);
    lines.push(label ? `  ${from} -->|"${label}"| ${to}` : `  ${from} --> ${to}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- ERD

export interface ErdAttribute {
  name: string;
  type?: string;
  key?: "PK" | "FK" | "UK" | "";
  comment?: string;
}
export interface ErdEntity {
  name: string;
  /** Nhãn tiếng Việt hiển thị (alias). */
  label?: string;
  attributes: ErdAttribute[];
}
export type ErdCardinality = "1-1" | "1-n" | "n-n" | "1-0..1";
export interface ErdRelation {
  from: string;
  to: string;
  cardinality: ErdCardinality;
  label: string;
}
export interface ErdInput {
  entities: ErdEntity[];
  relations: ErdRelation[];
}

const CARD: Record<ErdCardinality, string> = { "1-1": "||--||", "1-n": "||--o{", "n-n": "}o--o{", "1-0..1": "||--o|" };
const ATTR_TYPES = new Set(["string", "text", "int", "bigint", "decimal", "float", "boolean", "date", "datetime", "timestamp", "uuid", "json"]);

/** erDiagram: thực thể (mã ASCII + nhãn tiếng Việt), thuộc tính (kiểu, tên, PK/FK/UK, chú thích), quan hệ. */
export function buildErdMermaid(input: ErdInput): string {
  const lines = ["erDiagram", "  %% diagram: ERD – entities, key attributes, relationships"];
  const alloc = idAllocator();
  const ids = new Map<string, string>();
  for (const e of input.entities ?? []) {
    if (!e?.name) continue;
    const key = norm(e.name);
    if (ids.has(key)) continue;
    const id = alloc(asciiId(e.name, "ENTITY"));
    ids.set(key, id);
    if (e.label) ids.set(norm(e.label), id);
    const label = mmLabel(e.label || e.name, 50);
    const attrs: string[] = [];
    const attrAlloc = idAllocator();
    for (const a of e.attributes ?? []) {
      if (!a?.name) continue;
      const type = ATTR_TYPES.has(String(a.type ?? "").toLowerCase()) ? String(a.type).toLowerCase() : "string";
      const name = attrAlloc(asciiId(a.name, "field", false));
      const key = a.key === "PK" || a.key === "FK" || a.key === "UK" ? ` ${a.key}` : "";
      const comment = mmLabel(a.comment, 50);
      attrs.push(`    ${type} ${name}${key}${comment ? ` "${comment}"` : ""}`);
    }
    if (attrs.length) lines.push(`  ${id}["${label}"] {`, ...attrs, "  }");
    else lines.push(`  ${id}["${label}"]`);
  }
  const seen = new Set<string>();
  for (const r of input.relations ?? []) {
    const from = ids.get(norm(r?.from ?? ""));
    const to = ids.get(norm(r?.to ?? ""));
    if (!from || !to) continue;
    const k = `${from}|${to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push(`  ${from} ${CARD[r.cardinality] ?? CARD["1-n"]} ${to} : "${mmLabel(r.label, 40) || "has"}"`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- Sequence

export interface SeqParticipant {
  id: string;
  label: string;
  actor?: boolean;
}
export interface SeqMessage {
  from: string;
  to: string;
  text: string;
  /** true = phản hồi (nét đứt -->>). */
  reply?: boolean;
}
export interface SeqAlt {
  condition: string;
  messages: SeqMessage[];
}
export interface SequenceInput {
  participants: SeqParticipant[];
  messages: SeqMessage[];
  /** Các nhánh ngoại lệ: một khối alt, mỗi phần tử là một nhánh (alt … else … end). */
  alts?: SeqAlt[];
}

/** Sơ đồ tuần tự có autonumber. Mã tham gia lạ trong tin nhắn được tự khai báo thêm. */
export function buildSequenceMermaid(input: SequenceInput): string {
  const lines = ["sequenceDiagram", "  autonumber"];
  const alloc = idAllocator();
  const ids = new Map<string, string>();
  const declare = (p: SeqParticipant) => {
    const key = String(p.id ?? "").trim().toLowerCase();
    if (!key || ids.has(key)) return;
    const id = alloc(asciiId(p.id, "P"));
    ids.set(key, id);
    const label = seqText(p.label || p.id, 50) || id;
    lines.push(`  ${p.actor ? "actor" : "participant"} ${id} as ${label}`);
  };
  (input.participants ?? []).forEach(declare);
  const all = [...(input.messages ?? []), ...(input.alts ?? []).flatMap((a) => a.messages ?? [])];
  for (const m of all) for (const x of [m?.from, m?.to]) if (x) declare({ id: String(x), label: String(x) });
  const msg = (m: SeqMessage, indent: string) => {
    const from = ids.get(String(m?.from ?? "").trim().toLowerCase());
    const to = ids.get(String(m?.to ?? "").trim().toLowerCase());
    if (!from || !to) return;
    lines.push(`${indent}${from}${m.reply ? "-->>" : "->>"}${to}: ${seqText(m.text) || "…"}`);
  };
  for (const m of input.messages ?? []) msg(m, "  ");
  const alts = (input.alts ?? []).filter((a) => a && (a.messages ?? []).length);
  alts.forEach((a, i) => {
    lines.push(`  ${i === 0 ? "alt" : "else"} ${seqText(a.condition, 60) || "Exception"}`);
    for (const m of a.messages) msg(m, "    ");
  });
  if (alts.length) lines.push("  end");
  return lines.join("\n");
}

// ---------------------------------------------------------------- kiểm tra cú pháp cơ bản

export interface MermaidIssue {
  /** Số dòng (bắt đầu từ 1); 0 = cả sơ đồ. */
  line: number;
  message: string;
}

const HEADS: [RegExp, MermaidSyntax][] = [
  [/^(flowchart|graph)(\s+(LR|RL|TB|TD|BT))?\s*;?$/, "flowchart"],
  [/^sequenceDiagram\s*$/, "sequence"],
  [/^erDiagram\s*$/, "er"],
];
const isSkippable = (l: string) => !l || l.startsWith("%%");

/** Loại cú pháp theo dòng khai báo đầu tiên; null nếu không nhận ra. */
export function detectSyntax(code: string): MermaidSyntax | null {
  const first = String(code ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => !isSkippable(l));
  if (!first) return null;
  return HEADS.find(([re]) => re.test(first))?.[1] ?? null;
}

/** Bỏ chuỗi "…" để đếm ngoặc; trả null nếu ngoặc kép lẻ. */
function stripQuoted(l: string): string | null {
  if ((l.match(/"/g) ?? []).length % 2) return null;
  return l.replace(/"[^"]*"/g, '""');
}

function bracketIssue(l: string): string | null {
  // Hình bất đối xứng `id>nhãn]` mở bằng ">" ngay sau chữ → coi như "[".
  const s = l.replace(/(\w)>(?=["\w])/g, "$1[");
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (ch in pairs) {
      if (stack.pop() !== pairs[ch]) return `Unmatched bracket "${ch}"`;
    }
  }
  return stack.length ? `Missing closing bracket for "${stack[stack.length - 1]}"` : null;
}

function checkFlowchart(rows: { n: number; l: string }[], issues: MermaidIssue[]) {
  let depth = 0;
  for (const { n, l } of rows) {
    if (/^subgraph\b/.test(l)) depth++;
    else if (l === "end") {
      depth--;
      if (depth < 0) {
        issues.push({ line: n, message: 'Extra "end" (no matching subgraph)' });
        depth = 0;
      }
      continue;
    }
    const q = stripQuoted(l);
    if (q === null) {
      issues.push({ line: n, message: "Missing closing double quote" });
      continue;
    }
    if (/^(classDef|class|style|linkStyle|click|direction)\b/.test(l)) continue;
    const b = bracketIssue(q);
    if (b) issues.push({ line: n, message: b });
  }
  if (depth > 0) issues.push({ line: rows[rows.length - 1]?.n ?? 0, message: 'Missing "end" for subgraph block' });
}

const SEQ_BLOCK = /^(alt|opt|loop|par|critical|break|rect|box)\b/;
const SEQ_ARROW = /(-{1,2}(>>|>|x|\))[+-]?)/;
const SEQ_MESSAGE = /^[^\s:][^:]*?\s*-{1,2}(>>|>|x|\))[+-]?\s*[^\s:][^:]*:.*$/;

function checkSequence(rows: { n: number; l: string }[], issues: MermaidIssue[]) {
  let depth = 0;
  for (const { n, l } of rows) {
    if (SEQ_BLOCK.test(l)) {
      depth++;
      continue;
    }
    if (l === "end") {
      depth--;
      if (depth < 0) {
        issues.push({ line: n, message: 'Extra "end" (no matching alt/opt/loop block)' });
        depth = 0;
      }
      continue;
    }
    if (/^(else|and|option)\b/.test(l)) {
      if (depth === 0) issues.push({ line: n, message: `"${l.split(/\s/)[0]}" is outside an alt/par block` });
      continue;
    }
    if (/^(participant|actor|autonumber|title|note|activate|deactivate|create|destroy|links?|properties|details|accTitle|accDescr)\b/i.test(l)) continue;
    if (SEQ_ARROW.test(l) && !SEQ_MESSAGE.test(l)) issues.push({ line: n, message: 'Invalid message syntax – expected "A->>B: text"' });
  }
  if (depth > 0) issues.push({ line: rows[rows.length - 1]?.n ?? 0, message: 'Missing "end" for alt/opt/loop block' });
}

const ER_ENTITY = String.raw`[A-Za-z_][\w-]*(\[("[^"]*"|[^\]"]*)\])?`;
const ER_OPEN = new RegExp(`^${ER_ENTITY}\\s*\\{$`);
const ER_ALONE = new RegExp(`^${ER_ENTITY}$`);
const ER_REL = new RegExp(`^${ER_ENTITY}\\s+(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s+${ER_ENTITY}\\s*:\\s*("[^"]*"|[\\w-]+)$`);
const ER_ATTR = /^[A-Za-z_][\w()[\],-]*\s+\*?[A-Za-z_][\w-]*(\s+(PK|FK|UK)(\s*,\s*(PK|FK|UK))*)?(\s+"[^"]*")?$/;

function checkEr(rows: { n: number; l: string }[], issues: MermaidIssue[]) {
  let inBlock = 0;
  for (const { n, l } of rows) {
    if (inBlock) {
      if (l === "}") inBlock = 0;
      else if (!ER_ATTR.test(l)) issues.push({ line: n, message: 'Invalid attribute syntax – expected "type field_name PK "comment""' });
      continue;
    }
    if (ER_OPEN.test(l)) {
      inBlock = n;
      continue;
    }
    if (l === "}") {
      issues.push({ line: n, message: 'Extra "}"' });
      continue;
    }
    if (ER_REL.test(l) || ER_ALONE.test(l)) continue;
    if (/^(title|direction|classDef|class|style|accTitle|accDescr)\b/.test(l)) continue;
    issues.push({ line: n, message: 'Invalid line – expected an entity "NAME {", an attribute or a relationship "A ||--o{ B : label"' });
  }
  if (inBlock) issues.push({ line: inBlock, message: 'Missing "}" to close the entity block' });
}

/**
 * Kiểm tra cú pháp cơ bản của mã Mermaid. `expect` = loại cú pháp bắt buộc (theo loại sơ đồ).
 * Trả danh sách lỗi theo dòng; rỗng = hợp lệ ở mức cơ bản.
 */
export function checkMermaid(code: string, expect?: MermaidSyntax): MermaidIssue[] {
  const all = String(code ?? "").split(/\r?\n/);
  const rows = all.map((l, i) => ({ n: i + 1, l: l.trim() })).filter((r) => !isSkippable(r.l));
  if (!rows.length) return [{ line: 0, message: "Diagram code is empty" }];
  const head = rows[0];
  const syntax = HEADS.find(([re]) => re.test(head.l))?.[1] ?? null;
  if (!syntax) return [{ line: head.n, message: `The first line must be ${expect ? SYNTAX_HEAD[expect] : "a Mermaid diagram type (flowchart, sequenceDiagram, erDiagram)"}` }];
  if (expect && syntax !== expect) return [{ line: head.n, message: `This diagram must start with ${SYNTAX_HEAD[expect]}` }];
  const issues: MermaidIssue[] = [];
  const body = rows.slice(1);
  if (syntax === "flowchart") checkFlowchart(body, issues);
  else if (syntax === "sequence") checkSequence(body, issues);
  else checkEr(body, issues);
  return issues;
}

export const issueText = (i: MermaidIssue) => (i.line ? `Line ${i.line}: ${i.message}` : i.message);

/**
 * Kiểm tra một sơ đồ trước khi lưu. SEQUENCE: `code` để trống, cần ≥ 1 phần, mỗi phần có `key` và mã sequenceDiagram hợp lệ.
 * Loại khác: `code` bắt buộc, đúng loại cú pháp. Trả danh sách lỗi (chuỗi tiếng Việt, có số dòng).
 */
export function checkDiagram(kind: DiagramKind, d: { code?: string; parts?: DiagramPart[] }): string[] {
  if (kind === "SEQUENCE") {
    const parts = d.parts ?? [];
    if (!parts.length) return ["A Sequence diagram needs at least one part (one part per use case)"];
    const out: string[] = [];
    const keys = new Set<string>();
    parts.forEach((p, i) => {
      const name = p.key || `Part ${i + 1}`;
      if (!p.key) out.push(`Part ${i + 1}: missing key`);
      else if (keys.has(p.key)) out.push(`${name}: duplicate part key`);
      keys.add(p.key);
      for (const e of checkMermaid(p.code, "sequence")) out.push(`${name} – ${issueText(e)}`);
    });
    return out;
  }
  return checkMermaid(d.code ?? "", DIAGRAM_SYNTAX[kind]).map(issueText);
}

/** Chuẩn hoá danh sách phần client gửi: chỉ giữ key/title/code dạng chuỗi. */
export function normalizeParts(raw: unknown): DiagramPart[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_DIAGRAM_PARTS).map((p: any) => ({
    key: String(p?.key ?? "").trim().slice(0, 60),
    title: String(p?.title ?? p?.key ?? "").trim().slice(0, 200),
    code: String(p?.code ?? "").slice(0, MAX_DIAGRAM_CODE),
  }));
}

// ---------------------------------------------------------------- Markdown

/** Markdown của một sơ đồ (khối ```mermaid). Dùng cho nút tải .md và cho bản đẩy GitHub. */
export function diagramMarkdown(d: { kind: DiagramKind; code: string; parts?: DiagramPart[] }, moduleName = ""): string {
  const title = `# ${DIAGRAM_KIND_LABEL[d.kind]} Diagram${moduleName ? ` – ${moduleName}` : ""}`;
  const out = [title, ""];
  if (d.kind === "BPMN") out.push(`> ${BPMN_NOTE}: lane = actor, circle = start/end event, rounded rectangle = task, diamond = gateway.`, "");
  const block = (code: string) => ["```mermaid", code.trim(), "```", ""];
  if (d.kind === "SEQUENCE") {
    for (const p of d.parts ?? []) out.push(`## ${p.title || p.key}`, "", ...block(p.code));
    if (!(d.parts ?? []).length) out.push("_No diagram yet._", "");
  } else if (d.code.trim()) out.push(...block(d.code));
  else out.push("_No diagram yet._", "");
  return out.join("\n");
}
