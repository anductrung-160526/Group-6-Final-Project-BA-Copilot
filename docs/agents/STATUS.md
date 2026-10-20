# Trạng thái các agent – BA Copilot v2

Người cập nhật: **A0**. Mỗi agent dán kết quả `npm test` / `npm run build` vào dòng của mình trước khi kết thúc.

## Bảng trạng thái

| Mã | Agent | Đợt | Nhánh | Trạng thái | Test | Build | Ghi chú |
|---|---|---|---|---|---|---|---|
| A0 | Tích hợp & Điều phối | 0, 4 | `v2-base` | ✅ Đợt 0 xong | 48/48 (xem lưu ý) | ✅ | Xem nhật ký đợt 0 |
| A1 | Design System | 1 | `chi_task` (`336c9e2`) | ✅ Đã gộp vào `v2-contract` | ✅ | ✅ | Làm thẳng trên `chi_task`, không có nhánh agent riêng. Route `#/_gallery` chuyển sang `client/routes.ts` |
| A2 | Nền tảng dữ liệu & hợp đồng | 1 | `agent/a2-nen-tang` | ✅ Đã gộp vào `v2-contract`; `api.md`/`erd.md` đã duyệt và **khoá** | 59/59 ✅ | ✅ | Xem nhật ký đợt 1 – A0 |
| A3 | Thành viên & thanh trên | 2 | `agent/a3-thanh-vien` | ⏳ Sẵn sàng | — | — | |
| A4 | Kho tài liệu | 2 | `agent/a4-kho-tai-lieu` | ⏳ Sẵn sàng | — | — | Code C4 đã có trên `v2-base` |
| A5 | Sơ đồ UC | 2 | `agent/a5-so-do-uc` | ⏳ Sẵn sàng | — | — | |
| A6 | Công việc Kanban | 2 | `agent/a6-kanban` | ⏳ Sẵn sàng | — | — | |
| A7 | Tự cập nhật trạng thái task | 2 | `agent/a7-tu-cap-nhat` | ⏳ Sẵn sàng | — | — | Gộp sau A6 |
| A8 | Chất lượng yêu cầu (QUS) | 2 | `agent/a8-qus` | ⏳ Sẵn sàng | — | — | Phần lớn đã có; việc còn lại ghi ở khung "Hiện trạng" mục A8 trong kế hoạch (chính: FN-56, `ScoreBadge`/`IssueList`) |
| A9 | Gợi ý màn tiếp theo | 2 | `agent/a9-goi-y` | ⏳ Sẵn sàng | — | — | Phần lớn đã có; việc còn lại ghi ở khung "Hiện trạng" mục A9 trong kế hoạch (chính: API + `suggestion_dismissals`, tách `SuggestionsPanel`, sửa 2 chỗ lệch hợp đồng). Gộp cuối đợt 2 |
| A10 | Dữ liệu demo | 3 | `agent/a10-seed` | ✅ Xong, chờ A0 gộp (sau đợt 2 và R-005) | 66/66 ✅ | ✅ | Chỉ sửa `scripts/seed.ts`. Xem nhật ký đợt 3 – A10 |
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

## Nhật ký đợt 3 – A10 (2026-10-20)

**Nhánh:** `agent/a10-seed`, tạo từ `v2-contract` @ `1aabff2`. Chỉ sửa `scripts/seed.ts`.

### Dữ liệu `npm run seed` tạo ra

| Mục | Nội dung |
|---|---|
| Thành viên (5) | Nguyễn Thị Lan (**BA Lead**), Trần Minh Đức, Lê Hoàng Anh, Phạm Thu Hà, Vũ Quang Huy – mã `demo-mem-*` |
| Dự án, module | `demo-shop` "Cửa hàng điện tử (mẫu)"; `demo-mod-products` "Quản lý sản phẩm", `demo-mod-orders` "Quản lý đơn hàng" |
| QUS | Sản phẩm: 5 story tốt → **100 (Tốt)**. Đơn hàng: 6 story trộn tốt/lỗi (ATOMIC + NO_END, WELL_FORMED + AMBIGUOUS, FULL_SENTENCE, DUPLICATE, MINIMAL) → **75 (Khá)**, 2 story dưới 60. Điểm lưu sẵn ở `modules.qus_score` (FN-56), chấm như A8 (kèm story module khác) |
| Màn hình | Đã duyệt: Quản lý sản phẩm, Thêm sản phẩm, Quản lý danh mục. Nháp: **Đăng nhập** có link "Quên mật khẩu?" trỏ tới màn chưa có → gợi ý link gãy. Có 1 bình luận của BA Lead trên link đó. Phiên bản và bình luận có `author`/`author_id` (FN-03) |
| Tài liệu, test | Sinh từ 3 màn đã duyệt; tài liệu **Đã duyệt**, test **Lỗi thời** (khớp task "Cần làm lại") |
| Gợi ý màn | Sản phẩm: còn đúng 1 gợi ý "Quên mật khẩu" (link gãy). Các gợi ý FR (chủ yếu FR kiểm tra dữ liệu) đã ở danh sách Bỏ qua (`suggestion_dismissals`) để demo Khôi phục. Đơn hàng: 6 gợi ý theo story (chưa có FR) |
| Sơ đồ UC | Module Sản phẩm, **Đã duyệt**. Có A5 thì dùng `buildUcMermaid` (kèm `%% nguon-uc`), chưa có thì vẽ bản tối giản cùng quy ước. Không task nào gắn vào sơ đồ, để luồng demo A11 tự tạo task "Vẽ UC diagram" |
| Kho tài liệu (4) | Biên bản họp kickoff.docx (cấp dự án), Yêu cầu nghiệp vụ đơn hàng.pdf, Phác thảo màn đăng nhập.png, Danh sách sản phẩm mẫu.xlsx; đủ người gửi, ngày nhận, ghi chú, người tải lên (FN-05). Tệp thật, mở được |
| Công việc (8) | Cần làm 2, Đang làm 2, Xong 2, Cần làm lại 2; gắn màn / tài liệu / test, có hạn, ưu tiên, 20 dòng lịch sử (người đổi và hệ thống tự đổi kèm lý do) |

**Chạy lại nhiều lần:** dữ liệu demo dùng mã cố định. Lần chạy sau xoá dự án `demo-shop` cũ (và dự án cùng tên do seed bản cũ tạo), xoá tệp trên đĩa, `prompt_runs`, `suggestion_events` của nó, rồi tạo lại. Thành viên demo ghi đè theo mã. Dự án và thành viên khác không bị đụng. Mặc định chạy chế độ Mock để dữ liệu luôn giống nhau; `SEED_AI=claude` để sinh màn bằng Claude.

### Kiểm tra (Node v24.16.0)

| Lệnh | Kết quả |
|---|---|
| `npm test` | ✅ `tests 66 · pass 66 · fail 0`, `duration_ms 14658` |
| `npm run build` | ✅ `public/app.js 334.2kb`, `public/app-style.css 41.2kb`, `Done` |
| `npx tsc --noEmit` | ✅ Không lỗi kiểu |
| `npm run seed` ×3 trên DB mới (`v2-contract`) | ✅ Lần sau báo "Đã xoá 1 dự án demo cũ", số dòng giữ nguyên: 1 dự án, 2 module, 4 màn, 5 thành viên, 4 tệp (4 tệp trên đĩa), 8 task, 20 lịch sử, 1 sơ đồ |
| Bản gộp thử (không commit): `v2-contract` + A8, A4, R-005, A3, A6, A7, A5, A9 + seed | ✅ Seed chạy 2 lần. API: `/api/members` 5, `/api/projects/demo-shop/tasks` 8 đủ 4 cột, `/files` 4 tệp đủ thông tin, tải về cả 4 tệp tên tiếng Việt → 200, sơ đồ `approved`, gợi ý chỉ còn "Quên mật khẩu" (7 đã bỏ qua). Mở bằng Chrome: dự án, Công việc, Kho tài liệu, Thành viên, Thiết kế, Sơ đồ UC (vẽ được), module Đơn hàng – 0 lỗi console |

`public/app.js`, `public/app-style.css` **không** commit (sản phẩm build).

### Lưu ý cho A0 khi gộp

- Gộp A10 **sau** toàn bộ đợt 2 và **sau R-005** (`agent/a2-r005-file-response`). Chưa có R-005 thì tải về tệp tên tiếng Việt lỗi 500 `ERR_INVALID_CHAR` (đã thử trên `v2-contract`).
- Kho tài liệu của A4 không nhận `.csv`, nên tệp mẫu thứ 4 là `.xlsx`.
- `GET /api/projects/:id` chưa trả `qusScore` trên bản gộp thử (chờ điểm chèn FN-56 của A8). Seed đã ghi sẵn `modules.qus_score`, chèn xong là hiện.
- **Phát hiện cho A9 (không sửa, ngoài phạm vi):** với tài liệu sinh từ màn đã duyệt, `suggestNextScreens` coi FR kiểm tra dữ liệu ("Hệ thống phải kiểm tra: Tên sản phẩm là bắt buộc") và FR "Mở màn hình thêm mới (…)" là chưa có màn phủ, sinh 7 gợi ý vô nghĩa ở module Sản phẩm (cả bản trên `v2-contract` lẫn `agent/a9-goi-y`). Ngoài ra gợi ý trùng tên rút gọn bị gộp, nên bỏ qua một FR thì FR cùng tên hiện tiếp. Seed tạm đưa các gợi ý này vào danh sách Bỏ qua.
