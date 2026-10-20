# Mô hình gợi ý bố cục hiện tại: tiền huấn luyện WebSight → tinh chỉnh 785 màn + tăng cường

Mô hình này đang chạy trong app (`model/recursive-layout.json`), thay bản 500 màn (`STRICT-NEXT.md` mục 10).

## 1. Cách huấn luyện
- **Kiến trúc (đúng bài báo):** Recursive Transformer Tree Decoder (Li et al. 2020 §4.4), embedding e = e_b + e_c + e_t, **không** embedding vị trí, hidden 256 × 4 lớp, 4 đầu chú ý.
- **Lưới (ngoài bài báo):** 32 ô ngang × ô dọc 40 px (gx = 32, gy = 128, cellY = 40). Chọn theo val ở `STRICT-NEXT.md`.
- **Bước 1 – tiền huấn luyện (ngoài bài báo):** 23.382 cây WebSight, dựng bằng Renderer của app, mỗi cây một độ rộng màn hình, 10 epoch. Val loss 0,725 (`data-limited/P-websight.json`).
- **Bước 2 – tinh chỉnh:** 785 màn gốc của nhóm (R001–R800, bỏ 15 màn trùng hoặc gần trùng, xem `dataset/excluded-roots.json`), 7 độ rộng, chia 80/10/10 theo màn gốc.
  - Tăng cường bố cục ×2, chỉ trên train (ngoài bài báo): độ dài chữ, số hàng bảng, khoảng cách Row, chiều cao ảnh.
  - Dropout 0,2 (ngoài bài báo; bài báo không nêu), lr 3·10⁻⁴, 10 epoch.
  - 13.168 cây train (628 màn gốc), 567 cây val, test 38 màn (cố định từ trước), test-mới 38 màn.
- Lệnh: `bash scripts/paper/train_final.sh`, sau đó `python3 scripts/paper/export_recursive.py --result dataset/export/eval/data-limited/final.json`.

## 2. Kết quả trên test 38 màn (1280 px, giải mã tự do), cũ = bản 500 màn trước đây

### Bảng 1 – Next (%)
| Thiết lập | Next chặt cũ | Next chặt mới | Next nới cũ | Next nới mới |
|---|---|---|---|---|
| BFS 10% | 7,9 | 18,4 | 44,7 | 50,0 |
| BFS 50% | 7,9 | 13,2 | 28,9 | 28,9 |
| BFS 80% | 7,9 | 18,4 | 36,8 | 47,4 |
| DFS 10% | 13,2 | 28,9 | 52,6 | 52,6 |
| DFS 50% | 7,9 | 23,7 | 28,9 | 50,0 |
| DFS 80% | 7,9 | 15,8 | 34,2 | 36,8 |
| TB | 8,8 | 19,7 | 37,7 | 44,3 |

### Bảng 2 – Pair F1 (%)
| Thiết lập | F1 chặt cũ | F1 chặt mới | F1 nới cũ | F1 nới mới |
|---|---|---|---|---|
| BFS 10% | 12,3 | 13,4 | 31,0 | 33,6 |
| BFS 50% | 53,8 | 54,7 | 65,7 | 68,8 |
| BFS 80% | 79,3 | 81,8 | 86,3 | 89,0 |
| DFS 10% | 12,0 | 12,5 | 30,5 | 31,5 |
| DFS 50% | 52,5 | 52,4 | 63,5 | 64,2 |
| DFS 80% | 79,4 | 79,3 | 84,5 | 84,8 |
| TB | 48,2 | 49,0 | 60,3 | 62,0 |

### Bảng 3 – Edit (giây KLM, thấp hơn là tốt)
| Thiết lập | Edit chặt cũ | Edit chặt mới | Edit nới cũ | Edit nới mới |
|---|---|---|---|---|
| BFS 10% | 86,5 | 83,1 | 69,7 | 66,0 |
| BFS 50% | 47,5 | 44,2 | 36,7 | 32,8 |
| BFS 80% | 19,1 | 17,4 | 13,4 | 11,2 |
| DFS 10% | 86,6 | 82,7 | 68,5 | 64,6 |
| DFS 50% | 48,3 | 45,6 | 38,2 | 34,2 |
| DFS 80% | 20,4 | 19,0 | 15,9 | 13,4 |
| TB | 51,4 | 48,7 | 40,4 | 37,0 |

### Chỉ số thêm (ngoài bài báo, %)
| Thiết lập | ±1 ô cũ | ±1 ô mới | IoU≥0,5 cũ | IoU≥0,5 mới |
|---|---|---|---|---|
| BFS 10% | 23,7 | 28,9 | 28,9 | 34,2 |
| BFS 50% | 18,4 | 23,7 | 21,1 | 23,7 |
| BFS 80% | 18,4 | 26,3 | 18,4 | 34,2 |
| DFS 10% | 31,6 | 39,5 | 34,2 | 42,1 |
| DFS 50% | 15,8 | 28,9 | 18,4 | 42,1 |
| DFS 80% | 15,8 | 28,9 | 15,8 | 26,3 |
| TB | 20,6 | 29,4 | 22,8 | 33,8 |

- Mốc "không gợi ý" (trung bình 6 thiết lập): F1 chặt 55,9, Edit nới lỏng 60,5 s.
  - **Edit:** mô hình mới 37,0 s, tức nhanh hơn làm tay khoảng 39%.
  - **Pair F1:** mô hình vẫn **thấp hơn** mốc "không gợi ý", giống bản cũ.
- **Diễn giải:**
  - khoảng 44% lần đoán đúng loại phần tử tiếp theo;
  - 29% lệch tối đa 1 ô;
  - 34% có IoU ≥ 0,5;
  - 20% đúng hoàn toàn cả loại và 4 tọa độ.
- Next chặt tăng từ 8,8 lên 19,7. Các thang khác tăng ít hơn: F1 +0,8 điểm, Edit giảm khoảng 3 s.

## 3. Lưu ý trung thực
- **Không có ablation.** Ba thay đổi (WebSight, tăng cường + dropout, 285 màn thêm) được áp dụng cùng lúc, nên chưa tách được phần cải thiện do từng yếu tố.
- **Tập test nhỏ:** 38 cây, chênh vài điểm nằm trong dao động thống kê. Riêng mức tăng Next chặt (+10,9 điểm) lớn hơn dải dao động theo seed đã đo (±1,4).
- **Test-mới không so sánh được** với các lần chạy trước: tập này đổi từ 9 màn lên 38 màn khi thêm R501–R800.
- **Toàn bộ màn gốc vẫn do Claude soạn**, chưa phải màn thật do BA vẽ.

## 4. Ngoài bài báo (thiết kế của nhóm)
Gồm: tiền huấn luyện WebSight; lưới 32×40 px; tăng cường bố cục; dropout 0,2; chia 80/10/10 theo màn gốc; chỉ số ±1 ô và IoU ≥ 0,5. Kiến trúc, cách giải mã và các thang Next / Pair F1 / Edit theo đúng bài báo.

JSON: `data-limited/final.json` (val1280, test, test-mới, cả giải mã có ràng buộc), `data-limited/P-websight.json`.
