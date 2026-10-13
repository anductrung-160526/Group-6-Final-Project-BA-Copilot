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

## 4. Kiểm thử

```bash
npm test                          # 13 test unit + tích hợp (gồm cả giả lập Claude API)
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

## 6. Chưa làm trong bản MVP (theo lộ trình)

- Đăng nhập và phân quyền BA / Reviewer / Admin. Hiện tại là bản 1 người dùng chạy local.
- Nhập user story kèm chấm chất lượng theo QUS (E2) và ma trận Actor.
- Chuyển sang PostgreSQL để deploy. Tầng `repo.ts` đã tách riêng nên chỉ cần thay phần này.
- Xuất sang Figma và sinh script Playwright từ test case.
