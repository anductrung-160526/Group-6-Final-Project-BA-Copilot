// Phần tử mặc định khi chấp nhận một gợi ý bố cục. Mô hình Recursive (Li et al. 2020) chỉ dự đoán loại, cờ lá và khung bao –
// không dự đoán nội dung – nên props là giá trị trung tính, hợp lệ theo validateTree; BA đổi nội dung bằng Prompt sửa thiết kế.
import { ALL_TYPES, ComponentType, isContainer, Props, UINode } from "./design.ts";

const DEFAULT_PROPS: Record<ComponentType, (id: string) => Props> = {
  Page: () => ({ title: "Màn hình" }),
  Header: () => ({}),
  Sidebar: () => ({}),
  Section: () => ({ title: "Phần mới" }),
  Card: () => ({}),
  Row: () => ({ gap: 8 }),
  Column: () => ({}),
  Form: () => ({ submitAction: "submit" }),
  List: () => ({}),
  Modal: () => ({ title: "Hộp thoại", open: true }),
  Heading: () => ({ text: "Tiêu đề", level: 2 }),
  Text: () => ({ text: "Nội dung" }),
  Button: () => ({ label: "Nút", variant: "secondary", action: "todo" }),
  Link: () => ({ text: "Liên kết" }),
  Input: (id) => ({ label: "Trường mới", name: id, inputType: "text" }),
  Textarea: (id) => ({ label: "Nội dung", name: id }),
  Select: (id) => ({ label: "Lựa chọn", name: id, options: ["Tùy chọn 1", "Tùy chọn 2"] }),
  Checkbox: (id) => ({ label: "Tùy chọn", name: id }),
  Radio: (id) => ({ label: "Lựa chọn", name: id, options: ["Phương án 1", "Phương án 2"] }),
  DatePicker: (id) => ({ label: "Ngày", name: id }),
  Table: () => ({ columns: ["Cột 1", "Cột 2", "Cột 3"] }),
  Image: () => ({ alt: "Ảnh" }),
  Badge: () => ({ text: "Nhãn" }),
  Alert: () => ({ text: "Thông báo", tone: "info" }),
  Stat: () => ({ label: "Chỉ số", value: "0" }),
  Avatar: () => ({ name: "Người dùng" }),
  Divider: () => ({}),
  Pagination: () => ({ pages: 5 }),
};

/** Node mới loại `type` (không nhận Page); null nếu loại không hợp lệ. Container mới chưa có con. */
export function defaultNode(type: string, id: string): UINode | null {
  if (!ALL_TYPES.includes(type) || type === "Page") return null;
  const t = type as ComponentType;
  return { id, type: t, props: DEFAULT_PROPS[t](id), ...(isContainer(t) ? { children: [] } : {}) };
}
