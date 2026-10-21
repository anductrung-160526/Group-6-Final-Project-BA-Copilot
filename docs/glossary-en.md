# Bảng thuật ngữ Việt → Anh (giao diện BA Copilot, đợt 6 – D4)

Từ đợt 6 toàn bộ chữ người dùng nhìn thấy trên web là **tiếng Anh** (không có bộ chuyển ngôn ngữ).
Bảng này là chuẩn duy nhất khi viết nhãn mới: dùng đúng chữ ở cột "Tiếng Anh", không tự đặt từ khác.
Thuật ngữ theo BABOK v3 (IIBA) và ISO/IEC/IEEE 29148 (thay IEEE 830).

Quy ước viết hoa: **tiêu đề trang / tên mục menu / tiêu đề cột / tên mục tài liệu** viết hoa chữ đầu mỗi từ
(Title Case: "Acceptance Criteria", "Test Steps"); **nhãn trong câu, nút, thông báo** viết hoa chữ đầu câu
(Sentence case: "Mark as done", "Main flow"). Tên mã (BRD, UC Specification, SRS, FRD-NFR, API Spec, ERD, BPMN) giữ nguyên.

## 1. Trạng thái sản phẩm BA (tài liệu, sơ đồ, prototype, bộ test)

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Chưa có | Not started | Giá trị nội bộ `none` |
| Bản nháp / Đang làm (sản phẩm) | Draft | Một nhãn duy nhất ở mọi chỗ, kể cả câu lý do khoá (`shared/diagrams.ts`, `shared/prereq.ts`, `server/routes/approval.ts`, xuất docx). Giá trị nội bộ `draft` |
| Xong | Done | `done` – chờ BA Lead duyệt |
| Đã duyệt | Approved | `approved` |
| Bản cũ | Outdated | `outdated` |
| Yêu cầu sửa (cờ / tag) | Changes requested | Cờ `revisionRequested` |
| Nút "Xong" | Mark as done | |
| Nút "Duyệt" | Approve | |
| Nút "Yêu cầu sửa" | Request changes | |
| Bỏ duyệt | Approval withdrawn | Chỉ xuất hiện trong lý do lịch sử task |

## 2. Trạng thái công việc (Kanban)

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Cần làm | To do | |
| Đang làm (task) | In progress | **Khác** "Draft" của sản phẩm: task là việc của người, sản phẩm là bản tài liệu. Theo cách gọi chuẩn của Kanban/Jira |
| Xong | Done | |
| Đã duyệt | Approved | |
| Bắt đầu làm | Start work | |
| Quá hạn | Overdue | |
| Người làm / Người phụ trách | Assignee | |
| Hạn | Due date | |
| Ưu tiên: Cao / Trung bình / Thấp | Priority: High / Medium / Low | |
| Sản phẩm gắn kèm | Linked artifact | "Artifact" = sản phẩm công việc của BA (BABOK: work product) |
| Sản phẩm đã xoá | Deleted artifact | |
| Cấp dự án | Project level | Task / tệp không thuộc module |
| Lịch sử trạng thái | Status history | |

## 3. Điều hướng, khung dự án

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Dự án | Projects | Menu thanh trên |
| Quản lý công việc | Task Board | |
| Yêu cầu nghiệp vụ | Business Requirements | Màn user story |
| Thực hiện công việc | **Deliverables** | Khác gợi ý "Workspace": nhóm này chứa đúng 5 sản phẩm BA phải bàn giao (Documents → Diagrams → Prototype → Test Cases → Traceability), nên "Deliverables" (BABOK: deliverable / work product) nói đúng nội dung; "Workspace" quá chung, dễ hiểu nhầm là cả dự án |
| Tài liệu | Documents | Bước 1 |
| Sơ đồ | Diagrams | Bước 2 |
| Prototype | Prototype | Bước 3 |
| Test case | Test Cases | Bước 4 |
| Truy vết | Traceability | Bước 5; bảng bên trong là Traceability Matrix |
| Kho tài liệu | Document Repository | |
| Thành viên | Members | |
| Quản trị hệ thống | Administration | Trang `#/admin` (chỉ BA Lead) |
| Nhật ký AI | AI Log | |
| Lịch sử GitHub | GitHub History | |
| Cài đặt GitHub / Cài đặt dự án | GitHub Settings / Project Settings | |
| Tôi là… (chọn người thao tác) | Acting as | |
| Đăng nhập / Đăng xuất | Sign in / Sign out | |
| Thu gọn / Mở rộng menu | Collapse menu / Expand menu | |

## 4. User story, chất lượng yêu cầu (QUS)

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Vai trò / Mong muốn / Lợi ích | Role / Goal / Benefit | Ô As a / I want / So that |
| Tiêu chí chấp nhận | Acceptance Criteria | Tiêu đề cột: Title Case; trong câu: "acceptance criteria" |
| Độ ưu tiên | Priority | |
| Chưa gắn module | No module | |
| Chất lượng (QUS) | Quality (QUS) | |
| Lỗi / Cảnh báo / Gợi ý | Error / Warning / Suggestion | Mức của vấn đề QUS |
| Tốt / Khá / Cần sửa | Good / Fair / Poor | Thang điểm ScoreBadge (khớp giá trị nội bộ `good/fair/poor`) |
| Đạt chuẩn QUS | Meets the QUS criteria | |
| Từ mơ hồ | Vague term | |

## 5. Tài liệu đặc tả

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Yêu cầu nghiệp vụ (tài liệu) | Business Requirements Document (BRD) | |
| Đặc tả Use Case | UC Specification | |
| Đặc tả yêu cầu phần mềm | Software Requirements Specification (SRS) | Mục theo ISO/IEC/IEEE 29148: 1. Introduction · 2. Overall Description · 3. Functional Requirements · 4. Non-functional Requirements · 5. User Interfaces · 6. Data Dictionary · 7. Assumptions and Open Issues |
| Bối cảnh và mục tiêu (BRD) | Background and Objectives | |
| Tác nhân | Actor | Tác nhân hệ thống: **System** (dữ liệu cũ "Hệ thống" vẫn được nhận) |
| Mô tả / Kích hoạt | Description / Trigger | |
| Tiền điều kiện / Hậu điều kiện | Preconditions / Postconditions | |
| Luồng chính / thay thế / ngoại lệ | Main flow / Alternative flows / Exception flows | Tiêu đề trong docx: Main Flow / Alternative Flows / Exception Flows |
| Rẽ từ bước | Branches from step | |
| Yêu cầu chức năng / phi chức năng | Functional Requirement (FR) / Non-functional Requirement (NFR) | |
| Quy tắc nghiệp vụ | Business rules | |
| Giả định | Assumptions | Gắn nhãn "(Assumption)" sau từng mục |
| Story nguồn | Source stories | |
| Ghi chú chỉnh sửa (BA) | Refinement note (BA) | Khi chỉnh bằng AI theo mục |
| Phiên bản | Version | |
| Sinh bằng AI | Generate with AI | |
| Sinh lại | Regenerate | |
| Chỉnh bằng AI | Refine with AI | |

## 6. Sơ đồ

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Sơ đồ ngữ cảnh | Context diagram | |
| Sơ đồ Use Case | Use Case diagram | |
| Sơ đồ tuần tự | Sequence diagram | |
| BPMN mô phỏng bằng Mermaid | BPMN simulated with Mermaid | Bắt đầu / Kết thúc / Hợp lệ? → Start / End / Valid? |
| Mã Mermaid chưa hợp lệ | Invalid Mermaid code | Chi tiết: "Line N: …" |
| Xem trước | Preview | |
| Có thay đổi chưa lưu | Unsaved changes | |

## 7. Prototype (Design Studio)

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Màn hình | Screen | |
| Chọn / Khoanh vùng / Xem thử | Select / Region / Preview | Chế độ của canvas |
| Thành phần | Layers | Tab cây thành phần |
| Gợi ý (bố cục) | Suggest / Layout suggestion | |
| Tự hoàn thiện bố cục | Auto-complete layout | Trước đây "Hoàn thành bố cục" / "Complete layout" |
| Thành phần (trong gợi ý bố cục) | Component | Không dùng "element", "container", "EOS" trên giao diện |
| Khu vực (nơi gợi ý thêm thành phần) | Area | |
| Bình luận | Comment | Trạng thái: Open / Sent to AI / Resolved; nút Resolve / Reopen |
| Yêu cầu AI sửa thiết kế | Ask AI to edit the design | Trước đây "Prompt sửa thiết kế" / "Design edit prompt" |
| Sinh mới / Khôi phục / Sửa tay / Sửa theo vùng / Sửa toàn màn hình | Generated / Restored / Manual edit / Region edit / Whole-screen edit | Loại phiên bản |
| Xuất HTML / JSON | Export HTML / JSON | |

## 8. Kiểm thử, truy vết

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Bộ test | Test suite | |
| Bước kiểm thử | Test Steps | |
| Dữ liệu kiểm thử | Test Data | |
| Kết quả mong đợi | Expected Result | |
| Tích cực / Tiêu cực / Giá trị biên | Positive / Negative / Boundary | Loại test case |
| Ma trận truy vết | Traceability Matrix | Story → Use Case → Requirement → Screen → Test case |

## 9. Kho tài liệu, GitHub

| Tiếng Việt | Tiếng Anh | Ghi chú |
| --- | --- | --- |
| Stakeholder gửi | Sent by (stakeholder) | Tiêu đề cột: "Sent by" |
| Ngày nhận / Ngày lưu | Received / Saved | |
| Bản xuất | Export | Badge |
| Tải lên / Tải về | Upload / Download | |
| Chưa cấu hình GitHub – chưa đẩy | GitHub is not configured – nothing was pushed | |

## 10. Thao tác chung

| Tiếng Việt | Tiếng Anh |
| --- | --- |
| Thêm / Thêm mới / Mới | Add / Add new / New |
| Sửa / Xoá | Edit / Delete |
| Lưu / Huỷ / Đóng | Save / Cancel / Close |
| Đổi tên | Rename |
| Thêm thao tác | More actions |
| Đang tải… | Loading… |
| Bản đã thay đổi – tải lại | This version has changed – reload |
| Ví dụ / VD | E.g. |

## Ghi chú kỹ thuật

- Giá trị nội bộ không đổi (`none/draft/done/approved/outdated`, `todo/doing/done/approved`, `BRD`, `UC_SPEC`, `data-testid`…).
- Bộ dò từ khoá (QUS, gợi ý màn, Mock AI, đọc lại Markdown tài liệu cũ) nhận **cả tiếng Anh lẫn tiếng Việt**, để dữ liệu cũ trong DB vẫn được hiểu; các vùng đó đánh dấu `vi-keep` và được `npm run check-vi` bỏ qua.
- Ngày giờ hiển thị theo `en-US`.
