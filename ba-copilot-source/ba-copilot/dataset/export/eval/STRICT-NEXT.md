# Tăng Next chặt cho Recursive Transformer Tree Decoder (Li et al. 2020): lưới thô, độ rộng, thêm màn gốc

**"Next chặt"** (§5.2 bài báo): phần tử đầu tiên mô hình sinh sau tiền tố BFS/DFS phải đúng loại **và** đúng cả 4 tọa độ khung bao.
Mọi số là trung bình 6 thiết lập BFS/DFS 10/50/80%, giải mã tham lam tự do (đúng bài báo), trừ khi ghi khác.

## 1. Dữ liệu và quy trình
- **Chia 80/10/10** theo màn gốc, phân tầng theo nhóm màn (`splitOf`, tỷ lệ như §5.3 của bài báo).
  - **400 màn cũ:** 321 / 41 / 38. Tập **test 38 màn cố định** cho mọi biến thể.
  - **100 màn mới R401–R500** chia riêng: 79 / 12 / 9. Phần test 9 màn là "test-mới".
- **Bản chia 70/15/15 trước đó** (`PAPER-TABLES.md`) có tập test khác, nên kết quả **không so trực tiếp** được với ở đây.
- **Số cây:**
  - 400 màn, 7 độ rộng: **2.240 / 287 / 38**.
  - 400 màn, chỉ 1280 px: 320 / 41 / 38.
  - 500 màn, 7 độ rộng: 2.793 / 371 / 38 + 9 cây test-mới.
  - Lọc như bài báo loại **7 cây** (màn R158 ra ngoài khung cha) ở **cả ba lưới**: bộ lọc tính theo pixel nên không phụ thuộc lưới.
- **Chọn cấu hình** hidden {128, 256} × lớp {2, 4} theo val loss.
  - **Chọn tổ hợp** theo val (1280 px). Vì val loss không so được giữa các lưới, tổ hợp được so bằng **IoU ≥ 0,5 tính trên pixel**.
  - **Test** chỉ chấm một lần, ở bước cuối (`--eval-only --eval-test`).
- **Giai đoạn A dừng ở 7/9 tổ hợp** theo yêu cầu: G1 × W2 đang chạy dở thì dừng, G2 × W2 chưa chạy.

## 2. Kết quả chính (test)
| Biến thể (test 38 màn, 1280 px) | Next chặt | Đúng loại | ±1 ô | IoU ≥ 0,5 | F1 chặt | F1 nới lỏng | Edit (s) |
|---|---|---|---|---|---|---|---|
| G0 × W0, 400 màn (mốc) | 5,3 | 32,9 | 11,0 | 17,5 | 45,8 | 61,6 | 38,6 |
| G2 × W0, 400 màn | 6,6 | 34,6 | 15,8 | 17,1 | 46,3 | 60,5 | 38,2 |
| **G2 × W0, 500 màn (khuyến nghị)** | 11,0 | 37,3 | 24,6 | 27,2 | 48,8 | 62,9 | 40,8 |
| Không gợi ý | – | – | – | – | 55,9 | 55,9 | 60,5 |

- **Next chặt** trên test tăng từ **5,3%** (mốc) lên **11,0%** (G2 × W0, 500 màn).
- **IoU ≥ 0,5** tăng từ 17,5% lên 27,2%; F1 chặt từ 45,8 lên 48,8; F1 nới lỏng từ 61,6 lên 62,9.
- **Không gợi ý:** F1 nới lỏng 55,9, Edit 60,5 s.

**Độ dao động theo seed** (G2 × W0, 500 màn, hidden 256 × 4 lớp, seed 42/43/44; trung bình ± độ lệch chuẩn):

| Tập | Next chặt | Đúng loại | ±1 ô | IoU ≥ 0,5 | F1 chặt | F1 nới lỏng | Edit (s) |
|---|---|---|---|---|---|---|---|
| val1280 | 14,2 ± 1,6 | 39,3 ± 2,4 | 25,1 ± 1,1 | 28,9 ± 0,3 | 46,8 ± 2,1 | 60,0 ± 1,2 | 40,4 ± 2,5 |
| test | 10,4 ± 1,4 | 35,7 ± 1,5 | 21,8 ± 2,5 | 24,6 ± 3,2 | 46,6 ± 2,2 | 60,4 ± 2,6 | 37,9 ± 2,6 |
| test_new | 12,3 ± 1,1 | 29,0 ± 3,9 | 19,1 ± 2,8 | 22,2 ± 4,9 | 46,1 ± 1,4 | 60,8 ± 2,0 | 27,8 ± 1,5 |

Next chặt trên test của 3 seed là 11,0 / 8,8 / 11,4. **Dao động khoảng ±1–2 điểm**, nên chênh lệch nhỏ hơn mức đó giữa các biến thể không có ý nghĩa.

## 3. Bảng đầy đủ các tổ hợp, 400 màn (val dùng để chọn; test chấm một lần)
| Tổ hợp | Cấu hình | Val loss 1280 | Val: Next chặt | Val: IoU | Test: Next chặt | Test: Đúng loại | Test: ±1 ô | Test: IoU ≥ 0,5 | Test: F1 chặt | Test: F1 nới lỏng | Test: Edit (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| G0 × W0 (mốc) | 256×2 | 2,7982 | 6,5 | 18,3 | 5,3 | 32,9 | 11,0 | 17,5 | 45,8 | 61,6 | 38,6 |
| G1 × W0 | 256×2 | 2,3823 | 9,8 | 21,5 | 8,3 | 38,6 | 17,1 | 21,5 | 46,3 | 60,2 | 37,8 |
| G2 × W0 | 128×2 | 2,2004 | 9,3 | 27,2 | 6,6 | 34,6 | 15,8 | 17,1 | 46,3 | 60,5 | 38,2 |
| G0 × W1 | 256×2 | 2,9682 | 4,9 | 16,7 | 5,3 | 28,5 | 11,0 | 14,5 | 46,6 | 60,4 | 40,4 |
| G1 × W1 | 256×2 | 2,3914 | 9,4 | 20,3 | 9,6 | 35,1 | 18,4 | 20,6 | 43,8 | 57,8 | 37,0 |
| G2 × W1 | 256×2 | 2,2446 | 13,0 | 26,0 | 9,2 | 32,9 | 18,0 | 20,2 | 47,3 | 60,3 | 39,1 |
| G0 × W2 | 256×4 | 2,8924 | 5,3 | 16,3 | 5,3 | 33,3 | 9,2 | 13,6 | 45,6 | 59,2 | 38,8 |

- **G0/G1/G2:** lưới 128 ô × 20 px / 64 ô × 40 px / 32 ô × 40 px.
- **W0:** train/val 7 độ rộng, test 1280 px. **W1:** chỉ 1280 px. **W2:** W0 + embedding độ rộng (ngoài bài báo).
- Val loss **không so được giữa các lưới** (khác số lớp tọa độ).

## 4. Đường học (G2 × W0, 500 màn, cùng cấu hình 256 × 4, chấm trên val 53 màn)
| Màn train | Cây train | Val loss 1280 | Next chặt | Đúng loại | ±1 ô | IoU ≥ 0,5 |
|---|---|---|---|---|---|---|
| 25% (100 màn) | 700 | 2,7286 | 4,7 | 31,8 | 11,0 | 13,8 |
| 50% (200 màn) | 1400 | 2,4089 | 8,8 | 34,6 | 16,7 | 17,6 |
| 100% (399 màn) | 2793 | 2,0802 | 14,2 | 39,0 | 25,2 | 28,9 |

## 5. So ba bộ giải mã (G2 × W0, 500 màn, test 38 màn; cột cuối là test-mới 9 màn: Next chặt / IoU)
| Bộ giải mã | Cấu hình | Next chặt | Đúng loại | ±1 ô | IoU ≥ 0,5 | F1 chặt | F1 nới lỏng | Edit (s) | Test-mới |
|---|---|---|---|---|---|---|---|---|---|
| Recursive | 256×4 | 11,0 | 37,3 | 24,6 | 27,2 | 48,8 | 62,9 | 40,8 | 13,0 / 27,8 |
| Pointer | 128×2 | 5,3 | 34,6 | 16,7 | 18,0 | 46,6 | 59,0 | 43,3 | 5,6 / 13,0 |
| Vanilla (chỉ DFS) | 128×2 | 7,9 | 36,0 | 19,3 | 21,9 | 46,7 | 59,1 | 40,9 | 18,5 / 25,9 |

## 6. Giải mã có ràng buộc (ngoài bài báo), test: tự do → ràng buộc
| Tổ hợp | Next chặt | IoU ≥ 0,5 |
|---|---|---|
| G0 × W0 (mốc) | 5,3 → 5,7 | 17,5 → 19,3 |
| G1 × W0 | 8,3 → 8,3 | 21,5 → 22,8 |
| G2 × W0 | 6,6 → 7,0 | 17,1 → 17,1 |
| G0 × W1 | 5,3 → 5,3 | 14,5 → 14,5 |
| G1 × W1 | 9,6 → 9,6 | 20,6 → 21,1 |
| G2 × W1 | 9,2 → 9,2 | 20,2 → 20,6 |
| G0 × W2 | 5,3 → 5,3 | 13,6 → 14,5 |
| G2 × W0, 500 màn | 11,0 → 11,0 | 27,2 → 27,6 |

## 7. Vì sao tăng / giảm
- **Lưới thô (G1, G2): bài toán dễ hơn.**
  - Ô to gấp 2–4 lần nên trúng đúng ô dễ hơn. Con số Next chặt **giữa các lưới không cùng độ khó**, không được so trực tiếp.
  - Thước đo so được là IoU ≥ 0,5 trên pixel. Trên **val** nó tăng theo độ thô (18,3 → 21,5 → 27,2).
  - Nhưng trên **test** ở 400 màn: G0 17,5 · G1 **21,5** · G2 17,1. G2 × W0 tốt nhất trên val **không** tốt nhất trên test.
  - Với 38–41 màn mỗi tập, chênh vài điểm nằm trong dao động (xem mục seed). Lựa chọn vẫn theo val, đúng nguyên tắc; điều này được ghi lại ở đây.
- **Thêm 100 màn gốc (400 → 500) là thay đổi có tác động rõ nhất.**
  - G2 × W0 trên test: Next chặt 6,6 → 11,0; IoU 17,1 → 27,2; F1 chặt 46,3 → 48,8.
  - Đường học trên val cũng tăng đều: Next chặt 4,7 → 8,8 → 14,2 với 25/50/100% số màn.
  - Kết luận: **dữ liệu chưa bão hòa**.
  - Lưu ý hai yếu tố gây nhiễu:
    - ở 500 màn, val chọn cấu hình lớn hơn (256 × 4 thay vì 128 × 2);
    - val khác nhau (53 so với 41 màn).
- **Thống nhất độ rộng (W1) không giúp.** Chỉ dùng 1280 px làm dữ liệu train ít đi 7 lần (320 so với 2.240 cây); val loss ở 1280 px đều cao hơn W0 ở cả ba lưới.
- **Embedding độ rộng (W2, chỉ thử ở G0) làm kết quả xấu đi** ở mọi thước đo.
- **Giải mã có ràng buộc** chỉ thêm 0–2 điểm. Nó chặn được khung vô lý nhưng không làm tọa độ chính xác hơn.
- **So với mốc "không gợi ý":**
  - **F1** (chặt và nới lỏng) của mọi mô hình đều **thấp hơn** mốc "không gợi ý" (55,9). Lý do: cây dở để nguyên có độ chính xác 100%, còn mô hình sinh thêm phần tử sai thì F1 tụt.
  - **Edit (KLM)** thì mô hình tốt hơn rõ (khoảng 38–41 s so với 60,5 s): sửa cây sinh ra nhanh hơn tự làm từ đầu.
  - Ở 500 màn, Edit nhích lên một chút so với mốc (40,8 so với 38,6 s): mô hình sinh nhiều phần tử hơn, xóa rẻ nhưng không miễn phí.
- **Recursive vẫn tốt nhất** trong ba bộ giải mã về IoU và F1 trên test. Vanilla có Next chặt trên test-mới 18,5%, nhưng test-mới chỉ có 9 màn (khoảng 54 lượt dự đoán), dao động rất lớn.

## 8. Ngoài bài báo (thiết kế của nhóm)
- **Embedding vị trí trong chuỗi (phát hiện sau khi chấm test):**
  - Mọi lần chạy ở Giai đoạn A/B dùng `use_pos=True` mặc định của script, tức **cộng thêm embedding vị trí trong chuỗi**. Điều này trái với bài báo: theo Eq.4–5, khung bao e_b chính là embedding vị trí.
  - Các biến thể vẫn so được với nhau vì cùng điều kiện, nhưng **không phải đúng bài báo**.
  - Đã huấn luyện lại tổ hợp được chọn **đúng bài báo** (`--no-pos`, mục 10).
- **Lưới tọa độ:** bài báo dùng 72 × 128 cho màn điện thoại. Ở đây G0 = 128 ô ngang × ô dọc 20 px (khổ web); G1, G2 là lưới thô hơn để thí nghiệm.
- **Thước đo thêm:** Next ±1 ô và Next IoU ≥ 0,5 (tính trên pixel). Bài báo chỉ có Next chặt và nới lỏng.
- **W2:** embedding độ rộng cộng vào vector canvas (vector canvas là chi tiết cài đặt của nhóm).
- **Giải mã có ràng buộc:** khung con nằm trong khung cha theo chiều ngang, không bắt đầu phía trên cha, x2 ≥ x, y2 ≥ y. Không ép thứ tự anh em.
- **Bỏ hidden 512** khi dò cấu hình (chỉ có CPU).
- **Phân tầng** theo nhóm màn khi chia tập.
- **Dữ liệu:** màn web do nhóm/Claude soạn, không phải Rico.

## 9. Khuyến nghị (chọn theo val)
- **Cấu hình:** G2 × W0 (lưới 32 × 40 px, 7 độ rộng), **500 màn**, Recursive, hidden 256 × 4 lớp, giải mã tự do.
  - Trên test: Next chặt khoảng **10,4 ± 1,4%** (3 seed), IoU ≥ 0,5 khoảng 24,6 ± 3,2%.
- **Hướng tăng tiếp hiệu quả nhất: thêm màn gốc.** Đường học chưa bão hòa. Có thể dùng 300 màn R501–R800 đã soạn sẵn trong `dataset/extra/`.
- **Đánh đổi:** lưới 32 × 40 px cho vị trí thô hơn. Khung gợi ý trên canvas sẽ bị làm tròn theo ô 40 × 40 px (ở 1280 px). Điều này chấp nhận được với khung mờ gợi ý, nhưng cần nói rõ.
- Đã đưa vào app **bản đúng bài báo** (mục 10), theo đồng ý của người dùng.

## 10. Bản đúng bài báo đưa vào app (không embedding vị trí)
> **Đã thay thế (20/10):** app nay dùng mô hình tiền huấn luyện WebSight → tinh chỉnh 785 màn, Next chặt 19,7. Xem `DATA-LIMITED.md`.

Cùng G2 × W0, 500 màn, hidden 256 × 4 lớp, seed 42, chạy với `--no-pos`; chấm test một lần.

| | Val loss 1280 | Test: Next chặt | Đúng loại | ±1 ô | IoU ≥ 0,5 | F1 chặt | F1 nới lỏng | Edit (s) |
|---|---|---|---|---|---|---|---|---|
| Có embedding vị trí (ngoài bài báo) | 2,080 | 11,0 | 37,3 | 24,6 | 27,2 | 48,8 | 62,9 | 40,8 |
| **Đúng bài báo – trong app** | 2,212 | **8,8** | 37,7 | 20,6 | 22,8 | 48,2 | 60,3 | 40,4 |

- Bản đúng bài báo **thấp hơn một chút**: Next chặt −2,2 điểm, IoU −4,4 điểm. Next chặt 8,8 vẫn nằm trong dải dao động theo seed của bản kia (8,8–11,4).
- Test-mới (9 màn): Next chặt 9,3, IoU 22,2.
- **Mốc G0 × W0 cũng dùng embedding vị trí**, nên mức tăng so với mốc (5,3 → 8,8) không hoàn toàn cùng điều kiện.
- **Mô hình trong app:** `model/recursive-layout.json`, gx = 32, gy = 128, cellY = 40, 4,33 triệu tham số, 2.793 cây (399 màn gốc).
  - Suy luận TypeScript khớp PyTorch (`tests/recursive.test.ts`); E2E qua.
  - Khung mờ gợi ý được làm tròn theo ô 40 × 40 px (ở 1280 px).

## Tái lập
```bash
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/paper/build-dataset.ts --widths 768,1024,1280,1366,1440,1600,1920 --cell-x 32 --cell-y 40 --gy 128 --max-root 500 --out data/sn80-G2-w7-r500
python3 scripts/paper/strict_next_experiment.py --only G0W0,G1W0,G2W0,G0W1,G1W1,G2W1,G0W2 --threads 4    # giai đoạn A (val)
bash scripts/paper/strict_next_stageB.sh                                                                 # giai đoạn B, C
python3 scripts/paper/strict_next_experiment.py --data data/sn80-G2-w7-r500 --grid 256:4 --no-pos --eval-test --test-new --out dataset/export/eval/strict-next/G2W0-recursive-r500-s42-nopos.json
python3 scripts/paper/export_recursive.py --result dataset/export/eval/strict-next/G2W0-recursive-r500-s42-nopos.json   # → app
```
JSON: `dataset/export/eval/strict-next/*.json` (mỗi file gồm cấu hình đã dò, val1280, test, test-mới).
