import { randomUUID } from "node:crypto";
import { getDb, tx } from "./db.ts";
import type { UINode } from "../shared/design.ts";
import { projectNameKey } from "../shared/projectName.ts";
import type {
  Annotation,
  ArtifactStatus,
  DocKind,
  ModuleDocData,
  UserStory,
  DocBundle,
  DocStatus,
  Module,
  ModuleDetail,
  Project,
  PromptRun,
  Requirement,
  Screen,
  ScreenVersion,
  ScreenWithTree,
  SequenceDiagram,
  SrsDoc,
  TestCase,
  UseCase,
} from "../shared/types.ts";

type Row = Record<string, any>;
const now = () => new Date().toISOString();
const uid = () => randomUUID();
const J = (s: string | null | undefined, fallback: any = null) => {
  if (s === null || s === undefined) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

// ---------- Projects ----------
const toProject = (r: Row): Project => ({ id: r.id, name: r.name, description: r.description, createdAt: r.created_at });

export function listProjects(): (Project & { moduleCount: number })[] {
  return getDb()
    .prepare(`SELECT p.*, (SELECT COUNT(*) FROM modules m WHERE m.project_id = p.id) AS module_count FROM projects p ORDER BY created_at DESC`)
    .all()
    .map((r: Row) => ({ ...toProject(r), moduleCount: Number(r.module_count) }));
}

export function createProject(name: string, description = ""): Project {
  const p: Project = { id: uid(), name, description, createdAt: now() };
  getDb().prepare("INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)").run(p.id, p.name, p.description, p.createdAt);
  return p;
}

/** Dự án khác (bỏ qua `exceptId`) trùng tên theo `projectNameKey` (NFC, gộp khoảng trắng, không phân biệt hoa/thường). */
export function findProjectByName(name: string, exceptId?: string): Project | null {
  const key = projectNameKey(name);
  const rows = getDb().prepare("SELECT * FROM projects").all() as Row[];
  const r = rows.find((x) => x.id !== exceptId && projectNameKey(String(x.name ?? "")) === key);
  return r ? toProject(r) : null;
}

/** Sửa tên / mô tả dự án (route PATCH /api/projects/:id đã kiểm tra độ dài, trùng tên). */
export function updateProject(id: string, patch: Partial<Pick<Project, "name" | "description">>): void {
  const cols: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined) (cols.push("name = ?"), vals.push(patch.name));
  if (patch.description !== undefined) (cols.push("description = ?"), vals.push(patch.description));
  if (!cols.length) return;
  getDb().prepare(`UPDATE projects SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
}

export function getProject(id: string): Project | null {
  const r = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
  return r ? toProject(r) : null;
}

export function deleteProject(id: string): void {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}

// ---------- Modules ----------
const toModule = (r: Row): Module => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  requirementInput: r.requirement_input,
  docsStatus: r.docs_status,
  testsStatus: r.tests_status,
  qusScore: r.qus_score ?? null,
  qusCheckedAt: r.qus_checked_at ?? null,
  createdAt: r.created_at,
  // Đợt 5 (R-033): chặn đè + cờ Yêu cầu sửa của bộ test case
  testsRev: Number(r.tests_rev ?? 0),
  testsRevisionRequested: !!r.tests_revision_requested,
});

export function listModules(projectId: string): (Module & { screenCount: number })[] {
  return getDb()
    .prepare(`SELECT m.*, (SELECT COUNT(*) FROM screens s WHERE s.module_id = m.id) AS screen_count FROM modules m WHERE project_id = ? ORDER BY created_at`)
    .all(projectId)
    .map((r: Row) => ({ ...toModule(r), screenCount: Number(r.screen_count) }));
}

export function createModule(projectId: string, name: string, requirementInput = ""): Module {
  const m: Module = { id: uid(), projectId, name, requirementInput, docsStatus: "none", testsStatus: "none", createdAt: now() };
  getDb()
    .prepare("INSERT INTO modules (id, project_id, name, requirement_input, docs_status, tests_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(m.id, m.projectId, m.name, m.requirementInput, m.docsStatus, m.testsStatus, m.createdAt);
  return m;
}

export function getModule(id: string): Module | null {
  const r = getDb().prepare("SELECT * FROM modules WHERE id = ?").get(id) as Row | undefined;
  return r ? toModule(r) : null;
}

export function updateModule(id: string, patch: Partial<Pick<Module, "name" | "requirementInput" | "docsStatus" | "testsStatus">>): void {
  const cols: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined) (cols.push("name = ?"), vals.push(patch.name));
  if (patch.requirementInput !== undefined) (cols.push("requirement_input = ?"), vals.push(patch.requirementInput));
  if (patch.docsStatus !== undefined) (cols.push("docs_status = ?"), vals.push(patch.docsStatus));
  if (patch.testsStatus !== undefined) (cols.push("tests_status = ?"), vals.push(patch.testsStatus));
  if (!cols.length) return;
  getDb().prepare(`UPDATE modules SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
}

/** Module khác (bỏ qua `exceptId`) cùng dự án, trùng tên theo `projectNameKey` (cùng quy tắc với tên dự án). */
export function findModuleByName(projectId: string, name: string, exceptId?: string): Module | null {
  const key = projectNameKey(name);
  const rows = getDb().prepare("SELECT * FROM modules WHERE project_id = ?").all(projectId) as Row[];
  const r = rows.find((x) => x.id !== exceptId && projectNameKey(String(x.name ?? "")) === key);
  return r ? toModule(r) : null;
}

export function deleteModule(id: string): void {
  getDb().prepare("DELETE FROM modules WHERE id = ?").run(id);
}

/** BR-02: thiết kế đã duyệt bị thay đổi → tài liệu và test hiện có chuyển Outdated. */
export function markOutdated(moduleId: string): void {
  const m = getModule(moduleId);
  if (!m) return;
  updateModule(moduleId, {
    docsStatus: m.docsStatus === "none" ? "none" : "outdated",
    testsStatus: m.testsStatus === "none" ? "none" : "outdated",
  });
}

// ---------- Screens & versions ----------
const toScreen = (r: Row): Screen => ({
  id: r.id,
  moduleId: r.module_id,
  name: r.name,
  status: r.status,
  currentVersionId: r.current_version_id,
  createdAt: r.created_at,
  // Đợt 5 (R-033): số bản, cờ Yêu cầu sửa, người/lúc ghi cuối
  rev: Number(r.rev ?? 1),
  revisionRequested: !!r.revision_requested,
  updatedBy: r.updated_by ?? null,
  updatedAt: r.updated_at ?? null,
});

const toVersion = (r: Row): ScreenVersion => ({
  id: r.id,
  screenId: r.screen_id,
  number: Number(r.number),
  kind: r.kind,
  prompt: r.prompt,
  scope: r.scope,
  selectedIds: J(r.selected_ids, []),
  changedIds: J(r.changed_ids, []),
  rejected: J(r.rejected, []),
  tree: J(r.tree),
  author: r.author ?? "",
  authorId: r.author_id ?? null,
  createdAt: r.created_at,
});

export function getScreen(id: string): Screen | null {
  const r = getDb().prepare("SELECT * FROM screens WHERE id = ?").get(id) as Row | undefined;
  return r ? toScreen(r) : null;
}

export function listScreens(moduleId: string): ScreenWithTree[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*, v.tree AS tree, v.number AS vnum FROM screens s LEFT JOIN screen_versions v ON v.id = s.current_version_id
       WHERE s.module_id = ? ORDER BY s.created_at`,
    )
    .all(moduleId) as Row[];
  return rows.map((r) => ({ ...toScreen(r), tree: J(r.tree), versionNumber: Number(r.vnum ?? 0) }));
}

export function createScreen(moduleId: string, name: string, actorId?: string): Screen {
  const s: Screen = { id: uid(), moduleId, name, status: "draft", currentVersionId: null, createdAt: now() };
  // Đợt 5: màn mới có rev 1 (mặc định của cột), ghi người/lúc tạo làm người/lúc sửa cuối
  const by = actorId && getDb().prepare("SELECT 1 FROM members WHERE id = ?").get(actorId) ? actorId : null;
  getDb()
    .prepare("INSERT INTO screens (id, module_id, name, status, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(s.id, s.moduleId, s.name, s.status, s.createdAt, by, s.createdAt);
  return getScreen(s.id) ?? s;
}

export function updateScreen(id: string, patch: Partial<Pick<Screen, "name" | "status" | "currentVersionId">>): void {
  const cols: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined) (cols.push("name = ?"), vals.push(patch.name));
  if (patch.status !== undefined) (cols.push("status = ?"), vals.push(patch.status));
  if (patch.currentVersionId !== undefined) (cols.push("current_version_id = ?"), vals.push(patch.currentVersionId));
  if (!cols.length) return;
  getDb().prepare(`UPDATE screens SET ${cols.join(", ")} WHERE id = ?`).run(...vals, id);
}

/**
 * Xoá màn. Task đang gắn màn này được gỡ liên kết sản phẩm (thành task không gắn sản phẩm – không trỏ vào màn đã xoá)
 * và ghi một dòng lịch sử hệ thống "Kept <trạng thái> (Linked screen “…” was deleted)" để còn biết task từng gắn màn nào.
 * Góp ý của màn xoá luôn (CASCADE đã lo, xoá thẳng cho chắc với DB cũ chưa bật khoá ngoại).
 */
export function deleteScreen(id: string): void {
  tx(() => {
    const d = getDb();
    const at = now();
    const name = (d.prepare("SELECT name FROM screens WHERE id = ?").get(id) as Row | undefined)?.name ?? "";
    const linked = d.prepare("SELECT id, status FROM tasks WHERE artifact_type = 'screen' AND artifact_id = ?").all(id) as Row[];
    const ev = d.prepare("INSERT INTO task_events (id, task_id, from_status, to_status, by_member_id, by_system, reason, created_at) VALUES (?, ?, ?, ?, NULL, 1, ?, ?)");
    for (const t of linked) ev.run(uid(), t.id, t.status, t.status, `Linked screen “${name}” was deleted`, at);
    d.prepare("UPDATE tasks SET artifact_type = NULL, artifact_id = NULL, artifact_sub = NULL, updated_at = ? WHERE artifact_type = 'screen' AND artifact_id = ?").run(at, id);
    d.prepare("DELETE FROM annotations WHERE screen_id = ?").run(id);
    d.prepare("DELETE FROM screens WHERE id = ?").run(id);
  });
}

export function addVersion(
  screenId: string,
  v: { kind: ScreenVersion["kind"]; prompt: string; scope?: ScreenVersion["scope"]; selectedIds?: string[]; changedIds?: string[]; rejected?: { reason: string }[]; tree: UINode },
): ScreenVersion {
  return tx(() => {
    const max = getDb().prepare("SELECT COALESCE(MAX(number), 0) AS n FROM screen_versions WHERE screen_id = ?").get(screenId) as Row;
    const ver: ScreenVersion = {
      id: uid(),
      screenId,
      number: Number(max.n) + 1,
      kind: v.kind,
      prompt: v.prompt,
      scope: v.scope ?? "",
      selectedIds: v.selectedIds ?? [],
      changedIds: v.changedIds ?? [],
      rejected: v.rejected ?? [],
      tree: v.tree,
      createdAt: now(),
    };
    getDb()
      .prepare(
        "INSERT INTO screen_versions (id, screen_id, number, kind, prompt, scope, selected_ids, changed_ids, rejected, tree, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(ver.id, screenId, ver.number, ver.kind, ver.prompt, ver.scope, JSON.stringify(ver.selectedIds), JSON.stringify(ver.changedIds), JSON.stringify(ver.rejected), JSON.stringify(ver.tree), ver.createdAt);
    getDb().prepare("UPDATE screens SET current_version_id = ? WHERE id = ?").run(ver.id, screenId);
    return ver;
  });
}

export function listVersions(screenId: string): ScreenVersion[] {
  return (getDb().prepare("SELECT * FROM screen_versions WHERE screen_id = ? ORDER BY number DESC").all(screenId) as Row[]).map(toVersion);
}

export function getVersion(id: string): ScreenVersion | null {
  const r = getDb().prepare("SELECT * FROM screen_versions WHERE id = ?").get(id) as Row | undefined;
  return r ? toVersion(r) : null;
}

// ---------- Annotations ----------
const toAnnotation = (r: Row): Annotation => ({
  id: r.id,
  screenId: r.screen_id,
  versionId: r.version_id,
  nodeIds: J(r.node_ids, []),
  bbox: J(r.bbox),
  comment: r.comment,
  author: r.author,
  authorId: r.author_id ?? null,
  status: r.status,
  createdAt: r.created_at,
});

export function listAnnotationsForModule(moduleId: string): Annotation[] {
  return (
    getDb()
      .prepare("SELECT a.* FROM annotations a JOIN screens s ON s.id = a.screen_id WHERE s.module_id = ? ORDER BY a.created_at")
      .all(moduleId) as Row[]
  ).map(toAnnotation);
}

export function getAnnotations(ids: string[]): Annotation[] {
  if (!ids.length) return [];
  const q = ids.map(() => "?").join(",");
  return (getDb().prepare(`SELECT * FROM annotations WHERE id IN (${q})`).all(...ids) as Row[]).map(toAnnotation);
}

export function createAnnotation(a: Omit<Annotation, "id" | "createdAt" | "status">): Annotation {
  const ann: Annotation = { ...a, authorId: a.authorId ?? null, id: uid(), status: "open", createdAt: now() };
  getDb()
    .prepare("INSERT INTO annotations (id, screen_id, version_id, node_ids, bbox, comment, author, author_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(ann.id, ann.screenId, ann.versionId, JSON.stringify(ann.nodeIds), JSON.stringify(ann.bbox), ann.comment, ann.author, ann.authorId ?? null, ann.status, ann.createdAt);
  return ann;
}

export function setAnnotationStatus(ids: string[], status: Annotation["status"]): void {
  const st = getDb().prepare("UPDATE annotations SET status = ? WHERE id = ?");
  for (const id of ids) st.run(status, id);
}

export function getAnnotation(id: string): Annotation | null {
  return getAnnotations([id])[0] ?? null;
}

export function deleteAnnotation(id: string): void {
  getDb().prepare("DELETE FROM annotations WHERE id = ?").run(id);
}

// ---------- Docs ----------
function listData<T>(table: string, moduleId: string): T[] {
  return (getDb().prepare(`SELECT data FROM ${table} WHERE module_id = ? ORDER BY ord`).all(moduleId) as Row[]).map((r) => J(r.data));
}

/**
 * Tài liệu của module cho test case, truy vết, gợi ý, xuất file (đợt 5): đọc `module_docs` trước
 * (UC_SPEC → useCases, FRD_NFR → requirements, SRS → srs); loại nào chưa có dòng trong `module_docs`
 * thì dùng bảng cũ (`use_cases`, `requirements`, `srs`) để module làm theo luồng cũ vẫn chạy.
 */
export function getDocs(moduleId: string): DocBundle {
  const legacy = getLegacyDocs(moduleId);
  const uc = getModuleDocRow(moduleId, "UC_SPEC");
  const frd = getModuleDocRow(moduleId, "FRD_NFR");
  const srs = getModuleDocRow(moduleId, "SRS");
  return {
    useCases: uc ? (uc.data?.useCases ?? []).map(normUseCase) : legacy.useCases,
    requirements: frd ? (frd.data?.requirements ?? []).map(normRequirement) : legacy.requirements,
    srs: srs ? (srs.data?.srs ?? null) : legacy.srs,
    sequences: legacy.sequences,
  };
}

/** Bảng cũ (luồng v2: generateDocs/refineDoc của màn Tài liệu cũ). Màn mới không dùng. */
export function getLegacyDocs(moduleId: string): DocBundle {
  const srsRow = getDb().prepare("SELECT data FROM srs WHERE module_id = ?").get(moduleId) as Row | undefined;
  return {
    useCases: listData<UseCase>("use_cases", moduleId),
    requirements: listData<Requirement>("requirements", moduleId),
    srs: srsRow ? (J(srsRow.data) as SrsDoc) : null,
    sequences: listData<SequenceDiagram>("sequences", moduleId),
  };
}

export function saveUseCasesAndRequirements(moduleId: string, ucs: UseCase[], reqs: Requirement[]): void {
  tx(() => {
    const d = getDb();
    d.prepare("DELETE FROM use_cases WHERE module_id = ?").run(moduleId);
    d.prepare("DELETE FROM requirements WHERE module_id = ?").run(moduleId);
    const iu = d.prepare("INSERT INTO use_cases (module_id, code, ord, data) VALUES (?, ?, ?, ?)");
    ucs.forEach((u, i) => iu.run(moduleId, u.code, i, JSON.stringify(u)));
    const ir = d.prepare("INSERT INTO requirements (module_id, code, ord, data) VALUES (?, ?, ?, ?)");
    reqs.forEach((r, i) => ir.run(moduleId, r.code, i, JSON.stringify(r)));
  });
}

export function saveUseCase(moduleId: string, uc: UseCase): void {
  const d = getDb();
  const ex = d.prepare("SELECT ord FROM use_cases WHERE module_id = ? AND code = ?").get(moduleId, uc.code) as Row | undefined;
  if (ex) d.prepare("UPDATE use_cases SET data = ? WHERE module_id = ? AND code = ?").run(JSON.stringify(uc), moduleId, uc.code);
  else {
    const m = d.prepare("SELECT COALESCE(MAX(ord), -1) AS o FROM use_cases WHERE module_id = ?").get(moduleId) as Row;
    d.prepare("INSERT INTO use_cases (module_id, code, ord, data) VALUES (?, ?, ?, ?)").run(moduleId, uc.code, Number(m.o) + 1, JSON.stringify(uc));
  }
}

export function saveRequirements(moduleId: string, reqs: Requirement[]): void {
  tx(() => {
    const d = getDb();
    d.prepare("DELETE FROM requirements WHERE module_id = ?").run(moduleId);
    const ir = d.prepare("INSERT INTO requirements (module_id, code, ord, data) VALUES (?, ?, ?, ?)");
    reqs.forEach((r, i) => ir.run(moduleId, r.code, i, JSON.stringify(r)));
  });
}

export function saveSrs(moduleId: string, srs: SrsDoc): void {
  getDb().prepare("INSERT INTO srs (module_id, data) VALUES (?, ?) ON CONFLICT(module_id) DO UPDATE SET data = excluded.data").run(moduleId, JSON.stringify(srs));
}

export function saveSequences(moduleId: string, seqs: SequenceDiagram[]): void {
  tx(() => {
    const d = getDb();
    d.prepare("DELETE FROM sequences WHERE module_id = ?").run(moduleId);
    const st = d.prepare("INSERT INTO sequences (module_id, use_case_code, ord, data) VALUES (?, ?, ?, ?)");
    seqs.forEach((s, i) => st.run(moduleId, s.useCaseCode, i, JSON.stringify(s)));
  });
}

export function saveSequence(moduleId: string, seq: SequenceDiagram): void {
  const d = getDb();
  const ex = d.prepare("SELECT ord FROM sequences WHERE module_id = ? AND use_case_code = ?").get(moduleId, seq.useCaseCode) as Row | undefined;
  if (ex) d.prepare("UPDATE sequences SET data = ? WHERE module_id = ? AND use_case_code = ?").run(JSON.stringify(seq), moduleId, seq.useCaseCode);
  else {
    const m = d.prepare("SELECT COALESCE(MAX(ord), -1) AS o FROM sequences WHERE module_id = ?").get(moduleId) as Row;
    d.prepare("INSERT INTO sequences (module_id, use_case_code, ord, data) VALUES (?, ?, ?, ?)").run(moduleId, seq.useCaseCode, Number(m.o) + 1, JSON.stringify(seq));
  }
}

export function getTests(moduleId: string): TestCase[] {
  return listData<TestCase>("test_cases", moduleId);
}

export function saveTests(moduleId: string, tests: TestCase[]): void {
  tx(() => {
    const d = getDb();
    d.prepare("DELETE FROM test_cases WHERE module_id = ?").run(moduleId);
    const st = d.prepare("INSERT INTO test_cases (module_id, code, ord, data) VALUES (?, ?, ?, ?)");
    tests.forEach((t, i) => st.run(moduleId, t.code, i, JSON.stringify(t)));
  });
}

// ---------- Đợt 5: đọc thẳng bảng của C4 (user_stories) và C5 (module_docs) – chỉ đọc, không ghi ----------
export interface ModuleDocRow {
  kind: DocKind;
  content: string;
  data: ModuleDocData | null;
  status: ArtifactStatus;
  rev: number;
}

export function getModuleDocRow(moduleId: string, kind: DocKind): ModuleDocRow | null {
  const r = getDb().prepare("SELECT kind, content, data, status, rev FROM module_docs WHERE module_id = ? AND kind = ?").get(moduleId, kind) as Row | undefined;
  if (!r) return null;
  return { kind: r.kind, content: r.content ?? "", data: J(r.data), status: r.status, rev: Number(r.rev) };
}

/** User story của module theo thứ tự hiển thị (bảng `user_stories`, C4). */
export function listModuleStories(moduleId: string): UserStory[] {
  return (getDb().prepare("SELECT * FROM user_stories WHERE module_id = ? ORDER BY ord, code").all(moduleId) as Row[]).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    moduleId: r.module_id ?? null,
    code: r.code,
    asA: r.as_a ?? "",
    iWant: r.i_want ?? "",
    soThat: r.so_that ?? "",
    acceptanceCriteria: J(r.acceptance_criteria, []),
    priority: r.priority,
    order: Number(r.ord ?? 0),
    rev: Number(r.rev ?? 1),
    updatedBy: r.updated_by ?? null,
    updatedAt: r.updated_at ?? null,
    createdAt: r.created_at,
  }));
}

// Dữ liệu C5 ghi có thể thiếu trường mảng – chuẩn hoá để các hàm dùng .map/.includes không vỡ.
const arrOf = (v: unknown): any[] => (Array.isArray(v) ? v : []);
function normUseCase(u: any): UseCase {
  return {
    ...u,
    code: String(u?.code ?? ""),
    name: String(u?.name ?? ""),
    actors: arrOf(u?.actors).map(String),
    description: String(u?.description ?? ""),
    trigger: String(u?.trigger ?? ""),
    preconditions: arrOf(u?.preconditions).map(String),
    postconditions: arrOf(u?.postconditions).map(String),
    mainFlow: arrOf(u?.mainFlow),
    altFlows: arrOf(u?.altFlows).map((a: any) => ({ ...a, steps: arrOf(a?.steps).map(String) })),
    exceptions: arrOf(u?.exceptions).map((a: any) => ({ ...a, steps: arrOf(a?.steps).map(String) })),
    businessRules: arrOf(u?.businessRules).map(String),
    screenIds: arrOf(u?.screenIds).map(String),
    assumptions: arrOf(u?.assumptions).map(String),
  };
}
function normRequirement(r: any): Requirement {
  return {
    ...r,
    code: String(r?.code ?? ""),
    type: r?.type === "NFR" ? "NFR" : "FR",
    statement: String(r?.statement ?? ""),
    priority: ["High", "Medium", "Low"].includes(r?.priority) ? r.priority : "Medium",
    useCaseCodes: arrOf(r?.useCaseCodes).map(String),
    source: String(r?.source ?? ""),
    isAssumption: !!r?.isAssumption,
  };
}

export function getModuleDetail(id: string): ModuleDetail | null {
  const m = getModule(id);
  if (!m) return null;
  const project = getProject(m.projectId)!;
  return {
    ...m,
    project,
    screens: listScreens(id),
    annotations: listAnnotationsForModule(id),
    docs: getDocs(id),
    tests: getTests(id),
  };
}

// ---------- Prompt runs (log phục vụ đánh giá thực nghiệm) ----------
export function logRun(r: Omit<PromptRun, "id" | "createdAt">): PromptRun {
  const run: PromptRun = { ...r, id: uid(), createdAt: now() };
  getDb()
    .prepare(
      "INSERT INTO prompt_runs (id, module_id, type, provider, model, input, output, ok, error, input_tokens, output_tokens, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(run.id, run.moduleId, run.type, run.provider, run.model, run.input, run.output, run.ok ? 1 : 0, run.error, run.inputTokens, run.outputTokens, run.latencyMs, run.createdAt);
  return run;
}

export function listRuns(moduleId: string): PromptRun[] {
  return (getDb().prepare("SELECT * FROM prompt_runs WHERE module_id = ? ORDER BY created_at DESC LIMIT 200").all(moduleId) as Row[]).map((r) => ({
    id: r.id,
    moduleId: r.module_id,
    type: r.type,
    provider: r.provider,
    model: r.model,
    input: r.input,
    output: r.output,
    ok: Boolean(r.ok),
    error: r.error,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    latencyMs: Number(r.latency_ms),
    createdAt: r.created_at,
  }));
}

export function setDocStatus(moduleId: string, status: DocStatus): void {
  updateModule(moduleId, { docsStatus: status });
}

/** Số lần gọi Claude thật từ đầu ngày (UTC) – dùng cho giới hạn MAX_AI_CALLS_PER_DAY. */
export function countClaudeRunsToday(): number {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM prompt_runs WHERE provider = 'claude' AND created_at >= ?").get(start.toISOString()) as Row;
  return Number(r.n);
}

// ---------- Gợi ý thành phần (log Áp dụng / Bỏ qua để đo tỷ lệ chấp nhận) ----------
export interface SuggestionEvent {
  screenId: string;
  versionId: string | null;
  kind: string;
  targetNodeId: string | null;
  title: string;
  confidence: number;
  action: "shown" | "applied" | "dismissed";
}

export function logSuggestionEvent(e: SuggestionEvent): void {
  getDb()
    .prepare("INSERT INTO suggestion_events (id, screen_id, version_id, suggestion_kind, target_node_id, title, confidence, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(uid(), e.screenId, e.versionId, e.kind, e.targetNodeId, e.title, e.confidence, e.action, now());
}

export function suggestionStats(moduleId: string): { shown: number; applied: number; dismissed: number; acceptanceRate: number; byKind: Record<string, { shown: number; applied: number }> } {
  const rows = getDb()
    .prepare(
      `SELECT e.suggestion_kind AS kind, e.action AS action, COUNT(*) AS n FROM suggestion_events e JOIN screens s ON s.id = e.screen_id
       WHERE s.module_id = ? GROUP BY e.suggestion_kind, e.action`,
    )
    .all(moduleId) as Row[];
  const t = { shown: 0, applied: 0, dismissed: 0 };
  const byKind: Record<string, { shown: number; applied: number }> = {};
  for (const r of rows) {
    const n = Number(r.n);
    t[r.action as keyof typeof t] += n;
    const k = (byKind[r.kind] ??= { shown: 0, applied: 0 });
    if (r.action === "shown") k.shown += n;
    if (r.action === "applied") k.applied += n;
  }
  return { ...t, acceptanceRate: t.shown ? t.applied / t.shown : 0, byKind };
}

// ---------- Kho tài liệu (files) ----------
import type { FileRecord } from "../shared/types.ts";

const toFileRecord = (r: Row): FileRecord => ({
  id: r.id,
  projectId: r.project_id,
  moduleId: r.module_id ?? null,
  name: r.name,
  mime: r.mime,
  size: Number(r.size),
  source: r.source,
  createdAt: r.created_at,
});

export function createFile(rec: FileRecord & { storedName: string }): FileRecord {
  getDb()
    .prepare("INSERT INTO files (id, project_id, module_id, name, stored_name, mime, size, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(rec.id, rec.projectId, rec.moduleId, rec.name, rec.storedName, rec.mime, rec.size, rec.source, rec.createdAt);
  return {
    id: rec.id,
    projectId: rec.projectId,
    moduleId: rec.moduleId,
    name: rec.name,
    mime: rec.mime,
    size: rec.size,
    source: rec.source,
    createdAt: rec.createdAt,
  };
}

export function listFiles(projectId: string): FileRecord[] {
  return (
    getDb()
      .prepare("SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as Row[]
  ).map(toFileRecord);
}

export function getFile(id: string): (FileRecord & { storedName: string }) | null {
  const r = getDb().prepare("SELECT * FROM files WHERE id = ?").get(id) as Row | undefined;
  if (!r) return null;
  return {
    ...toFileRecord(r),
    storedName: r.stored_name,
  };
}

export function deleteFileRow(id: string): void {
  getDb().prepare("DELETE FROM files WHERE id = ?").run(id);
}

export function findExportFile(projectId: string, moduleId: string, name: string): (FileRecord & { storedName: string }) | null {
  const r = getDb()
    .prepare("SELECT * FROM files WHERE project_id = ? AND module_id = ? AND name = ? AND source = 'export'")
    .get(projectId, moduleId, name) as Row | undefined;
  if (!r) return null;
  return {
    ...toFileRecord(r),
    storedName: r.stored_name,
  };
}


