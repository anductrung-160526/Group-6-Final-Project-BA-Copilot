# Nâng chất lượng tọa độ cho Recursive (trước khi triển khai phương án B)

## Biến thể
Tất cả là Recursive d 128, 2 lớp, chỉ dùng dữ liệu UI web của nhóm.

| | Dữ liệu train | Ô lưới dọc | Làm mềm nhãn tọa độ | Số epoch (early stop) |
|---|---|---|---|---|
| V0 | 459 cây (3 độ rộng) | 10 px | không | (mô hình cũ) |
| V1 | 1.071 cây (7 độ rộng: 768–1920 px) | 10 px | không | 15 |
| V2 | 1.071 cây | 10 px | σ = 1 ô | 15 |
| V3 | 1.071 cây | **20 px** | σ = 1 ô | 15 |

**Hai cách giải mã:**
- **Tự do**: đúng như bài báo.
- **Có ràng buộc**: khung con nằm trong khung cha theo chiều ngang và không bắt đầu phía trên cha; x2 ≥ x, y2 ≥ y.
- Bản ràng buộc đầu tiên có thêm quy tắc "không bắt đầu trước anh em đứng trước". Quy tắc này **chặn hoàn toàn việc chèn vào giữa** (tỷ lệ chèn giữa bằng 0%), nên đã bị bỏ; các biến thể đã được chấm lại.

**Cách chọn:** dựa trên val (24 màn, độ rộng 1280 px), lấy trung bình của "chèn đúng cả khe lẫn loại" và "Next IoU ≥ 0,5".
→ Chọn **V3, giải mã có ràng buộc**.

## Kết quả trên tập test (22 màn, 1280 px)

### Next (cây dở BFS/DFS 10/50/80%, 132 lượt)
| | Đúng loại | Chặt (bài báo) | ±1 ô | IoU ≥ 0,5 | Pair F1 chặt | Edit chặt (s) |
|---|---|---|---|---|---|---|
| V0 tự do | 31,8 | 3,8 | 6,8 | 12,1 | 45,6 | 35,5 |
| **V3 có ràng buộc** | 32,6 | **6,1** | **15,2** | **23,5** | 45,3 | **33,8** |

→ Chất lượng tọa độ **tăng gần gấp đôi** theo ±1 ô và IoU. Pair F1 chặt không đổi.

### Chèn đúng chỗ (bỏ 1 phần tử có anh em; 308 trường hợp, trong đó 200 thiếu ở giữa)
| | Đúng khe | Đúng loại | Đúng cả hai | Thiếu ở giữa: đúng khe / đúng cả hai | Không sinh gì trong container |
|---|---|---|---|---|---|
| V0 tự do | 29,9 | 27,9 | 18,2 | 9,5 / 5,0 | 47,7% |
| V3 có ràng buộc | 31,8 | 29,9 | 18,5 | 6,0 / 4,0 | 49,0% |
| *Mô hình app (đối chứng, không có tọa độ)* | 50,2 | 41,1 | **23,0** | 45,0 / **23,0** | 0% |

Mô hình app được chấm trên 309 trường hợp, vì cách đếm hơi khác (`app-insertion.json`).

## Nhận xét
1. **Tọa độ đã tốt lên rõ:** IoU ≥ 0,5 tăng từ 12,1% lên 23,5%; ±1 ô tăng từ 6,8% lên 15,2%. Hai yếu tố có tác dụng nhất là **lưới dọc 20 px** và **nhiều độ rộng hơn**. Ràng buộc khi giải mã giúp thêm một chút.
2. **Recursive (và Pointer) trong cách cài đặt hiện tại gần như không xử lý được chỗ thiếu ở giữa:**
   - Recursive chỉ đúng 4–5%, so với 23% của mô hình app; gần một nửa số lần nó không sinh gì trong container bị thiếu.
   - Pointer (BFS/DFS) chỉ đúng 1–2% ở giữa và không sinh gì trong 78–80% trường hợp.
   - **Đính chính:** bài báo **không** nêu hạn chế này. Định nghĩa cây dở (mục 3.1) cho phép thiếu bất kỳ node nào miễn cha còn có mặt. Mục 5.3 khẳng định mô hình "không đòi hỏi thiết kế theo thứ tự nào". Chỉ Vanilla có hạn chế được nêu rõ: cây dở phải là tiền tố DFS (mục 4.2). Bài báo cũng chỉ đánh giá trên cây dở dạng tiền tố BFS/DFS, nên chưa từng đo trường hợp thiếu ở giữa.
   - Thất bại quan sát được ở đây nhiều khả năng đến từ **cách huấn luyện** (cây đầy đủ, anh em luôn theo thứ tự đọc cố định, nên mô hình học "hết danh sách là dừng") và từ **biểu diễn của app** (vị trí là thứ tự trong container). Đây không phải hạn chế đã được bài báo chứng minh.
   - Bài báo có thí nghiệm "thứ tự không gian ngẫu nhiên" (Table 3): huấn luyện với thứ tự anh em xáo trộn, còn vị trí do khung bao quyết định. Đây là hướng khắc phục nằm ngay trong phương pháp của bài báo, nên thử nghiệm.
3. **Hệ quả cho phương án B:** với cách huấn luyện hiện tại, tab Gợi ý sẽ gần như không phát hiện được phần tử bị quên ở giữa form. Cần thử huấn luyện với thứ tự anh em xáo trộn (theo Table 3) trước khi kết luận.

## Thí nghiệm bổ sung: xáo trộn thứ tự anh em khi huấn luyện (V4, theo Table 3 của bài báo)
- **V4** = V3 (7 độ rộng, ô dọc 20 px, σ = 1) cộng thêm: mỗi lượt huấn luyện, thứ tự các con của mỗi container bị xáo trộn ngẫu nhiên.
  Vị trí do khung bao quyết định ("random spatial ordering", Table 3).
- Khi chèn, phần tử mới được xếp vào khe theo khung bao dự đoán (thứ tự đọc).
- Chấm thêm bản "spatial": sắp các con của cây dự đoán theo khung bao trước khi tính Next, F1 và Edit, vì thứ tự sinh của V4 là tùy ý.

**Kết quả trên tập test** (giải mã có ràng buộc):

| | Chèn: đúng cả hai | **Thiếu ở giữa: đúng cả hai** | Không sinh gì | Next đúng loại | Next IoU ≥ 0,5 | Next ±1 ô | Edit chặt (s) |
|---|---|---|---|---|---|---|---|
| V3 | 18,5 | 4,0 | 49,0% | 32,6 | **23,5** | **15,2** | **33,8** |
| **V4 (xáo trộn)** | **24,4** | **20,0** | **42,5%** | 33,3 | 7,6 | 7,6 | 36,4 |
| *Mô hình app (đối chứng)* | 23,0 | 23,0 | 0% | – | – | – | – |

Bản "spatial" của V4: IoU 6,8; Edit 36,7, tức gần như không đổi.

**Nhận xét:**
- Xáo trộn thứ tự anh em, đúng một thiết lập có trong bài báo, giúp Recursive **bắt được phần tử thiếu ở giữa**: từ 4% lên 20%, gần bằng mô hình app (23%). Tính chung mọi trường hợp chèn, V4 còn nhỉnh hơn mô hình app (24,4% so với 23,0%).
- Điều này khẳng định thất bại trước đó là do **cách huấn luyện** (thứ tự anh em cố định), **không phải** hạn chế của phương pháp.
- Đổi lại, **độ chính xác tọa độ giảm** (IoU từ 23,5% xuống 7,6%). Khi thứ tự bị xáo, mô hình mất gợi ý "phần tử trước nằm ở đâu" để đặt phần tử sau. Tọa độ vẫn đủ để xếp đúng khe ở 39% trường hợp (V3: 32%).
- Theo quy tắc chọn trên val (trung bình chèn đúng và IoU), V3 và V4 gần như hòa (19,55 so với 19,25).
  - Nếu ưu tiên **bắt chỗ thiếu**: chọn V4.
  - Nếu ưu tiên **khung gợi ý đúng tọa độ**: chọn V3.
- Tập test nhỏ (22 màn, khoảng 300 trường hợp chèn), nên chênh 1–2 điểm chưa đủ để kết luận.

## Chạy lại
```bash
C=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
CHROME=$C npx tsx scripts/paper/build-dataset.ts --widths 768,1024,1280,1366,1440,1600,1920 --cell-y 20 --out data/paper-w7c20
python3 scripts/paper/coords_experiment.py      # huấn luyện V1–V4 và chấm (--eval-only để chấm lại, --only=V4 để chạy riêng)
npx tsx scripts/paper/app-insertion.ts         # mốc so sánh: mô hình app
```
