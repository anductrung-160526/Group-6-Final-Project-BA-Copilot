# Bộ chấm QUS bằng NLP theo AQUSA – triển khai và đánh giá

Tính năng chấm chất lượng user story (màn Business Requirements, điểm QUS của module) trước đây dùng danh sách từ khoá và
thang điểm tự đặt, chưa từng được đo. Bản này dựng lại bộ chấm theo **AQUSA** – Lucassen, Dalpiaz, van der Werf,
Brinkkemper (2016), *Improving agile requirements: the Quality User Story framework and tool*, Requirements Engineering
21:383–403 – và đo bằng đúng cách của bài báo (recall/precision theo tiêu chí, Bảng 4–5).

## 1. Phương pháp
- **Chuỗi xử lý (đúng bài báo, §4):** tách story theo cụm chỉ dấu ("As a", "I want", "so that") → gán nhãn từ loại → 5 bộ phân tích: **well-formed, atomic, minimal, uniform, unique**. Đây đúng là 5 tiêu chí AQUSA v1 kiểm.
- **Cải tiến v2 (đúng bài báo, §6):** cụm chỉ dấu khác ("I can", "I need", "in order to"…), lặp cụm chỉ dấu, "/" ">" là liên từ, ngoại lệ động từ hay bị gán nhầm (select, support…), ký hiệu "&" "+" trong vai trò, chữ thừa ở đầu, viết tắt trong ngoặc. Bật/tắt riêng từng cái.
- **Ngoài bài báo (thiết kế của nhóm):**
  - gán nhãn từ loại bằng **wink-nlp** (JavaScript) thay Stanford CoreNLP; chạy cả server và trình duyệt;
  - tinh chỉnh trên tập dev: gom họ cụm chỉ dấu ("I want to be able to" = "I want"); gán nhãn trên cả câu; vế sau "and/or" phải mở đầu bằng động từ; "/" chỉ tính khi nối hai động từ; hai phần lý do lồng nhau xếp vào minimal; diễn giải 3 phép kiểm "&" ở §6.5 thành "≥ 2/3 phép kiểm cho thấy hai từ riêng";
  - giữ các kiểm tra cũ không thuộc AQUSA: FULL_SENTENCE, NO_END, AMBIGUOUS, NO_CRITERIA, trùng gần đúng (Jaccard) và thang điểm 100 − 30/15/5;
  - story tiếng Việt cũ trong DB vẫn chấm bằng bộ luật cũ.
- **Không kiểm (đúng như bài báo):** conceptually sound, problem-oriented, unambiguous, conflict-free, estimatable, independent, complete – cần hiểu nội dung nghiệp vụ, bài báo loại khỏi AQUSA (§4).

## 2. Dữ liệu, gán nhãn, chia tập
- **207 user story thật** từ 3 bộ công khai (Dalpiaz et al., *Requirements data sets – user stories*): g02 federalspending (98), g03 loudoun (58), g04 recycling (51).
- **Chia theo bộ gốc:** dev = g04 (51) để chỉnh luật; **test = g02 + g03 (156)**, chấm **một lần** sau khi khoá luật (commit `2932316`).
- **Nhãn:** AI gán theo `dataset/qus-eval/GUIDELINES.md` (định nghĩa Bảng 1 và §3), mỗi lỗi kèm lý do, **commit trước khi chạy bộ chấm lên dữ liệu**. Sửa đúng 1 nhãn dev (g04-006, mâu thuẫn với quy tắc đã áp cho g02-040); không sửa nhãn test.
- Tỷ lệ story có ≥ 1 lỗi theo nhãn: test 11,5%, dev 7,8% (bài báo: 56% theo AQUSA). Bộ dữ liệu này viết khá chuẩn nên **số lỗi thật ít (20 lỗi trên test)** → khoảng tin cậy rộng.
- **Độ tin cậy nhãn:** `dataset/qus-eval/kappa-sample.csv` – 20 story (10 có lỗi, 10 không, seed 7) để người gán độc lập, tính Cohen's kappa bằng `scripts/qus-eval/kappa.py`. **Chưa có kết quả** tại thời điểm viết.

## 3. Kết quả trên tập test (156 story) – như Bảng 4 của bài báo
| Bộ chấm | Recall micro | Precision micro | F1 | Recall macro | Precision macro | KTC 95% recall | KTC 95% precision | % story bị báo lỗi |
|---|---|---|---|---|---|---|---|---|
| legacy (main) | 55 | 73,3 | 62,9 | 52,1 | 73,9 | 33,3–77,3 | 50–90 | 7,1 |
| AQUSA v1 | 70 | 46,7 | 56 | 66,7 | 47,8 | 50–90,9 | 32–64,3 | 15,4 |
| AQUSA v1+v2 | 80 | 51,6 | 62,7 | 81,3 | 56,5 | 62,5–95,5 | 37,5–68,4 | 17,3 |

Bài báo (AQUSA v1, 1.023 story, 18 bộ): recall micro 93,8 / macro 92,1; precision micro 72,2 / macro 77,4.

## 4. Theo từng tiêu chí – như Bảng 5
| Tiêu chí | Lỗi thật | legacy (main): TP/FP/FN · R · P | AQUSA v1: TP/FP/FN · R · P | AQUSA v1+v2: TP/FP/FN · R · P |
|---|---|---|---|---|
| well-formed | 3 | 2/2/1 · 66,7 · 50 | 3/4/0 · 100 · 42,9 | 2/3/1 · 66,7 · 40 |
| atomic | 7 | 1/0/6 · 14,3 · 100 | 3/10/4 · 42,9 · 23,1 | 6/10/1 · 85,7 · 37,5 |
| minimal | 1 | 0/0/1 · 0 · – | 0/2/1 · 0 · 0 | 0/2/1 · 0 · 0 |
| uniform | 5 | 4/0/1 · 80 · 100 | 4/0/1 · 80 · 100 | 4/0/1 · 80 · 100 |
| unique | 4 | 4/2/0 · 100 · 66,7 | 4/0/0 · 100 · 100 | 4/0/0 · 100 · 100 |

## 5. Nhận xét
- **Mục tiêu Perfect Recall (bài báo ưu tiên không bỏ sót):** AQUSA v1+v2 bắt **80% lỗi** (KTC 62,5–95,5), bộ cũ chỉ **55%**. Riêng **atomic** – lỗi phổ biến nhất – tăng từ 1/7 lên **6/7**.
- **Đổi lại precision thấp hơn** (51,6 so với 73,3): 10 báo nhầm atomic, phần lớn là ca biên ("Upload and Validate" là tên trang, "correct or delete" là một ràng buộc, động từ trong mệnh đề phụ). Bài báo cũng gặp đúng loại lỗi này (§5.1, precision atomic 51,2%).
- **F1 gần bằng nhau** (62,7 so với 62,9) và **khoảng tin cậy chồng lên nhau** → với 20 lỗi thật, chưa thể nói bộ mới tốt hơn về tổng thể; chỉ có thể nói bộ mới **bỏ sót ít hơn rõ rệt**, đúng định hướng của bài báo.
- **v2 so với v1:** recall 70 → 80, precision 46,7 → 51,6. Cải tiến đóng góp nhiều nhất là **ngoại lệ động từ (§6.4)**: tắt nó recall giảm 80 → 65.
- **Minimal 0/1:** bộ chấm không bắt được ví dụ dạng "such as …" trong phần lý do và báo nhầm 2 ca.
- **Well-formed:** báo nhầm "I don't want" và phần hành động dùng tính từ ("to be up-to-date", "to be appropriate") là không có động từ.
- Tốc độ: khoảng 0,3 ms mỗi story (Node).

## 6. Ablation (micro, tập test): tắt từng cải tiến v2
| Tắt cải tiến | Recall | Precision | F1 |
|---|---|---|---|
| ends-indicators | 85 | 50 | 63 |
| chunk-repetition | 80 | 51,6 | 62,7 |
| slash-gt | 80 | 53,3 | 64 |
| verb-exceptions | 65 | 46,4 | 54,2 |
| symbol-role | 80 | 51,6 | 62,7 |
| starting-text | 80 | 51,6 | 62,7 |
| abbreviation | 80 | 51,6 | 62,7 |

## 7. Danh sách lỗi của bộ chấm trên tập test (phân tích lỗi, §5.1)
| Loại | Tiêu chí | Story | Nội dung |
|---|---|---|---|
| FP | atomic | g02-012 | As a Broker user, I want to Upload and Validate the error message to have accurate text.… |
| FP | atomic | g02-018 | As a Developer, I want D Files generation requests to be managed and cached, so that duplicate … |
| FP | atomic | g02-035 | As a Developer , I want to ensure that attempts to correct or delete non-existent records don't… |
| FN | uniform | g02-040 | As an Agency user, I want FABS deployed into production, so I can submit my Financial Assistanc… |
| FP | well-formed | g02-052 | As a user, I don't want to see NASA grants displayed as contracts.… |
| FP | atomic | g02-059 | As a Broker user, I want to have PPoPZIP+4 work the same as the Legal Entity ZIP validations.… |
| FP | well-formed | g02-061 | As an Agency user, I want FPDS data to be up-to-date daily.… |
| FP | atomic | g02-063 | As a Developer , I want to determine how agencies will generate and validate D Files from FABS … |
| FN | well-formed | g02-078 | As an owner, I only want zero-padded fields, so that I can justify padding.… |
| FN | atomic | g02-081 | As a Developer, I want to prevent duplicate transactions from being published and deal with the… |
| FP | atomic | g02-082 | As a FABS user, I want to submit a citywide as a PPoPZIP and pass validations.… |
| FP | atomic | g02-083 | As a Broker user, I want to have updated error codes that accurately reflect the logic and prov… |
| FP | well-formed | g02-091 | As a FABS user, I want the language on FABS pages to be appropriate for me, so that I am not co… |
| FP | atomic | g02-092 | As a FABS user, I do not want  DABS banner messages and vice versa, so that I have the appropri… |
| FP | atomic | g02-097 | As an agency user, I want a landing page to navigate to either FABS or DABS pages, so that I ca… |
| FN | minimal | g03-008 | As an Applicant, I want to Check the Status of a transaction, so that I can understand where th… |
| FP | minimal | g03-020 | As a staff member, I want to denote an application with a Final Action status. So that I can fi… |
| FP | minimal | g03-021 | As a Planning Staff member, I want to Conduct and Track Plan Amendments and Planning Studies, s… |
| FP | atomic | g03-055 | As a County Staff Member, I want to create a custom query/report outside of the common querying… |

## 8. Tích hợp vào app
- `shared/aqusa.ts` (bộ phân tích), `shared/qus.ts` (story tiếng Anh dùng AQUSA, mỗi lỗi ghi tiêu chí và mục bài báo; API và giao diện không đổi).
- Mô hình NLP (~3,5 MB) tách ra `public/nlp.js`, chỉ tải khi mở màn Business Requirements (`client/useAqusa.ts`); `app.js` giữ ~447 KB. Server nạp qua `shared/nlp-node.ts`.
- Kiểm thử: `tsc` sạch; `npm test` 250/251 (lỗi `safePath` có sẵn trên `main`, không liên quan); `tests/aqusa.test.ts` 8/8; E2E qua; màn Business Requirements tải `nlp.js`, không lỗi JavaScript.

## 9. Hạn chế
- Mẫu nhỏ: 156 story test, 20 lỗi thật; minimal và unique chỉ 1–4 lỗi.
- Nhãn do AI gán (experimenter bias, như bài báo nêu ở §5.2); chưa có kappa với người gán.
- Chỉ 3 bộ dữ liệu, đều từ dự án chính phủ/ứng dụng web Mỹ.
- Chỉ tiếng Anh; nhóm tiêu chí ngữ nghĩa chưa kiểm.

## 10. Chạy lại
```bash
npx tsx scripts/qus-eval/eval.ts --split dev  --out dataset/export/eval/qus-eval-dev.json
npx tsx scripts/qus-eval/eval.ts --split test --out dataset/export/eval/qus-eval-test.json
python3 scripts/qus-eval/kappa.py dataset/qus-eval/kappa-sample.csv   # sau khi người gán điền file
npx tsx --test tests/aqusa.test.ts
```
