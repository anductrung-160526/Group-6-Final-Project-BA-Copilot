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


---

# Vòng 2: thêm dữ liệu, chỉnh luật tổng quát, chấm trên tập test mới

## A. Quy trình
- **Dữ liệu mới:** g05 openspending (53) và g08 frictionless (66) = **test2, 119 story**. Nhãn gán và commit **trước** khi chạy bộ chấm. Ca biên chốt thêm ghi trong `GUIDELINES.md`.
- **Dev vòng 2** = g02 + g03 + g04 (207 story). Tập test vòng 1 đã xem lỗi nên không còn dùng để chấm chính thức; kết quả vòng 1 (mục 3–4) vẫn là kết quả chính thức của phiên bản 1.
- **Chỉnh luật trên dev, chỉ thêm luật mang tính ngôn ngữ chung**, kèm ví dụ tự viết trong `tests/aqusa.test.ts`:
  - liên từ trong mệnh đề phụ (that, which, how…) không tính atomic;
  - "+" dính chữ ("ZIP+4", "C++") không phải liên từ;
  - "/" sau tính từ hoặc mạo từ là danh từ ghép;
  - "be + tính từ" là hành động hợp lệ;
  - "I don't / do not / only want" là một họ cụm chỉ dấu riêng;
  - mẫu đa số của uniform xác định **riêng từng phần**, phần ends chỉ xét các story có ends;
  - "(s)" chỉ số nhiều; câu thứ hai mở bằng "So that" là phần ends; "such as" là dấu hiệu ví dụ.
- **Luật bị loại nhờ kiểm tra theo từng bộ:** "cụm Title Case là tên riêng" (để sửa g02-012 "Upload and Validate") làm hỏng g03, nơi mọi động từ viết hoa và là lỗi atomic thật.
- **Kiểm tra theo từng bộ trên dev** (F1, bản v1+v2 vòng 1 → vòng 2): g02 54,5 → 76,9; g03 77,8 → 100; g04 71,4 → 71,4. Không bộ nào kém đi.
- Khoá luật ở commit `be42c91`, chấm test2 **một lần**.

## B. Kết quả trên dev vòng 2 (207 story – dùng để chỉnh, KHÔNG phải kết quả chính thức)
| Bộ chấm | Recall micro | Precision micro | F1 | Recall macro | Precision macro | KTC 95% recall | KTC 95% precision |
|---|---|---|---|---|---|---|---|
| legacy (main) | 42,3 | 68,8 | 52,4 | 34,7 | 49,2 | 21,4–65,2 | 42,1–90 |
| AQUSA v1 | 69,2 | 62,1 | 65,5 | 65,3 | 61,3 | 52–89,5 | 46,7–78,6 |
| AQUSA v1+v2 | 88,5 | 76,7 | 82,1 | 88,9 | 78 | 79,2–100 | 60,7–90 |

## C. Kết quả chính thức vòng 2: test2 (119 story, 9,2% story có lỗi, 14 lỗi thật)
| Bộ chấm | Recall micro | Precision micro | F1 | Recall macro | Precision macro | KTC 95% recall | KTC 95% precision |
|---|---|---|---|---|---|---|---|
| legacy (main) | 50 | 20,6 | 29,2 | 29,2 | 12,5 | 16,7–72,7 | 5–32,4 |
| AQUSA v1 | 57,1 | 27,6 | 37,2 | 33,4 | 14,8 | 33,3–84,6 | 11,1–40,6 |
| AQUSA v1+v2 | 71,4 | 33,3 | 45,5 | 62,5 | 27,1 | 44,4–100 | 14,3–51,6 |

| Tiêu chí | Lỗi thật | legacy (main): TP/FP/FN | AQUSA v1: TP/FP/FN | AQUSA v1+v2: TP/FP/FN |
|---|---|---|---|---|
| well-formed | 1 | 1/5/0 | 1/18/0 | 0/14/1 |
| atomic | 4 | 0/0/4 | 1/3/3 | 1/4/3 |
| minimal | 1 | 0/0/1 | 0/0/1 | 1/1/0 |
| uniform | 8 | 6/0/2 | 6/0/2 | 8/1/0 |
| unique | 0 | 0/22/0 | 0/0/0 | 0/0/0 |

## D. Nhận xét trung thực
- **Bộ mới vẫn tốt nhất** trên dữ liệu chưa thấy: F1 45,5 so với 37,2 (AQUSA v1) và 29,2 (bộ cũ); recall 71,4 so với 50,0. Bộ cũ báo nhầm 22 lần "trùng lặp" vì dùng độ giống từ (Jaccard ≥ 0,8) cho các story cùng khuôn ("I want an X integration").
- **Nhưng thấp hơn nhiều so với dev** (F1 82,1 → 45,5). Khoảng cách này cho thấy luật vẫn còn khớp với kiểu viết của 3 bộ dev, và bộ chấm chưa tổng quát tốt.
- **Nguyên nhân chính: 14/23 lỗi là well-formed báo nhầm** ở story có phần hành động là cụm danh từ ("I want an Elasticsearch integration"). Đây là lỗi của nhóm ở hai chỗ:
  1. phép kiểm "phần hành động phải có động từ" **không có trong định nghĩa của bài báo** (Bảng 1 chỉ yêu cầu có role và means). Ở vòng 1 nó bị ghi nhầm là §4.3; nay đã sửa ghi chú thành thiết kế của nhóm;
  2. **nhãn không nhất quán**: ở g02 nhãn tính lỗi cho means không có động từ (g02-078, 087, 092), ở g08 lại không. Nhãn test2 **không được sửa** sau khi thấy kết quả.
- **Atomic tổng quát kém:** chỉ bắt 1/4 lỗi trên test2 (bỏ sót "filter, sort and aggregate", "do … and operationalize", "import/export" khi thiếu cụm chỉ dấu).
- Mẫu nhỏ (14 lỗi thật), khoảng tin cậy rất rộng.

## E. Phân tích độ nhạy (làm SAU khi xem test2 – không phải kết quả chính thức)
Tắt phép kiểm "phần hành động phải có động từ":

| | Recall | Precision | F1 |
|---|---|---|---|
| test2, bản khoá | 71,4 | 33,3 | 45,5 |
| test2, tắt phép kiểm động từ | 71,4 | 62,5 | 66,7 |
| dev vòng 2, bản khoá | 88,5 | 76,7 | 82,1 |
| dev vòng 2, tắt phép kiểm động từ | 80,8 | 75,0 | 77,8 |

Phép kiểm này hại nhiều hơn lợi và không thuộc bài báo. **Khuyến nghị:** bỏ nó và sửa hướng dẫn gán nhãn cho thống nhất ("means là cụm danh từ vẫn well-formed", đúng Bảng 1), rồi kiểm chứng trên **một tập test thứ ba** chưa xem. Không công bố con số 66,7 như kết quả chính thức.

## F. Lỗi của bộ chấm trên test2
| Loại | Tiêu chí | Story | Nội dung |
|---|---|---|---|
| FP | minimal | g05-019 | As a Data Publishing User, I want to know what my data needs to be able to be visualised o… |
| FP | uniform | g05-019 | As a Data Publishing User, I want to know what my data needs to be able to be visualised o… |
| FN | atomic | g05-029 | As a Data Consuming User, I want to be able to filter, sort and aggregate data by multiple… |
| FP | atomic | g05-037 | As a Data Consuming User, I want to be able to share a view state as a URL to social netwo… |
| FP | atomic | g05-073 | As an API User, I want to be able to normalise measures by GINI and related socioeconomic … |
| FP | atomic | g05-099 | As a Data Consuming User, I want to visualize by default in treemap, bubble tree, map and … |
| FP | well-formed | g08-015 | As a Developer, I want a jQuery plugin for Core Data Packages, so that I can use it to app… |
| FN | atomic | g08-017 | As a Developer, I want to do exploratory data analysis in R and operationalize that analys… |
| FP | well-formed | g08-022 | As a Developer, I want an Elasticsearch integration, so that I can integrate data-packaged… |
| FP | well-formed | g08-023 | As a Developer, I want an SPSS integration, so that I can integrate data-packaged data wit… |
| FP | well-formed | g08-024 | As a Developer, I want an EPrints integration, so that I can integrate data-packaged data … |
| FP | well-formed | g08-025 | As a Developer, I want a Mongo integration, so that I can integrate data-packaged data wit… |
| FP | well-formed | g08-026 | As a Developer, I want a DAT integration, so that I can integrate data-packaged data with … |
| FP | well-formed | g08-032 | As a developer, I want an DSpace integration, so that I can integrate data-packaged data w… |
| FP | well-formed | g08-033 | As a Developer, I want Feather integration, so that I can integrate data-packaged data wit… |
| FP | well-formed | g08-034 | As a Developer, I want HDF5 integration, so that I can integrate data-packaged data with p… |
| FP | well-formed | g08-035 | As a Researcher, working with data, I want an Microsoft Power BI integration, so that I ca… |
| FP | well-formed | g08-036 | As a ResearcherPublisher, I want an integration with Zenodo, so that when I store my datas… |
| FN | well-formed | g08-039 | As a ResearcherDeveloper, would like the ability import/export from MS-SQL, so that I can … |
| FN | atomic | g08-039 | As a ResearcherDeveloper, would like the ability import/export from MS-SQL, so that I can … |
| FP | well-formed | g08-040 | As a Researcher, working with data in NetCDF, I want NetCDF integration, so that I can sto… |
| FP | well-formed | g08-041 | As a Researcher, I want an integration with https://data.mendeley.com/, so that I can vali… |
| FP | well-formed | g08-042 | As a Publisher, I would like an integration with Excel, so that I can output cleaned Data … |
| FP | atomic | g08-062 | As a RepositoryManagerResearcher, I want an app that acts as a match-making service for pa… |


---

# Vòng 3: tập test thứ ba

## A. Quy trình (định trước, không chỉnh thêm)
- **test3 = 345 story chưa từng chạy bộ chấm:** g10 scrumalliance, g11 nsf, g12 camperplus, g13 planningpoker, g14 datahub. Nhãn gán theo định nghĩa đã sửa và commit trước khi chạy.
- **Đúng một thay đổi so với vòng 2,** đã đề xuất trước khi có test3: tắt phép kiểm "phần hành động phải có động từ" và sửa hướng dẫn cho đúng Bảng 1. Sửa 3 nhãn dev (g02-078, 087, 092) cho nhất quán. Không chỉnh luật nào khác.
- Khoá ở commit `cf79231`, chấm test3 **một lần**.

## B. Dev vòng 3 (g02, g03, g04, g05, g08 – 326 story; không phải kết quả chính thức)
| Bộ chấm | Recall micro | Precision micro | F1 | Recall macro | Precision macro | KTC 95% recall | KTC 95% precision |
|---|---|---|---|---|---|---|---|
| legacy (main) | 43,2 | 32 | 36,8 | 32,5 | 30,9 | 23,1–58,5 | 20–41,8 |
| AQUSA v1 | 62,2 | 52,3 | 56,8 | 51,4 | 45 | 45–78 | 39,1–62,9 |
| AQUSA v1+v2 | 83,8 | 70,5 | 76,5 | 79,4 | 67,2 | 72,2–95,1 | 58,3–86,4 |

## C. Kết quả chính thức vòng 3: test3 (345 story, 8,1% story có lỗi, 32 lỗi thật)
| Bộ chấm | Recall micro | Precision micro | F1 | Recall macro | Precision macro | KTC 95% recall | KTC 95% precision |
|---|---|---|---|---|---|---|---|
| legacy (main) | 46,9 | 60 | 52,6 | 26,9 | 43,5 | 21,2–59,1 | 29,4–84,6 |
| AQUSA v1 | 78,1 | 62,5 | 69,4 | 73 | 61,5 | 64,5–89,7 | 46,3–76,7 |
| AQUSA v1+v2 | 81,3 | 45,6 | 58,4 | 74,4 | 44,8 | 68–92 | 32,1–59,6 |

| Tiêu chí | Lỗi thật | legacy (main): TP/FP/FN | AQUSA v1: TP/FP/FN | AQUSA v1+v2: TP/FP/FN |
|---|---|---|---|---|
| well-formed | 4 | 4/3/0 | 4/0/0 | 4/0/0 |
| atomic | 16 | 5/1/11 | 12/8/4 | 12/22/4 |
| minimal | 6 | 1/0/5 | 4/4/2 | 5/5/1 |
| uniform | 5 | 4/3/1 | 4/3/1 | 4/4/1 |
| unique | 1 | 1/3/0 | 1/0/0 | 1/0/0 |

## D. Ablation trên test3 (tắt từng cải tiến v2)
| Tắt cải tiến | Recall | Precision | F1 |
|---|---|---|---|
| ends-indicators | 78,1 | 45,5 | 57,5 |
| chunk-repetition | 78,1 | 59,5 | 67,6 |
| slash-gt | 81,3 | 45,6 | 58,4 |
| verb-exceptions | 81,3 | 46,4 | 59,1 |
| symbol-role | 81,3 | 45,6 | 58,4 |
| starting-text | 81,3 | 45,6 | 58,4 |
| abbreviation | 81,3 | 45,6 | 58,4 |

## E. Nhận xét trung thực
- **Recall cao nhất** vẫn là AQUSA v1+v2 (81,3), đúng định hướng không bỏ sót của bài báo. **F1 cao nhất là AQUSA v1** (69,4); bản v1+v2 chỉ đạt 58,4 do precision 45,6.
- **Nguyên nhân chính là lỗi cài đặt cải tiến §6.2 (lặp cụm chỉ dấu).** Bản cài đặt đếm "I want" ở bất kỳ đâu trong câu, kể cả trong phần lý do ("so that I can find the ones I want", "decide if I want to attend"). Bài báo mô tả việc lặp cụm trong phần role và means. Hệ quả: phần lớn trong 22 lần báo nhầm atomic.
- **Uniform báo nhầm "As the site editor"** vì "the" được coi là mẫu khác "As a". Hướng dẫn chỉ nói "a/an" là cùng mẫu, nên đây là lỗ hổng của cả hướng dẫn lẫn bộ chấm.
- Bỏ phép kiểm động từ đã đúng hướng: well-formed trên test3 đạt 4/4, không báo nhầm.
- Bộ cũ: precision 60,0 nhưng chỉ bắt 46,9% lỗi; bỏ sót 11/16 lỗi atomic.

## F. Tổng hợp ba lần chấm chính thức (mỗi tập chấm một lần, F1 micro)
| Tập test | Số story / lỗi thật | Bộ cũ | AQUSA v1 | AQUSA v1+v2 (bản khoá lúc đó) |
|---|---|---|---|---|
| test (vòng 1: g02, g03) | 156 / 20 | 62,9 | 56,0 | 62,7 |
| test2 (vòng 2: g05, g08) | 119 / 14 | 29,2 | 37,2 | 45,5 |
| test3 (vòng 3: g10–g14) | 345 / 32 | 52,6 | **69,4** | 58,4 |

Trên cả ba tập, AQUSA (v1 hoặc v1+v2) **có recall cao hơn bộ cũ**. Không có phiên bản nào thắng ở mọi tập về F1; chênh lệch nhiều chỗ nằm trong khoảng tin cậy.

## G. Đề xuất (chưa kiểm chứng – cần tập test thứ tư)
1. Cài đặt lại §6.2 đúng mô tả: chỉ xét lặp cụm chỉ dấu trong phần role và means, không xét phần ends. Ablation sau khi xem test3 cho thấy chỉ riêng việc tắt §6.2 đã đưa F1 lên 67,6; đây là phân tích sau, không phải kết quả.
2. Coi "As a / an / the" là cùng một mẫu, và bổ sung vào hướng dẫn gán nhãn.
3. Có người gán nhãn thứ hai và tính kappa (`kappa-sample.csv`).
4. Trong lúc chờ kiểm chứng, nếu ưu tiên ít báo nhầm cho BA thì có thể cấu hình app dùng AQUSA v1 (`v2: []`), vì v1 có F1 tốt nhất trên test3. Nếu ưu tiên không bỏ sót (đúng tinh thần bài báo) thì giữ v1+v2. Đây là quyết định sản phẩm của nhóm.

## H. Lỗi của bộ chấm trên test3
| Loại | Tiêu chí | Story | Nội dung |
|---|---|---|---|
| FP | minimal | g10-018 | As a site editor, I want to set the following dates on a news item: Start Publishing Date,… |
| FP | atomic | g10-020 | As a site editor, I want to assign priority numbers to news items, so that I can indicate … |
| FP | atomic | g10-023 | As a site visitor, I want to see a list of all upcoming Events, so that I can decide if I … |
| FP | minimal | g10-041 | As a visitor, I want to download presentations, PDFs, etc. on Scrum, so that I can learn f… |
| FP | atomic | g10-045 | As a site admin, I want to be emailed whenever a job is submitted, so that I am aware of i… |
| FP | atomic | g10-049 | As a recruiter, I want to be able to extend an ad for another 30 days by visiting the site… |
| FP | uniform | g10-052 | As the site editor, I want to include a teaser with each article, so that site visitors ca… |
| FP | uniform | g10-054 | As the site editor, I want to add an article to the site, so that the site has plenty of c… |
| FP | atomic | g10-055 | As a site editor, I want to set start publishing dates, old article date, and stop publish… |
| FP | uniform | g10-057 | As the site editor, I want to have pretty good control over how the article, so that artic… |
| FP | minimal | g10-058 | As a site visitor, I want to click the link from the article teaser to take me directly to… |
| FP | atomic | g10-062 | As a site visitor, I want to do a full-text search of article body, title, and author name… |
| FP | atomic | g10-067 | As a trainer, I want to see the upcoming courses are what I want visitors to notice, so th… |
| FP | atomic | g10-086 | As a CSM, I want to be sent an email welcoming me to the Scrum Alliance and with instructi… |
| FN | uniform | g10-095 | As a member, I want to have the system email me a new password or a password reminder sinc… |
| FP | atomic | g11-033 | As a web recruiter manager, I want to confirm the recruiter is set up and working properly… |
| FP | atomic | g11-053 | As a web recruiter manager, I want to confirm the recruiter is set up and working properly… |
| FN | atomic | g11-059 | As an author, I want to be able to indent / outdent content.… |
| FN | atomic | g12-012 | As a camp administrator, I want to be able to create, modify rules that campers and camp w… |
| FP | uniform | g12-014 | As a camp administrator, I want to create an avenue so parents can submit feedback and gen… |
| FP | atomic | g12-037 | As a parent, I want to be able to track my child's activity and schedule at camp, so that … |
| FP | minimal | g12-047 | As a parent, I want to be able to see and edit my enrolled children to the camp year, so t… |
| FP | atomic | g13-005 | As a moderator, I want to select an item to be estimated or re-estimated, so that the team… |
| FP | minimal | g13-006 | As a moderator, I want to add an item to the list of items to be estimated, so that so tha… |
| FN | atomic | g13-015 | As a moderator, I want to copy/paste stories from a spreadsheet, so that I can get started… |
| FP | atomic | g13-018 | As a moderator, I want to export a transcript of a game as a HTML file, so that I can save… |
| FP | atomic | g13-019 | As a moderator, I want to export a transcript of a game as a CSV file, so that I can furth… |
| FN | minimal | g13-035 | As a participant, I want to be able to see each estimator's prior estimates for the story … |
| FP | atomic | g14-022 | As a Consumer, I want to view a data package online, so that I can get a sense of whether … |
| FP | atomic | g14-024 | As a consumer, I want to view the data package, so that that I can get a sense of whether … |
| FP | atomic | g14-029 | As a Consumer, I want to search data packages, so that that I can find the ones I want.… |
| FP | atomic | g14-032 | As a Developer, I want to use data package as a node lib in my project, so that that I can… |
| FN | atomic | g14-043 | As a Publisher, I want to version my Data Package and keep multiple versions around includ… |
| FP | atomic | g14-051 | As a Consumer, I want to browse and find publishers, so that that I can find interesting p… |
| FP | atomic | g14-057 | As an owner, I want to invite someone using their email to sign up and become a member of … |
| FP | atomic | g14-059 | As an owner, I want to view all the people in my organization and what roles they have, so… |
| FP | atomic | g14-061 | As an owner, I want to remove a user as an owner, so that they are just a member and no lo… |


---

# Thí nghiệm: thay bộ gán nhãn bằng Stanford CoreNLP (như bài báo)

## Mục đích
Bài báo dùng Stanford CoreNLP để gán nhãn từ loại; bản của nhóm dùng wink-nlp. Thí nghiệm trả lời: khoảng cách so với bài báo (recall 78 so với 94) **có phải do bộ gán nhãn không**.

## Cách làm
- CoreNLP 4.5.7 (tải từ Maven Central), MaxentTagger với mô hình mặc định `english-left3words-distsim`. Chương trình `scripts/qus-eval/corenlp/Tag.java`, adapter `scripts/qus-eval/corenlp-tagger.ts`.
- **Giữ nguyên toàn bộ luật** (code khoá vòng 3, `cf79231`); chỉ thay bộ gán nhãn. Nhãn Penn Treebank quy đổi sang Universal POS (quy đổi của nhóm: dạng của "be" và MD → AUX, VB* khác → VERB).
- Chấm cả hai bộ gán nhãn trên mọi tập, cùng nhãn vàng. Kết quả: `dataset/export/eval/corenlp/*.json`.

## Kết quả (F1 micro; trong ngoặc: recall / precision)
| Tập | Số story | v1 – wink | v1 – CoreNLP | v1+v2 – wink | v1+v2 – CoreNLP |
|---|---|---|---|---|---|
| dev vòng 1 (g04) | 51 | 50,0 (50,0 / 50,0) | 61,5 (66,7 / 57,1) | 71,4 (83,3 / 62,5) | 71,4 (83,3 / 62,5) |
| test vòng 1 (g02, g03) | 156 | 61,5 (70,6 / 54,5) | 66,7 (76,5 / 59,1) | 86,5 (94,1 / 80,0) | 91,9 (100 / 85,0) |
| test2 (g05, g08) | 119 | 53,3 (57,1 / 50,0) | 60,0 (64,3 / 56,3) | 66,7 (71,4 / 62,5) | 73,3 (78,6 / 68,8) |
| **test3 (g10–g14)** | 345 | **69,4** (78,1 / 62,5) | 65,7 (71,9 / 60,5) | 58,4 (81,3 / 45,6) | 55,2 (75,0 / 43,6) |
| **Toàn bộ 10 bộ** | 671 | 62,7 (69,6 / 57,1) | 64,5 (71,0 / 59,0) | 67,1 (82,6 / 56,4) | 67,9 (82,6 / 57,6) |

Lưu ý: luật đã được chỉnh bằng wink-nlp trên g02, g03, g04, g05, g08, nên ở các tập này so sánh **thiên vị wink**. test3 là tập công bằng nhất, vì cả hai đều chưa chỉnh trên đó.

## Tốc độ và tài nguyên (máy này)
| | wink-nlp | CoreNLP |
|---|---|---|
| Khởi động / nạp mô hình | 75 ms | ~0,9 s (JVM + mô hình) |
| Gán nhãn 671 câu | 91 ms (~0,14 ms/câu) | ~3,8 s sau khởi động (~5,6 ms/câu) |
| Chạy trên trình duyệt | được | không (Java, cần server) |
| Kích thước | ~3,5 MB | ~480 MB (jar + mô hình) |

## Nhận xét
- **Bộ gán nhãn không phải nguyên nhân chính của khoảng cách với bài báo.** Trên toàn bộ 671 story, hai bộ gán nhãn gần như ngang nhau (F1 67,1 so với 67,9; recall bằng nhau 82,6). Trên test3, wink còn nhỉnh hơn.
- CoreNLP gán nhãn đúng một số động từ mà wink sai ("support", "select"), nhất quán với lỗi bài báo nêu ở §6.4. Lợi thế này chủ yếu thể hiện ở **v1** (không có danh sách ngoại lệ động từ): toàn bộ 10 bộ F1 62,7 → 64,5. Ở v1+v2, danh sách ngoại lệ §6.4 đã bù gần hết.
- Khoảng cách còn lại so với bài báo nhiều khả năng do **luật** (ví dụ lỗi cài đặt §6.2), **cách gán nhãn** (định nghĩa ca biên khác người chấm của bài báo) và **dữ liệu** (bộ khác, ít lỗi hơn: khoảng 9% so với 56% story có lỗi).
- **Kết luận cho sản phẩm:** giữ wink-nlp. Chất lượng tương đương, nhanh hơn khoảng 40 lần, nhỏ hơn khoảng 140 lần, chạy được ngay trên trình duyệt.

## Chạy lại
```bash
# tải stanford-corenlp-4.5.7.jar và stanford-corenlp-4.5.7-models.jar từ Maven Central vào $D
javac -cp $D/stanford-corenlp-4.5.7.jar -d scripts/qus-eval/corenlp/classes scripts/qus-eval/corenlp/Tag.java
npx tsx scripts/qus-eval/eval.ts --split test3 --tagger corenlp --jars $D/stanford-corenlp-4.5.7.jar:$D/stanford-corenlp-4.5.7-models.jar
```


---

# Gán nhãn lại từ đầu
Toàn bộ 671 story đã được gán lại theo một bản hướng dẫn thống nhất (`dataset/qus-eval/GUIDELINES.md`). So sánh nhãn, danh sách nhãn đổi, cảnh báo thiên lệch và kết quả đánh giá lại: xem `RELABEL.md`. Các bảng ở những mục trên vẫn dùng nhãn cũ (`dataset/qus-eval/archive/labels-v1.jsonl`).
