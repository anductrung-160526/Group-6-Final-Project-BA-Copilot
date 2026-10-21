// Phần tử mặc định khi chấp nhận một gợi ý bố cục. Mô hình Recursive (Li et al. 2020) chỉ dự đoán loại, cờ lá và khung bao –
// không dự đoán nội dung – nên props là giá trị trung tính, hợp lệ theo validateTree; BA đổi nội dung bằng Prompt sửa thiết kế.
import { ALL_TYPES, ComponentType, isContainer, Props, UINode } from "./design.ts";

const DEFAULT_PROPS: Record<ComponentType, (id: string) => Props> = {
  Page: () => ({ title: "Screen" }),
  Header: () => ({}),
  Sidebar: () => ({}),
  Section: () => ({ title: "New section" }),
  Card: () => ({}),
  Row: () => ({ gap: 8 }),
  Column: () => ({}),
  Form: () => ({ submitAction: "submit" }),
  List: () => ({}),
  Modal: () => ({ title: "Dialog", open: true }),
  Heading: () => ({ text: "Heading", level: 2 }),
  Text: () => ({ text: "Content" }),
  Button: () => ({ label: "Button", variant: "secondary", action: "todo" }),
  Link: () => ({ text: "Link" }),
  Input: (id) => ({ label: "New field", name: id, inputType: "text" }),
  Textarea: (id) => ({ label: "Content", name: id }),
  Select: (id) => ({ label: "Choice", name: id, options: ["Option 1", "Option 2"] }),
  Checkbox: (id) => ({ label: "Option", name: id }),
  Radio: (id) => ({ label: "Choice", name: id, options: ["Choice 1", "Choice 2"] }),
  DatePicker: (id) => ({ label: "Date", name: id }),
  Table: () => ({ columns: ["Column 1", "Column 2", "Column 3"] }),
  Image: () => ({ alt: "Image" }),
  Badge: () => ({ text: "Label" }),
  Alert: () => ({ text: "Notice", tone: "info" }),
  Stat: () => ({ label: "Metric", value: "0" }),
  Avatar: () => ({ name: "User" }),
  Divider: () => ({}),
  Pagination: () => ({ pages: 5 }),
};

/** Node mới loại `type` (không nhận Page); null nếu loại không hợp lệ. Container mới chưa có con. */
export function defaultNode(type: string, id: string): UINode | null {
  if (!ALL_TYPES.includes(type) || type === "Page") return null;
  const t = type as ComponentType;
  return { id, type: t, props: DEFAULT_PROPS[t](id), ...(isContainer(t) ? { children: [] } : {}) };
}
