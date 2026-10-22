# Quy tắc cho AI làm việc trong repo này

## Giao diện (bắt buộc)

Trước khi tạo hoặc sửa **bất kỳ** màn hình / component giao diện nào trong `ba-copilot-source/ba-copilot/frontend/src/`:

1. Đọc `docs/design-system.md` (token, component, quy tắc 60/30/10, font Space Grotesk + Inter, badge ôm sát chữ).
2. Chỉ dùng token trong `frontend/src/styles.css` và component trong `frontend/src/components/ui.tsx`. Không viết mã màu / px cứng mới.
3. Thiếu component thì thêm vào `ui.tsx` + trang `#/_gallery` + `docs/design-system.md`, không tự tạo kiểu riêng trong màn.
4. Chạy `npm run build` và mở `#/_gallery` để soát trước khi bàn giao.
