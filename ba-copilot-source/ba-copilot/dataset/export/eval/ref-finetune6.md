# Đánh giá trên 30 màn tham chiếu (thiết kế thủ công, không dùng khi huấn luyện)

## 1. Phát hiện phần tử thiếu – bỏ lần lượt từng node (leave-one-out)

| n | N-gram Hit@1 | N-gram Hit@3 | Transformer Hit@1 | Transformer Hit@3 | Đúng vị trí (Top-1) | Được gợi ý ở ngưỡng app (0.3) |
|---|---|---|---|---|---|---|
| 489 | 0.2% | 4.5% | 7.4% | 17.4% | 19.8% | 4.7% |

Transformer Hit@3 theo loại phần tử bị bỏ (≥ 5 lần):

| Loại | n | Hit@3 |
|---|---|---|
| Link | 124 | 4.8% |
| Button | 41 | 31.7% |
| Input | 38 | 47.4% |
| Row | 35 | 22.9% |
| Heading | 28 | 10.7% |
| Text | 25 | 4.0% |
| Column | 23 | 0.0% |
| Sidebar | 22 | 0.0% |
| Select | 19 | 42.1% |
| Card | 15 | 33.3% |
| Form | 15 | 33.3% |
| Stat | 15 | 40.0% |
| Table | 12 | 33.3% |
| Checkbox | 11 | 18.2% |
| DatePicker | 11 | 9.1% |
| Section | 10 | 0.0% |
| Header | 9 | 0.0% |
| Badge | 7 | 0.0% |
| Pagination | 6 | 66.7% |
| Textarea | 6 | 16.7% |
| List | 5 | 0.0% |

## 2. Gợi ý "Thêm" trên màn hoàn chỉnh (gợi ý thừa)

6/30 màn hoàn chỉnh (20.0%) vẫn có gợi ý "Thêm" (tổng 6 gợi ý):

- Đặt lại mật khẩu: Thêm Link (tài khoản) vào cuối Card "Đặt lại mật khẩu"
- Giỏ hàng: Thêm Button trước Link "Tiếp tục mua sắm"
- Duyệt đơn nghỉ phép: Thêm Button (hủy) trước Button "Duyệt"
- Tìm kiếm tài liệu: Thêm Table sau List
- Phiếu nhập kho: Thêm Input (tên) trước Select "Nhà cung cấp"
- Trang chủ hệ thống: Thêm Text vào cuối Card "Sắp hết hàng"

## 3. Màn "prompt thiếu" (90 lượt = 30 màn × 3, mỗi lượt bỏ 2 phần tử) – chạy tab Gợi ý như trên app (k = 5)

### Độ liên quan

| Mô hình | Gợi ý "Thêm" | Trúng phần tử bị bỏ (precision) | Phần tử bị bỏ được gợi ý (recall) |
|---|---|---|---|
| N-gram | 0 | 0.0% | 0.0% |
| Transformer | 38 | 57.9% | 12.2% |

### Độ đa dạng

| Mô hình | Tổng gợi ý | Loại gợi ý khác nhau (tất cả / chỉ Thêm) | Entropy bit (tất cả / Thêm) | Tỷ trọng gợi ý phổ biến nhất (tất cả / Thêm) | Jaccard trung bình giữa 2 màn khác nhau ↓ | Câu prompt khác nhau |
|---|---|---|---|---|---|---|
| N-gram | 416 | 5 / 0 | 0.75 / 0.00 | 87.7% / 0.0% | 0.689 | 74 (17.8%) |
| Transformer | 159 | 15 / 11 | 2.77 / 3.22 | 45.9% / 18.4% | 0.107 | 55 (34.6%) |

N-gram – 5 gợi ý xuất hiện nhiều nhất: Xem lại (365), Sửa R3 (19), Sửa R2 (18), Sửa R9 (11), Sửa R8 (3)
N-gram – các gợi ý "Thêm": (không có)

Transformer – 5 gợi ý xuất hiện nhiều nhất: Sửa R9 (73), Sửa R3 (19), Sửa R2 (18), Sửa R8 (11), Thêm Pagination (7)
Transformer – các gợi ý "Thêm": Thêm Pagination (7), Thêm Table (6), Thêm Button:submit (5), Thêm Input:name (5), Thêm Button:cancel (4), Thêm Button:other (3), Thêm Input:email (2), Thêm Input:password (2)
