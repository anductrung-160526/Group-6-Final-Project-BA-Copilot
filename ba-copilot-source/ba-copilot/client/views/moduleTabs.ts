// Registry tab của trang module: ModuleView dựng thanh tab và nội dung từ mảng này.
// Agent tính năng thêm tab bằng đúng một dòng (vd A5: DiagramTab). Thứ tự trong mảng = thứ tự hiển thị.

import { createElement, type ComponentType } from "react";
import type { ModuleDetail } from "../../shared/types.ts";
import { DesignTab } from "./DesignTab.tsx";
import { DocsTab } from "./DocsTab.tsx";
import { TestsTab } from "./TestsTab.tsx";
import { TraceTab } from "./TraceTab.tsx";
import { LogsTab } from "./LogsTab.tsx";

export interface ModuleTabProps {
  m: ModuleDetail;
  reload: () => Promise<unknown>;
}

export interface ModuleTab {
  key: string; // phần cuối URL: #/m/<moduleId>/<key>
  label: string;
  component: ComponentType<ModuleTabProps>;
  /** Ghi chú cạnh nhãn tab: trạng thái DocStatus ("none" | "draft" | "approved" | "outdated") hiện thành huy hiệu, chuỗi khác hiện dạng chữ. */
  note?: (m: ModuleDetail) => string;
}

export const MODULE_TABS: ModuleTab[] = [
  {
    key: "design",
    label: "1. Thiết kế",
    component: DesignTab,
    note: (m) => {
      const approved = m.screens.filter((s) => s.status === "approved").length;
      return m.screens.length ? (approved ? `${approved}/${m.screens.length} đã duyệt` : `${m.screens.length} màn hình`) : "Chưa có";
    },
  },
  { key: "docs", label: "2. Tài liệu", component: DocsTab, note: (m) => m.docsStatus },
  { key: "tests", label: "3. Test case", component: TestsTab, note: (m) => m.testsStatus },
  { key: "trace", label: "4. Truy vết", component: TraceTab },
  { key: "logs", label: "Nhật ký AI", component: ({ m }) => createElement(LogsTab, { moduleId: m.id }) },
];
