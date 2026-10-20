// Registry menu trái trong dự án (kế hoạch đợt 5, mục 3 "C3"). Chủ sở hữu khung: C2.
// C3 dựng ProjectShell + SideNav từ mảng PROJECT_MENU và nối vào main.tsx (C2 KHÔNG nối).
// Mỗi agent đợt 2 thay ĐÚNG MỘT dòng giữ chỗ của mình (cột "owner"): đổi `component: placeholder(...)` thành
// component thật + thêm 1 dòng import. Không đổi key/thứ tự – URL và menu dựa vào đó.
//
// URL (mục 3 "C3"):
//   #/p/:pid/tasks · #/p/:pid/stories · #/p/:pid/files · #/p/:pid/logs[/<moduleId lọc>] · #/p/:pid/git
//   #/p/:pid/work/:moduleId/<docs|diagrams|prototype|tests|trace>[/<sub>]   (sub: DocKind / DiagramKind)

import { createElement, type ComponentType } from "react";
import { DIAGRAM_KINDS, DIAGRAM_KIND_LABEL, DOC_KINDS, DOC_KIND_LABEL } from "../shared/types.ts";
import { Empty } from "./components/ui.tsx";
import { DiagramsView } from "./views/DiagramsView.tsx";
import { DocsView } from "./views/DocsView.tsx";
import { FilesView } from "./views/FilesView.tsx";
import { GitHistoryView } from "./views/GitHistoryView.tsx";
import { LogsTab } from "./views/LogsTab.tsx";
import { StoriesView } from "./views/StoriesView.tsx";
import { TasksView } from "./views/TasksView.tsx";
import { PrototypeStep } from "./views/DesignTab.tsx";
import { TestsStep } from "./views/TestsTab.tsx";
import { TraceStep } from "./views/TraceTab.tsx";

/** Mục cấp 1 của menu trái. */
export type ProjectSection = "tasks" | "stories" | "work" | "files" | "logs" | "git";
/** Bước trong "Thực hiện công việc" (thứ tự cố định, quyết định 6). */
export type WorkStep = "docs" | "diagrams" | "prototype" | "tests" | "trace";

/** Props của trang cấp dự án (giống PageProps của client/routes.ts để dùng lại TasksView, FilesView). */
export interface ProjectPageProps {
  projectId: string;
  params: string[]; // các đoạn URL sau <section>
}

/** Props của một bước trong "Thực hiện công việc". ProjectShell (C3) đã chọn module ở đầu trang. */
export interface WorkStepProps {
  projectId: string;
  moduleId: string;
  /** Đoạn URL sau <step>; params[0] thường là sub (vd "BRD", "ERD"). */
  params: string[];
}

export interface MenuSub {
  key: string; // DocKind / DiagramKind
  label: string;
}

export interface WorkStepItem {
  key: WorkStep;
  no: number; // số bước hiển thị trong SideNav
  label: string;
  icon: string; // tên icon Lucide (Icon của C1 ánh xạ)
  owner: string;
  component: ComponentType<WorkStepProps>;
  /** Mục con (tài liệu / sơ đồ) – SideNav hiện cấp 3 hoặc màn tự hiện stepper. */
  subs?: MenuSub[];
}

export interface ProjectMenuItem {
  key: ProjectSection;
  label: string;
  icon: string; // tên icon Lucide
  owner: string;
  /** Mục "work" không có component riêng: hiển thị theo bước trong `steps`. */
  component?: ComponentType<ProjectPageProps>;
  steps?: WorkStepItem[];
  /** Chỉ BA Lead thấy (ẩn trong menu; server vẫn tự chặn). */
  leadOnly?: boolean;
}

/** Trang giữ chỗ cho màn chưa làm: "Đang xây dựng (Cx)". */
export function placeholder<P extends object>(title: string, owner: string): ComponentType<P> {
  const C = () => createElement("div", { className: "page" }, createElement(Empty, { title }, `Đang xây dựng (${owner}).`));
  C.displayName = `Placeholder_${owner}`;
  return C;
}

export const DOC_SUBS: MenuSub[] = DOC_KINDS.map((k) => ({ key: k, label: DOC_KIND_LABEL[k] }));
export const DIAGRAM_SUBS: MenuSub[] = DIAGRAM_KINDS.map((k) => ({ key: k, label: DIAGRAM_KIND_LABEL[k] }));

export const WORK_STEPS: WorkStepItem[] = [
  { key: "docs", no: 1, label: "Tài liệu", icon: "FileText", owner: "C5", component: DocsView, subs: DOC_SUBS },
  { key: "diagrams", no: 2, label: "Sơ đồ", icon: "Network", owner: "C6", component: DiagramsView, subs: DIAGRAM_SUBS },
  { key: "prototype", no: 3, label: "Prototype", icon: "LayoutTemplate", owner: "C9", component: PrototypeStep },
  { key: "tests", no: 4, label: "Test case", icon: "FlaskConical", owner: "C9", component: TestsStep },
  { key: "trace", no: 5, label: "Truy vết", icon: "Route", owner: "C9", component: TraceStep },
];

export const PROJECT_MENU: ProjectMenuItem[] = [
  // tasks: Kanban 4 cột Cần làm · Đang làm · Xong · Đã duyệt (C7).
  { key: "tasks", label: "Quản lý công việc", icon: "SquareKanban", owner: "C7", component: TasksView },
  { key: "stories", label: "Yêu cầu nghiệp vụ", icon: "BookText", owner: "C4", component: StoriesView },
  { key: "work", label: "Thực hiện công việc", icon: "Workflow", owner: "C3", steps: WORK_STEPS },
  { key: "files", label: "Kho tài liệu", icon: "FolderOpen", owner: "A4", component: FilesView },
  { key: "logs", label: "Nhật ký AI", icon: "ScrollText", owner: "C3", component: LogsTab },
  { key: "git", label: "Lịch sử GitHub", icon: "GitBranch", owner: "C8", component: GitHistoryView },
];

/** Mục mở mặc định khi bấm vào dự án (quyết định mục 3 "C3"). */
export const DEFAULT_SECTION: ProjectSection = "tasks";

// ---------------------------------------------------------------- dựng / đọc URL
const enc = encodeURIComponent;

export const projectHref = (projectId: string, section: Exclude<ProjectSection, "work"> = DEFAULT_SECTION) => `#/p/${enc(projectId)}/${section}`;

export const workHref = (projectId: string, moduleId: string, step: WorkStep = "docs", sub?: string) =>
  `#/p/${enc(projectId)}/work/${enc(moduleId)}/${step}${sub ? `/${enc(sub)}` : ""}`;

export const tasksHref = (pid: string) => projectHref(pid, "tasks");
export const storiesHref = (pid: string) => projectHref(pid, "stories");
export const filesHref = (pid: string) => projectHref(pid, "files");
export const logsHref = (pid: string) => projectHref(pid, "logs");
export const gitHref = (pid: string) => projectHref(pid, "git");

export interface ProjectRoute {
  projectId: string;
  section: ProjectSection;
  item: ProjectMenuItem;
  /** Chỉ với section "work": module đang chọn ("" = chưa chọn) và bước (mặc định "docs"). */
  moduleId?: string;
  step?: WorkStepItem;
  params: string[];
}

/** Đọc các đoạn hash (đã bỏ "#/"): ["p", pid, section, ...]. Không khớp → null. */
export function matchProjectRoute(parts: string[]): ProjectRoute | null {
  if (parts[0] !== "p" || !parts[1]) return null;
  const projectId = decodeURIComponent(parts[1]);
  const item = PROJECT_MENU.find((m) => m.key === (parts[2] || DEFAULT_SECTION));
  if (!item) return null;
  if (item.key !== "work") return { projectId, section: item.key, item, params: parts.slice(3).map(decodeURIComponent) };
  const moduleId = parts[3] ? decodeURIComponent(parts[3]) : "";
  const step = WORK_STEPS.find((s) => s.key === (parts[4] || "docs"));
  if (!step) return null;
  return { projectId, section: "work", item, moduleId, step, params: parts.slice(5).map(decodeURIComponent) };
}

/** Tab của URL cũ #/m/:moduleId/<tab> → URL mới (C3 chuyển hướng; cần projectId của module). */
export const LEGACY_MODULE_TAB: Record<string, { step: WorkStep; sub?: string } | { section: "logs" }> = {
  design: { step: "prototype" },
  docs: { step: "docs" },
  diagram: { step: "diagrams", sub: "UC" },
  tests: { step: "tests" },
  trace: { step: "trace" },
  logs: { section: "logs" },
};

export function legacyModuleHref(projectId: string, moduleId: string, tab = "design"): string {
  const t = LEGACY_MODULE_TAB[tab] ?? LEGACY_MODULE_TAB.design;
  return "section" in t ? `${logsHref(projectId)}/${enc(moduleId)}` : workHref(projectId, moduleId, t.step, t.sub);
}
