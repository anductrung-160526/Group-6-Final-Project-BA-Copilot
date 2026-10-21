# Module Kiểm Tra Chất Lượng User Story (QUS) – BA Copilot

> **Thành viên phụ trách**: C1 – Trưởng team Code  
> **Dự án**: BA Copilot (Môn Advanced Business Analytics)  
> **Cơ sở phương pháp**: Quality User Story Framework (Lucassen et al., 2016), INVEST, ISO/IEC/IEEE 29148  

---

## 1. Giới thiệu bài toán & Mục tiêu

Trong quy trình phát triển phần mềm, yêu cầu nghiệp vụ (User Story) là khởi đầu cho toàn bộ chu trình: thiết kế màn hình UI, sinh Use Case, viết đặc tả SRS và xây dựng Test Case. Nếu User Story viết kém, mơ hồ hoặc thiếu thành phần:
- BA và Designer phải làm lại (rework) nhiều lần.
- AI sinh ra màn hình lệch nghiệp vụ hoặc thiếu sót luồng chức năng.
- Khó kiểm soát độ bao phủ giữa yêu cầu và ca kiểm thử.

**Tính năng QUS** của BA Copilot cung cấp khả năng tự động phân tích cú pháp và chấm điểm chất lượng User Story theo thời gian thực (real-time with debounce) ngay khi BA nhập yêu cầu vào hệ thống, chỉ rõ các lỗi vi phạm và đưa ra gợi ý sửa cụ thể theo ngữ cảnh.

---

## 2. Khung phương pháp và Các tiêu chí đánh giá

Module được xây dựng dựa trên các nghiên cứu khoa học về chất lượng User Story:
1. **Connextra Template**:
   - Tiếng Anh: `As a <role>, I want <means> [so that <end>]`
   - Tiếng Việt: `Là một <vai trò>, tôi muốn <hành động> [để <mục đích>]` (hoặc `Với tư cách là...`)
2. **Quality User Story (QUS) Framework** (Lucassen et al., RE'16):

| Mã tiêu chí | Mức độ | Trừ điểm | Ý nghĩa & Cách kiểm tra |
| :--- | :--- | :--- | :--- |
| **`WELL_FORMED`** | Error | -30đ | User Story thiếu vai trò (Role) hoặc thiếu hành động (Means). Bắt buộc viết theo mẫu chuẩn. |
| **`UNREADABLE`** | Error | -50đ / mỗi phần | *(Luật của nhóm, chạy bằng mô hình NLP)* Phần vai trò / hành động / lợi ích không phải tiếng Anh đọc được: hơn nửa số từ không có trong từ điển của mô hình wink-nlp (kể cả dạng gốc của từ và từ ghép tách được). Một ô linh tinh → 50đ (Poor); "As a asdf, I want qwer, so that zxcv" → 3 lỗi, 0đ. |
| **`NO_END`** | Warn | -15đ | Có vai trò và hành động nhưng thiếu phần mục đích / giá trị mang lại (`so that` / `để`). |
| **`ATOMIC`** | Warn | -15đ | Phần hành động (means) chứa nhiều hành động nối bằng "và" / "and" / `;` (phân biệt nối hành động với nối danh từ như *email và mật khẩu*). |
| **`MINIMAL`** | Info | -5đ | Chứa ghi chú dài trong ngoặc đơn, hoặc chứa các từ "ví dụ", "lưu ý", "e.g.", "note:". Nên đưa vào Acceptance Criteria. |
| **`AMBIGUOUS`** | Warn | -15đ | Chứa từ ngữ mơ hồ, không đo lường được (*nhanh, dễ dàng, thân thiện, tốt, hiệu quả, linh hoạt, tối ưu, etc, v.v, fast, easy, user-friendly*). |
| **`FULL_SENTENCE`**| Warn | -15đ | Câu quá ngắn (< 4 từ), chưa đủ ngữ nghĩa hoàn chỉnh. |
| **`DUPLICATE`** | Warn | -15đ | *(Cấp tập hợp)* Độ tương đồng Jaccard giữa tập từ vựng của 2 story $\ge 0.7$, chỉ rõ cặp story bị trùng. |
| **`NOT_UNIFORM`** | Info | -5đ | *(Cấp tập hợp)* Tập hợp chứa lẫn lộn giữa story viết theo mẫu chuẩn và story viết tự do. |

**Nguồn chấm.** Story tiếng Anh: `WELL_FORMED`, `ATOMIC`, `MINIMAL`, `NOT_UNIFORM`, `DUPLICATE` (trùng chính xác) và `UNREADABLE` chấm bằng AQUSA (`shared/aqusa.ts`) với mô hình NLP wink-nlp (gán nhãn từ loại, từ điển). Bắt buộc phải nạp mô hình: server nạp sẵn (`shared/nlp-node.ts`); trình duyệt tải `nlp.js`, khi chưa tải xong thì **không hiện điểm** (hiện "QUS: loading the NLP model…"), không chấm thay bằng luật. Cách kiểm theo từ khoá mô tả trong bảng chỉ còn dùng cho story tiếng Việt cũ (AQUSA chỉ dành cho tiếng Anh) và cho các luật bổ sung của nhóm (`NO_END`, `AMBIGUOUS`, `FULL_SENTENCE`, trùng gần đúng Jaccard).

---

## 3. Quy tắc tính điểm (Scoring Rubric)

- **Điểm mỗi story**: Bắt đầu từ `100đ`, trừ dần theo các vi phạm:
  - Error: `-30đ`
  - Warn: `-15đ`
  - Info: `-5đ`
  - `UNREADABLE`: `-50đ` mỗi phần (để chỉ một ô linh tinh cũng xuống mức Poor)
  - Điểm tối thiểu: `0đ` (không âm).
- **Điểm tổng (`total`)**: Trung bình cộng điểm của tất cả các story, làm tròn đến số nguyên gần nhất (`0 - 100`). Nếu không có story nào, `total = 0`.
- **Thang đánh giá màu sắc**:
  - `Badge xanh` ($\ge 80đ$): Đạt chất lượng tốt.
  - `Badge vàng` ($50 - 79đ$): Cần cải thiện (cảnh báo nhẹ).
  - `Badge đỏ` ($< 50đ$): Kém, cần viết lại.

---

## 4. Vị trí mã nguồn

Thư mục `QUS/` ở gốc repo đã được bỏ (bản sao trùng). Mã nguồn duy nhất nằm trong ứng dụng:

```
ba-copilot-source/ba-copilot/
├── shared/qus.ts                  # Hàm thuần chấm điểm QUS (splitStories, scoreStories, các kiểu dữ liệu)
├── client/components/QusPanel.tsx # Component React hiển thị điểm và gợi ý (Debounce 300ms, thu gọn/mở rộng)
└── tests/qus.test.ts              # Unit test

docs/qus/
├── README.md                      # Tài liệu này
└── screenshots/                   # Ảnh chụp minh chứng
    ├── screenshot_a_modal_new_module.png   # Panel QUS trong modal Tạo module mới
    ├── screenshot_b_modal_edit_req.png     # Panel QUS trong modal Sửa yêu cầu nghiệp vụ
    └── screenshot_c_empty_state.png        # Panel hiển thị gợi ý rỗng khi textarea trống
```

---

## 5. Tích hợp trong BA Copilot

- **Modal "+ Module mới"** (`client/views/ProjectView.tsx`):
  Hiển thị `<QusPanel text={req} />` ngay dưới ô nhập User Story. Khi người dùng bấm "Dùng ví dụ mẫu", panel lập tức chấm điểm và phân tích.
- **Modal "Yêu cầu nghiệp vụ / User story"** (`client/views/ModuleView.tsx`):
  Hiển thị `<QusPanel text={reqText} />` ngay dưới textarea.
- **Tính phi chặn (Non-blocking)**:
  Panel chỉ đóng vai trò trợ lý nhắc nhở, **không chặn** thao tác tạo module hoặc lưu của người dùng.

---

## 6. Hướng dẫn chạy kiểm thử

Chạy kiểm thử unit test từ thư mục gốc của dự án `ba-copilot-source/ba-copilot`:

```bash
npm test
```

Kiểm tra kiểu dữ liệu:
```bash
npx tsc --noEmit
```
