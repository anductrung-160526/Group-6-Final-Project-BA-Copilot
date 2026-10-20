# Báo cáo QA – BA Copilot v2 (A11)

Người lập: **A11 – Kiểm thử E2E & QA**. Ngày: 2026-10-20. Node v24.16.0, Chrome cài trên máy (Playwright 1.64, chưa tải Chromium riêng).

## 1. Bản được kiểm thử

Nhánh `v2-features` chưa có (A0 chưa gộp đợt 2), A10 chưa chạy. Vì vậy A11 dựng **bản gộp tạm** (worktree `E:/wt-a11-int`, HEAD tách rời, **không đẩy lên, không gộp vào nhánh nào**):

| Bước | Nội dung |
|---|---|
| 1 | `v2-contract` @ `1aabff2` |
| 2 | Gộp theo thứ tự: `agent/a2-r005-file-response` → `a8-qus` → `a4-kho-tai-lieu` → `a3-thanh-vien` → `a6-kanban` → `a7-tu-cap-nhat` → `a5-so-do-uc` → `a9-goi-y` |
| 3 | Xung đột mã duy nhất: `client/routes.ts` (A3, A4, A6 cùng thay dòng giữ chỗ). Giải: giữ cả 3 import, 3 dòng trỏ `TasksView`, `FilesView`, `MembersView`. Xung đột `docs/agents/STATUS.md`, `REQUESTS.md` lấy bản `v2-contract` (chỉ để chạy thử) |
| 4 | **Mô phỏng 3 điểm chèn A0** (commit riêng trên bản tạm): R-005 (`<TopBar />` trong `main.tsx`), R-011 (`registerTaskAutomation()` trong `createApp`), `currentActorId` của `TasksView` → `currentMemberId()` |

## 2. Kết quả chạy

| Hạng mục | Bản gộp thô (bước 3) | Bản gộp + điểm chèn A0 (bước 4) |
|---|---|---|
| `npx tsc --noEmit` | ✅ | ✅ |
| `npm test` | ✅ 143/143 | ✅ 143/143 |
| `npm run build` | ✅ `app.js` 363,2 kB | ✅ |
| `e2e/demo-flow.mjs` (mới) | ❌ dừng ở bước chuẩn bị: không có ô "Tôi là…" (Q-01) | ✅ **27/27 kiểm tra**, 0 lỗi JavaScript |
| `e2e/e2e.mjs` (cũ, hồi quy) | – | ✅ 18/18 kiểm tra (chạy với `E2E_BASE`, `CHROME_PATH`; xem Q-12) |
| Nhánh `agent/a11-e2e` (chỉ thêm tệp A11) | `npm test` ✅ 66/66 · build ✅ `app.js` 334,2 kB | |

A10 commit `b6ee7cd` trong lúc A11 chạy. Đã gộp thêm vào bản tạm: `npm run seed` chạy 2 lần liên tiếp trên DB mới không lỗi, không nhân đôi dữ liệu; `npm test` vẫn 143/143. `demo-flow.mjs` không phụ thuộc seed (tự tạo dữ liệu trên DB tạm).

Không bật lại trên bản thô sau khi sửa Q-01: thiếu R-011 thì bước 2–4 của luồng demo chắc chắn trượt (task không tự đổi trạng thái), A7 đã ghi rõ ở R-011 và đã kiểm chứng ngược trên bản có chèn.

### 2.1. Các kiểm tra trong `e2e/demo-flow.mjs`

| Luồng | Kiểm tra | FN / BR |
|---|---|---|
| Chuẩn bị | Thêm 2 thành viên (BA Lead, BA); "Tôi là…" nhớ sau khi tải lại; tạo dự án, module ví dụ mẫu; AI sinh màn Đăng nhập | FN-01, FN-02 |
| **Gợi ý** | Khối "Gợi ý tiếp theo" có gợi ý kèm lý do ("Quên mật khẩu" – nút ở màn Đăng nhập chưa có đích); bấm **Tạo** chỉ mở hộp thoại; hộp thoại điền sẵn tên + prompt; màn mới xuất hiện; gợi ý đó biến mất | FN-58 → FN-60, BR-06, BR-08 |
| **Demo 1** | Tạo task "Vẽ UC diagram" gắn *Sơ đồ UC – Xác thực* → cột Cần làm (kèm task "Viết tài liệu đặc tả" gắn *Tài liệu – Xác thực*) | FN-15, FN-16 |
| | Sinh tài liệu → task tài liệu Đang làm; BA Lead duyệt → Xong | FN-20, FN-21 |
| **Demo 2** | AI (Mock) sinh sơ đồ (mã `flowchart`, Mermaid vẽ được) → task Đang làm | FN-11, FN-20 |
| **Demo 3** | BA Lead duyệt sơ đồ → task Xong; lịch sử task ghi "Hệ thống (lý do)" | FN-13, FN-21, FN-23 |
| **Demo 4** | Sửa màn Đăng nhập đã duyệt → tài liệu Lỗi thời → task tài liệu **Cần làm lại**; task sơ đồ vẫn Xong | BR-02, FN-22 |
| **QUS** | Gõ 2 story lỗi trong popup Tạo module → **55/100 Cần sửa**, 4 lỗi gồm WELL_FORMED, có gợi ý viết lại; bấm Tạo module vẫn lưu | FN-51 → FN-53, FN-55, BR-05 |
| Ảnh | 9 trang × 2 độ rộng (1280, 375) + ảnh từng bước; đo tràn ngang | – |

Cách chạy: `npm run build && node e2e/demo-flow.mjs` (tự bật server Mock ở cổng 3299 với DB và thư mục tệp tạm). Ảnh ở `e2e/demo-flow/` (đã nằm trong `.gitignore`).

## 3. Danh sách lỗi

Mức độ: **Cao** = chặn luồng demo hoặc mất chức năng Bắt buộc · **Trung bình** = sai hợp đồng / chức năng chạy sai nhưng có đường vòng · **Thấp** = giao diện, nhãn, tiện ích.

| Mã | Mức | Agent sở hữu tệp | Tệp | Mô tả | Cách tái hiện | Hướng xử lý |
|---|---|---|---|---|---|---|
| Q-01 | **Cao** | A0 chèn (tệp của A2) – yêu cầu R-005 của A3 | `client/main.tsx` | Thanh trên vẫn là header cũ: không có menu Công việc / Kho tài liệu / Thành viên, không có ô "Tôi là…". Không chọn được BA Lead để duyệt | Gộp các nhánh đợt 2, `npm run build`, mở `#/` → thanh trên chỉ có logo và "Chế độ Mock". `node e2e/demo-flow.mjs` dừng ở bước Chuẩn bị | Làm đúng R-005. Đã kiểm chứng trên bản tạm |
| Q-02 | **Cao** | A0 chèn (tệp của A2) – yêu cầu R-011 của A7 | `server/app.ts` | Không ai gọi `registerTaskAutomation()` → task không tự chuyển Đang làm / Xong / Cần làm lại (FN-20 → FN-23). Test đơn vị vẫn xanh vì test tự đăng ký | Bản gộp thô: tạo task gắn sơ đồ UC, sinh sơ đồ → task vẫn ở Cần làm | Làm đúng R-011. Đã kiểm chứng: 4 bước demo xanh |
| Q-03 | Trung bình | A0 chèn (tệp A2, `repo.ts`, `ProjectView.tsx`) – R-020, R-021, R-022 của A8 | `server/app.ts`, `server/repo.ts`, `client/views/ProjectView.tsx` | FN-56 chưa chạy: tạo module xong `GET /api/modules/:id/qus` trả `score: null`; `GET /api/projects/:id` không có `modules[].qusScore`; danh sách module không có cột điểm | Tạo module có story → `GET /api/modules/<id>/qus` → `"score":null`; `GET /api/projects/<id>` → `modules[0]` không có `qusScore` | Làm R-020 → R-022 (FN-56 là "Nếu kịp") |
| Q-04 | Trung bình | A2 – yêu cầu R-009 của A5 | `server/app.ts` | `GET /api/modules/:id/diagram` khi chưa sinh trả `{"ok":true}` thay vì `null` (lệch `docs/api.md` mục 3). Giao diện đã chịu được nhưng client khác sẽ hiểu sai | Module mới → `GET /api/modules/<id>/diagram` → `{"ok":true}` | Làm R-009, sau đó A5 bỏ nhánh tạm |
| Q-05 | Trung bình | A3 (`TopBar.tsx`) + A1 (`styles.css` `.topbar`) | `client/components/TopBar.tsx`, `client/styles.css` | Ở 375 px thanh trên không xuống dòng: menu pill bị bóp mất chữ, ô "Tôi là…" chỉ còn mũi tên, nhãn "Chế độ Mock" vỡ 4 dòng, logo bị cắt. Gặp ở **mọi trang** | Mở bất kỳ trang nào ở độ rộng 375 px (ảnh `375-*.png`) | Cho `.topbar` xuống dòng / ẩn phụ đề và nhãn AI ở màn hẹp; có thể cần thêm class vào design system (A1) |
| Q-06 | Trung bình | A6 (`TasksView.tsx`) + A1 (`.page-head`, `.filters`, `.kanban`) | `client/views/TasksView.tsx`, `client/styles.css` | Trang Công việc ở 375 px rộng 671 px: tiêu đề bị ép thành cột hẹp, bộ lọc + nút "+ Công việc mới" tràn khỏi màn, chỉ thấy 1,5 cột Kanban | `#/p/<id>/tasks` ở 375 px (`375-cong-viec.png`) | `.page-head` cho phép xuống dòng; `.kanban` cuộn ngang trong khung thay vì làm cả trang tràn |
| Q-07 | Thấp | A3 (`MembersView.tsx`) | `client/views/MembersView.tsx` | Trang Thành viên ở 375 px rộng 395 px: bảng không cuộn trong khung, cột "Xoá" bị cắt | `#/members` ở 375 px | Bọc bảng trong vùng cuộn ngang (class có sẵn hoặc xin A1) |
| Q-08 | Thấp | A4 (`FilesView.tsx`) | `client/views/FilesView.tsx` | Kho tài liệu ở 375 px rộng 430 px (hàng tìm kiếm + lọc module không xuống dòng). Ở 1280 px khung "Kho chưa có tài liệu nào" thụt vào 16 px so với vùng kéo thả và ô tìm kiếm | `#/p/<id>/files` ở 375 px và 1280 px | Cho hàng lọc xuống dòng; bỏ lề thừa của `Empty` trong trang |
| Q-09 | Thấp | A1 (`ui.tsx` `SuggestionCard`) | `client/components/ui.tsx` | Mỗi thẻ gợi ý có nút **Tạo** kiểu primary → cột trái Design Studio có tới 6 nút primary (5 "Tạo" + "+ Mới"), trái quy tắc "mỗi vùng tối đa một nút primary" (design-system mục 1.3) | Tab Thiết kế của module có ≥ 2 gợi ý (`1280-thiet-ke.png`) | Đổi "Tạo" sang `secondary`, hoặc ghi ngoại lệ vào `design-system.md` |
| Q-10 | Thấp | A9 | `shared/suggest.ts` | Tên màn đề xuất từ FR bị cắt vụng: "Hệ thống phải kiểm tra: Email:", "Hệ thống phải cho phép Khách" | Sinh tài liệu (Mock) cho module ví dụ mẫu, quay lại tab Thiết kế | Bỏ cụm "Hệ thống phải …", dấu ":" cuối khi đặt tên |
| Q-11 | Thấp | A6 | `client/views/TaskDialog.tsx` | Ô "Người làm" hiện vai trò mã thô: "Trần Thu Hà · BA_LEAD" (thanh trên hiện đúng "BA Lead") | Mở "+ Công việc mới", xổ ô Người làm | Map vai trò qua `ROLE_LABEL` của `client/currentMember.ts` (sau khi gộp A3) |
| Q-12 | Thấp | Không có chủ (A0 quyết) | `e2e/e2e.mjs` | `npm run e2e` không chạy trên Windows: `spawn("npx")` không có `shell` → `ENOENT`; `process.kill(-pid)` không dùng được trên Windows; mặc định cần Chromium của Playwright | Windows: `npm run e2e` | Dùng cách bật server như `e2e/demo-flow.mjs` (gọi thẳng `tsx/dist/cli.mjs` bằng `process.execPath`, dự phòng `channel: "chrome"`) |
| Q-13 | Thấp | A5 (`DiagramTab.tsx`) | `client/views/DiagramTab.tsx` | "Sinh lại" dùng `confirm()` của trình duyệt thay cho `Modal` (design-system mục 1.5) | Tab Sơ đồ UC, đã có sơ đồ, bấm "Sinh lại" | Chuyển sang `Modal` |

Các điểm chèn đã biết, **không gây lỗi nhìn thấy trong luồng demo** nhưng chưa làm (ghi để A0 không sót): `RelatedTasks` vào `DesignTab`/`DocsTab` (FN-19), `actorId` ở `FilesView` (A4) và `DiagramTab` (A5), R-006/R-007 (tên tác giả phiên bản, FN-03), R-006 của A4 (xoá `LegacyFilesPage`, `FilesTab.tsx`), R-010 (`.split-2`), R-012 và R-023 (dọn CSS `.suggest-*`, `.qus-*`). Số yêu cầu R-005 → R-008 đang **trùng** giữa nhánh A3 và A4.

## 4. Đối chiếu bằng mắt với `docs/design-system.md` (1280 px)

Đạt: font Space Grotesk cho tiêu đề, Inter cho nội dung; mint chỉ ở nút chính, tab chọn, mục chọn menu trái (màn đang chọn in đậm, nền mint-50, vạch mint-500), liên kết; badge ôm sát chữ (StatusBadge, ScoreBadge "55/100 Cần sửa", nhãn ưu tiên); hộp thoại = `Modal` (Module mới, Màn hình mới), panel task = `Drawer`, rỗng = `Empty`, thông báo = toast; menu thanh trên dùng `Tabs variant="pill"`; IssueList theo thứ tự lỗi → cảnh báo; `#/_gallery` hiển thị đủ component mục 3. Ngoại lệ: Q-08, Q-09, Q-13.

375 px: design system **chưa có quy tắc cho màn hẹp**. Tràn ngang đo được: Công việc 671 px, Kho tài liệu 430 px, Gallery 418 px, Thành viên 395 px, Thiết kế / Tài liệu / Sơ đồ UC 377 px (2 px, do thanh trên). Trang chủ và Dự án không tràn nhưng vẫn vỡ thanh trên (Q-05).

## 5. Kết luận

- Khi A0 làm **R-005 và R-011** lúc gộp, luồng demo và 2 luồng mới **xanh trên bản build**; không còn lỗi mức Cao.
- Trên bản gộp thô (chưa chèn) còn **2 lỗi Cao** (Q-01, Q-02) – cả hai nằm ở tệp của A2, A11 không được sửa.
- Đề xuất A0 chạy lại `node e2e/demo-flow.mjs` sau khi gộp xong `v2-features` (và sau A10 nếu seed đổi dữ liệu).

---

## 6. Chạy lại trên bản gộp thật `v2-demo` (A0, 2026-10-20)

Bản kiểm thử: nhánh `v2-demo` = `v2-features` (gộp đợt 2 + mọi điểm chèn của A0) + `agent/a10-seed` + `agent/a11-e2e`. **Không mô phỏng điểm chèn nào**, không dùng `E:/wt-a11-int`.

| Hạng mục | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npm test` | ✅ 143/143 |
| `npm run build` | ✅ |
| `node e2e/demo-flow.mjs` | ✅ **27/27 kiểm tra**, 0 lỗi JavaScript |
| `e2e/e2e.mjs` (cũ, chạy trên `v2-features`, cùng mã giao diện) | ✅ 18/18 (với `E2E_BASE`, `CHROME_PATH`; Q-12 còn nguyên) |
| `npm run seed` trên DB mới | ✅ 5 thành viên, 2 module (QUS 100 và 75 hiện ở trang dự án), 4 tệp tên tiếng Việt: tải về 200, PDF/ảnh xem trước `inline`, 8 task đủ 4 cột |

### Trạng thái lỗi sau khi gộp thật

| Mã | Trạng thái | Ghi chú |
|---|---|---|
| Q-01 | ✅ Hết | R-005 đã chèn (`6c466d7`) |
| Q-02 | ✅ Hết | R-011 đã chèn (`43588c0`) |
| Q-03 | ✅ Hết | R-020 → R-022 đã chèn; trang dự án có cột Chất lượng |
| Q-04 | ✅ Hết | R-009 đã sửa, A5 bỏ nhánh tạm (`8ced088`) |
| Q-05 → Q-08 | ⏳ Còn | Tràn ngang 375 px không đổi: Công việc 671, Kho tài liệu 430, Gallery 418, Thành viên 395, Thiết kế / Tài liệu / Sơ đồ UC 377 px. Trang dự án từng tràn 501 px do cột Chất lượng mới, A0 đã sửa bằng `.table-wrap` (`78ae37b`) |
| Q-09 | ⏳ Còn | Nút "Tạo" primary trên thẻ gợi ý |
| Q-10 | ⏳ Còn | Tên màn đề xuất từ FR bị cắt vụng |
| Q-11 | ⏳ Còn | Vai trò mã thô "BA_LEAD" – nằm ở `MemberPicker` trong `client/components/ui.tsx` (A1), không phải `TaskDialog.tsx` |
| Q-12 | ⏳ Còn | `npm run e2e` không tự bật server trên Windows |
| Q-13 | ⏳ Còn | "Sinh lại" sơ đồ dùng `confirm()` |

Các điểm chèn "không gây lỗi nhìn thấy" ghi ở cuối mục 3 đều đã làm: `RelatedTasks` (DesignTab, DocsTab), `actorId` ở FilesView / DiagramTab / DesignTab, R-006/R-007 của A3, dọn `LegacyFilesPage` + `FilesTab.tsx` (nay là R-014), `.split-2`, dọn CSS `.suggest-*`, `.qus-*`. Số trùng R-005/R-006 của A4 đã đổi thành R-013/R-014.

**Kết luận:** không còn lỗi mức Cao hay Trung bình về chức năng trên `v2-demo`. Còn lại Q-05 → Q-08 (Trung bình/Thấp, giao diện màn hẹp) và các lỗi Thấp Q-09 → Q-13.

---

## 7. Sửa lỗi Q-05 → Q-13 (A0, 2026-10-20, commit `96a5a56` trên `v2-demo`)

| Mã | Đã sửa | Tệp |
|---|---|---|
| Q-05 | Màn ≤ 640 px: thanh trên xuống 2 hàng (logo + "Tôi là…" / menu pill), ẩn phụ đề và nhãn chế độ AI | `styles.css` |
| Q-06 | `.page-head`, `.filters` được xuống dòng; Kanban cuộn ngang trong khung | `styles.css` |
| Q-07 | Bảng thành viên trong `.table-wrap` | `MembersView.tsx` |
| Q-08 | Bảng tệp trong `.table-wrap`; hàng lọc xuống dòng; `Empty` trong `.page` thẳng mép với nội dung khác | `FilesView.tsx`, `styles.css` |
| (377 px) | Tiêu đề module (`.module-title-row`) xuống dòng; mẫu chữ ở `#/_gallery` về 1 cột trên màn hẹp | `styles.css` |
| Q-09 | Nút "Tạo" của `SuggestionCard` là `secondary`; cột trái chỉ còn một nút primary "+ Mới" | `ui.tsx`, `design-system.md` |
| Q-10 | Tên màn gợi ý: bỏ "Hệ thống phải (cho phép … thực hiện)", lấy thao tác trong ngoặc kép, dừng trước mệnh đề phụ ("theo", "để", "cho"…), bỏ chú thích trong ngoặc, không kết thúc bằng từ nối, tối đa 8 từ. FR "Hệ thống phải kiểm tra: …" (quy tắc trường) không còn thành gợi ý màn. Test mới (d2) | `shared/suggest.ts`, `tests/suggest.test.ts` |
| Q-11 | Ô "Người làm" hiện "BA Lead" thay "BA_LEAD" (`ROLE_LABEL`) | `TaskDialog.tsx`, `design-system.md` |
| Q-12 | `npm run e2e` tự bật server trên Windows (gọi `tsx` bằng `node`, DB + `DATA_DIR` tạm), dự phòng Chrome cài sẵn khi thiếu Chromium | `e2e/e2e.mjs` |
| Q-13 | Thêm `useUI().confirm(...)` (hiện `Modal`, nút Huỷ + nút đồng ý, `danger` cho xoá) vào design system + `#/_gallery`; thay **cả 7** chỗ `window.confirm` (Thiết kế ×2, Tài liệu, Sơ đồ UC, Test case, xoá dự án, xoá module) | `ui.tsx`, `_Gallery.tsx`, `design-system.md`, 6 màn |

Ngoài danh sách: khối "Công việc liên quan" ở cột trái Design Studio có lề (`.studio-left > .box`); `server/taskAutomation.ts` dùng `listTasksByArtifact`/`setTaskStatus`/`memberExists` của A6 thay cho SQL viết lại.

### Kiểm tra sau khi sửa

| Hạng mục | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npm test` | ✅ 144/144 (thêm 1 test Q-10) |
| `npm run build` | ✅ |
| `node e2e/demo-flow.mjs` | ✅ 27/27, **không còn trang tràn ngang** ở 375 px, 0 lỗi JavaScript |
| `npm run e2e` (không đặt biến môi trường nào) | ✅ 18/18 trên Windows |
| Đo 9 trang ở 375 px và 1280 px trên dữ liệu seed | ✅ đều vừa khung |
| `npm run seed` 2 lần trên DB mới | ✅ không lỗi; module Sản phẩm còn 1 gợi ý (link gãy) và 4 đã bỏ qua (trước là 7, vì FR kiểm tra dữ liệu không còn thành gợi ý) |

**Kết luận:** danh sách lỗi Q-01 → Q-13 đã đóng hết.
