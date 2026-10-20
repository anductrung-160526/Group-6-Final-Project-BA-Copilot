# Đánh giá trên 30 màn tham chiếu (thiết kế thủ công, không dùng khi huấn luyện)

## 1. Phát hiện phần tử thiếu – bỏ lần lượt từng node (leave-one-out)

| n | N-gram Hit@1 | N-gram Hit@3 | Transformer Hit@1 | Transformer Hit@3 | Đúng vị trí (Top-1) | Được gợi ý ở ngưỡng app (0.3) |
|---|---|---|---|---|---|---|
| 489 | 0.2% | 4.5% | 3.7% | 11.2% | 18.0% | 3.3% |

Transformer Hit@3 theo loại phần tử bị bỏ (≥ 5 lần):

| Loại | n | Hit@3 |
|---|---|---|
| Link | 124 | 12.1% |
| Button | 41 | 22.0% |
| Input | 38 | 44.7% |
| Row | 35 | 2.9% |
| Heading | 28 | 21.4% |
| Text | 25 | 8.0% |
| Column | 23 | 0.0% |
| Sidebar | 22 | 0.0% |
| Select | 19 | 0.0% |
| Card | 15 | 0.0% |
| Form | 15 | 0.0% |
| Stat | 15 | 13.3% |
| Table | 12 | 16.7% |
| Checkbox | 11 | 0.0% |
| DatePicker | 11 | 0.0% |
| Section | 10 | 0.0% |
| Header | 9 | 0.0% |
| Badge | 7 | 0.0% |
| Pagination | 6 | 0.0% |
| Textarea | 6 | 0.0% |
| List | 5 | 0.0% |

## 2. Gợi ý "Thêm" trên màn hoàn chỉnh (gợi ý thừa)

12/30 màn hoàn chỉnh (40.0%) vẫn có gợi ý "Thêm" (tổng 13 gợi ý):

- Quên mật khẩu: Thêm Heading trước Text "Nhập email để nhận liên kết đặt lại mật "
- Xác thực OTP: Thêm Heading trước Text "Mã OTP đã được gửi tới số điện thoại của"
- Cài đặt thông báo: Thêm Heading trước Checkbox "Tin nhắn mới"; Thêm Heading trước Checkbox "Đơn hàng mới"
- Chi tiết đơn hàng: Thêm Heading trước Text "Trần Bình"
- Dashboard bán hàng: Thêm Link vào cuối List
- Danh sách khách hàng: Thêm Text sau Heading "Khách hàng"
- Chi tiết công việc: Thêm Heading trước Text "Thiết kế màn đăng nhập theo hướng dẫn th"
- Liên hệ hỗ trợ: Thêm Heading trước Text "Hotline: 1900 1234"
- Tìm kiếm tài liệu: Thêm Heading trước Text "Cập nhật 01/10"
- Quản lý người dùng: Thêm Text sau Heading "Người dùng"
- Thông báo: Thêm Text sau Heading "Thông báo"
- Trang chủ hệ thống: Thêm Heading vào cuối Card "Sắp hết hàng"

## 3. Màn "prompt thiếu" (90 lượt = 30 màn × 3, mỗi lượt bỏ 2 phần tử) – chạy tab Gợi ý như trên app (k = 5)

### Độ liên quan

| Mô hình | Gợi ý "Thêm" | Trúng phần tử bị bỏ (precision) | Phần tử bị bỏ được gợi ý (recall) |
|---|---|---|---|
| N-gram | 0 | 0.0% | 0.0% |
| Transformer | 48 | 25.0% | 7.2% |

### Độ đa dạng

| Mô hình | Tổng gợi ý | Loại gợi ý khác nhau (tất cả / chỉ Thêm) | Entropy bit (tất cả / Thêm) | Tỷ trọng gợi ý phổ biến nhất (tất cả / Thêm) | Jaccard trung bình giữa 2 màn khác nhau ↓ | Câu prompt khác nhau |
|---|---|---|---|---|---|---|
| N-gram | 416 | 5 / 0 | 0.75 / 0.00 | 87.7% / 0.0% | 0.689 | 74 (17.8%) |
| Transformer | 169 | 14 / 10 | 2.72 / 2.56 | 43.2% / 41.7% | 0.123 | 60 (35.5%) |

N-gram – 5 gợi ý xuất hiện nhiều nhất: Xem lại (365), Sửa R3 (19), Sửa R2 (18), Sửa R9 (11), Sửa R8 (3)
N-gram – các gợi ý "Thêm": (không có)

Transformer – 5 gợi ý xuất hiện nhiều nhất: Sửa R9 (73), Thêm Heading (20), Sửa R3 (19), Sửa R2 (18), Thêm Text (11)
Transformer – các gợi ý "Thêm": Thêm Heading (20), Thêm Text (11), Thêm Input:search (4), Thêm Input:name (3), Thêm Input:email (2), Thêm Button:submit (2), Thêm Table (2), Thêm Button:other (2)
