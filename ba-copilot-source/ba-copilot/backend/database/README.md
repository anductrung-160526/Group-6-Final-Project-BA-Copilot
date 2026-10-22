# Cơ sở dữ liệu BA Copilot (bản xuất)

Xuất lúc 2026-10-21T02:41:12.499Z bằng lệnh `npm run export-db`. Gồm 25 bảng, 142 dòng.

| Tệp | Nội dung |
|---|---|
| `ba-copilot.db` (568 KB) | Toàn bộ dữ liệu dạng tệp SQLite, một tệp duy nhất |
| `ba-copilot.sql` (293 KB) | Cùng dữ liệu đó dưới dạng lệnh SQL (cấu trúc bảng + `INSERT`), đọc được bằng trình soạn thảo |
| `files/` | Tệp trong Kho tài liệu. Bảng `files`, cột `stored_name` là tên tệp trong thư mục này |
| `ERD.md` | Sơ đồ quan hệ, danh sách bảng kèm số dòng, khoá ngoại. Ảnh: `ERD.png` (tổng quan), `ERD-day-du.png` (đầy đủ) |

## Xem dữ liệu

1. Cài **DB Browser for SQLite** (miễn phí, https://sqlitebrowser.org/dl/).
2. *Open Database* → chọn `ba-copilot.db`.
3. Tab *Browse Data* để xem từng bảng; tab *Execute SQL* để chạy truy vấn, ví dụ:

```sql
-- Số user story, tài liệu, sơ đồ của từng dự án
SELECT p.name,
  (SELECT COUNT(*) FROM user_stories s WHERE s.project_id = p.id) AS stories,
  (SELECT COUNT(*) FROM module_docs d JOIN modules m ON m.id = d.module_id WHERE m.project_id = p.id) AS docs,
  (SELECT COUNT(*) FROM module_diagrams g JOIN modules m ON m.id = g.module_id WHERE m.project_id = p.id) AS diagrams
FROM projects p;
```

Không cài gì: mở `ba-copilot.sql` bằng trình soạn thảo bất kỳ.

## Chạy phần mềm trên đúng dữ liệu này

Chép `ba-copilot.db` vào `data/ba-copilot.db` và thư mục `files/` vào `data/files/`, rồi `npm start`.

## Bảo mật

Bản xuất đã xoá token GitHub, mật khẩu thành viên và khoá ký phiên đăng nhập. Dữ liệu gốc ở `data/` (không đưa lên Git) vẫn giữ nguyên.
