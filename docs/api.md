# Hợp đồng API – BA Copilot v2

Người viết: **A2**. Trạng thái: **chờ A0 duyệt**. Sau khi duyệt, tài liệu này **bị khoá**: không đổi method, path, tên trường hay kiểu trả về. Muốn đổi phải mở yêu cầu với A0 (`docs/agents/REQUESTS.md`).

Kiểu dữ liệu (`Member`, `Task`, …) khai báo trong `shared/types.ts`. Hàm gọi phía client có sẵn trong `client/api.ts` (cột *Client*). Bảng và cột: `docs/erd.md`.

## 0. Quy ước chung

| Mục | Quy ước |
|---|---|
| Định dạng | JSON (`content-type: application/json`). Tải tệp trả nhị phân với `content-disposition`. `content-disposition` là `inline` (xem trước, vd `/preview`) hoặc `attachment` (tải về, mặc định), kèm `filename="..."` ASCII đã bỏ dấu và `filename*=UTF-8''...` giữ tên gốc; phản hồi tệp có `x-content-type-options: nosniff`. |
| Lỗi | `{ "error": "<thông báo tiếng Việt>" }` với mã: `400` dữ liệu sai, `401` chưa đăng nhập, `404` không tìm thấy, `409` xung đột nghiệp vụ, `413` quá lớn, `501` **chưa triển khai** (stub), `502` lỗi AI. |
| Người thao tác | Mọi `POST/PUT/PATCH/DELETE` nhận thêm trường tuỳ chọn `actorId` (mã `Member`, lấy từ `useCurrentMember()` của A3). Không có thì coi là ẩn danh. Server chuyển `actorId` vào sự kiện (mục 8). |
| Ngày | Thời điểm: ISO 8601 (`createdAt`, `updatedAt`). Ngày thuần: `YYYY-MM-DD` (`dueDate`, `receivedAt`). |
| Tham số đường dẫn | Phải mã hoá bằng `encodeURIComponent` (vd khoá gợi ý `fr:FR-04` → `fr%3AFR-04`). |
| Đăng ký route | Mỗi phân hệ một tệp `server/routes/<tên>.ts`, đã import sẵn trong `server/routes/index.ts`. Endpoint chưa làm dùng `notImplemented("FN-xx")` và trả `501`. |

## 1. Thành viên – `server/routes/members.ts` (A3, FN-01 → FN-03)

| Method | Path | Body | Trả về | Client |
|---|---|---|---|---|
| GET | `/api/members` | – | `Member[]` (xếp theo tên) | `listMembers()` |
| POST | `/api/members` | `{ name: string, role: "BA" \| "BA_LEAD" }` | `Member` | `createMember(b)` |
| PATCH | `/api/members/:id` | `{ name?, role? }` | `Member` | `updateMember(id, b)` |
| DELETE | `/api/members/:id` | – | `{ ok: true }` · `409` nếu đang là người làm của task chưa Xong | `deleteMember(id)` |

Lỗi: `name` rỗng → `400`; `role` ngoài 2 giá trị → `400`.

**Bổ sung vào endpoint cũ (FN-03, không đổi hành vi cũ):** `POST /api/screens/:id/annotations`, `POST /api/modules/:id/screens`, `POST /api/screens/:id/edit`, `/revert`, `/layout/accept`, `/manual` nhận thêm `actorId?`. A3 lưu `author_id` và tên (`author`) vào `annotations`/`screen_versions`; `Annotation.authorId`, `ScreenVersion.author`, `ScreenVersion.authorId` trả về trong các API đọc màn và phiên bản.

## 2. Kho tài liệu – `server/routes/files.ts` (A4, FN-04 → FN-10)

| Method | Path | Body / query | Trả về | Client | Hiện trạng |
|---|---|---|---|---|---|
| GET | `/api/projects/:id/files` | query `moduleId?`, `q?` (tìm theo tên, FN-08) | `FileItem[]` (mới nhất trước) | `listFiles(pid, q)` | Đã chạy (chưa lọc theo query) |
| POST | `/api/projects/:id/files` | `{ name, contentBase64, moduleId?, sender?, receivedAt?, note?, actorId? }` | `FileItem` | `uploadFile(pid, b)` | Đã chạy (chưa lưu `sender/receivedAt/note/uploadedBy`) |
| GET | `/api/files/:id` | – | `FileItem` | `getFileItem(id)` | **501** |
| PATCH | `/api/files/:id` | `{ name?, moduleId?, sender?, receivedAt?, note? }` | `FileItem` | `updateFile(id, b)` | **501** |
| GET | `/api/files/:id/preview` | – | Nội dung tệp, `content-disposition: inline` (PDF, ảnh) · `415` với loại không xem trước được | `filePreviewUrl(id)` | **501** |
| GET | `/api/files/:id/download` | – | Nội dung tệp, `attachment` | `fileDownloadUrl(id)` | Đã chạy |
| DELETE | `/api/files/:id` | – | `{ ok: true }` (xoá cả tệp vật lý) | `deleteFile(id)` | Đã chạy |

Tải lên nhiều tệp (FN-04) = gọi `POST` nhiều lần. Giới hạn body upload hiện là 15 MB (`readBody` trong `app.ts`). Loại tệp không cho phép → `400`.

## 3. Sơ đồ UC – `server/routes/diagram.ts` (A5, FN-11 → FN-14)

| Method | Path | Body | Trả về | Client | Sự kiện |
|---|---|---|---|---|---|
| GET | `/api/modules/:id/diagram` | – | `UcDiagram \| null` (null = chưa sinh) | `getDiagram(mid)` | – |
| POST | `/api/modules/:id/diagram/generate` | `{ actorId? }` | `UcDiagram` (status `draft`) | `generateDiagram(mid)` | `artifact.drafted` (+ `artifact.unapproved` nếu trước đó Đã duyệt) |
| PUT | `/api/modules/:id/diagram` | `{ code: string, actorId? }` | `UcDiagram` (status `draft`) | `saveDiagram(mid, code)` | như trên |
| POST | `/api/modules/:id/diagram/approve` | `{ approved: boolean, actorId? }` (mặc định `true`, giống duyệt màn và duyệt tài liệu) | `UcDiagram` | `approveDiagram(mid, ok)` | `artifact.approved` / `artifact.unapproved` |

Lỗi: module chưa có UC (chưa sinh tài liệu) khi `generate` → `400`; `approve` khi chưa có sơ đồ → `400`. FN-14: khi UC đổi (nghe `artifact.drafted` với `kind: "docs"`), sơ đồ đang `approved`/`draft` → `stale` và phát `artifact.stale` `kind: "diagram"`.

## 4. Công việc – `server/routes/tasks.ts` (A6, FN-15 → FN-19)

| Method | Path | Body / query | Trả về | Client |
|---|---|---|---|---|
| GET | `/api/projects/:id/tasks` | query `assigneeId?`, `moduleId?` | `Task[]` | `listTasks(pid, q)` |
| POST | `/api/projects/:id/tasks` | `TaskInput & { status?, actorId? }` | `Task` (ghi 1 `TaskEvent` với `fromStatus: null`) | `createTask(pid, b)` |
| GET | `/api/tasks/:id` | – | `TaskDetail` (= `Task` + `events: TaskEvent[]`, cũ trước) | `getTask(id)` |
| PATCH | `/api/tasks/:id` | `Partial<TaskInput>` – **không** nhận `status` | `Task` | `updateTask(id, b)` |
| PATCH | `/api/tasks/:id/status` | `{ status: TaskStatus, actorId? }` | `Task` (ghi `TaskEvent` `bySystem: false`, `byMemberId: actorId`) | `setTaskStatus(id, st)` |
| DELETE | `/api/tasks/:id` | – | `{ ok: true }` | `deleteTask(id)` |
| GET | `/api/projects/:id/artifacts` | – | `ArtifactOption[]`: mỗi màn, và mỗi module có `docs`, `tests`, `diagram` | `listArtifacts(pid)` |
| GET | `/api/artifacts/:kind/:id/tasks` | – | `Task[]` gắn với sản phẩm (FN-19, `RelatedTasks`) | `listArtifactTasks(kind, id)` |

`TaskInput = { title, description?, moduleId?, assigneeId?, dueDate?, priority?, artifactType?, artifactId? }`.

Quy tắc: `title` rỗng → `400`; `artifactType` và `artifactId` phải cùng có hoặc cùng trống; với `docs/tests/diagram` thì `artifactId` = `moduleId`; `moduleId` phải thuộc dự án → `400`; `status` ngoài `todo|doing|done|redo` → `400`. Đổi trạng thái tự động (FN-20 → FN-23) do A7 làm trong `server/taskAutomation.ts`, ghi `TaskEvent` với `bySystem: true` và `reason`.

## 5. Chất lượng yêu cầu – `server/routes/qus.ts` (A8, FN-56)

| Method | Path | Body | Trả về | Client |
|---|---|---|---|---|
| GET | `/api/modules/:id/qus` | – | `ModuleQus = { moduleId, score: number \| null, checkedAt: string \| null, result: QusResult }` | `getModuleQus(mid)` |

`score`/`checkedAt` là giá trị đã lưu ở `modules.qus_score/qus_checked_at` (cập nhật khi `PATCH /api/modules/:id` đổi `requirementInput`); `result` chấm lại bằng `scoreStories()` trên nội dung hiện tại. **Bổ sung vào endpoint cũ:** `GET /api/projects/:id` trả `modules[].qusScore` (FN-56). Điểm không chặn lưu (BR-05).

## 6. Gợi ý màn tiếp theo – `server/routes/suggest.ts` (A9, FN-57 → FN-61)

| Method | Path | Body | Trả về | Client |
|---|---|---|---|---|
| GET | `/api/modules/:id/suggestions` | – | `ScreenSuggestions = { items: ScreenSuggestion[], dismissed: ScreenSuggestion[] }` | `getScreenSuggestions(mid)` |
| POST | `/api/modules/:id/suggestions/:key/dismiss` | – | `{ ok: true }` (lặp lại không lỗi) | `dismissSuggestion(mid, key)` |
| DELETE | `/api/modules/:id/suggestions/:key/dismiss` | – | `{ ok: true }` (khôi phục) | `restoreSuggestion(mid, key)` |

`items` xếp: link gãy trước, FR/story chưa phủ sau. `key`: `link:<screenId>:<nodeId>`, `fr:<code>`, `story:<hash>`. Không endpoint nào tạo màn (BR-06): nút **Tạo** chỉ mở hộp thoại rồi gọi `POST /api/modules/:id/screens` như cũ. Không trùng với `POST /api/screens/:id/suggestions` (gợi ý bố cục ML, giữ nguyên).

## 7. Endpoint cũ

Giữ nguyên method, path, body và kết quả như bản 4 ngày (`server/app.ts`). Chỉ có hai loại bổ sung, đều tương thích ngược: trường tuỳ chọn `actorId` trong body (mục 0) và trường mới trong kết quả (`qusScore`, `authorId`, `author`). Bốn route Kho tài liệu đã chuyển từ `app.ts` sang `server/routes/files.ts`, không đổi hành vi.

## 8. Sự kiện – `server/events.ts`

Bộ phát đồng bộ: `on(type, handler) → huỷ đăng ký`, `emit(event)`. Service bọc thao tác ghi và `emit` trong `tx()`, nên handler chạy **chung transaction**; handler ném lỗi thì thao tác bị huỷ và API trả lỗi. `tx()` lồng được, handler gọi repo có `tx()` bên trong vẫn chạy.

```ts
type ArtifactEventType = "artifact.drafted" | "artifact.approved" | "artifact.unapproved" | "artifact.stale";
interface ArtifactEvent {
  type: ArtifactEventType;
  artifact: { kind: "screen" | "docs" | "diagram" | "tests"; id: string; moduleId: string }; // docs/tests/diagram: id = moduleId
  actorId?: string;
}
```

Điểm phát đã có (A2 chèn trong `server/service.ts`):

| Thao tác | Sự kiện |
|---|---|
| Tạo màn từ prompt | `drafted` screen |
| Sửa màn bằng prompt, khôi phục phiên bản, chấp nhận gợi ý bố cục, sửa tay | `drafted` screen; nếu màn đang Đã duyệt thêm `unapproved` screen và BR-02 |
| Duyệt / bỏ duyệt màn | `approved` / `unapproved` screen; bỏ duyệt thêm BR-02 |
| BR-02 (tài liệu, test thành Lỗi thời) | `stale` docs và/hoặc `stale` tests, chỉ phần đang ở Nháp hoặc Đã duyệt |
| Sinh tài liệu, chỉnh tài liệu bằng prompt | `drafted` docs (+ `unapproved` docs nếu đang Đã duyệt, + `stale` tests nếu test đang Nháp/Đã duyệt) |
| Duyệt / bỏ duyệt tài liệu | `approved` / `unapproved` docs |
| Sinh test case | `drafted` tests |

Điểm phát do agent khác thêm: sơ đồ UC (A5, mục 3).

---

# Đợt 5 – hợp đồng mới (C2)

Người viết: **C2**. Kế hoạch: `docs/Ke_hoach_Agent_BA_Copilot_v2_dot5.md`. Kiểu dữ liệu: `shared/types.ts` (khối "Đợt 5"). Bảng: `docs/erd.md` mục 8. Sau khi C0 gộp đợt 1, phần này **khoá** như các mục trên. Các mục 0–8 ở trên vẫn đúng, trừ những gì ghi đè dưới đây.

## 5.0 Quy ước bổ sung

| Mục | Quy ước |
|---|---|
| Lỗi có mã | Body lỗi có thêm `code` khi máy cần phân biệt: `409 { error: "Bản đã thay đổi – tải lại", code: "CONFLICT", rev }`, `401 { error, code: "UNAUTHENTICATED", mode: "app" \| "member" }`, `403 { error, code: "FORBIDDEN" }`. 409 **không** có `code` là xung đột nghiệp vụ cũ (vd xoá thành viên đang giữ task). Client: `ApiError.code`, `isConflict(e)`. |
| Chặn đè (`rev`) | Mọi bản ghi sản phẩm (màn, story, tài liệu, sơ đồ, bộ test) có `rev`: bắt đầu `1`, **+1 mỗi lần ghi nội dung** (đổi trạng thái Xong/Duyệt không tăng). Chưa có bản ghi = `rev 0`. API ghi nhận `baseRev` (rev client đang sửa) trong body; server gọi `assertRev(rev hiện tại, baseRevOf(body))` (`server/http.ts`) **trước** khi ghi, rồi tăng rev (`bumpRev` trong `server/db.ts` hoặc `rev = rev + 1` trong SQL) và ghi `updated_by` = actor, `updated_at`. **Thiếu `baseRev` thì cho qua** (client cũ). |
| Sửa sản phẩm đã Xong/Đã duyệt | Về Đang làm (`draft`), phát `artifact.drafted` – việc của chủ từng loại sản phẩm (C4–C7, C9) theo `docs/Ke_hoach…dot5.md` mục 1. |
| Chế độ đăng nhập | **demo**: chưa thành viên nào có mật khẩu → mọi API chạy như trước, người thao tác = `actorId` client gửi. **member**: có ≥ 1 mật khẩu → mọi API (trừ `/api/login`, `/api/logout`, `/api/me`, `/api/settings`) cần phiên thành viên (cookie `bac_member`, HttpOnly, 30 ngày), thiếu → `401 mode "member"` (client chuyển `#/login`). Cổng `APP_PASSWORD` cũ giữ nguyên; phiên thành viên hợp lệ cũng qua cổng đó. |
| Người thao tác | Chế độ member: server **ghi đè** `body.actorId` bằng mã trong phiên trước khi gọi handler → mọi chỗ `actor(body)` cũ tự đúng, client không giả mạo được. Handler mới dùng `requireMember(ctx)` / `requireLead(ctx)` (trả `Member \| null`). |
| Quyền | `requireMember`: member → phải đăng nhập (401); demo → luôn qua. `requireLead`: member → phải vai `BA_LEAD` (403 `FORBIDDEN`); demo → chặn 403 nếu `actorId` là BA, không rõ người thì cho qua. |
| `ArtifactRef` | `{ kind: "screen" \| "doc" \| "diagram" \| "tests", id, moduleId, sub? }`. screen: id = screenId. doc: id = moduleId, `sub` = `DocKind` (bắt buộc). diagram: id = moduleId, `sub` = `DiagramKind` (thiếu = `UC`). tests: id = moduleId. Trong URL `/api/artifacts/:kind/:id/...` thì `sub` đi ở query (GET) hoặc body (POST). `"docs"` (bộ tài liệu cũ) chỉ còn cho mã v2. |
| `DocKind` | `BRD`, `UC_SPEC`, `SRS`, `FRD_NFR`, `API_SPEC` (đúng thứ tự bước; nhãn `DOC_KIND_LABEL`). Viết nguyên chữ hoa trong URL. |
| `DiagramKind` | `CONTEXT`, `UC`, `SEQUENCE`, `BPMN`, `ERD` (nhãn `DIAGRAM_KIND_LABEL`). |
| `ArtifactStatus` | `none` (chưa có) · `draft` (Đang làm) · `done` (Xong) · `approved` (Đã duyệt) · `outdated` (Lỗi thời) + cờ riêng `revisionRequested` (tag "Yêu cầu sửa"). Màn hình dùng chung (không có `none`). |
| `TaskStatus` | `todo` · `doing` · `done` · `approved` + `Task.revisionRequested`. `redo` cũ được migration đổi thành `doing` + cờ **mỗi lần khởi động**; mã mới không ghi `redo`. |

## 5.1 Đăng nhập, phiên, hiện diện, nhật ký – C2 (**đã chạy**)

| Method | Path | Body / query | Trả về | Quyền | Client | Chủ |
|---|---|---|---|---|---|---|
| POST | `/api/login` | `{ name \| memberId, password }` → đăng nhập thành viên. Chỉ `{ password }` → cổng APP_PASSWORD cũ | `{ ok: true, member: Member }` (thành viên) · `{ ok: true }` (cũ) · `401` sai · `429` thử quá 10 lần/10 phút/IP | công khai | `login(b)` | C2 (màn: C3) |
| POST | `/api/logout` | – | `{ ok: true }`, xoá cả 2 cookie | công khai | `logout()` | C2 |
| GET | `/api/me` | – | `MeInfo = { member: Member \| null, mode: "demo" \| "member", appAuth: boolean }` | công khai | `getMe()` | C2 |
| PUT | `/api/members/:id/password` | `{ password }` (rỗng = xoá; ≥ 6 ký tự) | `Member` (`hasPassword`) · `400` nếu mật khẩu đầu tiên không phải của BA Lead, hoặc xoá mật khẩu BA Lead cuối cùng khi người khác còn mật khẩu | chính mình hoặc `requireLead` | `setMemberPassword(id, pw)` | C2 (màn Quản trị: C3) |
| POST | `/api/presence` | `{ kind: PresenceKind, id, sub? }` – gửi mỗi 30 giây | `PresenceEntry[]` người khác đang mở (trừ mình) | `requireMember` | `touchPresence(t)` / hook `usePresence` | C2 |
| GET | `/api/presence` | query `kind`, `id`, `sub?` | `PresenceEntry[]` (trừ mình) | `requireMember` | `listPresence(t)` | C2 |
| DELETE | `/api/presence` | `{ kind, id, sub? }` | `{ ok: true }` (rời màn) | `requireMember` | `leavePresence(t)` | C2 |
| GET | `/api/projects/:id/runs` | query `moduleId?` | `PromptRun[]` mới nhất trước | `requireMember` | `listProjectRuns(pid, q)` | C2 (màn: C3) |
| GET | `/api/settings` | – | thêm trường `memberAuth: boolean` | công khai | – | C2 |

`PresenceKind = "screen" | "doc" | "diagram" | "tests" | "story"`; `id`, `sub` như `ArtifactRef` (story: id = storyId). Lưu trong bộ nhớ, hết hạn sau **90 giây** không nhịp (`server/presence.ts`). Chế độ demo: người gửi lấy từ `actorId` (hook tự gửi từ `currentMemberId()`); không rõ người thì không ghi nhịp, chỉ trả danh sách.

## 5.2 User story – `server/routes/stories.ts` (C4, **501**)

| Method | Path | Body / query | Trả về | Quyền | Client |
|---|---|---|---|---|---|
| GET | `/api/projects/:id/stories` | query `moduleId?` | `UserStory[]` theo `order` | `requireMember` | `listStories(pid, q)` |
| POST | `/api/projects/:id/stories` | `UserStoryInput` | `UserStory` (mã `US-xx` tự đánh: `storyCode(nextStoryNumber(db, pid))`, `rev 1`) | `requireMember` | `createStory(pid, b)` |
| POST | `/api/projects/:id/stories/reorder` | `{ ids: string[] }` | `UserStory[]` | `requireMember` | `reorderStories(pid, ids)` |
| GET | `/api/stories/:id` | – | `UserStory` | `requireMember` | `getStory(id)` |
| PATCH | `/api/stories/:id` | `UserStoryInput & { baseRev? }` | `UserStory` · `409 CONFLICT` | `requireMember` | `updateStory(id, b)` |
| DELETE | `/api/stories/:id` | – | `{ ok: true }` | `requireMember` | `deleteStory(id)` |

`UserStoryInput = { moduleId?, asA?, iWant?, soThat?, acceptanceCriteria?: string[], priority?: "High" \| "Medium" \| "Low" }`. `moduleId` phải thuộc dự án → `400`. **Đợt 6 (D3):** `POST` bắt buộc `moduleId` (thiếu / rỗng / `null` → `400` "Chưa chọn module…", dự án chưa có module → `400` "Dự án chưa có module – tạo module trước…"); `PATCH` gửi `moduleId` rỗng / `null` → `400` (không bỏ gắn được), không gửi thì giữ nguyên – story cũ đã mất module (module bị xoá → `null`) vẫn sửa được và gắn lại bằng `moduleId` hợp lệ. QUS (`GET /api/modules/:id/qus`, C4) chuyển sang chấm trên story ghép lại thành câu.

## 5.3 Tài liệu theo bước – `server/routes/docs.ts` (C5, **501**)

| Method | Path | Body | Trả về | Quyền | Client |
|---|---|---|---|---|---|
| GET | `/api/modules/:id/docs` | – | `ModuleDoc[]` đủ 5 loại theo thứ tự `DOC_KINDS` (chưa sinh: `status "none"`, `rev 0`, `content ""`) | `requireMember` | `listModuleDocs(mid)` |
| GET | `/api/modules/:id/docs/:kind` | – | `ModuleDoc` | `requireMember` | `getModuleDoc(mid, kind)` |
| PUT | `/api/modules/:id/docs/:kind` | `{ content, data?, baseRev? }` | `ModuleDoc` (về `draft`) · `409 CONFLICT` | `requireMember` | `saveModuleDoc(mid, kind, b)` |
| POST | `/api/modules/:id/docs/:kind/generate` | `{ baseRev? }` | `ModuleDoc` (`draft`) · `400` nếu bước trước chưa `done`/`approved` | `requireMember` | `generateModuleDoc(mid, kind, b)` |
| POST | `/api/modules/:id/docs/:kind/refine` | `{ instruction, section?, baseRev? }` | `ModuleDoc` | `requireMember` | `refineModuleDoc(mid, kind, b)` |

Sự kiện: ghi/sinh → `artifact.drafted { kind: "doc", id: moduleId, sub }`; các bước sau đang có → `artifact.stale`. `ModuleDoc.data`: UC_SPEC `{ useCases }`, FRD_NFR `{ requirements }`, SRS `{ srs }`. Route cũ `/api/modules/:id/docs/generate|refine|approve` giữ tới khi C9 chuyển `service.ts`.

## 5.4 Sơ đồ theo bước – `server/routes/diagrams.ts` (C6, **501**)

| Method | Path | Body | Trả về | Quyền | Client |
|---|---|---|---|---|---|
| GET | `/api/modules/:id/diagrams` | – | `ModuleDiagram[]` đủ 5 loại theo `DIAGRAM_KINDS` (chưa sinh: `none`, `rev 0`) | `requireMember` | `listModuleDiagrams(mid)` |
| GET | `/api/modules/:id/diagrams/:kind` | – | `ModuleDiagram` | `requireMember` | `getModuleDiagram(mid, kind)` |
| PUT | `/api/modules/:id/diagrams/:kind` | `{ code, parts?, baseRev? }` | `ModuleDiagram` (`draft`) · `400` Mermaid sai · `409 CONFLICT` | `requireMember` | `saveModuleDiagram(mid, kind, b)` |
| POST | `/api/modules/:id/diagrams/:kind/generate` | `{ baseRev? }` | `ModuleDiagram` (`draft`) | `requireMember` | `generateModuleDiagram(mid, kind, b)` |

SEQUENCE: `code` rỗng, mỗi UC một phần trong `parts: DiagramPart[] = { key: mã UC, title, code }`. Route cũ `/api/modules/:id/diagram` (số ít, `uc_diagrams`) giữ tới khi C6 thay `DiagramTab`.

## 5.5 Xong / Duyệt / Yêu cầu sửa – `server/routes/approval.ts` (C7)

| Method | Path | Body / query | Trả về | Quyền | Client | Hiện trạng |
|---|---|---|---|---|---|---|
| GET | `/api/artifacts/:kind/:id/state` | query `sub?` | `ArtifactState = { ref, status, revisionRequested, rev, updatedBy, updatedAt }` · `404` | `requireMember` | `getArtifactState(kind, id, sub)` | **Đã chạy** (C2) |
| POST | `/api/artifacts/:kind/:id/done` | `{ sub?, baseRev? }` | `ApprovalResult` | `requireMember` | `markArtifactDone(kind, id, b)` | **501** |
| POST | `/api/artifacts/:kind/:id/approve` | `{ sub?, baseRev? }` | `ApprovalResult` (+ `git: GitPushOutcome`) | `requireLead` | `approveArtifact(kind, id, b)` | **501** |
| POST | `/api/artifacts/:kind/:id/request-change` | `{ sub? }` | `ApprovalResult` | `requireLead` | `requestArtifactChange(kind, id, b)` | **501** |

`:kind` ∈ `screen | doc | diagram | tests` (sai → `400`; doc thiếu `sub` → `400`, dùng `parseArtifactRef()` trong `approval.ts`). `ApprovalResult = { state, tasks: Task[], git? }`. Luồng (kế hoạch mục 1): `done` chỉ từ `draft`/`outdated`, giữ `revisionRequested`; `approve` chỉ từ `done`, xoá cờ, gọi `pushApproved()` (C8) – chưa cấu hình repo vẫn duyệt, `git.pushed = false`; lỗi GitHub khi đã cấu hình → lỗi API, trạng thái không đổi; `request-change` chỉ từ `done`/`approved` → `draft` + cờ. Đọc/ghi trạng thái qua `getArtifactState` / `setArtifactState` (`server/db.ts`). Sự kiện: `artifact.done`, `artifact.approved`, `artifact.revision_requested`. Route cũ `POST /api/screens/:id/approve`, `/api/modules/:id/docs/approve`, `/api/modules/:id/diagram/approve` giữ tới khi C7/C9 bỏ nút cũ.

## 5.6 GitHub – `server/routes/git.ts` (C8, **501**)

| Method | Path | Body | Trả về | Quyền | Client |
|---|---|---|---|---|---|
| GET | `/api/projects/:id/git` | – | `ProjectGit \| null` – **không có token**, chỉ `hasToken` | `requireMember` | `getProjectGit(pid)` |
| PUT | `/api/projects/:id/git` | `ProjectGitInput = { repo, branch?, token? }` (token thiếu = giữ, `""` = xoá; branch mặc định `main`) | `ProjectGit` | `requireLead` | `saveProjectGit(pid, b)` |
| POST | `/api/projects/:id/git/test` | `Partial<ProjectGitInput>` (thiếu thì dùng cấu hình đã lưu) | `GitTestResult = { ok, message, branchExists?, defaultBranch? }` | `requireLead` | `testProjectGit(pid, b)` |
| GET | `/api/projects/:id/git/history` | – | `GitHistory = { configured, repo, branch, commits: GitCommit[], pushes: GitPush[] }` | `requireMember` | `getGitHistory(pid)` |

Token chỉ đọc ở server (`project_git.token`, mặc định lấy biến `GITHUB_TOKEN` nếu dự án chưa có – C8 quyết). Không bao giờ ghi token vào log, lỗi trả về hay `prompt_runs`.

## 5.7 Prototype – `server/routes/prototype.ts` (C9, **501**)

| Method | Path | Trả về | Quyền | Client |
|---|---|---|---|---|
| GET | `/api/screens/:id/export/html` | HTML tĩnh tự chứa (`FileResponse` `text/html`, `attachment`) từ `shared/exportHtml.ts` | `requireMember` | `screenHtmlUrl(sid)` |

**Bổ sung vào endpoint cũ (C2 đã làm):** `PATCH /api/screens/:id`, `POST /api/screens/:id/edit`, `/revert`, `/layout/accept`, `/manual` nhận `baseRev?` → `409 CONFLICT` khi lệch; ghi xong `screens.rev + 1`, `updated_by`, `updated_at`. `Screen.rev`, `revisionRequested` có trong kiểu nhưng `toScreen()` (C9) cần đọc thêm cột để trả ra; trong lúc chờ dùng `GET /api/artifacts/screen/:id/state`.

## 5.8 Sự kiện đợt 5 – `server/events.ts`

`EVENT_TYPES_V5 = ["artifact.drafted", "artifact.done", "artifact.approved", "artifact.revision_requested", "artifact.stale"]`; `EVENT_TYPES` = đợt 5 + `"artifact.unapproved"` (cũ, chỉ mã v2 còn phát). `ArtifactEvent.artifact` là `ArtifactRef` có `sub`.

| Thao tác | Sự kiện | Ai phát |
|---|---|---|
| Sinh / sửa nội dung sản phẩm | `artifact.drafted` | C4–C6, C9 |
| BA bấm Xong | `artifact.done` | C7 |
| BA Lead Duyệt | `artifact.approved` | C7 |
| BA Lead Yêu cầu sửa | `artifact.revision_requested` | C7 |
| Bước trước sinh lại / đổi | `artifact.stale` cho các bước sau | C5, C6, C9 |

## 5.9 Bảng tổng hợp chủ sở hữu

| Nhóm | Tệp route | Chủ | Trạng thái |
|---|---|---|---|
| Đăng nhập, me, mật khẩu, presence, nhật ký dự án | `server/app.ts` | C2 | Đã chạy |
| Chặn đè màn (`baseRev`) | `server/app.ts` | C2 | Đã chạy |
| User story | `server/routes/stories.ts` | C4 | 501 |
| Tài liệu | `server/routes/docs.ts` | C5 | 501 |
| Sơ đồ | `server/routes/diagrams.ts` | C6 | 501 |
| Trạng thái sản phẩm | `server/routes/approval.ts` | C7 | `state` đã chạy, 3 lệnh 501 |
| GitHub | `server/routes/git.ts` | C8 | 501 |
| Xuất HTML | `server/routes/prototype.ts` | C9 | 501 |
