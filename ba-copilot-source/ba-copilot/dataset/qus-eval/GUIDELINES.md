# Hướng dẫn gán nhãn lỗi QUS

Dùng để tạo đáp án đánh giá bộ chấm QUS (`labels.jsonl`). Viết và commit trước khi gán nhãn.
Định nghĩa theo Lucassen et al. 2016, Bảng 1 và §3. Mỗi story gán 5 nhãn đúng/sai độc lập; story vi phạm ghi lý do một dòng.
Áp dụng quy tắc dưới đây một cách máy móc, không thêm ngoại lệ theo từng câu. Lỗi chính tả, lỗi ngữ pháp, lặp chữ ("so that that", "so that so that") **không** tính lỗi.

## Cụm chỉ dấu
- **Vai trò:** "As a", "As an", "As the" (cùng một họ).
- **Hành động:** họ "I want" = "I want", "I want to", "I want to be able to"; các họ khác: "I would like / I'd like", "I need", "I can", "I don't want / I do not want", "I only want".
- **Lý do:** "so that" (không phân biệt hoa thường); các dạng khác: "so", "so I can", "so we can", "in order to", "since".

## 1. well-formed – vi phạm khi
- không có cụm chỉ dấu vai trò, hoặc
- không có cụm chỉ dấu hành động trong danh sách trên ("I'm able to", "I would be able to", "would like" thiếu chủ ngữ đều **không** phải cụm chỉ dấu hành động).
- Phần hành động là cụm danh từ ("I want an Elasticsearch integration") **không** vi phạm. Thiếu phần lý do **không** vi phạm.

## 2. atomic – vi phạm khi
Phần hành động **chính** chứa từ hai động từ chỉ hành động khác nhau trở lên, nối bằng "and", "or", dấu phẩy, hoặc "/" giữa hai động từ ("import/export", "copy/paste", "indent / outdent"); hoặc vai trò gồm hai loại người dùng tách biệt ("Admin & Editor", "admin and editor").
**Không** vi phạm khi:
- (a) các động từ nằm trong mệnh đề phụ hoặc bổ ngữ: sau "that/which/who/how/what/when/whether/if", trong cụm "to be …" bổ nghĩa danh từ, trong cụm "by …ing", hoặc trong mệnh đề mục đích ("so I can …"). Ví dụ: "ensure that attempts to correct or delete … don't create …", "determine how agencies will generate and validate …", "codes that reflect … and provide …", "extend an ad by visiting the site and updating the posting";
- (b) động từ thứ hai là **kết quả người dùng nhận được** từ hành động thứ nhất: "get (a list)", "see which …", "find …", "pass validations", "have it (automatically) stored";
- (c) cụm là tên riêng (tên trang, tên chức năng): "Upload and Validate (page)";
- (d) một động từ với nhiều tân ngữ ("export orders and invoices", "update my information and the type of material");
- (e) "/" hoặc "|" giữa hai danh từ ("query/report", "region|city", "LibreOffice/OpenOffice");
- (f) vai trò ghép dính ("ResearcherPublisher") – một persona.

## 3. minimal – vi phạm khi
Có nội dung ngoài vai trò, hành động, lý do:
- ghi chú hoặc chi tiết trong ngoặc tròn, vuông, nhọn – trừ viết tắt ngay sau tên đầy đủ ("Content Management System (CMS)") và dấu số nhiều "(s)";
- ví dụ: "such as", "e.g.", "for example", "for instance", "i.e.";
- hai phần lý do nối tiếp hoặc lồng nhau ("…, so that …, so that …", "so parents can …, so that …", "so that I can see …, so I can ask …");
- chữ hoặc ký hiệu thừa trước cụm vai trò ("[Analytics]", "*", "US12:");
- một câu thêm không phải phần lý do (câu thứ hai mở bằng "So that" là phần lý do, không tính).
**Không** vi phạm: "etc." trong danh sách tân ngữ; danh sách sau dấu hai chấm là tân ngữ ("set the following dates: A, B, C"); cụm bổ nghĩa vai trò ("As a Researcher, working with data, …").

## 4. uniform – vi phạm khi (xét trong từng bộ)
Story lệch mẫu đa số của bộ ở **bất kỳ** phần nào:
- họ cụm chỉ dấu vai trò khác đa số;
- họ cụm chỉ dấu hành động khác đa số, hoặc không có cụm chỉ dấu hành động;
- **có** phần lý do nhưng cụm chỉ dấu lý do khác đa số của các story có lý do.
Thiếu phần lý do **không** tính là lệch.

## 5. unique – vi phạm khi
Trùng y hệt một story khác trong cùng bộ, sau khi bỏ qua chữ hoa, dấu câu, khoảng trắng. Story đứng sau bị tính lỗi. Gần giống nhưng khác chữ không tính (như AQUSA v1, §5.1).

## Ghi chú về quy trình
- 3 người gán độc lập (agent AI không có ký ức) chỉ đọc hướng dẫn này và danh sách story, không thấy kết quả bộ chấm; mỗi người gán toàn bộ 671 story (`independent/agent{1,2,3}.jsonl`).
- Đáp án chính thức `labels.jsonl` = nhãn **đa số** (≥ 2/3). Fleiss' kappa giữa 3 người gán: 0,98.
- Hạn chế: 3 người gán cùng một loại mô hình AI nên dễ sai giống nhau; cần thêm người gán thật (`kappa-sample.csv`).
