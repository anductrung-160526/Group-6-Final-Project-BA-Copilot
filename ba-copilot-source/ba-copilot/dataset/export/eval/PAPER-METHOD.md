> **Cập nhật (tính năng gợi ý bố cục):** tính năng nay chỉ dùng Recursive Transformer, không còn luật hay bộ lọc. Có khung mờ phần tử tiếp theo (top-3) và nút Hoàn thành bố cục. Mô hình học trên **400 màn gốc** (2.219 cây), cấu hình chọn theo val là hidden 256 × 2 lớp. Kết quả mới nhất xem `LAYOUT-SUGGEST.md`. Số liệu bên dưới là của bản 200 màn.


# Phương pháp chính của tính năng Gợi ý: Recursive Transformer Tree Decoder (Li et al. 2020)

Tab Gợi ý của Design Studio dùng **Recursive Transformer Tree Decoder** của Li, Amelot, Zhou, Bengio, Si (2020).
Tên bài báo: *Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders*, arXiv:2001.05308, mục 4.4.
Mô hình được cài đặt và huấn luyện theo đúng phương pháp mô tả trong bài báo. Những điểm buộc phải khác được ghi rõ ở bảng dưới.

## 1. Đối chiếu với bài báo

| Thành phần | Bài báo | BA Copilot |
|---|---|---|
| Bài toán (§3.1) | Cho cây dở P̂ (có gốc, có cha của mọi node), dự đoán cây đầy đủ Ĝ' | Như bài báo. Cây dở là màn BA đang thiết kế |
| Node (§3.1) | Loại c, cờ lá t, khung bao b = (x, y, x̂, ŷ) | Như bài báo. Khung bao đo trên canvas đang hiển thị (client) |
| Embedding (Eq.1–5) | e = e_b + e_c + e_t; e_b ghép 4 embedding tọa độ, đóng vai positional embedding | Như bài báo. **Không** cộng thêm embedding vị trí chuỗi |
| Bộ giải mã (Eq.9–10) | Self-attention trên cha cùng các anh em, rồi chú ý tới trạng thái ẩn tầng cuối của tổ tiên; giải mã từ gốc xuống | Như bài báo. Trạng thái tổ tiên của gốc là một vector "canvas" học được (chi tiết cài đặt) |
| Đầu ra (Eq.7) | Softmax riêng cho c, t, x, y, x̂, ŷ; có EOS; tọa độ là lớp rời rạc (§6) | Như bài báo. Cross-entropy, không làm mềm nhãn |
| Huấn luyện (§5.3) | Cây đầy đủ, chia train/val/test 80/10/10, chọn cấu hình theo val | Như bài báo, chia theo màn gốc. Thứ tự anh em giữ như cấu trúc cây. Dừng sớm theo val loss |
| Dò cấu hình | hidden {128, 256, 512} × số lớp {2, 4, 6} | hidden {128, 256} × số lớp {2, 4, 6}. **Bỏ 512** vì chỉ có CPU |
| Lưới tọa độ (§5.1) | 72×128 (màn điện thoại khổ dọc) | **128 ô ngang** theo tỷ lệ độ rộng trang × **ô dọc 20 px** (tối đa 256 ô), vì dữ liệu là giao diện web |
| Dữ liệu (§5.1) | Rico, hơn 55 nghìn màn Android, lọc theo khung cha / số node / số con | 200 màn gốc web của nhóm × 7 độ rộng (768–1920 px) = **1.071 cây train**, 168 cây val, 22 cây test; lọc như bài báo |
| Giải mã | Không nêu chi tiết | Tham lam, không ràng buộc |
| Đánh giá (§5.2–5.3) | Pair F1, Next, Tree Edit Distance (KLM); cây dở BFS/DFS 10/50/80% | Như bài báo, có bản chặt (khớp tọa độ) và bản nới lỏng (chỉ loại) |

**Phần ngoài bài báo**, trình bày là phần ứng dụng:
- chuyển phần tử dự đoán thành câu prompt để AI chèn vào thiết kế;
- vị trí chèn trong container suy từ khung bao dự đoán, theo thứ tự đọc;
- bộ luật "Sửa" R1–R9 (không phải học máy), giữ như trước.

## 2. Chọn cấu hình theo val
| hidden | Số lớp | Tham số | Epoch | Val loss |
|---|---|---|---|---|
| 128 | 2 | 661.664 | 13 | 3.4251 |
| 128 | 4 | 1.190.816 | 15 | 3.19 |
| 128 | 6 | 1.719.968 | 13 | 3.1698 |
| 256 | 2 | 2.371.104 | 14 | 3.1686 |
| 256 | 4 | 4.477.984 | 11 | 3.141 |
| 256 | 6 | 6.584.864 | 11 | 3.0932 |

→ Chọn **hidden 256, 6 lớp** (val loss thấp nhất).
- Suy luận TypeScript (`shared/recursive.ts`) khớp PyTorch: `tests/recursive.test.ts`, sai lệch xác suất dưới 1e-3.
- Độ trễ khoảng 0,4–0,5 s mỗi màn trên CPU.

## 3. Kết quả trên tập test (22 màn web, 1280 px)
Mỗi ô ghi F1 / Next / Edit (giây KLM).

| Thiết lập | Chặt (loại + tọa độ) | Nới lỏng (chỉ loại) | Không gợi ý (F1 / Edit) |
|---|---|---|---|
| BFS 10% | 7.3 / 0.0 / 60.0 | 25.5 / 36.4 / 45.7 | 13.9 / 68.6 |
| BFS 50% | 48.4 / 0.0 / 32.5 | 62.6 / 31.8 / 23.4 | 65.4 / 38.1 |
| BFS 80% | 76.2 / 9.1 / 14.2 | 86.5 / 31.8 / 8.1 | 86.9 / 17.0 |
| DFS 10% | 7.8 / 0.0 / 60.2 | 26.4 / 50.0 / 45.9 | 13.9 / 68.6 |
| DFS 50% | 49.2 / 13.6 / 34.0 | 56.3 / 36.4 / 28.4 | 65.4 / 38.1 |
| DFS 80% | 74.1 / 0.0 / 15.8 | 81.1 / 22.7 / 10.7 | 86.9 / 17.0 |

**Next tính trên 132 lượt:** đúng loại 34.8%; khớp tuyệt đối tọa độ 3.8%; lệch ≤ 1 ô 12.9%; IoU ≥ 0,5 19.7%.

**Chèn đúng chỗ** (bỏ 1 phần tử có anh em; 308 trường hợp, trong đó 200 thiếu ở giữa):
- đúng khe 29.2%, đúng loại 24.7%, đúng cả hai 16.6%;
- **thiếu ở giữa: đúng cả hai 3.5%**;
- không sinh phần tử nào trong container: 55.5%.

## 4. Nhận xét và giới hạn
- **Mạnh khi màn còn thiếu phần tiếp theo** (gợi ý viết tiếp), đúng như bài toán của bài báo.
  Ví dụ R036-15 (thiếu nút "Lưu cài đặt" ở cuối hàng nút): tab Gợi ý đề xuất "Thêm Button vào cuối Row", độ tin cậy 74% (`export/demo/demoB-R036-15.png`).
- **Yếu khi phần tử bị quên nằm ở giữa:** chỉ đúng 3.5%.
  - Ví dụ R041-09: thiếu ô Mật khẩu giữa ô Email và nút Đăng nhập; mô hình không gợi ý (`demoB-R041-09.png`).
  - Bài báo **không** nêu hạn chế này và cũng không đánh giá trường hợp này (chỉ dùng cây dở dạng tiền tố). Đây là kết quả đo được trong thực nghiệm của nhóm: mô hình học từ cây đầy đủ nên quen dừng (EOS) sau con cuối cùng.
- **Có lúc dừng sớm ngay cả khi thiếu ở cuối.** Ví dụ R059-10: thiếu phân trang ở cuối trang, mô hình đoán EOS (`demoB-R059-10.png`). Tỷ lệ Next đúng loại 34.8%.
- Hướng cải thiện (ngoài bài báo, đã thử ở `STRICT-NEXT.md` và `DATA-LIMITED.md`):
  - xáo trộn thứ tự anh em khi huấn luyện (V4): bắt chỗ thiếu ở giữa tăng lên khoảng 20%, nhưng tọa độ kém hơn;
  - thêm dữ liệu thật, như màn do BA vẽ hoặc qua Sinh thiết kế bằng Claude.
- Dữ liệu do Claude soạn, chưa qua BA kiểm nghiệm; tập test nhỏ.

## 5. Mô hình đối chứng (không dùng trong tab Gợi ý)
`model/next-transformer.json` là Transformer encoder hai chiều phát hiện chỗ thiếu; không thuộc phương pháp của bài báo.
- Chỉ dùng trong thí nghiệm đối chứng (`paper-decoders.json`).
- Giữ cho API cũ `GET /api/screens/:id/suggestions` (không có khung bao).
- Tab Gợi ý luôn gọi `POST` kèm khung bao, nên luôn dùng Recursive.

## Chạy lại
```bash
python3 scripts/paper/train_faithful.py        # dò cấu hình, huấn luyện, đánh giá → model/recursive-layout.pt
python3 scripts/paper/export_recursive.py      # → model/recursive-layout.json + recursive-layout.parity.json
npm test                                       # gồm đối chiếu số học TS ↔ PyTorch
```
