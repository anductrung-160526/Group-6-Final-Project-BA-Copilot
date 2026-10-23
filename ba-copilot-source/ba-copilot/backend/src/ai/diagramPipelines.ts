// Pipeline AI sinh 5 loại sơ đồ (kế hoạch đợt 5, mục 3 "C6"). Chủ sở hữu: C6.
// Mỗi loại có bản Claude (tool use: AI chỉ trả cấu trúc – tác nhân, luồng, node, thực thể…) và bản Mock rule-based
// chạy khi không có ANTHROPIC_API_KEY. Mã Mermaid luôn do hàm dựng trong shared/diagrams.ts tạo ra nên đúng cú pháp.
//   CONTEXT ← BRD · UC ← UC Spec · SEQUENCE ← từng UC · BPMN ← BRD + UC · ERD ← SRS + FRD-NFR
// Đợt 6 (D4): nhãn sinh ra bằng tiếng Anh; bộ nhận diện từ khoá giữ tiếng Việt (dữ liệu cũ) và thêm tiếng Anh song song.

import type { DiagramKind, DiagramPart, Requirement, UseCase } from "../../../shared/types.ts";
import {
  buildBpmnMermaid,
  buildContextMermaid,
  buildErdMermaid,
  buildSequenceMermaid,
  checkDiagram,
  CONTEXT_SYSTEM,
  mmLabel,
  type BpmnInput,
  type BpmnNode,
  type ContextInput,
  type ErdEntity,
  type ErdInput,
  type ErdRelation,
  type SequenceInput,
  type SeqMessage,
} from "../../../shared/diagrams.ts";
import { buildUcMermaid, type UcRelation } from "../../../shared/ucDiagram.ts";
import { runAI } from "./client.ts";

/** Dữ liệu nguồn của module (route đọc thẳng các bảng module_docs, user_stories, screens). */
export interface DiagramSources {
  moduleId: string;
  moduleName: string;
  projectName: string;
  /** Markdown BRD. */
  brd: string;
  useCases: UseCase[];
  requirements: Requirement[];
  /** Markdown SRS. */
  srs: string;
  stories: { code: string; asA: string; iWant: string; soThat: string }[];
  /** screenId → tên màn (cho sơ đồ tuần tự). */
  screenNames: Record<string, string>;
}

export interface DiagramResult {
  code: string;
  parts: DiagramPart[];
}

const SYSTEM = `You are a Senior Business Analyst / Solution Architect in the BA Copilot system, drawing business analysis diagrams.
Principles:
- Write ALL labels in English, short (about 6–8 words per label at most).
- Rely only on the input data; do not invent actors, systems or entities without evidence.
- Labels must not contain the characters " ; # : < >.
- Always return the result by calling exactly the requested tool.`;

// ---------------------------------------------------------------- tiện ích chung
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "\n…(truncated)" : s);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const short = (s: string, n = 40) => mmLabel(s, n);
const key = (s: string) => mmLabel(s, 200).toLowerCase();
const SYSTEM_ACTOR = /^(?:hệ thống|system|the system)$/i; // vi-keep: actor "Hệ thống" trong UC cũ
const SYSTEM_LANE = "System";

function uniq(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const v = mmLabel(n, 50);
    if (!v || SYSTEM_ACTOR.test(v) || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

const storyLines = (src: DiagramSources) => src.stories.map((s) => `- ${s.code}: As a ${s.asA}, I want ${s.iWant}${s.soThat ? `, so that ${s.soThat}` : ""}`).join("\n");
const ucCompact = (ucs: UseCase[]) =>
  JSON.stringify(
    ucs.map((u) => ({
      code: u.code,
      name: u.name,
      actors: u.actors,
      mainFlow: (u.mainFlow ?? []).map((s) => `${s.actor}: ${s.text}`),
      altFlows: (u.altFlows ?? []).map((f) => f.name),
      exceptions: (u.exceptions ?? []).map((f) => ({ name: f.name, steps: f.steps })),
    })),
  );
const reqLines = (reqs: Requirement[]) => reqs.map((r) => `- ${r.code} (${r.type}): ${r.statement}`).join("\n");

// ---------------------------------------------------------------- đọc BRD (Markdown)

interface MdSection {
  heading: string;
  lines: string[];
}
export function mdSections(md: string): MdSection[] {
  const out: MdSection[] = [{ heading: "", lines: [] }];
  for (const raw of String(md ?? "").split(/\r?\n/)) {
    const h = raw.match(/^#{1,6}\s+(.*)$/);
    if (h) out.push({ heading: h[1].trim(), lines: [] });
    else out[out.length - 1].lines.push(raw);
  }
  return out;
}

// vi-keep-start: tiêu đề cột / mục BRD cũ tiếng Việt, song song tiếng Anh
const HEADER_CELL = /^(stt|#|tên|vai trò|bên liên quan|tác nhân|mô tả|hệ thống|ghi chú|actor|stakeholder|name|role|description|system|note|no\.?)$/i;
// vi-keep-end
/** Tên mục trong danh sách gạch đầu dòng / dòng bảng: phần trước ":" " – " "(" ; bỏ câu quá dài. */
export function listNames(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    let item = "";
    const li = l.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (li) item = li[1];
    else if (l.startsWith("|")) {
      const cells = l.split("|").map((c) => c.trim()).filter(Boolean);
      if (!cells.length || cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      item = cells.find((c) => !/^\d+$/.test(c)) ?? "";
      if (HEADER_CELL.test(item.replace(/\*/g, "").trim())) continue;
    } else continue;
    const name = item
      .replace(/\*\*|__|`/g, "")
      .split(/\s*[:(]\s*|\s+[–—-]\s+/)[0]
      .trim();
    if (name && name.length <= 50 && name.split(/\s+/).length <= 7) out.push(name);
  }
  return out;
}

// vi-keep-start: nhận diện mục BRD và hệ thống ngoài (BRD cũ tiếng Việt), song song tiếng Anh
const ACTOR_HEAD = /(bên liên quan|stakeholder|tác nhân|actor|người dùng|người sử dụng|đối tượng|vai trò|user|role)/i;
const EXTERNAL_HEAD = /(hệ thống (ngoài|bên ngoài|liên quan|liên kết|tích hợp)|tích hợp|external|giao tiếp|interface|kết nối|integration)/i;

/** Hệ thống ngoài nhận ra theo từ khoá: [mẫu, tên, luồng đi, luồng về]. */
const EXTERNAL_KEYWORDS: [RegExp, string, string, string][] = [
  [/thanh toán|payment|ví điện tử|e-wallet|vnpay|momo/i, "Payment gateway", "Payment request", "Payment result"],
  [/email|thư điện tử/i, "Email service", "Send notification email", "Delivery status"],
  [/\bsms\b|otp|tin nhắn|text message/i, "SMS/OTP service", "Send SMS / OTP", "Delivery status"],
  [/ngân hàng|\bbank/i, "Banking system", "Transaction order", "Transaction result"],
  [/\bsso\b|ldap|active directory|định danh|vneid|identity provider/i, "Authentication system (SSO)", "Authentication request", "Authentication result"],
  [/bản đồ|\bmap\b|định vị|gps|location/i, "Map service", "Location query", "Map data"],
  [/\berp\b/i, "ERP system", "Data synchronisation", "ERP data"],
  [/\bcrm\b/i, "CRM system", "Customer synchronisation", "Customer data"],
  [/hoá đơn điện tử|hóa đơn điện tử|thuế|e-invoice|\btax\b/i, "E-invoicing system", "Issue invoice", "Issuance result"],
  [/zalo/i, "Zalo OA", "Send Zalo message", "Delivery status"],
  [/vận chuyển|giao hàng|shipping|delivery|courier/i, "Shipping carrier", "Create shipment", "Delivery status"],
];
// vi-keep-end

/** Tác nhân: mục BRD về bên liên quan/tác nhân → actor của UC → vai trò trong user story. */
export function sourceActors(src: DiagramSources): string[] {
  const fromBrd: string[] = [];
  for (const s of mdSections(src.brd)) if (ACTOR_HEAD.test(s.heading) && !EXTERNAL_HEAD.test(s.heading)) fromBrd.push(...listNames(s.lines));
  const fromUc = src.useCases.flatMap((u) => u.actors ?? []);
  const fromStories = src.stories.map((s) => cap(s.asA.replace(/^(một|a|an)\s+/i, "").trim())); // vi-keep: mạo từ "một" của story cũ
  return uniq([...fromBrd, ...fromUc, ...fromStories]);
}

// ---------------------------------------------------------------- Mock: CONTEXT

export function mockContext(src: DiagramSources): ContextInput {
  const actors = sourceActors(src);
  if (!actors.length) actors.push("User");
  const externals: ContextInput["externals"] = actors.map((name) => ({ name, kind: "actor" as const }));
  const flows: ContextInput["flows"] = [];
  for (const a of actors) {
    const k = a.toLowerCase();
    const story = src.stories.find((s) => key(s.asA).includes(k) || k.includes(key(s.asA)));
    const uc = src.useCases.find((u) => (u.actors ?? []).some((x) => key(x) === k));
    flows.push({ from: a, to: CONTEXT_SYSTEM, label: story ? short(story.iWant, 40) : uc ? short(uc.name, 40) : "Requests, input data" });
    flows.push({ from: CONTEXT_SYSTEM, to: a, label: "Results, notifications" });
  }
  const brdExternal: string[] = [];
  for (const s of mdSections(src.brd)) if (EXTERNAL_HEAD.test(s.heading)) brdExternal.push(...listNames(s.lines));
  const text = [src.brd, ...src.stories.map((s) => `${s.iWant} ${s.soThat}`), ...src.useCases.map((u) => u.name)].join("\n");
  const known = new Set(actors.map((a) => a.toLowerCase()));
  const addSystem = (name: string, out: string, back: string) => {
    if (known.has(name.toLowerCase())) return;
    known.add(name.toLowerCase());
    externals.push({ name, kind: "system" });
    flows.push({ from: CONTEXT_SYSTEM, to: name, label: out }, { from: name, to: CONTEXT_SYSTEM, label: back });
  };
  for (const n of uniq(brdExternal)) {
    const kw = EXTERNAL_KEYWORDS.find(([re]) => re.test(n));
    addSystem(n, kw?.[2] ?? "Send data", kw?.[3] ?? "Response");
  }
  for (const [re, name, out, back] of EXTERNAL_KEYWORDS) {
    if (re.test(text) && !brdExternal.some((n) => re.test(n))) addSystem(name, out, back);
  }
  return { system: src.moduleName || src.projectName || "System", externals, flows };
}

// ---------------------------------------------------------------- Mock: UC

export function mockUc(src: DiagramSources): string {
  return buildUcMermaid(src.useCases, uniq(src.useCases.flatMap((u) => u.actors ?? [])));
}

// ---------------------------------------------------------------- Mock: SEQUENCE

// vi-keep-start: động từ nhận diện bước chạm CSDL / kiểm tra (UC cũ tiếng Việt), song song tiếng Anh
const TOUCH_DB = /lưu|xử lý|cập nhật|tạo|ghi|lọc|tìm|tra cứu|truy vấn|tải|lấy|hiển thị danh sách|xoá|xóa|\b(?:save|saves|process|update|create|record|filter|search|find|query|load|retrieve|fetch|delete|store|display(?:s)? the (?:data )?list)/i;
const VALIDATE = /kiểm tra|xác thực|xác nhận|đối chiếu|\b(?:validat|verif|check|authenticat)/i;
// vi-keep-end

export function mockSequenceInput(uc: UseCase, screenName: (id: string) => string | undefined): SequenceInput {
  const ui = (uc.screenIds ?? []).map(screenName).find(Boolean) ?? "User interface";
  const participants = [
    { id: "A", label: uc.actors?.find((a) => !SYSTEM_ACTOR.test(a)) ?? "User", actor: true },
    { id: "UI", label: ui },
    { id: "API", label: "API Server" },
    { id: "DB", label: "Database" },
  ];
  const messages: SeqMessage[] = [];
  for (const s of uc.mainFlow ?? []) {
    if (!SYSTEM_ACTOR.test(String(s.actor ?? "").trim())) messages.push({ from: "A", to: "UI", text: s.text });
    else if (VALIDATE.test(s.text)) messages.push({ from: "UI", to: "API", text: "Send request" }, { from: "API", to: "API", text: s.text });
    else if (TOUCH_DB.test(s.text))
      messages.push(
        { from: "API", to: "DB", text: "Query / update data" },
        { from: "DB", to: "API", text: "Result", reply: true },
        { from: "API", to: "UI", text: "Response", reply: true },
        { from: "UI", to: "A", text: s.text, reply: true },
      );
    else messages.push({ from: "UI", to: "A", text: s.text, reply: true });
  }
  if (!messages.length) messages.push({ from: "A", to: "UI", text: uc.name }, { from: "UI", to: "API", text: "Send request" }, { from: "API", to: "UI", text: "Response", reply: true });
  const alts = (uc.exceptions ?? []).slice(0, 3).map((e) => ({
    condition: e.name,
    messages: (e.steps?.length ? e.steps : ["Show an error to the user"]).slice(0, 4).map((t) => ({ from: "UI", to: "A", text: t, reply: true })),
  }));
  return { participants, messages, alts };
}

export function mockSequenceParts(src: DiagramSources): DiagramPart[] {
  const name = (id: string) => src.screenNames[id];
  return src.useCases.map((u) => ({ key: u.code, title: `${u.code} – ${u.name}`, code: buildSequenceMermaid(mockSequenceInput(u, name)) }));
}

// ---------------------------------------------------------------- Mock: BPMN

export function mockBpmn(src: DiagramSources): BpmnInput {
  const sysLane = SYSTEM_LANE;
  const ucs = src.useCases.slice(0, 8);
  const laneOf = (u: UseCase) => u.actors?.find((a) => !SYSTEM_ACTOR.test(a)) ?? sourceActors(src)[0] ?? "User";
  const firstLane = ucs.length ? laneOf(ucs[0]) : sourceActors(src)[0] ?? "User";
  const nodes: BpmnNode[] = [{ id: "start", lane: firstLane, type: "start", label: "Start" }];
  const edges: BpmnInput["edges"] = [];
  let prev = "start";
  let pendingLabel = "";
  const link = (to: string) => {
    edges.push({ from: prev, to, label: pendingLabel || undefined });
    pendingLabel = "";
  };
  ucs.forEach((u, i) => {
    const t = `t${i}`;
    nodes.push({ id: t, lane: laneOf(u), type: "task", label: u.name });
    link(t);
    const sysStep = (u.mainFlow ?? []).find((s) => SYSTEM_ACTOR.test(String(s.actor ?? "").trim()))?.text ?? `Process ${u.name.toLowerCase()}`;
    const s = `s${i}`;
    nodes.push({ id: s, lane: sysLane, type: "task", label: short(sysStep, 50) });
    edges.push({ from: t, to: s });
    prev = s;
    const ex = (u.exceptions ?? [])[0];
    if (ex) {
      const g = `g${i}`;
      nodes.push({ id: g, lane: sysLane, type: "gateway", label: "Valid?" });
      edges.push({ from: s, to: g }, { from: g, to: t, label: short(`No – ${ex.name}`, 40) });
      prev = g;
      pendingLabel = "Yes";
    }
  });
  if (!ucs.length) {
    nodes.push({ id: "t0", lane: firstLane, type: "task", label: src.moduleName || "Perform business task" });
    link("t0");
    prev = "t0";
  }
  nodes.push({ id: "end", lane: ucs.length ? laneOf(ucs[ucs.length - 1]) : firstLane, type: "end", label: "End" });
  link("end");
  // Làn tác nhân theo thứ tự xuất hiện (uniq bỏ "System"), làn System ở cuối nếu có bước hệ thống.
  const lanes = uniq(nodes.map((n) => n.lane));
  if (nodes.some((n) => n.lane === sysLane)) lanes.push(sysLane);
  return { lanes, nodes, edges };
}

// ---------------------------------------------------------------- Mock: ERD

// vi-keep-start: bộ tách thực thể từ câu yêu cầu (tiếng Việt cũ + tiếng Anh)
const ENTITY_VERBS =
  /(?<!\p{L})(?:quản lý|thêm mới|thêm|tạo mới|tạo|cập nhật|chỉnh sửa|sửa|xoá|xóa|xem|tra cứu|tìm kiếm|lưu|phê duyệt|duyệt|đặt|huỷ|hủy|xuất|đăng ký|theo dõi|thanh toán|phân công|gán|manages?|add|adds|creates?|updates?|edits?|deletes?|removes?|views?|search(?:es)? for|search(?:es)?|finds?|saves?|approves?|places?|books?|cancels?|exports?|registers?|tracks?|pays? for|assigns?)\s+([^.,;:\n()]+)/giu;
const ENTITY_PREFIX = /^(danh sách|thông tin|chi tiết|toàn bộ|tất cả|các|những|một|mới|lại|the|a|an|all|list of|details of|my|their|his|her|new|existing|each|every)\s+/i;
const ENTITY_STOP = new Set(
  "của cho theo với khi và để trong từ trên tại vào ra bằng được đã đang sẽ hoặc nếu thì là có không sau trước qua về này đó lên xuống mình mới bị cần phải ở như mà nhưng of for with by to and in on at from into as is are be when that this which or if so than then via".split(" "),
);
const ENTITY_BLACK = /^(email|mật khẩu|dữ liệu|kết quả|hệ thống|màn hình|trang|thông báo|lỗi|form|biểu mẫu|nút|giao diện|trạng thái|báo cáo|nội dung|lựa chọn|tài liệu|yêu cầu|thao tác|chức năng|người dùng|thông tin|password|data|result|results|system|screen|page|notification|notifications|error|errors|button|interface|status|report|reports|content|option|options|document|documents|request|requests|action|actions|function|user|users|information|details|it|them)$/i;
// vi-keep-end

/** Cụm danh từ sau động từ nghiệp vụ: "quản lý danh sách sản phẩm" → "Sản phẩm", "manage the product list" → "Product list". */
export function entityCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text ?? "").matchAll(ENTITY_VERBS)) {
    let rest = m[1].trim().toLowerCase();
    for (let i = 0; i < 3 && ENTITY_PREFIX.test(rest); i++) rest = rest.replace(ENTITY_PREFIX, "");
    const words: string[] = [];
    for (const w of rest.split(/\s+/)) {
      if (!/^\p{L}+$/u.test(w) || ENTITY_STOP.has(w)) break;
      words.push(w);
      if (words.length === 2) break;
    }
    const name = words.join(" ");
    if (!name || name.length < 3 || ENTITY_BLACK.test(name)) continue;
    out.push(cap(name));
  }
  return out;
}

const FIELD_LIST = /(?:gồm|bao gồm|các trường|các thông tin|thông tin|including|includes|consisting of|consists of|with fields|fields)\s*:?\s*([^.\n]+)/i; // vi-keep: từ khoá liệt kê trường (tiếng Việt cũ + tiếng Anh)

export function mockErd(src: DiagramSources): ErdInput {
  const texts = [
    src.moduleName,
    ...src.requirements.map((r) => r.statement),
    ...src.useCases.flatMap((u) => [u.name, ...(u.mainFlow ?? []).map((s) => s.text)]),
    ...src.srs.split(/\r?\n/),
  ].filter(Boolean);
  const count = new Map<string, { name: string; n: number; first: number }>();
  texts.forEach((t, i) => {
    for (const c of entityCandidates(t)) {
      const k = c.toLowerCase();
      const cur = count.get(k);
      if (cur) cur.n++;
      else count.set(k, { name: c, n: 1, first: i });
    }
  });
  // "đặt hàng" → "Hàng" là một phần của "Đơn hàng": bỏ ứng viên nằm trọn trong ứng viên dài hơn.
  const all = [...count.values()];
  const within = (a: string, b: string) => a !== b && ` ${b} `.includes(` ${a} `);
  let names = all
    .filter((x) => !all.some((y) => within(x.name.toLowerCase(), y.name.toLowerCase())))
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, 6)
    .sort((a, b) => a.first - b.first)
    .map((x) => x.name);
  if (!names.length) names = ["Record"];
  const lowerNames = names.map((n) => n.toLowerCase());

  const user = "User";
  const entities: ErdEntity[] = [
    {
      name: user,
      attributes: [
        { name: "id", type: "uuid", key: "PK", comment: "Identifier" },
        { name: "full_name", type: "string", comment: "Full name" },
        { name: "email", type: "string", key: "UK", comment: "Email" },
        { name: "role", type: "string", comment: "Role" },
      ],
    },
  ];
  // "… đơn hàng gồm sản phẩm, số lượng và địa chỉ" → trường của thực thể đứng gần nhất trước "gồm";
  // trường trùng tên thực thể khác thành quan hệ "contains".
  const fields = new Map<string, string[]>();
  const containRel: [string, string][] = [];
  for (const t of texts) {
    const m = t.match(FIELD_LIST);
    if (!m || m.index === undefined) continue;
    const before = t.slice(0, m.index).toLowerCase();
    const owner = lowerNames.map((n, i) => ({ i, at: before.lastIndexOf(n) })).filter((x) => x.at >= 0).sort((a, b) => b.at - a.at)[0];
    if (!owner) continue;
    const list = fields.get(names[owner.i]) ?? [];
    for (const f of m[1].split(/,|;|\s+và\s+|\s+hoặc\s+|\s+and\s+|\s+or\s+/)) { // vi-keep: từ nối "và/hoặc" của câu cũ tiếng Việt
      const v = f.trim().toLowerCase().replace(/^(các|những|the|a|an)\s+/i, ""); // vi-keep: mạo từ tiếng Việt cũ
      if (!v || !/^[\p{L}\s]+$/u.test(v) || v.split(/\s+/).length > 4) continue;
      const other = lowerNames.indexOf(v);
      if (other >= 0 && other !== owner.i) containRel.push([names[owner.i], names[other]]);
      else if (other < 0 && !list.includes(v)) list.push(v);
    }
    fields.set(names[owner.i], list);
  }
  for (const name of names) {
    const k = name.toLowerCase();
    const extra = fields.get(name) ?? [];
    entities.push({
      name,
      attributes: [
        { name: "id", type: "uuid", key: "PK", comment: "Identifier" },
        { name: "code", type: "string", key: "UK", comment: `${cap(k)} code` },
        ...(extra.length ? extra.slice(0, 5).map((f) => ({ name: f, type: "string", comment: cap(f) })) : [{ name: "name", type: "string", comment: "Name" }]),
        { name: "status", type: "string", comment: "Status" },
        { name: "created_by_id", type: "uuid", key: "FK" as const, comment: "Created by" },
        { name: "created_at", type: "datetime", comment: "Created at" },
      ],
    });
  }
  const relations: ErdRelation[] = names.map((n) => ({ from: user, to: n, cardinality: "1-n", label: "creates" }));
  const pairs = new Set<string>();
  for (const [a, b] of containRel) {
    if (pairs.has(`${a}|${b}`)) continue;
    pairs.add(`${a}|${b}`);
    relations.push({ from: a, to: b, cardinality: "n-n", label: "contains" });
  }
  for (const t of texts) {
    const lower = t.toLowerCase();
    const hit = names.filter((n) => lower.includes(n.toLowerCase()));
    for (let i = 0; i + 1 < hit.length && pairs.size < 6; i++) {
      const p = `${hit[i]}|${hit[i + 1]}`;
      if (pairs.has(p) || pairs.has(`${hit[i + 1]}|${hit[i]}`)) continue;
      pairs.add(p);
      relations.push({ from: hit[i], to: hit[i + 1], cardinality: "1-n", label: "contains" });
    }
  }
  return { entities, relations };
}

// ---------------------------------------------------------------- bản AI (Claude) cho từng loại

const fail = (errors: string[]) => ({ errors });
function ok(kind: DiagramKind, r: DiagramResult): { value?: DiagramResult; errors?: string[] } {
  const errors = checkDiagram(kind, r);
  return errors.length ? { errors } : { value: r };
}
const single = (code: string): DiagramResult => ({ code, parts: [] });

async function aiContext(src: DiagramSources): Promise<DiagramResult> {
  const prompt = `Build the context diagram for system/module "${src.moduleName}" (project "${src.projectName}").
- system: name of the system in the centre.
- externals: actors (kind "actor": people, organisations) and external systems (kind "system") that interact with the system.
- flows: data flows between the system and each external party; from/to is a name from externals or "${CONTEXT_SYSTEM}" (the system in the centre). Every external party has at least 1 flow.

## BRD
${clip(src.brd, 12000)}

## User stories
${clip(storyLines(src), 4000)}`;
  return runAI({
    type: "generate_diagram_context",
    moduleId: src.moduleId,
    system: SYSTEM,
    prompt,
    tool: {
      name: "submit_context_diagram",
      description: "Return the elements of the context diagram",
      input_schema: {
        type: "object",
        properties: {
          system: { type: "string" },
          externals: { type: "array", items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string", enum: ["actor", "system"] } }, required: ["name", "kind"] } },
          flows: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["from", "to", "label"] } },
        },
        required: ["system", "externals", "flows"],
      },
    },
    parse: (raw: any) => {
      const externals = Array.isArray(raw?.externals) ? raw.externals.map((e: any) => ({ name: String(e?.name ?? ""), kind: e?.kind === "system" ? "system" : "actor" })) : [];
      if (!externals.length) return fail(["At least one actor or external system is required"]);
      const flows = Array.isArray(raw?.flows) ? raw.flows.map((f: any) => ({ from: String(f?.from ?? ""), to: String(f?.to ?? ""), label: String(f?.label ?? "") })) : [];
      const names = new Set([CONTEXT_SYSTEM.toLowerCase(), key(String(raw?.system ?? "")), ...externals.map((e: any) => key(e.name))]);
      const bad = flows.filter((f: any) => !names.has(key(f.from)) || !names.has(key(f.to))).map((f: any) => `Flow references an unknown name: ${f.from} → ${f.to}`);
      if (bad.length) return fail(bad);
      return ok("CONTEXT", single(buildContextMermaid({ system: String(raw?.system ?? src.moduleName), externals, flows })));
    },
    mock: () => single(buildContextMermaid(mockContext(src))),
  });
}

async function aiUc(src: DiagramSources): Promise<DiagramResult> {
  const codes = new Set(src.useCases.map((u) => u.code));
  const prompt = `Build the use case diagram for module "${src.moduleName}" from the use cases below.
- actors: actors outside the system (do not list "System").
- relations: relationships between use cases, using only use case IDs from the list. "include": from is the base use case, to is the use case that is always invoked. "extend": from is the extending use case (only happens under specific conditions), to is the base use case.
- If no relationship is clear, return an empty relations list.

## Use cases
${clip(ucCompact(src.useCases), 16000)}`;
  return runAI({
    type: "generate_diagram_uc",
    moduleId: src.moduleId,
    system: SYSTEM,
    prompt,
    tool: {
      name: "submit_uc_diagram",
      description: "Return the actors and include/extend relationships of the use case diagram",
      input_schema: {
        type: "object",
        properties: {
          actors: { type: "array", items: { type: "string" } },
          relations: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, type: { type: "string", enum: ["include", "extend"] } }, required: ["from", "to", "type"] } },
        },
        required: ["actors", "relations"],
      },
    },
    parse: (raw: any) => {
      const relations: UcRelation[] = Array.isArray(raw?.relations) ? raw.relations.map((r: any) => ({ from: String(r?.from ?? ""), to: String(r?.to ?? ""), type: r?.type === "extend" ? "extend" : "include" })) : [];
      const bad = relations.filter((r) => !codes.has(r.from) || !codes.has(r.to)).map((r) => `Relationship references a use case that does not exist: ${r.from} → ${r.to}`);
      if (bad.length) return fail(bad);
      const actors = Array.isArray(raw?.actors) ? raw.actors.map(String) : [];
      return ok("UC", single(buildUcMermaid(src.useCases, actors, relations)));
    },
    mock: () => single(mockUc(src)),
  });
}

const MSG_SCHEMA = {
  type: "object",
  properties: { from: { type: "string" }, to: { type: "string" }, text: { type: "string" }, reply: { type: "boolean" } },
  required: ["from", "to", "text"],
};
const toMsgs = (v: unknown): SeqMessage[] => (Array.isArray(v) ? v.map((m: any) => ({ from: String(m?.from ?? ""), to: String(m?.to ?? ""), text: String(m?.text ?? ""), reply: !!m?.reply })) : []);

async function aiSequence(src: DiagramSources): Promise<DiagramResult> {
  const withScreens = src.useCases.map((u) => ({ ...u, screens: (u.screenIds ?? []).map((id) => src.screenNames[id]).filter(Boolean) }));
  const prompt = `Draw a sequence diagram for EACH use case below (one diagram per use case).
- participants: short ASCII id (e.g. A, UI, API, DB) + English label; human actors have actor = true. Usually actor → user interface (screen name) → API Server → Database.
- messages: the main flow in order; from/to are participant ids; reply = true for responses.
- alts: one branch per important exception (condition + messages).

## Use cases
${clip(JSON.stringify(withScreens.map((u) => ({ code: u.code, name: u.name, actors: u.actors, screens: u.screens, mainFlow: u.mainFlow, exceptions: u.exceptions }))), 20000)}`;
  const mockParts = () => mockSequenceParts(src);
  return runAI({
    type: "generate_diagram_sequence",
    moduleId: src.moduleId,
    system: SYSTEM,
    prompt,
    maxTokens: 16000,
    tool: {
      name: "submit_sequences",
      description: "Return a sequence diagram for each use case",
      input_schema: {
        type: "object",
        properties: {
          sequences: {
            type: "array",
            items: {
              type: "object",
              properties: {
                useCaseCode: { type: "string" },
                participants: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, actor: { type: "boolean" } }, required: ["id", "label"] } },
                messages: { type: "array", items: MSG_SCHEMA },
                alts: { type: "array", items: { type: "object", properties: { condition: { type: "string" }, messages: { type: "array", items: MSG_SCHEMA } }, required: ["condition", "messages"] } },
              },
              required: ["useCaseCode", "participants", "messages"],
            },
          },
        },
        required: ["sequences"],
      },
    },
    parse: (raw: any) => {
      const seqs: any[] = Array.isArray(raw?.sequences) ? raw.sequences : [];
      const parts: DiagramPart[] = [];
      for (const u of src.useCases) {
        const s = seqs.find((x) => String(x?.useCaseCode ?? "") === u.code);
        if (!s) continue;
        const participants = Array.isArray(s.participants) ? s.participants.map((p: any) => ({ id: String(p?.id ?? ""), label: String(p?.label ?? ""), actor: !!p?.actor })) : [];
        const alts = Array.isArray(s.alts) ? s.alts.map((a: any) => ({ condition: String(a?.condition ?? ""), messages: toMsgs(a?.messages) })) : [];
        const messages = toMsgs(s.messages);
        if (!messages.length) continue;
        parts.push({ key: u.code, title: `${u.code} – ${u.name}`, code: buildSequenceMermaid({ participants, messages, alts }) });
      }
      const missing = src.useCases.filter((u) => !parts.some((p) => p.key === u.code)).map((u) => u.code);
      if (missing.length) return fail([`Missing diagrams (or messages) for: ${missing.join(", ")}`]);
      return ok("SEQUENCE", { code: "", parts });
    },
    mock: () => ({ code: "", parts: mockParts() }),
  });
}

async function aiBpmn(src: DiagramSources): Promise<DiagramResult> {
  const prompt = `Build a BPMN-style business process diagram for module "${src.moduleName}" (it will be simulated with a Mermaid flowchart).
- lanes: one lane per actor, plus a "System" lane for automated system steps.
- nodes: short ASCII id, lane (lane name), type: "start" (exactly 1), "end" (at least 1), "task" (activity, label starts with a verb), "gateway" (decision, label is a question, e.g. "Valid?").
- edges: from/to are node ids; edges leaving a gateway have a label (e.g. "Yes", "No").
- Every node must be reachable from start; follow the business order in the BRD and the use cases.

## BRD
${clip(src.brd, 10000)}

## Use cases
${clip(ucCompact(src.useCases), 12000)}`;
  return runAI({
    type: "generate_diagram_bpmn",
    moduleId: src.moduleId,
    system: SYSTEM,
    prompt,
    tool: {
      name: "submit_bpmn",
      description: "Return the lanes, nodes and edges of the BPMN process",
      input_schema: {
        type: "object",
        properties: {
          lanes: { type: "array", items: { type: "string" } },
          nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, lane: { type: "string" }, type: { type: "string", enum: ["start", "end", "task", "gateway"] }, label: { type: "string" } }, required: ["id", "lane", "type", "label"] } },
          edges: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["from", "to"] } },
        },
        required: ["lanes", "nodes", "edges"],
      },
    },
    parse: (raw: any) => {
      const types = new Set(["start", "end", "task", "gateway"]);
      const nodes: BpmnNode[] = Array.isArray(raw?.nodes)
        ? raw.nodes.map((n: any) => ({ id: String(n?.id ?? ""), lane: String(n?.lane ?? ""), type: types.has(n?.type) ? n.type : "task", label: String(n?.label ?? "") }))
        : [];
      const edges = Array.isArray(raw?.edges) ? raw.edges.map((e: any) => ({ from: String(e?.from ?? ""), to: String(e?.to ?? ""), label: e?.label ? String(e.label) : undefined })) : [];
      const errors: string[] = [];
      if (!nodes.some((n) => n.type === "start")) errors.push('Missing start event (type "start")');
      if (!nodes.some((n) => n.type === "end")) errors.push('Missing end event (type "end")');
      const ids = new Set(nodes.map((n) => n.id));
      for (const e of edges) if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`Edge references an unknown node: ${e.from} → ${e.to}`);
      if (errors.length) return fail(errors);
      const lanes = Array.isArray(raw?.lanes) ? raw.lanes.map(String) : [];
      return ok("BPMN", single(buildBpmnMermaid({ lanes, nodes, edges })));
    },
    mock: () => single(buildBpmnMermaid(mockBpmn(src))),
  });
}

async function aiErd(src: DiagramSources): Promise<DiagramResult> {
  const prompt = `Build the ERD (entity–relationship diagram) for module "${src.moduleName}".
- entities: name (English, e.g. "Order"), key attributes (ASCII snake_case name, type ∈ string|text|int|decimal|boolean|date|datetime|uuid, key PK/FK/UK when applicable, English comment). Each entity has exactly 1 PK.
- relations: from/to are entity names, cardinality ∈ "1-1" | "1-n" | "n-n" | "1-0..1", label is a short verb.
- Only include entities supported by the requirements; do not create technical tables (logs, sessions) unless the requirements mention them.

## FRD-NFR
${clip(reqLines(src.requirements), 10000)}

## SRS
${clip(src.srs, 10000)}

## Use cases (names)
${src.useCases.map((u) => `- ${u.code}: ${u.name}`).join("\n")}`;
  return runAI({
    type: "generate_diagram_erd",
    moduleId: src.moduleId,
    system: SYSTEM,
    prompt,
    tool: {
      name: "submit_erd",
      description: "Return the entities, attributes and relationships",
      input_schema: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                attributes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, key: { type: "string", enum: ["PK", "FK", "UK", ""] }, comment: { type: "string" } }, required: ["name", "type"] } },
              },
              required: ["name", "attributes"],
            },
          },
          relations: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, cardinality: { type: "string", enum: ["1-1", "1-n", "n-n", "1-0..1"] }, label: { type: "string" } }, required: ["from", "to", "cardinality", "label"] } },
        },
        required: ["entities", "relations"],
      },
    },
    parse: (raw: any) => {
      const entities: ErdEntity[] = Array.isArray(raw?.entities)
        ? raw.entities.map((e: any) => ({
            name: String(e?.name ?? ""),
            attributes: Array.isArray(e?.attributes) ? e.attributes.map((a: any) => ({ name: String(a?.name ?? ""), type: String(a?.type ?? "string"), key: ["PK", "FK", "UK"].includes(a?.key) ? a.key : "", comment: String(a?.comment ?? "") })) : [],
          }))
        : [];
      if (!entities.length) return fail(["At least one entity is required"]);
      const names = new Set(entities.map((e) => key(e.name)));
      const relations: ErdRelation[] = Array.isArray(raw?.relations)
        ? raw.relations.map((r: any) => ({ from: String(r?.from ?? ""), to: String(r?.to ?? ""), cardinality: ["1-1", "1-n", "n-n", "1-0..1"].includes(r?.cardinality) ? r.cardinality : "1-n", label: String(r?.label ?? "") }))
        : [];
      const bad = relations.filter((r) => !names.has(key(r.from)) || !names.has(key(r.to))).map((r) => `Relationship references an unknown entity: ${r.from} → ${r.to}`);
      if (bad.length) return fail(bad);
      return ok("ERD", single(buildErdMermaid({ entities, relations })));
    },
    mock: () => single(buildErdMermaid(mockErd(src))),
  });
}

/** Sinh một loại sơ đồ (Claude khi có API key, Mock khi không). Nhật ký AI do runAI ghi (prompt_runs). */
export function generateDiagram(kind: DiagramKind, src: DiagramSources): Promise<DiagramResult> {
  switch (kind) {
    case "CONTEXT":
      return aiContext(src);
    case "UC":
      return aiUc(src);
    case "SEQUENCE":
      return aiSequence(src);
    case "BPMN":
      return aiBpmn(src);
    case "ERD":
      return aiErd(src);
  }
}
