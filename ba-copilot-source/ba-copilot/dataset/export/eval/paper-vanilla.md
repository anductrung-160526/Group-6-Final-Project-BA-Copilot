# Tái lập Vanilla Transformer Tree Decoder (Li et al. 2020) trên UI web của nhóm

> **Lưu ý:** các bảng dưới đây dùng quy tắc cắt cây dở cũ (tính cả gốc, làm tròn thông thường).
> Kết quả chấm lại theo quy tắc thống nhất với mô hình app nằm trong `paper-decoders.json`.

## Dữ liệu (chỉ `dataset/roots`, không WebSight, không Rico)
- **Nguồn:** 200 màn web nghiệp vụ, phiên bản dữ liệu `a2e83358b8`.
- **Tọa độ:** render bằng Renderer của app trong Chromium ở khổ desktop.
  - Test chỉ dùng độ rộng 1280 px; train và val thêm biến thể 1024 px và 1440 px.
  - Tọa độ đo theo toàn trang.
  - Lưới: x chia 128 ô theo tỷ lệ độ rộng; y chia ô 10 px, tối đa 256 ô.
- **Số cây sau lọc:** 553 (train 459 / val 72 / test 22).
  - Chia theo màn gốc: 153 / 24 / 22 màn.
  - Chỉ 1 cây bị lọc: R168 thuộc tập test, vì có cột (Column) tràn ra ngoài khung cha.
- **Cấu trúc cây:** trung bình 16,9 node (10–38), độ sâu trung bình 4,6 (3–7).
- **So với Rico** (mục 5.1 của bài báo): Rico có hơn 55 nghìn cây, trung bình 16 node, độ sâu 3, lưới 72×128.

Thống kê đầy đủ: `paper-vanilla-data-stats.json`.

## Mô hình
- Duỗi cây theo DFS kèm dấu ngoặc (bỏ ngoặc khi cha chỉ có 1 con) và EOS.
- Embedding: e = e_b + e_c + e_t (Eq.1–5), cộng thêm embedding vị trí trong chuỗi.
- Bộ giải mã nhân quả, mỗi thuộc tính (c, t, x, y, x2, y2) một softmax riêng (Eq.7).
- Dò cấu hình trên val (hidden {64, 128} × số lớp {2, 4}), early stopping theo val loss.
  - Chọn **d = 128, 2 lớp** (562 nghìn tham số, val loss 3,618).
  - Tổng thời gian dò và huấn luyện trên CPU 4 nhân: khoảng 6,5 phút.
- Kết quả dò cấu hình chi tiết: `paper-vanilla.json`.

## Kết quả trên tập test (22 cây, luồng DFS)

Mỗi ô ghi F1 (%) / Next (%) / Edit (giây KLM). **Chặt** = khớp cả loại lẫn 4 tọa độ; **nới lỏng** = chỉ so loại.

| Mô hình | DFS 10% | DFS 50% | DFS 80% |
|---|---|---|---|
| Vanilla – chặt | 7,0 / 22,7 / 57,9 | 47,7 / 4,5 / 35,6 | 75,2 / 0,0 / 14,2 |
| Vanilla – nới lỏng | 26,1 / 40,9 / 43,1 | 59,4 / 31,8 / 27,7 | 81,3 / 31,8 / 10,1 |
| Không gợi ý – chặt | 6,9 / – / 71,2 | 62,7 / – / 40,2 | 87,5 / – / 16,3 |
| Không gợi ý – nới lỏng | 6,9 / – / 71,2 | 62,7 / – / 40,2 | 87,5 / – / 16,3 |

Next Top-3 theo loại của Vanilla: 59,1% / 54,5% / 59,1%.

### Mốc phụ: Transformer phát hiện chỗ thiếu của app, huấn luyện từ đầu (không WebSight)
Mô hình huấn luyện 10 epoch trên các mẫu của bộ dữ liệu. Mô hình này không đoán tọa độ, nên chỉ có bản nới lỏng.
Tập test là 23 màn gốc (có cả R168, vì không qua bước lọc tọa độ).

| Mô hình | DFS 10% | DFS 50% | DFS 80% |
|---|---|---|---|
| Transformer phát hiện chỗ thiếu (từ đầu) – nới lỏng | 26,5 / 39,1 / 45,9 | 63,6 / 39,1 / 32,2 | 84,0 / 13,0 / 13,9 |
| Không gợi ý (23 cây) | 13,8 / – / 68,7 | 65,3 / – / 38,2 | 87,0 / – / 16,9 |

Bảng đầy đủ: `paper-scratch-v2.md`.

## Đối chiếu Table 2 của bài báo (Vanilla, Rico, so khớp chặt)
| | DFS 10% | DFS 50% | DFS 80% |
|---|---|---|---|
| Bài báo – Vanilla | 5,35 / 0,74 / 234,17 | 40,4 / 5,35 / 138,88 | 68,82 / 17,03 / 84,32 |
| Của nhóm – Vanilla (chặt) | 7,0 / 22,7 / 57,9 | 47,7 / 4,5 / 35,6 | 75,2 / 0,0 / 14,2 |

Chỉ nên so **định tính**. Hai bên khác nhau về dữ liệu (web nghiệp vụ so với Android), quy mô (553 cây so với 55 nghìn), lưới tọa độ, và đơn vị chi phí Edit.

## Nhận xét
- **Edit** của Vanilla thấp hơn "Không gợi ý" ở mọi mức. Ví dụ ở DFS 10% bản nới lỏng: 43,1 s so với 71,2 s. Nghĩa là phần mô hình tự hoàn thiện giúp tiết kiệm công sửa.
- **F1 ở 50–80% thấp hơn "Không gợi ý".** Mô hình sinh thêm nhiều node sai loại hoặc sai chỗ, làm giảm precision. Bài báo cũng ghi nhận Vanilla yếu nhất trong ba bộ giải mã.
- **Next chặt ≈ 0 ở mức 80%.** Đoán đúng tuyệt đối cả 4 tọa độ trên lưới 10 px là rất khó với 459 cây huấn luyện. Bài báo cũng chỉ đạt 17%.
- **Next nới lỏng 32–41%, Top-3 55–59%.** Vanilla tương đương Transformer phát hiện chỗ thiếu ở mức 10–50%, và hơn hẳn ở mức 80% (31,8% so với 13,0%).

## Giới hạn
- Dữ liệu do Claude soạn và chưa qua BA kiểm nghiệm.
- Tập test chỉ có 22 cây, nên mỗi cây đúng hay sai làm Next thay đổi khoảng 4,5 điểm.
- Tọa độ lấy từ cách Renderer của app dựng giao diện ở một độ rộng màn hình.
- Chỉ đánh giá được luồng DFS, đúng giới hạn của Vanilla.

## Chạy lại
```bash
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/paper/build-dataset.ts
python3 scripts/paper/test_vanilla.py
python3 scripts/paper/vanilla.py --grid "64,128:2,4"
```
