# Gán nhãn lại từ đầu (cách A) – so sánh nhãn và đánh giá lại

## Quy trình
1. Viết **bản hướng dẫn thống nhất** `GUIDELINES.md` (v2): gộp mọi ca biên của 3 vòng thành quy tắc chung, không có ngoại lệ theo từng câu. Commit `dd4b23d` **trước khi** gán.
2. Chuyển nhãn và hướng dẫn cũ sang `archive/` (chỉ để đối chiếu sau khi gán).
3. Gán lại toàn bộ **671 story** của 10 bộ theo hướng dẫn v2. Commit `a616bd6`.
4. So nhãn v2 với v1; chạy lại đánh giá bằng code khoá vòng 3 (`cf79231`), với cả wink-nlp và CoreNLP.

## So nhãn v2 với v1 (cùng một người gán – đây là độ ổn định, KHÔNG phải độ đồng thuận giữa hai người)
| Tiêu chí | Lỗi v1 | Lỗi v2 | Đồng ý | Kappa |
|---|---|---|---|---|
| well-formed | 5 | 5 | 100.0% | 1.00 |
| atomic | 31 | 32 | 99.6% | 0.95 |
| minimal | 9 | 10 | 99.9% | 0.95 |
| uniform | 19 | 19 | 100.0% | 1.00 |
| unique | 5 | 5 | 100.0% | 1.00 |
| tổng | 69 | 71 | 99.9% | 0.97 |

## Các nhãn bị đổi
| Story | Tiêu chí | v1 → v2 | Bộ chấm (bản khoá vòng 3) đã báo | Ảnh hưởng tới điểm bộ chấm |
|---|---|---|---|---|
| g02-018 | atomic | không → lỗi | có | có lợi (sai → đúng) |
| g04-006 | atomic | lỗi → không | không | có lợi (sai → đúng) |
| g04-051 | atomic | không → lỗi | có | có lợi (sai → đúng) |
| g10-058 | minimal | không → lỗi | có | có lợi (sai → đúng) |

**Cảnh báo thiên lệch:** **cả 4 nhãn bị đổi đều theo hướng có lợi cho bộ chấm.** Mỗi thay đổi có quy tắc trong hướng dẫn v2 làm căn cứ, nhưng hướng dẫn v2 được viết khi người gán đã biết bộ chấm sai ở đâu. Nếu việc gán lại không thiên lệch, thay đổi đáng lẽ phải nghiêng về cả hai phía. Vì vậy số liệu đánh giá lại dưới đây có thể **lạc quan hơn thực tế** khoảng vài điểm. Cần người gán thứ hai độc lập (`kappa-sample.csv`) để kiểm chứng.

## Đánh giá lại trên nhãn v2 (F1 micro; trong ngoặc: recall / precision)
| Tập | Story / lỗi thật | Bộ cũ | v1 – wink | v1 – CoreNLP | v1+v2 – wink | v1+v2 – CoreNLP |
|---|---|---|---|---|---|---|
| dev vòng 1 (g04) | 51 / 6 | 0 (0 / 0) | 50 (50 / 50) | 61,5 (66,7 / 57,1) | 85,7 (100 / 75) | 85,7 (100 / 75) |
| test vòng 1 (g02, g03) | 156 / 18 | 54,5 (50 / 60) | 65 (72,2 / 59,1) | 70 (77,8 / 63,6) | 89,5 (94,4 / 85) | 94,7 (100 / 90) |
| test2 (g05, g08) | 119 / 14 | 29,2 (50 / 20,6) | 53,3 (57,1 / 50) | 60 (64,3 / 56,3) | 66,7 (71,4 / 62,5) | 73,3 (78,6 / 68,8) |
| test3 (g10–g14) | 345 / 33 | 51,7 (45,5 / 60) | 71,2 (78,8 / 65) | 67,6 (72,7 / 63,2) | 60 (81,8 / 47,4) | 56,8 (75,8 / 45,5) |
| Toàn bộ 10 bộ | 671 / 71 | 42,5 (43,7 / 41,3) | 64,5 (70,4 / 59,5) | 66,2 (71,8 / 61,4) | 69,8 (84,5 / 59,4) | 70,6 (84,5 / 60,6) |

**Theo tiêu chí, toàn bộ 10 bộ (TP / FP / FN):**

| Tiêu chí | Lỗi thật | Bộ cũ | AQUSA v1 – wink | AQUSA v1+v2 – wink |
|---|---|---|---|---|
| well-formed | 5 | 5 / 12 / 0 | 5 / 9 / 0 | 4 / 0 / 1 |
| atomic | 32 | 6 / 1 / 26 | 20 / 19 / 12 | 24 / 31 / 8 |
| minimal | 10 | 1 / 0 / 9 | 6 / 3 / 4 | 9 / 5 / 1 |
| uniform | 19 | 14 / 3 / 5 | 14 / 3 / 5 | 18 / 5 / 1 |
| unique | 5 | 5 / 28 / 0 | 5 / 0 / 0 | 5 / 0 / 0 |

Khoảng tin cậy 95% (toàn bộ 10 bộ, wink): AQUSA v1+v2 recall 75,3–88,4, precision 50,5–65,0; AQUSA v1 recall 60,3–76,7, precision 53,0–66,7; bộ cũ recall 31,9–55,4, precision 32,9–56,1.

## Nhận xét
- **Nhãn v2 gần như trùng v1** (đồng ý 99,9%, kappa tự đối chiếu 0,97). Nhãn của người gán ổn định, nhưng điều này **không** chứng minh nhãn đúng.
- **Kết luận chính không đổi so với trước khi gán lại:**
  - trên toàn bộ dữ liệu, AQUSA v1+v2 có **recall cao nhất** (84,5) và F1 cao nhất (69,8 – 70,6), bộ cũ thấp nhất (42,5);
  - trên **test3**, AQUSA v1 có F1 tốt nhất (71,2 wink); v1+v2 báo nhầm atomic nhiều (31 FP trên toàn bộ dữ liệu), chủ yếu do lỗi cài đặt §6.2;
  - wink-nlp và CoreNLP gần như ngang nhau (toàn bộ: 69,8 so với 70,6 F1 cho v1+v2).
- **Không có con số nào ở đây là kết quả chính thức.** Luật đã chỉnh trên g02–g08; hướng dẫn v2 viết sau khi đã xem lỗi trên mọi tập, kể cả test3. Kết quả chính thức vẫn là ba lần chấm một lần ở vòng 1–3.
- **Bước tiếp theo để có số liệu sạch:** (1) người gán thứ hai độc lập trên `kappa-sample.csv` hoặc nhiều hơn; (2) tập test thứ tư chưa ai xem, gán theo hướng dẫn v2 và chấm một lần.

## Chạy lại
```bash
for sp in dev test test2 test3 all; do npx tsx scripts/qus-eval/eval.ts --split $sp --out dataset/export/eval/relabel/$sp-wink.json; done
```
