# BA Copilot – Bản mở rộng: Use Case, Function list & màn hình (v2)

Bản này kế thừa nguyên **"BA Copilot – Bản 4 ngày"** (27 UC, 49 FN, 14 SCR) và bổ sung 2 tính năng từ **[BA2][G6]**:

1. **Tính điểm chất lượng yêu cầu (QUS)**
2. **Gợi ý màn hình tiếp theo**

Mã cũ giữ nguyên, mã mới được đánh nối tiếp (UC-28…, FN-50…, SCR-15…), nên mọi tham chiếu trong tài liệu cũ vẫn đúng.

---

## 0. Phân tích file [BA2][G6]

### 0.1. Những gì thuộc phạm vi tính năng

| Hạng mục trong [BA2][G6] | Là tính năng sản phẩm? | Đưa vào tài liệu này |
|---|---|---|
| Module chấm QUS `shared/qus.ts` + unit test | Có | UC-28, FN-50 → FN-56, SCR-15 |
| Panel chấm điểm trong popup **Tạo module** và **Sửa yêu cầu** | Có | FN-53, FN-54 |
| Module gợi ý `shared/suggest.ts` + unit test | Có | UC-29, FN-57 → FN-61, SCR-16 |
| Khối "Gợi ý tiếp theo" ở cột trái tab Thiết kế, có lý do, nút Tạo điền sẵn prompt | Có | FN-59, FN-60 |
| Review và merge code C2–C5 vào `trung_ba`, deploy Railway, link demo có mật khẩu | **Không**, đây là việc vận hành | Chuyển sang kế hoạch agent (Agent Tích hợp, Agent Triển khai) |
| Viết mục Tools (T1) | **Không**, đây là tài liệu luận án | Chuyển sang Agent Tài liệu |
| Bảng benchmark ML (Recursive Transformer, App Transformer, N-gram) | **Không**, đây là kết quả thực nghiệm của module *gợi ý thành phần* | Ghi chú ở mục 0.3 và không tạo FN |

### 0.2. Những điểm chưa rõ đã được chốt (gắn nhãn *Giả định*, cần BA Lead xác nhận)

| # | Vấn đề trong [BA2][G6] | Đề xuất chốt |
|---|---|---|
| G1 | DUPLICATE "cần dữ liệu để so sánh" | So sánh các story **trong cùng module**, và thêm các story của các module khác **trong cùng dự án** nếu kịp. Hai story bị coi là trùng khi độ tương đồng token (Jaccard) ≥ 0,8 sau khi chuẩn hoá. |
| G2 | NOT_UNIFORM "cần quy tắc xác định" | Xác định khuôn mẫu chiếm đa số trong module ("As a… I want… so that…" hoặc "Là… tôi muốn… để…"). Story nào lệch khuôn mẫu đa số thì nhận mức *info*. Nếu module chỉ có 1 story thì bỏ qua tiêu chí này. |
| G3 | Điểm QUS có chặn lưu không? | **Không chặn**. QUS chỉ mang tính tư vấn (BR-05). |
| G4 | Cách tính điểm | Lấy theo code trên nhánh `manh/c1-qus`: mỗi story bắt đầu 100 điểm, trừ 30 cho mỗi *error*, 15 cho mỗi *warn*, 5 cho mỗi *info*, thấp nhất là 0. Điểm module bằng trung bình cộng điểm các story. |
| G5 | "FR chưa có màn" khi module chưa sinh tài liệu thì chưa có FR | Lúc chưa có FR, dùng các **user story** tách từ phần *Yêu cầu nghiệp vụ* (dùng lại hàm `splitStories` của QUS). Khi đã có FR thì dùng FR. |
| G6 | Gợi ý có tự tạo màn hình không? | **Không**. BA phải bấm **Tạo**, sửa prompt nếu cần, rồi mới gửi (BR-06). |

### 0.3. Ghi chú về phần Machine Learning

Các con số trong [BA2][G6] (Recursive Transformer 6,58 triệu tham số, val loss 3,0932, Pair F1 86,5 %, IoU ≥ 0,5 đạt 23,5 % với lưới 20 px…) thuộc tính năng **gợi ý thành phần giao diện trong Design Studio** (`shared/recursive.ts`, `shared/transformer.ts`, `shared/nextComponent.ts` trên nhánh `trung_ba`). Đây **không phải** "Gợi ý màn tiếp theo":

- **Gợi ý màn tiếp theo (UC-29)** hoạt động ở cấp *màn hình*. Logic dựa trên quy tắc: FR chưa được phủ, hoặc liên kết bị gãy.
- **Gợi ý thành phần** hoạt động ở cấp *phần tử trong một màn*. Logic là mô hình ML.

Các số liệu benchmark phải được đối chiếu với `MODEL-SELECTION.md`, `PAPER-METHOD.md` và `COORDS-EXPERIMENT.md` trước khi đưa vào báo cáo chính thức. Hai giá trị KLM 9,4 s và 13,5 s là **giá trị giữa khoảng**, không phải kết quả của một lần chạy.

---

## 1. Phạm vi bản v2

Bản v2 gồm toàn bộ bản 4 ngày, cộng thêm phân hệ **Chất lượng yêu cầu** và tính năng **Gợi ý màn tiếp theo**.

| | Bản 4 ngày | Bổ sung | **Tổng v2** |
|---|---|---|---|
| Use Case | 27 (18 có, 9 mới) | +2 | **29** (18 có, 11 mới) |
| Chức năng | 49 (23 mới) | +12 | **61** (35 mới: 28 Bắt buộc, 7 Nếu kịp) |
| Màn hình | 14 (7 cần làm) | +2 thành phần mới, 2 màn nâng cấp | **16** (11 cần làm) |

Hiện trạng code đã có sẵn trên nhánh:

| Tính năng | Nhánh | Trạng thái |
|---|---|---|
| QUS (`shared/qus.ts`, `client/components/QusPanel.tsx`, `tests/qus.test.ts`) | `chi_task` (lấy từ `manh/c1-qus`) | Đã sửa theo G1–G4, panel gắn vào popup Tạo module và Sửa yêu cầu |
| Kho tài liệu (`server/files.ts`, `FilesTab.tsx`, `tests/files.test.ts`) | `htrung-c4-kho-tai-lieu` | Đã có, cần gộp |
| Gợi ý thành phần ML (`recursive.ts`, `transformer.ts`, `nextComponent.ts`) | `trung_ba` | Đã có, ngoài phạm vi tài liệu này |
| Gợi ý màn tiếp theo (`shared/suggest.ts`, `tests/suggest.test.ts`) | `chi_task` | Đã có theo G5–G6, khối "Gợi ý tiếp theo" ở cột trái tab Thiết kế. Danh sách *Bỏ qua* (FN-61) tạm lưu trên trình duyệt, chưa dùng bảng `suggestion_dismissals` |

---

## 2. Actor và Use Case

Actor giữ nguyên: **BA**, **BA Lead**, **Hệ thống / AI**.

### 2.1. Use Case bổ sung

| Mã | Phân hệ | Use Case | Actor chính | Hiện trạng | Quan hệ |
|---|---|---|---|---|---|
| UC-28 | Chất lượng yêu cầu | Kiểm tra chất lượng user story (QUS) | BA, Hệ thống | Mới | «include» bởi UC-02 (tạo module) và UC-03 (nhập yêu cầu) |
| UC-29 | Thiết kế | Gợi ý màn hình tiếp theo | BA, Hệ thống | Mới | «extend» UC-08 (sinh màn từ prompt) |

### 2.2. Bảng Use Case đầy đủ (v2)

| Mã | Phân hệ | Use Case | Actor chính | Hiện trạng |
|---|---|---|---|---|
| UC-01 | Dự án | Quản lý dự án | BA Lead | Có |
| UC-02 | Dự án | Quản lý module | BA | Có |
| UC-03 | Dự án | Nhập yêu cầu nghiệp vụ của module | BA | Có |
| UC-04 | Thành viên | Quản lý danh sách thành viên nhóm | BA Lead | Mới |
| UC-05 | Thành viên | Chọn người đang làm việc (thay đăng nhập) | BA | Mới |
| UC-06 | Kho tài liệu | Tải lên và sắp xếp tài liệu từ stakeholder | BA | Mới |
| UC-07 | Kho tài liệu | Xem trước và tải về tài liệu | BA | Mới |
| UC-08 | Thiết kế | Sinh màn hình từ prompt | BA, AI | Có |
| UC-09 | Thiết kế | Khoanh vùng và bình luận trên thiết kế | BA | Có |
| UC-10 | Thiết kế | Sửa vùng đã khoanh bằng AI | BA, AI | Có |
| UC-11 | Thiết kế | Quản lý phiên bản thiết kế | BA | Có |
| UC-12 | Thiết kế | Xem thử prototype | BA | Có |
| UC-13 | Thiết kế | Duyệt thiết kế | BA Lead | Có |
| UC-14 | Sơ đồ | Sinh UC diagram bằng AI | BA, AI | Mới |
| UC-15 | Sơ đồ | Sửa và duyệt sơ đồ | BA, BA Lead | Mới |
| UC-16 | Đặc tả | Sinh tài liệu UC, SRS, Sequence, yêu cầu | BA, AI | Có |
| UC-17 | Đặc tả | Chỉnh tài liệu bằng prompt | BA, AI | Có |
| UC-18 | Đặc tả | Quản lý danh sách yêu cầu FR/NFR | BA | Có |
| UC-19 | Đặc tả | Duyệt tài liệu | BA Lead | Có |
| UC-20 | Đặc tả | Xuất tài liệu ra Word | BA | Có |
| UC-21 | Test & Truy vết | Sinh test case | BA, AI | Có |
| UC-22 | Test & Truy vết | Xuất test case ra Excel | BA | Có |
| UC-23 | Test & Truy vết | Xem ma trận truy vết | BA | Có |
| UC-24 | Công việc | Quản lý task (tạo, giao, sửa, xoá) | BA Lead, BA | Mới |
| UC-25 | Công việc | Theo dõi task trên bảng Kanban | BA | Mới |
| UC-26 | Công việc | Tự cập nhật trạng thái task theo sản phẩm | Hệ thống | Mới |
| UC-27 | Nhật ký | Xem nhật ký AI | BA | Có |
| **UC-28** | **Chất lượng yêu cầu** | **Kiểm tra chất lượng user story (QUS)** | **BA, Hệ thống** | **Mới** |
| **UC-29** | **Thiết kế** | **Gợi ý màn hình tiếp theo** | **BA, Hệ thống** | **Mới** |

### 2.3. Đặc tả tóm tắt UC mới

**UC-28 – Kiểm tra chất lượng user story**

- **Tiền điều kiện:** BA đang mở popup *Tạo module* hoặc *Sửa yêu cầu*.
- **Luồng chính:**
  1. BA gõ hoặc dán user story.
  2. Hệ thống tách văn bản thành từng story, mỗi dòng hoặc mỗi câu bắt đầu bằng "As a" hay "Là" được tính là một story.
  3. Hệ thống chấm 8 tiêu chí cho từng story.
  4. Panel hiển thị điểm module, điểm từng story và danh sách lỗi kèm gợi ý sửa.
  5. BA sửa nội dung, panel cập nhật lại (chậm khoảng 300 ms sau lần gõ cuối).
  6. BA bấm Lưu.
- **Luồng thay thế:**
  - 2a. Ô yêu cầu trống: hiển thị trạng thái rỗng ("Chưa có user story để chấm").
  - 6a. Điểm thấp: vẫn cho lưu, chỉ hiển thị cảnh báo (BR-05).
- **Hậu điều kiện:** Điểm QUS mới nhất được lưu cùng module, dùng cho FN-56.

**UC-29 – Gợi ý màn hình tiếp theo**

- **Tiền điều kiện:** Module có ít nhất 1 user story **hoặc** 1 FR, **hoặc** có ít nhất 1 màn hình.
- **Luồng chính:**
  1. BA mở tab Thiết kế.
  2. Hệ thống tính các khoảng trống:
     - (a) FR hoặc story chưa có màn nào phủ;
     - (b) nút hoặc link điều hướng tới một màn chưa tồn tại.
  3. Cột trái hiển thị khối "Gợi ý tiếp theo". Mỗi gợi ý gồm tên màn đề xuất, lý do và nguồn (mã FR, story hoặc nút).
  4. BA bấm **Tạo**.
  5. Hộp thoại "Màn hình mới" mở ra với tên và prompt đã điền sẵn.
  6. BA chỉnh nếu cần rồi gửi. Hệ thống chạy UC-08.
  7. Danh sách gợi ý được tính lại.
- **Luồng thay thế:**
  - 2a. Không còn khoảng trống: hiển thị "Đã phủ đủ yêu cầu".
  - 4a. BA bấm **Bỏ qua**: gợi ý bị ẩn khỏi module, có thể khôi phục (FN-61).

---

## 3. Function list

### 3.1. Chức năng mới bổ sung

| Mã | Phân hệ | Chức năng | UC | Ưu tiên |
|---|---|---|---|---|
| FN-50 | Chất lượng yêu cầu | Tách phần *Yêu cầu nghiệp vụ* thành danh sách user story | UC-28 | Bắt buộc |
| FN-51 | Chất lượng yêu cầu | Chấm 8 tiêu chí QUS cho từng story: WELL_FORMED, NO_END, ATOMIC, MINIMAL, AMBIGUOUS, FULL_SENTENCE, DUPLICATE, NOT_UNIFORM. Mỗi lỗi có mức error, warn hoặc info | UC-28 | Bắt buộc |
| FN-52 | Chất lượng yêu cầu | Tính điểm story (100 − 30/error − 15/warn − 5/info, thấp nhất 0) và điểm trung bình module. Xếp hạng Tốt ≥ 80, Khá 60–79, Cần sửa < 60 | UC-28 | Bắt buộc |
| FN-53 | Chất lượng yêu cầu | Panel điểm QUS trong popup **Tạo module**, chấm ngay khi gõ | UC-28 | Bắt buộc |
| FN-54 | Chất lượng yêu cầu | Panel điểm QUS trong popup **Sửa yêu cầu** | UC-28 | Bắt buộc |
| FN-55 | Chất lượng yêu cầu | Feedback từng story: tiêu chí vi phạm, đoạn chữ gây lỗi (ví dụ từ mơ hồ "nhanh", "dễ dùng"), gợi ý cách viết lại | UC-28 | Bắt buộc |
| FN-56 | Chất lượng yêu cầu | Huy hiệu điểm QUS cạnh mỗi module trong danh sách module | UC-28 | Nếu kịp |
| FN-57 | Thiết kế | Phát hiện FR hoặc user story chưa có màn hình nào phủ (khớp tên và thao tác bằng `extractModel`) | UC-29 | Bắt buộc |
| FN-58 | Thiết kế | Phát hiện nút hoặc link có đích điều hướng (`navigateTo`) trỏ tới màn chưa tồn tại | UC-29 | Bắt buộc |
| FN-59 | Thiết kế | Khối "Gợi ý tiếp theo" ở cột trái tab Thiết kế. Mỗi gợi ý ghi rõ lý do và nguồn, xếp thứ tự: link gãy trước, FR chưa phủ sau | UC-29 | Bắt buộc |
| FN-60 | Thiết kế | Nút **Tạo** mở hộp thoại Màn hình mới với tên và prompt điền sẵn từ gợi ý | UC-29 | Bắt buộc |
| FN-61 | Thiết kế | **Bỏ qua** hoặc khôi phục gợi ý (lưu theo module) | UC-29 | Nếu kịp |

### 3.2. Function list đầy đủ (v2)

Các mục FN-01 → FN-49 giữ nguyên như bản 4 ngày. Tóm tắt theo phân hệ:

| Phân hệ | Mã chức năng | Ghi chú |
|---|---|---|
| Thành viên | FN-01 → FN-03 | Mới |
| Kho tài liệu | FN-04 → FN-10 | Mới (đã có trên nhánh `htrung-c4`) |
| Sơ đồ | FN-11 → FN-14 | Mới |
| Công việc | FN-15 → FN-23 | Mới |
| Dự án | FN-24 → FN-27 | Có |
| Thiết kế | FN-28 → FN-38 | Có |
| Đặc tả | FN-39 → FN-44 | Có |
| Test & Truy vết | FN-45 → FN-48 | Có |
| Nhật ký | FN-49 | Có |
| **Chất lượng yêu cầu** | **FN-50 → FN-56** | **Mới** |
| **Thiết kế, gợi ý** | **FN-57 → FN-61** | **Mới** |

### 3.3. Quy tắc nghiệp vụ bổ sung

| Mã | Quy tắc |
|---|---|
| BR-05 | Điểm QUS chỉ để tư vấn. Không chặn lưu module, không chặn sinh màn hay sinh tài liệu. |
| BR-06 | Gợi ý màn không bao giờ tự tạo màn. Màn chỉ được tạo khi BA bấm Tạo và xác nhận prompt. |
| BR-07 | Khi module đã có FR (sau UC-16), gợi ý "chưa phủ" dựa trên FR. Khi chưa có FR, gợi ý dựa trên user story (FN-50). |
| BR-08 | Gợi ý xuất phát từ link gãy phải ghi rõ tên màn nguồn và nhãn nút để BA truy lại được. |

### 3.4. Tiêu chí nghiệm thu cho `shared/qus.ts` và `shared/suggest.ts`

- `tests/qus.test.ts`: mỗi tiêu chí trong 8 tiêu chí có ít nhất 1 ca **đạt** và 1 ca **vi phạm**. Có ca kiểm tra công thức điểm, chặn đáy 0, chuỗi rỗng và văn bản tiếng Việt.
- `tests/suggest.test.ts`:
  - Có các ca: (a) FR chưa phủ; (b) link gãy; (c) không còn khoảng trống; (d) chưa có FR thì dùng story; (e) gợi ý đã bị bỏ qua.
  - Hàm phải là **hàm thuần** (không gọi DB, không gọi AI), nhận vào `DesignModel`, danh sách FR, danh sách story và danh sách đã bỏ qua.

---

## 4. Danh sách màn hình

### 4.1. Bổ sung và nâng cấp

| Mã | Màn hình / thành phần | Chức năng | Hiện trạng | Cỡ |
|---|---|---|---|---|
| SCR-09 | Chi tiết dự án: danh sách module + popup Tạo module | FN-25 → FN-27, **FN-53, FN-56** | **Nâng cấp** | S |
| SCR-10 | Design Studio | FN-28 → FN-38, **FN-59, FN-60** | **Nâng cấp** | S |
| SCR-15 | Panel chất lượng QUS (thành phần dùng chung trong popup Tạo module và Sửa yêu cầu) | FN-50 → FN-55 | Mới | M |
| SCR-16 | Khối "Gợi ý tiếp theo" (cột trái SCR-10) | FN-57 → FN-61 | Mới | M |

### 4.2. Danh sách đầy đủ (v2)

| Mã | Màn hình | Chức năng | Hiện trạng | Cỡ |
|---|---|---|---|---|
| SCR-01 | Thành viên nhóm (danh sách + hộp thoại thêm/sửa) | FN-01 | Mới | S |
| SCR-02 | Thanh trên: ô "Tôi là…" + menu tới Công việc, Kho tài liệu, Thành viên | FN-02, FN-03 | Nâng cấp | S |
| SCR-03 | Kho tài liệu: danh sách tệp, tải lên, lọc | FN-04 → FN-08 | Mới | M |
| SCR-04 | Xem tệp (ngăn phải): xem trước, thông tin nguồn, tải về | FN-09, FN-10 | Mới | M |
| SCR-05 | Tab Sơ đồ UC trong module | FN-11 → FN-14 | Mới | M |
| SCR-06 | Bảng công việc Kanban | FN-17 → FN-19 | Mới | M |
| SCR-07 | Hộp thoại tạo/sửa task, chọn sản phẩm gắn kèm | FN-15, FN-16 | Mới | M |
| SCR-08 | Danh sách dự án | FN-24 | Có | – |
| SCR-09 | Chi tiết dự án: danh sách module | FN-25 → FN-27, FN-53, FN-56 | **Nâng cấp** | S |
| SCR-10 | Design Studio | FN-28 → FN-38, FN-59, FN-60 | **Nâng cấp** | S |
| SCR-11 | Tài liệu đặc tả: UC, SRS, Sequence, Yêu cầu | FN-39 → FN-44 | Có | – |
| SCR-12 | Test case | FN-45 → FN-47 | Có | – |
| SCR-13 | Truy vết | FN-48 | Có | – |
| SCR-14 | Nhật ký AI | FN-49 | Có | – |
| SCR-15 | Panel chất lượng QUS | FN-50 → FN-55 | Mới | M |
| SCR-16 | Khối Gợi ý tiếp theo | FN-57 → FN-61 | Mới | M |

FN-20 → FN-23 (tự cập nhật task) vẫn không có màn riêng. Popup **Sửa yêu cầu** (FN-54) nằm trong `ModuleView.tsx` và dùng lại SCR-15.

### 4.3. Bố cục SCR-15 và SCR-16 (mô tả cho Agent Design System)

```
SCR-15  Panel QUS (bên phải ô nhập, hoặc phía dưới ở màn hẹp)
┌──────────────────────────────────────────┐
│ Chất lượng yêu cầu        [ 78 / 100 Khá ]│
│ 5 story · 1 lỗi · 3 cảnh báo · 2 gợi ý    │
├──────────────────────────────────────────┤
│ ▸ #1 "Là khách hàng, tôi muốn…"    100 ✓  │
│ ▾ #2 "Tôi muốn đăng nhập nhanh"     55 ✗  │
│    • WELL_FORMED (lỗi): thiếu vai trò     │
│    • AMBIGUOUS (cảnh báo): "nhanh"        │
│      → Gợi ý: nêu ngưỡng, ví dụ "≤ 2 giây"│
└──────────────────────────────────────────┘

SCR-16  Cột trái tab Thiết kế
┌─────────────────────────────┐
│ Gợi ý tiếp theo (3)         │
│ ● Quên mật khẩu             │
│   Nút "Quên mật khẩu?" ở màn │
│   Đăng nhập chưa có đích     │
│   [Tạo]  [Bỏ qua]            │
│ ● Lịch sử đơn hàng          │
│   FR-04 chưa có màn nào phủ  │
│   [Tạo]  [Bỏ qua]            │
└─────────────────────────────┘
```

---

## 5. Thay đổi dữ liệu (tổng hợp cho toàn bộ v2)

| Bảng / cột | Phục vụ | Ghi chú |
|---|---|---|
| `members(id, name, role, created_at)` | FN-01 → FN-03 | role ∈ {BA, BA_LEAD} |
| `annotations.author`, `screen_versions.author` | FN-03 | Đã có `author` ở annotations; thêm vào versions |
| `files(...)` | FN-04 → FN-10 | Lấy theo schema trên nhánh `htrung-c4` |
| `uc_diagrams(module_id, code, status, approved_at, updated_at)` | FN-11 → FN-14 | status ∈ {draft, approved, stale} |
| `tasks(id, project_id, module_id, title, description, assignee_id, due_date, priority, status, artifact_type, artifact_id, created_at)` | FN-15 → FN-19 | status ∈ {todo, doing, done, redo}; artifact_type ∈ {screen, docs, diagram, tests} |
| `task_events(id, task_id, from_status, to_status, by_member_id, by_system, reason, created_at)` | FN-23 | |
| `modules.qus_score INTEGER NULL`, `modules.qus_checked_at TEXT NULL` | FN-56 | Lưu khi BA lưu yêu cầu |
| `suggestion_dismissals(module_id, key, created_at)` | FN-61 | key = mã ổn định của gợi ý, ví dụ `fr:FR-04` hoặc `link:<screenId>:<nodeId>` |
