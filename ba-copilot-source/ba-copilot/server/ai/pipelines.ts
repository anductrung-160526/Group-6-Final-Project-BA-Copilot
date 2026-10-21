// Các pipeline AI: sinh màn hình, sửa theo vùng, sinh UC/SRS/Sequence, sinh test case, chỉnh tài liệu.

import { COMPONENT_CATALOG, compactTree, findNode, nodeLabel, normalizeTree, UINode, validateTree } from "../../shared/design.ts";
import type { PatchOp } from "../../shared/patch.ts";
import type { DesignModel } from "../../shared/extract.ts";
import type { Requirement, SequenceDiagram, SrsDoc, SrsSection, TestCase, UseCase } from "../../shared/types.ts";
import { runAI } from "./client.ts";
import { mockEditOps, mockScreen, mockSequence, mockSrs, mockTests, mockUseCases } from "./mock.ts";
import { mockUcDiagram } from "./mock.ts";
import { buildUcMermaid, type UcRelation } from "../../shared/ucDiagram.ts";

const SYSTEM_BASE = `You are a Business Analyst's assistant in the BA Copilot system.
Principles:
- Write ALL content in English: clear, concise, using standard business analysis terminology (BABOK, IEEE 830 / ISO/IEC/IEEE 29148).
- Rely only on the input data. Anything you have to infer goes into assumptions/isAssumption for the BA to confirm – NEVER present it as fact.
- Always return the result by calling exactly the requested tool.`;

const catalogText = Object.entries(COMPONENT_CATALOG)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n");

const NODE_SCHEMA = {
  type: "object",
  description: "UI node: { id, type, props, children? }. children only exists on container components.",
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    props: { type: "object" },
    children: { type: "array", items: { type: "object" } },
  },
  required: ["id", "type", "props"],
};

// ---------------------------------------------------------------- Sinh màn hình
/**
 * Đợt 5: bối cảnh là SRS + FRD-NFR (bảng `module_docs`) + user story của module (bảng `user_stories`), do service dựng
 * thành `context` (Markdown). `prompt` có thể trống – khi đó AI thiết kế màn theo tên màn và bối cảnh tài liệu.
 */
export async function generateScreen(args: {
  moduleId: string;
  prompt: string;
  name: string;
  context?: string;
  /** @deprecated v2 – ô yêu cầu cũ; còn để scripts/build-corpus.ts biên dịch. Dùng `context`. */
  requirementInput?: string;
  otherScreens: string[];
  mockPrompt?: string;
}): Promise<{ name: string; tree: UINode }> {
  const prompt = `Design ONE web screen according to the BA's request.

## BA request
${args.prompt.trim() || `(No extra notes from the BA – design the "${args.name}" screen from the documents below)`}

## Module context (user stories, SRS, FRD-NFR)
${args.context || args.requirementInput || "(no documents yet)"}

## Existing screens in the module (use exactly these names for navigateTo)
${args.otherScreens.length ? args.otherScreens.map((s) => `- ${s}`).join("\n") : "(none yet)"}

## Allowed component library
${catalogText}

## Rules
- The root node is a Page with props.title.
- Every node has a short, unique, meaningful snake_case id (e.g. login_form, btn_submit).
- Input fields must have a label, a name and sensible constraints (required, minLength, maxLength, inputType, pattern).
- Buttons have an action (a short English verb) and navigateTo when they lead to another screen.
- Sample data in a Table: at most 3 realistic rows, in English.
- The screen must satisfy the functional requirements (FR) and user stories related to it; take fields and constraints from the SRS/FRD-NFR when available.
- Clean, professional layout; about 40 nodes at most.`;
  return runAI({
    type: "generate_screen",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Senior UI/UX designer.",
    prompt,
    tool: {
      name: "submit_screen",
      description: "Return the screen design as a component tree",
      input_schema: { type: "object", properties: { name: { type: "string", description: "Short screen name" }, tree: NODE_SCHEMA }, required: ["name", "tree"] },
    },
    maxTokens: 12000,
    parse: (raw: any) => {
      const tree = normalizeTree(raw?.tree);
      const v = validateTree(tree);
      return v.ok ? { value: { name: String(raw?.name || args.name || tree.props.title || "Screen"), tree } } : { errors: v.errors };
    },
    mock: () => {
      const tree = mockScreen(args.mockPrompt || args.prompt, args.name);
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
  /** Đợt 5: tóm tắt user story + FRD-NFR của module, để AI sửa không lệch tài liệu. */
  context?: string;
}): Promise<{ ops: PatchOp[]; summary: string }> {
  const scoped = args.selectedIds.length > 0;
  const regionText = scoped
    ? args.selectedIds
        .map((id) => {
          const n = findNode(args.tree, id);
          return n ? `### Region ${id} – ${nodeLabel(n)}\n${JSON.stringify(compactTree(n))}` : "";
        })
        .join("\n\n")
    : "(No region selected – the whole screen may be edited)";
  const commentText = args.comments.length
    ? args.comments.map((c, i) => `${i + 1}. [region: ${c.nodeIds.join(", ") || "whole screen"}] ${c.comment}`).join("\n")
    : "(none)";
  const fullInstruction = [args.instruction, ...args.comments.map((c) => c.comment)].filter(Boolean).join("\n");

  const prompt = `Edit the screen design according to the BA's request using patch operations.

## Whole current screen (for context)
${JSON.stringify(compactTree(args.tree))}

## Selected regions (edit ONLY inside these regions)
${regionText}

## Attached comments
${commentText}

## Edit request
${args.instruction || "(see comments)"}
${args.context ? `
## Module documents (for reference – must not be contradicted)
${args.context}
` : ""}
## Component library
${catalogText}

## Valid operations
- {"op":"update","id":"<id>","props":{...}}  – merge props (null value removes a prop)
- {"op":"replace","id":"<id>","node":{...}}   – replace the whole node/subtree
- {"op":"insert","parentId":"<container id>","index":<number>,"node":{...}} – insert a new node (new, unique id)
- {"op":"remove","id":"<id>"}
${scoped ? "- Operate ONLY on nodes inside the selected regions (including descendants), or insert siblings into the region's direct parent. Operations outside the regions are rejected by the system." : ""}
- Keep the ids of unchanged nodes. Use the minimum number of operations.`;

  return runAI({
    type: scoped ? "edit_screen_region" : "edit_screen_global",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Senior UI/UX designer and make precise, minimal design edits.",
    prompt,
    tool: {
      name: "submit_patch",
      description: "Return the list of design edit operations",
      input_schema: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One-sentence summary of what was changed" },
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
      if (!Array.isArray(raw?.ops)) return { errors: ["ops must be an array"] };
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
  const prompt = `From the design model (extracted automatically from the approved screens) and the business requirements, produce:
1. The list of use cases with full specifications (main flow, alternative flows A1.., exception flows E1.., business rules).
2. The list of requirements: FR (functional; at least 1 FR per use case; every important data constraint becomes a validation FR) and NFR (suggestions only, isAssumption = true).

## Module: ${args.moduleName}
## Business requirements / user stories
${args.requirementInput || "(none)"}

## Design model (screens: fields, actions, displays, forms; navigation)
${modelForPrompt(args.model)}

## Rules
- Use case IDs: UC-01, UC-02...; requirement IDs: FR-01..., NFR-01...
- Each main-flow step names its actor (an actor name or "System"); attach screenId (an exact screen id from above) and the nodeId of the related element when there is one.
- A use case's screenIds must be screen ids present in the model.
- One use case corresponds to one business goal of an actor (do not split per minor button such as "Cancel").
- Anything not visible in the design (server-side processing, permissions...) goes into assumptions.`;
  return runAI({
    type: "generate_use_cases",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Senior Business Analyst.",
    prompt,
    tool: {
      name: "submit_use_cases",
      description: "Return the use cases and requirements",
      input_schema: {
        type: "object",
        properties: { useCases: { type: "array", items: UC_SCHEMA }, requirements: { type: "array", items: REQ_SCHEMA } },
        required: ["useCases", "requirements"],
      },
    },
    maxTokens: 16000,
    parse: (raw: any) => {
      const errors: string[] = [];
      if (!Array.isArray(raw?.useCases) || !raw.useCases.length) errors.push("useCases is empty");
      if (!Array.isArray(raw?.requirements)) errors.push("requirements must be an array");
      if (errors.length) return { errors };
      const useCases = raw.useCases.map((u: any) => coerceUseCase(u, screenIds));
      const requirements = raw.requirements.map(coerceRequirement);
      const ucCodes = new Set(useCases.map((u: UseCase) => u.code));
      for (const r of requirements) for (const c of r.useCaseCodes) if (!ucCodes.has(c)) errors.push(`${r.code} references a use case that does not exist: ${c}`);
      if (new Set(useCases.map((u: UseCase) => u.code)).size !== useCases.length) errors.push("Duplicate use case ID");
      return errors.length ? { errors } : { value: { useCases, requirements } };
    },
    mock: () => mockUseCases(args.model, args.requirementInput),
  });
}

// ---------------------------------------------------------------- SRS
export async function generateSrs(args: { moduleId: string; moduleName: string; requirementInput: string; model: DesignModel; useCases: UseCase[]; requirements: Requirement[] }): Promise<SrsDoc> {
  const prompt = `Write an SRS following the ISO/IEC/IEEE 29148 structure for module "${args.moduleName}".
Required sections (key – title):
- intro – 1. Introduction (purpose, scope, definitions, references)
- overview – 2. Overall Description (product perspective, actors, screens, navigation, general constraints)
- functional – 3. Functional Requirements (markdown table | ID | Requirement | Priority | Use Case | using exactly the given FRs)
- nonfunctional – 4. Non-functional Requirements (use the given NFRs; additions allowed but must be marked "(Assumption – to be confirmed)")
- interfaces – 5. User Interfaces (per screen: purpose, fields, actions)
- data – 6. Data Dictionary (markdown table: Screen | Field | Type | Required | Constraints)
- assumptions – 7. Assumptions and Open Issues
Each section's content is markdown (### sub-headings, bullet lists, tables).

## Business requirements
${args.requirementInput || "(none)"}
## Design model
${modelForPrompt(args.model)}
## Use cases
${JSON.stringify(args.useCases.map((u) => ({ code: u.code, name: u.name, actors: u.actors, assumptions: u.assumptions })))}
## Requirements
${JSON.stringify(args.requirements)}`;
  return runAI({
    type: "generate_srs",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Senior Business Analyst writing an SRS.",
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
      const sections: SrsSection[] = Array.isArray(raw?.sections) ? raw.sections.map((s: any) => ({ key: String(s.key), title: String(s.title), content: String(s.content) })) : [];
      const need = ["intro", "overview", "functional", "nonfunctional", "interfaces", "data", "assumptions"];
      const missing = need.filter((k) => !sections.some((s) => s.key === k));
      return missing.length ? { errors: [`Missing sections: ${missing.join(", ")}`] } : { value: { sections } };
    },
    mock: () => mockSrs(args.moduleName, args.requirementInput, args.model, args.useCases, args.requirements),
  });
}

// ---------------------------------------------------------------- Sequence diagram
export function validateMermaid(src: string): string[] {
  const errs: string[] = [];
  const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== "sequenceDiagram") errs.push('The first line must be "sequenceDiagram"');
  let depth = 0;
  for (const l of lines.slice(1)) {
    if (/^(alt|opt|loop|par|critical|rect)\b/.test(l)) depth++;
    if (l === "end") depth--;
    if (depth < 0) errs.push('Extra "end"');
    // vi-keep: cho phép tên tham gia có dấu tiếng Việt (sơ đồ cũ)
    if (/^[^%].*->>?/.test(l) && !/^\s*[\wÀ-ỹ]+\s*-?-[>x)]{1,2}\+?-?\s*[\wÀ-ỹ]+\s*:/u.test(l)) errs.push(`Invalid arrow syntax: ${l}`);
  }
  if (depth > 0) errs.push('Missing "end" for alt/opt/loop block');
  return errs;
}

export async function generateSequences(args: { moduleId: string; useCases: UseCase[]; model: DesignModel }): Promise<SequenceDiagram[]> {
  const titleOf = (id: string) => args.model.screens.find((s) => s.screenId === id)?.title ?? "User interface";
  const prompt = `Draw a sequence diagram (Mermaid syntax) for EACH use case below.
Participants: actor → UI (screen name) → API (API server) → DB (Database).
- First line: sequenceDiagram; use "autonumber".
- Declarations: actor A as <name>, participant UI as <screen name>, participant API as API Server, participant DB as Database.
- Use the aliases A/UI/API/DB in the arrows (->> request, -->> response). Show the main flow and at least 1 alt block for an important exception.
- Labels must not contain ; # : or double quotes.

## Use cases
${JSON.stringify(args.useCases.map((u) => ({ ...u, screens: u.screenIds.map(titleOf) })))}`;
  return runAI({
    type: "generate_sequences",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Solution Architect.",
    prompt,
    tool: {
      name: "submit_sequences",
      description: "Return a sequence diagram for each use case",
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
      if (missing.length) errors.push(`Missing diagrams for: ${missing.join(", ")}`);
      return errors.length ? { errors } : { value: seqs };
    },
    mock: () => args.useCases.map((u) => mockSequence(u, titleOf)),
  });
}

// ---------------------------------------------------------------- Test case
export async function generateTests(args: { moduleId: string; useCases: UseCase[]; requirements: Requirement[]; model: DesignModel }): Promise<TestCase[]> {
  const prompt = `Generate a manual test suite for the module based on the UC Specification and the FRD-NFR (both Done).
Required techniques:
- Scenario testing: every flow (main, each A*, each E*) of every use case has at least 1 test; flowRef = "main" or the flow ID.
- Equivalence partitioning & boundary value analysis: every field with minLength/maxLength/min/max → Boundary tests (below, at and above the boundary).
- Every test references at least 1 requirement ID (requirementCodes) from the list.
- Every functional requirement (FR) has at least 1 test. If there are no use cases, leave useCaseCode empty ("").
- Test IDs: TC-001, TC-002...; type: Positive | Negative | Boundary; priority: High | Medium | Low.
- steps are concrete test steps; testData is concrete test data; expected is a verifiable expected result.

## Use cases
${JSON.stringify(args.useCases)}
## Requirements
${JSON.stringify(args.requirements)}
## Data fields and constraints
${JSON.stringify(args.model.screens.map((s) => ({ screen: s.title, fields: s.fields })))}`;
  const reqCodes = new Set(args.requirements.map((r) => r.code));
  const ucCodes = new Set(args.useCases.map((u) => u.code));
  return runAI({
    type: "generate_tests",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Senior QA Engineer.",
    prompt,
    tool: {
      name: "submit_test_cases",
      description: "Return the list of test cases",
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
      if (!tcs.length) errors.push("No test cases");
      for (const t of tcs) {
        if (ucCodes.size ? !ucCodes.has(t.useCaseCode) : t.useCaseCode !== "") errors.push(`${t.code}: useCaseCode does not exist (${t.useCaseCode})`);
        if (!t.requirementCodes.length) errors.push(`${t.code}: missing valid requirementCodes (BR-04)`);
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
    system: SYSTEM_BASE + "\nYou act as a Senior Business Analyst.",
    prompt: `Revise the use case specification according to the BA's request. Keep the use case ID and all unrelated parts unchanged.\n\n## Revision request\n${args.instruction}\n\n## Current use case\n${JSON.stringify(args.uc)}\n\n## Design model\n${modelForPrompt(args.model)}`,
    tool: { name: "submit_use_case", description: "Return the revised use case", input_schema: UC_SCHEMA },
    parse: (raw: any) => ({ value: { ...coerceUseCase(raw, screenIds), code: args.uc.code } }),
    mock: () => ({ ...args.uc, assumptions: [...args.uc.assumptions, `BA request: ${args.instruction} (rule-based mode cannot apply this automatically – edit manually)`] }),
  });
}

export async function refineSequence(args: { moduleId: string; seq: SequenceDiagram; instruction: string; uc?: UseCase }): Promise<SequenceDiagram> {
  return runAI({
    type: "refine_sequence",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Solution Architect.",
    prompt: `Revise the Mermaid sequence diagram as requested. Keep the syntax valid (first line sequenceDiagram, aliases A/UI/API/DB).\n\n## Request\n${args.instruction}\n\n## Current diagram\n${args.seq.mermaid}\n\n## Use case\n${JSON.stringify(args.uc ?? {})}`,
    tool: { name: "submit_sequence", description: "Return the revised diagram", input_schema: { type: "object", properties: { mermaid: { type: "string" } }, required: ["mermaid"] } },
    parse: (raw: any) => {
      const m = String(raw?.mermaid ?? "").trim();
      const errors = validateMermaid(m);
      return errors.length ? { errors } : { value: { ...args.seq, mermaid: m } };
    },
    mock: () => ({ ...args.seq, mermaid: `${args.seq.mermaid}\n  Note over A,UI: BA request – ${args.instruction.replace(/[;#:"]/g, " ").slice(0, 80)}` }),
  });
}

export async function refineSrsSection(args: { moduleId: string; section: SrsSection; instruction: string; context: string }): Promise<SrsSection> {
  return runAI({
    type: "refine_srs",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Senior Business Analyst writing an SRS.",
    prompt: `Revise the SRS section "${args.section.title}" as requested. Return the full markdown content of the section.\n\n## Request\n${args.instruction}\n\n## Current content\n${args.section.content}\n\n## Context\n${args.context}`,
    tool: { name: "submit_section", description: "Return the revised section content", input_schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } },
    parse: (raw: any) => (raw?.content ? { value: { ...args.section, content: String(raw.content) } } : { errors: ["Missing content"] }),
    mock: () => ({ ...args.section, content: `${args.section.content}\n\n> **BA note:** ${args.instruction}` }),
  });
}

// ---------------------------------------------------------------- Sơ đồ UC (A5, FN-11)
// AI chỉ chọn actor và quan hệ «include»/«extend»; mã Mermaid do buildUcMermaid dựng nên luôn đúng cú pháp.
export async function generateUcDiagram(args: { moduleId: string; moduleName: string; useCases: UseCase[] }): Promise<{ code: string }> {
  const ucCodes = new Set(args.useCases.map((u) => u.code));
  const prompt = `Build the use case diagram for module "${args.moduleName}" from the use cases below.
- actors: actors outside the system (do not list "System").
- relations: relationships between use cases, using only use case IDs from the list.
  - type "include": from is the base use case, to is the use case always invoked in the base use case's main flow.
  - type "extend": from is the extending use case (only happens under specific conditions), to is the base use case.
- Do not invent relationships. If no relationship is clear, return an empty relations list.

## Use cases
${JSON.stringify(args.useCases.map((u) => ({ code: u.code, name: u.name, actors: u.actors, mainFlow: u.mainFlow.map((s) => `${s.actor}: ${s.text}`), altFlows: u.altFlows.map((f) => f.name), exceptions: u.exceptions.map((f) => f.name) })))}`;
  return runAI({
    type: "generate_uc_diagram",
    moduleId: args.moduleId,
    system: SYSTEM_BASE + "\nYou act as a Senior Business Analyst drawing a UML use case diagram.",
    prompt,
    tool: {
      name: "submit_uc_diagram",
      description: "Return the actors and include/extend relationships of the use case diagram",
      input_schema: {
        type: "object",
        properties: {
          actors: { type: "array", items: { type: "string" } },
          relations: {
            type: "array",
            items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, type: { type: "string", enum: ["include", "extend"] } }, required: ["from", "to", "type"] },
          },
        },
        required: ["actors", "relations"],
      },
    },
    parse: (raw: any) => {
      const relations: UcRelation[] = Array.isArray(raw?.relations) ? raw.relations.map((r: any) => ({ from: String(r.from ?? ""), to: String(r.to ?? ""), type: r.type === "extend" ? "extend" : "include" })) : [];
      const errors = relations.filter((r) => !ucCodes.has(r.from) || !ucCodes.has(r.to)).map((r) => `Relationship references a use case that does not exist: ${r.from} → ${r.to}`);
      if (errors.length) return { errors };
      const actors = Array.isArray(raw?.actors) ? raw.actors.map(String) : [];
      return { value: { code: buildUcMermaid(args.useCases, actors, relations) } };
    },
    mock: () => mockUcDiagram(args.useCases),
  });
}
