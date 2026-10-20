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

> Ghi chú A8: R-005 → R-011 đã được các nhánh A3, A4, A5, A7 dùng, nên A8 lấy dải R-020 → R-023 để tránh trùng. A0 đánh số lại khi gộp nếu cần.

### R-020 – A8: gọi `saveModuleQus()` khi lưu yêu cầu (FN-56)
- Đợt / agent yêu cầu: 2 / A8
- Tệp: `server/app.ts` · Chủ tệp: A2
- Lý do: FN-56 cần lưu điểm vào `modules.qus_score` khi BA lưu yêu cầu. Bảng sở hữu cho A8 chèn "một lệnh gọi tính điểm trong hàm cập nhật module" ở `server/service.ts`, nhưng `service.ts` **không có** hàm cập nhật module: `POST /api/projects/:id/modules` và `PATCH /api/modules/:id` nằm ở `app.ts`, gọi thẳng `repo`. A8 không tự sửa `app.ts`.
- Thay đổi đề xuất (2 dòng, hàm đã có sẵn và đã có test trong `server/routes/qus.ts`):
  ```ts
  import { saveModuleQus } from "./routes/qus.ts";
  // POST /api/projects/:id/modules – sau repo.createModule(...):
  const m = repo.createModule(params.id, name, str(body.requirementInput, 50000));
  saveModuleQus(m.id);
  return repo.getModule(m.id);
  // PATCH /api/modules/:id – sau repo.updateModule(...), trước return:
  if (typeof body.requirementInput === "string") saveModuleQus(params.id);
  ```
  Không ném lỗi theo điểm, nên vẫn đúng BR-05 (điểm thấp vẫn lưu được).
- Trạng thái: Mở
- Quyết định của A0:

### R-021 – A8: trả `qusScore` / `qusCheckedAt` trong `Module` (FN-56)
- Đợt / agent yêu cầu: 2 / A8
- Tệp: `server/repo.ts` · Chủ tệp: chưa có chủ
- Lý do: `docs/api.md` mục 5 hứa `GET /api/projects/:id` trả `modules[].qusScore`, và `shared/types.ts` đã có trường này, nhưng `toModule()` chưa đọc 2 cột mới nên luôn thiếu.
- Thay đổi đề xuất: trong `toModule(r)` thêm `qusScore: r.qus_score ?? null, qusCheckedAt: r.qus_checked_at ?? null`.
- Trạng thái: Mở
- Quyết định của A0:

### R-022 – A8: cột điểm QUS trong danh sách module (FN-56)
- Đợt / agent yêu cầu: 2 / A8
- Tệp: `client/views/ProjectView.tsx` (ngoài khối `<Modal>`) · Chủ tệp: A8 chỉ được sửa khối Modal
- Lý do: FN-56 cần huy hiệu điểm cạnh mỗi module ở SCR-09. Cần R-020 và R-021 trước.
- Thay đổi đề xuất: import `ScoreBadge` từ `ui.tsx`; thêm `<th>Chất lượng</th>` sau cột "Module" và ô
  `<td>{m.qusScore == null ? <span className="muted small">Chưa chấm</span> : <ScoreBadge score={m.qusScore} />}</td>`.
- Trạng thái: Mở
- Quyết định của A0:

### R-023 – A8: dọn CSS `.qus-*` không còn dùng sau khi panel chuyển sang `ScoreBadge` / `IssueList`
- Đợt / agent yêu cầu: 2 / A8
- Tệp: `client/styles.css` · Chủ tệp: A1
- Lý do: `QusPanel.tsx` mới dùng `ScoreBadge`, `IssueList`, `Empty`, `Btn`, không còn dùng một số class riêng.
- Thay đổi đề xuất:
  - Xoá hẳn: `.qus-empty`, `.qus-section-title`, `.qus-issues-list`, `.qus-toggle-btn`, `.qus-toggle-btn:hover`.
  - Ở các selector ghép `.qus-issue, .issue` / `.qus-issue-error, .issue-error` / `-warn` / `-info` / `.qus-issue-msg, .issue-msg` / `.qus-issue-sugg, .issue-sugg`: chỉ bỏ phần `.qus-*`, **giữ** `.issue*` (của `IssueList`).
  - Còn dùng, giữ nguyên: `.qus-panel`, `.qus-head`, `.qus-title-wrap`, `.qus-body`, `.qus-story-item`, `.qus-story-head`, `.qus-story-title`, `.qus-story-text`.
  - Thêm `cursor: pointer;` cho `.qus-story-head` (panel đang tạm đặt `style={{ cursor: "pointer" }}`; A8 bỏ dòng đó sau khi A1 thêm).
- Trạng thái: Mở
- Quyết định của A0:
