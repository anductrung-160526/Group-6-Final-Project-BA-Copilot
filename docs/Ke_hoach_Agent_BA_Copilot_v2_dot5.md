# Kế hoạch đa agent – BA Copilot v2, đợt 5 (sửa theo góp ý)

Làm thẳng trên nhánh **`v2-demo`** (không tạo v3). Hạn: **2026-10-21**. Mọi hạng mục dưới đây đều **bắt buộc**.
Mã nguồn: `ba-copilot-source/ba-copilot` (đường dẫn trong bảng tính từ đây; `docs/` tính từ gốc repo).
Mã agent dùng tiền tố **C** để không lẫn với A0–A12 của các đợt trước.

## 1. Quyết định đã chốt

| # | Chủ đề | Chốt |
|---|---|---|
| 1 | Sửa/Xoá | Trong bảng: icon bút chì + thùng rác (tooltip) ở cột cuối. Trong ngăn phải: nút chữ "Sửa" / "Xoá". Xoá luôn hỏi xác nhận. Viết thống nhất "Xoá". |
| 2 | Ngăn phải (Drawer) | Rộng **40% màn hình** (tối thiểu 360px, màn hẹp thì 100%). |
| 3 | Icon | Thư viện **Lucide** (`lucide-react`), thay toàn bộ emoji/ký tự đang dùng làm icon. |
| 4 | Module | **Giữ module.** "Thực hiện công việc" có ô chọn module ở đầu trang. |
| 5 | Yêu cầu nghiệp vụ | Ở **cấp dự án**, mỗi story gắn một module, có bộ lọc theo module. |
| 6 | Thứ tự bước | Tài liệu → Sơ đồ → Prototype → Test case → Truy vết. BRD sinh từ user story, prototype sinh từ SRS/FRD. **Bỏ BR-01** (không cần duyệt màn mới sinh tài liệu). |
| 7 | Tài liệu | BRD → UC Specification → SRS → FRD-NFR → API Spec. |
| 7 | Sơ đồ | Context → UC → Sequence → **BPMN** → **ERD**. BPMN vẽ bằng Mermaid mô phỏng (flowchart có làn, sự kiện, cổng). ERD bằng Mermaid `erDiagram`. |
| 8 | Ràng buộc bước | Bước sau chỉ cần bước trước ở trạng thái **Xong** (không bắt buộc Duyệt). |
| 9 | Làm chung | **Cách A + chặn đè.** Dữ liệu chung trong app; GitHub là nơi công bố. Chống ghi đè: (a) mỗi lần lưu gửi kèm số bản `rev`, lệch thì trả 409 "Bản đã thay đổi – tải lại"; (b) hiện "Đang được sửa bởi …" trên màn/tài liệu có người đang làm. |
| 10 | GitHub | **Chỉ một luồng: BA Lead Duyệt → đẩy lên GitHub.** Commit đúng các tệp của sản phẩm được duyệt lên **một nhánh duy nhất** (mặc định `main`, đặt tên khác được trong cài đặt dự án). "Xong" không đụng GitHub. **Không có Pull main** (cách A: mọi người đã thấy bản của nhau trong app). |
| 11 | Vòng sửa | BA Lead bấm **"Yêu cầu sửa"** (không cần lý do; góp ý nằm ở bình luận trên prototype) → task lùi về Đang làm + gắn tag "Yêu cầu sửa". BA sửa → bấm Xong lần nữa → tag giữ tới khi Duyệt. Bình luận trên tài liệu: **chưa làm** đợt này. |
| 12 | Nút | "Xong" (BA) và "Duyệt" / "Yêu cầu sửa" (chỉ BA Lead) đặt ở **mọi màn sản phẩm** và trong ngăn chi tiết task. |
| 13 | Repo | Mỗi dự án một repo, **BA Lead dán link** trong cài đặt dự án; app tự tạo nhánh đã cấu hình nếu chưa có. |
| 14 | Token | Chỉ BA Lead đẩy lên GitHub nên chỉ cần **một token của dự án** (lưu ở server, không trả về client). Không làm token riêng từng BA. |
| 15 | Phân quyền | Đăng nhập thật theo từng thành viên (tên + mật khẩu). Server chặn các thao tác của BA Lead. |
| 16 | Định dạng GitHub | Tài liệu và sơ đồ: `.md`. Prototype: xuất **HTML tĩnh**. Test case: `.md`. |
| 17 | User story | Mỗi story một dòng: mã US-xx, As a / I want / So that, tiêu chí chấp nhận (nhiều dòng), độ ưu tiên. Nút "+ Thêm user story". |

### Trạng thái công việc

```
Cần làm ──► Đang làm ──[Xong · BA]──► Xong ──[Duyệt · BA Lead]──► Đã duyệt + đẩy tệp lên GitHub
                ▲                       │
                └──[Yêu cầu sửa · BA Lead]┘  + tag "Yêu cầu sửa"
```

- `TaskStatus = "todo" | "doing" | "done" | "approved"`, cờ `revisionRequested`. Dữ liệu cũ `redo` → `doing` + `revisionRequested = true`.
- Sửa nội dung một sản phẩm đang Xong/Đã duyệt → về Đang làm (cần bấm Xong lại).
- Kéo thẻ Kanban chỉ theo đúng mũi tên trên; cột "Đã duyệt" chỉ BA Lead kéo vào được.
- Sản phẩm đã duyệt bị sửa → về Đang làm; duyệt lại thì có thêm một commit. Lịch sử commit trên GitHub = lịch sử các bản đã duyệt. Lịch sử sửa giữa các lần Xong nằm trong app (phiên bản màn hình, `task_events`).

## 2. Danh sách agent và tệp sở hữu

| Mã | Agent | Đợt | Tệp sở hữu |
|---|---|---|---|
| C0 | Điều phối & tích hợp | 0–3 | `docs/agents/*`, tệp kế hoạch này, `README.md`, `DEPLOY.md` |
| C1 | Design System | 1 | `client/styles.css`, `client/components/ui.tsx`, `client/views/_Gallery.tsx`, `docs/design-system.md`, `package.json` (thêm `lucide-react`) |
| C2 | Hợp đồng & nền tảng | 1 | `shared/types.ts`, `server/db.ts` (mọi migration), `server/http.ts`, `server/app.ts`, `server/routes/index.ts`, `server/events.ts`, `server/presence.ts` (mới), `client/presence.ts` (mới), `client/api.ts` (stub), `client/projectMenu.ts` (mới, registry menu trái), `docs/api.md`, `docs/erd.md`, `tests/contract.test.ts` |
| C3 | Khung dự án, đăng nhập, quản trị | 2 | `client/main.tsx`, `client/routes.ts`, `client/components/TopBar.tsx`, `client/components/ProjectShell.tsx` (mới), `client/views/Home.tsx`, `client/views/ProjectView.tsx`, `client/views/ModuleView.tsx` (gỡ bỏ), `client/views/moduleTabs.ts` (gỡ bỏ), `client/views/LoginView.tsx` (mới), `client/views/AdminView.tsx` (đổi từ `MembersView.tsx`), `client/views/LogsTab.tsx`, `client/currentMember.ts`, `server/auth.ts`, `server/routes/members.ts`, `server/repo/members.ts`, `tests/members.test.ts`, `tests/auth.test.ts` |
| C4 | Yêu cầu nghiệp vụ | 2 | `server/routes/stories.ts`, `server/repo/stories.ts`, `client/views/StoriesView.tsx`, `shared/qus.ts`, `client/components/QusPanel.tsx`, `server/routes/qus.ts`, `shared/suggest.ts` (đọc story mới), `tests/stories.test.ts`, `tests/qus.test.ts` |
| C5 | Tài liệu | 2 | `server/ai/docsPipelines.ts` (mới), `server/routes/docs.ts`, `server/repo/docs.ts`, `client/views/DocsView.tsx` (thay `DocsTab.tsx`), `tests/docs.test.ts` |
| C6 | Sơ đồ | 2 | `server/ai/diagramPipelines.ts` (mới), `shared/ucDiagram.ts`, `shared/diagrams.ts` (mới), `server/routes/diagram.ts`, `server/routes/diagrams.ts` (khung của C2), `client/views/DiagramsView.tsx` (thay `DiagramTab.tsx`), `client/components/Mermaid.tsx`, `tests/diagrams.test.ts` |
| C7 | Trạng thái & duyệt | 2 | `shared/taskRules.ts`, `server/taskAutomation.ts`, `server/routes/tasks.ts`, `server/repo/tasks.ts`, `server/routes/approval.ts` (mới), `client/views/TasksView.tsx`, `client/views/TaskDialog.tsx`, `client/components/RelatedTasks.tsx`, `client/components/ArtifactActions.tsx` (mới), `tests/taskRules.test.ts`, `tests/taskAutomation.test.ts`, `tests/tasks.test.ts`, `tests/approval.test.ts` |
| C8 | GitHub | 2 | `server/github.ts` (mới), `server/gitExport.ts` (mới), `server/routes/git.ts` (mới), `client/views/GitHistoryView.tsx` (mới), `client/views/ProjectGitSettings.tsx` (mới), `tests/github.test.ts` |
| C9 | Prototype, Test case, Truy vết | 2 | `client/views/DesignTab.tsx`, `client/components/SuggestionsPanel.tsx`, `client/components/Renderer.tsx`, `shared/exportHtml.ts` (mới), `server/routes/prototype.ts` (khung của C2), `client/views/TestsTab.tsx`, `client/views/TraceTab.tsx`, `shared/trace.ts`, `server/service.ts`, `server/repo.ts`, `server/ai/pipelines.ts`, `server/ai/mock.ts`, `tests/api.test.ts`, `tests/exportHtml.test.ts` |
| C10 | Rà soát giao diện | 3 | Được sửa mọi tệp `client/views/*`, `client/components/*` **chỉ** để thay icon, đổi Sửa/Xoá sang `RowActions`, đổi ngăn phải sang `Drawer` mới |
| C11 | Seed, E2E & QA | 3 | `scripts/seed.ts`, `e2e/demo-flow.mjs`, `docs/agents/QA_REPORT.md` |

Luật sở hữu giữ như `docs/agents/OWNERSHIP.md`: chạm tệp ngoài dòng của mình thì ghi vào `docs/agents/REQUESTS.md`. Sau đợt 1, `shared/types.ts`, `server/db.ts`, `docs/api.md` **khoá**.

**Tách điểm nóng `server/ai/pipelines.ts` + `mock.ts`:** C5 và C6 viết pipeline (cả bản Claude và Mock) trong tệp mới của mình. Chỉ C9 sửa hai tệp cũ.

## 3. Chi tiết từng agent

### C0 – Điều phối
- Tạo nhánh `agent/c<n>-<tên>` từ `v2-demo` cho từng agent, chạy agent trong worktree riêng.
- Gộp theo cổng của kế hoạch v2 mục 5: `npm test`, `npm run build`, `npx tsc --noEmit`, đối chiếu tệp sửa với bảng mục 2.
- Cuối đợt 3: cập nhật README, DEPLOY (biến `GITHUB_TOKEN` mặc định, cách cấu hình repo cho dự án).

### C1 – Design System (đợt 1)
- `Icon`: bọc Lucide, bảng tên → icon dùng chung (sửa, xoá, thư mục, AI ✦ → `Sparkles`, duyệt, mũi tên…).
- `RowActions`: props `onEdit`, `onDelete`, `deleteConfirm` (tiêu đề + nội dung), tự mở hộp xác nhận.
- `Drawer`: mặc định rộng 40% (`--drawer-w: 40vw`, tối thiểu 360px, ≤ 768px thì 100%). Bỏ cỡ `md`/`lg` cố định.
- `SideNav`: menu trái nhiều cấp (mục cha mở/thu, mục con đánh số bước), có ô chèn bộ chọn module.
- `ApprovalBar`: chỉ hiển thị. Props: `status`, `revisionRequested`, `isLead`, `onDone`, `onApprove`, `onRequestChange`, `busy`. Nút "Xong", "Duyệt", "Yêu cầu sửa"; nhãn trạng thái và tag "Yêu cầu sửa".
- `StatusBadge` bổ sung Cần làm / Đang làm / Xong / Đã duyệt. `EditingBadge` ("Đang được sửa bởi …"). `ConflictNotice` (báo 409, nút Tải lại).
- `StoryRow` không làm ở đây (C4 tự ghép từ `Field`).
- Thêm tất cả vào `#/_gallery` và `docs/design-system.md`.

### C2 – Hợp đồng & nền tảng (đợt 1)
- **Type + bảng mới:**
  - `user_stories` (id, projectId, moduleId, code, asA, iWant, soThat, acceptanceCriteria[], priority, order, rev).
  - `module_docs` (moduleId, kind `BRD | UC_SPEC | SRS | FRD_NFR | API_SPEC`, content md, status, rev, updatedBy).
  - `module_diagrams` (moduleId, kind `CONTEXT | UC | SEQUENCE | BPMN | ERD`, code Mermaid, status, rev). Chuyển dữ liệu `uc_diagrams` sang.
  - `project_git` (projectId, repo, token – không bao giờ trả về client, branch mặc định `main`).
  - `git_pushes` (projectId, artifact, taskId, commitSha, byMemberId, at) – nhật ký mỗi lần Duyệt đẩy lên GitHub.
  - `members.password_hash`.
- **Trạng thái:** `ArtifactStatus = "none" | "draft" | "done" | "approved" | "outdated"` + `revisionRequested`. `TaskStatus` và sự kiện mới: `artifact.drafted | artifact.done | artifact.approved | artifact.revision_requested | artifact.stale`.
- **ArtifactRef** mở rộng `kind: "screen" | "doc" | "diagram" | "tests"`, thêm `sub` (loại tài liệu/sơ đồ).
- **Migration dữ liệu cũ:** `redo` → `doing` + cờ. UC/SRS/FR-NFR cũ → các dòng `module_docs` tương ứng. `requirementInput` → `user_stories` (tách bằng `splitStories` của QUS).
- **Chặn đè:** helper `assertRev(current, base)` ném 409. Mọi API ghi sản phẩm nhận `baseRev`.
- **Presence:** `POST /api/presence {kind,id}` gửi nhịp 30 giây, hết hạn 90 giây; `GET` trả người đang sửa. Hook `usePresence(kind,id)` ở client.
- **Phân quyền:** middleware `requireMember`, `requireLead`. Phiên đăng nhập gắn `memberId`; actor lấy từ phiên, không lấy từ body.
- **`client/projectMenu.ts`:** registry menu trái với chỗ giữ chỗ cho từng màn, để mỗi agent đợt 2 thay đúng một dòng.
- Stub đủ mọi endpoint trong `docs/api.md` (bảng endpoint đợt 5).

### C3 – Khung dự án, đăng nhập, quản trị (đợt 2)
- **Màn ngoài:** thanh trên chỉ có logo, tên người đăng nhập, chế độ AI, đăng xuất. Trang chủ = danh sách dự án. Mục "Quản trị hệ thống" (thành viên, vai, mật khẩu) **chỉ BA Lead thấy**.
- **Trong dự án:** header hiển thị tên dự án + nút Cài đặt GitHub (chỉ BA Lead, mở `ProjectGitSettings` của C8). Menu trái:
  - Quản lý công việc (`#/p/:pid/tasks`)
  - Yêu cầu nghiệp vụ (`#/p/:pid/stories`)
  - Thực hiện công việc, có bộ chọn module: Tài liệu → Sơ đồ → Prototype → Test case → Truy vết (`#/p/:pid/work/:moduleId/<docs|diagrams|prototype|tests|trace>`)
  - Kho tài liệu (`#/p/:pid/files`)
  - Nhật ký AI (`#/p/:pid/logs`, cấp dự án, lọc theo module)
  - Lịch sử GitHub (`#/p/:pid/git`)
- Bấm vào dự án mở thẳng "Quản lý công việc". Module vẫn tạo/xoá trong "Thực hiện công việc"; ô "Yêu cầu nghiệp vụ" trong hộp thoại tạo module bị bỏ.
- Chuyển hướng URL cũ `#/m/:id/<tab>` sang URL mới.
- Màn đăng nhập. Gỡ ô "Tôi là…".

### C4 – Yêu cầu nghiệp vụ (đợt 2)
- Bảng story theo dự án, lọc theo module. Mỗi dòng có 3 ô có placeholder "As a…", "I want…", "So that…", tiêu chí chấp nhận (thêm/xoá dòng), độ ưu tiên. Nút "+ Thêm user story" thêm dòng mới; sửa/xoá từng dòng bằng `RowActions`.
- QUS chấm trên story có cấu trúc (ghép lại thành câu); panel QUS gắn theo từng dòng + điểm tổng của module.
- Export `storiesText(moduleId)` cho C5 và C9 dùng làm đầu vào AI.
- Chặn đè: `rev` theo từng story, có presence.

### C5 – Tài liệu (đợt 2)
- Stepper 5 bước. Mỗi bước: nút Sinh bằng AI / Sinh lại, xem Markdown, sửa tay, "Chỉnh bằng AI" theo mục, `ArtifactActions` (Xong/Duyệt/Yêu cầu sửa).
- Đầu vào: BRD ← story. UC Spec ← BRD + story. SRS ← UC Spec. FRD-NFR ← SRS + UC. API Spec ← FRD + UC (+ ERD nếu có).
- Nút sinh bước N bị khoá cho tới khi bước N−1 ở trạng thái Xong.
- UC Spec và FRD-NFR vẫn lưu cấu trúc `UseCase[]` / `Requirement[]` (test case và truy vết dùng), Markdown hiển thị được sinh từ cấu trúc.
- Bước trước sinh lại → các bước sau thành Lỗi thời (`artifact.stale`).
- Có bản Mock cho cả 5 loại để chạy được khi không có API key.

### C6 – Sơ đồ (đợt 2)
- 5 loại sơ đồ, mỗi loại một mục con. Mỗi mục có Sinh bằng AI, sửa mã Mermaid, xem trước, `ArtifactActions`.
- Context ← BRD. UC ← UC Spec. Sequence ← từng UC (chuyển từ bộ tài liệu cũ sang). BPMN ← BRD + UC (flowchart có làn theo actor, sự kiện bắt đầu/kết thúc, cổng rẽ nhánh hình thoi). ERD ← FRD/SRS.
- Kiểm tra mã Mermaid hợp lệ trước khi lưu; có bản Mock.

### C7 – Trạng thái & duyệt (đợt 2)
- `taskRules` theo sơ đồ mục 1. Kanban 4 cột, tag "Yêu cầu sửa" trên thẻ, chặn kéo sai luật.
- `POST /api/artifacts/:kind/:id/{done|approve|request-change}`: đổi trạng thái sản phẩm + task gắn kèm, ghi `task_events`, phát sự kiện. `approve` và `request-change` cần `requireLead`.
- Hook gọi C8: chỉ `approve` → `pushApproved(artifact)`; `done` không gọi GitHub. Dự án chưa cấu hình repo thì vẫn duyệt được và báo "Chưa cấu hình GitHub – chưa đẩy". Lỗi GitHub khi đã cấu hình thì trạng thái **không** đổi và báo rõ lý do.
- `ArtifactActions`: bọc `ApprovalBar` + gọi API; C5, C6, C9 nhúng vào màn của mình. Ngăn chi tiết task cũng có các nút này.

### C8 – GitHub (đợt 2)
- `github.ts`: gọi REST API bằng `fetch` (ref, blob, tree, commit, cập nhật ref, tạo nhánh nếu chưa có, liệt kê commit). Dùng token của dự án.
- `gitExport.ts`: bố cục repo:
  ```
  <module>/docs/01-BRD.md … 05-API-Spec.md
  <module>/diagrams/<kind>.md          (khối ```mermaid)
  <module>/prototype/<screen>.html, index.html
  <module>/tests/test-cases.md
  ```
- `pushApproved(artifact)`: commit đúng các tệp của sản phẩm đó lên nhánh đã cấu hình, nội dung commit ghi "Duyệt: <sản phẩm> – BA <người làm>, duyệt bởi <BA Lead>"; ghi `git_pushes`.
- Màn Lịch sử GitHub: danh sách commit của nhánh (link sang GitHub) + nhật ký `git_pushes`. Màn cài đặt repo cho BA Lead (link repo, token, tên nhánh, nút "Thử kết nối").
- Test giả lập GitHub bằng `fetch` giả, không gọi mạng thật.

### C9 – Prototype, Test case, Truy vết (đợt 2)
- Prototype: AI sinh màn với bối cảnh SRS/FRD + story (thay cho `requirementInput`). Bỏ nút "Duyệt thiết kế" riêng, thay bằng `ArtifactActions`. Giữ bình luận theo component. Thêm `baseRev` vào mọi lệnh sửa màn và `usePresence`.
- `shared/exportHtml.ts`: dựng HTML tĩnh tự chứa (kèm CSS) từ cây giao diện, dùng chung cho xuất tệp và cho C8.
- Test case: sinh khi FRD-NFR đã Xong; có `ArtifactActions`.
- Truy vết: Story → UC → FR → Màn → TC.
- `service.ts`: bỏ BR-01, chuyển các hàm tài liệu cũ sang dùng `module_docs` (phối hợp với C5 qua REQUESTS nếu cần).

### C10 – Rà soát giao diện (đợt 3, sau khi gộp xong đợt 2)
- Thay mọi emoji/ký tự icon bằng `Icon`. Không còn `→ ✦ ✓ 📁 ▾ ⋯ ↑ ↓ ↗ ▶ ▦ ⇪ ⌖`; ký hiệu toán (≥, ≤) trong chữ thì giữ.
- Mọi Sửa/Xoá về `RowActions` hoặc cặp nút trong `Drawer`, viết "Xoá".
- Mọi ngăn phải dùng `Drawer` 40%. Soát ở 1440px và 375px.

### C11 – Seed, E2E & QA (đợt 3)
- Seed: 2 BA + 1 BA Lead có mật khẩu, 1 dự án, 2 module, story có cấu trúc, đủ 5 tài liệu và 5 sơ đồ, task ở cả 4 trạng thái, 1 task có tag "Yêu cầu sửa".
- E2E: đăng nhập BA → story → BRD … API Spec → sơ đồ → prototype → Xong → đăng nhập BA Lead → Yêu cầu sửa → BA sửa, Xong → Duyệt → có commit trên GitHub giả lập. Có thêm ca 2 BA sửa cùng màn và nhận 409.

## 4. Thứ tự chạy (trong 1 ngày)

```
Đợt 0  C0  tạo nhánh agent từ v2-demo                                    ~15'
Đợt 1  C1 Design System ─┐ song song → C0 gộp vào v2-demo                 ~1,5h
       C2 Hợp đồng ──────┘
Đợt 2  C3  C4  C5  C6  C7  C8  C9   (7 agent song song)                    ~3–4h
       C0 gộp theo thứ tự: C3 → C4 → C5 → C6 → C9 → C7 → C8
Đợt 3  C10 rà soát giao diện ─┐ song song                                 ~1,5h
       C11 seed + E2E ────────┘ → lỗi trả về agent sở hữu → C0 chốt, build
```

- C3 gộp đầu vì là khung mà mọi màn khác gắn vào (mỗi màn đăng ký một dòng trong `projectMenu.ts`).
- C7 gộp sau C5, C6, C9 vì nhúng `ArtifactActions` vào màn của họ; C8 gộp cuối vì gắn vào hook của C7.
- Đường găng: C2 → C7 → C8.

**Nếu trễ, cắt theo thứ tự:** (1) presence "Đang được sửa bởi" → chỉ giữ chặn 409; (2) truy vết thêm cột Story; (3) màn Lịch sử GitHub → chỉ giữ link sang trang commit trên GitHub.

## 5. Điểm nóng xung đột

| Tệp | Cách tránh |
|---|---|
| `shared/types.ts`, `server/db.ts` | Chỉ C2, khoá sau đợt 1 |
| `server/ai/pipelines.ts`, `mock.ts` | Chỉ C9; C5 và C6 dùng tệp pipeline mới |
| `client/projectMenu.ts` | C2 tạo sẵn; mỗi agent đợt 2 thay đúng một dòng giữ chỗ |
| `server/service.ts` | Chỉ C9; C5, C7 cần gì thì ghi REQUESTS |
| Toàn bộ `client/views` (icon, Sửa/Xoá) | Dồn về C10 ở đợt 3; agent đợt 2 dùng component mới của C1 trong tệp của mình |
