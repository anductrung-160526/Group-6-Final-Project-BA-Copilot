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
- Trạng thái: **Đã làm một phần (C3, đợt 2)** – chỉ `countOpenTasks()` (`status NOT IN ('done','approved')`, tức Cần làm / Đang làm; `redo` cũ nếu còn vẫn tính chưa xong). Phần mật khẩu / màn đăng nhập / `hasPassword` **bỏ** theo quyết định 15 (không có màn đăng nhập, giữ ô "Tôi là…"); `server/auth.ts`, `currentMember.ts` để nguyên.

### R-033 – C9: đọc cột mới của màn và bộ test
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `server/repo.ts`, `server/service.ts` · Chủ tệp: C9
- Thay đổi đề xuất: `toScreen()` thêm `rev`, `revisionRequested: !!r.revision_requested`, `updatedBy`, `updatedAt`; `toModule()` thêm `testsRev`, `testsRevisionRequested`; sinh/sửa test case gọi `bumpRev({ kind: "tests", id: moduleId, moduleId }, actorId)`. Route sửa màn trong `app.ts` đã nhận `baseRev` và tăng `screens.rev` (C2) – client chỉ cần gửi `baseRev`.
- Trạng thái: **Đã làm** (C9, nhánh `agent/c9-prototype`): `toScreen`/`toModule` đọc cột mới; sinh test gọi `bumpRev` tests + chặn đè `baseRev`.

### R-034 – C7: task theo hợp đồng đợt 5
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `server/repo/tasks.ts`, `server/routes/tasks.ts`, `client/views/TaskDialog.tsx` · Chủ tệp: C7
- Thay đổi đề xuất: `toTask()` thêm `revisionRequested`, `artifactSub`; `TASK_STATUSES` = `TASK_STATUSES_V5`; `ARTIFACT_KINDS` = `ARTIFACT_KINDS_V5`; ghi/đọc `artifact_sub`; `listArtifacts` trả một dòng cho mỗi tài liệu/sơ đồ (`kind "doc"/"diagram"` + `sub`); task cũ `artifact_type = 'docs'` đổi sang `doc` + sub phù hợp (hoặc giữ hiển thị "Tài liệu (cũ)").
- Trạng thái: **Đã làm** – C7 (C0 đóng khi gộp đợt 5, 2026-10-20)

### R-035 – C0: bổ sung 2 tệp route mới vào bảng sở hữu
- Đợt / agent yêu cầu: 5 – đợt 1 / C2
- Tệp: `docs/agents/OWNERSHIP.md`, kế hoạch đợt 5 mục 2 · Chủ tệp: C0
- Lý do: C2 tạo khung `server/routes/diagrams.ts` (5 sơ đồ, chủ **C6** – C6 có thể gộp vào `diagram.ts`) và `server/routes/prototype.ts` (xuất HTML, chủ **C9**), ngoài 4 tệp khung có tên trong kế hoạch. Không ai khác đăng ký các route này được vì `app.ts`/`index.ts` là của C2.
- Trạng thái: **Đã làm** – C0 ghi bảng sở hữu (ae46494) (C0 đóng khi gộp đợt 5, 2026-10-20)

### R-024 – A0 sửa lỗi QA Q-05 → Q-13 trên tệp của nhiều agent
- Đợt / agent: 3 / A0 (người dùng yêu cầu trực tiếp "sửa các lỗi đang có", 2026-10-20)
- Tệp: `styles.css`, `ui.tsx`, `_Gallery.tsx`, `design-system.md` (A1) · `e2e/e2e.mjs` (chưa có chủ) · `MembersView.tsx` (A3) · `FilesView.tsx` (A4) · `DiagramTab.tsx` (A5) · `TaskDialog.tsx` (A6) · `taskAutomation.ts` (A7) · `shared/suggest.ts`, `tests/suggest.test.ts` (A9) · `DesignTab.tsx`, `DocsTab.tsx`, `TestsTab.tsx`, `Home.tsx`, `ProjectView.tsx` (dùng chung / chưa có chủ)
- Thay đổi: xem `QA_REPORT.md` mục 7. Component mới `useUI().confirm` đã thêm đủ 3 nơi (ui.tsx, `#/_gallery`, design-system.md).
- Trạng thái: **Chấp nhận, đã làm** (commit `96a5a56`)
- Quyết định của A0 (2026-10-20): các agent chủ tệp xem lại phần của mình khi rảnh; không chặn đợt 4.

### R-040 – C3 cần C1/C0 thêm icon menu trái và lớp bố cục khung dự án
- Đợt / agent yêu cầu: 5 – đợt 2 / C3
- Tệp: `client/components/ui.tsx`, `client/styles.css`, `client/views/_Gallery.tsx`, `docs/design-system.md` · Chủ tệp: C1 (đã xong đợt 1) → C0
- Lý do: (1) `projectMenu.ts` ghi tên icon Lucide (`SquareKanban`, `BookText`, `Workflow`, `FolderOpen`, `ScrollText`, `GitBranch`, `FileText`, `Network`, `LayoutTemplate`, `FlaskConical`, `Route`) nhưng bảng `ICONS` của `Icon` chưa có, và chưa có icon "menu" (nút mở menu trái ở màn hẹp). (2) Chưa có lớp CSS cho khung 2 cột "menu trái + nội dung" của dự án.
- Cách tạm C3 đã làm (trong `ProjectShell.tsx`): `menuIcon()` dùng icon trùng tên nếu `ICONS` có (nguyên dạng hoặc viết thường chữ đầu, vd `squareKanban`), không thì dùng icon gần nghĩa có sẵn (grid, user, play, folder, ai, github); các bước 1–5 chỉ hiện số bước. Nút mở menu dùng icon `more`. Bố cục dùng lại `.module-head` + `.doc-layout` / `.doc-nav` / `.doc-main` (điểm gãy 860px sẵn có – nên menu thu gọn ở ≤ 860px, gồm cả ≤ 768px) và 2 thuộc tính inline chỉ dùng token (`paddingBottom: var(--space-3)`, `paddingTop: var(--space-4)`).
- Thay đổi đề xuất: thêm vào `ICONS` các khoá `squareKanban, bookText, workflow, folderOpen, scrollText, fileText, network, layoutTemplate, flaskConical, route, menu` (Lucide cùng tên) → `ProjectShell` tự dùng, không phải sửa. Thêm lớp `.project-shell` / `.project-nav` (menu trái dính dưới thanh trên, cuộn riêng) nếu C10 muốn tách khỏi `.doc-layout`, rồi bỏ 2 style inline.
- Trạng thái: **Đã làm** – C10 (C0 đóng khi gộp đợt 5, 2026-10-20)

### R-041 – C3 cần route sửa dự án (`PATCH /api/projects/:id`) trong `app.ts`
- Đợt / agent yêu cầu: 5 – đợt 2 / C3
- Tệp: `server/app.ts`, `server/repo.ts`, `client/api.ts`, `docs/api.md` · Chủ tệp: C2 (khoá), C9 (`repo.ts`)
- Lý do: trang chủ cần nút Sửa dự án (`RowActions`) nhưng server chưa có route sửa dự án.
- Cách tạm C3 đã làm: đăng ký `PATCH /api/projects/:id` `{ name?, description? }` → `Project` (tên rỗng 400, không có dự án 404) ở cuối `server/routes/members.ts` (khối ghi "TẠM (R-041)"), ghi bằng SQL trực tiếp; `Home.tsx` gọi `patch()` của `api.ts`. Có test trong `tests/members.test.ts`.
- Thay đổi đề xuất (C0 khi gộp): chuyển route sang `app.ts` cạnh `POST /api/projects`, thêm `repo.updateProject()`, `updateProject(id, b)` trong `client/api.ts`, một dòng trong `docs/api.md`; xoá khối tạm trong `members.ts`.
- Trạng thái: Mở

### R-042 – C11: e2e và seed theo khung dự án mới của C3
- Đợt / agent yêu cầu: 5 – đợt 2 / C3
- Tệp: `e2e/demo-flow.mjs`, `e2e/e2e.mjs`, `scripts/seed.ts` · Chủ tệp: C11
- Lý do: URL và màn đổi: `#/members` → `#/admin` (vẫn chuyển hướng; `data-testid="members-view"` giữ nguyên; nút Sửa/Xoá thành viên giờ là `RowActions` – testid `member-<id>-edit` / `member-<id>-delete`, xoá hỏi bằng `confirm-ok`); thanh trên chỉ còn "Dự án" + "Quản trị hệ thống" (BA Lead) – bỏ `nav-tasks`, `nav-files`, `nav-members`; `#/p/:id` → `#/p/:id/tasks`; `#/m/:id/<tab>` → `#/p/:pid/work/:mid/<bước>`. Thêm / sửa / xoá thành viên cần `actorId` là BA Lead khi hệ thống đã có BA Lead (server trả 403). Menu trái: `pnav-<mục>`, `pnav-work-<bước>[-<loại>]`; bộ chọn module `module-picker`, tạo module `new-module` → `module-name` → `create-module`.
- Thay đổi đề xuất: cập nhật kịch bản e2e theo testid trên; seed không cần đổi (ghi thẳng DB).

### R-060 – C1: icon "download" cho nút tải tệp
- Đợt / agent yêu cầu: 5 – đợt 2 / C5
- Tệp: `client/components/ui.tsx`, `docs/design-system.md` mục 3.1 · Chủ tệp: C1 (đợt 3: C10)
- Lý do: màn Tài liệu có nút "Tải .md"; bảng `ICONS` chưa có icon tải về (chỉ có `upload`). C5 tạm để nút chữ không icon.
- Thay đổi đề xuất: thêm `download: Download` (Lucide) vào `ICONS` + dòng bảng 3.1; C10 gắn `<Icon name="download" />` vào nút `doc-download` trong `client/views/DocsView.tsx`.
- Trạng thái: **Đã làm** – C10 (C0 đóng khi gộp đợt 5, 2026-10-20)

### R-061 – C9: đọc UC / FR từ `module_docs` của C5 cho test case và truy vết
- Đợt / agent yêu cầu: 5 – đợt 2 / C5
- Tệp: `server/service.ts`, `server/repo.ts`, `shared/trace.ts` · Chủ tệp: C9
- Thông tin: `module_docs.data` của UC_SPEC là `{ useCases: UseCase[] }`, của FRD_NFR là `{ requirements: Requirement[] }`, của SRS là `{ srs: SrsDoc }` (đúng hợp đồng C2). Mỗi UC do C5 sinh có thêm trường **`storyCodes: string[]`** (mã US-xx nguồn, ngoài kiểu `UseCase`) – dùng cho cột Story → UC của truy vết. UC sinh từ story nên `screenIds` rỗng (không còn BR-01).
- Khi UC_SPEC…FRD_NFR được ghi, C5 đã đặt bộ test (`kind "tests"`) đang có thành `outdated` + phát `artifact.stale`; C9 không cần làm lại việc này. Sinh test case nên kiểm FRD_NFR `done`/`approved` (quyết định 8) thay cho `modules.docs_status`.
### R-050 – C9 / C0: route gợi ý màn và SuggestionsPanel đọc user story có cấu trúc
- Đợt / agent yêu cầu: 5 – đợt 2 / C4
- Tệp: `server/routes/suggest.ts` (A9, chưa có chủ đợt 5), `client/components/SuggestionsPanel.tsx` (C9) · `scripts/seed.ts` (C11)
- Lý do: `shared/suggest.ts` (C4) đã nhận story có cấu trúc (`SuggestInput.stories: (string | StructuredStory)[]`, nguồn gợi ý = mã US-xx), nhưng route vẫn truyền `splitStories(m.requirementInput)`.
- Thay đổi đề xuất: trong `getScreenSuggestions` đổi `stories: splitStories(m.requirementInput)` → `stories: moduleStories(m.id)` (`import { moduleStories } from "../repo/stories.ts"`). `SuggestionsPanel` điều kiện hiện khối: thay `splitStories(m.requirementInput).length > 0` bằng "module có story" (đọc `listStories(pid, { moduleId })`). `scripts/seed.ts` nên tạo story bằng `POST /api/projects/:id/stories` (hoặc chèn bảng `user_stories`) thay cho `requirementInput`, vì bước chuyển `d5.stories` chỉ chạy một lần lúc mở DB rỗng.
- Trạng thái: Mở

### R-051 – C0 (sau gộp): AI dùng `storiesText(moduleId)` thay `requirementInput`
- Đợt / agent yêu cầu: 5 – đợt 2 / C4
- Tệp: `server/service.ts`, `server/ai/pipelines.ts` (C9), `server/ai/docsPipelines.ts` (C5)
- Thay đổi đề xuất: đầu vào AI lấy từ `storiesText(moduleId)` trong `server/repo/stories.ts` (mỗi story: `US-01 (High): As a …, I want …, so that ….` + tiêu chí chấp nhận). C5/C9 hiện đọc thẳng bảng – sau khi gộp nên đổi về hàm này cho thống nhất.
- Trạng thái: Mở

### R-052 – C2/C0: `deleteStory` trong `client/api.ts` nhận `baseRev`, `actorId`
- Đợt / agent yêu cầu: 5 – đợt 2 / C4
- Tệp: `client/api.ts` (khoá)
- Lý do: `deleteStory(id)` không gửi được `baseRev`/`actorId` (DELETE không có body). Server đã đọc `baseRev`/`actorId` ở query. Tạm thời `StoriesView` gọi `del("/api/stories/:id?baseRev=…&actorId=…")`.
- Thay đổi đề xuất: `deleteStory = (id, q: { baseRev?: number; actorId?: string } = {}) => del(`/api/stories/${enc(id)}${qs(...)}`)`.
### R-080 – C1: icon theo loại sản phẩm + ApprovalBar nhận trạng thái task
- Đợt / agent yêu cầu: 5 – đợt 2 / C7
- Tệp: `client/components/ui.tsx`, `#/_gallery`, `docs/design-system.md` · Chủ tệp: C1
- Lý do: (1) bảng `ICONS` chưa có icon cho màn / tài liệu / sơ đồ / bộ test – C7 tạm dùng `grid` / `folder` / `target` / `check` trong một bảng duy nhất `ARTIFACT_ICON` (`client/views/TaskDialog.tsx`). (2) `ApprovalBar` chỉ nhận `ArtifactStatus`; task không gắn sản phẩm có trạng thái `todo/doing` nên C7 tạm dựng cùng bố cục bằng class `.approval-bar` + `StatusBadge` + `Btn` trong `TaskDialog.tsx`.
- Thay đổi đề xuất: thêm icon `screen` (LayoutTemplate), `doc` (FileText), `diagram` (Network), `tests` (FlaskConical); (tuỳ chọn) `ApprovalBar` thêm prop `onStart` + nhận `todo/doing` (doing = cho bấm Xong). C0/C7 đổi `ARTIFACT_ICON` và phần thanh tạm sau khi có.
- Trạng thái: **Đã làm** – C10 (C0 đóng khi gộp đợt 5, 2026-10-20)

### R-081 – C2/C0: `client/api.ts` thêm `artifactSub` cho task
- Đợt / agent yêu cầu: 5 – đợt 2 / C7
- Tệp: `client/api.ts` (khoá) · Chủ tệp: C2
- Lý do: server nhận/trả `artifactSub` (doc/diagram), `GET /api/artifacts/:kind/:id/tasks?sub=`. C7 tạm gửi qua kiểu giao `TaskInput & { artifactSub }` và `get()` trực tiếp trong `RelatedTasks.tsx`.
- Thay đổi đề xuất: `TaskInput.artifactSub?: DocKind | DiagramKind | null`; `listArtifactTasks(kind, id, sub?)`.
- Trạng thái: Mở
### R-090 – C2/C0: thêm `commitsError?` vào `GitHistory`
- Đợt / agent yêu cầu: 5 – đợt 2 / C8
- Tệp: `shared/types.ts`, `docs/api.md` mục 5.6 · Chủ tệp: C2 (khoá – C0 gộp)
- Lý do: `GET /api/projects/:id/git/history` gọi GitHub để lấy commit; GitHub lỗi (sai token, mất mạng) thì vẫn phải trả nhật ký `git_pushes` trong app. C8 đang trả thêm trường `commitsError?: string` (câu tiếng Việt) và khai báo kiểu tạm `GitHistory & { commitsError?: string }` trong `server/routes/git.ts`, `client/views/GitHistoryView.tsx`.
- Thay đổi đề xuất: `GitHistory` thêm `commitsError?: string`; ghi một dòng vào bảng 5.6.
- Trạng thái: Mở – C8 khai báo kiểu tạm – giữ, chưa đưa vào types.ts

### R-091 – C7: lỗi GitHub khi Duyệt là `HttpError` 502
- Đợt / agent yêu cầu: 5 – đợt 2 / C8
- Tệp: `server/routes/approval.ts` · Chủ tệp: C7
- Ghi chú: `pushApproved(ref, actorId)` (hàm thật trong `server/github.ts`, tự đăng ký khi nạp `server/routes/git.ts`) ném `GitHubError extends HttpError` (status 502, message tiếng Việt, không chứa token) khi đã cấu hình mà GitHub lỗi. C7 chỉ cần gọi `await pushApproved(...)` **trước** khi đổi trạng thái (ngoài `tx()`, vì là async) và để lỗi lan ra – client nhận `{ error: "<lý do>" }` mã 502, trạng thái không đổi. Chưa cấu hình → `{ pushed: false, message: "Chưa cấu hình GitHub – chưa đẩy" }`. Màn prototype: `index.html` tự tính cả màn đang được duyệt (chưa cần đổi trạng thái trước khi đẩy).
- Trạng thái: Mở (chỉ thông tin)

### R-092 – C3: nút Cài đặt GitHub trên header dự án
- Đợt / agent yêu cầu: 5 – đợt 2 / C8
- Tệp: `client/components/ProjectShell.tsx` · Chủ tệp: C3
- Ghi chú: ngăn cài đặt là `ProjectGitSettings` trong `client/views/ProjectGitSettings.tsx`, props `{ projectId, onClose, onSaved? }`; tự kiểm tra BA Lead (`useCurrentMember`), tự gửi `actorId`. Server chặn 403 khi người đang chọn không phải BA Lead, kể cả khi thiếu `actorId`.
- Trạng thái: Mở (chỉ thông tin)
### R-100 – C0/C7: bỏ "artifact.unapproved" còn phát khi sửa màn Đã duyệt
- Đợt / agent yêu cầu: 5 – đợt 2 / C9
- Tệp: `server/service.ts` (`draftAfterChange`) · Chủ tệp: C9; liên quan `tests/taskAutomation.test.ts` (C7)
- Lý do: để `tests/taskAutomation.test.ts` (luồng v2, kỳ vọng task `redo` + `docs_status` Lỗi thời khi sửa màn Đã duyệt) còn qua trên nhánh C9, `draftAfterChange` vẫn phát thêm `artifact.unapproved` và áp BR-02 cho bộ tài liệu cũ khi màn đang **Đã duyệt**. Màn đang **Xong** chỉ về Bản nháp + `artifact.drafted` (+ bộ test Lỗi thời) đúng hợp đồng đợt 5.
- Thay đổi đề xuất: khi C7 thay taskRules/test mới, C0 xoá 2 dòng có chú thích "v2 – bỏ khi C0 làm R-030" trong `draftAfterChange` (giữ `setArtifactState(draft)` + `drafted` + `staleTests`).
- Trạng thái: Mở

### R-101 – C0: route sinh test case trùng trong `app.ts`
- Đợt / agent yêu cầu: 5 – đợt 2 / C9
- Tệp: `server/app.ts` · Chủ tệp: C2 (khoá)
- Lý do: `POST /api/modules/:id/tests/generate` trong `app.ts` không truyền `baseRev`. C9 đăng ký lại cùng đường dẫn trong `server/routes/prototype.ts` (tệp route nạp trước nên được ưu tiên) để nhận `baseRev` + `actorId`; body/kết quả giữ nguyên (`TestCase[]`). Thêm `GET /api/modules/:id/tests/readiness` → `{ ready, reason, source: "v5"|"legacy"|null, frdStatus }`.
- Thay đổi đề xuất: xoá dòng route tests/generate trong `app.ts`; ghi 2 endpoint vào `docs/api.md` mục 5.7.
- Trạng thái: **Đã làm** – C0 (382d3ff) (C0 đóng khi gộp đợt 5, 2026-10-20)

### R-102 – C1: thêm icon "download" (Tải về)
- Đợt / agent yêu cầu: 5 – đợt 2 / C9
- Tệp: `client/components/ui.tsx`, `docs/design-system.md` · Chủ tệp: C1
- Lý do: nút "Xuất HTML", "Xuất Excel" (C9) và các nút tải tệp khác chưa có icon phù hợp (bảng `ICONS` chỉ có `upload`). Tạm để nút chỉ có chữ.
- Thay đổi đề xuất: thêm `download: Download` (Lucide) vào `ICONS` + bảng mục 3.1.
- Trạng thái: **Đã làm** – C10 (C0 đóng khi gộp đợt 5, 2026-10-20)
