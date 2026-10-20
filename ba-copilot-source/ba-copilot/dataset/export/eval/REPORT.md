# Huấn luyện và đánh giá Transformer trên bộ dữ liệu "bổ sung UI" (200 màn gốc, 10.012 mẫu)

## Thiết lập

- **Dữ liệu:** chia theo màn gốc trước khi sinh biến thể. Tập test (23 màn, 1.245 mẫu) được chốt bằng hash `rootId` và không dùng để chọn mô hình.
- **Mô hình:** Tree Transformer 4 lớp, d = 96, 4 head, khoảng 479 nghìn tham số. Kiến trúc giữ như cũ (`scripts/train_transformer.py`).
- **Huấn luyện:** mỗi bước, 50% dùng mẫu cố định và 50% làm hỏng ngẫu nhiên cây đầy đủ (`--augment 0.5`).
- **Ba cấu hình so sánh:**
  - **A. Baseline:** mô hình cũ (WebSight, dữ liệu tổng hợp và màn nội bộ; 23.881 cây), không huấn luyện thêm.
  - **B. Từ đầu:** chỉ dùng bộ dữ liệu mới, 10 epoch.
  - **C. Tiền huấn luyện WebSight rồi tinh chỉnh:** khởi tạo từ A, lr 5e-4, 6 epoch.
- **Chọn số epoch theo val:** lần chạy 30 epoch (B) và 20 epoch (C) cho thấy quá khớp, val tốt nhất ở khoảng epoch 8–10 (B) và 5–7 (C).
  Các lần chạy dài được lưu ở `train-scratch.json` và `train-finetune.json`.
- **Chỉ số trên bộ mẫu:**
  - Top-1 và Top-3: loại phần tử ở ô thiếu đầu tiên.
  - Báo động giả: tỷ lệ màn đủ có ô nào đó P(thiếu) ≥ 0,5.
  - Báo động giả trên mẫu bẫy: tính riêng cho màn đủ bị giới hạn quyền.

## Kết quả trên tập test của bộ dữ liệu (1.222 mẫu thiếu, 23 màn đủ, trong đó 15 bẫy)

| Mô hình | Top-1 | Top-3 | Báo động giả (màn đủ) | Báo động giả (bẫy) |
|---|---|---|---|---|
| A. Baseline WebSight | 30,4% | 55,0% | 47,8% | 46,7% |
| B. Từ đầu (bộ mới) | 56,0% | 74,0% | 21,7% | 33,3% |
| **C. WebSight → tinh chỉnh** (đang dùng trong app) | **61,7%** | **82,3%** | 26,1% | 33,3% |

Trên val, C đạt Top-1 62,9%, Top-3 87,2%, báo động giả 12,5%. B đạt Top-1 67,4%, Top-3 84,9%, báo động giả 12,5%.
**C được chọn theo Top-3 trên val.**

**Chạy đúng luồng tab Gợi ý** (`suggest`, ngưỡng 0,3) trên 159 mẫu thiếu 1 phần tử của tập test, tính một mẫu là đúng khi có gợi ý "Thêm" đúng loại và đúng container:
A đúng 25/159 (15,7%), C đúng 52/159 (32,7%).

## Kết quả trên 30 màn tham chiếu thiết kế thủ công (`npm run eval-reference`)

| Mô hình | Hit@1 / Hit@3 (bỏ từng node, n = 489) | Màn đủ vẫn bị gợi ý "Thêm" | Màn thiếu 2 phần tử: precision / recall gợi ý Thêm |
|---|---|---|---|
| A. Baseline | 3,7% / 11,2% | 12/30 (40,0%) | 25,0% / 7,2% |
| B. Từ đầu | 8,8% / 18,2% | 5/30 (16,7%) | 58,1% / 8,9% |
| **C. Tinh chỉnh** | 7,4% / 17,4% | 6/30 (20,0%) | 57,9% / 12,2% |

Chi tiết từng cấu hình nằm ở `ref-websight.md`, `ref-scratch10.md` và `ref-finetune6.md`.

## Nhận xét và giới hạn

- Bộ dữ liệu đúng miền nâng rõ chất lượng:
  - Top-3 trên test tăng từ 55% lên 82%.
  - Báo động giả giảm khoảng một nửa.
  - Gợi ý thừa trên màn tham chiếu giảm từ 40% xuống 20%.
  - Tiền huấn luyện WebSight giúp thêm khoảng 6–8 điểm Top-1/Top-3 trên test so với huấn luyện từ đầu.
- Kết quả trên 30 màn tham chiếu vẫn thấp (Hit@3 ≈ 17%) vì giao thức leave-one-out bỏ cả node khó đoán như Text, Heading, Row, Column…
  Bộ dữ liệu không dạy mô hình đoán các node này, theo đúng quy tắc xóa phần tử.
- Mẫu bẫy vẫn bị báo động giả khoảng 33%, vì mô hình **chưa nhận cờ quyền nghiệp vụ**. Đây là việc tiếp theo nếu cần.
- Màn gốc do Claude soạn, chưa đi qua nút Sinh thiết kế và chưa được BA kiểm nghiệm (`review.status = unreviewed`).
  Tập test vì vậy cùng nguồn với tập huấn luyện. Kết quả nên được kiểm lại trên màn do nhóm tạo.
- Tập val và test mỗi tập chỉ có khoảng 23–24 màn đủ, nên chỉ số báo động giả dao động lớn.

## Chạy thử trên app (`scripts/dataset/demo-suggest.ts` + `e2e/demo-suggest-shot.mjs`)

| Mẫu (tập test) | Đáp án | Gợi ý của mô hình C trong tab Gợi ý |
|---|---|---|
| R036-15 Cài đặt tài khoản – học trực tuyến | Button "Lưu cài đặt" vào `settings_actions` (cuối) | ✅ "Thêm Button (gửi) vào cuối Row", độ tin cậy 0,38, prompt: *Thêm nút "Lưu" (variant primary, action save) vào cuối Row.* (`demo/demo-R036-15.png`) |
| R041-09 Đăng nhập CRM doanh nghiệp | Input "Mật khẩu" vào `login_form[1]` | ❌ Không có gợi ý Thêm ở ngưỡng 0,3. Mô hình xếp đúng vị trí `login_form[1]` lên đầu (P(thiếu) = 0,22) nhưng đoán loại là Checkbox. Mô hình A đoán sai cả vị trí. (`demo/demo-R041-09.png`) |
