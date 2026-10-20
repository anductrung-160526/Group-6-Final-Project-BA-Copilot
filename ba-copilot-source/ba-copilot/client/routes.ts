// Registry trang ngoài module: main.tsx chọn trang theo URL từ mảng này; thanh trên (A3) dựng menu từ đây.
// Mỗi agent thay đúng một dòng của mình (A3 Thành viên, A4 Kho tài liệu, A6 Công việc).
//   scope "project": #/p/<projectId>/<key>/<params...>
//   scope "global":  #/<key>/<params...>

import { createElement, type ComponentType } from "react";
import { ProjectView } from "./views/ProjectView.tsx";
import { Gallery } from "./views/_Gallery.tsx";
import { FilesView } from "./views/FilesView.tsx";
import { MembersView } from "./views/MembersView.tsx";

export interface PageProps {
  projectId: string; // "" với trang global
  params: string[]; // các đoạn URL sau <key>
}

export interface AppPage {
  key: string;
  label: string;
  scope: "project" | "global";
  component: ComponentType<PageProps>;
  hidden?: boolean; // không hiện trong menu (vd trang Gallery)
}

/** Trang giữ chỗ cho phân hệ chưa làm. */
function placeholder(title: string, fn: string): ComponentType<PageProps> {
  return () => createElement("div", { className: "page" }, createElement("h1", null, title), createElement("p", { className: "muted" }, `Đang xây dựng (${fn}).`));
}

/** Kho tài liệu hiện tại (nhánh htrung-c4) nằm trong tab của ProjectView; A4 thay bằng FilesView. */
const LegacyFilesPage: ComponentType<PageProps> = ({ projectId, params }) => createElement(ProjectView, { id: projectId, tab: "files", initialModuleId: params[0] || null });

export const PAGES: AppPage[] = [
  { key: "tasks", label: "Công việc", scope: "project", component: placeholder("Công việc", "FN-15 → FN-19") },
  { key: "files", label: "Kho tài liệu", scope: "project", component: FilesView },
  { key: "members", label: "Thành viên", scope: "global", component: MembersView },
  { key: "_gallery", label: "Gallery", scope: "global", component: Gallery, hidden: true },
];

export function pageHref(page: AppPage, projectId?: string): string {
  return page.scope === "project" ? `#/p/${projectId}/${page.key}` : `#/${page.key}`;
}

/** Tìm trang theo các đoạn của hash (đã bỏ "#/"). */
export function matchPage(parts: string[]): { page: AppPage; props: PageProps } | null {
  if (parts[0] === "p" && parts[1]) {
    const page = PAGES.find((p) => p.scope === "project" && p.key === parts[2]);
    return page ? { page, props: { projectId: parts[1], params: parts.slice(3) } } : null;
  }
  const page = PAGES.find((p) => p.scope === "global" && p.key === parts[0]);
  return page ? { page, props: { projectId: "", params: parts.slice(1) } } : null;
}
