// Pipeline AI cho 5 tài liệu theo bước: BRD → UC Specification → SRS → FRD-NFR → API Spec. Chủ sở hữu: C5.
// Mỗi loại có bản Claude (tool use + kiểm tra kết quả qua runAI) và bản Mock (rule-based, chạy khi không có API key).
// Chuỗi đầu vào (kế hoạch đợt 5, mục 3 "C5"):
//   BRD ← user story của module · UC_SPEC ← BRD + story · SRS ← UC_SPEC · FRD_NFR ← SRS + UC · API_SPEC ← FRD + UC.
// UC_SPEC / FRD_NFR / SRS lưu thêm dữ liệu cấu trúc (`ModuleDocData`); Markdown của chúng sinh từ cấu trúc, và khi BA
// sửa tay / chỉnh bằng AI thì cấu trúc được đọc ngược lại từ Markdown (`deriveDocData`).
// Không sửa server/ai/pipelines.ts, mock.ts (của C9) – tệp này tự chứa schema và bộ dựng riêng.
// Đợt 6 (D4): nội dung sinh ra bằng tiếng Anh; bộ đọc ngược Markdown nhận cả nhãn tiếng Anh lẫn nhãn tiếng Việt cũ.

import { runAI } from "./client.ts";
import { DOC_KIND_LABEL } from "../../../shared/types.ts";
import type { AltFlow, DocKind, FlowStep, ModuleDocData, Requirement, SrsDoc, SrsSection, UseCase, UserStory } from "../../../shared/types.ts";

/** UseCase kèm mã story nguồn (để truy vết Story → UC). Trường thêm, không có trong kiểu chung. */
export type DocUseCase = UseCase & { storyCodes?: string[] };

const SYSTEM = `You are a Senior Business Analyst in the BA Copilot system.
Principles:
- Write ALL content in English: clear, concise, using standard business analysis terminology (BABOK, IEEE 830 / ISO/IEC/IEEE 29148).
- Rely only on the input data. Anything you have to infer must be clearly marked as an assumption for the BA to confirm – NEVER present it as fact.
- Markdown: section headings use "## ", sub-sections "### ", lists "- ", tables "| … |". Do NOT use \`\`\` code blocks and do NOT use "#### " headings.
- Always return the result by calling exactly the requested tool.`;

const MAX_CTX = 30000;
const clip = (s: string, n = MAX_CTX) => (s.length > n ? s.slice(0, n) + "\n…(truncated)" : s);

/** Tác nhân "Hệ thống" (dữ liệu cũ tiếng Việt) hay "System". */
const SYSTEM_ACTOR = "System";
const isSystem = (a: string) => /^(?:system|the system|hệ thống)$/i.test(a.trim()); // vi-keep: actor "Hệ thống" trong UC cũ

// =============================================================== Tiện ích chữ
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Viết thường chữ đầu để ghép vào câu; giữ nguyên đại từ "I" và từ viết tắt ("SKU", "API")
const low = (s: string) => (!s || /^(?:I\b|[A-Z]{2})/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const tidy = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.;,]+$/, "");
const pad2 = (n: number) => String(n).padStart(2, "0");
const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ");

/** Bỏ dấu tiếng Việt → chữ thường, gạch nối (dùng cho đường dẫn API). */
export function slugify(s: string, maxWords = 5): string {
  const ascii = s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase(); // vi-keep: bỏ dấu tiếng Việt
  const words = ascii.split(/[^a-z0-9]+/).filter(Boolean);
  return words.slice(0, maxWords).join("-") || "resource";
}

// Bỏ cụm mở đầu BA lỡ gõ lại trong ô story ("As a Shopper", "I want to pay", "to pay", "so that I …") để câu ghép
// không lặp chữ ("allow Shopper to to pay", "so that so that") và tên UC không bắt đầu bằng "To …".
const roleOf = (s: string) => tidy(s).replace(/^as\s+(?:an?|the)\s+/i, "");
const wantOf = (s: string) => tidy(s).replace(/^i\s+(?:want|would\s+like|need)\s+/i, "").replace(/^to\s+/i, "");
const goalOf = (s: string) => tidy(s).replace(/^so\s+that\s+/i, "");
/** Cụm động từ ghép sau "to" / "can" / "wants to": bỏ "to " đầu (tên UC do AI đặt cũng có thể là "To …"), viết thường chữ đầu. */
const verbPhrase = (name: string) => low(tidy(name).replace(/^to\s+/i, ""));
const actorOf = (s: UserStory) => cap(roleOf(s.asA)) || "User";
const featureOf = (s: UserStory) => cap(wantOf(s.iWant).slice(0, 90)) || `Feature ${s.code}`;
// vi-keep-start: từ khoá nhận diện chức năng đọc / xoá / sửa (story cũ tiếng Việt), song song tiếng Anh
const READ_RE = /xem|tra cứu|tìm|danh sách|liệt kê|báo cáo|thống kê|lọc|theo dõi|\b(?:view|see|search|find|look up|list|browse|report|statistic|filter|track)/i;
const DELETE_RE = /xoá|xóa|huỷ|hủy|\b(?:delete|remove|cancel)/i;
const UPDATE_RE = /sửa|cập nhật|chỉnh|thay đổi|đổi|\b(?:edit|update|change|modify)/i;
const DETAIL_RE = /chi tiết|\bdetail/i;
// vi-keep-end

// =============================================================== Markdown ⇄ mục (## …)
export interface MdSection {
  title: string; // chữ sau "## "
  text: string; // cả mục, gồm dòng tiêu đề
}

/** Tách Markdown theo tiêu đề cấp 2 ("## "); bỏ qua dòng trong khối ```. */
export function splitSections(md: string): { preamble: string; sections: MdSection[] } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const pre: string[] = [];
  const sections: { title: string; lines: string[] }[] = [];
  let fence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && /^## (.+)$/.exec(line);
    if (m) sections.push({ title: m[1].trim(), lines: [line] });
    else if (sections.length) sections[sections.length - 1].lines.push(line);
    else pre.push(line);
  }
  return { preamble: pre.join("\n"), sections: sections.map((s) => ({ title: s.title, text: s.lines.join("\n").replace(/\s+$/, "") })) };
}

export const sectionTitles = (md: string) => splitSections(md).sections.map((s) => s.title);

/** Thay mục có tiêu đề `title` bằng `next` (Markdown đủ mục, bắt đầu bằng "## "). */
export function replaceSection(md: string, title: string, next: string): string {
  const { preamble, sections } = splitSections(md);
  const parts = sections.map((s) => (s.title === title ? next.trim() : s.text));
  return [preamble.trim(), ...parts].filter(Boolean).join("\n\n") + "\n";
}

// =============================================================== Markdown sinh từ cấu trúc
export function ucMarkdown(ucs: DocUseCase[], moduleName: string): string {
  const out: string[] = [`# UC Specification – ${moduleName}`, ""];
  for (const uc of ucs) {
    out.push(`## ${uc.code} – ${uc.name}`, "");
    if (uc.actors.length) out.push(`**Actor:** ${uc.actors.join(", ")}`, "");
    if (uc.storyCodes?.length) out.push(`**Source stories:** ${uc.storyCodes.join(", ")}`, "");
    if (uc.description) out.push(`**Description:** ${uc.description}`, "");
    if (uc.trigger) out.push(`**Trigger:** ${uc.trigger}`, "");
    const list = (title: string, items: string[]) => (items.length ? out.push(`**${title}:**`, ...items.map((x) => `- ${x}`), "") : 0);
    list("Preconditions", uc.preconditions);
    list("Postconditions", uc.postconditions);
    if (uc.mainFlow.length) out.push("**Main flow:**", ...uc.mainFlow.map((s, i) => `${s.no || i + 1}. ${s.actor ? `${s.actor}: ` : ""}${s.text}`), "");
    for (const f of [...uc.altFlows, ...uc.exceptions]) out.push(`**${f.code} – ${f.name}** (branches from step ${f.branchFrom}):`, ...f.steps.map((s, i) => `${i + 1}. ${s}`), "");
    list("Business rules", uc.businessRules);
    list("Assumptions", uc.assumptions);
  }
  return out.join("\n").trim() + "\n";
}

export function reqMarkdown(reqs: Requirement[], moduleName: string): string {
  const table = (type: "FR" | "NFR") => {
    const rows = reqs.filter((r) => r.type === type);
    return [
      `## ${type === "FR" ? "Functional Requirements (FR)" : "Non-functional Requirements (NFR)"}`,
      "",
      ...(rows.length
        ? [
            "| ID | Requirement | Priority | Use case | Source |",
            "|---|---|---|---|---|",
            ...rows.map((r) => `| ${cell(r.code)} | ${cell(r.statement)}${r.isAssumption ? " _(assumption)_" : ""} | ${cell(r.priority)} | ${cell(r.useCaseCodes.join(", "))} | ${cell(r.source)} |`),
          ]
        : ["- (none yet)"]),
      "",
    ];
  };
  return [`# FRD-NFR – ${moduleName}`, "", ...table("FR"), ...table("NFR")].join("\n").trim() + "\n";
}

export function srsMarkdown(srs: SrsDoc, moduleName: string): string {
  return [`# SRS – ${moduleName}`, "", ...srs.sections.flatMap((s) => [`## ${s.title}`, "", s.content.trim(), ""])].join("\n").trim() + "\n";
}

// =============================================================== Đọc ngược cấu trúc từ Markdown
// vi-keep-start: nhãn tiếng Việt của tài liệu cũ trong DB, đọc song song nhãn tiếng Anh
const FLOW_RE = /^\*\*([AE]\d+)\s*[–-]\s*(.+?)\*\*\s*(?:\((?:rẽ từ bước|branches from step)\s*(\d+)\))?:?\s*$/i;
const FIELD_RE = /^\*\*(.+?):\*\*\s*(.*)$/;
/** Khoá trường của UC (chữ thường) → trường. Nhận cả nhãn tiếng Anh và nhãn tiếng Việt cũ. */
const UC_FIELD: Record<string, "actor" | "stories" | "description" | "trigger" | "pre" | "post" | "main" | "rules" | "assume"> = {
  actor: "actor",
  actors: "actor",
  "source stories": "stories",
  "story nguồn": "stories",
  description: "description",
  "mô tả": "description",
  trigger: "trigger",
  "kích hoạt": "trigger",
  preconditions: "pre",
  "tiền điều kiện": "pre",
  postconditions: "post",
  "hậu điều kiện": "post",
  "main flow": "main",
  "luồng chính": "main",
  "business rules": "rules",
  "quy tắc nghiệp vụ": "rules",
  assumptions: "assume",
  "giả định": "assume",
};
const ASSUMPTION_TAG = /_\((?:giả định|assumption)\)_|\((?:giả định|assumption)\)/i;
const ASSUMPTION_STRIP = /\s*_?\((?:giả định|assumption)\)_?/i;
// vi-keep-end

/** Đọc UC từ Markdown dạng `ucMarkdown`. UC cũ cùng mã giữ các trường Markdown không thể hiện (screenIds, nodeId). */
export function parseUcMarkdown(md: string, prev: DocUseCase[] = []): DocUseCase[] {
  const out: DocUseCase[] = [];
  for (const sec of splitSections(md).sections) {
    const h = /^(UC-\d+)\s*[–-]\s*(.*)$/.exec(sec.title);
    if (!h) continue;
    const old = prev.find((u) => u.code === h[1]);
    const uc: DocUseCase = {
      code: h[1],
      name: h[2].trim(),
      actors: [],
      description: "",
      trigger: "",
      preconditions: [],
      postconditions: [],
      mainFlow: [],
      altFlows: [],
      exceptions: [],
      businessRules: [],
      screenIds: old?.screenIds ?? [],
      assumptions: [],
      ...(old?.storyCodes ? { storyCodes: old.storyCodes } : {}),
    };
    let mode: "pre" | "post" | "main" | "rules" | "assume" | "flow" | null = null;
    let flow: AltFlow | null = null;
    for (const raw of sec.text.split("\n").slice(1)) {
      const line = raw.trim();
      if (!line) continue;
      const fm = FLOW_RE.exec(line);
      if (fm) {
        flow = { code: fm[1], name: fm[2].trim(), branchFrom: Number(fm[3] ?? 1), steps: [] };
        (fm[1].startsWith("E") ? uc.exceptions : uc.altFlows).push(flow);
        mode = "flow";
        continue;
      }
      const f = FIELD_RE.exec(line);
      if (f) {
        const [key, val] = [UC_FIELD[f[1].trim().toLowerCase()], f[2].trim()];
        mode = null;
        if (key === "actor") uc.actors = val.split(",").map((x) => x.trim()).filter(Boolean);
        else if (key === "stories") uc.storyCodes = val.split(/[,\s]+/).filter((x) => /^US-\d+/.test(x));
        else if (key === "description") uc.description = val;
        else if (key === "trigger") uc.trigger = val;
        else if (key === "pre" || key === "post" || key === "main" || key === "rules" || key === "assume") mode = key;
        continue;
      }
      const bullet = /^[-*]\s+(.*)$/.exec(line)?.[1];
      const num = /^\d+[.)]\s+(.*)$/.exec(line)?.[1];
      const item = bullet ?? num;
      if (item === undefined) continue;
      if (mode === "pre") uc.preconditions.push(item);
      else if (mode === "post") uc.postconditions.push(item);
      else if (mode === "rules") uc.businessRules.push(item);
      else if (mode === "assume") uc.assumptions.push(item);
      else if (mode === "flow" && flow) flow.steps.push(item);
      else if (mode === "main") {
        const am = /^([^:]{1,40}):\s+(.+)$/.exec(item);
        const i = uc.mainFlow.length;
        const keep = old?.mainFlow[i];
        const step: FlowStep = { no: i + 1, actor: am ? am[1].trim() : "", text: am ? am[2].trim() : item };
        if (keep?.screenId) step.screenId = keep.screenId;
        if (keep?.nodeId) step.nodeId = keep.nodeId;
        uc.mainFlow.push(step);
      }
    }
    out.push(uc);
  }
  return out;
}

/** Đọc yêu cầu từ mọi dòng bảng có mã FR-xx / NFR-xx. */
export function parseReqMarkdown(md: string): Requirement[] {
  const out: Requirement[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const code = /^(N?FR-\d+)/.exec(cells[0] ?? "")?.[1];
    if (!code) continue;
    const st = cells[1] ?? "";
    const isAssumption = ASSUMPTION_TAG.test(st);
    const pr = cells[2] ?? "";
    out.push({
      code,
      type: code.startsWith("NFR") ? "NFR" : "FR",
      statement: st.replace(ASSUMPTION_STRIP, "").trim(),
      priority: pr === "High" || pr === "Low" ? pr : "Medium",
      useCaseCodes: (cells[3] ?? "").split(/[,\s]+/).filter((x) => /^UC-\d+$/.test(x)),
      source: cells[4] ?? "",
      isAssumption,
    });
  }
  return out;
}

// vi-keep-start: nhận diện tiêu đề mục SRS cũ tiếng Việt, song song tiếng Anh
const SRS_KEYS: [RegExp, string][] = [
  [/giới thiệu|introduction/i, "intro"],
  [/tổng quan|overall description|overview/i, "overview"],
  [/phi chức năng|non-functional|nonfunctional/i, "nonfunctional"],
  [/chức năng|functional/i, "functional"],
  [/giao diện|interface/i, "interfaces"],
  [/dữ liệu|data/i, "data"],
  [/giả định|vấn đề mở|assumption|open issue/i, "assumptions"],
];
// vi-keep-end
export function parseSrsMarkdown(md: string, prev?: SrsDoc | null): SrsDoc {
  const sections: SrsSection[] = splitSections(md).sections.map((s, i) => {
    const old = prev?.sections.find((x) => x.title === s.title);
    const key = old?.key ?? SRS_KEYS.find(([re]) => re.test(s.title))?.[1] ?? `s${i + 1}`;
    return { key, title: s.title, content: s.text.split("\n").slice(1).join("\n").trim() };
  });
  return { sections };
}

/** Dữ liệu cấu trúc của tài liệu suy ra từ Markdown (sau khi sửa tay / chỉnh bằng AI). Loại không có cấu trúc → null. */
export function deriveDocData(kind: DocKind, content: string, prev: ModuleDocData | null): ModuleDocData | null {
  if (kind === "UC_SPEC") return { useCases: parseUcMarkdown(content, (prev?.useCases as DocUseCase[] | undefined) ?? []) };
  if (kind === "FRD_NFR") return { requirements: parseReqMarkdown(content) };
  if (kind === "SRS") return { srs: parseSrsMarkdown(content, prev?.srs) };
  return null;
}

// =============================================================== Chuẩn hoá kết quả AI
const strs = (x: unknown) => (Array.isArray(x) ? x.map((v) => String(v)).filter((v) => v.trim()) : []);
const flows = (x: unknown): AltFlow[] =>
  Array.isArray(x) ? x.map((f: any) => ({ code: String(f?.code ?? ""), name: String(f?.name ?? ""), branchFrom: Number(f?.branchFrom ?? 1) || 1, steps: strs(f?.steps) })) : [];

export function coerceDocUseCase(u: any): DocUseCase {
  return {
    code: String(u?.code ?? ""),
    name: String(u?.name ?? ""),
    actors: strs(u?.actors),
    description: String(u?.description ?? ""),
    trigger: String(u?.trigger ?? ""),
    preconditions: strs(u?.preconditions),
    postconditions: strs(u?.postconditions),
    mainFlow: (Array.isArray(u?.mainFlow) ? u.mainFlow : []).map((s: any, i: number) => ({ no: Number(s?.no ?? i + 1) || i + 1, actor: String(s?.actor ?? ""), text: String(s?.text ?? "") })),
    altFlows: flows(u?.altFlows),
    exceptions: flows(u?.exceptions),
    businessRules: strs(u?.businessRules),
    screenIds: strs(u?.screenIds),
    assumptions: strs(u?.assumptions),
    ...(Array.isArray(u?.storyCodes) ? { storyCodes: strs(u.storyCodes) } : {}),
  };
}

export function coerceDocRequirement(r: any): Requirement {
  return {
    code: String(r?.code ?? ""),
    type: r?.type === "NFR" ? "NFR" : "FR",
    statement: String(r?.statement ?? ""),
    priority: r?.priority === "High" || r?.priority === "Low" ? r.priority : "Medium",
    useCaseCodes: strs(r?.useCaseCodes),
    source: String(r?.source ?? ""),
    isAssumption: Boolean(r?.isAssumption),
  };
}

// =============================================================== Schema tool
const FLOW_DEF = {
  type: "object",
  properties: { code: { type: "string" }, name: { type: "string" }, branchFrom: { type: "integer" }, steps: { type: "array", items: { type: "string" } } },
  required: ["code", "name", "branchFrom", "steps"],
};
const UC_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string", description: "UC-01, UC-02…" },
    name: { type: "string" },
    actors: { type: "array", items: { type: "string" } },
    storyCodes: { type: "array", items: { type: "string" }, description: "Source user story IDs (US-xx)" },
    description: { type: "string" },
    trigger: { type: "string" },
    preconditions: { type: "array", items: { type: "string" } },
    postconditions: { type: "array", items: { type: "string" } },
    mainFlow: {
      type: "array",
      items: { type: "object", properties: { no: { type: "integer" }, actor: { type: "string" }, text: { type: "string" } }, required: ["no", "actor", "text"] },
    },
    altFlows: { type: "array", items: FLOW_DEF },
    exceptions: { type: "array", items: FLOW_DEF },
    businessRules: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["code", "name", "actors", "storyCodes", "description", "mainFlow", "altFlows", "exceptions", "businessRules"],
};
const REQ_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string", description: "FR-01… or NFR-01…" },
    type: { type: "string", enum: ["FR", "NFR"] },
    statement: { type: "string" },
    priority: { type: "string", enum: ["High", "Medium", "Low"] },
    useCaseCodes: { type: "array", items: { type: "string" } },
    source: { type: "string" },
    isAssumption: { type: "boolean" },
  },
  required: ["code", "type", "statement", "priority", "useCaseCodes", "source", "isAssumption"],
};
const MARKDOWN_TOOL = (name: string, description: string) => ({
  name,
  description,
  input_schema: { type: "object", properties: { markdown: { type: "string", description: "The full Markdown content" } }, required: ["markdown"] },
});

/** Kiểm tra Markdown AI trả về: có nội dung và đủ số mục "## ". */
function checkMarkdown(raw: any, minSections: number): { value?: string; errors?: string[] } {
  const md = String(raw?.markdown ?? "").trim();
  if (!md) return { errors: ["Missing markdown"] };
  const n = splitSections(md).sections.length;
  if (n < minSections) return { errors: [`At least ${minSections} "## " sections are required, found ${n}`] };
  return { value: md + "\n" };
}

// =============================================================== Đầu vào chung
export interface DocGenInput {
  moduleId: string;
  moduleName: string;
  stories: UserStory[];
  storiesText: string;
  /** Nội dung + dữ liệu các bước trước (đã Xong/Đã duyệt). */
  brd?: string;
  ucSpec?: { content: string; useCases: DocUseCase[] };
  srs?: { content: string; srs: SrsDoc | null };
  frd?: { content: string; requirements: Requirement[] };
}

export interface DocGenResult {
  content: string;
  data: ModuleDocData | null;
}

/** Sinh một tài liệu theo bước. Người gọi bảo đảm đầu vào của bước trước đã có. */
export async function generateDoc(kind: DocKind, input: DocGenInput): Promise<DocGenResult> {
  switch (kind) {
    case "BRD":
      return { content: await generateBrd(input), data: null };
    case "UC_SPEC": {
      const useCases = await generateUcSpec(input);
      return { content: ucMarkdown(useCases, input.moduleName), data: { useCases } };
    }
    case "SRS": {
      const srs = await generateSrsDoc(input);
      return { content: srsMarkdown(srs, input.moduleName), data: { srs } };
    }
    case "FRD_NFR": {
      const requirements = await generateFrd(input);
      return { content: reqMarkdown(requirements, input.moduleName), data: { requirements } };
    }
    case "API_SPEC":
      return { content: await generateApiSpec(input), data: null };
  }
}

// ---------------------------------------------------------------- 1. BRD ← user story
async function generateBrd(input: DocGenInput): Promise<string> {
  const prompt = `Write a BRD (Business Requirements Document) for module "${input.moduleName}" from the user stories below.
Start with the line "# BRD – ${input.moduleName}". Required sections (use "## "):
## 1. Background and Objectives
## 2. Scope (### In Scope / ### Out of Scope)
## 3. Stakeholders (table | Stakeholder | Role | Related stories |)
## 4. Business Requirements (table | ID | Business requirement | Benefit | Priority | Story |, IDs BR-01, BR-02…)
## 5. Acceptance Criteria (### per story, bullet list)
## 6. Assumptions and Constraints

## Module user stories
${clip(input.storiesText)}`;
  return runAI({
    type: "generate_doc_brd",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: MARKDOWN_TOOL("submit_brd", "Return the whole BRD as Markdown"),
    maxTokens: 12000,
    parse: (raw) => checkMarkdown(raw, 5),
    mock: () => mockBrd(input),
  });
}

export function mockBrd(input: DocGenInput): string {
  const st = input.stories;
  const actors = [...new Set(st.map(actorOf))];
  const L: string[] = [`# BRD – ${input.moduleName}`, ""];
  L.push("## 1. Background and Objectives", "");
  L.push(`Module **${input.moduleName}** is built to satisfy ${st.length} user ${st.length === 1 ? "story" : "stories"} from: ${actors.join(", ")}.`, "");
  L.push("Business objectives:");
  for (const s of st) L.push(`- ${goalOf(s.soThat) ? cap(goalOf(s.soThat)) : `${actorOf(s)} can ${verbPhrase(featureOf(s))}`} (${s.code})`);
  L.push("", "## 2. Scope", "", "### In Scope");
  for (const s of st) L.push(`- ${featureOf(s)} (${s.code})`);
  L.push("", "### Out of Scope", "- Features not listed in the module's user stories (any addition must be confirmed by the BA).", "- Integration with external systems that have not been described.", "");
  L.push("## 3. Stakeholders", "", "| Stakeholder | Role | Related stories |", "|---|---|---|");
  for (const a of actors) L.push(`| ${cell(a)} | Direct user of the feature | ${st.filter((s) => actorOf(s) === a).map((s) => s.code).join(", ")} |`);
  L.push("| BA Lead / Product Owner | Approves requirements and performs acceptance | All |", "");
  L.push("## 4. Business Requirements", "", "| ID | Business requirement | Benefit | Priority | Story |", "|---|---|---|---|---|");
  st.forEach((s, i) => L.push(`| BR-${pad2(i + 1)} | ${cell(`${actorOf(s)} can ${verbPhrase(featureOf(s))}`)} | ${cell(goalOf(s.soThat) ? cap(goalOf(s.soThat)) : "(not stated – to be completed by the BA)")} | ${s.priority} | ${s.code} |`));
  L.push("", "## 5. Acceptance Criteria", "");
  for (const s of st) {
    L.push(`### ${s.code} – ${featureOf(s)}`);
    if (s.acceptanceCriteria.length) for (const a of s.acceptanceCriteria) L.push(`- ${a}`);
    else L.push("- No acceptance criteria yet – to be completed by the BA.");
    L.push("");
  }
  L.push("## 6. Assumptions and Constraints", "");
  L.push("- Users have been given an account and the appropriate permissions before using the feature.");
  L.push("- Content is derived from the user stories; unclear points must be confirmed by the BA with the stakeholders.");
  if (st.some((s) => !s.acceptanceCriteria.length)) L.push(`- Stories without acceptance criteria: ${st.filter((s) => !s.acceptanceCriteria.length).map((s) => s.code).join(", ")}.`);
  return L.join("\n").trim() + "\n";
}

// ---------------------------------------------------------------- 2. UC Specification ← BRD + story
async function generateUcSpec(input: DocGenInput): Promise<DocUseCase[]> {
  const storyCodes = new Set(input.stories.map((s) => s.code));
  const prompt = `Write the use case specifications for module "${input.moduleName}" from the BRD and user stories below.
- Use case IDs: UC-01, UC-02…; each use case is one business goal of an actor (do not split per minor button).
- storyCodes: source user story IDs (only IDs from the list). Every story must belong to at least one use case.
- Main flow: each step names its actor (an actor name or "System"). Alternative flows use IDs A1, A2…; exception flows E1, E2… (branchFrom = the step they branch from).
- businessRules: taken from the acceptance criteria and business requirements. Anything inferred goes into assumptions.

## BRD
${clip(input.brd ?? "")}

## User stories
${clip(input.storiesText, 15000)}`;
  return runAI({
    type: "generate_doc_uc_spec",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: { name: "submit_use_cases", description: "Return the list of use cases", input_schema: { type: "object", properties: { useCases: { type: "array", items: UC_SCHEMA } }, required: ["useCases"] } },
    maxTokens: 16000,
    parse: (raw: any) => {
      if (!Array.isArray(raw?.useCases) || !raw.useCases.length) return { errors: ["useCases is empty"] };
      const ucs = raw.useCases.map(coerceDocUseCase) as DocUseCase[];
      const errors: string[] = [];
      if (new Set(ucs.map((u) => u.code)).size !== ucs.length) errors.push("Duplicate use case ID");
      for (const u of ucs) {
        if (!/^UC-\d+$/.test(u.code)) errors.push(`Malformed use case ID: ${u.code}`);
        if (!u.mainFlow.length) errors.push(`${u.code} has no main flow`);
        u.storyCodes = (u.storyCodes ?? []).filter((c) => storyCodes.has(c));
      }
      return errors.length ? { errors } : { value: ucs };
    },
    mock: () => mockUcSpec(input),
  });
}

export function mockUcSpec(input: DocGenInput): DocUseCase[] {
  return input.stories.map((s, i) => {
    const actor = actorOf(s);
    const name = featureOf(s);
    const read = READ_RE.test(s.iWant);
    const goal = goalOf(s.soThat);
    const mainFlow: FlowStep[] = read
      ? [
          { no: 1, actor, text: `Selects the "${name}" function` },
          { no: 2, actor: SYSTEM_ACTOR, text: "Displays the data list and the filter fields" },
          { no: 3, actor, text: "Enters or selects the search criteria" },
          { no: 4, actor: SYSTEM_ACTOR, text: "Filters and displays the matching results" },
        ]
      : [
          { no: 1, actor, text: `Selects the "${name}" function` },
          { no: 2, actor: SYSTEM_ACTOR, text: "Displays the corresponding screen / form" },
          { no: 3, actor, text: "Enters or selects the required information and confirms" },
          { no: 4, actor: SYSTEM_ACTOR, text: "Validates the data against the business rules" },
          { no: 5, actor: SYSTEM_ACTOR, text: "Saves the result and shows a success message" },
        ];
    return {
      code: `UC-${pad2(i + 1)}`,
      name,
      actors: [actor],
      storyCodes: [s.code],
      description: `${actor} wants to ${verbPhrase(name)}${goal ? ` so that ${low(goal)}` : ""}.`,
      trigger: `${actor} selects the "${name}" function`,
      preconditions: [`${actor} is signed in and has permission to use the function`],
      postconditions: [goal ? `Goal achieved: ${low(goal)}` : `The "${name}" request is recorded by the system`],
      mainFlow,
      altFlows: [{ code: "A1", name: "User cancels the operation", branchFrom: 3, steps: [`${actor} selects Cancel`, "System closes the screen without saving changes"] }],
      exceptions: read
        ? [{ code: "E1", name: "No matching data", branchFrom: 4, steps: ['System displays the message "No matching data found"'] }]
        : [
            { code: "E1", name: "Invalid data", branchFrom: 4, steps: ["System shows an error on the invalid field", "Return to step 3"] },
            { code: "E2", name: "System error while saving", branchFrom: 5, steps: ["System reports that saving failed and keeps the entered data"] },
          ],
      businessRules: [...s.acceptanceCriteria],
      screenIds: [],
      assumptions: s.acceptanceCriteria.length ? [] : ["The story has no acceptance criteria – business rules must be completed by the BA"],
    };
  });
}

// ---------------------------------------------------------------- 3. SRS ← UC Specification
const SRS_NEED: [string, string][] = [
  ["intro", "1. Introduction"],
  ["overview", "2. Overall Description"],
  ["functional", "3. Functional Requirements"],
  ["nonfunctional", "4. Non-functional Requirements"],
  ["interfaces", "5. User Interfaces"],
  ["data", "6. Data Requirements"],
  ["assumptions", "7. Assumptions and Open Issues"],
];

async function generateSrsDoc(input: DocGenInput): Promise<SrsDoc> {
  const prompt = `Write an SRS following the ISO/IEC/IEEE 29148 structure for module "${input.moduleName}" from the UC Specification below.
Required sections (key – title):
${SRS_NEED.map(([k, t]) => `- ${k} – ${t}`).join("\n")}
Each section's content is Markdown (### sub-headings, bullet lists, tables); do NOT use "## " inside a section.
The functional section describes each use case (inputs, processing, outputs, rules). Any non-functional requirement you add must be marked "(Assumption – to be confirmed)".

## UC Specification
${clip(input.ucSpec?.content ?? "")}`;
  return runAI({
    type: "generate_doc_srs",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: {
      name: "submit_srs",
      description: "Return the SRS sections",
      input_schema: {
        type: "object",
        properties: { sections: { type: "array", items: { type: "object", properties: { key: { type: "string" }, title: { type: "string" }, content: { type: "string" } }, required: ["key", "title", "content"] } } },
        required: ["sections"],
      },
    },
    maxTokens: 16000,
    parse: (raw: any) => {
      const sections: SrsSection[] = Array.isArray(raw?.sections) ? raw.sections.map((s: any) => ({ key: String(s?.key ?? ""), title: String(s?.title ?? ""), content: String(s?.content ?? "") })) : [];
      const missing = SRS_NEED.map(([k]) => k).filter((k) => !sections.some((s) => s.key === k));
      return missing.length ? { errors: [`Missing sections: ${missing.join(", ")}`] } : { value: { sections } };
    },
    mock: () => mockSrsDoc(input),
  });
}

export function mockSrsDoc(input: DocGenInput): SrsDoc {
  const ucs = input.ucSpec?.useCases ?? [];
  const actors = [...new Set(ucs.flatMap((u) => u.actors))];
  const body: Record<string, string[]> = {
    intro: [
      "### 1.1 Purpose",
      `Software requirements specification for module **${input.moduleName}**, serving as the basis for design, development and testing.`,
      "### 1.2 Scope",
      ...ucs.map((u) => `- ${u.code} – ${u.name}`),
      "### 1.3 References",
      "- Module BRD",
      "- Module UC Specification",
    ],
    overview: [
      "### 2.1 Actors",
      "| Actor | Use case |",
      "|---|---|",
      ...actors.map((a) => `| ${cell(a)} | ${ucs.filter((u) => u.actors.includes(a)).map((u) => u.code).join(", ")} |`),
      "### 2.2 General Constraints",
      "- Every function requires the user to be signed in with the appropriate permissions.",
      "- The user interface and messages are displayed in English.",
    ],
    functional: ucs.flatMap((u) => [
      `### ${u.code} – ${u.name}`,
      u.description,
      `- **Actors:** ${u.actors.join(", ")}`,
      `- **Inputs:** ${u.mainFlow.filter((s) => !isSystem(s.actor)).map((s) => s.text).join("; ") || "(none)"}`,
      `- **Processing:** ${u.mainFlow.filter((s) => isSystem(s.actor)).map((s) => s.text).join("; ") || "(none)"}`,
      `- **Outputs:** ${u.postconditions.join("; ") || "(none)"}`,
      ...u.businessRules.map((r) => `- **Rule:** ${r}`),
      ...u.exceptions.map((e) => `- **Exception ${e.code}:** ${e.name}`),
    ]),
    nonfunctional: [
      "- Performance: main operations respond within 2 seconds with 100 concurrent users (Assumption – to be confirmed).",
      "- Security: user authentication and role-based access control for every function (Assumption – to be confirmed).",
      "- Audit: record who performed each data-changing operation and when (Assumption – to be confirmed).",
      "- Availability: 99.5% uptime during business hours (Assumption – to be confirmed).",
    ],
    interfaces: [
      "| Use case | Proposed screen | Main actions |",
      "|---|---|---|",
      ...ucs.map((u) => `| ${u.code} | ${cell(u.name)} | ${cell(u.mainFlow.filter((s) => !isSystem(s.actor)).map((s) => s.text).join("; "))} |`),
    ],
    data: ["| Data | Description | Use case |", "|---|---|---|", ...ucs.map((u) => `| ${cell(`${cap(u.name)} information`)} | Data created/read in ${u.code} | ${u.code} |`)],
    assumptions: [
      ...ucs.flatMap((u) => u.assumptions.map((a) => `- ${u.code}: ${a}`)),
      "- Field-level details will be clarified once the screen design (prototype) is available.",
    ],
  };
  return { sections: SRS_NEED.map(([key, title]) => ({ key, title, content: body[key].filter((x) => x !== undefined).join("\n") })) };
}

// ---------------------------------------------------------------- 4. FRD-NFR ← SRS + UC
async function generateFrd(input: DocGenInput): Promise<Requirement[]> {
  const ucCodes = new Set((input.ucSpec?.useCases ?? []).map((u) => u.code));
  const prompt = `List the functional (FR) and non-functional (NFR) requirements for module "${input.moduleName}" from the SRS and use cases below.
- IDs FR-01…, NFR-01…; every use case has at least 1 FR; every important business rule becomes 1 validation FR.
- useCaseCodes may only use use case IDs from the list. Self-proposed NFRs have isAssumption = true.
- source: where the requirement comes from (e.g. "UC-01 main flow", "SRS section 4").

## SRS
${clip(input.srs?.content ?? "", 20000)}

## Use cases (ID – name)
${(input.ucSpec?.useCases ?? []).map((u) => `- ${u.code} – ${u.name}`).join("\n")}`;
  return runAI({
    type: "generate_doc_frd_nfr",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: { name: "submit_requirements", description: "Return the list of FR/NFR requirements", input_schema: { type: "object", properties: { requirements: { type: "array", items: REQ_SCHEMA } }, required: ["requirements"] } },
    maxTokens: 12000,
    parse: (raw: any) => {
      if (!Array.isArray(raw?.requirements) || !raw.requirements.length) return { errors: ["requirements is empty"] };
      const reqs = raw.requirements.map(coerceDocRequirement) as Requirement[];
      const errors: string[] = [];
      if (new Set(reqs.map((r) => r.code)).size !== reqs.length) errors.push("Duplicate requirement ID");
      if (!reqs.some((r) => r.type === "FR")) errors.push("There is no FR");
      for (const r of reqs) for (const c of r.useCaseCodes) if (!ucCodes.has(c)) errors.push(`${r.code} references a use case that does not exist: ${c}`);
      return errors.length ? { errors } : { value: reqs };
    },
    mock: () => mockFrd(input),
  });
}

export function mockFrd(input: DocGenInput): Requirement[] {
  const ucs = input.ucSpec?.useCases ?? [];
  const prio = (u: DocUseCase) => input.stories.find((s) => u.storyCodes?.includes(s.code))?.priority ?? "Medium";
  const out: Requirement[] = [];
  let fr = 0;
  const frCode = () => `FR-${pad2(++fr)}`;
  for (const u of ucs) {
    out.push({ code: frCode(), type: "FR", statement: `The system shall allow ${u.actors.join(", ") || "the user"} to ${verbPhrase(u.name)}.`, priority: prio(u), useCaseCodes: [u.code], source: `${u.code} main flow`, isAssumption: false });
    for (const r of u.businessRules) out.push({ code: frCode(), type: "FR", statement: `The system shall ensure that: ${tidy(r)}.`, priority: "Medium", useCaseCodes: [u.code], source: `${u.code} business rule`, isAssumption: false });
    const bad = u.exceptions.find((e) => /không hợp lệ|invalid/i.test(e.name)); // vi-keep: tên ngoại lệ UC cũ tiếng Việt
    if (bad) out.push({ code: frCode(), type: "FR", statement: `The system shall validate the input data of "${u.name}" and show a clear error on each invalid field.`, priority: "Medium", useCaseCodes: [u.code], source: `${u.code} ${bad.code}`, isAssumption: false });
  }
  const all = ucs.map((u) => u.code);
  const nfr = [
    ["Main operations shall respond within 2 seconds with 100 concurrent users.", "Medium"],
    ["Every function shall require authentication and role-based authorisation.", "High"],
    ["The system shall log who performed each data-changing operation and when.", "Medium"],
    ["The system shall be available 99.5% of the time during business hours.", "Low"],
  ] as const;
  nfr.forEach(([s, p], i) => out.push({ code: `NFR-${pad2(i + 1)}`, type: "NFR", statement: s, priority: p, useCaseCodes: all, source: "SRS section 4 – default suggestion", isAssumption: true }));
  return out;
}

// ---------------------------------------------------------------- 5. API Spec ← FRD + UC
async function generateApiSpec(input: DocGenInput): Promise<string> {
  const prompt = `Write the API specification (REST, JSON) for module "${input.moduleName}" from the FRD-NFR and use cases below.
Start with "# API Spec – ${input.moduleName}"; the first section is "## General Conventions" (base URL, authentication, error format).
One section per endpoint "## <METHOD> <path>" containing: description, related use case and FRs, a Request table (| Field | Type | Required | Description |),
a Response table (| Field | Type | Description |), an Error codes table (| HTTP status | Error code | When |). Do not use code blocks; mark anything inferred with "(Assumption)".

## FRD-NFR
${clip(input.frd?.content ?? "", 15000)}

## UC Specification
${clip(input.ucSpec?.content ?? "", 15000)}`;
  return runAI({
    type: "generate_doc_api_spec",
    moduleId: input.moduleId,
    system: SYSTEM + "\nWhen writing the API specification you also act as a Solution Architect.",
    prompt,
    tool: MARKDOWN_TOOL("submit_api_spec", "Return the API specification as Markdown"),
    maxTokens: 16000,
    parse: (raw) => {
      const r = checkMarkdown(raw, 2);
      if (r.value && !/\b(GET|POST|PUT|PATCH|DELETE)\b/.test(r.value)) return { errors: ["There are no endpoints (GET/POST/PUT/PATCH/DELETE)"] };
      return r;
    },
    mock: () => mockApiSpec(input),
  });
}

// vi-keep-start: từ khoá nhận diện trường dữ liệu (UC cũ tiếng Việt), song song tiếng Anh
const FIELD_HINTS: [RegExp, string, string, string][] = [
  [/email/i, "email", "string", "Email address"],
  [/mật khẩu|password/i, "password", "string", "Password"],
  [/tên đăng nhập|tài khoản|username|account/i, "username", "string", "Username"],
  [/họ tên|tên khách|tên người|full name|customer name/i, "fullName", "string", "Full name"],
  [/điện thoại|sđt|phone/i, "phone", "string", "Phone number"],
  [/địa chỉ|address/i, "address", "string", "Address"],
  [/ngày|thời gian|hạn|\bdate\b|deadline|\bdue\b/i, "date", "string (YYYY-MM-DD)", "Date"],
  [/số lượng|quantity/i, "quantity", "number", "Quantity"],
  [/giá|tiền|thanh toán|price|amount|payment|\bpay\b/i, "amount", "number", "Amount"],
  [/trạng thái|status/i, "status", "string", "Status"],
  [/mô tả|ghi chú|nội dung|lý do|description|note|comment|reason/i, "note", "string", "Note / content"],
  [/tệp|file|ảnh|tài liệu|image|photo|document|attachment/i, "fileId", "string", "Attachment file ID"],
];
// vi-keep-end

export function mockApiSpec(input: DocGenInput): string {
  const ucs = input.ucSpec?.useCases ?? [];
  const reqs = input.frd?.requirements ?? [];
  const L: string[] = [`# API Spec – ${input.moduleName}`, ""];
  L.push("## General Conventions", "");
  L.push("- Base URL: `/api/v1` (Assumption – to be confirmed)");
  L.push("- Format: JSON, UTF-8 encoded; timestamps in ISO 8601.");
  L.push("- Authentication: Bearer token in the `Authorization` header (Assumption – to be confirmed).");
  L.push('- Errors are returned as `{ "code": "<ERROR_CODE>", "message": "<human-readable message>" }`.', "");
  const used = new Set<string>();
  for (const u of ucs) {
    const text = `${u.name} ${u.description} ${u.businessRules.join(" ")}`;
    const method = READ_RE.test(u.name) ? "GET" : DELETE_RE.test(u.name) ? "DELETE" : UPDATE_RE.test(u.name) ? "PUT" : "POST";
    let base = slugify(u.name);
    if (used.has(`${method} ${base}`)) base = `${base}-${u.code.toLowerCase()}`;
    used.add(`${method} ${base}`);
    const path = `/api/v1/${base}${method === "PUT" || method === "DELETE" || (method === "GET" && DETAIL_RE.test(u.name)) ? "/{id}" : ""}`;
    const frs = reqs.filter((r) => r.type === "FR" && r.useCaseCodes.includes(u.code)).map((r) => r.code);
    L.push(`## ${method} ${path}`, "");
    L.push(`**Description:** ${u.description || u.name}`, "");
    L.push(`**Use case:** ${u.code} – ${u.name}${frs.length ? ` · **Requirements:** ${frs.join(", ")}` : ""}`, "");
    L.push(method === "GET" ? "**Request (query)**" : "**Request (body)**", "", "| Field | Type | Required | Description |", "|---|---|---|---|");
    if (path.endsWith("{id}")) L.push("| id (path) | string | Yes | Record ID |");
    if (method === "GET") {
      L.push("| keyword | string | No | Search keyword |", "| page | number | No | Page (default 1) |", "| pageSize | number | No | Rows per page (default 20) |");
    } else if (method !== "DELETE") {
      const fields = FIELD_HINTS.filter(([re]) => re.test(text));
      if (fields.length) for (const [, f, t, d] of fields) L.push(`| ${f} | ${t} | Yes | ${d} (Assumption) |`);
      else L.push(`| data | object | Yes | ${cap(u.name)} details – field-level details to be added once the prototype exists (Assumption) |`);
    }
    L.push("", `**Response ${method === "POST" ? "201" : "200"}**`, "", "| Field | Type | Description |", "|---|---|---|");
    if (method === "GET") L.push("| items | array | Result list |", "| total | number | Total number of records |");
    else if (method === "DELETE") L.push("| ok | boolean | true when deleted successfully |");
    else L.push("| id | string | Record ID |", "| updatedAt | string | Last updated time |");
    L.push("", "**Error codes**", "", "| HTTP status | Error code | When |", "|---|---|---|");
    for (const e of u.exceptions) {
      // vi-keep-start: tên ngoại lệ UC cũ tiếng Việt, song song tiếng Anh
      const [http, code] = /không có dữ liệu|không tìm thấy|no matching|not found/i.test(e.name)
        ? ["404", "NOT_FOUND"]
        : /hệ thống|system/i.test(e.name)
          ? ["500", "INTERNAL_ERROR"]
          : /không hợp lệ|sai|invalid/i.test(e.name)
            ? ["400", "INVALID_INPUT"]
            : ["409", slugify(e.name).toUpperCase().replace(/-/g, "_")];
      // vi-keep-end
      L.push(`| ${http} | ${code} | ${cell(`${e.code} – ${e.name}`)} |`);
    }
    L.push("| 401 | UNAUTHORIZED | Not signed in or the session has expired |", "| 403 | FORBIDDEN | Not permitted to perform the action |", "");
  }
  if (!ucs.length) L.push("## Endpoint", "", "- There are no use cases to derive endpoints from yet.");
  return L.join("\n").trim() + "\n";
}

// =============================================================== Chỉnh bằng AI theo mục
export interface RefineInput {
  moduleId: string;
  moduleName: string;
  kind: DocKind;
  /** Tiêu đề mục (sau "## "); null = cả tài liệu. */
  section: string | null;
  /** Markdown của mục (hoặc cả tài liệu). */
  markdown: string;
  instruction: string;
  /** Bối cảnh ngắn (vd danh sách UC) giúp AI giữ nhất quán. */
  context: string;
}

/** Trả về Markdown mới của mục (bắt đầu bằng "## <tiêu đề>") hoặc của cả tài liệu. */
export async function refineDocSection(args: RefineInput): Promise<string> {
  const label = DOC_KIND_LABEL[args.kind];
  const ucCode = args.kind === "UC_SPEC" && args.section ? /^(UC-\d+)/.exec(args.section)?.[1] : undefined;
  const scope = args.section ? `section "${args.section}"` : "the whole document";
  const prompt = `Refine ${scope} of the ${label} document (module "${args.moduleName}") according to the BA's request.
Keep the existing Markdown format, keep all IDs (UC-xx, FR-xx, BR-xx…) and all unrelated parts unchanged.
${args.section ? `Return the whole section, keeping the first line "## ${args.section}" unchanged.` : "Return the whole document."}

## Refinement request
${args.instruction}

## Current content
${clip(args.markdown)}

## Context
${clip(args.context, 8000)}`;
  return runAI({
    type: `refine_doc_${args.kind.toLowerCase()}`,
    moduleId: args.moduleId,
    system: SYSTEM,
    prompt,
    tool: MARKDOWN_TOOL("submit_markdown", "Return the refined Markdown"),
    maxTokens: 16000,
    parse: (raw: any) => {
      let md = String(raw?.markdown ?? "").trim();
      if (!md) return { errors: ["Missing markdown"] };
      if (args.section && !md.startsWith("## ")) md = `## ${args.section}\n\n${md}`;
      if (ucCode) {
        const ucs = parseUcMarkdown(md);
        if (ucs.length !== 1 || ucs[0].code !== ucCode) return { errors: [`The section must be exactly one use case ${ucCode} in the existing format`] };
        if (!ucs[0].mainFlow.length) return { errors: [`${ucCode} has no main flow`] };
      }
      return { value: md + "\n" };
    },
    mock: () => mockRefine(args),
  });
}

/** Mock: không tự hiểu chỉ dẫn – ghi chỉ dẫn vào tài liệu để BA chỉnh tay (UC thì thêm vào "Assumptions"). */
export function mockRefine(args: RefineInput): string {
  const note = `BA refinement request: ${tidy(args.instruction)} (rule-based mode cannot apply this automatically – edit manually)`;
  const md = args.markdown.replace(/\s+$/, "");
  if (args.kind === "UC_SPEC" && args.section && /^UC-\d+/.test(args.section)) {
    const lines = md.split("\n");
    const at = lines.findIndex((l) => /^\*\*(?:Assumptions|Giả định):\*\*$/i.test(l.trim())); // vi-keep: nhãn "Giả định" của UC cũ
    if (at >= 0) {
      let end = at + 1;
      while (end < lines.length && /^\s*[-*]\s+/.test(lines[end])) end++;
      lines.splice(end, 0, `- ${note}`);
      return lines.join("\n") + "\n";
    }
    return `${md}\n\n**Assumptions:**\n- ${note}\n`;
  }
  return `${md}\n\n> **Refinement note (BA):** ${tidy(args.instruction)}\n`;
}
