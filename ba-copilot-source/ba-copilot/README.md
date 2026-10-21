# BA Copilot

Hệ thống web hỗ trợ Business Analyst đi trọn luồng **Prompt → Thiết kế UI → Tài liệu (UC, SRS, Sequence) → Test case → Truy vết**. Đây là sản phẩm của luận án; mọi đầu ra AI là *bản nháp* để BA duyệt.

**Bản chạy trên web:** <https://ba-copilot.up.railway.app/> — mật khẩu: `123321`. Sau khi đăng nhập, chọn tên ở ô *Select your name…* (ví dụ **Lan Nguyen**, vai BA Lead). Cách deploy: [DEPLOY.md](DEPLOY.md).

## 1. Chạy trên máy

Yêu cầu: **Node.js 22.13 trở lên** (bản LTS 22 hoặc 24 tại nodejs.org). Kiểm tra bằng `node -v`. Chạy được trên Windows, macOS, Linux. Mọi lệnh chạy trong thư mục `ba-copilot-source/ba-copilot`.

```bash
npm install        # cài thư viện (cần Internet, chạy một lần)
npm run seed       # tạo dự án mẫu "Electronics Store (sample)" và 3 thành viên
npm start          # build giao diện + chạy server
```

Mở trình duyệt tại **http://localhost:3000**, chọn tên ở ô *Select your name…* trên thanh trên (ví dụ **Lan Nguyen**, vai BA Lead).

- Muốn dùng đúng dữ liệu đã nộp thay vì dữ liệu mẫu mới: bỏ bước `npm run seed`, chép `database/ba-copilot.db` vào `data/ba-copilot.db` (và `database/files/` vào `data/files/`) rồi `npm start`.
- **Gắn Claude:** chép `.env.example` thành `.env` rồi điền khoá (xem mục 6). Không có khoá thì hệ thống chạy **Chế độ Mock** (bộ sinh rule-based): vẫn đi trọn luồng, dùng được để demo offline, và là baseline khi so sánh với LLM trong chương thực nghiệm. Thanh trên hiện *Claude · tên model* hoặc *Mock mode*.
- `npm run dev` chạy chế độ phát triển, tự build lại khi sửa code.

## 2. Cơ sở dữ liệu

Phần mềm dùng **SQLite** tích hợp sẵn trong Node (`node:sqlite`), không cần cài máy chủ CSDL. Dữ liệu khi chạy nằm ở `data/` (không đưa lên Git). Bản nộp kèm mã nguồn nằm ở **`database/`**:

| Tệp | Nội dung |
| --- | --- |
| `database/ba-copilot.db` | Toàn bộ dữ liệu, một tệp SQLite |
| `database/ba-copilot.sql` | Cùng dữ liệu dạng lệnh SQL (cấu trúc + `INSERT`), mở bằng trình soạn thảo bất kỳ |
| `database/files/` | Tệp của Kho tài liệu |
| `database/ERD.md`, `ERD.png`, `ERD-day-du.png` | Sơ đồ quan hệ thực thể: bản tổng quan và bản đầy đủ, danh sách bảng kèm số dòng |

**Xem dữ liệu:** cài [DB Browser for SQLite](https://sqlitebrowser.org/dl/) (miễn phí) → *Open Database* → chọn `database/ba-copilot.db` → tab *Browse Data*. Chi tiết và truy vấn mẫu: [database/README.md](database/README.md).

**Cập nhật bản nộp** sau khi dùng thử: `npm run export-db`. Lệnh chụp DB thành một tệp (chạy được cả khi server đang mở), xuất `.sql`, chép tệp Kho tài liệu, vẽ lại ERD. Bản xuất **xoá** token GitHub, mật khẩu thành viên và khoá ký phiên. `npm run erd` chỉ vẽ lại ERD từ cấu trúc bảng.

## 3. Cách dùng

Không có màn đăng nhập: chọn tên mình ở ô **Select your name…** trên thanh trên. Quyền BA Lead (Approve, Request changes, Administration, cài đặt GitHub) xét theo người đang chọn.

1. **Projects** – danh sách dự án. **Administration** (chỉ BA Lead): thành viên và vai BA / BA Lead.
2. Bấm vào dự án → khung dự án với **menu trái**:
   - **Task Board** – Kanban 4 cột *To do → In progress → Done → Approved*, tag *Changes requested*.
   - **Business Requirements** – mỗi user story một dòng: mã US-xx, *As a / I want / So that*, tiêu chí chấp nhận, ưu tiên; chấm QUS theo từng dòng. Phải có module trước khi tạo story.
   - **Deliverables** (chọn module ở đầu trang):
     1. *Documents*: BRD → UC Specification → SRS → FRD-NFR → API Spec (bước sau mở khi bước trước *Done*).
     2. *Diagrams*: Context → Use Case → Sequence → BPMN (mô phỏng bằng Mermaid) → ERD.
     3. *Prototype*: Design Studio (khoanh vùng, bình luận, phiên bản, gợi ý bố cục, xuất HTML).
     4. *Test Cases*, 5. *Traceability* (Story → UC → FR → Màn → TC).
   - **Document Repository**, **AI Log**, **GitHub History**.
3. **Trạng thái và duyệt** – trên mọi sản phẩm: BA bấm **Done**; BA Lead bấm **Approve** hoặc **Request changes** (không cần lý do – góp ý bằng bình luận trên prototype). Request changes → sản phẩm và task về *In progress* + tag. Sửa nội dung sản phẩm đã Done/Approved → về *In progress*. Không bấm Done được khi bước trước chưa Done.
4. **GitHub** – BA Lead nhập link repo, token và tên nhánh (mặc định `main`) ở *GitHub History → Settings*. Mỗi lần **Approve**, app commit đúng các tệp của sản phẩm đó (`.md`, prototype `.html`) lên nhánh; Dev/Tester đọc từ repo. *Done* không đụng GitHub.
5. **Chống ghi đè** – hai người cùng sửa một sản phẩm: người lưu sau được báo bản đã thay đổi và phải tải lại; màn đang có người sửa hiện tên người đó.

### Quy tắc nghiệp vụ được cài đặt

| Mã | Quy tắc |
| --- | --- |
| BR-01 | *(Bỏ ở đợt 5)* Tài liệu sinh từ user story, không cần màn hình đã duyệt. Bước tài liệu sau chỉ sinh khi bước trước *Xong*. |
| BR-02 | Khi sửa, khôi phục hoặc bỏ duyệt một thiết kế đã duyệt, tài liệu và test hiện có chuyển sang *Outdated*. |
| BR-03 | Nội dung AI phải suy diễn được gắn nhãn *Giả định* (trường `assumptions`, `isAssumption`). |
| BR-04 | Mỗi test case phải tham chiếu ít nhất 1 yêu cầu. Kết quả AI vi phạm quy tắc này sẽ bị trả về để AI tự sửa. |

## 4. Kiến trúc

```
client/            Giao diện React (đóng gói bằng esbuild → public/)
  views/DesignTab  Design Studio: canvas, khoanh vùng, bình luận, phiên bản
  views/DocsTab    UC / SRS / Sequence / Yêu cầu + prompt chỉnh
  views/TestsTab   Test case · TraceTab: truy vết · LogsTab: nhật ký AI
  components/      Renderer (component tree → UI), Mermaid, Markdown
shared/            Dùng chung client + server
  design.ts        Mô hình component tree, validate, diff
  patch.ts         Patch engine + kiểm tra phạm vi vùng khoanh
  extract.ts       Trích "mô hình trung gian" (trường, ràng buộc, thao tác, điều hướng)
  trace.ts         Ma trận truy vết + chỉ số bao phủ
server/
  app.ts           REST API (Node http, không framework)
  service.ts       Tầng nghiệp vụ (BR-01..04, điều phối pipeline)
  repo.ts, db.ts   Lưu trữ SQLite tích hợp sẵn trong Node (node:sqlite)
  ai/client.ts     Gọi Claude API (API key hoặc Bearer qua cổng): tool use bắt JSON theo schema, tự sửa 1 lần, ghi log
  ai/pipelines.ts  Prompt + schema cho từng tác vụ
  ai/mock.ts       Bộ sinh rule-based (Mock / baseline)
  export/          Xuất DOCX (thư viện docx) và XLSX (OOXML + JSZip)
scripts/
  seed.ts          Dữ liệu mẫu (npm run seed)
  export-db.ts     Xuất DB ra database/ (npm run export-db)
  erd.ts           Vẽ ERD từ cấu trúc bảng thật (npm run erd)
database/          Bản xuất DB nộp kèm mã nguồn: .db, .sql, tệp Kho tài liệu, ERD
tests/             Unit + integration (node:test)
e2e/               Kiểm thử trình duyệt toàn luồng (Playwright)
```

**Các điểm thiết kế quan trọng (dùng cho chương phương pháp của luận án):**

- **Thiết kế dạng component tree JSON.** Mỗi node có `id` ổn định, nhờ vậy khoanh vùng và bình luận gắn đúng phần tử, AI sửa bằng *patch* thay vì vẽ lại cả màn hình. Thư viện có 28 loại component.
- **Region-scoped editing.** Server tính tập node được phép sửa (vùng chọn và con cháu, cộng với việc chèn phần tử anh em vào node cha của vùng) và từ chối mọi thao tác ngoài vùng. Mỗi phiên bản ghi lại số thao tác bị chặn, phục vụ đo RQ1.
- **Sinh tài liệu 2 bước.** Bước (a) trích mô hình trung gian một cách tất định từ thiết kế; bước (b) LLM sinh UC/SRS/Sequence/Test dựa trên mô hình đó. Cách này giảm việc AI "bịa" chi tiết không có trong thiết kế.
- **Structured output.** Mọi lời gọi Claude dùng `tool_choice` bắt buộc và JSON schema, kết quả được validate. Khi kết quả sai, hệ thống gửi lỗi về để AI tự sửa đúng 1 lần.

## Gợi ý bố cục (tab "Gợi ý" trong Design Studio)

Tính năng **chỉ dùng phương pháp của Li et al. (2020)**, *Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders* (arXiv:2001.05308): **Recursive Transformer Tree Decoder** (§4.4). Bài toán là **hoàn thành bố cục** (layout auto-completion), không phải kiểm tra lỗi. Không có luật hay bộ lọc nào khác.

- **Phần tử tiếp theo:**
  - Sau mỗi thay đổi, mô hình giải mã một bước và hiện **khung mờ** trên canvas: loại, vị trí và kích thước theo khung bao dự đoán.
  - **Tab** chấp nhận, **Esc** bỏ qua. Panel có **top-3 loại** kèm xác suất và xác suất EOS ("mô hình cho rằng đã đủ").
  - Chọn một container để hỏi riêng container đó; không chọn gì thì xét mọi container.
- **Hoàn thành bố cục:** giải mã tham lam tới EOS (kể cả container vừa sinh) trong vùng chọn hoặc cả màn, rồi chấp nhận từng phần.
- **Đầu vào:** cây đang thiết kế và khung bao từng phần tử đo trên canvas, rời rạc hóa theo lưới 32 ô ngang × ô dọc 40 px (lưới đọc từ config của mô hình).
- **Đầu ra:** loại, cờ lá, khung bao. Phần tử chèn vào có props trung tính; nội dung chữ đổi bằng Prompt sửa thiết kế.
- **Mô hình:** `model/recursive-layout.json`, hidden 256, 4 lớp, 4,3 triệu tham số, lưới **32 ô ngang × ô dọc 40 px**, chọn theo val (`dataset/export/eval/STRICT-NEXT.md`). Huấn luyện trên **500 màn gốc (399 màn train) = 2.793 cây**, chia 80/10/10, chỉ dữ liệu web của nhóm, không WebSight. Test 38 màn: Next chặt 8,8%, IoU ≥ 0,5 22,8%.
  - Suy luận thuần TypeScript (`shared/recursive.ts`), khớp PyTorch (`tests/recursive.test.ts`).
  - Độ trễ trên CPU (42 màn test): hỏi một container khoảng 20–60 ms; xét cả màn trung vị 0,3 s (tối đa 0,9 s); Hoàn thành bố cục trung vị 0,4 s (tối đa khoảng 6 s với màn lớn).
- **Kết quả:** `dataset/export/eval/LAYOUT-SUGGEST.md`.
  - Mô phỏng KLM cho thấy gợi ý từng bước tiết kiệm khoảng 39–48% thời gian thao tác so với tự làm tay; Hoàn thành bố cục tiết kiệm 16–43%.
  - Có bảng độ chính xác theo từng loại phần tử.
  - Đối chiếu từng điểm với bài báo: `dataset/export/eval/PAPER-METHOD.md`.
- **Giới hạn:**
  - không gợi ý nội dung;
  - còn yếu với Radio, Form, List;
  - không chuyên tìm phần tử bị quên ở giữa (bài báo không đặt bài toán này);
  - dữ liệu ít hơn bài báo khoảng 25 lần và do Claude soạn.
- Mỗi lần hiện, chấp nhận hoặc bỏ qua được ghi vào `suggestion_events`.

Mã nguồn:
- `shared/recursive.ts`: suy luận (`nextInContainer`, `nextElements`, `completeLayout`).
- `shared/layoutDefaults.ts`: props mặc định khi chèn.
- `server/service.ts`: `layoutSuggestions`, `acceptLayout`, `manualEdit`.
- `client/views/DesignTab.tsx`: khung mờ, panel.
- `scripts/paper/train_faithful.py`, `export_recursive.py`, `klm_sim.py`: huấn luyện, xuất, đánh giá.

```bash
python3 scripts/paper/train_faithful.py --data=data/paper-w7c20-r400 && python3 scripts/paper/export_recursive.py
python3 scripts/paper/klm_sim.py
```

<details><summary>Lịch sử: mô hình đối chứng không thuộc bài báo (encoder hai chiều, n-gram) và bộ luật R1–R9 – đã gỡ khỏi app</summary>

Các phần dưới đây mô tả phiên bản trước. Mã mô hình đối chứng (`shared/transformer.ts`, n-gram trong `shared/nextComponent.ts`) chỉ còn dùng trong các script đánh giá. Bộ luật R1–R9, bộ lọc ứng dụng và hàm `suggest` đã bị xóa.

Khi BA đang thiết kế, hệ thống tìm **phần tử còn thiếu** (ở cuối *hoặc giữa* một container) và **thiếu sót cần sửa** trong vùng đang khoanh (hoặc cả màn).

- **Mô hình chính: Transformer trên cây** theo Li et al. (2020), *Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders* (arXiv:2001.05308):
  - Cây được duỗi theo DFS, mỗi container có token đóng `</>` (như Vanilla decoder, mục 4.2).
  - Mỗi token là tổng các embedding thuộc tính (Eq. 5): loại component + **loại con mang nghĩa** (email, password, search, submit, cancel, create…) + độ sâu + vị trí. Bài báo dùng tọa độ khung bao; cây của BA Copilot không có tọa độ nên thay bằng loại con và độ sâu.
  - **Khác bài báo:** chú ý hai chiều thay vì sinh tuần tự. Cây BA đang sửa không phải tiền tố DFS, phần tử thiếu có thể nằm giữa form. Mỗi token dự đoán "phần tử còn thiếu ngay trước nó", token `</>` dự đoán "phần tử thiếu ở cuối container". Lớp 0 nghĩa là không thiếu. Loại con được dự đoán có điều kiện theo loại.
  - 4 lớp, d = 96, 4 head, khoảng 479 nghìn tham số (2,6 MB). Suy luận **thuần TypeScript** (`shared/transformer.ts`, không thêm thư viện), khoảng 10–25 ms/màn. Kết quả khớp PyTorch đến 10⁻⁵.
- **Huấn luyện tự giám sát:** mỗi cây đầy đủ bị "làm hỏng" ngẫu nhiên theo 3 kiểu: giữ nguyên, xóa node ngẫu nhiên, cắt theo BFS. Mô hình học khôi phục phần bị bỏ.
- **Dữ liệu (23.881 cây):**

  | Nguồn | Số cây | Ghi chú |
  |---|---|---|
  | WebSight v0.2 | 22.227 | Trang web |
  | Màn nghiệp vụ tổng hợp | 1.521 | Sinh từ bộ sinh thiết kế, bù phần Table/Select/Pagination/Stat mà WebSight gần như không có |
  | Màn nội bộ | 133 | |
  | Màn BA đã duyệt | | Lấy từ DB, trọng số ×5 |
- **3 loại gợi ý:**
  - *Thêm:* điểm = P(thiếu tại ô) × P(loại | thiếu) ≥ 0,3 cho cả màn, ≥ 0,15 khi đã khoanh vùng. Câu prompt cụ thể theo loại con, ví dụ `Thêm ô tìm kiếm (Input) "Tìm kiếm" vào Row, ngay trước Select "Trạng thái".`
  - *Sửa:* bộ luật R1–R9.
  - *Xem lại:* chỉ có khi chạy dự phòng bằng n-gram.
- **Dự phòng:** nếu không có `model/next-transformer.json`, hoặc đặt `NEXT_MODEL=ngram`, app dùng n-gram với *stupid backoff* (Brants et al., 2007) như trước.
- **Áp dụng** sẽ khoanh container và điền sẵn prompt. Chế độ Mock hiểu được vị trí "ngay sau…/ngay trước…". Mỗi lần hiện/Áp dụng/Bỏ qua được ghi vào `suggestion_events`.
- **Học tiếp:** màn được duyệt lưu vào bảng `model_learned_trees`. N-gram cộng ngay; Transformer dùng ở lần huấn luyện lại.

Mã nguồn:
- `shared/transformer.ts`: mã hóa cây, suy luận.
- `shared/nextComponent.ts`: n-gram, bộ luật, xếp hạng gợi ý.
- `server/nextModel.ts`: nạp mô hình.
- `scripts/train_transformer.py`: huấn luyện.
- `scripts/eval-transformer.ts`: so sánh.

### Huấn luyện lại và đánh giá

```bash
# dữ liệu (một lần)
python scripts/websight_to_trees.py --n 30000 --out data/corpus/websight.jsonl    # cần: pip install datasets beautifulsoup4
npm run build-corpus && npm run build-synthetic -- --n 6000
# huấn luyện (CPU 4 nhân, khoảng 5 phút cho 20 epoch) và đánh giá
npm run export-tf-data                      # gồm cả màn đã duyệt trong DB
pip install torch && npm run train-transformer -- --epochs 20
npm run eval-transformer -- --limit 1500    # → analysis/eval-transformer.csv
```

**Kết quả.** Đánh giá theo đúng thiết lập của Li et al. 2020 (mục 5):
- Cây "đang thiết kế dở" gồm 10/50/80% node đầu theo hai luồng thiết kế **BFS** và **DFS**.
- Dùng 3 thước đo của mục 5.2, ở bản **nới lỏng theo loại** (mục 6 của bài báo), vì cây không có tọa độ:
  - **F1** cặp cha–con giữa cây do mô hình *tự hoàn thiện* và cây đúng.
  - **Next:** độ chính xác Top-1 đoán node kế tiếp, kèm Top-3.
  - **Edit:** khoảng cách sửa cây Zhang–Shasha, quy ra giây theo KLM-GOMS (chèn 5,05 s; đổi loại 3,95 s; xóa 0,1 s).
- Mốc so sánh "Không gợi ý" là giữ nguyên cây dở, nghĩa là BA tự thêm mọi thứ.
- N-gram huấn luyện trên *cùng* 23.881 cây. Next đo trên 1.500 cây, F1/Edit trên 500 cây (`npm run eval-transformer`).

*WebSight + nội bộ, luồng BFS (so với Bảng 1 của bài báo):*

| Mô hình | 10% F1 / Next / Edit | 50% F1 / Next / Edit | 80% F1 / Next / Edit |
|---|---|---|---|
| Không gợi ý | 20,1 / – / 55,9 | 64,3 / – / 32,0 | 86,0 / – / 14,3 |
| N-gram | 37,7 / **50,6** / 40,2 | 49,2 / 66,1 / **14,7** | 52,4 / 77,3 / 7,7 |
| Transformer | **42,2** / 46,6 / **33,9** | **75,4 / 69,1** / 15,5 | **88,4 / 79,0 / 6,3** |

*WebSight + nội bộ, luồng DFS (so với Bảng 2):*

| Mô hình | 10% | 50% | 80% |
|---|---|---|---|
| Không gợi ý | 20,1 / – / 55,9 | 64,3 / – / 32,0 | **86,0** / – / 14,3 |
| N-gram | 38,1 / **47,3** / 39,8 | 47,4 / 74,0 / **20,1** | 51,6 / 63,6 / 11,4 |
| Transformer | **42,7** / 44,3 / **33,1** | **68,5 / 74,3** / 22,7 | 84,4 / **63,8 / 11,2** |

*Màn nghiệp vụ tổng hợp (189 cây):*

| Mô hình | BFS 10% | BFS 50% | BFS 80% | DFS 50% | DFS 80% |
|---|---|---|---|---|---|
| Không gợi ý | 23,5 / – / 34,2 | 64,2 / – / 20,7 | 84,8 / – / 10,0 | 64,2 / – / 20,7 | 84,8 / – / 10,0 |
| N-gram | 21,0 / 0,0 / 33,1 | 47,2 / 50,3 / 14,2 | 64,5 / 62,4 / 5,9 | 46,1 / 56,6 / 14,2 | 66,4 / 77,2 / 7,9 |
| Transformer | **50,1 / 52,9 / 10,5** | **78,8 / 69,8 / 6,5** | **91,7 / 75,1 / 1,6** | **81,0 / 63,5 / 6,8** | **90,5 / 83,1 / 2,8** |

Next Top-3 của Transformer trên WebSight BFS: 85,5% / 90,2% / 94,0% (bài báo, bản nới lỏng ở BFS 80%: 92,9–95,3%).

**Đọc kết quả:**
- Transformer cho F1 cao nhất ở hầu hết cấu hình. N-gram có F1 *thấp hơn cả việc không gợi ý* ở mức 50–80%, vì nó chỉ biết nối thêm vào cuối container nên sinh thừa phần tử.
- Edit distance rất "dễ dãi" với phần tử thừa, vì xóa chỉ tốn 0,1 s theo cách đặt của bài báo. Vì vậy ở mức 50% trên WebSight, n-gram nhỉnh hơn một chút về Edit dù F1 thấp hơn nhiều.
- Ở DFS 80% trên WebSight, Transformer chưa vượt mốc "không gợi ý" về F1 (84,4 so với 86,0).
- Trên màn nghiệp vụ, Transformer vượt rõ ở mọi thước đo.

*Bổ sung cho tính năng của nhóm (bài báo không có):* tìm phần tử bị thiếu. Xóa 1 node, mô hình phải chỉ đúng vị trí và loại; kết quả Hit@1 / Hit@3:

| Tập | N-gram | Transformer |
|---|---|---|
| WebSight + nội bộ | 9,3% / 24,3% | **43,2% / 62,5%** |
| Nghiệp vụ tổng hợp | 6,9% / 22,2% | **58,7% / 87,3%** |

Báo động giả (cây hoàn chỉnh vẫn bị gợi ý thêm, ngưỡng 0,3 của app): 18,3% WebSight, 14,8% nghiệp vụ. Độ trễ khoảng 9–15 ms/màn.

**Giới hạn:**
- Dữ liệu nghiệp vụ tổng hợp sinh từ chính bộ sinh thiết kế, nên kết quả trên tập này lạc quan hơn thực tế.
- WebSight chủ yếu là landing page, ít form/bảng.
- Phần tử bị xóa ngẫu nhiên đôi khi không đoán được về bản chất (một đoạn Text bất kỳ), nên Hit@k không thể đạt 100%.

**Kiểm tra trên 30 màn tham chiếu** (`npm run eval-reference`): đây là các màn nhóm tự thiết kế thủ công, mô phỏng sản phẩm thật, có Sidebar/Card/Section/Modal, và không dùng khi huấn luyện. Kết quả cho thấy mô hình **chưa tổng quát tốt** sang bố cục khác dữ liệu huấn luyện:
- Leave-one-out (bỏ lần lượt 489 node): Hit@3 của Transformer 11,2%, n-gram 9,2%. Riêng Input đạt 44,7%, Button 22%.
- 12/30 màn hoàn chỉnh vẫn có gợi ý thừa, chủ yếu là "Thêm Heading/Text" (thói quen học từ landing page WebSight).
- Màn bỏ 2 phần tử (90 lượt):
  - Transformer *đa dạng hơn*: Jaccard giữa hai màn khác nhau là 0,12 so với 0,36 của n-gram; gợi ý "Thêm" phổ biến nhất chiếm 42% so với 53%.
  - Nhưng Transformer *ít trúng hơn*: recall 7% so với 42%. N-gram trúng nhiều chủ yếu nhờ "Thêm Link" vào thanh điều hướng.

<details><summary>N-gram cũ (chỉ WebSight + nội bộ, 22.429 cây)</summary>

`npm run build-model` / `npm run eval-next`: Top-1/Top-3 ở mức 50% đạt 66,4% / 88,9% trên holdout 2.503 cây. Bảng trên huấn luyện lại n-gram trên cùng dữ liệu với Transformer nên số khác.
</details>

</details>

### Bộ dữ liệu "bổ sung UI" (đang xây dựng)

Thay cho WebSight và dữ liệu tổng hợp từ Mock. Đặc tả chi tiết ở `dataset/AUTHORING.md`.

- **Màn gốc:** do Claude soạn theo ma trận phủ `dataset/matrix.json`, gồm 500 màn = 5 nhóm × 12 miền × quyền × bố cục. Đợt thử là 50 màn trong `dataset/roots/`.
- **Duyệt:** BA duyệt tại trang **Duyệt dữ liệu** (`#/review`) theo 6 tiêu chí, rồi bấm "Xuất kết quả" và gửi file JSON cho nhóm. Ở đợt thử, mỗi màn có 2 BA duyệt độc lập để đo độ đồng thuận.
- **Sinh mẫu:** `npm run dataset:samples -- --reviews kq1.json,kq2.json,...` tạo mẫu từ các màn được chấp nhận. Mỗi mẫu gồm `requirement`, `partialTree`, `targetContainerId`, `acceptedPatch`, `completedTree`, `review`. Có 4 kiểu: thiếu 1 phần tử, thiếu 1 cụm, thiếu 1 cặp, và màn đủ (đáp án rỗng; với màn giới hạn quyền thì là mẫu bẫy). Tập train/val/test được chia theo màn gốc.
- **Huấn luyện:** `npm run dataset:export && python3 scripts/train_transformer.py --samples data/dataset/tf --epochs 30`.

## 5. Kiểm thử

```bash
npm test                          # 243 test unit + tích hợp (gồm giả lập Claude API, đối chiếu Recursive TS ↔ PyTorch)
npx playwright install chromium   # chỉ cần chạy lần đầu
npm run e2e                       # chạy trình duyệt qua toàn luồng, ảnh chụp lưu ở e2e/screenshots/
```

## 6. Biến môi trường

Đặt trong tệp `.env` (chép từ `.env.example`; `.env` không bị đưa lên Git) hoặc trong *Variables* của Railway.

| Biến | Ý nghĩa |
| --- | --- |
| `ANTHROPIC_API_KEY` | API key Claude, gọi thẳng Anthropic (gửi qua header `x-api-key`). |
| `ANTHROPIC_AUTH_TOKEN` | Khoá dạng Bearer, dùng khi đi qua cổng trung gian (gửi qua `Authorization: Bearer`). Thay cho `ANTHROPIC_API_KEY`. Không có cả hai thì chạy Mock. |
| `ANTHROPIC_BASE_URL` | Địa chỉ cổng gọi Claude, mặc định `https://api.anthropic.com`. |
| `ANTHROPIC_MODEL` | Model sử dụng, mặc định `claude-sonnet-4-5`. |
| `MAX_AI_CALLS_PER_DAY` | Giới hạn số lượt gọi Claude mỗi ngày (0 = không giới hạn). |
| `APP_PASSWORD` | Đặt khi deploy công khai: mọi trang và API yêu cầu mật khẩu. |
| `AI_MODE=mock` | Ép chạy rule-based dù đã có khoá. |
| `PORT` | Cổng server, mặc định 3000. |
| `DB_FILE` | Đường dẫn file SQLite, mặc định `data/ba-copilot.db`. |
| `DATA_DIR` | Thư mục chứa tệp Kho tài liệu (`files/`), mặc định là thư mục của `DB_FILE`. |
| `RECURSIVE_FILE` | Đường dẫn mô hình gợi ý bố cục, mặc định `model/recursive-layout.json`. |
| `GITHUB_TOKEN` | (Tuỳ chọn) Token GitHub mặc định cho dự án chưa nhập token riêng. Nên dùng token chỉ có quyền ghi đúng repo. |
| `GITHUB_API_URL` | (Tuỳ chọn) Địa chỉ API GitHub, mặc định `https://api.github.com`. |

## 7. Chưa làm trong bản MVP (theo lộ trình)

- Đăng nhập thật cho từng thành viên (hiện chọn người dùng ở ô *Select your name…*; mã đăng nhập thành viên đã có ở server nhưng chưa bật giao diện). Bản deploy chỉ có một mật khẩu chung `APP_PASSWORD`.
- Bình luận trực tiếp trên tài liệu (như Google Docs).
- Mã hoá token GitHub lưu trong DB (bản xuất `database/` đã xoá token).
- Chuyển sang PostgreSQL khi cần nhiều máy chủ cùng lúc. Hiện dùng SQLite trên volume của Railway; tầng `repo.ts` đã tách riêng nên chỉ cần thay phần này.
- Xuất sang Figma và sinh script Playwright từ test case.
