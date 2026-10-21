// Registry tab của trang module: ModuleView dựng thanh tab và nội dung từ mảng này.
// Agent tính năng thêm tab bằng đúng một dòng (vd A5: DiagramTab). Thứ tự trong mảng = thứ tự hiển thị.

import { createElement, type ComponentType } from "react";
import type { ModuleDetail } from "../../shared/types.ts";
import { DesignTab } from "./DesignTab.tsx";
import { DocsTab } from "./DocsTab.tsx";
import { DiagramTab } from "./DiagramTab.tsx";
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
    label: "1. Design",
    component: DesignTab,
    note: (m) => {
      const approved = m.screens.filter((s) => s.status === "approved").length;
      return m.screens.length ? (approved ? `${approved}/${m.screens.length} approved` : `${m.screens.length} ${m.screens.length === 1 ? "screen" : "screens"}`) : "Not started";
    },
  },
  { key: "docs", label: "2. Documents", component: DocsTab, note: (m) => m.docsStatus },
  { key: "diagram", label: "Use Case Diagram", component: DiagramTab },
  { key: "tests", label: "3. Test Cases", component: TestsTab, note: (m) => m.testsStatus },
  { key: "trace", label: "4. Traceability", component: TraceTab },
  { key: "logs", label: "AI Log", component: ({ m }) => createElement(LogsTab, { moduleId: m.id }) },
];
