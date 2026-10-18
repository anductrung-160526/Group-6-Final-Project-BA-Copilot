# Đánh giá trên 30 màn tham chiếu (thiết kế thủ công, không dùng khi huấn luyện)

## 1. Phát hiện phần tử thiếu – bỏ lần lượt từng node (leave-one-out)

| n | N-gram Hit@1 | N-gram Hit@3 | Transformer Hit@1 | Transformer Hit@3 | Đúng vị trí (Top-1) | Được gợi ý ở ngưỡng app (0.3) |
|---|---|---|---|---|---|---|
| 489 | 0.2% | 4.5% | 8.8% | 18.2% | 17.8% | 7.0% |

Transformer Hit@3 theo loại phần tử bị bỏ (≥ 5 lần):

| Loại | n | Hit@3 |
|---|---|---|
| Link | 124 | 7.3% |
| Button | 41 | 29.3% |
| Input | 38 | 28.9% |
| Row | 35 | 34.3% |
| Heading | 28 | 0.0% |
| Text | 25 | 0.0% |
| Column | 23 | 0.0% |
| Sidebar | 22 | 86.4% |
| Select | 19 | 10.5% |
| Card | 15 | 33.3% |
| Form | 15 | 40.0% |
| Stat | 15 | 26.7% |
| Table | 12 | 33.3% |
| Checkbox | 11 | 9.1% |
| DatePicker | 11 | 18.2% |
| Section | 10 | 10.0% |
| Header | 9 | 0.0% |
| Badge | 7 | 0.0% |
| Pagination | 6 | 0.0% |
| Textarea | 6 | 16.7% |
| List | 5 | 0.0% |

## 2. Gợi ý "Thêm" trên màn hoàn chỉnh (gợi ý thừa)

5/30 màn hoàn chỉnh (16.7%) vẫn có gợi ý "Thêm" (tổng 6 gợi ý):

- Đặt lại mật khẩu: Thêm Link (tài khoản) vào cuối Card "Đặt lại mật khẩu"
- Giỏ hàng: Thêm Button trước Link "Tiếp tục mua sắm"
- Chi tiết công việc: Thêm Button (hủy) sau Textarea "Viết bình luận"
- Tìm kiếm tài liệu: Thêm Table sau List
- Trang chủ hệ thống: Thêm Button (hủy) sau Stat "Số đơn"; Thêm Button (thêm mới) sau Stat "Sản phẩm"

## 3. Màn "prompt thiếu" (90 lượt = 30 màn × 3, mỗi lượt bỏ 2 phần tử) – chạy tab Gợi ý như trên app (k = 5)

### Độ liên quan

| Mô hình | Gợi ý "Thêm" | Trúng phần tử bị bỏ (precision) | Phần tử bị bỏ được gợi ý (recall) |
|---|---|---|---|
| N-gram | 0 | 0.0% | 0.0% |
| Transformer | 31 | 58.1% | 8.9% |

### Độ đa dạng

| Mô hình | Tổng gợi ý | Loại gợi ý khác nhau (tất cả / chỉ Thêm) | Entropy bit (tất cả / Thêm) | Tỷ trọng gợi ý phổ biến nhất (tất cả / Thêm) | Jaccard trung bình giữa 2 màn khác nhau ↓ | Câu prompt khác nhau |
|---|---|---|---|---|---|---|
| N-gram | 416 | 5 / 0 | 0.75 / 0.00 | 87.7% / 0.0% | 0.689 | 74 (17.8%) |
| Transformer | 151 | 11 / 7 | 2.49 / 2.41 | 47.7% / 32.3% | 0.119 | 48 (31.8%) |

N-gram – 5 gợi ý xuất hiện nhiều nhất: Xem lại (365), Sửa R3 (19), Sửa R2 (18), Sửa R9 (11), Sửa R8 (3)
N-gram – các gợi ý "Thêm": (không có)

Transformer – 5 gợi ý xuất hiện nhiều nhất: Sửa R9 (72), Sửa R3 (19), Sửa R2 (18), Sửa R8 (11), Thêm Button:cancel (10)
Transformer – các gợi ý "Thêm": Thêm Button:cancel (10), Thêm Button:submit (8), Thêm Stat (5), Thêm Input:number (4), Thêm Input:password (2), Thêm Input:email (1), Thêm Table (1)
