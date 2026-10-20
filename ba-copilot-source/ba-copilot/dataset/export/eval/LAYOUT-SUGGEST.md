# Tính năng gợi ý bố cục theo Li et al. 2020 – triển khai và đánh giá

Tính năng gợi ý của Design Studio nay **chỉ dùng phương pháp của bài báo**: *Auto Completion of User Interface Layout Design Using
Transformer-Based Tree Decoders* (Li, Amelot, Zhou, Bengio, Si 2020, arXiv:2001.05308), Recursive Transformer Tree Decoder (§4.4).
- Đã gỡ khỏi tính năng: bộ luật R1–R9, bộ lọc ứng dụng (ngưỡng, loại trùng, một gợi ý mỗi container), mô hình đối chứng (encoder hai chiều, n-gram) và cơ chế học khi duyệt.
- Không có luật hay bộ lọc nào thay thế.

## 1. Tính năng
| Bài báo | Trong app |
|---|---|
| Next: dự đoán phần tử tiếp theo của bố cục dở | **Khung mờ** trên canvas đúng vị trí và kích thước dự đoán. Tab chấp nhận, Esc bỏ qua. Panel hiện **top-3 loại** và xác suất EOS (softmax đầu ra loại, Eq.7). Chạy lại sau **mỗi thay đổi**: chấp nhận gợi ý, sửa bằng prompt, xóa, đổi thứ tự, đổi vùng chọn |
| Phần tử tiếp theo ở đâu | Chọn một container: hỏi riêng container đó (một bước giải mã). Không chọn gì: tối đa 3 container mà mô hình không đoán EOS, xếp theo xác suất |
| Hoàn thành cây (Pair F1, Edit) | Nút **Hoàn thành bố cục**: giải mã tham lam tới EOS ở mọi container, kể cả container vừa sinh (đúng `recursive_complete`), trong vùng chọn hoặc cả màn. Kết quả hiện thành khung mờ; bỏ chọn được từng phần tử (bỏ container thì bỏ cả con) rồi chấp nhận |
| Đầu ra: loại, cờ lá, khung bao | Phần tử chèn vào có props trung tính (vd Button "Nút"). Mô hình không dự đoán nội dung; BA đổi chữ bằng Prompt sửa thiết kế |

- Thao tác tay: Delete để xóa, ↑/↓ để đổi thứ tự. Phiên bản ghi loại "Gợi ý bố cục" hoặc "Sửa tay".
- Kiểm tra số học: suy luận TypeScript (`nextInContainer`, `nextElements`, `completeLayout` trong `shared/recursive.ts`) khớp PyTorch từng loại, từng tọa độ, xác suất lệch < 10⁻³ (`tests/recursive.test.ts`).

## 2. Dữ liệu cho loại phần tử hiếm (không dùng luật)
- Thêm **100 màn gốc R301–R400** (`dataset/roots/ext2-0*.json`, ma trận `buildExtension2`) thuộc 25 loại màn mà component hiếm xuất hiện **tự nhiên**: khảo sát, đơn có điều khoản, đặt chỗ có ngày đi/về, hồ sơ ứng tuyển, cài đặt thông báo, bộ lọc khoảng ngày, album ảnh, màn lỗi/thành công, lịch sử giao dịch nhiều trang, cài đặt quyền riêng tư…
- Không nhồi component vô nghĩa. Vẫn do Claude soạn theo `dataset/AUTHORING.md`. Kiểm tra: 400 màn, 0 lỗi, 400/400 tên khác nhau, không màn mới nào giống màn khác từ 70% trở lên.
- Lô mới có khoảng 205 Checkbox, 85 Alert, 75 Radio, 69 DatePicker, 89 Avatar, 69 Divider, 71 Image, 33 Textarea, 23 Pagination.
- Dữ liệu tọa độ `data/paper-w7c20-r400`: **2.219 / 280 / 42 cây** (317 / 40 / 42 màn gốc). 1.883 cây của bản 300 màn giữ nguyên từng tọa độ.
- Huấn luyện đúng như trước (`train_faithful.py`): cây đầy đủ, cross-entropy thường, không làm mềm nhãn, không xáo trộn, không trọng số theo lớp; dò cấu hình theo val.

| hidden | Số lớp | Tham số | Epoch | Val loss |
|---|---|---|---|---|
| 128 | 2 | 661.664 | 16 | 3,3236 |
| 128 | 4 | 1.190.816 | 16 | 3,2827 |
| 128 | 6 | 1.719.968 | 13 | 3,4053 |
| 256 | 2 | 2.371.104 | 12 | 3,1749 |
| 256 | 4 | 4.477.984 | 12 | 3,2763 |
| 256 | 6 | 6.584.864 | 11 | 3,2461 |

Chọn **hidden 256, 2 lớp**. So hai mô hình trên **cùng tập val**:

| Tập val | Mô hình 300 màn | Mô hình 400 màn |
|---|---|---|
| 400 màn (280 cây) | 3,293 | **3,135** |
| 300 màn cũ (231 cây) | **2,901** | 2,931 |

Theo nguyên tắc chọn trên val (tập val của dữ liệu đầy đủ), app dùng mô hình 400 màn. Mô hình 300 màn còn trong git (commit `ec2b698`).

## 3. Mô phỏng thời gian thao tác (KLM) – `scripts/paper/klm_sim.py`
- Hằng số KLM như thang đo Edit của bài báo: M = 1,35 s, P = 1,1 s, B = 0,1 s; chèn tay một phần tử = M + 3P + 4B = 5,05 s.
- Chi phí khi có gợi ý là **thiết kế mô phỏng của nhóm** (bài báo không mô phỏng giao diện):
  - chấp nhận đúng top-1 = M + 2B = 1,55 s;
  - chọn trong top-3 = M + P + 4B = 2,85 s;
  - sai thì bỏ qua rồi chèn tay = 5,25 s.
- Dựng lại phần còn thiếu của mỗi cây test từ cây dở BFS/DFS 10/50/80%:
  - **(a) tay**: chèn từng phần tử;
  - **(b) từng bước**: mỗi phần tử kế tiếp được gợi ý trong đúng container cha (người dùng đang chọn container đó);
  - **(c) Hoàn thành bố cục**: M + Edit (KLM, nới lỏng) từ cây sinh ra tới cây đúng.

**42 màn test** (1280 px). Mỗi ô ghi mô hình 300 màn → mô hình 400 màn; "tiết kiệm" là so với (a):

| Thiết lập | Số phần tử cần dựng | (a) tay (s) | (b) từng bước tiết kiệm | (c) hoàn thành tiết kiệm | top-1 / top-3 loại đúng (%) |
|---|---|---|---|---|---|
| BFS 10% | 879 | 4438,9 | 40,7% → **40,7%** | 35,4% → 28,3% | 46,1 / 69,1 → 44,8 / 69,7 |
| BFS 50% | 488 | 2464,4 | 41,6% → **41,8%** | 32,7% → 31,1% | 46,5 / 70,7 → 46,3 / 71,1 |
| BFS 80% | 209 | 1055,4 | 47,3% → **48,5%** | 40,3% → 42,7% | 55,0 / 78,0 → 55,5 / 80,4 |
| DFS 10% | 879 | 4438,9 | 40,3% → **40,0%** | 37,4% → 27,5% | 44,8 / 68,8 → 43,5 / 68,9 |
| DFS 50% | 488 | 2464,4 | 38,7% → **38,7%** | 23,8% → 21,0% | 41,8 / 67,2 → 42,2 / 66,8 |
| DFS 80% | 209 | 1055,4 | 39,2% → **38,7%** | 21,0% → 16,2% | 44,0 / 67,0 → 42,1 / 67,0 |

Chỉ 22 màn test cũ (màn nghiệp vụ nội bộ):

| Thiết lập | (b) từng bước tiết kiệm | (c) hoàn thành tiết kiệm |
|---|---|---|
| BFS 10% | 38,7% → 36,7% | 38,8% → 30,0% |
| BFS 50% | 40,3% → 36,3% | 30,8% → 29,6% |
| BFS 80% | 45,5% → 40,6% | 37,5% → 30,8% |
| DFS 10% | 38,5% → 36,5% | 39,6% → 31,0% |
| DFS 50% | 38,6% → 35,0% | 25,7% → 27,5% |
| DFS 80% | 41,2% → 34,7% | 16,7% → 18,9% |

## 4. Độ chính xác theo loại phần tử (chế độ từng bước, container đã biết)
Loại hiếm, cả 42 màn test (top-1 và top-3, %):

| Loại | Số lượt | top-1 | top-3 |
|---|---|---|---|
| Checkbox | 95 | 14,7 → **45,3** | 58,9 → **56,8** |
| Radio | 45 | 0,0 → **4,4** | 11,1 → **13,3** |
| DatePicker | 36 | 0,0 → **8,3** | 44,4 → **44,4** |
| Textarea | 61 | 18,0 → **44,3** | 47,5 → **70,5** |
| Image | 43 | 34,9 → **44,2** | 44,2 → **69,8** |
| Alert | 35 | 0,0 → **0,0** | 14,3 → **42,9** |
| Divider | 23 | 0,0 → **39,1** | 30,4 → **73,9** |
| Pagination | 37 | 51,4 → **45,9** | 64,9 → **78,4** |
| Avatar | 92 | 23,9 → **34,8** | 31,5 → **81,5** |

Loại hiếm, chỉ 22 màn test cũ (không có màn nào của lô mới):

| Loại | Số lượt | top-1 | top-3 |
|---|---|---|---|
| Checkbox | 25 | 32,0 → **48,0** | 48,0 → **48,0** |
| Radio | 18 | 0,0 → **0,0** | 0,0 → **22,2** |
| DatePicker | 16 | 0,0 → **18,8** | 43,8 → **43,8** |
| Textarea | 32 | 34,4 → **43,8** | 43,8 → **43,8** |
| Alert | 9 | 0,0 → **0,0** | 22,2 → **22,2** |
| Divider | 9 | 0,0 → **33,3** | 22,2 → **100,0** |
| Pagination | 13 | 69,2 → **46,2** | 69,2 → **69,2** |

Loại phổ biến, 42 màn test:

| Loại | Số lượt | top-1 | top-3 |
|---|---|---|---|
| Text | 507 | 67,5 → **72,2** | 86,0 → **86,2** |
| Button | 454 | 78,9 → **61,0** | 93,4 → **84,8** |
| Row | 347 | 30,5 → **26,8** | 71,5 → **64,0** |
| Link | 222 | 46,8 → **45,9** | 73,4 → **79,3** |
| Input | 158 | 44,9 → **36,7** | 72,2 → **65,2** |
| Select | 146 | 26,0 → **29,5** | 56,2 → **45,2** |
| Card | 144 | 70,1 → **66,0** | 81,2 → **76,4** |
| Stat | 125 | 61,6 → **58,4** | 78,4 → **81,6** |

## 5. Thang đo của bài báo (trung bình 6 thiết lập BFS/DFS 10/50/80%)
| Thang đo | 22 màn cũ – mô hình 300 màn | 22 màn cũ – mô hình 400 màn | 42 màn – mô hình 400 màn |
|---|---|---|---|
| Pair F1 nới lỏng | 57,2 | 54,4 | 56,1 |
| Next nới lỏng | 31,8 | 28,0 | 30,6 |
| Edit nới lỏng (s) | 25,8 | 27,9 | 44,4 |
| Pair F1 chặt | 44,7 | 42,8 | 44,6 |
| Next chặt | 9,1 | 6,8 | 6,3 |
| Edit chặt (s) | 34,7 | 35,7 | 55,7 |

## 6. Nhận xét (trung thực)
- **Loại hiếm cải thiện rõ nhờ dữ liệu có chủ đích**, kể cả trên 22 màn test cũ không thuộc lô mới:
  - Checkbox top-1: 32 → 48%;
  - DatePicker top-1: 0 → 19%;
  - Divider top-3: 22 → 100% (chỉ 9 lượt);
  - Radio top-3: 0 → 22%.
  Trên cả 42 màn, Avatar top-3 tăng từ 32 lên 82%, Textarea top-1 từ 18 lên 44%, Alert top-3 từ 14 lên 43%, Image top-3 từ 44 lên 70%.
- **Top-3 giúp loại hiếm thực sự xuất hiện trước mắt BA** dù không đứng đầu. Đây là phân phối của chính mô hình, không phải luật.
- **Đổi lại, loại phổ biến giảm:** Button top-1 79 → 61%, Input 45 → 37% (trên 22 màn cũ: 53 → 19%). Thang đo bài báo trên 22 màn cũ giảm 2–4 điểm (Pair F1 nới lỏng 57,2 → 54,4).
- **Tiết kiệm thao tác:**
  - từng bước, 42 màn: gần như không đổi (khoảng 39–48%);
  - từng bước, 22 màn cũ: giảm 2–7 điểm;
  - Hoàn thành bố cục: phần lớn giảm.
  Nói cách khác, dữ liệu mới **chuyển** năng lực của mô hình sang các loại hiếm hơn là tăng tổng thể. Với khoảng 2 nghìn cây (bài báo dùng hơn 55 nghìn), mô hình chưa đủ sức học tốt cả hai nhóm.
- **Gợi ý từng bước tiết kiệm nhiều hơn Hoàn thành bố cục ở mọi thiết lập**: 39–48% so với 16–43%. Điều này khớp với khuyến nghị dùng "một phần" làm mặc định, "cả màn" làm nút chủ động.
- **Giới hạn còn lại:**
  - không gợi ý nội dung chữ;
  - Radio, Form, List vẫn yếu;
  - không chuyên tìm chỗ bị quên ở giữa (bài báo không đặt bài toán này);
  - dữ liệu vẫn do Claude soạn;
  - tập test nhỏ (42 màn), nên chênh lệch vài điểm có thể là dao động.

## Chạy lại
```bash
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/paper/build-dataset.ts --widths 768,1024,1280,1366,1440,1600,1920 --cell-y 20 --out data/paper-w7c20-r400
python3 scripts/paper/train_faithful.py --data=data/paper-w7c20-r400 && python3 scripts/paper/export_recursive.py
python3 scripts/paper/klm_sim.py --data=data/paper-w7c20-r400        # → klm-sim.json
npm test && npm run e2e
```
Files: `recursive-faithful.json` (400 màn), `recursive-faithful-r300.json`, `klm-sim.json`, `klm-sim-r300.json`.
