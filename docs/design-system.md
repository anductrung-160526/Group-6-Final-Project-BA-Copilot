# Design System – BA Copilot

Người sở hữu: **A1**. Mã nguồn: `client/styles.css` (token + class), `client/components/ui.tsx` (component).
Xem trực quan: mở app tại `#/_gallery`.

> **Bắt buộc với người và AI làm giao diện:** đọc hết tệp này **trước khi** tạo hoặc sửa bất kỳ màn hình nào.
> Màn mới chỉ được ghép từ token và component ở đây. Thiếu thứ gì thì bổ sung vào design system trước (qua A1), không tự viết kiểu riêng trong màn.

---

## 1. Nguyên tắc chung

1. **Một nguồn duy nhất.** Mọi màu, cỡ chữ, khoảng cách, bo góc lấy từ biến CSS ở `:root` (`--color-*`, `--font-*`, `--space-*`, `--radius-*`). Không viết mã màu (`#...`) hay số px trực tiếp trong class mới hoặc `style={{…}}`. Ngoại lệ: kích thước động tính khi chạy (vị trí ghim, độ rộng thanh %, thụt lề cây).
2. **Hai font, không dùng font mono.**
   - Tiêu đề (`h1`–`h4`, tiêu đề thẻ, tiêu đề cột, con số chỉ số): **Space Grotesk** – `var(--font-heading)`.
   - Nội dung, nút, ô nhập, bảng: **Inter** – `var(--font-body)`.
   - Mã, ID cũng dùng Inter (bỏ mono so với bản tham khảo).
3. **Quy luật màu 60 / 30 / 10.**
   | Tỉ lệ | Vai trò | Token |
   |---|---|---|
   | 60% | Nền: trang, thẻ, bảng, panel | `--color-surface`, `--color-bg`, `--color-bg-sub` |
   | 30% | Chữ, viền, tiêu đề | `--color-strong`, `--color-body`, `--color-muted`, `--color-border*`, `--color-heading` |
   | 10% | **Màu chủ đạo Mint** – chỉ cho điểm nhấn | `--color-mint-*`, `--color-accent*` |

   Màu chủ đạo (10%) **chỉ** xuất hiện ở:
   - nút **Thêm mới / hành động chính** (`<Btn kind="primary">`) – mỗi vùng tối đa **một** nút primary;
   - **mục đang chọn ở menu trái** (left side bar): nền mint-50, vạch trái mint-500, **chữ in đậm** màu mint-700;
   - tab đang chọn, hàng bảng đang chọn/hover, viền focus ô nhập, liên kết, logo.

   Không tô mint cho nền lớn, tiêu đề, nút phụ hay badge trạng thái.
4. **Badge ôm sát chữ (hug text).** Badge không bao giờ giãn theo khung cha (đã đặt `width: fit-content`). Không đặt `width`, `flex: 1` hay `display: block` cho badge.
5. **Dùng đúng component:**
   - Mọi hộp thoại xác nhận / tạo nhanh → `Modal`.
   - Mọi panel xem / sửa chi tiết bên phải → `Drawer`.
   - Mọi trạng thái rỗng → `Empty`.
   - Mọi thông báo → `useUI().toast(...)`; mọi tác vụ chờ AI → `useUI().run(...)`.
   - Mọi nhãn trạng thái → `StatusBadge` / `Badge`; điểm 0–100 → `ScoreBadge`.
   - Mọi ô chọn → `Select` (chọn người → `MemberPicker`); tải tệp → `FileDrop`.
6. **Không dùng class `.ds-*` cho giao diện app.** `.ds-*` là giao diện bản thiết kế AI sinh ra trên canvas (Design Studio) và cố ý giữ bảng màu riêng để không làm đổi bản thiết kế của người dùng.
7. **Tên biến cũ** (`--accent`, `--line`, `--muted`, `--green`…) vẫn chạy (đã trỏ sang token mới) để mã cũ không vỡ. Mã mới **không** dùng tên cũ.

---

## 2. Token

### 2.1. Màu

**Mint – màu chủ đạo (10%)**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-mint-grad` | gradient 180° mint-500 → mint-700 | Nền nút primary, logo |
| `--color-mint-50` | `#E6F8F6` | Nền mục chọn (menu trái, hàng bảng, tab phụ) |
| `--color-mint-200` | `#5FE3DA` | Điểm sáng (hiếm dùng) |
| `--color-mint-500` | `#16A6AE` | Viền focus, vạch chọn, gạch chân tab (`--color-accent`) |
| `--color-mint-700` | `#0F5A6E` | Chữ mục chọn, liên kết, viền nút primary (`--color-accent-strong`) |
| `--color-mint-900` | `#0B2B39` | Màu tiêu đề (`--color-heading`) |

**Trung tính (60% + 30%)**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-strong` | `#1C2A30` | Chữ chính |
| `--color-body` | `#3A4A52` | Chữ phụ đậm |
| `--color-muted` | `#7C8B93` | Chú thích, nhãn phụ, tiêu đề cột |
| `--color-border-strong` | `#C9D5DB` | Viền ô nhập, nút phụ |
| `--color-border` | `#E3EAEC` | Đường kẻ, viền thẻ |
| `--color-bg-sub` | `#F6FBFB` | Nền phụ (tiêu đề bảng, vùng kéo thả, canvas) |
| `--color-bg` | `#F3F6F7` | Nền trang |
| `--color-surface` | `#FFFFFF` | Nền thẻ, panel, hộp thoại |
| `--color-hover` | `#EEF3F4` | Nền hover của nút phụ, mục menu |

**Ngữ nghĩa (trạng thái)** – mỗi màu có bản `-soft` làm nền.

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-info` | `#2563EB` | Bản nháp, mở, gợi ý (info) |
| `--color-success` / `-strong` | `#127A4A` / `#22A06B` | Đã duyệt, đã xử lý, toast thành công |
| `--color-warning` / `-strong` | `#8A5A00` / `#F59E0B` | Lỗi thời, cảnh báo, ghim bình luận |
| `--color-orange` | `#C2410C` | Chờ người duyệt |
| `--color-danger` | `#B42318` | Lỗi, xoá, toast lỗi |
| `--color-violet` | `#6B3FD6` | Đã gửi AI, xem trước phiên bản |
| `--color-ai` | `#7C5CFF` | Gợi ý của mô hình ML trên canvas |

### 2.2. Chữ

| Cấp | Font | Cỡ / độ đậm | Token |
|---|---|---|---|
| H1 – tiêu đề trang | Space Grotesk | 30 / 600 | `--font-size-h1` |
| H2 – tiêu đề khu vực | Space Grotesk | 20 / 600 | `--font-size-h2` |
| H3 – tiêu đề thẻ, hộp thoại | Space Grotesk | 16 / 600 | `--font-size-h3` |
| Chỉ số (meter) | Space Grotesk | 24 / 700 | `--font-size-metric` |
| body | Inter | 14 / 400, dòng 1.5 | `--font-size-body` |
| Nút nhỏ, nhãn ô nhập | Inter | 13 / 600 | `--font-size-sm` |
| small – chú thích, tiêu đề cột | Inter | 12.5 | `--font-size-small` |
| Badge, ghi chú tab | Inter | 11 / 600 | `--font-size-xs` |

Độ đậm: `--font-weight-regular` 400, `-medium` 500, `-semibold` 600, `-bold` 700.

### 2.3. Khoảng cách (bước 4px)

`--space-0-5` 2 · `--space-1` 4 · `--space-1-5` 6 · `--space-2` 8 · `--space-2-5` 10 · `--space-3` 12 · `--space-3-5` 14 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-8` 32 · `--space-10` 40

Quy ước: trong thẻ/hộp thoại dùng 12–16 · giữa các khu vực trong trang 20–24 · lề trang 20–24.

### 2.4. Bo góc, bóng, lớp

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--radius-xs` | 4px | Badge, ghim, thẻ nhỏ |
| `--radius-sm` | 6px | Nút, ô nhập, thẻ Kanban |
| `--radius-md` | 8px | Thẻ, bảng, panel |
| `--radius-lg` | 12px | Hộp thoại, trạng thái rỗng, vùng kéo thả |
| `--radius-pill` | 999px | Chip, thanh tiến độ |
| `--shadow-sm` / `-md` / `-lg` | | Thẻ / lớp chờ, canvas / hộp thoại, ngăn phải |
| `--z-menu` 15 · `--z-topbar` 20 · `--z-drawer` 45 · `--z-modal` 50 · `--z-busy` 60 · `--z-toast` 70 | | Thứ tự lớp |

App chưa có chế độ tối nên chưa có bộ token tối.

---

## 3. Component (`client/components/ui.tsx`)

| Component | Props chính | Khi nào dùng |
|---|---|---|
| `Btn` | `kind`: `primary` \| `secondary` \| `ghost` \| `danger`; `size`: `sm` \| `md` | `primary` (gradient mint) chỉ cho hành động chính / **Thêm mới**. `secondary` trắng viền xám. `ghost` cho Bỏ qua, Huỷ phụ. `danger` viền đỏ cho xoá. |
| `Badge` | `tone`: `gray` `blue` `mint` `green` `amber` `orange` `red` `violet` `flag` | Nhãn tuỳ ý. Viền + nền nhạt, bo 4px, ôm sát chữ. `flag` = viền đứt (cảnh báo rủi ro). |
| `StatusBadge` | `status`: `none` `draft` `approved` `outdated` `open` `sent` `resolved` | Trạng thái sản phẩm BA, nhãn tiếng Việt có sẵn. |
| `ScoreBadge` | `score` 0–100, `showLabel?` | Điểm QUS: ≥ 80 xanh "Tốt", 60–79 vàng "Khá", < 60 đỏ "Cần sửa" (khớp `shared/qus.ts`). |
| `Field` | `label`, `hint?`, `children` | Bọc mọi ô nhập có nhãn. |
| `Select` | `value`, `options`, `onChange`, `placeholder?` | Mọi ô chọn một giá trị. |
| `MemberPicker` | `members`, `value`, `onChange` | Chọn người phụ trách (khung giao diện; A3 nối dữ liệu). |
| `Avatar` | `name?`, `size?` | Chữ cái đầu tên, dùng trên thẻ, danh sách. |
| `Tabs` | `items` (`key`, `label`, `extra?`, `href?`), `active`, `onChange?` | Thanh tab ngang. Tab chọn: chữ mint-700 đậm, gạch chân mint-500. |
| `Modal` | `title`, `onClose`, `footer?`, `wide?` | **Mọi hộp thoại.** Esc / bấm nền để đóng. Nút chính đặt cuối footer. |
| `Drawer` | `title`, `onClose`, `footer?`, `actions?`, `size`: `md` (480) \| `lg` (720) | **Mọi panel** xem/sửa chi tiết bên phải (SCR-04 xem tệp, SCR-07 task). |
| `Empty` | `title`, `children?` | **Mọi trạng thái rỗng**: tiêu đề + câu hướng dẫn bước tiếp theo. |
| `FileDrop` | `onFiles`, `accept?`, `multiple?` | Vùng kéo thả / bấm chọn tệp (SCR-03). |
| `KanbanColumn` | `id`, `title`, `count?`, `onDropCard?(cardId, columnId)` | Cột bảng công việc; nhận thẻ kéo thả HTML5. |
| `KanbanCard` | `id`, `title`, `meta?`, `onClick?` | Thẻ công việc kéo được. |
| `IssueList` | `issues` (`severity`, `code?`, `message`, `suggestion?`), `empty?` | Danh sách lỗi theo mức: lỗi (đỏ) → cảnh báo (vàng) → gợi ý (xanh dương). |
| `SuggestionCard` | `title`, `reason`, `onAccept`, `onDismiss` | Thẻ "Gợi ý tiếp theo" (SCR-16): tiêu đề, lý do, nút Tạo + Bỏ qua. |
| `ToastItem` / `useUI().toast` | `kind`: `ok` \| `err` \| `info` | Thông báo góc dưới phải; lỗi giữ 7 giây, còn lại 3,5 giây. |
| `useUI().run` | `label`, `fn` | Hiện lớp "AI đang xử lý…" và tự đổi lỗi thành toast. |

### 3.1. Class bố cục có sẵn (`styles.css`)

| Class | Dùng cho |
|---|---|
| `.page`, `.page-head`, `.crumbs` | Khung trang cấp dự án: đường dẫn, H1, nút Thêm mới bên phải |
| `.side-nav` + `.side-nav-item.active` | **Menu trái**; mục đang chọn tự in đậm + nền mint-50 + vạch trái mint-500 |
| `.screen-item.active`, `.doc-nav button.on` | Menu trái có sẵn ở Design Studio và Tài liệu (cùng kiểu với `.side-nav-item`) |
| `.tbl` (+ `tr.clickable`, `tr.selected`) | Bảng: tiêu đề cột chữ hoa xám; hàng hover/chọn nền mint-50, vạch trái mint-500 |
| `.tile`, `.grid` | Lưới thẻ (dự án, module) |
| `.toolbar`, `.seg`, `.filters` | Thanh công cụ, nút phân đoạn, bộ lọc |
| `.box`, `.box-title`, `.paper` | Khối nội dung trong panel / tài liệu |
| `.meters`, `.meter` | Thẻ chỉ số (Truy vết) |
| `.kanban` | Lưới chứa các `KanbanColumn` |

---

## 4. Áp dụng cho các màn hiện có

| Màn | Áp dụng |
|---|---|
| Thanh trên (mọi màn) | Logo nền gradient mint, tên app Space Grotesk; nền trắng (không tô mint cả thanh để giữ 10%). |
| SCR-08 Danh sách dự án | H1 30, thẻ `.tile` có tiêu đề Space Grotesk; nút **+ Dự án mới** là primary duy nhất. |
| SCR-09 Chi tiết dự án | Nút **+ Module mới** primary; tab Module / Kho tài liệu theo `Tabs`; popup Tạo module dùng `Modal` + panel QUS. |
| SCR-10 Design Studio | Cột trái là menu trái: màn đang chọn in đậm + nền mint-50 + vạch mint-500; nút **+ Mới** primary; khối Gợi ý tiếp theo theo `SuggestionCard`. |
| SCR-11 Tài liệu | Danh sách UC bên trái (`.doc-nav`) theo quy tắc menu trái. |
| SCR-12 Test case, SCR-13 Truy vết, SCR-14 Nhật ký AI | Bảng `.tbl`, thẻ chỉ số `.meter` (số Space Grotesk). |
| SCR-03 Kho tài liệu | Bảng `.tbl`, nút tải lên primary. A4 chuyển vùng tải lên sang `FileDrop`, xem tệp sang `Drawer`. |
| SCR-15 Panel QUS | Nền `bg-sub`, điểm theo ngưỡng ScoreBadge, lỗi theo kiểu `IssueList`. |
| Màn mới (SCR-01, 04, 05, 06, 07) | Bắt buộc ghép từ component mục 3. |

Bố cục, nội dung và chức năng các màn cũ **không đổi**; chỉ màu, font và kiểu badge đổi theo design system này.

---

## 5. Checklist trước khi gửi một màn

- [ ] Đã đọc tệp này trước khi code.
- [ ] Không có mã màu / px cứng mới (trừ giá trị động).
- [ ] Tiêu đề dùng Space Grotesk, nội dung dùng Inter, không có font mono.
- [ ] Mỗi vùng chỉ một nút primary; mint chỉ ở nút chính, mục menu đang chọn, tab chọn, focus, liên kết.
- [ ] Mục menu trái đang chọn in đậm.
- [ ] Badge ôm sát chữ.
- [ ] Hộp thoại = `Modal`, panel phải = `Drawer`, rỗng = `Empty`, thông báo = `toast`.
- [ ] Đã thêm component mới (nếu có) vào `#/_gallery`.
