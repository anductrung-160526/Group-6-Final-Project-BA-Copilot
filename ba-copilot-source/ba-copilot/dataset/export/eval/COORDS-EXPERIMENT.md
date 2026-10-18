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
2. **Recursive gần như không xử lý được chỗ thiếu ở giữa:** chỉ 4–5% đúng, so với 23% của mô hình app. Gần một nửa số lần, Recursive **không sinh gì** trong container bị thiếu. Lý do: theo đúng phương pháp của bài báo, mô hình học từ cây đầy đủ, nên luôn coi danh sách con hiện có là phần đầu của danh sách đúng và chỉ viết tiếp vào cuối. Đây là giới hạn của phương pháp, không phải lỗi cài đặt.
3. **Hệ quả cho phương án B:** tab Gợi ý sẽ bám sát bài báo, nhưng **gần như không phát hiện được phần tử bị quên ở giữa form**. Nó vẫn làm tốt trường hợp màn còn thiếu phần cuối, tức gợi ý phần tiếp theo và vẽ tiếp.

## Chạy lại
```bash
C=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
CHROME=$C npx tsx scripts/paper/build-dataset.ts --widths 768,1024,1280,1366,1440,1600,1920 --cell-y 20 --out data/paper-w7c20
python3 scripts/paper/coords_experiment.py      # huấn luyện V1–V3 và chấm (--eval-only để chấm lại)
npx tsx scripts/paper/app-insertion.ts         # mốc so sánh: mô hình app
```
