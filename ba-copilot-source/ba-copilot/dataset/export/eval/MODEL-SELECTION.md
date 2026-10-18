> **Cập nhật:** nhóm đã chọn **phương án B**. Tab Gợi ý dùng Recursive Transformer đúng phương pháp của bài báo (`PAPER-METHOD.md`).
> Các nhận định "giữ mô hình app" dưới đây là đánh giá ở giai đoạn trước, chỉ giữ lại để tham khảo.

# Chọn mô hình cho tính năng Gợi ý: so sánh 3 bộ giải mã của Li et al. 2020 với Transformer phát hiện chỗ thiếu của app

**Dữ liệu:** chỉ bộ dữ liệu UI web của nhóm, phiên bản `a2e83358b8`. Không dùng dữ liệu hay trọng số WebSight ở bất kỳ mô hình nào.
- Tập test là các màn gốc thuộc tập test, chưa dùng khi huấn luyện.
- Cả 4 mô hình được so sánh trên **cùng 22 cây**. R168 bị loại ở bước đo tọa độ, nên cũng bị bỏ khỏi phần chấm mô hình app (`--exclude R168`).
- Mỗi mô hình chọn cấu hình theo val: hidden ∈ {64, 128}, số lớp ∈ {2, 4}, early stopping.

## Các mô hình
| Mô hình | Cấu hình chọn | Tham số | Cần tọa độ? | Thứ tự duyệt |
|---|---|---|---|---|
| Vanilla (mục 4.2) | d 128, 2 lớp | 562 nghìn | Có | Chỉ DFS |
| Pointer (mục 4.3) | d 128, 2 lớp | 578 nghìn | Có | BFS và DFS |
| Recursive (mục 4.4) | d 128, 2 lớp | 667 nghìn | Có | BFS và DFS |
| **App: Transformer phát hiện chỗ thiếu** (hai chiều, huấn luyện từ đầu, 10 epoch) | d 96, 4 lớp | 479 nghìn | Không | Bất kỳ, kể cả chỗ thiếu ở giữa |

## Kết quả bản nới lỏng (chỉ so loại) – cùng 22 cây test, cùng quy tắc cắt cây dở
> **Sửa lỗi ngày 18/10 (rà soát lần cuối):** bản trước dùng hai quy tắc cắt cây dở khác nhau.
> - `eval-transformer.ts` của app không tính gốc, lấy floor(f × (N−1)) node.
> - `tree_decoders.py` tính cả gốc và làm tròn thông thường.
>
> Ở mức 10%, cây dở của hai bên lệch nhau 1 node, nên so sánh không công bằng. Đã thống nhất theo quy tắc của app (`partial_size` trong `vanilla.py`).
> Chấm lại ba bộ giải mã từ trọng số đã lưu, và chấm mô hình app trên cùng 22 cây (bỏ R168).
> Cột "Không gợi ý" của hai script giờ khớp nhau: F1 13,9 so với 13,7. Chênh ≤ 1 s ở Edit do hai bản cài Zhang–Shasha (TS và Python).

Mỗi ô ghi F1 / Next / Next Top-3 / Edit (giây KLM).

| Thiết lập | Vanilla | Pointer | Recursive | **App** | Không gợi ý (F1 / Edit) |
|---|---|---|---|---|---|
| BFS 10% | – | 22,7 / 18,2 / 63,6 / 45,6 | **30,6** / 40,9 / 63,6 / **44,7** | 27,3 / **50,0 / 77,3** / 46,6 | 13,9 / 68,6 |
| BFS 50% | – | 61,8 / 13,6 / 36,4 / 30,3 | 65,0 / 13,6 / **54,5 / 23,7** | **65,4 / 40,9** / 50,0 / 27,6 | 65,4 / 38,1 |
| BFS 80% | – | 83,7 / 18,2 / 40,9 / 14,2 | **85,5** / 22,7 / 40,9 / **8,7** | 83,4 / **27,3 / 68,2** / 12,5 | 86,9 / 17,0 |
| DFS 10% | 30,4 / **54,5** / 59,1 / **41,5** | 22,6 / 31,8 / 68,2 / 45,6 | **31,0 / 54,5 / 72,7** / 44,8 | 26,8 / 40,9 / **72,7** / 46,3 | 13,9 / 68,6 |
| DFS 50% | 60,7 / 40,9 / 63,6 / **25,9** | 61,3 / **45,5** / 63,6 / 28,7 | 63,5 / 31,8 / **77,3** / 26,8 | **63,9** / 40,9 / 59,1 / 33,0 | 65,4 / 38,1 |
| DFS 80% | 80,0 / 27,3 / **54,5** / 11,1 | **85,0 / 36,4** / 50,0 / 10,9 | 84,2 / 27,3 / 50,0 / **10,3** | 83,9 / 13,6 / **54,5** / 14,5 | 86,9 / 17,0 |

**So riêng Recursive với mô hình app (24 ô):** Recursive hơn ở 14 ô, app hơn ở 9 ô, hòa 1 ô.
- Recursive tốt hơn rõ ở **Edit (6/6)** và F1 (4/6).
- App tốt hơn ở **Next** khi duyệt BFS (3/3) và ở Top-3 (4/6).
- Phần lớn chênh lệch ≤ 4,5 điểm, tức chỉ bằng 1 cây trên tập test 22 cây. Chưa đủ để khẳng định chắc chắn.

**Bản chặt** (khớp cả tọa độ; chỉ có cho 3 bộ giải mã của bài báo):
- F1 khoảng 8–10 / 49–52 / 75–78; Next đúng tuyệt đối tọa độ ≤ 13,6%.
- Chi tiết ở `paper-decoders.json`.

## Kết luận (đã sửa): vẫn dùng **Transformer phát hiện chỗ thiếu của app** cho tính năng Gợi ý; Recursive là ứng viên tốt cho tính năng "hoàn thiện bố cục"

1. **Thước đo của bài báo** đo việc *hoàn thiện cây từ một tiền tố*. Trên thước đo này, Recursive **nhỉnh hơn** mô hình app, nhất là về công sửa (Edit). Bản trước kết luận app "ngang hoặc tốt hơn"; kết luận đó sai do lỗi lệch quy tắc cắt cây.
2. **Tính năng Gợi ý cần tìm chỗ thiếu ở bất kỳ đâu**, kể cả giữa form.
   - Trong bài báo, vị trí của phần tử được xác định bằng **khung bao** (tọa độ). Một phần tử sinh thêm có thể nằm giữa các phần tử cũ về mặt không gian, dù trong cây nó được nối vào cuối danh sách con.
   - Cây của BA Copilot không có tọa độ; vị trí chính là **thứ tự trong container**. Với biểu diễn này, ba bộ giải mã của bài báo chỉ nối được vào cuối danh sách con.
   - Thước đo của bài báo dùng cây dở là tiền tố BFS/DFS, nên không đo trường hợp thiếu ở giữa.
   - Mô hình app được đo riêng trên nhiệm vụ này: Top-1 52,4%, Top-3 74,7% trên 1.365 mẫu thiếu của tập test.
3. **Không cần tọa độ và đã chạy được trong app.** Mô hình app suy luận bằng TypeScript, khoảng 22 ms mỗi màn. Ba bộ giải mã của bài báo cần khung bao, nên mỗi lần gợi ý phải render màn để đo, và phải port mô hình sang TypeScript.
4. **Đề xuất:**
   - Giữ mô hình app cho tab Gợi ý (thêm phần tử thiếu, sửa).
   - Nếu muốn có tính năng "hoàn thiện phần còn lại của màn", dùng **Recursive**. Mô hình này tốt nhất trong ba bộ giải mã và cho Edit thấp nhất.

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
