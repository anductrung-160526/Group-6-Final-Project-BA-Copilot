# Kế hoạch đa agent xây dựng BA Copilot v2

Tài liệu nguồn: `docs/BA_Copilot_v2_UC_FN_SCR.md` (29 UC, 61 FN, 16 SCR).
Mã nguồn: `ba-copilot-source/ba-copilot` (React + esbuild, server Node `node:sqlite`, `shared/` dùng chung).

## 1. Nguyên tắc chia việc

1. **Chia theo lát dọc (vertical slice), không chia "frontend/backend".**
   Mỗi agent tính năng tự làm trọn phần của mình: bảng DB, repo, API, UI và test. Codebase nhỏ, nếu tách frontend và backend thì hai bên phải chờ nhau và bàn giao qua lại liên tục.
2. **Hợp đồng chốt trước, làm song song sau.**
   Agent Nền tảng viết trước *toàn bộ* type, schema, tên endpoint và sự kiện, tất cả ở dạng stub. Nhờ vậy các agent tính năng có thể chạy song song mà không đụng nhau.
3. **Mỗi agent sở hữu một nhóm tệp riêng.**
   Tệp dùng chung (`app.ts`, `ModuleView.tsx`, `main.tsx`, `db.ts`, `types.ts`) chỉ được Agent Nền tảng sửa, bằng cách tạo sẵn *điểm cắm* (registry). Agent tính năng chỉ thêm tệp mới và đăng ký vào đúng một dòng đã chừa sẵn.
4. **Dùng lại code đã có trên nhánh.** QUS (`manh/c1-qus`), Kho tài liệu (`htrung-c4-kho-tai-lieu`) và gợi ý ML (`trung_ba`) đều được gộp lại, không viết lại.
5. **Mỗi agent chạy trong worktree riêng** (`isolation: "worktree"`), có nhánh `agent/<mã>-<tên>` và chỉ được gộp khi qua cổng kiểm tra (mục 5).

## 2. Danh sách agent

| Mã | Agent | Đợt | Phụ trách (FN / SCR) | Phụ thuộc |
|---|---|---|---|---|
| A0 | Tích hợp & Điều phối | 0, 4 | Gộp nhánh, chạy cổng, xử lý xung đột | — |
| A1 | Design System | 1 | Token, component dùng chung, bố cục SCR-15/16 | A0 |
| A2 | Nền tảng dữ liệu & hợp đồng (DB, ERD, API, sự kiện) | 1 | Schema mục 5 của tài liệu v2, `types.ts`, registry, event bus | A0 |
| A3 | Thành viên & thanh trên | 2 | FN-01 → FN-03, SCR-01, SCR-02 | A1, A2 |
| A4 | Kho tài liệu | 2 | FN-04 → FN-10, SCR-03, SCR-04 | A1, A2 |
| A5 | Sơ đồ UC | 2 | FN-11 → FN-14, SCR-05 | A1, A2 |
| A6 | Công việc Kanban | 2 | FN-15 → FN-19, SCR-06, SCR-07 | A1, A2 |
| A7 | Tự cập nhật trạng thái task | 2 | FN-20 → FN-23 (không có UI) | A2 (hợp đồng tasks và sự kiện) |
| A8 | Chất lượng yêu cầu QUS | 2 | FN-50 → FN-56, SCR-15, nâng cấp SCR-09 | A1, A2 |
| A9 | Gợi ý màn tiếp theo | 2 | FN-57 → FN-61, SCR-16, nâng cấp SCR-10 | A1, A2 (A8 cho `splitStories`, đã có trên nhánh) |
| A10 | Dữ liệu demo (seed) | 3 | `scripts/seed.ts` | A3 → A9 |
| A11 | Kiểm thử E2E & QA | 3 | Playwright cho luồng demo, rà soát hồi quy | A3 → A9 |
| A12 | Tài liệu & Triển khai | 3, 4 | README, mục Tools (T1), deploy Railway | A11 |

Có tất cả 13 agent. Ở đợt 2, bảy agent chạy song song.

> Không tách mỗi màn thành một agent, vì SCR-03/SCR-04 và SCR-06/SCR-07 dùng chung dữ liệu và API. Tách ra thì phải bàn giao thêm mà không được lợi gì.

## 3. Thứ tự chạy

```
Đợt 0   A0 ── gộp trung_ba + manh/c1-qus + htrung-c4 → nhánh v2-base, chạy test xanh
          │
Đợt 1   A1 Design System ─┐   (song song)
        A2 Nền tảng ──────┘   → A0 gộp → nhánh v2-contract
          │
Đợt 2   A3  A4  A5  A6  A7  A8  A9    (7 agent song song, mỗi agent một worktree)
          │   A0 gộp lần lượt theo thứ tự: A8 → A4 → A3 → A6 → A7 → A5 → A9
          │
Đợt 3   A10 Seed ─→ A11 E2E/QA ─→ (lỗi thì trả về agent sở hữu tệp)
          │
Đợt 4   A0 chốt bản demo → A12 deploy + tài liệu
```

Lý do chọn thứ tự gộp ở đợt 2:

- A8 và A4 gộp trước vì phần lớn đã có code sẵn, ít rủi ro.
- A7 phải gộp sau A6, vì bộ quy tắc tự cập nhật cần bảng `tasks` thật để chạy test tích hợp.
- A9 gộp cuối vì cùng sửa `DesignTab.tsx` với A3 (FN-03) và A6 (FN-19).

## 4. Chi tiết từng agent

Mỗi agent đều có bốn phần: **Đầu vào**, **Các bước**, **Tệp được sở hữu** và **Xong khi**. Cuối mục 4 có mẫu prompt chung để khởi chạy agent.

---

### A0 – Tích hợp & Điều phối

**Đầu vào:** các nhánh `main`, `trung_ba`, `manh/c1-qus`, `htrung-c4-kho-tai-lieu`.

**Các bước (đợt 0):**

1. Tạo nhánh `v2-base` từ `trung_ba`, vì đây là nhánh tích hợp theo [BA2][G6].
2. Gộp `manh/c1-qus`, rồi gộp `htrung-c4-kho-tai-lieu`. Giải xung đột ở `types.ts`, `db.ts`, `app.ts`, `service.ts`, `repo.ts` và `tests/api.test.ts`.
3. Loại thư mục trùng `QUS/` ở gốc repo, chỉ giữ bản trong `ba-copilot/shared` và `client/components`.
4. Chạy `npm install`, `npm test` và `npm run build`. Ghi kết quả vào `docs/agents/STATUS.md`.
5. Tạo thư mục `docs/agents/` gồm:
   - `STATUS.md`: bảng trạng thái các agent;
   - `OWNERSHIP.md`: bảng sở hữu tệp, chép từ mục 4.

**Các bước (đợt 2–4):** với mỗi nhánh agent:

1. Rebase lên `v2-contract`.
2. Chạy cổng kiểm tra (mục 5).
3. Gộp, rồi cập nhật `STATUS.md`.

Nếu xung đột chạm tệp thuộc agent khác thì không tự sửa mà trả lại agent sở hữu.

**Xong khi:** `v2-base` qua test và build. Mỗi đợt kết thúc với một nhánh xanh.

---

### A1 – Design System

**Đầu vào:** `client/styles.css`, `client/components/ui.tsx`, mục 4.3 trong tài liệu v2, ảnh chụp trong `docs/qus/screenshots/` (trước đây là `QUS/screenshots/`).

**Các bước:**

1. **Kiểm kê:** liệt kê màu, cỡ chữ, khoảng cách và bo góc đang dùng trong `styles.css`. Gom chúng thành biến CSS (`--color-*`, `--space-*`, `--radius-*`, `--font-*`) đặt ở `:root`, có thêm bản cho chế độ tối nếu app đang có.
2. **Thay giá trị cứng** trong `styles.css` bằng các biến vừa tạo. Không đổi giao diện hiện tại. So ảnh chụp trước và sau ở 5 màn có sẵn để kiểm tra.
3. **Bổ sung component dùng chung** vào `ui.tsx`. Các component hiện có (`Btn`, `Modal`, `Field`, `Badge`, `StatusBadge`, `Empty`) giữ nguyên API. Component mới:
   - `Drawer` (ngăn phải, cho SCR-04 và SCR-07);
   - `Tabs`;
   - `Select`, `MemberPicker` (chỉ phần khung, A3 nối dữ liệu);
   - `FileDrop` (vùng kéo thả);
   - `KanbanColumn` và `KanbanCard` (chỉ phần trình bày, có kéo thả bằng HTML5 DnD);
   - `ScoreBadge` (0–100 với 3 ngưỡng màu, cho QUS);
   - `IssueList` (danh sách lỗi theo mức error, warn, info);
   - `SuggestionCard` (tiêu đề, lý do, 2 nút);
   - `Toast` (nếu chưa có).
4. Viết `docs/design-system.md`: bảng token, ảnh hoặc mô tả từng component, quy tắc dùng (ví dụ: mọi hộp thoại dùng `Modal`, mọi panel phải dùng `Drawer`, trạng thái rỗng luôn dùng `Empty`).
5. Tạo `client/views/_Gallery.tsx`, một trang ẩn ở `#/_gallery` hiển thị mọi component, giúp A11 chụp hồi quy.

**Tệp sở hữu:** `client/styles.css`, `client/components/ui.tsx`, `client/views/_Gallery.tsx`, `docs/design-system.md`.

**Xong khi:**

- Build xanh.
- 5 màn cũ hiển thị không đổi.
- Trang Gallery có đủ các component mới.
- Mọi component có kiểu props rõ ràng (TypeScript).

---

### A2 – Nền tảng dữ liệu & hợp đồng

**Đầu vào:** `server/db.ts`, `shared/types.ts`, `server/app.ts`, `server/service.ts`, `client/main.tsx`, `client/views/ModuleView.tsx`, mục 5 trong tài liệu v2.

**Các bước:**

1. **ERD:** viết `docs/erd.md` bằng Mermaid `erDiagram`. Sơ đồ gồm 11 bảng cũ và các bảng mới (`members`, `files`, `uc_diagrams`, `tasks`, `task_events`, `suggestion_dismissals`, cột `qus_score`). Ghi rõ khoá ngoại và `ON DELETE`.
2. **Schema:**
   - Thêm các `CREATE TABLE IF NOT EXISTS` vào `db.ts`.
   - Thêm cột mới bằng hàm `migrate()` kiểu idempotent: kiểm tra `PRAGMA table_info`, thiếu cột nào thì `ALTER TABLE ADD COLUMN` cột đó.
   - Thêm index cho `tasks(project_id)`, `tasks(artifact_type, artifact_id)` và `files(module_id)`.
3. **Types:** khai báo trong `shared/types.ts` các kiểu `Member`, `TaskStatus`, `Task`, `TaskEvent`, `ArtifactRef`, `FileItem`, `UcDiagram`, `QusResult` (lấy lại từ `qus.ts`), `ScreenSuggestion`.
4. **Hợp đồng API:** viết `docs/api.md` liệt kê mọi endpoint mới, gồm method, path, body và kết quả trả về. Ví dụ: `GET/POST/PATCH/DELETE /api/members`, `/api/projects/:id/tasks`, `/api/modules/:id/diagram`, `/api/modules/:id/suggestions`, `POST /api/modules/:id/suggestions/:key/dismiss`.
5. **Registry route:**
   - Tách cơ chế `route()` trong `app.ts` thành `server/http.ts`, export hàm `route`.
   - Tạo `server/routes/index.ts` import các tệp `server/routes/{members,files,diagram,tasks,qus,suggest}.ts`. Mỗi tệp ban đầu là stub trả lỗi 501.
   - `app.ts` chỉ import `routes/index.ts`.
6. **Event bus:**
   - Tạo `server/events.ts` với `emit(event)` và `on(type, handler)`. Đây là bộ phát sự kiện đồng bộ, chạy trong cùng transaction.
   - Danh sách sự kiện: `artifact.drafted`, `artifact.approved`, `artifact.unapproved`, `artifact.stale`. Payload có dạng `{ type, artifact: { kind: 'screen'|'docs'|'diagram'|'tests', id, moduleId }, actorId? }`.
   - Chèn lệnh `emit` vào các điểm đã có trong `service.ts`: tạo hoặc sửa màn (drafted), `setScreenApproval`, `approveDocs`, và chỗ đánh dấu Lỗi thời theo BR-02.
7. **Registry giao diện:**
   - Tạo `client/views/moduleTabs.ts` (mảng `{ key, label, component }`); `ModuleView.tsx` dựng tab từ mảng này.
   - Tạo `client/routes.ts` cho các trang cấp dự án (Công việc, Kho tài liệu, Thành viên); `main.tsx` đọc từ tệp này.
   - Thêm vào `api.ts` các hàm gọi API mới dưới dạng stub có đúng kiểu.
8. **Bộ test hợp đồng** `tests/contract.test.ts`:
   - schema được tạo đủ trên `:memory:`;
   - gọi `migrate()` 2 lần không lỗi;
   - `emit` gọi đúng handler;
   - các route stub trả 501.

**Tệp sở hữu:** `server/db.ts`, `server/http.ts`, `server/app.ts`, `server/events.ts`, `server/routes/index.ts`, `shared/types.ts`, `client/main.tsx`, `client/routes.ts`, `client/views/moduleTabs.ts`, `client/views/ModuleView.tsx` (phần khung tab), `docs/erd.md`, `docs/api.md`.

**Xong khi:**

- Test cũ và mới đều xanh.
- App chạy như trước.
- `docs/api.md` và `docs/erd.md` đã được A0 duyệt. Từ lúc này hợp đồng **bị khoá**: muốn đổi phải mở yêu cầu với A0.

---

### A3 – Thành viên & thanh trên

**Các bước:**

1. Viết `server/routes/members.ts` và các hàm repo trong `server/repo/members.ts` (CRUD, không cho xoá người đang là assignee của task mở; trường hợp này trả lỗi 409).
2. Viết `client/views/MembersView.tsx` (SCR-01): bảng thành viên và `Modal` thêm/sửa (tên, vai trò BA hoặc BA Lead).
3. Viết `client/components/TopBar.tsx` (SCR-02): ô "Tôi là…" dùng `MemberPicker`, lưu vào `localStorage` khoá `bacopilot.me` (bọc try/catch), cùng menu Công việc, Kho tài liệu, Thành viên.
4. Tạo hook `useCurrentMember()` trong `client/currentMember.ts`. Các agent khác dùng hook này.
5. FN-03: gửi `actorId` vào API tạo bình luận và tạo phiên bản. Hiển thị tên tác giả cạnh ghim bình luận và trong danh sách phiên bản. Chỉ sửa đúng 2 chỗ hiển thị đó trong `DesignTab.tsx`.
6. Viết `tests/members.test.ts`.

**Tệp sở hữu:** `server/routes/members.ts`, `server/repo/members.ts`, `client/views/MembersView.tsx`, `client/components/TopBar.tsx`, `client/currentMember.ts`, `tests/members.test.ts`.

**Xong khi:** đạt FN-01, FN-02 và FN-03 (nếu kịp). Tải lại trang vẫn nhớ người đã chọn.

---

### A4 – Kho tài liệu

**Đầu vào:** code trên nhánh `htrung-c4-kho-tai-lieu` (`server/files.ts`, `FilesTab.tsx`, `tests/files.test.ts`).

**Các bước:**

1. Chuyển route sang `server/routes/files.ts`. Tệp lưu ở thư mục `DATA_DIR/files` trên máy chủ (đúng như đã chốt). Giới hạn kích thước và loại tệp: Word, PDF, Excel, ảnh.
2. SCR-03: tách `FilesTab.tsx` thành `FilesView.tsx` (trang cấp dự án) gồm `FileDrop` nhiều tệp, bảng tệp xếp theo module, form nguồn (stakeholder gửi, ngày nhận, ghi chú), đổi tên và xoá có xác nhận.
3. SCR-04: `FileDrawer.tsx` dùng `Drawer`. Xem trước PDF bằng `<iframe>`, ảnh bằng `<img>`, các loại khác hiển thị "Tải về để xem". Có nút tải về.
4. FN-08 (nếu kịp): ô tìm theo tên và lọc theo module.
5. Bổ sung `tests/files.test.ts`: chặn đường dẫn `../`, chặn sai loại tệp, đổi tên, xoá thì xoá luôn tệp vật lý.

**Tệp sở hữu:** `server/files.ts`, `server/routes/files.ts`, `client/views/FilesView.tsx`, `client/views/FileDrawer.tsx`, `tests/files.test.ts`.

**Xong khi:** đạt FN-04 → FN-07, FN-09 và FN-10. Tải lên 3 tệp cùng lúc không lỗi.

---

### A5 – Sơ đồ UC

**Các bước:**

1. Viết `shared/ucDiagram.ts`, hàm thuần `buildUcMermaid(useCases, actors)` trả mã Mermaid dạng flowchart mô phỏng UC diagram: actor là hình tròn, UC là hình bầu dục, có cạnh «include»/«extend». Đây cũng là **bản Mock** chạy không cần khoá API.
2. Thêm pipeline AI `generateUcDiagram` vào `server/ai/pipelines.ts` và nhánh mock vào `server/ai/mock.ts` (dùng lại `buildUcMermaid`). Ghi vào nhật ký AI như các pipeline khác.
3. Viết `server/routes/diagram.ts`:
   - `POST generate`;
   - `PUT` lưu mã (đặt về `draft`, phát `artifact.drafted`);
   - `POST approve/unapprove` (phát `artifact.approved` hoặc `artifact.unapproved`).
4. FN-14 (nếu kịp): đăng ký handler cho sự kiện thay đổi UC. Khi `generateDocs` hay `refineDoc` làm thay đổi `use_cases` thì đặt sơ đồ thành `stale` và phát `artifact.stale`.
5. Viết `client/views/DiagramTab.tsx` (SCR-05) và đăng ký vào `moduleTabs.ts`. Giao diện chia 2 cột: trình soạn mã bên trái, bản xem trước bên phải (dùng `Mermaid.tsx` có sẵn, chờ 400 ms sau lần gõ cuối mới vẽ lại). Có huy hiệu trạng thái và nút Duyệt hoặc Bỏ duyệt.
6. Viết `tests/ucDiagram.test.ts`.

**Tệp sở hữu:** `shared/ucDiagram.ts`, `server/routes/diagram.ts`, `client/views/DiagramTab.tsx`, `tests/ucDiagram.test.ts`, cùng phần thêm vào `pipelines.ts` và `mock.ts` (chỉ thêm, không sửa code cũ).

**Xong khi:** đạt FN-11 → FN-13. Ở chế độ Mock vẫn sinh được sơ đồ hợp lệ, Mermaid vẽ không lỗi.

---

### A6 – Công việc Kanban

**Các bước:**

1. Viết `server/routes/tasks.ts` và `server/repo/tasks.ts`:
   - CRUD task;
   - `PATCH status` (ghi `task_events` với `by_member_id`);
   - `GET /api/projects/:id/artifacts` trả danh sách sản phẩm để gắn vào task: màn hình, bộ tài liệu của module, sơ đồ UC và bộ test.
2. SCR-06 `TasksView.tsx`: 4 cột Cần làm, Đang làm, Xong, Cần làm lại, dùng `KanbanColumn`. Kéo thả giữa các cột sẽ gọi API, nếu lỗi thì quay về vị trí cũ. Có lọc theo người làm và theo module.
3. SCR-07 `TaskDialog.tsx`: các trường tiêu đề, mô tả, người làm (`MemberPicker`), hạn, ưu tiên và sản phẩm gắn kèm.
4. FN-19 (nếu kịp): component `RelatedTasks.tsx` để hiển thị task liên quan. A6 viết component nhưng **không tự chèn** vào DesignTab hay DocsTab, mà báo A0 chèn khi gộp.
5. Viết `tests/tasks.test.ts`.

**Tệp sở hữu:** `server/routes/tasks.ts`, `server/repo/tasks.ts`, `client/views/TasksView.tsx`, `client/views/TaskDialog.tsx`, `client/components/RelatedTasks.tsx`, `tests/tasks.test.ts`.

**Xong khi:** đạt FN-15 → FN-18. Kéo thẻ rồi tải lại trang thì thẻ vẫn ở đúng cột.

---

### A7 – Tự cập nhật trạng thái task

**Các bước:**

1. Viết `shared/taskRules.ts`, hàm thuần `nextStatus(current, event) → TaskStatus | null`, với các quy tắc:
   - `drafted` khi task đang Cần làm hoặc Cần làm lại thì chuyển sang Đang làm (FN-20);
   - `approved` thì chuyển sang Xong (FN-21);
   - `unapproved` hoặc `stale` khi task đang Xong thì chuyển sang Cần làm lại (FN-22);
   - các trường hợp khác giữ nguyên.
2. Viết `server/taskAutomation.ts` để đăng ký handler với `events.ts`: tìm các task có `artifact_type/artifact_id` khớp, cập nhật trạng thái và ghi `task_events` với `by_system=1` cùng lý do (FN-23).
3. Ánh xạ sản phẩm:
   - `docs`: gắn theo module;
   - `tests`: gắn theo module;
   - `diagram`: gắn theo module;
   - `screen`: gắn theo screen id.

   Khi BR-02 đánh dấu tài liệu và test của module thành Lỗi thời, các task gắn với docs và tests của module đó chuyển sang Cần làm lại.
4. Viết `tests/taskRules.test.ts` (bảng quyết định đủ 4×4 trạng thái × sự kiện) và `tests/taskAutomation.test.ts` (tích hợp: tạo task gắn màn, duyệt màn thì task sang Xong, sửa màn thì task tài liệu sang Cần làm lại).

**Tệp sở hữu:** `shared/taskRules.ts`, `server/taskAutomation.ts`, và 2 tệp test kể trên.

**Xong khi:** chạy được nguyên luồng demo của bản 4 ngày ở mức API.

---

### A8 – Chất lượng yêu cầu (QUS)

**Đầu vào:** `shared/qus.ts`, `client/components/QusPanel.tsx`, `tests/qus.test.ts` từ nhánh `manh/c1-qus`, cùng các giả định G1–G4 trong tài liệu v2.

**Các bước:**

1. Đối chiếu `qus.ts` với FN-51/52 và G1–G4:
   - DUPLICATE: so trong cùng module, Jaccard ≥ 0,8;
   - NOT_UNIFORM: lệch khuôn mẫu đa số, mức *info*, bỏ qua khi chỉ có 1 story;
   - ngưỡng xếp hạng Tốt/Khá/Cần sửa.

   Sửa nếu lệch và giữ nguyên các hằng số `PENALTY_*`.
2. Bổ sung `tests/qus.test.ts` cho đủ tiêu chí ở mục 3.4 của tài liệu v2.
3. Làm lại `QusPanel.tsx` (SCR-15) bằng `ScoreBadge` và `IssueList` của A1. Chấm ngay trên trình duyệt (`qus.ts` nằm trong `shared/` nên chạy được ở client), chờ 300 ms sau lần gõ cuối. Mỗi story có thể bung ra hoặc thu lại. Có trạng thái rỗng.
4. Gắn panel vào popup Tạo module (`ProjectView.tsx`, FN-53) và popup Sửa yêu cầu (`ModuleView.tsx`, FN-54). Chỉ sửa trong khối `<Modal>` của 2 popup đó.
5. FN-56 (nếu kịp):
   - khi lưu yêu cầu, server tính lại điểm bằng chính `scoreStories` và lưu vào `modules.qus_score`;
   - hiển thị `ScoreBadge` ở danh sách module.
6. Viết `server/routes/qus.ts`, chỉ cần nếu làm FN-56: `GET /api/modules/:id/qus`.

**Tệp sở hữu:** `shared/qus.ts`, `client/components/QusPanel.tsx`, `server/routes/qus.ts`, `tests/qus.test.ts`, khối Modal trong `ProjectView.tsx` và `ModuleView.tsx`.

**Xong khi:** đạt FN-50 → FN-55. Gõ 5 story mẫu thì điểm khớp với tính tay. Lưu module khi điểm thấp vẫn thành công (BR-05).

---

### A9 – Gợi ý màn tiếp theo

**Các bước:**

1. Viết `shared/suggest.ts`, hàm thuần:

   ```
   suggestNextScreens({ model: DesignModel, requirements: Requirement[],
                        stories: string[], dismissed: string[] }) → ScreenSuggestion[]
   ```

   - **Link gãy (FN-58):** duyệt `ActionSpec` có đích điều hướng mà đích không khớp màn nào. Tên màn đề xuất lấy từ nhãn nút. Khoá gợi ý là `link:<screenId>:<nodeId>`.
   - **Yêu cầu chưa phủ (FN-57):** với mỗi FR, hoặc mỗi story nếu chưa có FR (BR-07), chuẩn hoá thành từ khoá (bỏ dấu, bỏ stop-word), khớp với tên màn, field và action trong `extractModel`. Nếu không khớp màn nào thì tạo gợi ý. Khoá gợi ý là `fr:<code>` hoặc `story:<hash>`.
   - **Prompt điền sẵn (FN-60):** ghép tên màn, nội dung FR hoặc story, và màn nguồn (nếu là link gãy).
   - Thứ tự: link gãy trước, FR chưa phủ sau. Loại các khoá có trong `dismissed`.
2. Viết `tests/suggest.test.ts` gồm 5 ca (a) → (e) ở mục 3.4.
3. Viết `server/routes/suggest.ts`:
   - `GET /api/modules/:id/suggestions` (lấy dữ liệu, gọi hàm thuần);
   - `POST /dismiss` và `DELETE /dismiss` (FN-61).
4. Viết `client/components/SuggestionsPanel.tsx` (SCR-16) bằng `SuggestionCard`. Bấm **Tạo** thì mở hộp thoại "Màn hình mới" có sẵn trong `DesignTab.tsx` với tên và prompt điền trước.

   Chỉ sửa `DesignTab.tsx` ở hai chỗ: chèn panel vào cột trái, và cho hộp thoại tạo màn nhận `initialName`/`initialPrompt`. Sau khi tạo màn hoặc duyệt thì tải lại danh sách gợi ý.

**Tệp sở hữu:** `shared/suggest.ts`, `server/routes/suggest.ts`, `client/components/SuggestionsPanel.tsx`, `tests/suggest.test.ts`, và 2 điểm chèn trong `DesignTab.tsx`.

**Xong khi:** đạt FN-57 → FN-60. Kịch bản kiểm tra: tạo màn Đăng nhập có nút "Quên mật khẩu?" thì xuất hiện gợi ý tương ứng. Bấm Tạo thì prompt đã điền sẵn. Tạo xong thì gợi ý biến mất.

---

### A10 – Dữ liệu demo

**Các bước:** mở rộng `scripts/seed.ts` để tạo:

- 5 thành viên (1 BA Lead);
- 1 dự án, 2 module;
- user story có cả story tốt lẫn story lỗi để demo QUS;
- 3 màn đã duyệt và 1 màn nháp có link gãy để demo gợi ý;
- 4 tệp mẫu trong kho;
- 1 sơ đồ UC;
- 8 task đủ 4 cột.

Seed phải chạy lại được nhiều lần mà không nhân đôi dữ liệu.

**Xong khi:** chạy `npm run seed` rồi mở app thì thấy đủ dữ liệu cho luồng demo.

---

### A11 – Kiểm thử E2E & QA

**Các bước:**

1. Viết `e2e/demo-flow.mjs` (Playwright) theo luồng demo:
   1. Tạo task "Vẽ UC diagram".
   2. AI sinh sơ đồ, task chuyển sang Đang làm.
   3. BA Lead duyệt, task chuyển sang Xong.
   4. Sửa một màn đã duyệt, task tài liệu chuyển sang Cần làm lại.
2. Thêm 2 luồng mới:
   - QUS: gõ story lỗi, thấy điểm dưới 60 kèm danh sách lỗi.
   - Gợi ý: bấm Tạo, màn mới xuất hiện.
3. Chụp màn hình các trang chính và trang `_gallery` ở độ rộng 1280 px và 375 px. Đối chiếu bằng mắt với `docs/design-system.md`.
4. Chạy `npm test` toàn bộ. Lập `docs/agents/QA_REPORT.md` liệt kê lỗi, mỗi lỗi ghi **agent sở hữu tệp**, mức độ và cách tái hiện.

**Xong khi:** E2E xanh trên bản build, không còn lỗi mức cao.

---

### A12 – Tài liệu & Triển khai

**Các bước:**

1. Cập nhật `README.md`: bảng quy tắc BR-01 → BR-08, cách dùng các phân hệ mới, kiến trúc (thêm `routes/`, `events.ts`, `suggest.ts`, `qus.ts`).
2. Viết mục **Tools (T1)** khoảng 1 trang trong `docs/T1_Tools.md`: lý do chọn công cụ, workflow nhiều agent của tài liệu này, khả năng mở rộng.
3. Chạy `npm run bundle` rồi deploy Railway theo `DEPLOY.md`. Thêm volume `/data` cho cả thư mục tệp của kho. Đặt `APP_PASSWORD` rồi gửi link demo.

**Xong khi:** link demo mở được sau khi nhập mật khẩu, và chạy đủ luồng demo trên đó.

---

### Mẫu prompt khởi chạy agent (dùng cho A1 → A12)

```
Bạn là Agent <Mã> – <Tên> trong dự án BA Copilot v2.
Thư mục code: ba-copilot-source/ba-copilot. Nhánh nền: v2-contract.
Đọc trước: docs/BA_Copilot_v2_UC_FN_SCR.md, docs/agents/OWNERSHIP.md,
           docs/api.md, docs/erd.md, docs/design-system.md.
Phạm vi: <danh sách FN/SCR>.
Chỉ được tạo/sửa các tệp: <danh sách tệp sở hữu>. Muốn sửa tệp khác → dừng và ghi
yêu cầu vào docs/agents/REQUESTS.md, không tự sửa.
Không đổi chữ ký hàm/endpoint trong docs/api.md.
Làm theo các bước: <các bước của agent>.
Xong khi: <tiêu chí>. Trước khi kết thúc chạy `npm test` và `npm run build`,
dán kết quả vào docs/agents/STATUS.md dòng <Mã>, rồi commit trên nhánh agent/<mã>-<tên>.
Báo cáo cuối: tệp đã đổi, FN đã đạt, FN chưa đạt và lý do, điểm cần A0 chèn khi gộp.
```

## 5. Cổng kiểm tra trước khi gộp (A0 áp dụng)

| # | Kiểm tra | Lệnh / cách làm |
|---|---|---|
| 1 | Test đơn vị và hợp đồng xanh | `npm test` |
| 2 | Build giao diện xanh | `npm run build` |
| 3 | Chỉ sửa tệp được sở hữu | `git diff --name-only v2-contract...agent/<mã>` đối chiếu với `OWNERSHIP.md` |
| 4 | Không đổi hợp đồng | So `shared/types.ts` và `docs/api.md` với bản đã khoá |
| 5 | Chế độ Mock vẫn chạy | Bỏ `ANTHROPIC_API_KEY`, mở luồng chính của agent |
| 6 | FN trong phạm vi đạt | Tick theo mục "Xong khi" |

## 6. Bảng điểm nóng xung đột và cách tránh

| Tệp | Ai chạm | Cách tránh |
|---|---|---|
| `server/app.ts` | Mọi agent backend | A2 tách thành `routes/*.ts`. Agent tính năng chỉ sửa tệp route của mình |
| `shared/types.ts`, `server/db.ts` | Mọi agent | A2 viết sẵn toàn bộ ở đợt 1, sau đó khoá |
| `client/views/ModuleView.tsx` | A5 (tab), A8 (popup) | A2 làm registry tab. A8 chỉ sửa khối Modal |
| `client/views/DesignTab.tsx` | A3, A6, A9 | Mỗi agent tối đa 2 điểm chèn đã ghi rõ. A6 giao component để A0 chèn. Gộp A9 cuối cùng |
| `server/ai/mock.ts`, `pipelines.ts` | A5 | Chỉ thêm hàm mới ở cuối tệp |
| `server/service.ts` | A2 (chèn `emit`), A8 (FN-56) | A2 chèn `emit` ở đợt 1. A8 chỉ thêm một lệnh gọi tính điểm trong hàm cập nhật module |

## 7. Ước lượng

| Đợt | Agent | Thời gian (agent chạy) | Ghi chú |
|---|---|---|---|
| 0 | A0 | ngắn | Chủ yếu là giải xung đột gộp |
| 1 | A1 ∥ A2 | trung bình | A2 là đường găng: chưa xong thì đợt 2 chưa bắt đầu được |
| 2 | 7 agent song song | dài nhất | A6 và A9 nặng nhất. A8 và A4 nhẹ vì đã có code |
| 3 | A10 → A11 | trung bình | Lỗi trả về agent sở hữu tệp, sửa xong chạy lại A11 |
| 4 | A0 → A12 | ngắn | |
