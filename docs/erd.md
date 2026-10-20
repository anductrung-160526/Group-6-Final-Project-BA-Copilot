# ERD – BA Copilot v2

Người viết: **A2**. Trạng thái: **chờ A0 duyệt**. Sau khi duyệt, tài liệu này **bị khoá**: muốn đổi phải mở yêu cầu với A0 (`docs/agents/REQUESTS.md`).

Nguồn sự thật là `ba-copilot-source/ba-copilot/server/db.ts` (`SCHEMA` + `COLUMNS`). `tests/contract.test.ts` kiểm tra bảng, cột, index, khoá ngoại và `ON DELETE` khớp với tài liệu này.

## 1. Sơ đồ

Nhãn trên cạnh là hành vi `ON DELETE` của khoá ngoại phía bảng con. Cạnh nét đứt (`..`) là tham chiếu **logic**, không có khoá ngoại trong DB.

```mermaid
erDiagram
  projects ||--o{ modules : "CASCADE"
  modules ||--o{ screens : "CASCADE"
  screens ||--o{ screen_versions : "CASCADE"
  screens ||--o{ annotations : "CASCADE"
  modules ||--o{ use_cases : "CASCADE"
  modules ||--o{ requirements : "CASCADE"
  modules ||--o| srs : "CASCADE"
  modules ||--o{ sequences : "CASCADE"
  modules ||--o{ test_cases : "CASCADE"
  modules |o..o{ prompt_runs : "logic"
  screens ||..o{ suggestion_events : "logic"
  screen_versions ||..o| model_learned_trees : "logic"

  projects ||--o{ files : "CASCADE"
  modules |o--o{ files : "SET NULL"
  members |o--o{ files : "uploaded_by SET NULL"
  members |o--o{ screen_versions : "author_id SET NULL"
  members |o--o{ annotations : "author_id SET NULL"
  modules ||--o| uc_diagrams : "CASCADE"
  projects ||--o{ tasks : "CASCADE"
  modules |o--o{ tasks : "SET NULL"
  members |o--o{ tasks : "assignee_id SET NULL"
  tasks ||--o{ task_events : "CASCADE"
  members |o--o{ task_events : "by_member_id SET NULL"
  modules ||--o{ suggestion_dismissals : "CASCADE"

  projects {
    TEXT id PK
    TEXT name
    TEXT description
    TEXT created_at
  }
  modules {
    TEXT id PK
    TEXT project_id FK
    TEXT name
    TEXT requirement_input
    TEXT docs_status "none|draft|approved|outdated"
    TEXT tests_status "none|draft|approved|outdated"
    INTEGER qus_score "v2, NULL = chưa chấm"
    TEXT qus_checked_at "v2"
    TEXT created_at
  }
  screens {
    TEXT id PK
    TEXT module_id FK
    TEXT name
    TEXT status "draft|approved"
    TEXT current_version_id
    TEXT created_at
  }
  screen_versions {
    TEXT id PK
    TEXT screen_id FK
    INTEGER number
    TEXT kind "generate|edit|revert|layout|manual"
    TEXT prompt
    TEXT scope
    TEXT selected_ids "JSON"
    TEXT changed_ids "JSON"
    TEXT rejected "JSON"
    TEXT tree "JSON UINode"
    TEXT author "v2, tên chụp lại"
    TEXT author_id FK "v2"
    TEXT created_at
  }
  annotations {
    TEXT id PK
    TEXT screen_id FK
    TEXT version_id
    TEXT node_ids "JSON"
    TEXT bbox "JSON"
    TEXT comment
    TEXT author
    TEXT author_id FK "v2"
    TEXT status "open|sent|resolved"
    TEXT created_at
  }
  use_cases {
    TEXT module_id PK,FK
    TEXT code PK
    INTEGER ord
    TEXT data "JSON UseCase"
  }
  requirements {
    TEXT module_id PK,FK
    TEXT code PK
    INTEGER ord
    TEXT data "JSON Requirement"
  }
  srs {
    TEXT module_id PK,FK
    TEXT data "JSON SrsDoc"
  }
  sequences {
    TEXT module_id PK,FK
    TEXT use_case_code PK
    INTEGER ord
    TEXT data "JSON SequenceDiagram"
  }
  test_cases {
    TEXT module_id PK,FK
    TEXT code PK
    INTEGER ord
    TEXT data "JSON TestCase"
  }
  prompt_runs {
    TEXT id PK
    TEXT module_id "logic"
    TEXT type
    TEXT provider
    TEXT model
    TEXT input
    TEXT output
    INTEGER ok
    TEXT error
    INTEGER input_tokens
    INTEGER output_tokens
    INTEGER latency_ms
    TEXT created_at
  }
  suggestion_events {
    TEXT id PK
    TEXT screen_id "logic"
    TEXT version_id
    TEXT suggestion_kind
    TEXT target_node_id
    TEXT title
    REAL confidence
    TEXT action "shown|applied|dismissed"
    TEXT created_at
  }
  model_learned_trees {
    TEXT version_id PK "logic"
    TEXT screen_id
    TEXT tree "JSON"
    TEXT created_at
  }
  files {
    TEXT id PK
    TEXT project_id FK
    TEXT module_id FK "NULL = cấp dự án"
    TEXT name
    TEXT stored_name
    TEXT mime
    INTEGER size
    TEXT source "upload|export"
    TEXT sender "v2"
    TEXT received_at "v2"
    TEXT note "v2"
    TEXT uploaded_by FK "v2"
    TEXT created_at
  }
  members {
    TEXT id PK
    TEXT name
    TEXT role "BA|BA_LEAD"
    TEXT created_at
  }
  uc_diagrams {
    TEXT module_id PK,FK
    TEXT code "Mermaid"
    TEXT status "draft|approved|stale"
    TEXT approved_at
    TEXT updated_at
  }
  tasks {
    TEXT id PK
    TEXT project_id FK
    TEXT module_id FK
    TEXT title
    TEXT description
    TEXT assignee_id FK
    TEXT due_date "YYYY-MM-DD"
    TEXT priority "High|Medium|Low"
    TEXT status "todo|doing|done|redo"
    TEXT artifact_type "screen|docs|diagram|tests"
    TEXT artifact_id "logic"
    TEXT created_at
    TEXT updated_at
  }
  task_events {
    TEXT id PK
    TEXT task_id FK
    TEXT from_status "NULL = lúc tạo"
    TEXT to_status
    TEXT by_member_id FK
    INTEGER by_system "0|1"
    TEXT reason
    TEXT created_at
  }
  suggestion_dismissals {
    TEXT module_id PK,FK
    TEXT key PK
    TEXT created_at
  }
```

## 2. Nhóm bảng

| Nhóm | Bảng | Ghi chú |
|---|---|---|
| 11 bảng cũ (bản 4 ngày) | `projects`, `modules`, `screens`, `screen_versions`, `annotations`, `use_cases`, `requirements`, `srs`, `sequences`, `test_cases`, `prompt_runs` | Giữ nguyên, chỉ thêm cột (mục 3) |
| Gợi ý thành phần ML (nhánh `trung_ba`) | `suggestion_events`, `model_learned_trees` | Không đổi, ngoài phạm vi v2 |
| Kho tài liệu (nhánh `htrung-c4`) | `files` | Đã có, thêm cột nguồn (mục 3) |
| Mới ở v2 | `members`, `uc_diagrams`, `tasks`, `task_events`, `suggestion_dismissals` | Tạo bằng `CREATE TABLE IF NOT EXISTS` |

## 3. Cột thêm vào bảng đã có (`migrate()`)

`migrate()` đọc `PRAGMA table_info`, thiếu cột nào thì `ALTER TABLE … ADD COLUMN` cột đó. Gọi nhiều lần không lỗi, `openDb()` gọi mỗi lần mở DB, nên DB cũ trong `data/` được nâng cấp tự động mà không mất dữ liệu.

| Bảng.cột | Kiểu | Mặc định | Phục vụ |
|---|---|---|---|
| `modules.qus_score` | INTEGER NULL | NULL | FN-56 |
| `modules.qus_checked_at` | TEXT NULL | NULL | FN-56 |
| `screen_versions.author` | TEXT | `''` | FN-03 |
| `screen_versions.author_id` | TEXT NULL → `members(id)` ON DELETE SET NULL | NULL | FN-03 |
| `annotations.author_id` | TEXT NULL → `members(id)` ON DELETE SET NULL | NULL | FN-03 |
| `files.sender` | TEXT | `''` | FN-05 (stakeholder gửi) |
| `files.received_at` | TEXT NULL | NULL | FN-05 (ngày nhận) |
| `files.note` | TEXT | `''` | FN-05 |
| `files.uploaded_by` | TEXT NULL → `members(id)` ON DELETE SET NULL | NULL | FN-03, FN-05 |

SQLite chỉ cho `ADD COLUMN … REFERENCES` khi mặc định là NULL, vì vậy mọi cột khoá ngoại thêm sau đều cho phép NULL.

## 4. Khoá ngoại mới và lý do chọn `ON DELETE`

| Bảng con.cột | → Bảng cha | ON DELETE | Lý do |
|---|---|---|---|
| `tasks.project_id` | `projects` | CASCADE | Xoá dự án thì xoá luôn công việc |
| `tasks.module_id` | `modules` | SET NULL | Xoá module không làm mất task; task còn ở cấp dự án |
| `tasks.assignee_id` | `members` | SET NULL | API chặn xoá người đang giữ task mở (409). Task đã xong thì bỏ trống người làm |
| `task_events.task_id` | `tasks` | CASCADE | Lịch sử đi cùng task |
| `task_events.by_member_id` | `members` | SET NULL | Giữ lịch sử khi xoá thành viên |
| `uc_diagrams.module_id` | `modules` | CASCADE | Mỗi module có tối đa 1 sơ đồ |
| `suggestion_dismissals.module_id` | `modules` | CASCADE | |
| `files.uploaded_by`, `screen_versions.author_id`, `annotations.author_id` | `members` | SET NULL | Giữ dữ liệu; tên vẫn còn trong cột `author` |

## 5. Tham chiếu logic (không có khoá ngoại)

| Cột | Trỏ tới | Quy ước |
|---|---|---|
| `tasks.artifact_type` + `tasks.artifact_id` | `screens.id` khi `screen`; `modules.id` khi `docs`, `tests`, `diagram` | Có index `(artifact_type, artifact_id)` để tìm task theo sản phẩm (A7). Xoá màn không xoá task; agent A6 hiển thị "sản phẩm không còn" |
| `suggestion_dismissals.key` | gợi ý của `shared/suggest.ts` | `link:<screenId>:<nodeId>`, `fr:<code>`, `story:<hash>` |
| `prompt_runs.module_id`, `suggestion_events.screen_id`, `model_learned_trees.version_id` | như tên cột | Giữ như bản cũ |

## 6. Index

Cũ: `idx_modules_project`, `idx_screens_module`, `idx_versions_screen`, `idx_ann_screen`, `idx_runs_module`, `idx_sugg_screen`, `idx_files_project`, `idx_files_module` (`files(module_id)`).

Mới: `idx_tasks_project` (`tasks(project_id)`), `idx_tasks_artifact` (`tasks(artifact_type, artifact_id)`), `idx_task_events_task` (`task_events(task_id)`).

## 7. Ràng buộc giá trị (CHECK)

| Cột | Giá trị |
|---|---|
| `members.role` | `BA`, `BA_LEAD` |
| `uc_diagrams.status` | `draft`, `approved`, `stale` |
| `tasks.status` | `todo` (Cần làm), `doing` (Đang làm), `done` (Xong), `redo` (Cần làm lại) |
| `tasks.priority` | `High`, `Medium`, `Low` (cùng bộ giá trị với `Requirement.priority`) |
| `tasks.artifact_type` | `screen`, `docs`, `diagram`, `tests` hoặc NULL |
