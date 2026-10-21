# BA Copilot

Hệ thống web hỗ trợ Business Analyst đi trọn luồng **User story → Thiết kế UI → Tài liệu (BRD, UC, SRS, FRD-NFR, API) → Sơ đồ → Test case → Truy vết**, có duyệt theo vai BA / BA Lead và đẩy sản phẩm đã duyệt lên GitHub. Mọi đầu ra AI là *bản nháp* để BA duyệt.

## Dùng thử trên web

| | |
| --- | --- |
| **Link** | <https://ba-copilot.up.railway.app/> |
| **Mật khẩu** | `123321` |

1. Mở link, nhập mật khẩu.
2. Chọn tên ở ô **Select your name…** trên thanh trên — ví dụ **Lan Nguyen** (BA Lead, có quyền Approve / Request changes / Administration).
3. Mở dự án mẫu **Electronics Store (sample)** để xem đủ các phần: Task Board, Business Requirements, Deliverables (Documents, Diagrams, Prototype, Test Cases, Traceability), Document Repository, AI Log, GitHub History.

## Chạy trên máy

Yêu cầu **Node.js 22.13 trở lên** (`node -v`).

```bash
cd ba-copilot-source/ba-copilot
npm install        # cài thư viện (một lần)
npm run seed       # tạo dự án mẫu và 3 thành viên
npm start          # build giao diện + chạy server
```

Mở **http://localhost:3000**. Không có khoá Claude thì hệ thống chạy **Mock mode** (bộ sinh rule-based), vẫn đi trọn luồng. Cách gắn Claude: chép `.env.example` thành `.env` rồi điền khoá.

## Cơ sở dữ liệu

SQLite tích hợp sẵn trong Node, không cần cài máy chủ CSDL. Bản dữ liệu nộp kèm nằm ở [`ba-copilot-source/ba-copilot/database/`](ba-copilot-source/ba-copilot/database/):

- `ba-copilot.db` — toàn bộ dữ liệu, mở bằng [DB Browser for SQLite](https://sqlitebrowser.org/dl/) → *Open Database* → tab *Browse Data*.
- `ba-copilot.sql` — cùng dữ liệu dạng lệnh SQL.
- `ERD.md`, `ERD.png`, `ERD-day-du.png` — sơ đồ quan hệ thực thể.

## Cấu trúc repo

| Thư mục | Nội dung |
| --- | --- |
| [`ba-copilot-source/ba-copilot/`](ba-copilot-source/ba-copilot/) | Mã nguồn phần mềm (client React, server Node, shared, tests, e2e, database) |
| [`docs/`](docs/) | Tài liệu thiết kế: design system, kế hoạch, tài liệu QUS |

## Tài liệu chi tiết

- [README của phần mềm](ba-copilot-source/ba-copilot/README.md) — cách dùng, quy tắc nghiệp vụ, kiến trúc, gợi ý bố cục, kiểm thử, biến môi trường.
- [DEPLOY.md](ba-copilot-source/ba-copilot/DEPLOY.md) — cách deploy lên Railway.
- [database/README.md](ba-copilot-source/ba-copilot/database/README.md) — xem dữ liệu và truy vấn mẫu.
