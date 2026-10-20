# Trạng thái các agent – BA Copilot v2

Người cập nhật: **A0**. Mỗi agent dán kết quả `npm test` / `npm run build` vào dòng của mình trước khi kết thúc.

## Bảng trạng thái

| Mã | Agent | Đợt | Nhánh | Trạng thái | Test | Build | Ghi chú |
|---|---|---|---|---|---|---|---|
| A0 | Tích hợp & Điều phối | 0, 4 | `v2-base` | ✅ Đợt 0 xong | 48/48 (xem lưu ý) | ✅ | Xem nhật ký đợt 0 |
| A1 | Design System | 1 | `chi_task` (`336c9e2`) | ✅ Đã gộp vào `v2-contract` | ✅ | ✅ | Làm thẳng trên `chi_task`, không có nhánh agent riêng. Route `#/_gallery` chuyển sang `client/routes.ts` |
| A2 | Nền tảng dữ liệu & hợp đồng | 1 | `agent/a2-nen-tang` | ✅ Đã gộp vào `v2-contract`; `api.md`/`erd.md` đã duyệt và **khoá** | 59/59 ✅ | ✅ | Xem nhật ký đợt 1 – A0 |
| A3 | Thành viên & thanh trên | 2 | `agent/a3-thanh-vien` | ⏳ Sẵn sàng | — | — | |
| A4 | Kho tài liệu | 2 | `agent/a4-kho-tai-lieu` | ✅ Xong, chờ A0 gộp | 75/75 ✅ | ✅ | FN-04 → FN-10 đạt (kể cả FN-08). Xem nhật ký đợt 2 – A4; yêu cầu R-005, R-006 |
| A3 | Thành viên & thanh trên | 2 | `agent/a3-thanh-vien` | ✅ Xong, chờ gộp. FN-01 đạt; FN-02 đạt sau khi A0 gắn TopBar (R-005); FN-03 một phần (chờ R-006, R-007) | 70/70 ✅ | ✅ | Xem nhật ký đợt 2 – A3 |
| A4 | Kho tài liệu | 2 | `agent/a4-kho-tai-lieu` | ⏳ Sẵn sàng | — | — | Code C4 đã có trên `v2-base` |
| A5 | Sơ đồ UC | 2 | `agent/a5-so-do-uc` | ⏳ Sẵn sàng | — | — | |
| A6 | Công việc Kanban | 2 | `agent/a6-kanban` | ✅ Xong, chờ A0 gộp | 77/77 ✅ (11 test mới) | ✅ | FN-15 → FN-19 đạt. Xem nhật ký đợt 2 – A6 (điểm A0 chèn khi gộp) |
| A5 | Sơ đồ UC | 2 | `agent/a5-so-do-uc` | ✅ Xong, chờ gộp | 81/81 ✅ (15 mới) | ✅ | FN-11 → FN-14 đạt. Mở R-009 (A2, `app.ts` trả `null`), R-010 (A1, class 2 cột). Xem nhật ký đợt 2 – A5 |
| A6 | Công việc Kanban | 2 | `agent/a6-kanban` | ⏳ Sẵn sàng | — | — | |
| A7 | Tự cập nhật trạng thái task | 2 | `agent/a7-tu-cap-nhat` | ⏳ Sẵn sàng | — | — | Gộp sau A6 |
| A8 | Chất lượng yêu cầu (QUS) | 2 | `agent/a8-qus` | ✅ Xong, chờ gộp. FN-50 → FN-55 đạt; FN-56 xong phần của A8, chờ A0 chèn R-020 → R-022 | 75/75 ✅ (`qus.test.ts` 21/21) | ✅ | Xem nhật ký đợt 2 – A8 |
| A6 | Công việc Kanban | 2 | `agent/a6-kanban` | ⏳ Sẵn sàng | — | — | |
| A7 | Tự cập nhật trạng thái task | 2 | `agent/a7-tu-cap-nhat` | ✅ Xong, chờ gộp (sau A6) | 88/88 ✅ | ✅ | FN-20 → FN-23. Khi gộp: R-011 (2 dòng trong `app.ts`). Xem nhật ký đợt 2 – A7 |
| A8 | Chất lượng yêu cầu (QUS) | 2 | `agent/a8-qus` | ⏳ Sẵn sàng | — | — | Phần lớn đã có; việc còn lại ghi ở khung "Hiện trạng" mục A8 trong kế hoạch (chính: FN-56, `ScoreBadge`/`IssueList`) |
| A9 | Gợi ý màn tiếp theo | 2 | `agent/a9-goi-y` | ✅ Xong, chờ gộp (cuối đợt 2) | 70/70 ✅ (`suggest.test.ts` 10/10) | ✅ | FN-57 → FN-61 đạt. API + bảng `suggestion_dismissals`, `SuggestionsPanel` thay khối cũ trong `DesignTab.tsx`, hết 2 chỗ lệch hợp đồng. Mở R-012 (CSS `.suggest-*`, chủ A1). Xem nhật ký đợt 2 – A9 |
| A10 | Dữ liệu demo | 3 | `agent/a10-seed` | ⏳ Chờ đợt 2 | — | — | |
| A11 | Kiểm thử E2E & QA | 3 | `agent/a11-e2e` | ⏳ Chờ A10 | — | — | |
| A12 | Tài liệu & Triển khai | 3, 4 | `agent/a12-trien-khai` | ⏳ Chờ A11 | — | — | |

Thứ tự gộp đợt 2: A8 → A4 → A3 → A6 → A7 → A5 → A9.

## Nhánh xanh theo đợt

| Đợt | Nhánh | Trạng thái |
|---|---|---|
| 0 | `v2-base` | ✅ Test và build qua (2026-10-20) |
| 1 | `v2-contract` | ✅ Build qua, 66/66 test (2026-10-20). **Nhánh nền cho đợt 2** |
| 2 | `v2-features` | ⏳ |
| 3–4 | `v2-demo` | ⏳ |

---

## Nhật ký đợt 0 – A0 (2026-10-20)

**Nhánh:** `v2-base`, tạo từ `origin/trung_ba` @ `4ea6db4`.

### Gộp nhánh

| Bước | Kết quả |
|---|---|
| Gộp `manh/c1-qus` (`f028d1c`) | Xung đột 3 tệp, đã giải (commit `86a730b`) |
| Gộp `htrung-c4-kho-tai-lieu` (`0a5092e`) | *Already up to date*: `manh/c1-qus` đã chứa đủ 3 commit C4 (`33bdb89`, `a014a6b`, `0a5092e`) |
| `main` (`0e490d6`) | Là gốc chung của mọi nhánh, không có gì mới để gộp |

Các tệp `types.ts`, `db.ts`, `app.ts`, `service.ts`, `repo.ts`, `tests/api.test.ts` **tự gộp được, không xung đột**. Xung đột thực tế và cách giải:

| Tệp | Cách giải |
|---|---|
| `client/styles.css` | Giữ cả hai khối: style container rỗng trên canvas (`trung_ba`) và style panel QUS (`c1-qus`), hai khối không trùng selector |
| `public/app.js`, `public/app-style.css` | Đây là sản phẩm build (đã nén). Tạm lấy bản `trung_ba` rồi sinh lại bằng `npm run build`, bản mới đã có panel QUS và tab Tài liệu |

### Dọn thư mục `QUS/` ở gốc

- Xoá `QUS/qus.ts`, `QUS/qus.test.ts`, `QUS/QusPanel.tsx`, vì đã có bản trong `shared/qus.ts`, `tests/qus.test.ts`, `client/components/QusPanel.tsx`. Hai bên chỉ khác đường dẫn import và một dòng chú thích.
- Riêng `QUS/QusPanel.tsx` có thêm `stopPropagation` cho sự kiện chuột trên khung panel. Bản trong app không có và **không cần**: `Modal` chỉ đóng khi bấm đúng vào nền ngoài (`e.target === e.currentTarget`). Giữ bản trong app.
- `QUS/README.md` và `QUS/screenshots/` không bị trùng nên được **chuyển** sang `docs/qus/`, không xoá, vì A1 dùng ảnh này làm đầu vào. README đã sửa mục đường dẫn mã nguồn.

### Kiểm tra (`ba-copilot-source/ba-copilot`, Node v24.16.0)

| Lệnh | Kết quả |
|---|---|
| `npm install` | ✅ OK (npm audit báo một số cảnh báo phụ thuộc, chưa xử lý) |
| `npm test` | ✅ 48 test. Chạy 3 lần: 1 lần 48/48 pass, 2 lần 47/48 (xem lưu ý) |
| `npm run build` | ✅ OK, `public/app.js` 309,6 kB, `public/app-style.css` 24,3 kB |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |

**Lưu ý – test chập chờn:** `tests/transformer.test.ts` › *"mô hình đã huấn luyện: khớp số học với PyTorch và gợi ý hợp lý"* có một phép đo thời gian cứng `suy luận cây 120 node < 400 ms`. Khi chạy cả bộ test song song, máy bận nên đôi lúc vượt 400 ms. Chạy riêng tệp này 3/3 lần đều pass. Đây là lỗi môi trường chạy, không do lần gộp gây ra (tệp này đến từ `trung_ba` và không bị đụng tới). Tệp không thuộc agent nào trong v2, nên **chưa sửa**. Đề xuất: nới ngưỡng hoặc bỏ qua phép đo thời gian khi chạy chung. Cần chủ nhánh `trung_ba` quyết định.

---

## Nhật ký đợt 1 – A2 (2026-10-20)

**Nhánh:** `agent/a2-nen-tang`, tạo từ `v2-base` @ `3f7f23a` (nhánh `v2-contract` chưa tồn tại; A0 tạo khi gộp A1 + A2).

### Kiểm tra (`ba-copilot-source/ba-copilot`, Node v24.16.0)

| Lệnh | Kết quả |
|---|---|
| `npm test` | ✅ `tests 59 · pass 59 · fail 0` (48 test cũ + 11 test hợp đồng mới trong `tests/contract.test.ts`), `duration_ms 6326` |
| `npm run build` | ✅ `public/app.js 310.5kb`, `public/app-style.css 24.3kb`, `Done` |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| Chạy app (Mock, DB mới) + Chrome | ✅ Trang chủ, dự án, Kho tài liệu (`#/p/:id/files[/:moduleId]`), 5 tab module mở đúng, huy hiệu tab như cũ, 0 lỗi console |
| `migrate()` trên bản sao `data/ba-copilot.db` | ✅ Thêm cột, dữ liệu cũ còn nguyên, `PRAGMA foreign_key_check` 0 lỗi |
| ERD Mermaid | ✅ Vẽ được bằng `public/vendor/mermaid.min.js` |

`public/app.js`, `public/app-style.css` **không** commit (sản phẩm build) – A0 sinh lại sau khi gộp.

---

## Nhật ký đợt 1 – A0 (2026-10-20)

**Nhánh:** `v2-contract` = `chi_task` @ `336c9e2` (gồm `v2-base`, bản QUS G1–G4 + gợi ý màn `e05d9af`, và A1) + gộp `agent/a2-nen-tang` @ `a0e8567`. Gộp không xung đột.

### Duyệt hợp đồng A2 – đã khoá

`docs/api.md`, `docs/erd.md`, `shared/types.ts` được duyệt và **khoá từ nay**. Muốn đổi thì ghi vào `docs/agents/REQUESTS.md`.

Ba lựa chọn A2 tự chốt, A0 **xác nhận** (tài liệu v2 không quy định):

| # | Lựa chọn | Ghi chú cho agent sau |
|---|---|---|
| 1 | Duyệt sơ đồ dùng một endpoint `POST /api/modules/:id/diagram/approve` với `{ approved }`, giống duyệt màn và tài liệu | A5 làm theo |
| 2 | Ưu tiên task là `High` / `Medium` / `Low` (mặc định `Medium`) | A6 hiển thị nhãn tiếng Việt Cao / Trung bình / Thấp |
| 3 | Xoá module thì `tasks.module_id` thành `NULL` (SET NULL), task vẫn còn | Task gắn `docs`/`tests`/`diagram` của module đã xoá vẫn giữ `artifact_id` cũ. A6 phải hiện "Sản phẩm đã xoá" thay vì lỗi; tương tự với màn đã xoá |

### Điểm vượt phạm vi của A2 – chấp nhận

- **`server/service.ts`**: ngoài chèn `emit`, A2 bọc thao tác ghi trong `tx()` và thêm tham số `actorId?` ở cuối các hàm. Chấp nhận, vì cần để handler A7 chạy chung transaction; chữ ký cũ vẫn gọi được.
- **`tx()` lồng được**: lời gọi lồng chạy chung transaction ngoài cùng. Lỗi ở lớp trong làm huỷ cả transaction.
- **Stub route của agent khác** (`server/routes/{members,tasks,diagram,qus,suggest}.ts`): đúng bước 5 của kế hoạch. Cổng số 3 sẽ báo các tệp này ở nhánh A2, đã xét và bỏ qua.
- **`server/routes/files.ts`** đã chứa 4 route Kho tài liệu chuyển từ `app.ts`. Từ nay tệp thuộc A4.
- **Thứ tự sự kiện cần A7 lưu ý:** sửa màn đang Đã duyệt sẽ phát `drafted` rồi `unapproved`. Sinh lại tài liệu đang Đã duyệt sẽ phát `unapproved` rồi `drafted`, nên task gắn `docs` đang Xong sẽ đi Xong → Cần làm lại → Đang làm.

### Điểm A0 chèn khi gộp

- **R-001 – vi phạm:** A1 thêm route `#/_gallery` thẳng vào `client/main.tsx` (tệp của A2). A0 gỡ và đăng ký `{ key: "_gallery", scope: "global", hidden: true }` trong `client/routes.ts`, đúng đề xuất của A2.
- **R-002 – tệp ngoài bảng:** A1 tạo `CLAUDE.md` ở gốc repo (yêu cầu đọc design system trước khi làm giao diện). A0 chấp nhận và bổ sung vào `OWNERSHIP.md`: A0 là chủ tệp, A1 giữ mục "Giao diện".
- Cả hai, cùng R-003 (A2 – `service.ts`) và R-004 (A0 – test tốc độ), ghi ở `OWNERSHIP.md` mục 4 và `REQUESTS.md`.

### Kiểm tra trên `v2-contract` (Node v24.16.0)

| Cổng | Kết quả |
|---|---|
| 1. `npm test` | 66 test: 65 pass, 1 fail. Test trượt là test tốc độ `transformer.test.ts` (xem lưu ý đợt 0). Lần này máy đang bận (CPU ~57%, có agent khác chạy), nên **`v2-base` cũng trượt y hệt** khi chạy riêng. Mã mô hình không đổi dòng nào, không phải lỗi gộp |
| 2. `npm run build` | ✅ `public/app.js` 334,2 kB |
| — `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| 4. Hợp đồng | Bản khoá chính là bản trên `v2-contract` |
| 5. Chế độ Mock | ✅ Chạy app với DB mới, không có khoá AI. Mở `#/_gallery`, trang chủ, dự án, Kho tài liệu, Công việc và Thành viên (trang giữ chỗ), 5 tab module, popup Sửa yêu cầu có panel QUS: 0 lỗi console. `GET /api/members` và `GET /api/projects/:id/tasks` trả 501 (stub) đúng dự kiến |

**Đã xử lý (theo quyết định của người dùng):** phép đo `< 400 ms` trong `tests/transformer.test.ts` chỉ chạy khi `PERF=1`. Phần kiểm tra kết quả của mô hình vẫn chạy như cũ. Sau khi sửa: `npm test` 66/66 hai lần liên tiếp. Đo tốc độ riêng: `PERF=1 npx tsx --test tests/transformer.test.ts` (đang qua).

**A8, A9:** mục A8 và A9 trong `docs/Ke_hoach_Agent_BA_Copilot_v2.md` đã có khung "Hiện trạng trên `v2-contract`", ghi rõ phần đã có, việc còn lại và 2 chỗ lệch hợp đồng của `suggest.ts`. Khi khởi chạy A8, A9, phải giữ nguyên khung đó trong prompt.


---

## Nhật ký đợt 2 – A8 Chất lượng yêu cầu (2026-10-20)

**Nhánh:** `agent/a8-qus`, tạo từ `v2-contract` @ `1aabff2`. Worktree `E:/wt-a8`.

### Kết quả kiểm tra (Node v24, chạy trong `ba-copilot-source/ba-copilot`)

| Cổng | Kết quả |
|---|---|
| 1. `npm test` | ✅ `ℹ tests 75 · ℹ pass 75 · ℹ fail 0` (trước khi làm: 66/66; thêm 9 test vào `tests/qus.test.ts`, tệp này 21/21) |
| 2. `npm run build` | ✅ `Done` – không commit `public/` (A0 build lại khi gộp) |
| — `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| 3. Tệp đã đổi | `shared/qus.ts`, `client/components/QusPanel.tsx`, `server/routes/qus.ts`, `tests/qus.test.ts`, khối `<Modal>` Tạo module trong `client/views/ProjectView.tsx`, `docs/agents/REQUESTS.md`, `docs/agents/STATUS.md` |
| 5. Chế độ Mock (Playwright, Chrome thật) | ✅ Popup Tạo module: trạng thái rỗng, gõ 5 story mẫu → 82/100 Tốt, từng story 100/50/85/85/90 (khớp tính tay); điểm chỉ cập nhật sau 300 ms; bung/thu bằng chuột và phím Enter; điểm 55 "Cần sửa" vẫn tạo được module (BR-05); popup Sửa yêu cầu hiện panel; màn hẹp 390 px không cuộn ngang; 0 lỗi console |

### 5 story mẫu – tính tay

| # | Story | Vi phạm | Điểm |
|---|---|---|---|
| 1 | Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng. | – | 100 |
| 2 | Tôi muốn đăng nhập nhanh | WELL_FORMED −30, AMBIGUOUS "nhanh" −15, NOT_UNIFORM −5 | 50 |
| 3 | Là quản trị viên, tôi muốn xem danh sách và xóa người dùng để dọn dẹp hệ thống. | ATOMIC "và xóa" −15 | 85 |
| 4 | Là khách hàng, tôi muốn đặt hàng. | NO_END −15 | 85 |
| 5 | As a guest, I want to export invoices (lưu ý: chỉ định dạng PDF) so that I can keep records. | MINIMAL "lưu ý" −5, NOT_UNIFORM −5 | 90 |
| | **Module** = (100 + 50 + 85 + 85 + 90) / 5 | khuôn mẫu đa số "Là…" (3/5) | **82 – Tốt** |

Đã đưa thành test "5 story mẫu: điểm khớp với tính tay".

### Thay đổi so với `v2-contract`

- `qus.ts`: giữ nguyên `PENALTY_*`, ngưỡng Jaccard 0,8, ngưỡng Tốt/Khá/Cần sửa. Sửa 1 chỗ lệch G2: khuôn mẫu đa số trước đây có thể là "viết tự do", làm story **đúng mẫu** bị phạt NOT_UNIFORM (vd 2 story tự do + 1 story "Là…"). Nay chỉ xét "As a…" và "Là…"; không story nào đúng mẫu thì bỏ qua tiêu chí. Bổ sung: tách câu bắt đầu bằng "As a"/"Là" viết liền một dòng (UC-28 bước 2); trường `excerpt` (đoạn chữ gây lỗi, FN-55) cho AMBIGUOUS/ATOMIC/MINIMAL; thêm từ mơ hồ "dễ dùng", "dễ sử dụng"; hàm `storyScore()` để kiểm chặn đáy 0.
- `QusPanel.tsx`: dùng `ScoreBadge`, `IssueList`, `Empty`; bung/thu từng story (mặc định bung story có lỗi/cảnh báo) và "Bung/Thu gọn tất cả"; nhãn mức lỗi viết rõ "(lỗi)/(cảnh báo)/(gợi ý)" cạnh mã.
- `ProjectView.tsx` (khối Modal): đưa panel ra khỏi `<Field>` (thẻ `label`), trước đây bấm vào panel làm con trỏ nhảy về ô nhập.
- `server/routes/qus.ts`: `GET /api/modules/:id/qus` đúng `docs/api.md` mục 5 (404 khi không có module); hàm `saveModuleQus(moduleId)` chấm bằng chính `scoreStories` (có story module khác cùng dự án, giống panel) và lưu `qus_score`/`qus_checked_at`; yêu cầu trống thì lưu NULL.

### Điểm A0 cần chèn khi gộp

- **R-020** (`server/app.ts`): gọi `saveModuleQus()` sau tạo module và sau `PATCH /api/modules/:id` có `requirementInput`. `service.ts` không có hàm cập nhật module nên A8 không chèn được ở đó.
- **R-021** (`server/repo.ts`): `toModule()` đọc `qusScore`/`qusCheckedAt`.
- **R-022** (`ProjectView.tsx`, ngoài Modal): cột "Chất lượng" với `ScoreBadge`.
- **R-023** (`styles.css`, A1): dọn class `.qus-*` không còn dùng, thêm `cursor: pointer` cho `.qus-story-head`.
- **Báo A9:** `splitStories` nay tách thêm các câu "As a…"/"Là…" viết liền một dòng; `tests/suggest.test.ts` vẫn xanh.
## Nhật ký đợt 2 – A2 (R-005)

**Việc:** sửa phản hồi tệp (`FileResponse`) để `/api/files/:id/preview` hiện được trong `<iframe>` và tên tệp tiếng Việt không còn gây lỗi 500.

- `server/http.ts`: `FileResponse(data, filename, contentType, disposition: "inline" | "attachment" = "attachment")`. Chỗ gọi cũ 3 tham số chạy y như trước (attachment).
- `server/app.ts`: `content-disposition` dùng `out.disposition`; `filename="..."` là bản ASCII (bỏ dấu NFD, đ→d, Đ→D, ký tự ngoài 0x20–0x7E và `"` `\` `;` → `_`); `filename*=UTF-8''` giữ tên gốc; thêm `x-content-type-options: nosniff`. Không đổi gì khác.
- `tests/contract.test.ts`: 3 test mới (route thử `/api/__test/file/*` chỉ trong tiến trình test). Test tên tiếng Việt **tái hiện được lỗi trước khi sửa**: 500, `ERR_INVALID_CHAR`.
- `docs/api.md` mục 0, dòng "Định dạng": thêm 1 câu về `inline`/`attachment` và tên ASCII. Không đổi method/path/trường.
- **Cho A4:** bỏ phần bọc `res.writeHead` trong `server/routes/files.ts`, gọi `new FileResponse(buf, name, mime, "inline")` cho `/preview`.

| Cổng | Kết quả |
|---|---|
| `npm test` | ✅ 69/69 pass (không bật `PERF`) |
| `npm run build` | ✅ (đã hoàn `public/`, không commit) |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |

Lưu ý: lần chạy đầu `npm test` và `tsc` bị hết bộ nhớ vì máy đang chạy nhiều agent cùng lúc. Chạy lại thì qua, không liên quan đến thay đổi.
## Nhật ký đợt 2 – A4 (2026-10-20)

**Nhánh:** `agent/a4-kho-tai-lieu`, tạo từ `v2-contract` @ `1aabff2`.

### Đã làm

| Hạng mục | Kết quả |
|---|---|
| Lưu tệp | `DATA_DIR/files` (mặc định `DATA_DIR` = thư mục chứa DB; `UPLOAD_DIR` ghi đè cho test). Tệp cũ ở `DATA_DIR/uploads` (nhánh htrung-c4) vẫn đọc/xoá được |
| Loại, kích thước | Chỉ Word (`.docx .doc`), PDF, Excel (`.xlsx .xls`), ảnh (`.png .jpg .jpeg .gif .webp`), kiểm chữ ký nội dung; tối đa 10 MB/tệp (`413`) |
| FN-04, FN-05 | `FileDrop` nhiều tệp → hộp thoại tải lên với module, stakeholder gửi, ngày nhận, ghi chú; gửi song song, tệp lỗi giữ lại để thử lại |
| FN-06 | `PATCH /api/files/:id`: đổi tên (giữ đuôi, chặn `../`), chuyển module, sửa thông tin nguồn |
| FN-07 | Bảng tệp xếp theo module (Cấp dự án trước); xoá có hộp thoại xác nhận, xoá luôn tệp vật lý |
| FN-08 | Ô tìm theo tên (không phân biệt dấu) + lọc module; server hỗ trợ `?q=` và `?moduleId=` |
| FN-09, FN-10 | `FileDrawer` (`Drawer` lg): PDF bằng `<iframe>`, ảnh bằng `<img>`, loại khác "Tải về để xem"; nút Tải về; `GET /api/files/:id`, `/preview` (`inline`, `415` với loại khác), `/download` giữ tên tiếng Việt |
## Nhật ký đợt 2 – A3 (2026-10-20)

**Nhánh:** `agent/a3-thanh-vien`, tạo từ `v2-contract` @ `1aabff2`.
## Nhật ký đợt 2 – A6 (2026-10-20)

**Nhánh:** `agent/a6-kanban`, tạo từ `v2-contract` @ `1aabff2` (worktree `E:/wt-a6`).

### Tệp đã đổi

| Tệp | Nội dung |
|---|---|
| `server/repo/tasks.ts` (mới) | CRUD task, `setTaskStatus()` ghi `task_events` (`by_member_id`, `by_system`, `reason`), `listTasksByArtifact()`, `listArtifacts()`. A7 dùng lại `setTaskStatus(id, to, { bySystem: true, reason })` |
| `server/routes/tasks.ts` | Thay 8 stub bằng route thật, đúng `docs/api.md` mục 4 (không đổi method/path/kiểu trả về) |
| `client/views/TasksView.tsx` (mới) | SCR-06: 4 cột, kéo thả gọi `setTaskStatus`, lỗi thì trả thẻ về cột cũ + toast; lọc người làm, module; nút "+ Thêm" từng cột |
| `client/views/TaskDialog.tsx` (mới) | SCR-07: tiêu đề, mô tả, người làm (`MemberPicker`), hạn, ưu tiên (Cao/Trung bình/Thấp), trạng thái, module, sản phẩm gắn kèm, lịch sử trạng thái, xoá (Modal xác nhận). Dùng `Drawer` theo design-system mục 3 ("SCR-07 task") |
| `client/components/RelatedTasks.tsx` (mới) | FN-19: danh sách task gắn với một sản phẩm. **Chưa chèn** vào màn nào |
| `tests/tasks.test.ts` (mới) | 11 test tích hợp HTTP |
| `client/routes.ts` | Thay đúng dòng giữ chỗ `tasks` bằng `TasksView` (+ 1 dòng import), được phép theo OWNERSHIP mục 2 |

### Quy ước A6 tự chốt (trong khuôn khổ hợp đồng)

- `PATCH /api/tasks/:id` có `status` → `400` (hợp đồng: "không nhận status").
- Gắn sản phẩm mà thiếu `moduleId` → server tự điền module của sản phẩm; khác module → `400`.
- `actorId` không phải thành viên còn tồn tại → ghi ẩn danh (`by_member_id = NULL`), không báo lỗi. `assigneeId` lạ → `400`.
- Đổi sang đúng trạng thái hiện tại → không ghi sự kiện.
- `GET /api/projects/:id/artifacts` liệt kê cả tài liệu / test / sơ đồ chưa sinh (`status: "none"`) để giao task "làm mới".
- Task trỏ tới màn/module đã xoá: hiện badge viền đứt "Sản phẩm đã xoá", vẫn sửa được các trường khác.

### Điểm A0 chèn khi gộp

1. **Sau khi gộp A3 – `actorId`:** trong `client/views/TasksView.tsx`, thay thân hàm `currentActorId` (hiện trả `undefined`) bằng `currentMemberId()` của `client/currentMember.ts`. Đến lúc đó, kéo thẻ chưa ghi được người kéo (server đã sẵn sàng, test đã kiểm).
2. **Sau khi gộp A3 – thành viên:** `GET /api/members` đang là stub 501 trên `v2-contract`, nên bộ lọc người làm và `MemberPicker` tạm trống (có ghi chú "Chưa có thành viên"). Không cần sửa mã, gộp A3 là chạy.
3. **FN-19 – chèn `RelatedTasks`** (OWNERSHIP mục 2, A0 làm):
   - `client/views/DesignTab.tsx`: `<RelatedTasks kind="screen" id={<mã màn đang chọn>} />` ở panel thông tin màn.
   - `client/views/DocsTab.tsx`: `<RelatedTasks kind="docs" id={<moduleId>} />`.
   - Import: `import { RelatedTasks } from "../components/RelatedTasks.tsx";`
4. A7 gộp sau A6: dùng `server/repo/tasks.ts` (`listTasksByArtifact`, `setTaskStatus` với `bySystem: true`).
## Nhật ký đợt 2 – A7 (2026-10-20)

**Nhánh:** `agent/a7-tu-cap-nhat`, tạo từ `v2-contract` @ `1aabff2`. Worktree `E:\wt-a7`.

### Tệp đã tạo (đúng dòng A7 trong `OWNERSHIP.md`)

| Tệp | Nội dung |
|---|---|
| `shared/taskRules.ts` | `nextStatus(current, event) → TaskStatus \| null` (hàm thuần) và `statusReason(event, kind, name)` – lý do tiếng Việt cho `task_events.reason` |
| `server/taskAutomation.ts` | `registerTaskAutomation()` đăng ký handler cho 4 loại sự kiện (gọi lại nhiều lần vẫn chỉ một bộ); `applyArtifactEvent()` tìm task theo `artifact_type/artifact_id`, đổi trạng thái, ghi `task_events` với `by_system = 1` |
| `tests/taskRules.test.ts` | Bảng quyết định đủ 16 ô (4 trạng thái × 4 sự kiện) + lý do |
| `tests/taskAutomation.test.ts` | Tích hợp qua API (Mock AI): luồng demo bản 4 ngày, sinh lại tài liệu đang duyệt, sơ đồ UC, người thao tác |

### Quy tắc đã cài

| Sự kiện | Cần làm | Đang làm | Xong | Cần làm lại |
|---|---|---|---|---|
| `drafted` | Đang làm | – | – | Đang làm |
| `approved` | Xong | Xong | – | Xong |
| `unapproved` | – | – | Cần làm lại | – |
| `stale` | – | – | Cần làm lại | – |

Ánh xạ: `screen` theo mã màn; `docs`, `tests`, `diagram` theo mã module. BR-02 phát `stale` docs/tests nên task gắn docs/tests đang **Xong** sang Cần làm lại; task đang làm dở giữ nguyên (đúng quy tắc "các trường hợp khác giữ nguyên").
## Nhật ký đợt 2 – A5 (2026-10-20)

**Nhánh:** `agent/a5-so-do-uc`, tạo từ `v2-contract` @ `1aabff2`.
---

## Nhật ký đợt 2 – A9 (2026-10-20)

**Nhánh:** `agent/a9-goi-y`, tạo từ `v2-contract` @ `1aabff2` (worktree `E:/wt-a9`).

### Đã làm

| Tệp | Nội dung |
|---|---|
| `shared/suggest.ts` | Dùng `ScreenSuggestion` của `shared/types.ts` (bỏ kiểu tự khai báo). Khoá story đổi sang `story:<hash>` (FNV-1a trên story đã bỏ dấu, bỏ dấu câu; hàm `storyKey()`), khớp `docs/api.md`. Thêm: đã có màn trùng tên đề xuất thì coi là đã phủ (tạo màn từ gợi ý FR/story thì gợi ý biến mất). Gộp gợi ý trùng tên màn **trước** khi lọc Bỏ qua, để Bỏ qua một gợi ý không làm gợi ý trùng tên ở nguồn khác hiện lên thay |
| `server/routes/suggest.ts` | Thay 3 stub 501: `GET /api/modules/:id/suggestions` → `{ items, dismissed }`; `POST`/`DELETE …/suggestions/:key/dismiss` → `{ ok: true }`, lặp lại không lỗi. Lưu bảng `suggestion_dismissals`. Lỗi: module không có → `404`; khoá không đúng dạng `link:`/`fr:`/`story:` → `400` |
| `client/components/SuggestionsPanel.tsx` | SCR-16 mới, dùng `SuggestionCard`. Tạo → mở hộp thoại Màn hình mới điền sẵn; Bỏ qua / Khôi phục gọi API (thay `localStorage`). Tự tải lại gợi ý mỗi khi module được tải lại (tạo màn, duyệt, sửa…). Lý do của gợi ý story có kèm nội dung story (FN-59) |
| `client/views/DesignTab.tsx` | Đúng 2 điểm: (1) xoá khối gợi ý cũ (`screenDismissed`, `updateScreenDismissed`, `stories`, `hasSource`, `suggestions`, JSX `suggest-block`, 3 import) và thay bằng `<SuggestionsPanel m={m} onCreate={openNewScreen} />`; (2) thêm `openNewScreen(initialName, initialPrompt)` cho hộp thoại tạo màn. Không đụng state `dismissed` của gợi ý bố cục ML |
| `tests/suggest.test.ts` | Ca (a) → (e) theo mục 3.4, thêm: khoá `story:<hash>` ổn định, Bỏ qua cả nhóm trùng tên, màn trùng tên thì hết gợi ý, hàm thuần; 3 test API (thứ tự, Bỏ qua/Khôi phục theo module + 400/404, tạo màn ở chế độ Mock thì gợi ý biến mất) |

### Kiểm tra (`ba-copilot-source/ba-copilot`, Node v24.16.0)

| Lệnh | Kết quả |
|---|---|
| `npm test` | ✅ `tests 75 · pass 75 · fail 0` (66 cũ + 9 test A4 mới trong `tests/files.test.ts`), `duration_ms 12012` |
| `npm run build` | ✅ `public/app.js 347.4kb`, `public/app-style.css 41.2kb`, `Done` |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| Chạy app (Mock, DB mới) + Chrome | ✅ Thả 3 tệp (PDF, PNG, XLSX) + 1 `.txt` cùng lúc: `.txt` bị chặn, 3 tệp lên đủ, đúng module và nguồn. Xem PDF trong ngăn phải, Word hiện "Tải về để xem", tìm "bang gia", đổi tên, xoá có xác nhận, link `#/p/:id/files/:moduleId` lọc đúng module. 0 lỗi console |

`public/app.js`, `public/app-style.css` **không** commit (sản phẩm build) – A0 sinh lại sau khi gộp.

### Điểm A0 xử lý khi gộp

- **R-006:** xoá `LegacyFilesPage` trong `client/routes.ts`, bỏ tab "files" + import `FilesTab` trong `ProjectView.tsx`, rồi xoá `client/views/FilesTab.tsx`.
- **R-005 (A2):** hỗ trợ `inline` và tên tệp tiếng Việt trong `FileResponse`; tới lúc đó `server/routes/files.ts` tự ghi đè header.
- **Sau khi gộp A3:** `FilesView` chưa gửi `actorId` (chưa có `useCurrentMember()`). Server đã nhận và lưu `uploaded_by` nếu thành viên tồn tại; chỉ cần thêm `actorId: me?.id` vào lời gọi `uploadFile` trong `FilesView.tsx` (A4 làm nếu được giao lại).
- Đổi danh sách loại tệp: `.pptx`, `.txt`, `.md`, `.csv` **không còn tải lên được** (theo yêu cầu "Word, PDF, Excel, ảnh"). Tệp loại đó đã có trong kho vẫn xem danh sách, tải về và xoá được.
| `npm test` | ✅ `tests 70 · pass 70 · fail 0` (66 cũ + 4 mới trong `tests/members.test.ts`), `duration_ms 23199` |
| `npm run build` | ✅ `public/app.js 339.3kb`, `Done` |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| Chạy app (Mock, DB mới) + Chrome, có gắn tạm `TopBar` vào `main.tsx` (đã hoàn lại) | ✅ Thêm 2 thành viên qua hộp thoại, chọn "Tôi là…", tải lại trang vẫn nhớ; menu Công việc / Kho tài liệu / Thành viên trỏ đúng dự án; `#/_gallery` bình thường; 0 lỗi console |

`public/` **không** commit (sản phẩm build).

### Điểm A0 chèn khi gộp
- **R-005** – gắn `<TopBar />` vào `client/main.tsx`. Chưa gắn thì ô "Tôi là…" và menu chưa hiện.
- **R-006** – gửi `actorId` (và tên tác giả bình luận) từ `DesignTab.tsx`.
- **R-007** – `repo.ts` / `app.ts` đọc và trả `author`/`authorId`, lưu `author_id` cho bình luận.
- `client/routes.ts`: ngoài dòng `members`, A3 thêm 1 dòng `import { MembersView }` (cần cho dòng đó).
- Menu thanh trên dạng **pill** (theo yêu cầu người dùng): ghép từ class có sẵn `.tpl-row` + `.chip` / `.chip-sel`, không thêm CSS mới. Gợi ý cho A1 (không bắt buộc): thêm biến thể `Tabs variant="pill"` vào `ui.tsx` + `#/_gallery` để màn khác dùng chung. Sau khi đổi: `npm test` 70/70 ✅, `npm run build` ✅, 0 lỗi console.
- Cập nhật: menu pill chuyển thành component dùng chung `Tabs variant="pill"` (người dùng yêu cầu, sửa tệp của A1 – xem **R-008**). `npm test` 70/70 ✅, `npm run build` ✅ (`app.js 339.6kb`), 0 lỗi console ở `#/_gallery` và trang dự án.
| `npm test` | ✅ `tests 77 · pass 77 · fail 0` (66 cũ + 11 trong `tests/tasks.test.ts`), `duration_ms 14990` |
| `npm run build` | ✅ `public/app.js 344.6kb`, `public/app-style.css 41.2kb`, `Done` |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| Chạy app (Mock, DB mới) + Chrome | ✅ Kéo thẻ Đang làm → Xong, **tải lại trang thẻ vẫn ở cột Xong**. Giả lập API lỗi khi kéo → thẻ quay về cột cũ, có toast. Tạo task gắn Sơ đồ UC (module tự điền), sửa task, lịch sử trạng thái, lọc module: đúng. 0 lỗi console |

`public/app.js`, `public/app-style.css` **không** commit (sản phẩm build).
| `npm test` | ✅ `tests 88 · pass 88 · fail 0` (66 cũ + 22 mới), `duration_ms 18193` |
| `npm run build` | ✅ `public/app.js 334.2kb`, `public/app-style.css 41.2kb`, `Done in 772ms` (không commit `public/`) |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| Thử gộp A6 (`5e5f394`) + A7 + R-011 trên worktree tạm | ✅ `npm test` 99/99 – task tạo qua API thật của A6 |

### Điểm A0 chèn khi gộp (sau A6)

1. **R-011** – 2 dòng trong `server/app.ts`: import và gọi `registerTaskAutomation()` ở đầu `createApp()`. Thiếu bước này thì app chạy thật **không** tự đổi trạng thái task (test vẫn xanh vì tự đăng ký).
2. (Tuỳ chọn) `taskAutomation.ts` ghi bảng giống hệt `setTaskStatus`/`listTasksByArtifact` của `server/repo/tasks.ts` (A6); sau khi gộp có thể chuyển sang gọi hàm của A6, hành vi không đổi.
3. A5 gộp sau: route sơ đồ phải phát `artifact.*` `kind: "diagram"` như `docs/api.md` mục 3; test A7 đã giả lập đúng các sự kiện đó.
4. Đánh số yêu cầu: `agent/a3-thanh-vien` và `agent/a4-kho-tai-lieu` cùng dùng **R-006** cho hai yêu cầu khác nhau – cần đánh lại số khi gộp.

### Giới hạn đã biết

- Bản 4 ngày không có bước **duyệt bộ test**, nên task gắn `tests` chỉ tự đi tới Đang làm, không tự sang Xong.
- `by_member_id` của sự kiện hệ thống lấy từ `actorId` khi đó là thành viên có thật; `actorId` lạ được bỏ qua (ghi `NULL`) để không làm hỏng thao tác vì khoá ngoại.
| `npm test` | ✅ `tests 81 · pass 81 · fail 0` (66 cũ + 15 mới trong `tests/ucDiagram.test.ts`), `duration_ms 19210` |
| `npm run build` | ✅ `public/app.js 338.6kb`, `public/app-style.css 41.2kb`, `Done` |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| Chạy app (Mock, DB mới) + Chrome | ✅ Tab "Sơ đồ UC": trạng thái rỗng → Sinh sơ đồ → Mermaid vẽ được (actor tròn, UC bầu dục, khung Hệ thống); gõ thêm cạnh «include»/«extend» thì xem trước vẽ lại; Lưu → Duyệt → Bỏ duyệt → Duyệt đúng huy hiệu; sinh lại tài liệu khi UC đổi → huy hiệu "Lỗi thời" + băng cảnh báo. 0 lỗi console |

`public/app.js`, `public/app-style.css` **không** commit (sản phẩm build).

### Điểm A0 cần biết khi gộp
- `client/views/moduleTabs.ts`: thêm **2 dòng** (1 dòng import `DiagramTab` + 1 dòng đăng ký tab `diagram` ngay sau tab Tài liệu). Bảng sở hữu ghi "đúng một dòng" – không thể đăng ký mà không import.
- `server/ai/pipelines.ts`, `server/ai/mock.ts`: chỉ thêm (2 dòng import ở đầu tệp + hàm mới ở cuối), không sửa dòng cũ.
- **actorId:** `DiagramTab` chưa gửi `actorId` vì `client/currentMember.ts` (A3) chưa có trên `v2-contract`. Sau khi gộp A3, chèn `useCurrentMember()` và truyền id vào `generateDiagram`, `saveDiagram`, `approveDiagram` (tham số thứ 2/3 đã có sẵn trong `client/api.ts`).
- **FN-14:** handler nghe `artifact.drafted` (`kind: "docs"`) đăng ký trong `server/routes/diagram.ts`. Sơ đồ ghi dòng `%% nguon-uc: <mã băm>` của UC lúc vẽ; chỉ chuyển "Lỗi thời" khi mã/tên/actor/quan hệ UC thật sự đổi (chỉnh SRS hay Sequence thì giữ nguyên). Thứ tự sự kiện khi sinh lại / lưu sơ đồ đang Đã duyệt: `unapproved` rồi `drafted` (giống tài liệu).
- R-009, R-010 trong `REQUESTS.md`.
| `npm test` | ✅ `tests 70 · pass 70 · fail 0`, `duration_ms 17601` (66 cũ + 4 test mới trong `suggest.test.ts`, tệp này 10/10) |
| `npm run build` | ✅ `public/app.js 329.9kb`, `public/app-style.css 41.2kb`, `Done` |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| Kịch bản giao diện (Mock, DB mới, Chrome chạy ẩn qua Playwright) | ✅ Tạo màn Đăng nhập → hiện gợi ý "Quên mật khẩu" với lý do `Nút "Quên mật khẩu?" ở màn Đăng nhập chưa có đích`, xếp trước gợi ý story. Bấm Tạo → hộp thoại có tên "Quên mật khẩu" và prompt điền sẵn. Sinh màn xong → gợi ý biến mất. Bỏ qua → ẩn, tải lại trang vẫn ẩn; Khôi phục → hiện lại. 0 lỗi console |

`public/app.js`, `public/app-style.css` **không** commit (sản phẩm build) – A0 sinh lại sau khi gộp.

### Điểm A0 cần làm khi gộp

- **R-012** (`REQUESTS.md`): xoá `.suggest-item/.suggest-name/.suggest-actions` trong `styles.css`, giữ và ghi vào design system `.suggest-block/.suggest-list` (chủ tệp A1). Nếu số R-012 trùng với agent khác thì đổi số.
- `DesignTab.tsx`: A9 gộp cuối, sau A3 (FN-03) và A6/A0 (`RelatedTasks`). Điểm A9 sửa nằm ở đầu hàm (khối state gợi ý cũ, đã xoá), cạnh `createScreen` (thêm `openNewScreen`) và cuối cột trái `<aside className="studio-left">`. Nếu A0 chèn `RelatedTasks` vào cột trái thì đặt **trên** dòng `<SuggestionsPanel …/>` hoặc ở cột phải, không lồng vào panel.
- Chạy `npm run build` sau khi gộp để `public/` có panel mới.

