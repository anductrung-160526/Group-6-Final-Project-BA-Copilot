# Hướng dẫn gán nhãn lỗi QUS (5 tiêu chí AQUSA)

Viết trước khi gán nhãn và trước khi chạy bộ chấm mới lên dữ liệu. Định nghĩa theo Lucassen et al. 2016, Bảng 1 và §3.
Mỗi story gán 5 nhãn đúng/sai độc lập. Story vi phạm thì ghi lý do một dòng. Gán nhãn **không xem kết quả của bộ chấm**.

| Tiêu chí | Vi phạm khi | Không vi phạm |
|---|---|---|
| **well-formed** | Thiếu vai trò (không có "As a/an/the …" hoặc tương đương) hoặc thiếu hành động ("I want/can/need/would like …"); hoặc vai trò không phải người dùng, hành động không có động từ | Thiếu "so that" (ends là tuỳ chọn) |
| **atomic** | Phần hành động chứa từ hai tính năng trở lên nối bằng and/or/&/+/"/"/","; hoặc vai trò gồm hai loại người dùng ("admin and editor") | Danh từ ghép hay tên riêng có "&" ("R&D Manager", "Q&A page"); "and" nối hai tân ngữ của **một** động từ ("export orders and invoices" – vẫn một tính năng); "and" trong phần ends |
| **minimal** | Có thêm nội dung ngoài role/means/ends: ghi chú hoặc ví dụ trong ngoặc, câu thứ hai, "e.g.", "note:", chữ hoặc ký hiệu thừa ở đầu ("[Analytics]", "*", "US12:") | Viết tắt trong ngoặc ngay sau tên đầy đủ ("Content Management System (CMS)"); mã story là cột riêng, không nằm trong câu |
| **uniform** | Story dùng mẫu cụm chỉ dấu khác với mẫu chiếm đa số **trong cùng bộ** (ví dụ cả bộ dùng "As a … I want to … so that" nhưng story này dùng "As a … I can …" hoặc không có vai trò) | Chỉ khác "a"/"an"; chỉ thiếu phần ends |
| **unique** | Trùng y hệt một story khác trong cùng bộ (bỏ qua chữ hoa, dấu câu, khoảng trắng) – story đứng sau bị tính lỗi | Gần giống nhưng khác chi tiết (bài báo cũng chỉ tính trùng chính xác, §5.1) |

Ca biên đã chốt:
- Story không theo mẫu nào: well-formed = sai; uniform = sai nếu cả bộ đa số theo mẫu.
- Một story có thể vi phạm nhiều tiêu chí.
- "I want to be able to X and Y": atomic khi X, Y là hai hành động.
- "As a user I want to search, filter and sort products": atomic (ba hành động).
