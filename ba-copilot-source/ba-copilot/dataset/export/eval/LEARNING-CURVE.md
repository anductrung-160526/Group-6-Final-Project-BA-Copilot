# Đường học: tăng số cây có làm mô hình tốt hơn không?

- Lấy ngẫu nhiên 25%, 50%, 75% và 100% số màn gốc của tập train (seed 7). Mọi biến thể của một màn đi cùng nhau.
- Tập val và tập test giữ nguyên.
- Dữ liệu: phiên bản `a2e83358b8`, không WebSight.

## Mô hình của app (Transformer phát hiện chỗ thiếu, 10 epoch, đánh giá trên các mẫu thuộc tập test)
| Tỷ lệ train | Số màn gốc | Top-1 | Top-3 | Báo động giả (23 màn đủ) |
|---|---|---|---|---|
| 25% | 38 | 46,5% | 65,8% | 17,4% |
| 50% | 76 | 52,9% | 76,3% | 34,8% |
| 75% | 115 | 52,6% | 74,8% | 17,4% |
| 100% | 153 | 52,4% | 74,7% | 26,1% |

## Recursive (d 128, 2 lớp; trung bình 6 thiết lập BFS/DFS 10/50/80% trên 22 cây test)
| Tỷ lệ train | Số cây | val loss | F1 nới lỏng | Next nới lỏng | Edit nới lỏng (s) | F1 chặt |
|---|---|---|---|---|---|---|
| 25% | 114 | 4,34 | 54,9 | 24,2 | 30,4 | 43,6 |
| 50% | 228 | 3,86 | 55,9 | 25,0 | 29,1 | 43,5 |
| 75% | 345 | 3,57 | 56,3 | 24,2 | 27,0 | 42,9 |
| 100% | 459 | 3,41 | 57,6 | 28,0 | 27,4 | 43,4 |

## Nhận xét
- **Có tăng, nhưng tăng chậm dần:**
  - Mô hình app tăng mạnh từ 25% lên 50% (Top-3 +10,5 điểm), sau đó đi ngang.
  - Recursive cải thiện đều nhưng nhỏ: val loss giảm liên tục, F1 nới lỏng +2,7 điểm, Edit giảm khoảng 3 s.
- **Phần tọa độ (F1 chặt) không cải thiện.** Muốn đoán được tọa độ cần nhiều dữ liệu hơn nhiều; bài báo dùng 55 nghìn cây.
- **Đi ngang không có nghĩa là thêm dữ liệu vô ích.** Các màn mới vẫn cùng phong cách soạn và cùng thư viện 28 component, nên mô hình nhanh chóng học hết phần "dễ". Muốn tăng tiếp cần dữ liệu **khác biệt hơn**:
  - màn sinh qua nút Sinh thiết kế bằng Claude thật;
  - màn do BA của nhóm vẽ;
  - các loại màn mới.
  Nhân thêm biến thể của cùng 200 màn sẽ không đủ.
- **Tập test nhỏ (22–23 màn):** dao động ±2–4 điểm và báo động giả nhảy 17–35% chủ yếu do nhiễu thống kê. Cần tập test lớn hơn để đo chính xác.
