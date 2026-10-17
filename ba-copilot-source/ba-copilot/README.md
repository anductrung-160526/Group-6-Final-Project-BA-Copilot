# BA Copilot

Hệ thống web hỗ trợ Business Analyst đi trọn luồng **Prompt → Thiết kế UI → Tài liệu (UC, SRS, Sequence) → Test case → Truy vết**. Đây là sản phẩm của luận án; mọi đầu ra AI là *bản nháp* để BA duyệt.

## 1. Chạy thử trên máy (macOS)

Yêu cầu: **Node.js 22.13 trở lên** (khuyên dùng bản LTS 22 hoặc 24 tại nodejs.org). Kiểm tra bằng `node -v`.

```bash
cd ~/Documents/ba-copilot
npm install                 # cài thư viện (cần Internet)
cp .env.example .env        # rồi mở .env, dán ANTHROPIC_API_KEY
npm start                   # build giao diện + chạy server
```

Mở trình duyệt tại **http://localhost:3000**.

- Không có API key thì hệ thống chạy **Chế độ Mock**, tức bộ sinh rule-based. Mock vẫn đi trọn luồng nên dùng được để demo offline, và cũng là baseline khi so sánh với LLM trong chương thực nghiệm.
- `npm run seed` tạo sẵn dự án mẫu gồm 3 màn hình đã duyệt, tài liệu và test case.
- `npm run dev` chạy chế độ phát triển, tự build lại khi sửa code.

## 2. Cách dùng (theo đúng flow của luận án)

1. **Dự án → Module**: tạo module và dán user story hoặc function list vào mục *Yêu cầu nghiệp vụ*. Phần này là không bắt buộc.
2. **Thiết kế** (Design Studio)
   - Bấm `+ Mới`, nhập prompt mô tả màn hình, AI sẽ sinh giao diện.
   - **Khoanh vùng**: dùng chế độ *Chọn* (click, Shift+click để chọn nhiều) hoặc *Khoanh vùng* (kéo khung). Tab *Thành phần* cho phép chọn theo cây.
   - **Bình luận**: gắn bình luận vào vùng đã chọn. Bình luận hiện thành ghim đánh số trên canvas.
   - **Gửi bình luận vào prompt**: tick các bình luận cần xử lý, nhập thêm yêu cầu nếu muốn, rồi bấm *Sửa vùng đã khoanh*. AI chỉ được sửa trong vùng; thao tác ra ngoài vùng sẽ bị server chặn.
   - Mỗi lần sửa tạo ra một **phiên bản** mới. Có thể xem lại, khôi phục, và phần thay đổi được tô xanh.
   - Chế độ *Xem thử* dùng để bấm nút hoặc link chuyển màn hình như một prototype.
   - Bấm **Duyệt thiết kế** khi hoàn tất.
3. **Tài liệu**: bấm *Sinh tài liệu* để tạo Use Case, SRS (ISO/IEC/IEEE 29148), Sequence diagram (Mermaid) và danh sách yêu cầu FR/NFR. Mỗi mục có thể chỉnh lại bằng prompt. Sau đó **Duyệt tài liệu** và xuất ra **Word**.
4. **Test case**: sinh test theo kịch bản (luồng chính, luồng thay thế, ngoại lệ) và giá trị biên. Xuất ra **Excel** gồm 2 sheet: Test case và Truy vết.
5. **Truy vết**: ma trận Yêu cầu ↔ UC ↔ Màn hình ↔ Test, kèm chỉ số bao phủ.
6. **Nhật ký AI**: ghi lại mọi lần gọi AI (prompt, kết quả, token, độ trễ, lỗi và số lần tự sửa) để làm số liệu cho chương đánh giá.

### Quy tắc nghiệp vụ được cài đặt

| Mã | Quy tắc |
| --- | --- |
| BR-01 | Chỉ sinh tài liệu khi module có ít nhất 1 màn hình *Đã duyệt*. Tài liệu chỉ dựa trên các màn hình đã duyệt. |
| BR-02 | Khi sửa, khôi phục hoặc bỏ duyệt một thiết kế đã duyệt, tài liệu và test hiện có chuyển sang *Lỗi thời*. |
| BR-03 | Nội dung AI phải suy diễn được gắn nhãn *Giả định* (trường `assumptions`, `isAssumption`). |
| BR-04 | Mỗi test case phải tham chiếu ít nhất 1 yêu cầu. Kết quả AI vi phạm quy tắc này sẽ bị trả về để AI tự sửa. |

## 3. Kiến trúc

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
  ai/client.ts     Gọi Claude API: tool use bắt JSON theo schema, tự sửa 1 lần, ghi log
  ai/pipelines.ts  Prompt + schema cho từng tác vụ
  ai/mock.ts       Bộ sinh rule-based (Mock / baseline)
  export/          Xuất DOCX (thư viện docx) và XLSX (OOXML + JSZip)
tests/             Unit + integration (node:test)
e2e/               Kiểm thử trình duyệt toàn luồng (Playwright)
```

**Các điểm thiết kế quan trọng (dùng cho chương phương pháp của luận án):**

- **Thiết kế dạng component tree JSON.** Mỗi node có `id` ổn định, nhờ vậy khoanh vùng và bình luận gắn đúng phần tử, AI sửa bằng *patch* thay vì vẽ lại cả màn hình. Thư viện có 28 loại component.
- **Region-scoped editing.** Server tính tập node được phép sửa (vùng chọn và con cháu, cộng với việc chèn phần tử anh em vào node cha của vùng) và từ chối mọi thao tác ngoài vùng. Mỗi phiên bản ghi lại số thao tác bị chặn, phục vụ đo RQ1.
- **Sinh tài liệu 2 bước.** Bước (a) trích mô hình trung gian một cách tất định từ thiết kế; bước (b) LLM sinh UC/SRS/Sequence/Test dựa trên mô hình đó. Cách này giảm việc AI "bịa" chi tiết không có trong thiết kế.
- **Structured output.** Mọi lời gọi Claude dùng `tool_choice` bắt buộc và JSON schema, kết quả được validate. Khi kết quả sai, hệ thống gửi lỗi về để AI tự sửa đúng 1 lần.

## Gợi ý thành phần tiếp theo (tab "Gợi ý" trong Design Studio)

Khi BA đang thiết kế, hệ thống tìm **phần tử còn thiếu** (ở cuối *hoặc giữa* một container) và **thiếu sót cần sửa** trong vùng đang khoanh (hoặc cả màn).

- **Mô hình chính: Transformer trên cây** theo Li et al. (2020), *Auto Completion of User Interface Layout Design Using Transformer-Based Tree Decoders* (arXiv:2001.05308):
  - Cây được duỗi theo DFS, mỗi container có token đóng `</>` (như Vanilla decoder, mục 4.2).
  - Mỗi token là tổng các embedding thuộc tính (Eq. 5): loại component + **loại con mang nghĩa** (email, password, search, submit, cancel, create…) + độ sâu + vị trí. Bài báo dùng tọa độ khung bao; cây của BA Copilot không có tọa độ nên thay bằng loại con và độ sâu.
  - **Khác bài báo:** chú ý hai chiều thay vì sinh tuần tự. Cây BA đang sửa không phải tiền tố DFS, phần tử thiếu có thể nằm giữa form. Mỗi token dự đoán "phần tử còn thiếu ngay trước nó", token `</>` dự đoán "phần tử thiếu ở cuối container". Lớp 0 nghĩa là không thiếu. Loại con được dự đoán có điều kiện theo loại.
  - 4 lớp, d = 96, 4 head, khoảng 479 nghìn tham số (2,6 MB). Suy luận **thuần TypeScript** (`shared/transformer.ts`, không thêm thư viện), khoảng 10–25 ms/màn. Kết quả khớp PyTorch đến 10⁻⁵.
- **Huấn luyện tự giám sát:** mỗi cây đầy đủ bị "làm hỏng" ngẫu nhiên theo 3 kiểu: giữ nguyên, xóa node ngẫu nhiên, cắt theo BFS. Mô hình học khôi phục phần bị bỏ.
- **Dữ liệu (64.333 cây):**

  | Nguồn | Số cây | Ghi chú |
  |---|---|---|
  | Rico semantic annotations | 40.452 | Liu et al. 2018, chính bộ dữ liệu bài báo dùng; app di động, form đăng nhập/đăng ký/tìm kiếm |
  | WebSight v0.2 | 22.227 | Trang web |
  | Màn nghiệp vụ tổng hợp | 1.521 | Sinh từ bộ sinh thiết kế, bù phần Table/Select/Pagination/Stat mà Rico và WebSight gần như không có |
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
curl -O https://storage.googleapis.com/crowdstf-rico-uiuc-4540/rico_dataset_v0.1/semantic_annotations.zip
unzip -q semantic_annotations.zip -d data/rico
python scripts/rico_to_trees.py --dir data/rico/semantic_annotations --out data/corpus/rico.jsonl
python scripts/websight_to_trees.py --n 30000 --out data/corpus/websight.jsonl    # cần: pip install datasets beautifulsoup4
npm run build-corpus && npm run build-synthetic -- --n 6000
# huấn luyện (CPU 4 nhân, khoảng 15 phút cho 20 epoch) và đánh giá
npm run export-tf-data                      # gồm cả màn đã duyệt trong DB
pip install torch && npm run train-transformer -- --epochs 20
npm run eval-transformer -- --limit 1500    # → analysis/eval-transformer.csv
```

**Kết quả** (n-gram huấn luyện trên *cùng* 64.333 cây; tập kiểm tra không trùng tập huấn luyện, Rico tách theo app):

*1. Che bớt cây, đoán loại phần tử kế tiếp (giao thức của Li et al. 2020), Top-1 / Top-3:*

| Tập | Đã có | N-gram | Transformer |
|---|---|---|---|
| WebSight + nội bộ (1.500) | 50% | 61,4% / 81,4% | **70,5% / 90,6%** |
| WebSight + nội bộ | 80% | 75,1% / 88,1% | **81,7% / 94,6%** |
| Rico (1.500) | 50% | 49,2% / 90,0% | **57,5% / 91,2%** |
| Rico | 80% | 48,7% / 91,7% | **61,3% / 92,9%** |
| Nghiệp vụ tổng hợp (189) | 50% | 45,0% / 55,0% | **71,4% / 92,1%** |
| Nghiệp vụ tổng hợp | 80% | 32,8% / 78,3% | **75,1% / 95,2%** |

*2. Tìm phần tử bị thiếu: xóa 1 node, mô hình phải chỉ đúng **vị trí và loại** trong mọi ô của cây. Hit@1 / Hit@3:*

| Tập | N-gram | Transformer |
|---|---|---|
| WebSight + nội bộ | 9,0% / 23,1% | **44,4% / 62,8%** |
| Rico | 4,7% / 12,1% | **18,0% / 31,1%** |
| Nghiệp vụ tổng hợp | 4,2% / 17,5% | **52,9% / 85,7%** |

*3. Báo động giả* (cây hoàn chỉnh vẫn bị gợi ý thêm, ngưỡng 0,3): 17,7% WebSight, 7,9% Rico, 6,3% nghiệp vụ.

**Giới hạn:**
- Dữ liệu nghiệp vụ tổng hợp sinh từ chính bộ sinh thiết kế, nên kết quả trên tập này lạc quan hơn thực tế.
- Rico là app di động, cấu trúc Form/Row được dựng lại từ vị trí.
- Phần tử bị xóa ngẫu nhiên đôi khi không đoán được về bản chất (một đoạn Text bất kỳ), nên Hit@k không thể đạt 100%.

<details><summary>N-gram cũ (chỉ WebSight + nội bộ, 22.429 cây)</summary>

`npm run build-model` / `npm run eval-next`: Top-1/Top-3 ở mức 50% đạt 66,4% / 88,9% trên holdout 2.503 cây. Bảng trên huấn luyện lại n-gram trên cùng dữ liệu với Transformer nên số khác.
</details>

## 4. Kiểm thử

```bash
npm test                          # 37 test unit + tích hợp (gồm cả giả lập Claude API, đối chiếu Transformer TS ↔ PyTorch)
npx playwright install chromium   # chỉ cần chạy lần đầu
npm run e2e                       # chạy trình duyệt qua toàn luồng, ảnh chụp lưu ở e2e/screenshots/
```

## 5. Biến môi trường

| Biến | Ý nghĩa |
| --- | --- |
| `ANTHROPIC_API_KEY` | API key Claude. Để trống thì chạy Mock. |
| `ANTHROPIC_MODEL` | Model sử dụng, mặc định `claude-sonnet-4-5`. Đổi sang model mới nhất có trong Anthropic Console. |
| `AI_MODE=mock` | Ép chạy rule-based dù đã có key. |
| `PORT` | Cổng server, mặc định 3000. |
| `DB_FILE` | Đường dẫn file SQLite, mặc định `data/ba-copilot.db`. |
| `NEXT_MODEL=ngram` | Dùng n-gram thay cho Transformer trong tab "Gợi ý". |

## 6. Chưa làm trong bản MVP (theo lộ trình)

- Đăng nhập và phân quyền BA / Reviewer / Admin. Hiện tại là bản 1 người dùng chạy local.
- Nhập user story kèm chấm chất lượng theo QUS (E2) và ma trận Actor.
- Chuyển sang PostgreSQL để deploy. Tầng `repo.ts` đã tách riêng nên chỉ cần thay phần này.
- Xuất sang Figma và sinh script Playwright từ test case.
