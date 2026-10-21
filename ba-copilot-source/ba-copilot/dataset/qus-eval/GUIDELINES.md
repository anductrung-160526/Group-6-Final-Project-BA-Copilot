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

## Dữ liệu và chia tập
- 206 user story thật từ 3 bộ công khai (Dalpiaz et al., "Requirements data sets (user stories)"): g02 federalspending (98), g03 loudoun (58), g04 recycling (50). Người dùng tải lên ngày 21/10/2026.
- Chia theo bộ gốc: **dev = g04** (dùng để chỉnh luật), **test = g02 + g03** (chấm một lần sau khi khoá luật).
- Nhãn (`labels.jsonl`) do AI gán theo hướng dẫn này, mỗi lỗi kèm lý do, **commit trước khi chạy bộ chấm mới lên dữ liệu**.
- Ca biên đã quyết khi gán: "Upload and Validate" (g02-012) là tên trang, không tính atomic; "enter my zip code and get a list" (g04-003), "browse … and see …" (g04-048) là một luồng tìm kiếm, không tính atomic; "I want to" và "I want to be able to" cùng mẫu "I want"; câu tách đôi ". So that" (g03-020) không tính lỗi; lỗi chính tả không tính lỗi.
- **Sửa nhãn trên tập dev (sau lần chạy dev đầu tiên):** g04-006 uniform đổi sai → đúng, vì nhãn ban đầu mâu thuẫn với quy tắc đã áp cho g02-040 ("so I can" lệch mẫu). Không sửa nhãn nào của tập test.

## Vòng 2 (thêm dữ liệu)
- Thêm 2 bộ: g05 openspending (53), g08 frictionless (66) → **test2** (chưa từng chạy bộ chấm). Dev vòng 2 = g02 + g03 + g04 (207; tập test vòng 1 đã dùng hết nên chuyển sang dev).
- Nhãn test2 gán và commit trước khi chạy bộ chấm. Ca biên chốt thêm khi gán:
  - vai trò ghép dính ("ResearcherPublisher", "DeveloperDataWrangler", "ResearcherGovernment Publisher") là **một** persona kiêm nhiều vai, không tính atomic (tiêu chí atomic xét số tính năng);
  - cụm bổ nghĩa cho vai trò ("As a Researcher, working with data in NetCDF, …") là một phần của vai trò, không tính minimal;
  - "/" hoặc "|" giữa hai danh từ ("LibreOffice/OpenOffice", "region|city", "file/files") không tính atomic; giữa hai động từ ("import/export") thì tính;
  - "I would like" khác họ "I want" → uniform khi đa số bộ dùng "I want"; "So that" viết hoa vẫn cùng mẫu "so that".

## Vòng 3 (tập test thứ ba)
- **Sửa định nghĩa well-formed cho đúng Bảng 1 của bài báo:** chỉ cần có vai trò và cụm chỉ dấu hành động ("I want/can/need/would like …"). Phần hành động là cụm danh từ ("I want an Elasticsearch integration") **vẫn well-formed**. Bỏ vế "hành động không có động từ" ở bảng trên (đó là thêm của nhóm và gây nhãn không nhất quán ở vòng 2).
- Thêm 5 bộ: g10 scrumalliance (97), g11 nsf (73), g12 camperplus (55), g13 planningpoker (53, mã hoá Windows-1252), g14 datahub (67) → **test3, 345 story**, gán nhãn theo định nghĩa đã sửa và commit trước khi chạy bộ chấm. Dev vòng 3 = g02, g03, g04, g05, g08.
- Ca biên chốt thêm khi gán: "so that that" (lặp chữ) và "so that so that" là lỗi gõ, không tính lỗi; "etc." trong danh sách tân ngữ không tính minimal; "I'm able to", "I would be able to" không phải cụm chỉ dấu hành động → well-formed và uniform; chi tiết trong ngoặc nhọn tính minimal; "since …" thay "so that" tính uniform.
