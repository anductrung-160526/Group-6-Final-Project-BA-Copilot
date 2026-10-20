// Pipeline AI cho 5 tài liệu theo bước: BRD → UC Specification → SRS → FRD-NFR → API Spec. Chủ sở hữu: C5.
// Mỗi loại có bản Claude (tool use + kiểm tra kết quả qua runAI) và bản Mock (rule-based, chạy khi không có API key).
// Chuỗi đầu vào (kế hoạch đợt 5, mục 3 "C5"):
//   BRD ← user story của module · UC_SPEC ← BRD + story · SRS ← UC_SPEC · FRD_NFR ← SRS + UC · API_SPEC ← FRD + UC.
// UC_SPEC / FRD_NFR / SRS lưu thêm dữ liệu cấu trúc (`ModuleDocData`); Markdown của chúng sinh từ cấu trúc, và khi BA
// sửa tay / chỉnh bằng AI thì cấu trúc được đọc ngược lại từ Markdown (`deriveDocData`).
// Không sửa server/ai/pipelines.ts, mock.ts (của C9) – tệp này tự chứa schema và bộ dựng riêng.

import { runAI } from "./client.ts";
import { DOC_KIND_LABEL } from "../../shared/types.ts";
import type { AltFlow, DocKind, FlowStep, ModuleDocData, Requirement, SrsDoc, SrsSection, UseCase, UserStory } from "../../shared/types.ts";

/** UseCase kèm mã story nguồn (để truy vết Story → UC). Trường thêm, không có trong kiểu chung. */
export type DocUseCase = UseCase & { storyCodes?: string[] };

const SYSTEM = `Bạn là Senior Business Analyst trong hệ thống BA Copilot.
Nguyên tắc:
- Viết toàn bộ nội dung bằng tiếng Việt, rõ ràng, súc tích, đúng thuật ngữ phân tích nghiệp vụ.
- Chỉ dựa trên dữ liệu đầu vào. Điều gì phải suy diễn thì ghi rõ là giả định để BA xác nhận, KHÔNG trình bày như sự thật.
- Markdown: tiêu đề mục dùng "## ", mục con dùng "### ", danh sách "- ", bảng "| … |". KHÔNG dùng khối mã \`\`\` và KHÔNG dùng tiêu đề "#### ".
- Luôn trả kết quả bằng cách gọi đúng tool được yêu cầu.`;

const MAX_CTX = 30000;
const clip = (s: string, n = MAX_CTX) => (s.length > n ? s.slice(0, n) + "\n…(đã cắt bớt)" : s);

// =============================================================== Tiện ích chữ
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const low = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const tidy = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.;,]+$/, "");
const pad2 = (n: number) => String(n).padStart(2, "0");
const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ");

/** Bỏ dấu tiếng Việt → chữ thường, gạch nối (dùng cho đường dẫn API). */
export function slugify(s: string, maxWords = 5): string {
  const ascii = s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const words = ascii.split(/[^a-z0-9]+/).filter(Boolean);
  return words.slice(0, maxWords).join("-") || "tai-nguyen";
}

const actorOf = (s: UserStory) => cap(tidy(s.asA)) || "Người dùng";
const featureOf = (s: UserStory) => cap(tidy(s.iWant).slice(0, 90)) || `Chức năng ${s.code}`;
const READ_RE = /xem|tra cứu|tìm|danh sách|liệt kê|báo cáo|thống kê|lọc|theo dõi/i;

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
    if (uc.storyCodes?.length) out.push(`**Story nguồn:** ${uc.storyCodes.join(", ")}`, "");
    if (uc.description) out.push(`**Mô tả:** ${uc.description}`, "");
    if (uc.trigger) out.push(`**Kích hoạt:** ${uc.trigger}`, "");
    const list = (title: string, items: string[]) => (items.length ? out.push(`**${title}:**`, ...items.map((x) => `- ${x}`), "") : 0);
    list("Tiền điều kiện", uc.preconditions);
    list("Hậu điều kiện", uc.postconditions);
    if (uc.mainFlow.length) out.push("**Luồng chính:**", ...uc.mainFlow.map((s, i) => `${s.no || i + 1}. ${s.actor ? `${s.actor}: ` : ""}${s.text}`), "");
    for (const f of [...uc.altFlows, ...uc.exceptions]) out.push(`**${f.code} – ${f.name}** (rẽ từ bước ${f.branchFrom}):`, ...f.steps.map((s, i) => `${i + 1}. ${s}`), "");
    list("Quy tắc nghiệp vụ", uc.businessRules);
    list("Giả định", uc.assumptions);
  }
  return out.join("\n").trim() + "\n";
}

export function reqMarkdown(reqs: Requirement[], moduleName: string): string {
  const table = (type: "FR" | "NFR") => {
    const rows = reqs.filter((r) => r.type === type);
    return [
      `## ${type === "FR" ? "Yêu cầu chức năng (FR)" : "Yêu cầu phi chức năng (NFR)"}`,
      "",
      ...(rows.length
        ? [
            "| Mã | Yêu cầu | Ưu tiên | Use case | Nguồn |",
            "|---|---|---|---|---|",
            ...rows.map((r) => `| ${cell(r.code)} | ${cell(r.statement)}${r.isAssumption ? " _(giả định)_" : ""} | ${cell(r.priority)} | ${cell(r.useCaseCodes.join(", "))} | ${cell(r.source)} |`),
          ]
        : ["- (chưa có)"]),
      "",
    ];
  };
  return [`# FRD-NFR – ${moduleName}`, "", ...table("FR"), ...table("NFR")].join("\n").trim() + "\n";
}

export function srsMarkdown(srs: SrsDoc, moduleName: string): string {
  return [`# SRS – ${moduleName}`, "", ...srs.sections.flatMap((s) => [`## ${s.title}`, "", s.content.trim(), ""])].join("\n").trim() + "\n";
}

// =============================================================== Đọc ngược cấu trúc từ Markdown
const FLOW_RE = /^\*\*([AE]\d+)\s*[–-]\s*(.+?)\*\*\s*(?:\(rẽ từ bước\s*(\d+)\))?:?\s*$/;
const FIELD_RE = /^\*\*(.+?):\*\*\s*(.*)$/;

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
        const [key, val] = [f[1].trim().toLowerCase(), f[2].trim()];
        mode = null;
        if (key === "actor") uc.actors = val.split(",").map((x) => x.trim()).filter(Boolean);
        else if (key === "story nguồn") uc.storyCodes = val.split(/[,\s]+/).filter((x) => /^US-\d+/.test(x));
        else if (key === "mô tả") uc.description = val;
        else if (key === "kích hoạt") uc.trigger = val;
        else if (key === "tiền điều kiện") mode = "pre";
        else if (key === "hậu điều kiện") mode = "post";
        else if (key === "luồng chính") mode = "main";
        else if (key === "quy tắc nghiệp vụ") mode = "rules";
        else if (key === "giả định") mode = "assume";
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
    const isAssumption = /_\(giả định\)_|\(giả định\)/i.test(st);
    const pr = cells[2] ?? "";
    out.push({
      code,
      type: code.startsWith("NFR") ? "NFR" : "FR",
      statement: st.replace(/\s*_?\(giả định\)_?/i, "").trim(),
      priority: pr === "High" || pr === "Low" ? pr : "Medium",
      useCaseCodes: (cells[3] ?? "").split(/[,\s]+/).filter((x) => /^UC-\d+$/.test(x)),
      source: cells[4] ?? "",
      isAssumption,
    });
  }
  return out;
}

const SRS_KEYS: [RegExp, string][] = [
  [/giới thiệu/i, "intro"],
  [/tổng quan/i, "overview"],
  [/phi chức năng/i, "nonfunctional"],
  [/chức năng/i, "functional"],
  [/giao diện/i, "interfaces"],
  [/dữ liệu/i, "data"],
  [/giả định|vấn đề mở/i, "assumptions"],
];
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
    storyCodes: { type: "array", items: { type: "string" }, description: "Mã user story nguồn (US-xx)" },
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
    code: { type: "string", description: "FR-01… hoặc NFR-01…" },
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
  input_schema: { type: "object", properties: { markdown: { type: "string", description: "Toàn bộ nội dung Markdown" } }, required: ["markdown"] },
});

/** Kiểm tra Markdown AI trả về: có nội dung và đủ số mục "## ". */
function checkMarkdown(raw: any, minSections: number): { value?: string; errors?: string[] } {
  const md = String(raw?.markdown ?? "").trim();
  if (!md) return { errors: ["Thiếu markdown"] };
  const n = splitSections(md).sections.length;
  if (n < minSections) return { errors: [`Cần ít nhất ${minSections} mục "## ", hiện có ${n}`] };
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
  const prompt = `Soạn tài liệu BRD (Business Requirements Document) cho module "${input.moduleName}" từ các user story dưới đây.
Bắt đầu bằng dòng "# BRD – ${input.moduleName}". Các mục bắt buộc (dùng "## "):
## 1. Bối cảnh và mục tiêu
## 2. Phạm vi (### Trong phạm vi / ### Ngoài phạm vi)
## 3. Các bên liên quan (bảng | Bên liên quan | Vai trò | Story liên quan |)
## 4. Yêu cầu nghiệp vụ (bảng | Mã | Yêu cầu nghiệp vụ | Lợi ích | Ưu tiên | Story |, mã BR-01, BR-02…)
## 5. Tiêu chí chấp nhận (### theo từng story, gạch đầu dòng)
## 6. Giả định và ràng buộc

## User story của module
${clip(input.storiesText)}`;
  return runAI({
    type: "generate_doc_brd",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: MARKDOWN_TOOL("submit_brd", "Trả về toàn bộ BRD dạng Markdown"),
    maxTokens: 12000,
    parse: (raw) => checkMarkdown(raw, 5),
    mock: () => mockBrd(input),
  });
}

export function mockBrd(input: DocGenInput): string {
  const st = input.stories;
  const actors = [...new Set(st.map(actorOf))];
  const L: string[] = [`# BRD – ${input.moduleName}`, ""];
  L.push("## 1. Bối cảnh và mục tiêu", "");
  L.push(`Module **${input.moduleName}** được xây dựng để đáp ứng ${st.length} user story của: ${actors.join(", ")}.`, "");
  L.push("Mục tiêu nghiệp vụ:");
  for (const s of st) L.push(`- ${s.soThat.trim() ? cap(tidy(s.soThat)) : `${actorOf(s)} ${low(featureOf(s))}`} (${s.code})`);
  L.push("", "## 2. Phạm vi", "", "### Trong phạm vi");
  for (const s of st) L.push(`- ${featureOf(s)} (${s.code})`);
  L.push("", "### Ngoài phạm vi", "- Chức năng không có trong danh sách user story của module (bổ sung cần BA xác nhận).", "- Tích hợp với hệ thống bên ngoài chưa được mô tả.", "");
  L.push("## 3. Các bên liên quan", "", "| Bên liên quan | Vai trò | Story liên quan |", "|---|---|---|");
  for (const a of actors) L.push(`| ${cell(a)} | Người dùng trực tiếp của chức năng | ${st.filter((s) => actorOf(s) === a).map((s) => s.code).join(", ")} |`);
  L.push("| BA Lead / Chủ sản phẩm | Duyệt yêu cầu và nghiệm thu | Tất cả |", "");
  L.push("## 4. Yêu cầu nghiệp vụ", "", "| Mã | Yêu cầu nghiệp vụ | Lợi ích | Ưu tiên | Story |", "|---|---|---|---|---|");
  st.forEach((s, i) => L.push(`| BR-${pad2(i + 1)} | ${cell(`${actorOf(s)} có thể ${low(featureOf(s))}`)} | ${cell(s.soThat.trim() ? cap(tidy(s.soThat)) : "(chưa nêu – cần BA bổ sung)")} | ${s.priority} | ${s.code} |`));
  L.push("", "## 5. Tiêu chí chấp nhận", "");
  for (const s of st) {
    L.push(`### ${s.code} – ${featureOf(s)}`);
    if (s.acceptanceCriteria.length) for (const a of s.acceptanceCriteria) L.push(`- ${a}`);
    else L.push("- Chưa có tiêu chí chấp nhận – cần BA bổ sung.");
    L.push("");
  }
  L.push("## 6. Giả định và ràng buộc", "");
  L.push("- Người dùng đã được cấp tài khoản và quyền phù hợp trước khi sử dụng chức năng.");
  L.push("- Nội dung được suy ra từ user story; điểm chưa rõ cần BA xác nhận với bên liên quan.");
  if (st.some((s) => !s.acceptanceCriteria.length)) L.push(`- Story chưa có tiêu chí chấp nhận: ${st.filter((s) => !s.acceptanceCriteria.length).map((s) => s.code).join(", ")}.`);
  return L.join("\n").trim() + "\n";
}

// ---------------------------------------------------------------- 2. UC Specification ← BRD + story
async function generateUcSpec(input: DocGenInput): Promise<DocUseCase[]> {
  const storyCodes = new Set(input.stories.map((s) => s.code));
  const prompt = `Lập đặc tả Use Case cho module "${input.moduleName}" từ BRD và user story dưới đây.
- Mã UC: UC-01, UC-02…; mỗi UC là một mục tiêu nghiệp vụ của tác nhân (không tách theo từng nút lặt vặt).
- storyCodes: mã user story nguồn (chỉ dùng mã có trong danh sách). Mọi story phải thuộc ít nhất một UC.
- Luồng chính: mỗi bước ghi actor là tên tác nhân hoặc "Hệ thống". Luồng thay thế mã A1, A2…; ngoại lệ mã E1, E2… (branchFrom = số bước rẽ ra).
- businessRules: lấy từ tiêu chí chấp nhận và yêu cầu nghiệp vụ. Điều suy diễn ghi vào assumptions.

## BRD
${clip(input.brd ?? "")}

## User story
${clip(input.storiesText, 15000)}`;
  return runAI({
    type: "generate_doc_uc_spec",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: { name: "submit_use_cases", description: "Trả về danh sách Use Case", input_schema: { type: "object", properties: { useCases: { type: "array", items: UC_SCHEMA } }, required: ["useCases"] } },
    maxTokens: 16000,
    parse: (raw: any) => {
      if (!Array.isArray(raw?.useCases) || !raw.useCases.length) return { errors: ["useCases rỗng"] };
      const ucs = raw.useCases.map(coerceDocUseCase) as DocUseCase[];
      const errors: string[] = [];
      if (new Set(ucs.map((u) => u.code)).size !== ucs.length) errors.push("Trùng mã UC");
      for (const u of ucs) {
        if (!/^UC-\d+$/.test(u.code)) errors.push(`Mã UC sai dạng: ${u.code}`);
        if (!u.mainFlow.length) errors.push(`${u.code} thiếu luồng chính`);
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
    const goal = s.soThat.trim() ? tidy(s.soThat) : "";
    const mainFlow: FlowStep[] = read
      ? [
          { no: 1, actor, text: `Chọn chức năng "${name}"` },
          { no: 2, actor: "Hệ thống", text: "Hiển thị danh sách dữ liệu và ô điều kiện lọc" },
          { no: 3, actor, text: "Nhập hoặc chọn điều kiện tra cứu" },
          { no: 4, actor: "Hệ thống", text: "Lọc và hiển thị kết quả phù hợp" },
        ]
      : [
          { no: 1, actor, text: `Chọn chức năng "${name}"` },
          { no: 2, actor: "Hệ thống", text: "Hiển thị màn hình / biểu mẫu tương ứng" },
          { no: 3, actor, text: "Nhập hoặc chọn thông tin cần thiết và xác nhận" },
          { no: 4, actor: "Hệ thống", text: "Kiểm tra dữ liệu theo quy tắc nghiệp vụ" },
          { no: 5, actor: "Hệ thống", text: "Lưu kết quả và thông báo thành công" },
        ];
    return {
      code: `UC-${pad2(i + 1)}`,
      name,
      actors: [actor],
      storyCodes: [s.code],
      description: `${actor} ${low(name)}${goal ? ` để ${low(goal)}` : ""}.`,
      trigger: `${actor} chọn chức năng "${name}"`,
      preconditions: [`${actor} đã đăng nhập và có quyền sử dụng chức năng`],
      postconditions: [goal ? `Đạt mục tiêu: ${low(goal)}` : `Yêu cầu "${name}" được hệ thống ghi nhận`],
      mainFlow,
      altFlows: [{ code: "A1", name: "Người dùng huỷ thao tác", branchFrom: 3, steps: [`${actor} chọn Huỷ`, "Hệ thống đóng màn hình, không lưu thay đổi"] }],
      exceptions: read
        ? [{ code: "E1", name: "Không có dữ liệu phù hợp", branchFrom: 4, steps: ['Hệ thống hiển thị thông báo "Không tìm thấy dữ liệu phù hợp"'] }]
        : [
            { code: "E1", name: "Dữ liệu không hợp lệ", branchFrom: 4, steps: ["Hệ thống báo lỗi tại trường không hợp lệ", "Quay lại bước 3"] },
            { code: "E2", name: "Lỗi hệ thống khi lưu", branchFrom: 5, steps: ["Hệ thống thông báo lưu không thành công và giữ dữ liệu đã nhập"] },
          ],
      businessRules: [...s.acceptanceCriteria],
      screenIds: [],
      assumptions: s.acceptanceCriteria.length ? [] : ["Story chưa có tiêu chí chấp nhận – quy tắc nghiệp vụ cần BA bổ sung"],
    };
  });
}

// ---------------------------------------------------------------- 3. SRS ← UC Specification
const SRS_NEED: [string, string][] = [
  ["intro", "1. Giới thiệu"],
  ["overview", "2. Mô tả tổng quan"],
  ["functional", "3. Yêu cầu chức năng"],
  ["nonfunctional", "4. Yêu cầu phi chức năng"],
  ["interfaces", "5. Giao diện người dùng"],
  ["data", "6. Dữ liệu"],
  ["assumptions", "7. Giả định và vấn đề mở"],
];

async function generateSrsDoc(input: DocGenInput): Promise<SrsDoc> {
  const prompt = `Soạn tài liệu SRS theo cấu trúc ISO/IEC/IEEE 29148 cho module "${input.moduleName}" từ UC Specification dưới đây.
Các mục bắt buộc (key – tiêu đề):
${SRS_NEED.map(([k, t]) => `- ${k} – ${t}`).join("\n")}
Nội dung mỗi mục là Markdown (### tiêu đề con, gạch đầu dòng, bảng); KHÔNG dùng "## " trong nội dung mục.
Mục functional mô tả từng UC (đầu vào, xử lý, đầu ra, quy tắc). Yêu cầu phi chức năng tự bổ sung phải ghi "(Giả định – cần xác nhận)".

## UC Specification
${clip(input.ucSpec?.content ?? "")}`;
  return runAI({
    type: "generate_doc_srs",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: {
      name: "submit_srs",
      description: "Trả về các mục của SRS",
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
      return missing.length ? { errors: [`Thiếu mục: ${missing.join(", ")}`] } : { value: { sections } };
    },
    mock: () => mockSrsDoc(input),
  });
}

export function mockSrsDoc(input: DocGenInput): SrsDoc {
  const ucs = input.ucSpec?.useCases ?? [];
  const actors = [...new Set(ucs.flatMap((u) => u.actors))];
  const body: Record<string, string[]> = {
    intro: [
      "### 1.1 Mục đích",
      `Tài liệu đặc tả yêu cầu phần mềm cho module **${input.moduleName}**, làm cơ sở cho thiết kế, phát triển và kiểm thử.`,
      "### 1.2 Phạm vi",
      ...ucs.map((u) => `- ${u.code} – ${u.name}`),
      "### 1.3 Tài liệu tham chiếu",
      "- BRD của module",
      "- UC Specification của module",
    ],
    overview: [
      "### 2.1 Tác nhân",
      "| Tác nhân | Use case |",
      "|---|---|",
      ...actors.map((a) => `| ${cell(a)} | ${ucs.filter((u) => u.actors.includes(a)).map((u) => u.code).join(", ")} |`),
      "### 2.2 Ràng buộc chung",
      "- Mọi chức năng yêu cầu người dùng đã đăng nhập và có quyền phù hợp.",
      "- Giao diện và thông báo hiển thị bằng tiếng Việt.",
    ],
    functional: ucs.flatMap((u) => [
      `### ${u.code} – ${u.name}`,
      u.description,
      `- **Tác nhân:** ${u.actors.join(", ")}`,
      `- **Đầu vào:** ${u.mainFlow.filter((s) => s.actor !== "Hệ thống").map((s) => s.text).join("; ") || "(không có)"}`,
      `- **Xử lý:** ${u.mainFlow.filter((s) => s.actor === "Hệ thống").map((s) => s.text).join("; ") || "(không có)"}`,
      `- **Đầu ra:** ${u.postconditions.join("; ") || "(không có)"}`,
      ...u.businessRules.map((r) => `- **Quy tắc:** ${r}`),
      ...u.exceptions.map((e) => `- **Ngoại lệ ${e.code}:** ${e.name}`),
    ]),
    nonfunctional: [
      "- Hiệu năng: thao tác chính phản hồi không quá 2 giây với 100 người dùng đồng thời (Giả định – cần xác nhận).",
      "- Bảo mật: xác thực người dùng và phân quyền theo vai trò cho mọi chức năng (Giả định – cần xác nhận).",
      "- Nhật ký: ghi lại người thực hiện và thời điểm của thao tác thay đổi dữ liệu (Giả định – cần xác nhận).",
      "- Khả dụng: hoạt động 99,5% trong giờ hành chính (Giả định – cần xác nhận).",
    ],
    interfaces: [
      "| Use case | Màn hình đề xuất | Thao tác chính |",
      "|---|---|---|",
      ...ucs.map((u) => `| ${u.code} | ${cell(u.name)} | ${cell(u.mainFlow.filter((s) => s.actor !== "Hệ thống").map((s) => s.text).join("; "))} |`),
    ],
    data: ["| Dữ liệu | Mô tả | Use case |", "|---|---|---|", ...ucs.map((u) => `| ${cell(`Thông tin ${low(u.name)}`)} | Dữ liệu được tạo/đọc trong ${u.code} | ${u.code} |`)],
    assumptions: [
      ...ucs.flatMap((u) => u.assumptions.map((a) => `- ${u.code}: ${a}`)),
      "- Chi tiết trường dữ liệu sẽ được làm rõ khi có thiết kế màn hình (prototype).",
    ],
  };
  return { sections: SRS_NEED.map(([key, title]) => ({ key, title, content: body[key].filter((x) => x !== undefined).join("\n") })) };
}

// ---------------------------------------------------------------- 4. FRD-NFR ← SRS + UC
async function generateFrd(input: DocGenInput): Promise<Requirement[]> {
  const ucCodes = new Set((input.ucSpec?.useCases ?? []).map((u) => u.code));
  const prompt = `Lập danh sách yêu cầu chức năng (FR) và phi chức năng (NFR) cho module "${input.moduleName}" từ SRS và Use Case dưới đây.
- Mã FR-01…, NFR-01…; mỗi UC có ít nhất 1 FR; mỗi quy tắc nghiệp vụ quan trọng thành 1 FR kiểm tra.
- useCaseCodes chỉ dùng mã UC có trong danh sách. NFR tự đề xuất thì isAssumption = true.
- source: nguồn của yêu cầu (vd "UC-01 luồng chính", "SRS mục 4").

## SRS
${clip(input.srs?.content ?? "", 20000)}

## Use Case (mã – tên)
${(input.ucSpec?.useCases ?? []).map((u) => `- ${u.code} – ${u.name}`).join("\n")}`;
  return runAI({
    type: "generate_doc_frd_nfr",
    moduleId: input.moduleId,
    system: SYSTEM,
    prompt,
    tool: { name: "submit_requirements", description: "Trả về danh sách yêu cầu FR/NFR", input_schema: { type: "object", properties: { requirements: { type: "array", items: REQ_SCHEMA } }, required: ["requirements"] } },
    maxTokens: 12000,
    parse: (raw: any) => {
      if (!Array.isArray(raw?.requirements) || !raw.requirements.length) return { errors: ["requirements rỗng"] };
      const reqs = raw.requirements.map(coerceDocRequirement) as Requirement[];
      const errors: string[] = [];
      if (new Set(reqs.map((r) => r.code)).size !== reqs.length) errors.push("Trùng mã yêu cầu");
      if (!reqs.some((r) => r.type === "FR")) errors.push("Chưa có FR nào");
      for (const r of reqs) for (const c of r.useCaseCodes) if (!ucCodes.has(c)) errors.push(`${r.code} tham chiếu UC không tồn tại: ${c}`);
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
    out.push({ code: frCode(), type: "FR", statement: `Hệ thống phải cho phép ${u.actors.join(", ") || "người dùng"} ${low(u.name)}.`, priority: prio(u), useCaseCodes: [u.code], source: `${u.code} luồng chính`, isAssumption: false });
    for (const r of u.businessRules) out.push({ code: frCode(), type: "FR", statement: `Hệ thống phải đảm bảo: ${tidy(r)}.`, priority: "Medium", useCaseCodes: [u.code], source: `${u.code} quy tắc nghiệp vụ`, isAssumption: false });
    const bad = u.exceptions.find((e) => /không hợp lệ/i.test(e.name));
    if (bad) out.push({ code: frCode(), type: "FR", statement: `Hệ thống phải kiểm tra dữ liệu đầu vào của "${u.name}" và báo lỗi rõ ràng tại trường không hợp lệ.`, priority: "Medium", useCaseCodes: [u.code], source: `${u.code} ${bad.code}`, isAssumption: false });
  }
  const all = ucs.map((u) => u.code);
  const nfr = [
    ["Thao tác chính phản hồi không quá 2 giây với 100 người dùng đồng thời.", "Medium"],
    ["Mọi chức năng yêu cầu xác thực và phân quyền theo vai trò.", "High"],
    ["Ghi nhật ký người thực hiện và thời điểm cho thao tác thay đổi dữ liệu.", "Medium"],
    ["Hệ thống hoạt động 99,5% trong giờ hành chính.", "Low"],
  ] as const;
  nfr.forEach(([s, p], i) => out.push({ code: `NFR-${pad2(i + 1)}`, type: "NFR", statement: s, priority: p, useCaseCodes: all, source: "SRS mục 4 – gợi ý mặc định", isAssumption: true }));
  return out;
}

// ---------------------------------------------------------------- 5. API Spec ← FRD + UC
async function generateApiSpec(input: DocGenInput): Promise<string> {
  const prompt = `Soạn đặc tả API (REST, JSON) cho module "${input.moduleName}" từ FRD-NFR và Use Case dưới đây.
Bắt đầu bằng "# API Spec – ${input.moduleName}", mục đầu "## Quy ước chung" (base URL, xác thực, định dạng lỗi).
Mỗi endpoint một mục "## <METHOD> <path>" gồm: mô tả, Use case và FR liên quan, bảng Request (| Trường | Kiểu | Bắt buộc | Mô tả |),
bảng Response (| Trường | Kiểu | Mô tả |), bảng Mã lỗi (| Mã HTTP | Mã lỗi | Khi nào |). Không dùng khối mã; điều suy diễn ghi "(Giả định)".

## FRD-NFR
${clip(input.frd?.content ?? "", 15000)}

## UC Specification
${clip(input.ucSpec?.content ?? "", 15000)}`;
  return runAI({
    type: "generate_doc_api_spec",
    moduleId: input.moduleId,
    system: SYSTEM + "\nBạn kiêm vai Solution Architect khi viết đặc tả API.",
    prompt,
    tool: MARKDOWN_TOOL("submit_api_spec", "Trả về đặc tả API dạng Markdown"),
    maxTokens: 16000,
    parse: (raw) => {
      const r = checkMarkdown(raw, 2);
      if (r.value && !/\b(GET|POST|PUT|PATCH|DELETE)\b/.test(r.value)) return { errors: ["Chưa có endpoint nào (GET/POST/PUT/PATCH/DELETE)"] };
      return r;
    },
    mock: () => mockApiSpec(input),
  });
}

const FIELD_HINTS: [RegExp, string, string, string][] = [
  [/email/i, "email", "string", "Địa chỉ email"],
  [/mật khẩu/i, "password", "string", "Mật khẩu"],
  [/tên đăng nhập|tài khoản/i, "username", "string", "Tên đăng nhập"],
  [/họ tên|tên khách|tên người/i, "fullName", "string", "Họ tên"],
  [/điện thoại|sđt/i, "phone", "string", "Số điện thoại"],
  [/địa chỉ/i, "address", "string", "Địa chỉ"],
  [/ngày|thời gian|hạn/i, "date", "string (YYYY-MM-DD)", "Ngày"],
  [/số lượng/i, "quantity", "number", "Số lượng"],
  [/giá|tiền|thanh toán/i, "amount", "number", "Số tiền"],
  [/trạng thái/i, "status", "string", "Trạng thái"],
  [/mô tả|ghi chú|nội dung|lý do/i, "note", "string", "Ghi chú / nội dung"],
  [/tệp|file|ảnh|tài liệu/i, "fileId", "string", "Mã tệp đính kèm"],
];

export function mockApiSpec(input: DocGenInput): string {
  const ucs = input.ucSpec?.useCases ?? [];
  const reqs = input.frd?.requirements ?? [];
  const L: string[] = [`# API Spec – ${input.moduleName}`, ""];
  L.push("## Quy ước chung", "");
  L.push("- Base URL: `/api/v1` (Giả định – cần xác nhận)");
  L.push("- Định dạng: JSON, mã hoá UTF-8; thời điểm theo ISO 8601.");
  L.push("- Xác thực: Bearer token trong header `Authorization` (Giả định – cần xác nhận).");
  L.push('- Lỗi trả về dạng `{ "code": "<MÃ_LỖI>", "message": "<thông báo tiếng Việt>" }`.', "");
  const used = new Set<string>();
  for (const u of ucs) {
    const text = `${u.name} ${u.description} ${u.businessRules.join(" ")}`;
    const method = READ_RE.test(u.name) ? "GET" : /xoá|xóa|huỷ|hủy/i.test(u.name) ? "DELETE" : /sửa|cập nhật|chỉnh|thay đổi|đổi/i.test(u.name) ? "PUT" : "POST";
    let base = slugify(u.name);
    if (used.has(`${method} ${base}`)) base = `${base}-${u.code.toLowerCase()}`;
    used.add(`${method} ${base}`);
    const path = `/api/v1/${base}${method === "PUT" || method === "DELETE" || (method === "GET" && /chi tiết/i.test(u.name)) ? "/{id}" : ""}`;
    const frs = reqs.filter((r) => r.type === "FR" && r.useCaseCodes.includes(u.code)).map((r) => r.code);
    L.push(`## ${method} ${path}`, "");
    L.push(`**Mô tả:** ${u.description || u.name}`, "");
    L.push(`**Use case:** ${u.code} – ${u.name}${frs.length ? ` · **Yêu cầu:** ${frs.join(", ")}` : ""}`, "");
    L.push(method === "GET" ? "**Request (query)**" : "**Request (body)**", "", "| Trường | Kiểu | Bắt buộc | Mô tả |", "|---|---|---|---|");
    if (path.endsWith("{id}")) L.push("| id (đường dẫn) | string | Có | Mã bản ghi |");
    if (method === "GET") {
      L.push("| keyword | string | Không | Từ khoá tìm kiếm |", "| page | number | Không | Trang (mặc định 1) |", "| pageSize | number | Không | Số dòng mỗi trang (mặc định 20) |");
    } else if (method !== "DELETE") {
      const fields = FIELD_HINTS.filter(([re]) => re.test(text));
      if (fields.length) for (const [, f, t, d] of fields) L.push(`| ${f} | ${t} | Có | ${d} (Giả định) |`);
      else L.push(`| data | object | Có | Thông tin ${low(u.name)} – chi tiết trường bổ sung khi có prototype (Giả định) |`);
    }
    L.push("", `**Response ${method === "POST" ? "201" : "200"}**`, "", "| Trường | Kiểu | Mô tả |", "|---|---|---|");
    if (method === "GET") L.push("| items | array | Danh sách kết quả |", "| total | number | Tổng số bản ghi |");
    else if (method === "DELETE") L.push("| ok | boolean | true khi xoá thành công |");
    else L.push("| id | string | Mã bản ghi |", "| updatedAt | string | Thời điểm cập nhật |");
    L.push("", "**Mã lỗi**", "", "| Mã HTTP | Mã lỗi | Khi nào |", "|---|---|---|");
    for (const e of u.exceptions) {
      const [http, code] = /không có dữ liệu|không tìm thấy/i.test(e.name)
        ? ["404", "NOT_FOUND"]
        : /hệ thống/i.test(e.name)
          ? ["500", "INTERNAL_ERROR"]
          : /không hợp lệ|sai/i.test(e.name)
            ? ["400", "INVALID_INPUT"]
            : ["409", slugify(e.name).toUpperCase().replace(/-/g, "_")];
      L.push(`| ${http} | ${code} | ${cell(`${e.code} – ${e.name}`)} |`);
    }
    L.push("| 401 | UNAUTHORIZED | Chưa đăng nhập hoặc phiên hết hạn |", "| 403 | FORBIDDEN | Không có quyền thực hiện |", "");
  }
  if (!ucs.length) L.push("## Endpoint", "", "- Chưa có Use Case để suy ra endpoint.");
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
  const scope = args.section ? `mục "${args.section}"` : "toàn bộ tài liệu";
  const prompt = `Chỉnh ${scope} của tài liệu ${label} (module "${args.moduleName}") theo yêu cầu của BA.
Giữ nguyên định dạng Markdown hiện có, giữ nguyên các mã (UC-xx, FR-xx, BR-xx…) và những phần không liên quan.
${args.section ? `Trả lại toàn bộ mục, dòng đầu giữ nguyên "## ${args.section}".` : "Trả lại toàn bộ tài liệu."}

## Yêu cầu chỉnh
${args.instruction}

## Nội dung hiện tại
${clip(args.markdown)}

## Bối cảnh
${clip(args.context, 8000)}`;
  return runAI({
    type: `refine_doc_${args.kind.toLowerCase()}`,
    moduleId: args.moduleId,
    system: SYSTEM,
    prompt,
    tool: MARKDOWN_TOOL("submit_markdown", "Trả về Markdown đã chỉnh"),
    maxTokens: 16000,
    parse: (raw: any) => {
      let md = String(raw?.markdown ?? "").trim();
      if (!md) return { errors: ["Thiếu markdown"] };
      if (args.section && !md.startsWith("## ")) md = `## ${args.section}\n\n${md}`;
      if (ucCode) {
        const ucs = parseUcMarkdown(md);
        if (ucs.length !== 1 || ucs[0].code !== ucCode) return { errors: [`Mục phải là đúng một Use Case ${ucCode} theo định dạng cũ`] };
        if (!ucs[0].mainFlow.length) return { errors: [`${ucCode} thiếu luồng chính`] };
      }
      return { value: md + "\n" };
    },
    mock: () => mockRefine(args),
  });
}

/** Mock: không tự hiểu chỉ dẫn – ghi chỉ dẫn vào tài liệu để BA chỉnh tay (UC thì thêm vào "Giả định"). */
export function mockRefine(args: RefineInput): string {
  const note = `BA yêu cầu chỉnh: ${tidy(args.instruction)} (chế độ rule-based chưa tự áp dụng – cần chỉnh tay)`;
  const md = args.markdown.replace(/\s+$/, "");
  if (args.kind === "UC_SPEC" && args.section && /^UC-\d+/.test(args.section)) {
    const lines = md.split("\n");
    const at = lines.findIndex((l) => l.trim() === "**Giả định:**");
    if (at >= 0) {
      let end = at + 1;
      while (end < lines.length && /^\s*[-*]\s+/.test(lines[end])) end++;
      lines.splice(end, 0, `- ${note}`);
      return lines.join("\n") + "\n";
    }
    return `${md}\n\n**Giả định:**\n- ${note}\n`;
  }
  return `${md}\n\n> **Ghi chú chỉnh sửa (BA):** ${tidy(args.instruction)}\n`;
}
