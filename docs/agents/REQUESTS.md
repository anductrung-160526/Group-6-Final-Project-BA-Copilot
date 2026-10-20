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
>
> Ghi chú A0 khi gộp đợt 2 (2026-10-20): A3 và A4 cùng dùng R-005, R-006. Giữ số của A3 (A11 đã dẫn R-005 = TopBar); hai mục của A4 đổi thành **R-013**, **R-014**. Các số còn lại giữ nguyên. Mục mới từ nay lấy từ R-024.

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
- Trạng thái: **Chấp nhận, đã chèn**
- Quyết định của A0 (2026-10-20): A0 chèn đúng đề xuất vào `server/app.ts` (tạo module và `PATCH` khi có `requirementInput`), commit `6c466d7`.

### R-021 – A8: trả `qusScore` / `qusCheckedAt` trong `Module` (FN-56)
- Đợt / agent yêu cầu: 2 / A8
- Tệp: `server/repo.ts` · Chủ tệp: chưa có chủ
- Lý do: `docs/api.md` mục 5 hứa `GET /api/projects/:id` trả `modules[].qusScore`, và `shared/types.ts` đã có trường này, nhưng `toModule()` chưa đọc 2 cột mới nên luôn thiếu.
- Thay đổi đề xuất: trong `toModule(r)` thêm `qusScore: r.qus_score ?? null, qusCheckedAt: r.qus_checked_at ?? null`.
- Trạng thái: **Chấp nhận, đã chèn**
- Quyết định của A0 (2026-10-20): A0 thêm 2 trường vào `toModule()`, commit `6c466d7`. Trang dự án đã hiện điểm.

### R-022 – A8: cột điểm QUS trong danh sách module (FN-56)
- Đợt / agent yêu cầu: 2 / A8
- Tệp: `client/views/ProjectView.tsx` (ngoài khối `<Modal>`) · Chủ tệp: A8 chỉ được sửa khối Modal
- Lý do: FN-56 cần huy hiệu điểm cạnh mỗi module ở SCR-09. Cần R-020 và R-021 trước.
- Thay đổi đề xuất: import `ScoreBadge` từ `ui.tsx`; thêm `<th>Chất lượng</th>` sau cột "Module" và ô
  `<td>{m.qusScore == null ? <span className="muted small">Chưa chấm</span> : <ScoreBadge score={m.qusScore} />}</td>`.
- Trạng thái: **Chấp nhận, đã chèn**
- Quyết định của A0 (2026-10-20): A0 thêm cột "Chất lượng" (`ScoreBadge`, "Chưa chấm" khi chưa có điểm) khi gộp A6, commit `c0b6c5d`.

### R-023 – A8: dọn CSS `.qus-*` không còn dùng sau khi panel chuyển sang `ScoreBadge` / `IssueList`
- Đợt / agent yêu cầu: 2 / A8
- Tệp: `client/styles.css` · Chủ tệp: A1
- Lý do: `QusPanel.tsx` mới dùng `ScoreBadge`, `IssueList`, `Empty`, `Btn`, không còn dùng một số class riêng.
- Thay đổi đề xuất:
  - Xoá hẳn: `.qus-empty`, `.qus-section-title`, `.qus-issues-list`, `.qus-toggle-btn`, `.qus-toggle-btn:hover`.
  - Ở các selector ghép `.qus-issue, .issue` / `.qus-issue-error, .issue-error` / `-warn` / `-info` / `.qus-issue-msg, .issue-msg` / `.qus-issue-sugg, .issue-sugg`: chỉ bỏ phần `.qus-*`, **giữ** `.issue*` (của `IssueList`).
  - Còn dùng, giữ nguyên: `.qus-panel`, `.qus-head`, `.qus-title-wrap`, `.qus-body`, `.qus-story-item`, `.qus-story-head`, `.qus-story-title`, `.qus-story-text`.
  - Thêm `cursor: pointer;` cho `.qus-story-head` (panel đang tạm đặt `style={{ cursor: "pointer" }}`; A8 bỏ dòng đó sau khi A1 thêm).
- Trạng thái: **Chấp nhận, đã làm**
- Quyết định của A0 (2026-10-20): A0 làm thay A1: xoá các class nêu tên, bỏ phần `.qus-*` trong selector ghép, thêm `cursor: pointer` cho `.qus-story-head` và bỏ style inline trong `QusPanel.tsx`, commit `195af3e`. A1 xem lại khi rảnh.

### R-013 (A4 ghi là R-005) – `FileResponse` cần chọn `inline`/`attachment` và tên tệp tiếng Việt
- Đợt / agent: 2 / A4
- Tệp: `server/http.ts`, `server/app.ts` · Chủ tệp: A2
- Lý do: `app.ts` luôn ghi `content-disposition: attachment; filename="<tên>"`. (1) `GET /api/files/:id/preview` theo hợp đồng phải `inline` để `<iframe>` hiện PDF. (2) Tên có ký tự ngoài Latin-1 (vd "Tài liệu.pdf") làm `writeHead` ném lỗi vì header không hợp lệ.
- Cách A4 đang làm (chỉ trong `server/routes/files.ts`): hàm `sendFile()` bọc `res.writeHead` của **riêng phản hồi đó** để ghi đè `content-disposition` (`filename=` bản ASCII bỏ dấu, `filename*=UTF-8''` tên gốc) và thêm `x-content-type-options: nosniff`. Có test trong `tests/files.test.ts`.
- Thay đổi đề xuất: thêm `disposition?: "inline" | "attachment"` vào `FileResponse` và để `app.ts` tự sinh `filename=` ASCII. Khi A2 làm xong, A4 bỏ phần bọc `writeHead`.
- Trạng thái: **Chấp nhận, đã làm**
- Quyết định của A0 (2026-10-20): A2 làm trên `agent/a2-r005-file-response` (`cf93aea`), A0 gộp ngay trước A4. Sau khi gộp A4, A0 bỏ hàm `sendFile()` (bọc `writeHead`) trong `server/routes/files.ts`, dùng `new FileResponse(buf, f.name, f.mime, "inline" | "attachment")`, commit `a089431`. Bỏ header `cache-control: no-store` mà bản tạm của A4 tự thêm.

### R-014 (A4 ghi là R-006) – A4 thay dòng `files` trong `client/routes.ts`
- Đợt / agent: 2 / A4
- Tệp: `client/routes.ts` · Chủ tệp: A2 (mục 2 `OWNERSHIP.md` cho A4 thay đúng một dòng giữ chỗ)
- Thay đổi: dòng `files` trỏ sang `FilesView` và thêm 1 dòng `import { FilesView }`. Hằng `LegacyFilesPage` (và import `ProjectView` nó dùng) không còn được dùng, **chưa xoá** để không sửa quá phạm vi.
- Việc A0 khi gộp: xoá `LegacyFilesPage`; trong `ProjectView.tsx` bỏ nhánh `tab === "files"` + import `FilesTab` (link tab "Kho tài liệu" vẫn trỏ `#/p/:id/files`, giờ mở `FilesView`); sau đó xoá `client/views/FilesTab.tsx`.
- Trạng thái: **Chấp nhận, đã làm**
- Quyết định của A0 (2026-10-20): Khi gộp A6, A0 xoá `LegacyFilesPage` và import `ProjectView` trong `client/routes.ts`, bỏ nhánh `tab === "files"` + import `FilesTab` khỏi `ProjectView.tsx` (link tab vẫn trỏ `#/p/:id/files`, giờ mở `FilesView`), xoá `client/views/FilesTab.tsx`. Commit `c0b6c5d`.

### R-005 – A3: gắn `TopBar` vào `client/main.tsx`
- Đợt / agent yêu cầu: 2 / A3
- Tệp: `client/main.tsx` · Chủ tệp: A2 (A0 chèn khi gộp)
- Lý do: SCR-02. `TopBar` tự lấy `/api/settings`, tự dựng menu từ `PAGES` và ô "Tôi là…", nên thay được cả khối header cũ.
- Thay đổi đề xuất: thêm `import { TopBar } from "./components/TopBar.tsx";`; thay toàn bộ khối `<header className="topbar">…</header>` bằng `<TopBar />`; bỏ state `settings` và `useEffect` gọi `/api/settings` trong `App` (không còn dùng). A3 đã thử đúng thay đổi này trên máy: 0 lỗi console, rồi hoàn lại.
- Trạng thái: **Chấp nhận, đã chèn**
- Quyết định của A0 (2026-10-20): A0 làm đúng đề xuất trong `client/main.tsx`, commit `6c466d7`. E2E A11 xác nhận "Tôi là…" nhớ người chọn sau khi tải lại.

### R-006 – A3: gửi người thao tác (FN-03) từ màn Thiết kế
- Đợt / agent yêu cầu: 2 / A3
- Tệp: `client/views/DesignTab.tsx` · Chủ tệp: dùng chung (A3 chỉ được 2 chỗ hiển thị)
- Lý do: FN-03 cần gửi `actorId` khi tạo bình luận và tạo phiên bản; các lời gọi API nằm ngoài 2 chỗ hiển thị A3 được sửa.
- Thay đổi đề xuất:
  - `import { useCurrentMember, withActor } from "../currentMember.ts";` và trong component `const { me } = useCurrentMember();`
  - Bọc body bằng `withActor(...)` ở 5 lời gọi tạo phiên bản: `POST /api/modules/:id/screens` (`newScreen`), `/edit`, `/revert`, `/layout/accept`, `/manual`.
  - Lời gọi `POST /api/screens/:id/annotations`: body thành `withActor({ nodeIds: selected, comment, bbox: unionBox(selected), author: me?.name })`. Riêng tên `author` thì server đã lưu được ngay, không cần chờ R-007.
- Trạng thái: **Chấp nhận, đã chèn**
- Quyết định của A0 (2026-10-20): A0 chèn `useCurrentMember`/`withActor` vào `DesignTab.tsx` khi gộp A9 (sau cùng), commit `195af3e`. Ngoài 5 lời gọi tạo phiên bản và lời gọi bình luận, A0 bọc thêm `POST /api/screens/:id/approve` để sự kiện duyệt màn (A7 dùng) ghi được người duyệt.

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
- Trạng thái: **Chấp nhận, đã chèn**
- Quyết định của A0 (2026-10-20): A0 làm đúng đề xuất ở `repo.ts` (`toVersion`, `toAnnotation`, `createAnnotation` ghi `author_id`) và `app.ts`, commit `6c466d7`.

### R-008 – A3 thêm `Tabs variant="pill"` vào design system
- Đợt / agent: 2 / A3 (**người dùng yêu cầu trực tiếp**, 2026-10-20)
- Tệp: `client/components/ui.tsx`, `client/styles.css`, `client/views/_Gallery.tsx`, `docs/design-system.md` · Chủ tệp: A1
- Lý do: menu thanh trên (SCR-02) dùng kiểu nút bo tròn (pill) thay cho tab gạch chân.
- Thay đổi: `Tabs` nhận thêm `variant?: "line" | "pill"` (mặc định `line`, chỗ gọi cũ không đổi); CSS `.tabs-pill` chỉ dùng token có sẵn; thêm mẫu vào `#/_gallery`; cập nhật dòng `Tabs` và "Thanh trên" trong `design-system.md`. `TopBar` dùng `<Tabs variant="pill">`.
- Kiểm tra: tab `line` cũ giữ nguyên kiểu (gạch chân mint-500); `npm test` 70/70, build qua, 0 lỗi console.
- Trạng thái: **Chấp nhận** (người dùng yêu cầu trực tiếp)
- Quyết định của A0 (2026-10-20): Đã ghi vào `OWNERSHIP.md` mục 4. A1 xem lại khi rảnh; không chặn gộp.

### R-011 – A7: đăng ký tự cập nhật task trong `createApp()`
- Đợt / agent yêu cầu: 2 / A7
- Tệp: `server/app.ts` · Chủ tệp: A2
- Lý do: `server/taskAutomation.ts` chỉ chạy khi có nơi gọi `registerTaskAutomation()`. Chưa ai gọi thì FN-20 → FN-23 không có hiệu lực khi chạy app (test của A7 tự gọi nên vẫn xanh).
- Thay đổi đề xuất (A0 chèn khi gộp A7, sau A6) – 2 dòng:
  ```ts
  import { registerTaskAutomation } from "./taskAutomation.ts"; // cạnh import "./routes/index.ts"
  registerTaskAutomation(); // dòng đầu thân createApp()
  ```
  Gọi nhiều lần vẫn chỉ có một bộ handler, nên đặt trong `createApp()` an toàn cho cả test lẫn `server/index.ts`. A7 đã thử trên bản gộp A6 + A7 + 2 dòng này: `npm test` 99/99.
- Trạng thái: **Chấp nhận, đã chèn**
- Quyết định của A0 (2026-10-20): A0 chèn 2 dòng vào `server/app.ts` ngay sau khi gộp A7, commit `43588c0`. E2E A11 bước 2–4 xanh trên bản gộp thật. Phần tuỳ chọn (cho `taskAutomation.ts` dùng hàm của A6) chưa làm, ghi tồn đọng.

### R-009 – A5: `GET /api/modules/:id/diagram` trả `{ ok: true }` thay vì `null`
- Đợt / agent yêu cầu: 2 / A5 (số tạm, A0 đánh lại số khi gộp nếu trùng)
- Tệp: `server/app.ts` · Chủ tệp: A2
- Lý do: hợp đồng (`docs/api.md` mục 3) quy định trả `UcDiagram | null` (null = chưa sinh). `createApp` gửi `out ?? { ok: true }` nên handler trả `null` thành `{ ok: true }`.
- Thay đổi đề xuất: `send(res, 200, out === undefined ? { ok: true } : out)`. A2 rà các route khác có trả `null` có chủ đích hay không.
- Tạm thời (A5): `DiagramTab` coi kết quả không có `code` là "chưa có sơ đồ"; `tests/ucDiagram.test.ts` chấp nhận cả hai. Sau khi sửa, bỏ nhánh `{ ok: true }` trong test.
- Trạng thái: **Chấp nhận, đã sửa**
- Quyết định của A0 (2026-10-20): A0 sửa `server/app.ts` thành `out === undefined ? { ok: true } : out` (commit `6c466d7`), đã rà: không route nào khác trả `null` có chủ đích để mong nhận `{ ok: true }`. Sau khi gộp A5, bỏ nhánh tạm trong `DiagramTab.tsx` và `tests/ucDiagram.test.ts`, commit `8ced088`.

### R-010 – A5: thêm class bố cục 2 cột bằng nhau vào design system
- Đợt / agent yêu cầu: 2 / A5 (số tạm)
- Tệp: `client/styles.css`, `docs/design-system.md`, `client/views/_Gallery.tsx` · Chủ tệp: A1
- Lý do: SCR-05 cần 2 cột (soạn mã | xem trước). Design system chưa có class 2 cột bằng nhau.
- Tạm thời (A5): `DiagramTab` dùng `.doc-layout` + `style={{ gridTemplateColumns: "1fr 1fr" }}` (không có màu hay px cứng).
- Thay đổi đề xuất: class `.split-2` (2 cột `1fr 1fr`, khoảng cách `--space-4`, lề `0 --space-4`, về 1 cột ở màn hẹp). Sau khi có, A5 đổi `DiagramTab` sang class này.
- Trạng thái: **Chấp nhận, đã làm**
- Quyết định của A0 (2026-10-20): A0 làm thay A1: thêm `.split-2` vào `styles.css` (về 1 cột dưới 860 px), dòng trong `design-system.md` mục 3.1, mẫu trong `#/_gallery`; `DiagramTab` chuyển sang class này. Commit `8ced088`.

### R-012 – A9: dọn CSS `.suggest-*` trong `client/styles.css`
- Đợt / agent yêu cầu: 2 / A9
- Tệp: `client/styles.css`, `docs/design-system.md` · Chủ tệp: A1
- Lý do: khối gợi ý cũ trong `DesignTab.tsx` đã tách ra `client/components/SuggestionsPanel.tsx`, mỗi gợi ý vẽ bằng `SuggestionCard` (`.suggestion-*`). Ba class của thẻ cũ không còn mã nào dùng. Hai class khung (`.suggest-block`, `.suggest-list`) vẫn dùng làm khung panel trong cột trái (viền trên, danh sách dọc có khoảng cách) – A9 không tự viết kiểu mới.
- Thay đổi đề xuất:
  1. Xoá `.suggest-item`, `.suggest-name`, `.suggest-actions` (khối "SCR-16 Gợi ý tiếp theo" trong `styles.css`).
  2. Giữ `.suggest-block`, `.suggest-list`; thêm 1 dòng vào bảng 3.1 của `docs/design-system.md`: "`.suggest-block`, `.suggest-list` – khung khối Gợi ý tiếp theo (SCR-16) ở cột trái Design Studio, chứa các `SuggestionCard`".
  3. Nếu A1 muốn đổi tên hai class khung thì báo lại A9 để sửa `SuggestionsPanel.tsx` (2 chỗ).
- Trạng thái: **Chấp nhận, đã làm**
- Quyết định của A0 (2026-10-20): A0 làm thay A1: xoá `.suggest-item/.suggest-name/.suggest-actions`, giữ hai class khung và thêm dòng vào `design-system.md` mục 3.1. Commit `195af3e`.

> Ghi chú C2 (đợt 5): C2 lấy dải **R-030 → R-039** (số tạm), C0 đánh lại khi gộp nếu trùng.

### R-030 – C0: bỏ giá trị cũ khỏi kiểu sau khi gộp xong đợt 2
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `shared/types.ts`, `server/db.ts`, `server/events.ts` · Chủ tệp: C2 (khoá sau đợt 1)
- Lý do: để mã v2 còn biên dịch và chạy khi hợp đồng đợt 5 vào trước, C2 giữ tạm: `TaskStatus` có `"redo"`, `ArtifactKind` có `"docs"`, `ArtifactEventType` có `"artifact.unapproved"`, `UcDiagramStatus`; CHECK của `tasks` còn nhận `'redo'`, `'docs'`. Migration đổi `redo` → `doing` + cờ mỗi lần khởi động.
- Thay đổi đề xuất: khi C7 (taskRules, tasks), C9 (service.ts), C6 (diagram.ts), C5 (DocsTab) không còn dùng → xoá 4 giá trị trên khỏi union, `EVENT_TYPES` = `EVENT_TYPES_V5`; (tuỳ chọn) dựng lại bảng `tasks` với CHECK không còn `redo`/`docs` sau khi đổi task `docs` cũ sang `doc` + `sub`.
- Trạng thái: Mở

### R-031 – C2 sửa tối thiểu `shared/taskRules.ts` để biên dịch
- Đợt / agent: 5 – đợt 1 / C2 (tự báo)
- Tệp: `shared/taskRules.ts`, `tests/taskRules.test.ts` · Chủ tệp: C7 (đợt 2)
- Lý do: thêm `"doc"` vào `ArtifactKind` và 2 sự kiện mới làm `Record<ArtifactKind,…>` và `switch` của `statusReason` báo lỗi `tsc` (TS2741, TS2366). Không có cách nào giữ đúng hợp đồng mà không chạm tệp này.
- Thay đổi đã làm: `KIND_LABEL` thêm `doc: "Tài liệu"`; `statusReason` thêm 2 nhánh `artifact.done` ("… đã Xong"), `artifact.revision_requested` ("… bị yêu cầu sửa"). `nextStatus` **không đổi** (2 sự kiện mới → giữ nguyên). Test: kiểu `TABLE` nới thành `Partial<…>`, dữ liệu bảng không đổi.
- Trạng thái: **Đã làm** – C7 thay toàn bộ khi làm quy tắc mới.

### R-032 – C3: thành viên và đăng nhập theo hợp đồng đợt 5
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `server/repo/members.ts`, `server/auth.ts`, `client/currentMember.ts` · Chủ tệp: C3
- Thay đổi đề xuất:
  - `toMember()` thêm `hasPassword: !!r.password_hash`; **không bao giờ** đưa `password_hash` ra API.
  - `countOpenTasks()` đếm task chưa xong theo trạng thái mới: `status NOT IN ('done','approved')`.
  - Màn đăng nhập ở `#/login` (client `api.ts` tự chuyển tới khi nhận `401 mode "member"`); gọi `login({ name, password })`, `getMe()`, `logout()`; màn Quản trị đặt mật khẩu bằng `setMemberPassword(id, pw)`. Phiên, băm mật khẩu, `requireMember`/`requireLead` nằm ở `server/http.ts` (C2) – C3 có thể chuyển sang `auth.ts` nhưng giữ tên hàm export.
  - `client/presence.ts` (C2) dùng `currentMemberId()` cho chế độ demo; nếu C3 bỏ ô "Tôi là…" thì giữ hàm này (trả `undefined` cũng được).
- Trạng thái: Mở

### R-033 – C9: đọc cột mới của màn và bộ test
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `server/repo.ts`, `server/service.ts` · Chủ tệp: C9
- Thay đổi đề xuất: `toScreen()` thêm `rev`, `revisionRequested: !!r.revision_requested`, `updatedBy`, `updatedAt`; `toModule()` thêm `testsRev`, `testsRevisionRequested`; sinh/sửa test case gọi `bumpRev({ kind: "tests", id: moduleId, moduleId }, actorId)`. Route sửa màn trong `app.ts` đã nhận `baseRev` và tăng `screens.rev` (C2) – client chỉ cần gửi `baseRev`.
- Trạng thái: Mở

### R-034 – C7: task theo hợp đồng đợt 5
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `server/repo/tasks.ts`, `server/routes/tasks.ts`, `client/views/TaskDialog.tsx` · Chủ tệp: C7
- Thay đổi đề xuất: `toTask()` thêm `revisionRequested`, `artifactSub`; `TASK_STATUSES` = `TASK_STATUSES_V5`; `ARTIFACT_KINDS` = `ARTIFACT_KINDS_V5`; ghi/đọc `artifact_sub`; `listArtifacts` trả một dòng cho mỗi tài liệu/sơ đồ (`kind "doc"/"diagram"` + `sub`); task cũ `artifact_type = 'docs'` đổi sang `doc` + sub phù hợp (hoặc giữ hiển thị "Tài liệu (cũ)").
- Trạng thái: Mở

### R-035 – C0: bổ sung 2 tệp route mới vào bảng sở hữu
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `docs/agents/OWNERSHIP.md`, kế hoạch đợt 5 mục 2 · Chủ tệp: C0
- Lý do: C2 tạo khung `server/routes/diagrams.ts` (5 sơ đồ, chủ **C6** – C6 có thể gộp vào `diagram.ts`) và `server/routes/prototype.ts` (xuất HTML, chủ **C9**), ngoài 4 tệp khung có tên trong kế hoạch. Không ai khác đăng ký các route này được vì `app.ts`/`index.ts` là của C2.
- Trạng thái: Mở

### R-024 – A0 sửa lỗi QA Q-05 → Q-13 trên tệp của nhiều agent
- Đợt / agent: 3 / A0 (người dùng yêu cầu trực tiếp "sửa các lỗi đang có", 2026-10-20)
- Tệp: `styles.css`, `ui.tsx`, `_Gallery.tsx`, `design-system.md` (A1) · `e2e/e2e.mjs` (chưa có chủ) · `MembersView.tsx` (A3) · `FilesView.tsx` (A4) · `DiagramTab.tsx` (A5) · `TaskDialog.tsx` (A6) · `taskAutomation.ts` (A7) · `shared/suggest.ts`, `tests/suggest.test.ts` (A9) · `DesignTab.tsx`, `DocsTab.tsx`, `TestsTab.tsx`, `Home.tsx`, `ProjectView.tsx` (dùng chung / chưa có chủ)
- Thay đổi: xem `QA_REPORT.md` mục 7. Component mới `useUI().confirm` đã thêm đủ 3 nơi (ui.tsx, `#/_gallery`, design-system.md).
- Trạng thái: **Chấp nhận, đã làm** (commit `96a5a56`)
- Quyết định của A0 (2026-10-20): các agent chủ tệp xem lại phần của mình khi rảnh; không chặn đợt 4.
