// Registry trang NGOÀI dự án (trang global #/<key>/<params...>). Chủ sở hữu: C3.
// Trang trong dự án (#/p/:pid/...) đăng ký ở client/projectMenu.ts và hiển thị trong ProjectShell (menu trái).
// Thanh trên (TopBar) dựng menu ngoài từ mảng này: "Dự án" (trang chủ) + các trang không ẩn.

import type { ComponentType } from "react";
import { Gallery } from "./views/_Gallery.tsx";
import { AdminView } from "./views/AdminView.tsx";

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
  /** Chỉ hiện trong menu khi người đang chọn ở ô "Tôi là…" là BA Lead (màn tự chặn khi mở thẳng URL). */
  leadOnly?: boolean;
}

export const PAGES: AppPage[] = [
  { key: "admin", label: "Administration", scope: "global", component: AdminView, leadOnly: true },
  { key: "_gallery", label: "Gallery", scope: "global", component: Gallery, hidden: true },
];

/** URL cũ của trang global → URL mới (main.tsx chuyển hướng). */
export const LEGACY_GLOBAL: Record<string, string> = { members: "#/admin" };

export function pageHref(page: AppPage, projectId?: string): string {
  return page.scope === "project" ? `#/p/${projectId}/${page.key}` : `#/${page.key}`;
}

/** Tìm trang global theo các đoạn của hash (đã bỏ "#/"). Trang trong dự án do projectMenu.ts xử lý. */
export function matchPage(parts: string[]): { page: AppPage; props: PageProps } | null {
  const page = PAGES.find((p) => p.scope === "global" && p.key === parts[0]);
  return page ? { page, props: { projectId: "", params: parts.slice(1) } } : null;
}
