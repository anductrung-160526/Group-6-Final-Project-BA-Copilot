# Đánh giá theo thước đo của Li et al. 2020 (arXiv:2001.05308, mục 5)

Thiết lập giống bài báo:
- Cây "đang làm dở" gồm 10%, 50% hoặc 80% số node đầu tiên theo thứ tự BFS hoặc DFS.
- Ba thước đo:
  - **Parent-child pair F1 (%)**: so cây do mô hình tự hoàn thiện với cây đúng; càng cao càng tốt.
  - **Next-element accuracy (%)**: đoán đúng phần tử kế tiếp ngay sau phần tiền tố; càng cao càng tốt.
  - **Layout Tree Edit Distance**: khoảng cách sửa cây Zhang–Shasha, chi phí quy ra giây theo KLM-GOMS (chèn 5,05 s, đổi loại 3,95 s, xóa 0,10 s); càng thấp càng tốt.
- **Bản nới lỏng:** cây BA Copilot không có tọa độ, nên chỉ so loại component. Đây giống cách đo nới lỏng ở mục 6 của bài báo.
- Hai tập đánh giá đều không dùng khi huấn luyện: 23 màn gốc thuộc tập test của bộ dữ liệu, và 30 màn tham chiếu.
- "Không gợi ý" = giữ nguyên cây dở, làm mốc so sánh.

Bảng đầy đủ (kèm Next Top-3, N-gram) ở `paper-current.md` và `paper-websight.md`. Lệnh chạy: `npm run eval-transformer -- --tf <mô hình>`.

## Mô hình hiện tại (WebSight → tinh chỉnh bộ dữ liệu) – 23 màn gốc tập test

| Luồng | 10%: F1 / Next / Edit | 50%: F1 / Next / Edit | 80%: F1 / Next / Edit |
|---|---|---|---|
| BFS | 36,7 / 30,4 / 37,2 s | 68,8 / 39,1 / 22,5 s | 87,4 / 56,5 / 8,8 s |
| DFS | 36,7 / 52,2 / 36,9 s | 68,6 / 43,5 / 26,3 s | 86,0 / 30,4 / 12,0 s |
| Không gợi ý | 15,2 / – / 61,0 s | 64,6 / – / 34,5 s | 86,8 / – / 15,4 s |
| Mô hình cũ (WebSight), BFS | 28,1 / 8,7 / 47,5 s | 61,7 / 0,0 / 29,8 s | 84,3 / 21,7 / 12,0 s |
| Mô hình cũ (WebSight), DFS | 27,8 / 0,0 / 47,7 s | 61,8 / 8,7 / 32,1 s | 84,7 / 26,1 / 13,5 s |

## Mô hình hiện tại – 30 màn tham chiếu

| Luồng | 10%: F1 / Next / Edit | 50%: F1 / Next / Edit | 80%: F1 / Next / Edit |
|---|---|---|---|
| BFS | 33,4 / 26,7 / 48,4 s | 65,1 / 20,0 / 29,3 s | 84,1 / 26,7 / 12,5 s |
| DFS | 31,3 / 70,0 / 49,5 s | 66,9 / 30,0 / 32,1 s | 85,5 / 30,0 / 14,2 s |
| Không gợi ý | 15,8 / – / 75,7 s | 65,5 / – / 42,1 s | 86,9 / – / 18,5 s |
| Mô hình cũ, BFS | 28,6 / 3,3 / 59,6 s | 67,1 / 23,3 / 35,2 s | 84,5 / 16,7 / 15,2 s |
| Mô hình cũ, DFS | 30,9 / 30,0 / 57,1 s | 67,7 / 43,3 / 38,1 s | 85,0 / 20,0 / 16,2 s |

## Tham chiếu từ bài báo (Recursive Transformer, Rico, so khớp chặt cả tọa độ)
BFS: F1 15,2 / 64,1 / 86,4, Next 18,4 / 26,8 / 36,6, Edit 71,3 / 46,5 / 27,2.
Nếu chỉ so loại (bản nới lỏng), Next ở mức 80% đạt 95,3% (BFS) và 93,4% (DFS).
**Không so trực tiếp được** với kết quả ở trên: bài báo dùng tập dữ liệu khác (Rico, 55 nghìn cây), đơn vị Edit khác, và mô hình phải đoán cả tọa độ.

## Lưu ý
- Tập đánh giá nhỏ (23 và 30 cây), nên một cây đúng hay sai làm Next thay đổi 3–4 điểm.
- N-gram ra 0 vì máy không có corpus huấn luyện n-gram (`data/corpus`). Không dùng N-gram để so sánh trong báo cáo này.
