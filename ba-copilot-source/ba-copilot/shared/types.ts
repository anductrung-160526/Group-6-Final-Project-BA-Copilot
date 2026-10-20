import type { UINode } from "./design.ts";
import type { QusResult } from "./qus.ts";

export type ScreenStatus = "draft" | "approved";
export type DocStatus = "none" | "draft" | "approved" | "outdated";

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
}

export interface Screen {
  id: string;
  moduleId: string;
  name: string;
  status: ScreenStatus;
  currentVersionId: string | null;
  createdAt: string;
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
}

// ---------- Sản phẩm có thể gắn vào task và phát sự kiện
export type ArtifactKind = "screen" | "docs" | "diagram" | "tests";

/** Với docs, tests, diagram: id = moduleId (mỗi module có đúng một bộ). Với screen: id = screenId. */
export interface ArtifactRef {
  kind: ArtifactKind;
  id: string;
  moduleId: string;
}

/** Một dòng trong danh sách chọn sản phẩm gắn kèm task (GET /api/projects/:id/artifacts). */
export interface ArtifactOption extends ArtifactRef {
  label: string; // vd "Màn Đăng nhập", "Tài liệu – Xác thực"
  moduleName: string;
  status: ScreenStatus | DocStatus | UcDiagramStatus;
}

// ---------- Sự kiện (server/events.ts)
export type ArtifactEventType = "artifact.drafted" | "artifact.approved" | "artifact.unapproved" | "artifact.stale";

export interface ArtifactEvent {
  type: ArtifactEventType;
  artifact: ArtifactRef;
  actorId?: string;
}

// ---------- Công việc (FN-15 → FN-23)
export type TaskStatus = "todo" | "doing" | "done" | "redo";
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

// ---------- Sơ đồ UC (FN-11 → FN-14)
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
}
