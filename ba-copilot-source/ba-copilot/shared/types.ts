import type { UINode } from "./design.ts";
import type { QusResult } from "./qus.ts";

/**
 * Đợt 5 (C2): trạng thái chung của mọi sản phẩm (màn, tài liệu, sơ đồ, test case).
 * none = chưa có · draft = Đang làm · done = Xong (BA bấm) · approved = Đã duyệt (BA Lead) · outdated = Bản cũ (bước trước đổi).
 * Cờ "Yêu cầu sửa" đi riêng (`revisionRequested`), không phải một trạng thái.
 */
export type ArtifactStatus = "none" | "draft" | "done" | "approved" | "outdated";
export const ARTIFACT_STATUSES: ArtifactStatus[] = ["none", "draft", "done", "approved", "outdated"];

/** Màn hình dùng chung ArtifactStatus (màn đã tồn tại nên không có "none"). Dữ liệu cũ draft/approved giữ nguyên. */
export type ScreenStatus = Exclude<ArtifactStatus, "none">;
/** Trạng thái cũ ở `modules.docs_status` / `modules.tests_status` – nay là ArtifactStatus. */
export type DocStatus = ArtifactStatus;

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Module {
  id: string;
  projectId: string;
  name: string;
  requirementInput: string;
  docsStatus: DocStatus;
  testsStatus: DocStatus;
  createdAt: string;
  /** FN-56: điểm QUS lần lưu yêu cầu gần nhất (null = chưa chấm). */
  qusScore?: number | null;
  qusCheckedAt?: string | null;
  /** Đợt 5: chặn đè + cờ Yêu cầu sửa của bộ test case (cột `modules.tests_*`). C9 đọc trong `toModule()`. */
  testsRev?: number;
  testsRevisionRequested?: boolean;
}

export interface Screen {
  id: string;
  moduleId: string;
  name: string;
  status: ScreenStatus;
  currentVersionId: string | null;
  createdAt: string;
  /** Đợt 5: số bản (tăng mỗi lần ghi nội dung), cờ Yêu cầu sửa, người/lúc ghi cuối. C9 đọc trong `toScreen()`. */
  rev?: number;
  revisionRequested?: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface ScreenVersion {
  id: string;
  screenId: string;
  number: number;
  kind: "generate" | "edit" | "revert" | "layout" | "manual";
  prompt: string;
  scope: "global" | "region" | "";
  selectedIds: string[];
  changedIds: string[];
  rejected: { reason: string }[];
  tree: UINode;
  createdAt: string;
  /** FN-03: tên người tạo phiên bản (chụp lại lúc tạo) và mã thành viên. */
  author?: string;
  authorId?: string | null;
}

export interface Annotation {
  id: string;
  screenId: string;
  versionId: string;
  nodeIds: string[];
  bbox: { x: number; y: number; w: number; h: number } | null;
  comment: string;
  author: string;
  /** FN-03: mã thành viên đã bình luận (null với dữ liệu cũ). */
  authorId?: string | null;
  status: "open" | "sent" | "resolved";
  createdAt: string;
}

export interface FlowStep {
  no: number;
  actor: string; // tên actor hoặc "Hệ thống"
  text: string;
  screenId?: string;
  nodeId?: string;
}

export interface AltFlow {
  code: string; // vd A1, E1
  name: string;
  branchFrom: number; // bước của main flow
  steps: string[];
}

export interface UseCase {
  code: string; // UC-01
  name: string;
  actors: string[];
  description: string;
  trigger: string;
  preconditions: string[];
  postconditions: string[];
  mainFlow: FlowStep[];
  altFlows: AltFlow[];
  exceptions: AltFlow[];
  businessRules: string[];
  screenIds: string[];
  assumptions: string[];
}

export interface Requirement {
  code: string; // FR-01, NFR-01
  type: "FR" | "NFR";
  statement: string;
  priority: "High" | "Medium" | "Low";
  useCaseCodes: string[];
  source: string; // màn hình/node hoặc prompt nguồn
  isAssumption: boolean;
}

export interface SrsSection {
  key: string;
  title: string;
  content: string; // markdown đơn giản
}

export interface SrsDoc {
  sections: SrsSection[];
}

export interface SequenceDiagram {
  useCaseCode: string;
  title: string;
  mermaid: string;
}

export interface TestCase {
  code: string; // TC-01
  title: string;
  type: "Positive" | "Negative" | "Boundary";
  priority: "High" | "Medium" | "Low";
  useCaseCode: string;
  flowRef: string; // "main" | "A1" | "E1" ...
  requirementCodes: string[];
  preconditions: string;
  testData: string;
  steps: string[];
  expected: string;
}

export interface DocBundle {
  useCases: UseCase[];
  requirements: Requirement[];
  srs: SrsDoc | null;
  sequences: SequenceDiagram[];
}

export interface PromptRun {
  id: string;
  moduleId: string | null;
  type: string;
  provider: string;
  model: string;
  input: string;
  output: string;
  ok: boolean;
  error: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  createdAt: string;
}

export interface ScreenWithTree extends Screen {
  tree: UINode | null;
  versionNumber: number;
}

export interface ModuleDetail extends Module {
  project: Project;
  screens: ScreenWithTree[];
  annotations: Annotation[];
  docs: DocBundle;
  tests: TestCase[];
}

export interface FileRecord {
  id: string;
  projectId: string;
  moduleId: string | null;
  name: string;
  mime: string;
  size: number;
  source: "upload" | "export";
  createdAt: string;
}


// =============================================================== v2 – hợp đồng (khoá sau đợt 1, xem docs/api.md, docs/erd.md)

// ---------- Thành viên (FN-01 → FN-03)
export type MemberRole = "BA" | "BA_LEAD";

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  createdAt: string;
  /** Đợt 5: đã đặt mật khẩu chưa. KHÔNG BAO GIỜ trả `password_hash` ra client. C3 đọc trong `toMember()`. */
  hasPassword?: boolean;
}

/**
 * Đợt 5 – GET /api/me. `mode`:
 * - "demo": chưa thành viên nào có mật khẩu → app chạy như cũ, người thao tác lấy từ `actorId` client gửi.
 * - "member": có ít nhất một mật khẩu → bắt buộc đăng nhập thành viên, người thao tác lấy từ phiên.
 */
export interface MeInfo {
  member: Member | null;
  mode: "demo" | "member";
  /** true khi đặt APP_PASSWORD (cổng mật khẩu chung khi deploy, có từ trước đợt 5). */
  appAuth: boolean;
}

export interface LoginInput {
  /** Một trong hai: mã thành viên hoặc tên (không phân biệt hoa thường). */
  memberId?: string;
  name?: string;
  password: string;
}

// ---------- Sản phẩm có thể gắn vào task và phát sự kiện
/** Loại tài liệu của module, theo thứ tự bước (kế hoạch đợt 5, quyết định 7). */
export type DocKind = "BRD" | "UC_SPEC" | "SRS" | "FRD_NFR" | "API_SPEC";
export const DOC_KINDS: DocKind[] = ["BRD", "UC_SPEC", "SRS", "FRD_NFR", "API_SPEC"];
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  BRD: "BRD",
  UC_SPEC: "UC Specification",
  SRS: "SRS",
  FRD_NFR: "FRD-NFR",
  API_SPEC: "API Spec",
};

/** Loại sơ đồ của module, theo thứ tự bước. */
export type DiagramKind = "CONTEXT" | "UC" | "SEQUENCE" | "BPMN" | "ERD";
export const DIAGRAM_KINDS: DiagramKind[] = ["CONTEXT", "UC", "SEQUENCE", "BPMN", "ERD"];
export const DIAGRAM_KIND_LABEL: Record<DiagramKind, string> = {
  CONTEXT: "Context",
  UC: "Use Case",
  SEQUENCE: "Sequence",
  BPMN: "BPMN",
  ERD: "ERD",
};

/**
 * Đợt 5: "screen" | "doc" | "diagram" | "tests".
 * "docs" (cả bộ tài liệu cũ của module) **chỉ còn để mã v2 chạy** tới khi C5/C7/C9 chuyển sang "doc" + `sub`;
 * mã mới không được dùng. C0 bỏ "docs" khỏi union sau khi gộp xong đợt 2 (REQUESTS R-030).
 */
export type ArtifactKind = "screen" | "doc" | "diagram" | "tests" | "docs";
/** Các loại sản phẩm đợt 5 (không có "docs" cũ). */
export const ARTIFACT_KINDS_V5: Exclude<ArtifactKind, "docs">[] = ["screen", "doc", "diagram", "tests"];

/**
 * Tham chiếu một sản phẩm.
 * - screen: id = screenId.
 * - doc: id = moduleId, sub = DocKind (bắt buộc).
 * - diagram: id = moduleId, sub = DiagramKind (thiếu thì hiểu là "UC" – sơ đồ UC cũ).
 * - tests: id = moduleId.
 * - docs (cũ): id = moduleId.
 */
export interface ArtifactRef {
  kind: ArtifactKind;
  id: string;
  moduleId: string;
  sub?: DocKind | DiagramKind;
}

/** Một dòng trong danh sách chọn sản phẩm gắn kèm task (GET /api/projects/:id/artifacts). */
export interface ArtifactOption extends ArtifactRef {
  label: string; // vd "Màn Đăng nhập", "Tài liệu – Xác thực"
  moduleName: string;
  status: ArtifactStatus | UcDiagramStatus;
}

/** Trạng thái hiện tại của một sản phẩm (GET /api/artifacts/:kind/:id/state, server/db.ts `getArtifactState`). */
export interface ArtifactState {
  ref: ArtifactRef;
  status: ArtifactStatus;
  revisionRequested: boolean;
  /** Số bản để chặn đè; 0 = chưa có bản nào. */
  rev: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Kết quả POST /api/artifacts/:kind/:id/{done|approve|request-change} (C7). */
export interface ApprovalResult {
  state: ArtifactState;
  /** Task gắn với sản phẩm sau khi đổi trạng thái. */
  tasks: Task[];
  /** Chỉ có khi `approve`: kết quả đẩy GitHub của C8. */
  git?: GitPushOutcome;
}

export interface GitPushOutcome {
  /** false khi dự án chưa cấu hình repo ("Chưa cấu hình GitHub – chưa đẩy"). Lỗi GitHub khi đã cấu hình → API trả lỗi, trạng thái không đổi. */
  pushed: boolean;
  message: string;
  commitSha?: string;
  commitUrl?: string;
}

// ---------- Sự kiện (server/events.ts)
/**
 * Đợt 5: drafted (có bản nháp mới / sửa nội dung) · done (BA bấm Xong) · approved (BA Lead Duyệt) ·
 * revision_requested (BA Lead Yêu cầu sửa) · stale (bước trước đổi → Bản cũ).
 * "artifact.unapproved" là sự kiện cũ (bỏ duyệt) **chỉ còn để mã v2 chạy**; mã mới không phát. C0 bỏ sau đợt 2 (R-030).
 */
export type ArtifactEventType =
  | "artifact.drafted"
  | "artifact.done"
  | "artifact.approved"
  | "artifact.revision_requested"
  | "artifact.stale"
  | "artifact.unapproved";

export interface ArtifactEvent {
  type: ArtifactEventType;
  artifact: ArtifactRef;
  actorId?: string;
}

// ---------- Công việc (FN-15 → FN-23)
/**
 * Đợt 5: Cần làm → Đang làm → Xong (BA) → Đã duyệt (BA Lead); Yêu cầu sửa đưa Xong về Đang làm + `revisionRequested`.
 * "redo" là giá trị cũ **chỉ còn để mã v2 biên dịch/chạy**: migration đổi `redo` → `doing` + `revision_requested = 1`
 * mỗi lần khởi động. C7 không được ghi "redo"; C0 bỏ khỏi union sau đợt 2 (R-030).
 */
export type TaskStatus = "todo" | "doing" | "done" | "approved" | "redo";
export const TASK_STATUSES_V5: Exclude<TaskStatus, "redo">[] = ["todo", "doing", "done", "approved"];
export type TaskPriority = "High" | "Medium" | "Low";

export interface Task {
  id: string;
  projectId: string;
  moduleId: string | null;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null; // YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  artifactType: ArtifactKind | null;
  artifactId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Đợt 5: tag "Yêu cầu sửa" (cột `tasks.revision_requested`). C7 đọc trong `toTask()`; tuỳ chọn để mã cũ còn biên dịch. */
  revisionRequested?: boolean;
  /** Đợt 5: loại tài liệu/sơ đồ khi artifactType là doc/diagram (cột `tasks.artifact_sub`). */
  artifactSub?: DocKind | DiagramKind | null;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  fromStatus: TaskStatus | null; // null = lúc tạo task
  toStatus: TaskStatus;
  byMemberId: string | null;
  bySystem: boolean;
  reason: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  events: TaskEvent[];
}

// ---------- Kho tài liệu (FN-04 → FN-10)
export interface FileItem extends FileRecord {
  sender?: string; // stakeholder gửi
  receivedAt?: string | null; // YYYY-MM-DD
  note?: string;
  uploadedBy?: string | null; // memberId
}

// ---------- Sơ đồ UC (FN-11 → FN-14) – bảng cũ `uc_diagrams`, đợt 5 chuyển sang `module_diagrams` kind UC
/** @deprecated đợt 5: dùng ModuleDiagram (stale → "outdated"). Giữ tới khi C6 thay DiagramTab. */
export type UcDiagramStatus = "draft" | "approved" | "stale";

export interface UcDiagram {
  moduleId: string;
  code: string; // mã Mermaid
  status: UcDiagramStatus;
  approvedAt: string | null;
  updatedAt: string;
}

// ---------- Chất lượng yêu cầu (FN-50 → FN-56)
export type { QusIssue, QusResult, StoryScore } from "./qus.ts";
export interface ModuleQus {
  moduleId: string;
  score: number | null; // điểm đã lưu (modules.qus_score)
  checkedAt: string | null;
  result: QusResult; // chấm lại trên requirement_input hiện tại
}

// ---------- Gợi ý màn tiếp theo (FN-57 → FN-61)
export type ScreenSuggestionKind = "broken-link" | "uncovered-fr" | "uncovered-story";

export interface ScreenSuggestion {
  key: string; // mã ổn định: "link:<screenId>:<nodeId>", "fr:<code>", "story:<hash>"
  kind: ScreenSuggestionKind;
  name: string; // tên màn đề xuất
  reason: string; // lý do hiển thị cho BA
  source: string; // mã FR, story, hoặc "<màn nguồn> › <nhãn nút>" (BR-08)
  prompt: string; // prompt điền sẵn cho hộp thoại Màn hình mới (FN-60)
}

export interface ScreenSuggestions {
  items: ScreenSuggestion[]; // đã loại các gợi ý bị bỏ qua
  dismissed: ScreenSuggestion[]; // gợi ý đang bị bỏ qua, để khôi phục (FN-61)
  /**
   * Lần chạy AI "màn còn thiếu" gần nhất (Claude; Mock khi chưa có khoá). Link gãy luôn tính lại, không cần AI.
   * hasSource: module có FR hoặc user story để hỏi; checkedAt null = chưa chạy lần nào;
   * outdated: FR / story / màn đã đổi kể từ lần chạy đó; provider "mock" = kết quả mẫu, chưa kết nối Claude.
   */
  ai: { hasSource: boolean; checkedAt: string | null; outdated: boolean; provider: "claude" | "mock" | null };
}

// =============================================================== Đợt 5 – hợp đồng (C2; khoá sau đợt 1, xem docs/api.md "Đợt 5", docs/erd.md)

// ---------- Chặn đè (mục 1, quyết định 9)
/**
 * Mọi bản ghi sản phẩm có `rev` (bắt đầu 1, +1 mỗi lần ghi nội dung; 0 = chưa có bản ghi).
 * API ghi nhận `baseRev` = rev client đang sửa; lệch → 409 `{ error, code: "CONFLICT", rev: <rev hiện tại> }`.
 * Thiếu `baseRev` thì cho qua (tương thích client cũ).
 */
export interface Revisioned {
  rev: number;
  updatedBy: string | null; // memberId
  updatedAt: string | null;
}

/** Mã lỗi máy đọc được trong body lỗi (`{ error, code }`). */
export type ApiErrorCode = "CONFLICT" | "UNAUTHENTICATED" | "FORBIDDEN";

// ---------- Yêu cầu nghiệp vụ – user story cấp dự án (C4)
export type StoryPriority = TaskPriority;

export interface UserStory extends Revisioned {
  id: string;
  projectId: string;
  /** Module gắn kèm; null = chưa gắn (module bị xoá thì về null). */
  moduleId: string | null;
  code: string; // US-01, duy nhất trong dự án
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  priority: StoryPriority;
  order: number;
  createdAt: string;
}

export interface UserStoryInput {
  moduleId?: string | null;
  asA?: string;
  iWant?: string;
  soThat?: string;
  acceptanceCriteria?: string[];
  priority?: StoryPriority;
}

// ---------- Tài liệu theo bước (C5) – bảng `module_docs`
/** Dữ liệu có cấu trúc đi kèm Markdown (test case và truy vết đọc phần này). */
export interface ModuleDocData {
  useCases?: UseCase[]; // UC_SPEC
  requirements?: Requirement[]; // FRD_NFR
  srs?: SrsDoc; // SRS
}

export interface ModuleDoc extends Revisioned {
  moduleId: string;
  kind: DocKind;
  /** Markdown hiển thị / sửa tay / đẩy lên GitHub. */
  content: string;
  data: ModuleDocData | null;
  /** "none" + rev 0 khi chưa sinh (API vẫn trả đủ 5 loại). */
  status: ArtifactStatus;
  revisionRequested: boolean;
}

// ---------- Sơ đồ theo bước (C6) – bảng `module_diagrams`
/** Một sơ đồ con. SEQUENCE: mỗi UC một phần (key = mã UC). Loại khác: thường rỗng. */
export interface DiagramPart {
  key: string;
  title: string;
  code: string; // Mermaid
}

export interface ModuleDiagram extends Revisioned {
  moduleId: string;
  kind: DiagramKind;
  /** Mermaid của sơ đồ (CONTEXT, UC, BPMN, ERD). SEQUENCE để trống, sơ đồ nằm trong `parts`. */
  code: string;
  parts: DiagramPart[];
  status: ArtifactStatus;
  revisionRequested: boolean;
}

// ---------- Hiện diện "Đang được sửa bởi …" (server/presence.ts, client/presence.ts)
export type PresenceKind = "screen" | "doc" | "diagram" | "tests" | "story";

export interface PresenceTarget {
  kind: PresenceKind;
  id: string; // như ArtifactRef.id; story: storyId
  sub?: string; // DocKind / DiagramKind
}

export interface PresenceEntry {
  memberId: string;
  name: string;
  since: string; // ISO – lúc bắt đầu mở
  lastSeen: string; // ISO – nhịp gần nhất
}

// ---------- GitHub (C8)
/** Cấu hình repo của dự án. Token **không bao giờ** trả về client – chỉ có `hasToken`. */
export interface ProjectGit {
  projectId: string;
  repo: string; // link repo, vd https://github.com/org/repo
  branch: string; // mặc định "main"
  hasToken: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface ProjectGitInput {
  repo: string;
  branch?: string;
  /** Bỏ trống/thiếu = giữ token cũ; chuỗi rỗng "" = xoá token. */
  token?: string;
}

export interface GitTestResult {
  ok: boolean;
  message: string;
  branchExists?: boolean;
  defaultBranch?: string;
}

/** Nhật ký mỗi lần Duyệt đẩy lên GitHub (bảng `git_pushes`). */
export interface GitPush {
  id: string;
  projectId: string;
  artifact: ArtifactRef;
  taskId: string | null;
  branch: string;
  commitSha: string;
  commitUrl: string;
  message: string;
  files: string[];
  byMemberId: string | null;
  createdAt: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHistory {
  configured: boolean;
  repo: string;
  branch: string;
  commits: GitCommit[];
  pushes: GitPush[];
}
