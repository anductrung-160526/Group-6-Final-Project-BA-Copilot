// Các pipeline AI: sinh màn hình, sửa theo vùng, sinh UC/SRS/Sequence, sinh test case, chỉnh tài liệu.

import { COMPONENT_CATALOG, compactTree, findNode, nodeLabel, normalizeTree, UINode, validateTree } from "../../shared/design.ts";
import type { PatchOp } from "../../shared/patch.ts";
import type { DesignModel } from "../../shared/extract.ts";
import type { Requirement, SequenceDiagram, SrsDoc, SrsSection, TestCase, UseCase } from "../../shared/types.ts";
import { runAI } from "./client.ts";
import { mockEditOps, mockScreen, mockSequence, mockSrs, mockTests, mockUseCases } from "./mock.ts";

const SYSTEM_BASE = `Bạn là trợ lý của Business Analyst trong hệ thống BA Copilot.
Nguyên tắc:
- Viết toàn bộ nội dung bằng tiếng Việt, rõ ràng, súc tích, đúng thuật ngữ phân tích nghiệp vụ.
- Chỉ dựa trên dữ liệu đầu vào. Điều gì phải suy diễn thì ghi vào assumptions/isAssumption để BA xác nhận, KHÔNG trình bày như sự thật.
- Luôn trả kết quả bằng cách gọi đúng tool được yêu cầu.`;

const catalogText = Object.entries(COMPONENT_CATALOG)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n");

const NODE_SCHEMA = {
  type: "object",
  description: "Node giao diện: { id, type, props, children? }. children chỉ có ở component dạng container.",
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    props: { type: "object" },
    children: { type: "array", items: { type: "object" } },
  },
  required: ["id", "type", "props"],
};

// ---------------------------------------------------------------- Sinh màn hình
export async function generateScreen(args: { moduleId: string; prompt: string; name: string; requirementInput: string; otherScreens: string[] }): Promise<{ name: string; tree: UINode }> {
  const prompt = `Thiết kế MỘT màn hình web theo yêu cầu của BA.

## Yêu cầu của BA
${args.prompt}

## Bối cảnh module (yêu cầu nghiệp vụ / user story)
${args.requirementInput || "(không có)"}

## Các màn hình đã có trong module (dùng đúng tên này cho navigateTo)
${args.otherScreens.length ? args.otherScreens.map((s) => `- ${s}`).join("\n") : "(chưa có)"}

## Thư viện component được phép dùng
${catalogText}

## Quy tắc
- Node gốc là Page với props.title.
- Mỗi node có id ngắn, duy nhất, dạng snake_case có nghĩa (vd: login_form, btn_submit).
- Trường nhập phải có label, name và ràng buộc hợp lý (required, minLength, maxLength, inputType, pattern).
- Nút có action (động từ tiếng Anh ngắn) và navigateTo nếu chuyển màn hình.
- Dữ liệu mẫu trong Table tối đa 3 dòng, thực tế, tiếng Việt.
- Bố cục gọn gàng, chuyên nghiệp; tối đa khoảng 40 node.`;
  return runAI({
    type: "generate_screen",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Senior UI/UX designer.",
    prompt,
    tool: {
      name: "submit_screen",
      description: "Trả về thiết kế màn hình dạng component tree",
      input_schema: { type: "object", properties: { name: { type: "string", description: "Tên màn hình ngắn gọn" }, tree: NODE_SCHEMA }, required: ["name", "tree"] },
    },
    maxTokens: 12000,
    parse: (raw: any) => {
      const tree = normalizeTree(raw?.tree);
      const v = validateTree(tree);
      return v.ok ? { value: { name: String(raw?.name || args.name || tree.props.title || "Màn hình"), tree } } : { errors: v.errors };
    },
    mock: () => {
      const tree = mockScreen(args.prompt, args.name);
      return { name: args.name || String(tree.props.title), tree };
    },
  });
}

// ---------------------------------------------------------------- Sửa theo vùng
export async function editScreen(args: {
  moduleId: string;
  tree: UINode;
  selectedIds: string[];
  instruction: string;
  comments: { comment: string; nodeIds: string[] }[];
}): Promise<{ ops: PatchOp[]; summary: string }> {
  const scoped = args.selectedIds.length > 0;
  const regionText = scoped
    ? args.selectedIds
        .map((id) => {
          const n = findNode(args.tree, id);
          return n ? `### Vùng ${id} – ${nodeLabel(n)}\n${JSON.stringify(compactTree(n))}` : "";
        })
        .join("\n\n")
    : "(Không khoanh vùng – được phép sửa toàn màn hình)";
  const commentText = args.comments.length
    ? args.comments.map((c, i) => `${i + 1}. [vùng: ${c.nodeIds.join(", ") || "toàn màn hình"}] ${c.comment}`).join("\n")
    : "(không có)";
  const fullInstruction = [args.instruction, ...args.comments.map((c) => c.comment)].filter(Boolean).join("\n");

  const prompt = `Sửa thiết kế màn hình theo yêu cầu của BA bằng các thao tác patch.

## Toàn bộ màn hình hiện tại (để hiểu bối cảnh)
${JSON.stringify(compactTree(args.tree))}

## Vùng được khoanh (CHỈ được sửa trong các vùng này)
${regionText}

## Bình luận gửi kèm
${commentText}

## Yêu cầu sửa
${args.instruction || "(xem bình luận)"}

## Thư viện component
${catalogText}

## Các thao tác hợp lệ
- {"op":"update","id":"<id>","props":{...}}  – gộp props (giá trị null để xóa prop)
- {"op":"replace","id":"<id>","node":{...}}   – thay cả node/cây con
- {"op":"insert","parentId":"<id container>","index":<số>,"node":{...}} – chèn node mới (id mới, duy nhất)
- {"op":"remove","id":"<id>"}
${scoped ? "- CHỈ thao tác trên node thuộc vùng khoanh (kể cả con cháu) hoặc chèn phần tử anh em vào node cha trực tiếp của vùng. Thao tác ngoài vùng sẽ bị hệ thống từ chối." : ""}
- Giữ nguyên id của node không bị thay đổi. Dùng số thao tác tối thiểu.`;

  return runAI({
    type: scoped ? "edit_screen_region" : "edit_screen_global",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Senior UI/UX designer, sửa thiết kế chính xác và tối thiểu.",
    prompt,
    tool: {
      name: "submit_patch",
      description: "Trả về danh sách thao tác sửa thiết kế",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Tóm tắt 1 câu những gì đã sửa" },
          ops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["update", "replace", "insert", "remove"] },
                id: { type: "string" },
                parentId: { type: "string" },
                index: { type: "integer" },
                props: { type: "object" },
                node: NODE_SCHEMA,
              },
              required: ["op"],
            },
          },
        },
        required: ["summary", "ops"],
      },
    },
    parse: (raw: any) => {
      if (!Array.isArray(raw?.ops)) return { errors: ["ops phải là mảng"] };
      return { value: { ops: raw.ops as PatchOp[], summary: String(raw.summary ?? "") } };
    },
    mock: () => mockEditOps(args.tree, args.selectedIds, fullInstruction),
  });
}

// ---------------------------------------------------------------- Use Case + Requirement
const FLOW_DEF = {
  type: "object",
  properties: { code: { type: "string" }, name: { type: "string" }, branchFrom: { type: "integer" }, steps: { type: "array", items: { type: "string" } } },
  required: ["code", "name", "branchFrom", "steps"],
};
const UC_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string" },
    name: { type: "string" },
    actors: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    trigger: { type: "string" },
    preconditions: { type: "array", items: { type: "string" } },
    postconditions: { type: "array", items: { type: "string" } },
    mainFlow: {
      type: "array",
      items: { type: "object", properties: { no: { type: "integer" }, actor: { type: "string" }, text: { type: "string" }, screenId: { type: "string" }, nodeId: { type: "string" } }, required: ["no", "actor", "text"] },
    },
    altFlows: { type: "array", items: FLOW_DEF },
    exceptions: { type: "array", items: FLOW_DEF },
    businessRules: { type: "array", items: { type: "string" } },
    screenIds: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["code", "name", "actors", "description", "mainFlow", "altFlows", "exceptions", "screenIds"],
};

const REQ_SCHEMA = {
  type: "object",
  properties: {
    code: { type: "string" },
    type: { type: "string", enum: ["FR", "NFR"] },
    statement: { type: "string" },
    priority: { type: "string", enum: ["High", "Medium", "Low"] },
    useCaseCodes: { type: "array", items: { type: "string" } },
    source: { type: "string" },
    isAssumption: { type: "boolean" },
  },
  required: ["code", "type", "statement", "priority", "useCaseCodes", "source", "isAssumption"],
};

export function coerceUseCase(u: any, validScreenIds: Set<string>): UseCase {
  const arr = (x: any) => (Array.isArray(x) ? x.map(String) : []);
  const flows = (x: any) => (Array.isArray(x) ? x.map((f: any) => ({ code: String(f.code ?? ""), name: String(f.name ?? ""), branchFrom: Number(f.branchFrom ?? 1), steps: arr(f.steps) })) : []);
  return {
    code: String(u.code),
    name: String(u.name ?? ""),
    actors: arr(u.actors),
    description: String(u.description ?? ""),
    trigger: String(u.trigger ?? ""),
    preconditions: arr(u.preconditions),
    postconditions: arr(u.postconditions),
    mainFlow: (Array.isArray(u.mainFlow) ? u.mainFlow : []).map((s: any, i: number) => ({
      no: Number(s.no ?? i + 1),
      actor: String(s.actor ?? ""),
      text: String(s.text ?? ""),
      ...(s.screenId && validScreenIds.has(String(s.screenId)) ? { screenId: String(s.screenId) } : {}),
      ...(s.nodeId ? { nodeId: String(s.nodeId) } : {}),
    })),
    altFlows: flows(u.altFlows),
    exceptions: flows(u.exceptions),
    businessRules: arr(u.businessRules),
    screenIds: arr(u.screenIds).filter((id) => validScreenIds.has(id)),
    assumptions: arr(u.assumptions),
  };
}

export function coerceRequirement(r: any): Requirement {
  return {
    code: String(r.code),
    type: r.type === "NFR" ? "NFR" : "FR",
    statement: String(r.statement ?? ""),
    priority: ["High", "Medium", "Low"].includes(r.priority) ? r.priority : "Medium",
    useCaseCodes: Array.isArray(r.useCaseCodes) ? r.useCaseCodes.map(String) : [],
    source: String(r.source ?? ""),
    isAssumption: Boolean(r.isAssumption),
  };
}

function modelForPrompt(model: DesignModel) {
  return JSON.stringify(model, null, 1);
}

export async function generateUseCases(args: { moduleId: string; moduleName: string; requirementInput: string; model: DesignModel }) {
  const screenIds = new Set(args.model.screens.map((s) => s.screenId));
  const prompt = `Từ mô hình thiết kế (trích tự động từ các màn hình đã duyệt) và yêu cầu nghiệp vụ, hãy lập:
1. Danh sách Use Case và đặc tả đầy đủ (main flow, alternate flows A1.., exceptions E1.., business rules).
2. Danh sách yêu cầu: FR (chức năng, mỗi UC ít nhất 1 FR; mỗi ràng buộc dữ liệu quan trọng thành FR kiểm tra) và NFR (chỉ gợi ý, isAssumption = true).

## Module: ${args.moduleName}
## Yêu cầu nghiệp vụ / user story
${args.requirementInput || "(không có)"}

## Mô hình thiết kế (screens: fields, actions, displays, forms; navigation)
${modelForPrompt(args.model)}

## Quy tắc
- Mã UC: UC-01, UC-02...; mã yêu cầu: FR-01..., NFR-01...
- Mỗi bước main flow ghi actor là tên tác nhân hoặc "Hệ thống"; gắn screenId (đúng id màn hình ở trên) và nodeId của phần tử liên quan nếu có.
- screenIds của UC phải là id màn hình có trong mô hình.
- Một UC tương ứng một mục tiêu nghiệp vụ của tác nhân (không tách theo từng nút lặt vặt như "Hủy").
- Điều chưa có trên thiết kế (xử lý phía server, phân quyền...) ghi vào assumptions.`;
  return runAI({
    type: "generate_use_cases",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Senior Business Analyst.",
    prompt,
    tool: {
      name: "submit_use_cases",
      description: "Trả về Use Case và yêu cầu",
      input_schema: {
        type: "object",
        properties: { useCases: { type: "array", items: UC_SCHEMA }, requirements: { type: "array", items: REQ_SCHEMA } },
        required: ["useCases", "requirements"],
      },
    },
    maxTokens: 16000,
    parse: (raw: any) => {
      const errors: string[] = [];
      if (!Array.isArray(raw?.useCases) || !raw.useCases.length) errors.push("useCases rỗng");
      if (!Array.isArray(raw?.requirements)) errors.push("requirements phải là mảng");
      if (errors.length) return { errors };
      const useCases = raw.useCases.map((u: any) => coerceUseCase(u, screenIds));
      const requirements = raw.requirements.map(coerceRequirement);
      const ucCodes = new Set(useCases.map((u: UseCase) => u.code));
      for (const r of requirements) for (const c of r.useCaseCodes) if (!ucCodes.has(c)) errors.push(`${r.code} tham chiếu UC không tồn tại: ${c}`);
      if (new Set(useCases.map((u: UseCase) => u.code)).size !== useCases.length) errors.push("Trùng mã UC");
      return errors.length ? { errors } : { value: { useCases, requirements } };
    },
    mock: () => mockUseCases(args.model, args.requirementInput),
  });
}

// ---------------------------------------------------------------- SRS
export async function generateSrs(args: { moduleId: string; moduleName: string; requirementInput: string; model: DesignModel; useCases: UseCase[]; requirements: Requirement[] }): Promise<SrsDoc> {
  const prompt = `Soạn tài liệu SRS theo cấu trúc ISO/IEC/IEEE 29148 cho module "${args.moduleName}".
Các mục bắt buộc (key – tiêu đề):
- intro – 1. Giới thiệu (mục đích, phạm vi, thuật ngữ, tài liệu tham chiếu)
- overview – 2. Mô tả tổng quan (bối cảnh sản phẩm, tác nhân, màn hình, điều hướng, ràng buộc chung)
- functional – 3. Yêu cầu chức năng (bảng markdown | Mã | Yêu cầu | Ưu tiên | Use Case | dùng đúng các FR đã cho)
- nonfunctional – 4. Yêu cầu phi chức năng (dùng NFR đã cho; được bổ sung nhưng phải ghi "(Giả định – cần xác nhận)")
- interfaces – 5. Giao diện người dùng (từng màn hình: mục đích, trường, thao tác)
- data – 6. Từ điển dữ liệu (bảng markdown: Màn hình | Trường | Kiểu | Bắt buộc | Ràng buộc)
- assumptions – 7. Giả định và vấn đề mở
Nội dung mỗi mục là markdown (### tiêu đề con, gạch đầu dòng, bảng).

## Yêu cầu nghiệp vụ
${args.requirementInput || "(không có)"}
## Mô hình thiết kế
${modelForPrompt(args.model)}
## Use Case
${JSON.stringify(args.useCases.map((u) => ({ code: u.code, name: u.name, actors: u.actors, assumptions: u.assumptions })))}
## Yêu cầu
${JSON.stringify(args.requirements)}`;
  return runAI({
    type: "generate_srs",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Senior Business Analyst viết tài liệu SRS.",
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
      const sections: SrsSection[] = Array.isArray(raw?.sections) ? raw.sections.map((s: any) => ({ key: String(s.key), title: String(s.title), content: String(s.content) })) : [];
      const need = ["intro", "overview", "functional", "nonfunctional", "interfaces", "data", "assumptions"];
      const missing = need.filter((k) => !sections.some((s) => s.key === k));
      return missing.length ? { errors: [`Thiếu mục: ${missing.join(", ")}`] } : { value: { sections } };
    },
    mock: () => mockSrs(args.moduleName, args.requirementInput, args.model, args.useCases, args.requirements),
  });
}

// ---------------------------------------------------------------- Sequence diagram
export function validateMermaid(src: string): string[] {
  const errs: string[] = [];
  const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== "sequenceDiagram") errs.push('Dòng đầu phải là "sequenceDiagram"');
  let depth = 0;
  for (const l of lines.slice(1)) {
    if (/^(alt|opt|loop|par|critical|rect)\b/.test(l)) depth++;
    if (l === "end") depth--;
    if (depth < 0) errs.push('Thừa "end"');
    if (/^[^%].*->>?/.test(l) && !/^\s*[\wÀ-ỹ]+\s*-?-[>x)]{1,2}\+?-?\s*[\wÀ-ỹ]+\s*:/u.test(l)) errs.push(`Mũi tên sai cú pháp: ${l}`);
  }
  if (depth > 0) errs.push('Thiếu "end" cho khối alt/opt/loop');
  return errs;
}

export async function generateSequences(args: { moduleId: string; useCases: UseCase[]; model: DesignModel }): Promise<SequenceDiagram[]> {
  const titleOf = (id: string) => args.model.screens.find((s) => s.screenId === id)?.title ?? "Giao diện";
  const prompt = `Vẽ sequence diagram (cú pháp Mermaid) cho TỪNG Use Case dưới đây.
Thành phần: actor (tác nhân) → UI (tên màn hình) → API (Máy chủ API) → DB (Cơ sở dữ liệu).
- Dòng đầu: sequenceDiagram; dùng "autonumber".
- Khai báo: actor A as <tên>, participant UI as <tên màn hình>, participant API as Máy chủ API, participant DB as Cơ sở dữ liệu.
- Dùng alias A/UI/API/DB trong các mũi tên (->> gọi, -->> phản hồi). Thể hiện luồng chính, và ít nhất 1 khối alt cho ngoại lệ quan trọng.
- Nhãn không chứa ký tự ; # : hoặc dấu ngoặc kép.

## Use Case
${JSON.stringify(args.useCases.map((u) => ({ ...u, screens: u.screenIds.map(titleOf) })))}`;
  return runAI({
    type: "generate_sequences",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Solution Architect.",
    prompt,
    tool: {
      name: "submit_sequences",
      description: "Trả về sequence diagram cho từng UC",
      input_schema: {
        type: "object",
        properties: { sequences: { type: "array", items: { type: "object", properties: { useCaseCode: { type: "string" }, title: { type: "string" }, mermaid: { type: "string" } }, required: ["useCaseCode", "title", "mermaid"] } } },
        required: ["sequences"],
      },
    },
    maxTokens: 16000,
    parse: (raw: any) => {
      const seqs: SequenceDiagram[] = Array.isArray(raw?.sequences) ? raw.sequences.map((s: any) => ({ useCaseCode: String(s.useCaseCode), title: String(s.title), mermaid: String(s.mermaid).trim() })) : [];
      const errors = seqs.flatMap((s) => validateMermaid(s.mermaid).map((e) => `${s.useCaseCode}: ${e}`));
      const missing = args.useCases.filter((u) => !seqs.some((s) => s.useCaseCode === u.code)).map((u) => u.code);
      if (missing.length) errors.push(`Thiếu sơ đồ cho: ${missing.join(", ")}`);
      return errors.length ? { errors } : { value: seqs };
    },
    mock: () => args.useCases.map((u) => mockSequence(u, titleOf)),
  });
}

// ---------------------------------------------------------------- Test case
export async function generateTests(args: { moduleId: string; useCases: UseCase[]; requirements: Requirement[]; model: DesignModel }): Promise<TestCase[]> {
  const prompt = `Sinh bộ test case thủ công (manual) cho module dựa trên tài liệu đã duyệt.
Kỹ thuật bắt buộc:
- Kịch bản: mỗi luồng (main, từng A*, từng E*) của mỗi UC có ít nhất 1 test; flowRef = "main" hoặc mã luồng.
- Phân vùng tương đương & giá trị biên: mỗi trường có minLength/maxLength/min/max → test Boundary (dưới biên, đúng biên, vượt biên).
- Mỗi test tham chiếu ít nhất 1 mã yêu cầu (requirementCodes) có trong danh sách.
- Mã test: TC-001, TC-002...; type: Positive | Negative | Boundary; priority: High | Medium | Low.
- steps là các bước thao tác cụ thể; testData là dữ liệu cụ thể; expected là kết quả kiểm chứng được.

## Use Case
${JSON.stringify(args.useCases)}
## Yêu cầu
${JSON.stringify(args.requirements)}
## Trường dữ liệu và ràng buộc
${JSON.stringify(args.model.screens.map((s) => ({ screen: s.title, fields: s.fields })))}`;
  const reqCodes = new Set(args.requirements.map((r) => r.code));
  const ucCodes = new Set(args.useCases.map((u) => u.code));
  return runAI({
    type: "generate_tests",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Senior QA Engineer.",
    prompt,
    tool: {
      name: "submit_test_cases",
      description: "Trả về danh sách test case",
      input_schema: {
        type: "object",
        properties: {
          testCases: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string" },
                title: { type: "string" },
                type: { type: "string", enum: ["Positive", "Negative", "Boundary"] },
                priority: { type: "string", enum: ["High", "Medium", "Low"] },
                useCaseCode: { type: "string" },
                flowRef: { type: "string" },
                requirementCodes: { type: "array", items: { type: "string" } },
                preconditions: { type: "string" },
                testData: { type: "string" },
                steps: { type: "array", items: { type: "string" } },
                expected: { type: "string" },
              },
              required: ["code", "title", "type", "priority", "useCaseCode", "flowRef", "requirementCodes", "steps", "expected"],
            },
          },
        },
        required: ["testCases"],
      },
    },
    maxTokens: 20000,
    parse: (raw: any) => {
      const tcs: TestCase[] = Array.isArray(raw?.testCases)
        ? raw.testCases.map((t: any) => ({
            code: String(t.code),
            title: String(t.title ?? ""),
            type: ["Positive", "Negative", "Boundary"].includes(t.type) ? t.type : "Positive",
            priority: ["High", "Medium", "Low"].includes(t.priority) ? t.priority : "Medium",
            useCaseCode: String(t.useCaseCode ?? ""),
            flowRef: String(t.flowRef ?? "main"),
            requirementCodes: Array.isArray(t.requirementCodes) ? t.requirementCodes.map(String).filter((c: string) => reqCodes.has(c)) : [],
            preconditions: String(t.preconditions ?? ""),
            testData: String(t.testData ?? ""),
            steps: Array.isArray(t.steps) ? t.steps.map(String) : [],
            expected: String(t.expected ?? ""),
          }))
        : [];
      const errors: string[] = [];
      if (!tcs.length) errors.push("Không có test case");
      for (const t of tcs) {
        if (!ucCodes.has(t.useCaseCode)) errors.push(`${t.code}: useCaseCode không tồn tại (${t.useCaseCode})`);
        if (!t.requirementCodes.length) errors.push(`${t.code}: thiếu requirementCodes hợp lệ (BR-04)`);
      }
      return errors.length ? { errors } : { value: tcs };
    },
    mock: () => mockTests(args.useCases, args.requirements, args.model),
  });
}

// ---------------------------------------------------------------- Chỉnh từng mục tài liệu
export async function refineUseCase(args: { moduleId: string; uc: UseCase; instruction: string; model: DesignModel }): Promise<UseCase> {
  const screenIds = new Set(args.model.screens.map((s) => s.screenId));
  return runAI({
    type: "refine_use_case",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Senior Business Analyst.",
    prompt: `Chỉnh sửa đặc tả Use Case theo yêu cầu của BA. Giữ nguyên mã UC và những phần không liên quan.\n\n## Yêu cầu chỉnh\n${args.instruction}\n\n## Use Case hiện tại\n${JSON.stringify(args.uc)}\n\n## Mô hình thiết kế\n${modelForPrompt(args.model)}`,
    tool: { name: "submit_use_case", description: "Trả về Use Case đã chỉnh", input_schema: UC_SCHEMA },
    parse: (raw: any) => ({ value: { ...coerceUseCase(raw, screenIds), code: args.uc.code } }),
    mock: () => ({ ...args.uc, assumptions: [...args.uc.assumptions, `BA yêu cầu: ${args.instruction} (chế độ rule-based chưa tự áp dụng – cần chỉnh tay)`] }),
  });
}

export async function refineSequence(args: { moduleId: string; seq: SequenceDiagram; instruction: string; uc?: UseCase }): Promise<SequenceDiagram> {
  return runAI({
    type: "refine_sequence",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Solution Architect.",
    prompt: `Chỉnh sequence diagram Mermaid theo yêu cầu. Giữ cú pháp hợp lệ (dòng đầu sequenceDiagram, alias A/UI/API/DB).\n\n## Yêu cầu\n${args.instruction}\n\n## Sơ đồ hiện tại\n${args.seq.mermaid}\n\n## Use Case\n${JSON.stringify(args.uc ?? {})}`,
    tool: { name: "submit_sequence", description: "Trả về sơ đồ đã chỉnh", input_schema: { type: "object", properties: { mermaid: { type: "string" } }, required: ["mermaid"] } },
    parse: (raw: any) => {
      const m = String(raw?.mermaid ?? "").trim();
      const errors = validateMermaid(m);
      return errors.length ? { errors } : { value: { ...args.seq, mermaid: m } };
    },
    mock: () => ({ ...args.seq, mermaid: `${args.seq.mermaid}\n  Note over A,UI: BA yêu cầu – ${args.instruction.replace(/[;#:"]/g, " ").slice(0, 80)}` }),
  });
}

export async function refineSrsSection(args: { moduleId: string; section: SrsSection; instruction: string; context: string }): Promise<SrsSection> {
  return runAI({
    type: "refine_srs",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nBạn đóng vai Senior Business Analyst viết SRS.",
    prompt: `Chỉnh mục SRS "${args.section.title}" theo yêu cầu. Trả lại toàn bộ nội dung markdown của mục.\n\n## Yêu cầu\n${args.instruction}\n\n## Nội dung hiện tại\n${args.section.content}\n\n## Bối cảnh\n${args.context}`,
    tool: { name: "submit_section", description: "Trả về nội dung mục đã chỉnh", input_schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } },
    parse: (raw: any) => (raw?.content ? { value: { ...args.section, content: String(raw.content) } } : { errors: ["Thiếu content"] }),
    mock: () => ({ ...args.section, content: `${args.section.content}\n\n> **Ghi chú BA:** ${args.instruction}` }),
  });
}
