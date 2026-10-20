# Yêu cầu sửa tệp ngoài phạm vi – BA Copilot v2

Người xử lý: **A0**. Agent muốn sửa tệp không thuộc dòng của mình trong `OWNERSHIP.md` thì **dừng lại** và thêm một mục vào đây, không tự sửa. A0 ghi luôn vào đây các lần sửa ngoài phạm vi phát hiện khi gộp (cổng kiểm tra số 3).

## Mẫu

```
### R-<số> – <tóm tắt>
- Đợt / agent yêu cầu:
- Tệp: <đường dẫn>  · Chủ tệp: <mã agent | chưa có chủ>
- Lý do:
- Thay đổi đề xuất:
- Trạng thái: Mở | Chấp nhận | Từ chối | Đã gỡ
- Quyết định của A0 (ngày):
```

---

### R-001 – A1 thêm route `#/_gallery` vào `client/main.tsx`
- Đợt / agent: 1 / A1 (phát hiện khi gộp, A1 không ghi yêu cầu trước)
- Tệp: `client/main.tsx` · Chủ tệp: A2
- Lý do: cần trang ẩn `#/_gallery` để xem mọi component.
- Thay đổi: thêm `import { Gallery }` và nhánh `else if (parts[0] === "_gallery")`.
- Trạng thái: **Đã gỡ**
- Quyết định của A0 (2026-10-20): vi phạm luật sở hữu. Gỡ 2 dòng khỏi `main.tsx`, thay bằng dòng `{ key: "_gallery", label: "Gallery", scope: "global", component: Gallery, hidden: true }` trong `client/routes.ts`, đúng điểm cắm A2 chừa sẵn. Hành vi không đổi.

### R-002 – A1 tạo `CLAUDE.md` ở gốc repo
- Đợt / agent: 1 / A1 (phát hiện khi gộp)
- Tệp: `CLAUDE.md` (gốc repo) · Chủ tệp: chưa có chủ (không có trong bảng)
- Lý do: buộc mọi AI đọc `docs/design-system.md` và chỉ dùng token, component dùng chung khi làm giao diện.
- Trạng thái: **Chấp nhận**
- Quyết định của A0 (2026-10-20): nội dung hợp lệ và có ích cho đợt 2. Bổ sung vào `OWNERSHIP.md`: A0 là chủ tệp, A1 giữ mục "Giao diện". Lưu ý: tệp này được mọi phiên AI tự đọc, nên mọi thay đổi về sau phải qua yêu cầu ở đây.

### R-003 – A2 sửa `server/service.ts` vượt "chỉ chèn emit"
- Đợt / agent: 1 / A2 (A2 tự báo trong báo cáo bàn giao)
- Tệp: `server/service.ts` · Chủ tệp: A2 (giới hạn: chèn `emit`)
- Thay đổi: bọc thao tác ghi trong `tx()`, thêm tham số `actorId?` ở cuối các hàm; `tx()` trong `db.ts` lồng được.
- Trạng thái: **Chấp nhận**
- Quyết định của A0 (2026-10-20): cần để handler A7 chạy chung transaction với thao tác ghi; tương thích ngược.

### R-004 – A0 sửa `tests/transformer.test.ts`
- Đợt / agent: 1 / A0
- Tệp: `tests/transformer.test.ts` · Chủ tệp: chưa có chủ (tệp của nhánh `trung_ba`)
- Lý do: ngưỡng `< 400 ms` làm cổng số 1 đỏ khi máy bận (`v2-base` cũng trượt), dù mã mô hình không đổi.
- Thay đổi: chỉ kiểm ngưỡng thời gian khi `PERF=1`; phần kiểm tra kết quả mô hình giữ nguyên.
- Trạng thái: **Chấp nhận** (người dùng quyết định, 2026-10-20)

### R-009 – A5: `GET /api/modules/:id/diagram` trả `{ ok: true }` thay vì `null`
- Đợt / agent yêu cầu: 2 / A5 (số tạm, A0 đánh lại số khi gộp nếu trùng)
- Tệp: `server/app.ts` · Chủ tệp: A2
- Lý do: hợp đồng (`docs/api.md` mục 3) quy định trả `UcDiagram | null` (null = chưa sinh). `createApp` gửi `out ?? { ok: true }` nên handler trả `null` thành `{ ok: true }`.
- Thay đổi đề xuất: `send(res, 200, out === undefined ? { ok: true } : out)`. A2 rà các route khác có trả `null` có chủ đích hay không.
- Tạm thời (A5): `DiagramTab` coi kết quả không có `code` là "chưa có sơ đồ"; `tests/ucDiagram.test.ts` chấp nhận cả hai. Sau khi sửa, bỏ nhánh `{ ok: true }` trong test.
- Trạng thái: Mở

### R-010 – A5: thêm class bố cục 2 cột bằng nhau vào design system
- Đợt / agent yêu cầu: 2 / A5 (số tạm)
- Tệp: `client/styles.css`, `docs/design-system.md`, `client/views/_Gallery.tsx` · Chủ tệp: A1
- Lý do: SCR-05 cần 2 cột (soạn mã | xem trước). Design system chưa có class 2 cột bằng nhau.
- Tạm thời (A5): `DiagramTab` dùng `.doc-layout` + `style={{ gridTemplateColumns: "1fr 1fr" }}` (không có màu hay px cứng).
- Thay đổi đề xuất: class `.split-2` (2 cột `1fr 1fr`, khoảng cách `--space-4`, lề `0 --space-4`, về 1 cột ở màn hẹp). Sau khi có, A5 đổi `DiagramTab` sang class này.
- Trạng thái: Mở
