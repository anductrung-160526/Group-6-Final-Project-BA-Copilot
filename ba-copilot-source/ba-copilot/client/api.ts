import type { ArtifactKind, ArtifactOption, FileItem, Member, MemberRole, ModuleQus, ScreenSuggestions, Task, TaskDetail, TaskPriority, TaskStatus, UcDiagram } from "../shared/types.ts";

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: string[]) {
    super(message);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") {
    window.location.reload(); // phiên hết hạn → hiện trang đăng nhập
  }
  if (!res.ok) throw new ApiError(data.error ?? `Lỗi ${res.status}`, res.status, data.details);
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
    throw new ApiError(data.error ?? `Lỗi ${res.status}`, res.status);
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
