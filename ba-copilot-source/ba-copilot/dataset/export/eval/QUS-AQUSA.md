# Tái lập AQUSA v1 (Lucassen et al. 2016) – kết quả theo Bảng 4 và Bảng 5

Tái lập **AQUSA v1 đúng như bài báo mô tả** – *Improving agile requirements: the Quality User Story framework and tool*,
Requirements Engineering 21:383–403 (2016) – trên dữ liệu user story công khai, trình bày theo đúng dạng Bảng 4 và Bảng 5.
Các vòng thử nghiệm trước (tinh chỉnh, cải tiến v2, gán nhãn nhiều lần) đã được gỡ khỏi repo; lịch sử còn trong git.

## 1. Phương pháp
- **Chuỗi xử lý (§4):** StoryChunker tách vai trò / hành động / lý do theo cụm chỉ dấu của v1 ("As a/an", "I want (to)", "so that") → gán nhãn từ loại → 5 bộ phân tích: WellFormed, Atomic, Minimal, Uniform, Unique → danh sách lỗi. Mã nguồn: `shared/aqusa.ts`, chạy với `{ v2: [], team: false }` (tắt cả 7 cải tiến v2 của §6 và mọi tinh chỉnh của nhóm).
- **Luật của từng bộ phân tích:**
  - Well-formed: có cụm chỉ dấu vai trò và cụm chỉ dấu hành động;
  - Atomic: phần hành động có "and"/"or" mà hai vế đều có động từ, hoặc có ký hiệu "&", "+", ";"; vai trò có "and/or/&/+";
  - Minimal: chữ thừa trước vai trò, nội dung trong ngoặc, câu thêm, "e.g.", "i.e.", "for example", "note:", "etc.";
  - Uniform: mẫu cụm chỉ dấu khác mẫu chiếm đa số trong bộ (thiếu phần lý do không tính là lệch – lý do là tuỳ chọn, §3.1);
  - Unique: trùng chính xác (§5.1).
- **Bộ gán nhãn từ loại:** Stanford CoreNLP 4.5.7 (`english-left3words-distsim`) – như bài báo. Chạy thêm với wink-nlp (thư viện dùng trong app) để đối chiếu.
- **Phần khác bài báo (không tránh được):** mã do nhóm tự viết lại theo mô tả của bài báo (không dùng mã gốc); Minimal, Uniform cài đặt theo cách hiểu của nhóm ở những chỗ bài báo không nêu chi tiết; CoreNLP bản 4.5.7 thay cho bản năm 2015.

## 2. Dữ liệu và nhãn
- **671 user story** từ 10 bộ công khai (Dalpiaz et al., *Requirements data sets – user stories*): g02 federalspending, g03 loudoun, g04 recycling, g05 openspending, g08 frictionless, g10 scrumalliance, g11 nsf, g12 camperplus, g13 planningpoker, g14 datahub (`dataset/qus-eval/stories.jsonl`).
- **Nhãn vàng:** 71 lỗi, gán theo `dataset/qus-eval/GUIDELINES.md` (định nghĩa Bảng 1 và §3) – `dataset/qus-eval/labels.jsonl`.
- **Tính toán:** Uniform và Unique xét trong từng bộ. Micro = gộp mọi lỗi của mọi bộ; macro = trung bình recall/precision của từng bộ (bỏ bộ không xác định được), như §5.1.
- #Def = số lỗi bộ chấm báo; #FP = báo nhưng không phải lỗi; #FN = lỗi thật bị bỏ sót.

## 3. Kết quả – AQUSA v1, bộ gán nhãn CoreNLP (như bài báo)

**Table 4**  Overall recall and precision of AQUSA v1, computed using both the micro- and the macro-average of the data sets

| | Recall (%) | Precision (%) |
|---|---|---|
| Macro | 59.0 | 39.4 |
| Micro | 70.4 | 43.5 |

**Table 5**  Number of defects, false positives, false negatives, recall, and precision per quality criterion

| n = 671 | # Def | # FP | # FN | Rec (%) | Prec (%) |
|---|---|---|---|---|---|
| Well-formed | 14 | 9 | 0 | 100.0 | 35.7 |
| Atomic | 71 | 48 | 9 | 71.9 | 32.4 |
| Minimal | 8 | 5 | 7 | 30.0 | 37.5 |
| Uniform | 17 | 3 | 5 | 73.7 | 82.4 |
| Unique | 5 | 0 | 0 | 100.0 | 100.0 |
| SUM | 115 | 65 | 21 | 70.4 | 43.5 |

Khoảng tin cậy 95% (bootstrap theo story, ngoài bài báo): recall 58.6–78.7, precision 37.1–48.8. Tỷ lệ story bị báo ít nhất một lỗi: 14.6% (bài báo: 56%).

## 4. Đối chiếu: cùng AQUSA v1, bộ gán nhãn wink-nlp

**Table 4**

| | Recall (%) | Precision (%) |
|---|---|---|
| Macro | 56.7 | 38.8 |
| Micro | 67.6 | 43.2 |

**Table 5**

| n = 671 | # Def | # FP | # FN | Rec (%) | Prec (%) |
|---|---|---|---|---|---|
| Well-formed | 14 | 9 | 0 | 100.0 | 35.7 |
| Atomic | 67 | 46 | 11 | 65.6 | 31.3 |
| Minimal | 8 | 5 | 7 | 30.0 | 37.5 |
| Uniform | 17 | 3 | 5 | 73.7 | 82.4 |
| Unique | 5 | 0 | 0 | 100.0 | 100.0 |
| SUM | 111 | 63 | 23 | 67.6 | 43.2 |

## 5. So với bài báo
| | Bài báo (n = 1023, 18 bộ) | Tái lập – CoreNLP (n = 671, 10 bộ) | Tái lập – wink-nlp |
|---|---|---|---|
| Recall micro / macro | 93,8 / 92,1 | 70.4 / 59 | 67.6 / 56.7 |
| Precision micro / macro | 72,2 / 77,4 | 43.5 / 39.4 | 43.2 / 38.8 |

## 6. Nhận xét
- **Thấp hơn bài báo ở cả recall và precision.** Giống bài báo: **Atomic là tiêu chí báo nhầm nhiều nhất** (precision ~32%, bài báo 51,18%) và Unique đạt 100/100.
- **Well-formed báo nhầm 9 lần:** các story dùng "I would like", "I need", "I don't want", "I only want" không nằm trong cụm chỉ dấu của v1 nên bị coi là thiếu phần hành động. Đây đúng là hạn chế bài báo tự nêu và đề xuất sửa ở §6.1 (v2).
- **Minimal bỏ sót 7/10:** v1 không nhận "such as" và hai phần lý do lồng nhau là thừa.
- **CoreNLP và wink-nlp gần như ngang nhau** (micro recall 70.4 so với 67.6; precision 43.5 so với 43.2). Khác biệt chủ yếu ở Atomic, nơi CoreNLP nhận đúng một số động từ ("support", "select").
- **Lý do có thể của khoảng cách với bài báo:** dữ liệu khác (khoảng 10% story có lỗi so với nhiều hơn hẳn trong bài báo, nên precision dễ thấp); người gán nhãn khác (bài báo: người chấm độc lập; ở đây: AI theo hướng dẫn); mã viết lại từ mô tả.

## 7. Hạn chế
- Nhãn do AI gán, chưa có người gán thứ hai (`dataset/qus-eval/kappa-sample.csv` đang chờ). Người gán đã thấy kết quả của các bộ chấm ở các vòng trước nên không độc lập hoàn toàn.
- Số lỗi thật ít (71), khoảng tin cậy rộng.
- Chỉ 5/13 tiêu chí QUS (đúng phạm vi AQUSA v1).

## 8. Chạy lại
```bash
# CoreNLP: tải stanford-corenlp-4.5.7.jar và -models.jar từ Maven Central vào $D, biên dịch Tag.java
javac -cp $D/stanford-corenlp-4.5.7.jar -d scripts/qus-eval/corenlp/classes scripts/qus-eval/corenlp/Tag.java
npx tsx scripts/qus-eval/eval.ts --split all --tagger corenlp --jars $D/stanford-corenlp-4.5.7.jar:$D/stanford-corenlp-4.5.7-models.jar --out dataset/export/eval/qus-v1/aqusa-v1-corenlp.json
npx tsx scripts/qus-eval/eval.ts --split all --out dataset/export/eval/qus-v1/aqusa-v1-wink.json
python3 scripts/qus-eval/tables.py dataset/export/eval/qus-v1/aqusa-v1-corenlp.json "AQUSA v1 (paper)"
```
