# Gợi ý bố cục (Transformer) – kết quả mô hình trong app

Mô hình đang chạy trong app (`backend/model/recursive-layout.json`): **Recursive Transformer Tree Decoder** (Li et al. 2020,
*Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders*, arXiv:2001.05308, §4.4).
Chạy lại ngày 21/10/2026 bằng `scripts/paper/eval_app_model.py`; kết quả gốc: `transformer/app-model.json`.
Đây là kết quả duy nhất được giữ; các báo cáo thí nghiệm cũ đã gỡ khỏi repo (còn trong lịch sử git).

## Mô hình
- Kiến trúc đúng bài báo: embedding e = e_b + e_c + e_t (không embedding vị trí), hidden 256, 4 lớp, 4 heads, 4,33 triệu tham số.
- Huấn luyện (`scripts/paper/train_final.sh`; nhật ký huấn luyện `data-limited/`): tiền huấn luyện trên 23.382 cây WebSight →
  tinh chỉnh trên 785 màn gốc của nhóm (13.168 cây train, 7 độ rộng màn hình, chia 80/10/10 theo màn gốc), tăng cường bố cục ×2,
  dropout 0,2. Lưới 32 cột × ô cao 40 px.
- **Ngoài bài báo (thiết kế của nhóm):** tiền huấn luyện WebSight, tăng cường bố cục, dropout 0,2, lưới thô 32 × 40.
- Suy luận trong app bằng TypeScript (`shared/recursive.ts`), khớp số học với PyTorch (`backend/tests/recursive.test.ts`).

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

Mô hình tham chiếu **Vanilla** và **Pointer** (Li et al. 2020, §4.2–4.3) được huấn luyện theo **cùng quy trình và cùng dữ liệu** với
mô hình trong app (tiền huấn luyện WebSight → tinh chỉnh trên 785 màn gốc + tăng cường, lưới 32 × 40, hidden 256 × 4 lớp, không
embedding vị trí; Pointer dropout 0,2) bằng `scripts/paper/train_reference.sh`, chấm bằng `eval_app_model.py --kind …` (kết quả `transformer/pointer.json`,
`transformer/vanilla.json`). Vanilla chỉ có luồng DFS (như bài báo). Giá trị tốt nhất mỗi cột in đậm.

**Table 1:** The prediction accuracy for the breadth-first layout design flow.

| Models | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 11.77 | 15.79 | 85.79 | 50.83 | 2.63 | 48.76 | 79.47 | 15.79 | 20.61 |
| Recursive (app) | **13.42** | **18.42** | **83.11** | **54.66** | **13.16** | **44.25** | **81.85** | **18.42** | **17.39** |

**Table 2:** The prediction accuracy for the depth-first layout design flow.

| Models | DFS 10% F1 | Next | Edit | DFS 50% F1 | Next | Edit | DFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Vanilla | **13.12** | 26.32 | 86.62 | **54.41** | 2.63 | 50.77 | 81.23 | **15.79** | 20.13 |
| Pointer | 11.76 | 23.68 | 85.01 | 50.69 | 7.89 | 48.04 | **81.35** | 13.16 | 19.95 |
| Recursive (app) | 12.46 | **28.95** | **82.73** | 52.43 | **23.68** | **45.63** | 79.31 | **15.79** | **18.98** |

**Table 3:** The prediction accuracy for the breadth-first layout design flow with a random spatial ordering.

| Models | BFS 10% F1 | Next | Edit | BFS 50% F1 | Next | Edit | BFS 80% F1 | Next | Edit |
|---|---|---|---|---|---|---|---|---|---|
| Pointer | 9.38 | 5.26 | 88.65 | **50.54** | 0.00 | 49.74 | **77.72** | **0.00** | 21.84 |
| Recursive (app) | **11.55** | **7.89** | **87.63** | 47.84 | **2.63** | **45.18** | 66.87 | **0.00** | **19.80** |

Trung bình (thang chặt) – Recursive: F1 49.0, Next 19.7, Edit 48.7 s ·
Pointer: F1 47.6, Next 13.2, Edit 51.4 s ·
Vanilla (chỉ DFS): F1 49.6, Next 14.9, Edit 52.5 s
(Recursive chỉ DFS: F1 48.1, Next 22.8, Edit 49.1 s).
Số của bài báo (dữ liệu Rico): Recursive trung bình F1 54,4, Next 27,8, Edit 49,0 s.

## Nhận xét
- **Next:** Recursive (app) cao nhất hoặc bằng cao nhất ở mọi ô của cả 3 bảng (bằng Vanilla ở DFS 80%; cả hai bằng 0 ở Table 3 BFS 80%) –
  giống kết luận của bài báo ("Recursive consistently outperforms Pointer on Next Item prediction").
- **Edit:** Recursive thấp nhất (tốt nhất) ở mọi ô của cả 3 bảng.
- **F1:** ở BFS (Table 1) Recursive cao nhất mọi mức; ở DFS (Table 2) Vanilla cao nhất ở 10% và 50%, Pointer ở 80%; ở Table 3 Pointer cao hơn
  ở 50% và 80%. Bài báo cũng thấy lợi thế của Recursive kém rõ ở DFS và Pointer mạnh về F1.
- **Vanilla** có Next rất thấp ở DFS 50% (2,63) – cùng xu hướng bài báo, dù không thua xa như trong bài báo.
- **Table 3:** khi xáo thứ tự anh em, Next của cả hai mô hình giảm gần về 0 ở 50–80%; F1 và Edit giảm ít hơn.
- **Giới hạn:** tập test nhỏ (38 cây); dữ liệu do nhóm soạn, khác bài báo; chưa có ablation tách đóng góp của WebSight và tăng cường.

## Chạy lại
```bash
python3 scripts/paper/eval_app_model.py --data data/sn80-G2-w7-r800-aug2   # cần trọng số data/.../models/final.pt (data/ bị gitignore)
bash scripts/paper/train_reference.sh                                       # Pointer + Vanilla: tiền huấn luyện WebSight → tinh chỉnh → chấm
```
