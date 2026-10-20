# Hợp đồng API – BA Copilot v2

Người viết: **A2**. Trạng thái: **chờ A0 duyệt**. Sau khi duyệt, tài liệu này **bị khoá**: không đổi method, path, tên trường hay kiểu trả về. Muốn đổi phải mở yêu cầu với A0 (`docs/agents/REQUESTS.md`).

Kiểu dữ liệu (`Member`, `Task`, …) khai báo trong `shared/types.ts`. Hàm gọi phía client có sẵn trong `client/api.ts` (cột *Client*). Bảng và cột: `docs/erd.md`.

## 0. Quy ước chung

| Mục | Quy ước |
|---|---|
| Định dạng | JSON (`content-type: application/json`). Tải tệp trả nhị phân với `content-disposition`. |
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
