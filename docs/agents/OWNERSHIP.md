# Bảng sở hữu tệp – BA Copilot v2

Nguồn: mục 4 của `docs/Ke_hoach_Agent_BA_Copilot_v2.md`. Người giữ bảng: **A0**.

**Quy ước đường dẫn**
- Đường dẫn mã nguồn (`server/…`, `client/…`, `shared/…`, `tests/…`, `scripts/…`, `e2e/…`) tính từ `ba-copilot-source/ba-copilot/`.
- Đường dẫn bắt đầu bằng `docs/` tính từ gốc repo.

**Luật**
1. Agent chỉ tạo hoặc sửa tệp trong dòng của mình. Muốn sửa tệp khác thì dừng lại và ghi yêu cầu vào `docs/agents/REQUESTS.md`.
2. Khi gộp, A0 đối chiếu `git diff --name-only v2-contract...agent/<mã>` với bảng này (cổng kiểm tra số 3).
3. Nếu xung đột chạm tệp của agent khác, A0 không tự sửa mà trả lại agent sở hữu tệp đó.
4. Sau đợt 1, hợp đồng (`shared/types.ts`, `docs/api.md`, `docs/erd.md`) **bị khoá**. Muốn đổi thì mở yêu cầu với A0.

## 1. Tệp sở hữu riêng

| Agent | Tệp sở hữu |
|---|---|
| A0 – Tích hợp & Điều phối | `docs/agents/STATUS.md`, `docs/agents/OWNERSHIP.md`, `docs/agents/REQUESTS.md`, các điểm chèn được giao khi gộp (xem mục 2) |
| A1 – Design System | `client/styles.css`, `client/components/ui.tsx`, `client/views/_Gallery.tsx`, `docs/design-system.md` |
| A2 – Nền tảng dữ liệu & hợp đồng | `server/db.ts`, `server/http.ts`, `server/app.ts`, `server/events.ts`, `server/routes/index.ts`, `shared/types.ts`, `client/main.tsx`, `client/routes.ts`, `client/views/moduleTabs.ts`, `client/views/ModuleView.tsx` (phần khung tab), `client/api.ts` (stub hàm gọi API mới), `tests/contract.test.ts`, `docs/erd.md`, `docs/api.md` |
| A3 – Thành viên & thanh trên | `server/routes/members.ts`, `server/repo/members.ts`, `client/views/MembersView.tsx`, `client/components/TopBar.tsx`, `client/currentMember.ts`, `tests/members.test.ts` |
| A4 – Kho tài liệu | `server/files.ts`, `server/routes/files.ts`, `client/views/FilesView.tsx`, `client/views/FileDrawer.tsx`, `tests/files.test.ts` (và `client/views/FilesTab.tsx` cũ, sẽ tách thành `FilesView.tsx`) |
| A5 – Sơ đồ UC | `shared/ucDiagram.ts`, `server/routes/diagram.ts`, `client/views/DiagramTab.tsx`, `tests/ucDiagram.test.ts` |
| A6 – Công việc Kanban | `server/routes/tasks.ts`, `server/repo/tasks.ts`, `client/views/TasksView.tsx`, `client/views/TaskDialog.tsx`, `client/components/RelatedTasks.tsx`, `tests/tasks.test.ts` |
| A7 – Tự cập nhật trạng thái task | `shared/taskRules.ts`, `server/taskAutomation.ts`, `tests/taskRules.test.ts`, `tests/taskAutomation.test.ts` |
| A8 – Chất lượng yêu cầu (QUS) | `shared/qus.ts`, `client/components/QusPanel.tsx`, `server/routes/qus.ts`, `tests/qus.test.ts`, `docs/qus/` |
| A9 – Gợi ý màn tiếp theo | `shared/suggest.ts`, `server/routes/suggest.ts`, `client/components/SuggestionsPanel.tsx`, `tests/suggest.test.ts` |
| A10 – Dữ liệu demo | `scripts/seed.ts` |
| A11 – Kiểm thử E2E & QA | `e2e/demo-flow.mjs`, `docs/agents/QA_REPORT.md` |
| A12 – Tài liệu & Triển khai | `README.md`, `docs/T1_Tools.md`, `DEPLOY.md` (nếu cần cập nhật) |

## 2. Tệp dùng chung – chỉ sửa đúng điểm chèn

| Tệp | Agent được chạm | Phạm vi cho phép |
|---|---|---|
| `client/views/ModuleView.tsx` | A2 | Phần khung tab (registry `moduleTabs.ts`) |
| | A8 | Chỉ khối `<Modal>` Sửa yêu cầu (FN-54) |
| `client/views/ProjectView.tsx` | A8 | Chỉ khối `<Modal>` Tạo module (FN-53) |
| `client/views/DesignTab.tsx` | A3 | 2 chỗ hiển thị tên tác giả: ghim bình luận và danh sách phiên bản (FN-03) |
| | A9 | 2 điểm: chèn `SuggestionsPanel` vào cột trái; hộp thoại tạo màn nhận `initialName`/`initialPrompt`. Được xoá khối gợi ý màn cũ (`screenDismissed`, `updateScreenDismissed`, `suggestions`, JSX `suggest-block`); không đụng state `dismissed` của gợi ý bố cục ML |
| | A0 | Chèn `RelatedTasks` do A6 giao (FN-19), làm khi gộp |
| `client/views/DocsTab.tsx` | A0 | Chèn `RelatedTasks` do A6 giao (FN-19), làm khi gộp |
| `client/views/moduleTabs.ts` | A5 | Đăng ký đúng một dòng cho `DiagramTab` |
| `client/routes.ts` | A3, A4, A6 | Thay đúng một dòng giữ chỗ của mình (`members`, `files`, `tasks`) |
| | A1 | Dòng `_gallery` (A0 đã đăng ký khi gộp đợt 1) |
| `server/routes/index.ts` | A2 | Tạo sẵn import cho mọi tệp route; agent tính năng không sửa |
| `server/routes/{members,tasks,diagram,qus,suggest,files}.ts` | A2 tạo stub (đợt 1) | Sau đợt 1 mỗi tệp thuộc agent ghi ở mục 1; `files.ts` đã chứa 4 route Kho tài liệu thật |
| `server/service.ts` | A2 | Chèn lệnh `emit` (đợt 1) |
| | A8 | Chỉ thêm một lệnh gọi tính điểm trong hàm cập nhật module (FN-56) |
| `server/ai/pipelines.ts`, `server/ai/mock.ts` | A5 | Chỉ thêm hàm mới ở cuối tệp, không sửa code cũ |
| `public/app.js`, `public/app-style.css` | — | Sản phẩm build, không sửa tay. Sinh lại bằng `npm run build` sau mỗi lần gộp (A0) |

## 3. Tệp không thuộc agent nào

Mọi tệp không có trong mục 1 và mục 2 (ví dụ `server/ai/*` khác, `model/`, `dataset/`, `scripts/` ngoài `seed.ts`, các tệp test của mô hình gợi ý ML từ nhánh `trung_ba`) thì **không agent nào được sửa** trong v2. Cần sửa thì ghi vào `docs/agents/REQUESTS.md` để A0 quyết định.
