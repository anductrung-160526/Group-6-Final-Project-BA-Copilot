# Gợi ý bố cục (Transformer) – kết quả mô hình trong app

Mô hình đang chạy trong app (`model/recursive-layout.json`): **Recursive Transformer Tree Decoder** (Li et al. 2020,
*Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders*, arXiv:2001.05308, §4.4).
Chạy lại ngày 21/10/2026 bằng `scripts/paper/eval_app_model.py`; kết quả gốc: `transformer/app-model.json`.
Đây là kết quả duy nhất được giữ; các báo cáo thí nghiệm cũ đã gỡ khỏi repo (còn trong lịch sử git).

## Mô hình
- Kiến trúc đúng bài báo: embedding e = e_b + e_c + e_t (không embedding vị trí), hidden 256, 4 lớp, 4 heads, 4,33 triệu tham số.
- Huấn luyện (`scripts/paper/train_final.sh`; nhật ký huấn luyện `data-limited/`): tiền huấn luyện trên 23.382 cây WebSight →
  tinh chỉnh trên 785 màn gốc của nhóm (13.168 cây train, 7 độ rộng màn hình, chia 80/10/10 theo màn gốc), tăng cường bố cục ×2,
  dropout 0,2. Lưới 32 cột × ô cao 40 px.
- **Ngoài bài báo (thiết kế của nhóm):** tiền huấn luyện WebSight, tăng cường bố cục, dropout 0,2, lưới thô 32 × 40.
- Suy luận trong app bằng TypeScript (`shared/recursive.ts`), khớp số học với PyTorch (`tests/recursive.test.ts`).

## Thiết lập đánh giá (như §5 của bài báo)
- Tập test: 38 cây (38 màn gốc, độ rộng 1280 px), không dùng khi huấn luyện hay chọn cấu hình.
- Cho mô hình 10% / 50% / 80% cây đúng (theo thứ tự BFS hoặc DFS); mô hình tự hoàn thiện phần còn lại (giải mã tự do).
- **F1** (%): cặp cha–con giữa cây mô hình sinh và cây đúng. **Next** (%): đoán đúng phần tử tiếp theo. **Edit** (giây): khoảng cách sửa
  cây Zhang–Shasha quy đổi theo KLM (chèn 5,05 s, đổi nhãn 3,95 s, xoá 0,1 s). Thang **chặt**: phần tử phải đúng loại và đúng cả 4 tọa
  độ khung bao. F1 và Next càng cao càng tốt; Edit càng thấp càng tốt.
- Table 3: thứ tự các phần tử anh em trong mỗi cây test được xáo ngẫu nhiên (seed cố định) trước khi lấy phần cây cho trước.
- Dòng *Li et al. 2020* là số của bài báo (dữ liệu Rico, khác dữ liệu của nhóm) – chỉ để tham chiếu. Dòng *No suggestion*: giữ nguyên
  phần cây cho trước, BA tự làm phần còn lại.

## Kết quả

**Table 1:** The prediction accuracy for the breadth-first layout design flow.

| Models | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| **Recursive (app)** | 13.42 | 18.42 | 83.11 | 54.66 | 13.16 | 44.25 | 81.85 | 18.42 | 17.39 |
| *Recursive (Li et al. 2020)* | *15.23* | *18.4* | *71.26* | *64.07* | *26.84* | *46.47* | *86.41* | *36.58* | *27.22* |
| No suggestion | 14.69 | – | 101.40 | 65.56 | – | 56.21 | 87.57 | – | 23.92 |

**Table 2:** The prediction accuracy for the depth-first layout design flow.

| Models | DFS 10% F1 | Next | Edit | DFS 50% F1 | Next | Edit | DFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| **Recursive (app)** | 12.46 | 28.95 | 82.73 | 52.43 | 23.68 | 45.63 | 79.31 | 15.79 | 18.98 |
| *Recursive (Li et al. 2020)* | *15.05* | *29.02* | *62.49* | *60.79* | *22.93* | *52.26* | *84.65* | *33.16* | *34.24* |
| No suggestion | 14.69 | – | 101.40 | 65.56 | – | 56.21 | 87.57 | – | 23.92 |

**Table 3:** The prediction accuracy for the breadth-first layout design flow with a random spatial ordering.

| Models | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| **Recursive (app)** | 11.55 | 7.89 | 87.63 | 47.84 | 2.63 | 45.18 | 66.87 | 0.00 | 19.80 |
| *Recursive (Li et al. 2020)* | *15.23* | *18.4* | *71.26* | *70.0* | *17.0* | *22.46* | *91.8* | *30.47* | *11.79* |
| No suggestion | 14.69 | – | 101.40 | 65.56 | – | 56.21 | 87.57 | – | 23.92 |

Trung bình 6 thiết lập (Table 1–2): F1 49.0 (bài báo 54,4) · Next 19.7 (bài báo 27,8) ·
Edit 48.7 s (bài báo 49,0; không gợi ý 60.5 s).
Thang nới lỏng (chỉ xét loại): Next 44.3%, loại đúng trong top-3 65.8%, Edit 37.0 s
(không gợi ý 60.5 s).

## Nhận xét
- **Next:** ngang bài báo ở BFS 10%, DFS 10%, DFS 50%; khoảng một nửa ở BFS 50%, BFS 80%, DFS 80%.
- **F1:** thấp hơn bài báo 2–10 điểm và thấp hơn mốc "không gợi ý" (mô hình đôi khi đề xuất thừa).
- **Edit:** kém bài báo ở mức 10%, tốt hơn bài báo ở 50% và 80%; luôn tốt hơn "không gợi ý" (BA sửa ít hơn).
- **Table 3:** khi thứ tự anh em bị xáo, Next giảm mạnh (mô hình học theo thứ tự trên–dưới, trái–phải của dữ liệu), F1 và Edit giảm ít hơn.
  Bài báo thì gần như không giảm – khác biệt này đến từ dữ liệu và cách sắp thứ tự của nhóm.
- **Giới hạn:** tập test nhỏ (38 cây); dữ liệu do nhóm soạn, khác bài báo; chưa có ablation tách đóng góp của WebSight và tăng cường.

## Chạy lại
```bash
python3 scripts/paper/eval_app_model.py --data data/sn80-G2-w7-r800-aug2   # cần trọng số data/.../models/final.pt (data/ bị gitignore)
```
