import type {
  ApiErrorCode,
  ApprovalResult,
  ArtifactKind,
  ArtifactOption,
  ArtifactState,
  DiagramKind,
  DiagramPart,
  DocKind,
  FileItem,
  GitHistory,
  GitTestResult,
  LoginInput,
  MeInfo,
  Member,
  MemberRole,
  ModuleDiagram,
  ModuleDoc,
  ModuleDocData,
  ModuleQus,
  PresenceEntry,
  PresenceTarget,
  ProjectGit,
  ProjectGitInput,
  PromptRun,
  ScreenSuggestions,
  Task,
  TaskDetail,
  TaskPriority,
  TaskStatus,
  UcDiagram,
  UserStory,
  UserStoryInput,
} from "../shared/types.ts";

/**
 * Lỗi API. `code` lấy từ body lỗi của server:
 * - "CONFLICT" (409): bản đã bị người khác sửa – hiện `ConflictNotice` và tải lại; `data.rev` = rev hiện tại.
 * - "UNAUTHENTICATED" (401), "FORBIDDEN" (403, không phải BA Lead).
 * 409 không có `code` là xung đột nghiệp vụ khác (vd xoá thành viên đang giữ task) – không phải chặn đè.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string[],
    public code?: ApiErrorCode,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** true khi lỗi là chặn đè (409 CONFLICT). */
export const isConflict = (e: unknown): e is ApiError => e instanceof ApiError && e.code === "CONFLICT";

/** true khi lỗi là 404 (dự án / module không tồn tại) – màn hiện trạng thái "không tìm thấy" thay vì toast. */
export const isNotFound = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 404;

/** Đường dẫn màn đăng nhập thành viên (C3 làm LoginView). */
export const LOGIN_HASH = "#/login";

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") {
    // mode "member": chưa đăng nhập thành viên → màn đăng nhập trong app; còn lại (APP_PASSWORD) → tải lại để hiện trang mật khẩu.
    if (data?.mode === "member") {
      if (window.location.hash !== LOGIN_HASH) window.location.hash = LOGIN_HASH;
    } else window.location.reload();
  }
  if (!res.ok) {
    const { error, details, code, ...rest } = data ?? {};
    throw new ApiError(error ?? `Error ${res.status}`, res.status, details, code, rest);
  }
  return data as T;
}

export const get = <T = any>(p: string) => api<T>("GET", p);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>("POST", p, b);
export const patch = <T = any>(p: string, b: unknown) => api<T>("PATCH", p, b);
export const put = <T = any>(p: string, b: unknown) => api<T>("PUT", p, b);
export const del = <T = any>(p: string) => api<T>("DELETE", p);

/** Tải file từ API (docx/xlsx) – hiển thị lỗi nếu server trả JSON lỗi. */
export async function download(path: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? `Error ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? cd.match(/filename="([^"]+)"/)?.[1] ?? "export");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// =============================================================== v2 – hàm gọi API theo docs/api.md
// Server đang trả 501 cho các endpoint này cho tới khi agent sở hữu (ghi ở từng nhóm) làm xong.
const enc = encodeURIComponent;
const qs = (q: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : "";
};

// Thành viên – A3
export interface MemberInput { name: string; role: MemberRole }
export const listMembers = () => get<Member[]>("/api/members");
export const createMember = (b: MemberInput) => post<Member>("/api/members", b);
export const updateMember = (id: string, b: Partial<MemberInput>) => patch<Member>(`/api/members/${enc(id)}`, b);
export const deleteMember = (id: string) => del<{ ok: true }>(`/api/members/${enc(id)}`);

// Kho tài liệu – A4
export interface FileUploadInput { name: string; contentBase64: string; moduleId?: string | null; sender?: string; receivedAt?: string | null; note?: string; actorId?: string }
export interface FileUpdateInput { name?: string; moduleId?: string | null; sender?: string; receivedAt?: string | null; note?: string }
export const listFiles = (projectId: string, q: { moduleId?: string; q?: string } = {}) => get<FileItem[]>(`/api/projects/${enc(projectId)}/files${qs(q)}`);
export const uploadFile = (projectId: string, b: FileUploadInput) => post<FileItem>(`/api/projects/${enc(projectId)}/files`, b);
export const getFileItem = (id: string) => get<FileItem>(`/api/files/${enc(id)}`);
export const updateFile = (id: string, b: FileUpdateInput) => patch<FileItem>(`/api/files/${enc(id)}`, b);
export const deleteFile = (id: string) => del<{ ok: true }>(`/api/files/${enc(id)}`);
export const filePreviewUrl = (id: string) => `/api/files/${enc(id)}/preview`;
export const fileDownloadUrl = (id: string) => `/api/files/${enc(id)}/download`;

// Sơ đồ UC – A5
export const getDiagram = (moduleId: string) => get<UcDiagram | null>(`/api/modules/${enc(moduleId)}/diagram`);
export const generateDiagram = (moduleId: string, actorId?: string) => post<UcDiagram>(`/api/modules/${enc(moduleId)}/diagram/generate`, { actorId });
export const saveDiagram = (moduleId: string, code: string, actorId?: string) => put<UcDiagram>(`/api/modules/${enc(moduleId)}/diagram`, { code, actorId });
export const approveDiagram = (moduleId: string, approved: boolean, actorId?: string) => post<UcDiagram>(`/api/modules/${enc(moduleId)}/diagram/approve`, { approved, actorId });

// Công việc – A6
export interface TaskInput {
  title: string;
  description?: string;
  moduleId?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  artifactType?: ArtifactKind | null;
  artifactId?: string | null;
}
export const listTasks = (projectId: string, q: { assigneeId?: string; moduleId?: string } = {}) => get<Task[]>(`/api/projects/${enc(projectId)}/tasks${qs(q)}`);
export const createTask = (projectId: string, b: TaskInput & { status?: TaskStatus; actorId?: string }) => post<Task>(`/api/projects/${enc(projectId)}/tasks`, b);
export const getTask = (id: string) => get<TaskDetail>(`/api/tasks/${enc(id)}`);
export const updateTask = (id: string, b: Partial<TaskInput>) => patch<Task>(`/api/tasks/${enc(id)}`, b);
export const setTaskStatus = (id: string, status: TaskStatus, actorId?: string) => patch<Task>(`/api/tasks/${enc(id)}/status`, { status, actorId });
export const deleteTask = (id: string) => del<{ ok: true }>(`/api/tasks/${enc(id)}`);
export const listArtifacts = (projectId: string) => get<ArtifactOption[]>(`/api/projects/${enc(projectId)}/artifacts`);
export const listArtifactTasks = (kind: ArtifactKind, id: string) => get<Task[]>(`/api/artifacts/${kind}/${enc(id)}/tasks`);

// Chất lượng yêu cầu – A8
export const getModuleQus = (moduleId: string) => get<ModuleQus>(`/api/modules/${enc(moduleId)}/qus`);

// Gợi ý màn tiếp theo – A9
export const getScreenSuggestions = (moduleId: string) => get<ScreenSuggestions>(`/api/modules/${enc(moduleId)}/suggestions`);
export const dismissSuggestion = (moduleId: string, key: string) => post<{ ok: true }>(`/api/modules/${enc(moduleId)}/suggestions/${enc(key)}/dismiss`);
export const restoreSuggestion = (moduleId: string, key: string) => del<{ ok: true }>(`/api/modules/${enc(moduleId)}/suggestions/${enc(key)}/dismiss`);

// =============================================================== Đợt 5 – docs/api.md mục "Đợt 5"
// Endpoint ghi sản phẩm nhận `baseRev` (rev client đang sửa); lệch → ApiError code "CONFLICT" (isConflict).
// Endpoint đánh dấu 501 trả lỗi cho tới khi agent sở hữu làm xong.

// Đăng nhập, phiên – C2 (đã chạy); màn đăng nhập/quản trị – C3
export const login = (b: LoginInput) => post<{ ok: true; member: Member }>("/api/login", b);
export const logout = () => post<{ ok: true }>("/api/logout");
export const getMe = () => get<MeInfo>("/api/me");
/** password rỗng = xoá mật khẩu. BA Lead đặt cho mọi người; thành viên tự đổi của mình. */
export const setMemberPassword = (id: string, password: string) => put<Member>(`/api/members/${enc(id)}/password`, { password });

// Hiện diện "Đang được sửa bởi …" – C2 (đã chạy); dùng qua hook usePresence() trong client/presence.ts
export const touchPresence = (t: PresenceTarget, actorId?: string) => post<PresenceEntry[]>("/api/presence", { ...t, actorId });
export const listPresence = (t: PresenceTarget, actorId?: string) => get<PresenceEntry[]>(`/api/presence${qs({ kind: t.kind, id: t.id, sub: t.sub, actorId })}`);
export const leavePresence = (t: PresenceTarget, actorId?: string) => api<{ ok: true }>("DELETE", "/api/presence", { ...t, actorId });

// Nhật ký AI cấp dự án – C2 (đã chạy); màn – C3
export const listProjectRuns = (projectId: string, q: { moduleId?: string } = {}) => get<PromptRun[]>(`/api/projects/${enc(projectId)}/runs${qs(q)}`);

// User story – C4 (501)
export const listStories = (projectId: string, q: { moduleId?: string } = {}) => get<UserStory[]>(`/api/projects/${enc(projectId)}/stories${qs(q)}`);
export const createStory = (projectId: string, b: UserStoryInput) => post<UserStory>(`/api/projects/${enc(projectId)}/stories`, b);
export const reorderStories = (projectId: string, ids: string[]) => post<UserStory[]>(`/api/projects/${enc(projectId)}/stories/reorder`, { ids });
export const getStory = (id: string) => get<UserStory>(`/api/stories/${enc(id)}`);
export const updateStory = (id: string, b: UserStoryInput & { baseRev?: number }) => patch<UserStory>(`/api/stories/${enc(id)}`, b);
export const deleteStory = (id: string) => del<{ ok: true }>(`/api/stories/${enc(id)}`);

// Tài liệu theo bước – C5 (501)
export const listModuleDocs = (moduleId: string) => get<ModuleDoc[]>(`/api/modules/${enc(moduleId)}/docs`);
export const getModuleDoc = (moduleId: string, kind: DocKind) => get<ModuleDoc>(`/api/modules/${enc(moduleId)}/docs/${kind}`);
export const saveModuleDoc = (moduleId: string, kind: DocKind, b: { content: string; data?: ModuleDocData | null; baseRev?: number }) => put<ModuleDoc>(`/api/modules/${enc(moduleId)}/docs/${kind}`, b);
export const generateModuleDoc = (moduleId: string, kind: DocKind, b: { baseRev?: number } = {}) => post<ModuleDoc>(`/api/modules/${enc(moduleId)}/docs/${kind}/generate`, b);
export const refineModuleDoc = (moduleId: string, kind: DocKind, b: { instruction: string; section?: string; baseRev?: number }) => post<ModuleDoc>(`/api/modules/${enc(moduleId)}/docs/${kind}/refine`, b);

// Sơ đồ theo bước – C6 (501)
export const listModuleDiagrams = (moduleId: string) => get<ModuleDiagram[]>(`/api/modules/${enc(moduleId)}/diagrams`);
export const getModuleDiagram = (moduleId: string, kind: DiagramKind) => get<ModuleDiagram>(`/api/modules/${enc(moduleId)}/diagrams/${kind}`);
export const saveModuleDiagram = (moduleId: string, kind: DiagramKind, b: { code: string; parts?: DiagramPart[]; baseRev?: number }) => put<ModuleDiagram>(`/api/modules/${enc(moduleId)}/diagrams/${kind}`, b);
export const generateModuleDiagram = (moduleId: string, kind: DiagramKind, b: { baseRev?: number } = {}) => post<ModuleDiagram>(`/api/modules/${enc(moduleId)}/diagrams/${kind}/generate`, b);

// Xong / Duyệt / Yêu cầu sửa – C7 (state đã chạy; 3 lệnh còn 501). Đợt 5 không có đăng nhập: luôn gửi actorId = currentMemberId() (ô "Tôi là…"). kind: "screen" | "doc" | "diagram" | "tests"; sub cho doc/diagram.
type ArtifactKindV5 = Exclude<ArtifactKind, "docs">;
const artifactPath = (kind: ArtifactKindV5, id: string, action: string) => `/api/artifacts/${kind}/${enc(id)}/${action}`;
export const getArtifactState = (kind: ArtifactKindV5, id: string, sub?: DocKind | DiagramKind) => get<ArtifactState>(`${artifactPath(kind, id, "state")}${qs({ sub })}`);
export const markArtifactDone = (kind: ArtifactKindV5, id: string, b: { sub?: DocKind | DiagramKind; baseRev?: number; actorId?: string } = {}) => post<ApprovalResult>(artifactPath(kind, id, "done"), b);
export const approveArtifact = (kind: ArtifactKindV5, id: string, b: { sub?: DocKind | DiagramKind; baseRev?: number; actorId?: string } = {}) => post<ApprovalResult>(artifactPath(kind, id, "approve"), b);
export const requestArtifactChange = (kind: ArtifactKindV5, id: string, b: { sub?: DocKind | DiagramKind; actorId?: string } = {}) => post<ApprovalResult>(artifactPath(kind, id, "request-change"), b);

// GitHub – C8 (501)
export const getProjectGit = (projectId: string) => get<ProjectGit | null>(`/api/projects/${enc(projectId)}/git`);
export const saveProjectGit = (projectId: string, b: ProjectGitInput) => put<ProjectGit>(`/api/projects/${enc(projectId)}/git`, b);
export const testProjectGit = (projectId: string, b: Partial<ProjectGitInput> = {}) => post<GitTestResult>(`/api/projects/${enc(projectId)}/git/test`, b);
export const getGitHistory = (projectId: string) => get<GitHistory>(`/api/projects/${enc(projectId)}/git/history`);

// Prototype – C9 (501)
export const screenHtmlUrl = (screenId: string) => `/api/screens/${enc(screenId)}/export/html`;
