# Trạng thái các agent – BA Copilot v2

Người cập nhật: **A0**. Mỗi agent dán kết quả `npm test` / `npm run build` vào dòng của mình trước khi kết thúc.

## Bảng trạng thái

| Mã | Agent | Đợt | Nhánh | Trạng thái | Test | Build | Ghi chú |
|---|---|---|---|---|---|---|---|
| A0 | Tích hợp & Điều phối | 0, 4 | `v2-base` | ✅ Đợt 0 xong | 48/48 (xem lưu ý) | ✅ | Xem nhật ký đợt 0 |
| A1 | Design System | 1 | `agent/a1-design-system` | ⏳ Chưa bắt đầu | — | — | |
| A2 | Nền tảng dữ liệu & hợp đồng | 1 | `agent/a2-nen-tang` | ⏳ Chưa bắt đầu | — | — | Đường găng của đợt 2 |
| A3 | Thành viên & thanh trên | 2 | `agent/a3-thanh-vien` | ⏳ Chờ A1, A2 | — | — | |
| A4 | Kho tài liệu | 2 | `agent/a4-kho-tai-lieu` | ⏳ Chờ A1, A2 | — | — | Code C4 đã có trên `v2-base` |
| A5 | Sơ đồ UC | 2 | `agent/a5-so-do-uc` | ⏳ Chờ A1, A2 | — | — | |
| A6 | Công việc Kanban | 2 | `agent/a6-kanban` | ⏳ Chờ A1, A2 | — | — | |
| A7 | Tự cập nhật trạng thái task | 2 | `agent/a7-tu-cap-nhat` | ⏳ Chờ A2 | — | — | Gộp sau A6 |
| A8 | Chất lượng yêu cầu (QUS) | 2 | `agent/a8-qus` | ⏳ Chờ A1, A2 | — | — | Code C1 đã có trên `v2-base` |
| A9 | Gợi ý màn tiếp theo | 2 | `agent/a9-goi-y` | ⏳ Chờ A1, A2 | — | — | Gộp cuối đợt 2 |
| A10 | Dữ liệu demo | 3 | `agent/a10-seed` | ⏳ Chờ đợt 2 | — | — | |
| A11 | Kiểm thử E2E & QA | 3 | `agent/a11-e2e` | ⏳ Chờ A10 | — | — | |
| A12 | Tài liệu & Triển khai | 3, 4 | `agent/a12-trien-khai` | ⏳ Chờ A11 | — | — | |

Thứ tự gộp đợt 2: A8 → A4 → A3 → A6 → A7 → A5 → A9.

## Nhánh xanh theo đợt

| Đợt | Nhánh | Trạng thái |
|---|---|---|
| 0 | `v2-base` | ✅ Test và build qua (2026-10-20) |
| 1 | `v2-contract` | ⏳ |
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
