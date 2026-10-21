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
