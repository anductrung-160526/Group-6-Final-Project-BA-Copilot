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

### R-005 – A3: gắn `TopBar` vào `client/main.tsx`
- Đợt / agent yêu cầu: 2 / A3
- Tệp: `client/main.tsx` · Chủ tệp: A2 (A0 chèn khi gộp)
- Lý do: SCR-02. `TopBar` tự lấy `/api/settings`, tự dựng menu từ `PAGES` và ô "Tôi là…", nên thay được cả khối header cũ.
- Thay đổi đề xuất: thêm `import { TopBar } from "./components/TopBar.tsx";`; thay toàn bộ khối `<header className="topbar">…</header>` bằng `<TopBar />`; bỏ state `settings` và `useEffect` gọi `/api/settings` trong `App` (không còn dùng). A3 đã thử đúng thay đổi này trên máy: 0 lỗi console, rồi hoàn lại.
- Trạng thái: Mở
- Quyết định của A0 (ngày):

### R-006 – A3: gửi người thao tác (FN-03) từ màn Thiết kế
- Đợt / agent yêu cầu: 2 / A3
- Tệp: `client/views/DesignTab.tsx` · Chủ tệp: dùng chung (A3 chỉ được 2 chỗ hiển thị)
- Lý do: FN-03 cần gửi `actorId` khi tạo bình luận và tạo phiên bản; các lời gọi API nằm ngoài 2 chỗ hiển thị A3 được sửa.
- Thay đổi đề xuất:
  - `import { useCurrentMember, withActor } from "../currentMember.ts";` và trong component `const { me } = useCurrentMember();`
  - Bọc body bằng `withActor(...)` ở 5 lời gọi tạo phiên bản: `POST /api/modules/:id/screens` (`newScreen`), `/edit`, `/revert`, `/layout/accept`, `/manual`.
  - Lời gọi `POST /api/screens/:id/annotations`: body thành `withActor({ nodeIds: selected, comment, bbox: unionBox(selected), author: me?.name })`. Riêng tên `author` thì server đã lưu được ngay, không cần chờ R-007.
- Trạng thái: Mở
- Quyết định của A0 (ngày):

### R-007 – A3: lưu và trả `authorId` / `author` (FN-03) ở server
- Đợt / agent yêu cầu: 2 / A3
- Tệp: `server/repo.ts` (chưa có chủ), `server/app.ts` (A2)
- Lý do: `docs/api.md` mục 1 hứa trả `Annotation.authorId`, `ScreenVersion.author`, `ScreenVersion.authorId` trong API đọc. Cột đã có (A2), nhưng `toVersion`/`toAnnotation` chưa đọc, `createAnnotation` chưa ghi `author_id`.
- Phần A3 đã làm trong tệp của mình: `server/routes/members.ts` nghe `artifact.drafted` (màn) và ghi `author` + `author_id` vào phiên bản vừa tạo (có test). Không cần sửa `service.ts`.
- Thay đổi đề xuất:
  - `repo.ts` `toVersion`: thêm `author: r.author ?? "", authorId: r.author_id ?? null`.
  - `repo.ts` `toAnnotation`: thêm `authorId: r.author_id ?? null`; `createAnnotation` nhận `authorId?` và ghi cột `author_id`.
  - `app.ts` route `POST /api/screens/:id/annotations`: nếu `actor(body)` là thành viên có thật (`getMember` trong `server/repo/members.ts`) thì `author = member.name`, `authorId = member.id`; không thì giữ như cũ (`body.author` hoặc "BA").
- Hiện trạng nếu chưa làm: danh sách phiên bản ở màn Thiết kế chưa hiện tên tác giả (dữ liệu đã lưu trong DB nhưng API chưa trả ra).
- Trạng thái: Mở
- Quyết định của A0 (ngày):

### R-008 – A3 thêm `Tabs variant="pill"` vào design system
- Đợt / agent: 2 / A3 (**người dùng yêu cầu trực tiếp**, 2026-10-20)
- Tệp: `client/components/ui.tsx`, `client/styles.css`, `client/views/_Gallery.tsx`, `docs/design-system.md` · Chủ tệp: A1
- Lý do: menu thanh trên (SCR-02) dùng kiểu nút bo tròn (pill) thay cho tab gạch chân.
- Thay đổi: `Tabs` nhận thêm `variant?: "line" | "pill"` (mặc định `line`, chỗ gọi cũ không đổi); CSS `.tabs-pill` chỉ dùng token có sẵn; thêm mẫu vào `#/_gallery`; cập nhật dòng `Tabs` và "Thanh trên" trong `design-system.md`. `TopBar` dùng `<Tabs variant="pill">`.
- Kiểm tra: tab `line` cũ giữ nguyên kiểu (gạch chân mint-500); `npm test` 70/70, build qua, 0 lỗi console.
- Trạng thái: Mở – chờ A0 ghi vào sổ `OWNERSHIP.md` mục 4 và A1 xem lại
- Quyết định của A0 (ngày):
