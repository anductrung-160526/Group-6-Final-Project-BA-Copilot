# Bộ chấm chất lượng user story (QUS) – phiên bản trong app

Bộ chấm dựa trên **AQUSA** – Lucassen, Dalpiaz, van der Werf, Brinkkemper (2016), *Improving agile requirements: the Quality
User Story framework and tool*, Requirements Engineering 21:383–403 – và là phiên bản có chỉ số tốt nhất trong các phiên bản
nhóm đã thử. Tài liệu này chỉ mô tả phiên bản đó; các phiên bản thử nghiệm khác đã gỡ khỏi repo (còn trong lịch sử git).

## 1. Phương pháp
**Quy trình (§4):** tách story thành vai trò / hành động / lý do theo cụm chỉ dấu → gán nhãn từ loại (wink-nlp) → 5 bộ phân tích →
danh sách lỗi (tiêu chí, đoạn chữ, gợi ý sửa, mục bài báo) → hiển thị trên màn Business Requirements. Mã nguồn: `shared/aqusa.ts`
(bộ phân tích), `shared/qus.ts` (tích hợp vào tính năng chấm QUS), `client/useAqusa.ts` (tải mô hình NLP khi cần).

| Lớp | Nội dung | Căn cứ |
|---|---|---|
| AQUSA v1 | Well-formed (có vai trò và hành động), Atomic (hai hành động nối bằng and/or), Minimal (ngoặc, câu thêm, ví dụ, chữ thừa ở đầu), Uniform (lệch mẫu đa số của module), Unique (trùng chính xác) | Bài báo §3–§4 |
| Cải tiến v2 | Cụm chỉ dấu mở rộng ("I would like", "I need", "in order to"…), lặp cụm chỉ dấu trong vai trò/hành động, "/" và ">" là liên từ, danh sách ngoại lệ động từ (select, support…), ký hiệu "&" trong vai trò ("R&D Manager"), viết tắt trong ngoặc | Bài báo §6 |
| Luật của nhóm | Bỏ qua liên từ trong mệnh đề phụ; vế sau "and/or" phải mở đầu bằng động từ; "/" sau mạo từ/tính từ là danh từ ghép; "+" dính chữ không phải liên từ; vai trò phải có danh từ; "I want to (be able to)" cùng họ "I want"; uniform xét mẫu đa số riêng từng phần; "(s)", "such as", câu thứ hai mở bằng "So that"; hai phần lý do lồng nhau | Ngoài bài báo – rút ra từ phân tích lỗi, mỗi luật có ví dụ trong `tests/aqusa.test.ts` |

- **Bộ gán nhãn từ loại:** wink-nlp. Đã đối chứng với Stanford CoreNLP (bộ bài báo dùng): chênh lệch khoảng ±1 điểm F1, nên chọn wink-nlp vì nhanh hơn khoảng 40 lần, nhẹ hơn khoảng 140 lần và chạy được trên trình duyệt.
- **Không kiểm:** 8 tiêu chí ngữ nghĩa và thực dụng còn lại của QUS (bài báo cũng loại vì cần hiểu nội dung).
- **Tích hợp:** chạy ngay trên trình duyệt khi BA gõ (khoảng 0,2 ms mỗi story); mô hình NLP (~3,5 MB) tách ra `public/nlp.js`, chỉ tải khi mở màn Business Requirements. Chỉ cảnh báo, không chặn lưu (nguyên tắc "Perfect Recall", §1). Story tiếng Việt cũ vẫn chấm bằng bộ luật cũ.

## 2. Dữ liệu và đáp án
- **671 user story thật** từ 10 bộ công khai (Dalpiaz et al., *Requirements data sets – user stories*): g02 federalspending, g03 loudoun, g04 recycling, g05 openspending, g08 frictionless, g10 scrumalliance, g11 nsf, g12 camperplus, g13 planningpoker, g14 datahub (`dataset/qus-eval/stories.jsonl`).
- **Đáp án (`dataset/qus-eval/labels.jsonl`):** nhãn **đa số của 3 người gán độc lập** (agent AI không có ký ức, chỉ đọc hướng dẫn và story, không thấy kết quả bộ chấm) – `dataset/qus-eval/independent/agent{1,2,3}.jsonl`, hướng dẫn `dataset/qus-eval/GUIDELINES.md` (định nghĩa Bảng 1 và §3). Fleiss' kappa giữa 3 người gán: 0,98. 9.1% story có ít nhất một lỗi.
- **test3** (g10–g14, 345 story) là các dự án chưa từng dùng khi xây dựng luật – kết quả trên tập này phản ánh khả năng tổng quát.

## 3. Kết quả trên toàn bộ 671 story

**Table 4**  Overall recall and precision, computed using both the micro- and the macro-average of the data sets

| | Recall (%) | Precision (%) |
|---|---|---|
| Macro | 77,3 | 57,1 |
| Micro | 82,4 | 60,2 |

**Table 5**  Number of defects, false positives, false negatives, recall, and precision per quality criterion

| n = 671 | # Def | # FP | # FN | Rec (%) | Prec (%) |
|---|---|---|---|---|---|
| Well-formed | 4 | 0 | 1 | 80,0 | 100,0 |
| Atomic | 47 | 25 | 8 | 73,3 | 46,8 |
| Minimal | 14 | 6 | 2 | 80,0 | 57,1 |
| Uniform | 23 | 6 | 1 | 94,4 | 73,9 |
| Unique | 5 | 0 | 0 | 100,0 | 100,0 |
| SUM | 93 | 37 | 12 | 82,4 | 60,2 |

F1 micro 69,6. Khoảng tin cậy 95% (bootstrap theo story): recall 71,7–85,9, precision 51,4–65,6.

**Theo từng bộ:**

| Bộ | Story | TP | FP | FN | Recall | Precision | F1 |
|---|---|---|---|---|---|---|---|
| g02 | 98 | 8 | 4 | 1 | 88,9 | 66,7 | 76,2 |
| g03 | 58 | 8 | 0 | 1 | 88,9 | 100,0 | 94,1 |
| g04 | 51 | 5 | 3 | 0 | 100,0 | 62,5 | 76,9 |
| g05 | 53 | 1 | 5 | 1 | 50,0 | 16,7 | 25,0 |
| g08 | 66 | 8 | 2 | 3 | 72,7 | 80,0 | 76,2 |
| g10 | 97 | 6 | 10 | 1 | 85,7 | 37,5 | 52,2 |
| g11 | 73 | 2 | 2 | 1 | 66,7 | 50,0 | 57,1 |
| g12 | 55 | 13 | 3 | 1 | 92,9 | 81,3 | 86,7 |
| g13 | 53 | 3 | 4 | 2 | 60,0 | 42,9 | 50,0 |
| g14 | 67 | 2 | 4 | 1 | 66,7 | 33,3 | 44,4 |

## 4. Kết quả trên test3 (dự án chưa từng dùng khi xây dựng luật)

**Table 4**

| | Recall (%) | Precision (%) |
|---|---|---|
| Macro | 74,4 | 49,0 |
| Micro | 81,3 | 53,1 |

**Table 5**

| n = 345 | # Def | # FP | # FN | Rec (%) | Prec (%) |
|---|---|---|---|---|---|
| Well-formed | 4 | 0 | 0 | 100,0 | 100,0 |
| Atomic | 26 | 14 | 4 | 75,0 | 46,2 |
| Minimal | 10 | 5 | 1 | 83,3 | 50,0 |
| Uniform | 8 | 4 | 1 | 80,0 | 50,0 |
| Unique | 1 | 0 | 0 | 100,0 | 100,0 |
| SUM | 49 | 23 | 6 | 81,3 | 53,1 |

F1 micro 64,2. Khoảng tin cậy 95%: recall 68,0–92,0, precision 39,0–67,6.

## 5. So sánh
| | Recall micro | Precision micro |
|---|---|---|
| Bộ chấm cũ của platform (danh sách từ khoá, đo trên cùng dữ liệu trước khi gỡ) | 45,6 | 41,3 |
| **Phiên bản này – toàn bộ** | **82,4** | **60,2** |
| Phiên bản này – test3 | 81,3 | 53,1 |
| *Bài báo – AQUSA v1 (1.023 story, 18 bộ, dữ liệu khác)* | *93,8* | *72,2* |

## 6. Nhận xét
- Bắt được khoảng **8/10 lỗi** (bộ cũ: chưa đến 5/10); khoảng **6/10 cảnh báo đúng** trên toàn bộ dữ liệu, khoảng 5/10 trên test3.
- **Atomic là tiêu chí khó nhất** (precision khoảng 47%) – giống bài báo (51,18%). Báo nhầm chủ yếu do bộ gán nhãn hiểu nhầm danh từ thành động từ ("track my child's activity and schedule") hoặc cụm là tên riêng ("Upload and Validate").
- **Hiệu quả khác nhau giữa các dự án** (F1 từ 25 ở g05 đến 94 ở g03) – phụ thuộc phong cách viết.
- Trên test3, recall gần như giữ nguyên (81,3) nhưng precision giảm (53,1) – một phần luật của nhóm khớp với các dự án dùng khi xây dựng.

## 7. Hạn chế
- Chỉ 5/13 tiêu chí QUS; chỉ tiếng Anh.
- Đáp án do AI gán (3 người gán độc lập); chưa có người gán thật – `dataset/qus-eval/kappa-sample.csv` (20 story) dành cho bước này.
- Số lỗi thật ít (68), khoảng tin cậy rộng.
- Luật của nhóm được xây dựng trên g02–g08, nên kết quả toàn bộ có phần lạc quan; test3 là con số thận trọng hơn.

## 8. Chạy lại
```bash
npx tsx scripts/qus-eval/eval.ts --split all     # → dataset/export/eval/qus/all.json
npx tsx scripts/qus-eval/eval.ts --split test3   # → dataset/export/eval/qus/test3.json
python3 scripts/qus-eval/tables.py dataset/export/eval/qus/all.json   # in Bảng 4–5
python3 scripts/qus-eval/agreement.py /tmp/majority.jsonl A1=dataset/qus-eval/independent/agent1.jsonl A2=dataset/qus-eval/independent/agent2.jsonl A3=dataset/qus-eval/independent/agent3.jsonl
python3 scripts/qus-eval/kappa.py dataset/qus-eval/kappa-sample.csv  # sau khi người gán điền file
npx tsx --test tests/aqusa.test.ts
```
