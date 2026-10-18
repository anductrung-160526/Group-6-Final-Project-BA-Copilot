> **Đã thay thế:** bộ lọc ứng dụng (A) đã bị gỡ khi tính năng chuyển hẳn sang phương pháp của bài báo. Xem `LAYOUT-SUGGEST.md`. Báo cáo này chỉ giữ để tham khảo.

# Cải thiện gợi ý: A (bộ lọc ứng dụng) + C (thêm dữ liệu) – kết quả trước/sau

**Trước:** Recursive (Li et al. 2020) học trên 200 màn gốc (1.071 cây), hidden 256 × 6 lớp, không lọc.
**Sau:** Recursive học trên 300 màn gốc (1.617 cây), cấu hình dò lại theo val → hidden 256 × 2 lớp, kèm bộ lọc ứng dụng.

So sánh công bằng: **cùng 22 màn test cũ** (1280 px). 100 màn mới chia train/val/test theo cùng quy tắc băm theo màn gốc, nên 13 màn mới rơi vào test; kết quả trên tập test mở rộng 35 màn ghi riêng.

## C – thêm 100 màn gốc
- R201–R300, 25 loại màn web hướng người dùng cuối, khác 200 màn nghiệp vụ nội bộ:
  - thương mại: chi tiết sản phẩm, danh mục, thanh toán, theo dõi đơn, khuyến mãi, đánh giá;
  - giới thiệu: trang đích, giới thiệu công ty, liên hệ, bản tin, tuyển dụng;
  - nội dung: blog, bài viết + bình luận, sự kiện, khóa học;
  - dịch vụ: đặt lịch, đặt phòng, cửa hàng, tài khoản của tôi, trạng thái hệ thống, 404, chào mừng, hồ sơ công khai.
- 12 miền mới, 3 kiểu quyền mới (khách vãng lai, khách đã đăng nhập, quản trị nội dung). Ma trận: `buildExtension()` trong `scripts/dataset/matrix.ts`.
- Kiểm tra: 300 màn, 0 lỗi, 300/300 tên khác nhau, không màn mới nào giống màn khác từ 70% trở lên.
- **Vẫn do Claude soạn** (`dataset/src/batch_ext-0*.py`), chưa phải màn thật do BA vẽ.
- Dữ liệu tọa độ `data/paper-w7c20-r300`: 1.617 / 231 / 35 cây. 1.261 cây cũ giữ nguyên từng tọa độ.

## Thang đo của bài báo (22 màn test cũ, trung bình 6 thiết lập BFS/DFS 10/50/80%)
| | Trước | Sau |
|---|---|---|
| Pair F1 chặt (loại + tọa độ) | 43,8 | **44,7** |
| Next chặt | 3,8 | **9,1** |
| Edit chặt (s, thấp hơn là tốt) | 36,1 | **34,7** |
| Pair F1 nới lỏng (chỉ loại) | 56,4 | **57,2** |
| Next nới lỏng | **34,8** | 31,8 |
| Edit nới lỏng (s) | 27,0 | **25,8** |

## Phần tử kế tiếp và chèn đúng chỗ (22 màn test cũ)
| | Trước | Sau |
|---|---|---|
| Next: đúng loại | **34,8%** | 31,8% |
| Next: lệch ≤ 1 ô | 12,9% | **17,4%** |
| Next: IoU ≥ 0,5 | 19,7% | **21,2%** |
| Chèn: đúng khe + đúng loại | 16,6% | **17,5%** |
| Chèn: thiếu ở giữa, đúng cả hai | **3,5%** | 3,0% |
| Chèn: không sinh gì | 55,5% | **48,7%** |

## Gợi ý như BA nhìn thấy (bỏ 1 phần tử lá, 217 trường hợp, 22 màn test cũ; tối đa 5 gợi ý)
| | Trước, không lọc | Sau, không lọc | Sau, có lọc (app) |
|---|---|---|---|
| Có gợi ý đúng phần tử thiếu | **26,3%** | 25,8% | 19,8% |
| Trong các gợi ý hiển thị, tỷ lệ đúng | 30,1% | 24,9% | **39,4%** |
| Số gợi ý mỗi màn | 1,24 | 1,52 | 0,50 |
| Gợi ý thừa trên màn đã đủ | 0,82 | 0,91 | **0,23** |

Tập test mở rộng 35 màn (505 trường hợp), mô hình sau:
- không lọc: trúng 25,7%, chính xác 22,2%, gợi ý thừa 1,06/màn;
- có lọc: trúng 19,2%, chính xác 31,1%, gợi ý thừa 0,34/màn.

## A – bộ lọc ứng dụng (`RECURSIVE_FILTER`, `shared/nextComponent.ts`)
Bộ lọc không thuộc phương pháp của bài báo và không đổi mô hình. Gồm 3 luật:
1. ngưỡng tin cậy 0,7;
2. bỏ loại "một lần mỗi container" đã có (Heading, Pagination, Table, Avatar, Alert; Heading khi Card/Section/Form/Modal đã có tiêu đề hoặc Header đã có Heading);
3. một gợi ý mỗi container.

Ngưỡng 0,7 chọn trên val của dữ liệu 300 màn theo F1 giữa tỷ lệ trúng và độ chính xác. Các ngưỡng 0,3–0,7 cho F1 gần như bằng nhau (26,0–27,2), nên đây là đánh đổi: ngưỡng cao cho ít gợi ý nhưng đúng hơn. Luật 2 và 3 không làm mất gợi ý đúng nào; phần trúng giảm là do ngưỡng.

## Nhận xét
- **Thêm 100 màn (C) cải thiện phần tọa độ:**
  - Next chặt tăng từ 3,8 lên 9,1;
  - lệch ≤ 1 ô tăng 4,5 điểm;
  - Edit giảm khoảng 1,3 s;
  - mô hình ít "im lặng" hơn (không sinh gì: 55,5% → 48,7%).
- **Phần đoán loại không tăng, thậm chí giảm nhẹ** (Next đúng loại 34,8% → 31,8%). Có thể vì 100 màn mới có phong cách khác 22 màn test cũ (toàn màn nghiệp vụ).
- Trên tập test chỉ 22 màn, chênh 1–3 điểm nằm trong dao động thống kê (±2–4 điểm, xem `LEARNING-CURVE.md`). Kết luận chắc chắn nhất: **tọa độ tốt hơn rõ, loại phần tử chưa tốt hơn**.
- **Bộ lọc (A) thay đổi rõ trải nghiệm:**
  - gợi ý thừa trên màn đã đủ giảm 4 lần (0,91 → 0,23/màn);
  - 39% gợi ý hiển thị là đúng (trước 30%);
  - đổi lại, khoảng 1/5 trường hợp thiếu thật bị ẩn mất gợi ý đúng.
- **Chỗ thiếu ở giữa vẫn khoảng 3%.** Thêm dữ liệu cùng cách huấn luyện không sửa được điểm này (xem V4 trong `COORDS-EXPERIMENT.md`).
- **Muốn tăng tiếp:** cần màn thật do BA vẽ hoặc màn do Sinh thiết kế bằng Claude tạo, và tập test lớn hơn.

## Chạy lại
```bash
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/paper/build-dataset.ts --widths 768,1024,1280,1366,1440,1600,1920 --cell-y 20 --out data/paper-w7c20-r300
python3 scripts/paper/train_faithful.py --data=data/paper-w7c20-r300 && python3 scripts/paper/export_recursive.py
npx tsx scripts/paper/eval-filter.ts            # → eval-filter-after-test35.json (gồm 22 màn test cũ)
```
Files: `recursive-faithful.json` (sau), `recursive-faithful-r200.json` (trước), `eval-filter-before.json`, `eval-filter-after-test22.json`, `eval-filter-after-test35.json`.
