# Chọn mô hình cho tính năng Gợi ý: so sánh 3 bộ giải mã của Li et al. 2020 với Transformer phát hiện chỗ thiếu của app

**Dữ liệu:** chỉ bộ dữ liệu UI web của nhóm, phiên bản `a2e83358b8`. Không dùng dữ liệu hay trọng số WebSight ở bất kỳ mô hình nào.
- Tập test là các màn gốc thuộc tập test, chưa dùng khi huấn luyện.
  - 22 cây có tọa độ cho Pointer, Recursive và Vanilla.
  - 23 cây cho mô hình của app, vì không có bước lọc tọa độ.
- Mỗi mô hình chọn cấu hình theo val: hidden ∈ {64, 128}, số lớp ∈ {2, 4}, early stopping.

## Các mô hình
| Mô hình | Cấu hình chọn | Tham số | Cần tọa độ? | Thứ tự duyệt |
|---|---|---|---|---|
| Vanilla (mục 4.2) | d 128, 2 lớp | 562 nghìn | Có | Chỉ DFS |
| Pointer (mục 4.3) | d 128, 2 lớp | 578 nghìn | Có | BFS và DFS |
| Recursive (mục 4.4) | d 128, 2 lớp | 667 nghìn | Có | BFS và DFS |
| **App: Transformer phát hiện chỗ thiếu** (hai chiều, huấn luyện từ đầu, 10 epoch) | d 96, 4 lớp | 479 nghìn | Không | Bất kỳ, kể cả chỗ thiếu ở giữa |

## Kết quả bản nới lỏng (chỉ so loại) – thước đo chung được cho cả 4 mô hình
Mỗi ô ghi F1 / Next / Next Top-3 / Edit (giây KLM). Chữ in đậm là kết quả tốt nhất trong cột.

| Mô hình | BFS 10% | BFS 50% | BFS 80% |
|---|---|---|---|
| Pointer | 19,4 / 18,2 / 54,5 / 48,3 | 60,1 / 31,8 / 50,0 / 30,8 | 83,8 / 22,7 / 40,9 / 13,9 |
| Recursive | 25,5 / 31,8 / 50,0 / 46,6 | 62,8 / 13,6 / 36,4 / **24,8** | **86,3** / 27,3 / 40,9 / **8,1** |
| **App** | **27,0 / 47,8 / 73,9 / 46,2** | **65,1 / 39,1 / 47,8** / 26,9 | 83,3 / **30,4 / 69,6** / 12,3 |
| Không gợi ý | 6,9 / – / – / 71,2 | 62,7 / – / – / 40,2 | 87,5 / – / – / 16,3 |

| Mô hình | DFS 10% | DFS 50% | DFS 80% |
|---|---|---|---|
| Vanilla | 26,1 / 40,9 / 59,1* / **43,1** | 59,4 / 31,8 / 54,5* / **27,7** | 81,3 / 31,8 / 59,1* / 10,1 |
| Pointer | 19,4 / 31,8 / 63,6 / 48,3 | 57,5 / 36,4 / 45,5 / 30,1 | **86,3 / 36,4** / 50,0 / 10,7 |
| Recursive | 25,5 / **40,9** / 63,6 / 46,6 | 60,0 / 22,7 / **72,7** / 28,3 | 85,3 / 31,8 / 45,5 / **9,7** |
| **App** | **26,5** / 39,1 / **69,6** / 45,9 | **63,6 / 39,1** / 56,5 / 32,2 | 84,0 / 13,0 / 52,2 / 13,9 |
| Không gợi ý | 6,9 / – / – / 71,2 | 62,7 / – / – / 40,2 | 87,5 / – / – / 16,3 |

\* Top-3 của Vanilla lấy từ lần đánh giá riêng (`paper-vanilla.json`), vì bản chấm lại không lưu xác suất từng bước.
Cột "Không gợi ý" của mô hình app tính trên 23 cây (BFS/DFS 10%: 13,8 / 68,7 s), nên chênh nhẹ so với dòng trên.

**Bản chặt** (khớp cả tọa độ; chỉ có cho 3 bộ giải mã của bài báo):
- Cả ba gần như ngang nhau: F1 khoảng 5–7 / 48 / 75–80.
- Next đúng tuyệt đối tọa độ gần như bằng 0 ở mức 50–80%.
- Chi tiết ở `paper-decoders.json`.

## Kết luận: giữ **Transformer phát hiện chỗ thiếu của app** (huấn luyện lại, không WebSight) làm mô hình cho tính năng Gợi ý

1. **Chất lượng ngang hoặc tốt hơn:**
   - Mô hình app dẫn đầu Next và Top-3 ở 6/12 ô, và F1 ở 4/6 mức 10–50%.
   - Recursive chỉ hơn rõ ở Edit và F1 khi cây đã gần đủ (BFS 80%).
2. **Đúng nhiệm vụ của tính năng:**
   - Gợi ý cần tìm phần tử thiếu **ở bất kỳ đâu**, kể cả giữa form.
   - Ba bộ giải mã của bài báo chỉ sinh **tiếp sau** tiền tố (Vanilla, Pointer) hoặc **nối thêm vào cuối** danh sách con (Recursive). Không mô hình nào trong ba mô hình này chèn được vào giữa.
3. **Không cần tọa độ:**
   - Cây trong app không lưu khung bao. Muốn dùng bộ giải mã của bài báo, mỗi lần gợi ý phải render màn để đo tọa độ.
   - Bản chặt cũng cho thấy phần tọa độ chưa học được với 459 cây huấn luyện.
4. **Đã chạy được trong app:**
   - Suy luận thuần TypeScript, khoảng 22 ms mỗi màn.
   - Có kiểm thử khớp số học với PyTorch.
   - Có đo báo động giả và mẫu bẫy.

**Trong ba bộ giải mã của bài báo, Recursive tốt nhất:**
- val loss thấp nhất (3,41, so với 3,62 của Vanilla và 5,05 của Pointer);
- Edit tốt nhất ở 3/6 thiết lập, F1 cao nhất ở BFS 80%;
- khớp nhận định của bài báo.

Recursive phù hợp làm tính năng khác: **"hoàn thiện bố cục"**, tức gợi ý cả nhóm phần tử còn lại khi màn đã có khung. Nếu muốn, có thể port sang TypeScript sau.

## Mô hình app sau khi huấn luyện lại (đánh giá trên các mẫu của bộ dữ liệu, `train-app-scratch-v2.json`)
| | Top-1 | Top-3 | Báo động giả màn đủ | Báo động giả mẫu bẫy |
|---|---|---|---|---|
| Val (1.273 mẫu thiếu) | 59,3% | 81,9% | 25,0% | 26,3% |
| Test (1.365 mẫu thiếu) | 52,4% | 74,7% | 26,1% | 18,8% |

## Giới hạn
- Tập test nhỏ (22–23 cây), nên mỗi cây đúng hay sai làm Next thay đổi khoảng 4,5 điểm. Cần thêm màn do nhóm tạo để kết luận chắc hơn.
- Dữ liệu do Claude soạn, chưa qua BA kiểm nghiệm.

## Chạy lại
```bash
python3 scripts/train_transformer.py --samples data/dataset/tf --epochs 10      # mô hình app, không --init
npm run eval-transformer -- --tf model/next-transformer.json                   # thước đo bài báo (nới lỏng)
python3 scripts/paper/tree_decoders.py --models pointer,recursive,vanilla       # Pointer, Recursive, chấm lại Vanilla
```
