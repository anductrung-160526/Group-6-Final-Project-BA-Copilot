# Deploy BA Copilot lên Railway

Kết quả: một đường link `https://….up.railway.app`. Dữ liệu nằm trên volume nên không mất khi deploy lại. Lần chạy đầu, web có sẵn dữ liệu của bản xuất `database/ba-copilot.db` (dự án mẫu *Electronics Store (sample)*).

## Đã chuẩn bị sẵn trong code

| Tệp / biến | Vai trò |
| --- | --- |
| `Dockerfile` | Image `node:22-slim` chạy bản đã đóng gói `dist/server.mjs`, không cần `npm install` khi build. Volume còn trống thì chép `database/ba-copilot.db` làm dữ liệu ban đầu. |
| `railway.json` | Railway build bằng Dockerfile, kiểm tra tình trạng qua `/health`, tự khởi động lại khi lỗi. |
| `APP_PASSWORD` | Đặt biến này thì mọi trang và API đều yêu cầu mật khẩu. Phiên đăng nhập lưu bằng cookie có ký, hạn 30 ngày. Sai quá 10 lần trong 10 phút thì bị chặn tạm. |
| `MAX_AI_CALLS_PER_DAY` | Giới hạn số lượt gọi Claude mỗi ngày, tránh phát sinh chi phí ngoài ý muốn. |

Tệp `.env` (chứa khoá Claude) nằm trong `.gitignore` và không được Dockerfile chép vào image, nên khoá **không** lên GitHub và **không** nằm trong bản deploy. Trên Railway, khoá được nhập ở mục *Variables*.

## Bước 0 – Chuẩn bị bản code

```bash
npm run bundle      # cập nhật dist/ và public/app.js
npm run export-db   # cập nhật database/ (dữ liệu ban đầu của bản deploy)
```

Commit rồi đẩy lên GitHub (repo `db_ba_final`), nhánh muốn deploy.

## Bước 1 – Tạo dịch vụ trên Railway

1. Vào [railway.com](https://railway.com), đăng nhập bằng GitHub.
2. **New Project → Deploy from GitHub repo** → chọn `db_ba_final`.
3. Vào service → **Settings**:
   - **Source → Root Directory**: `ba-copilot-source/ba-copilot` (phần mềm nằm trong thư mục con, không ở gốc repo).
   - **Source → Branch**: nhánh đã đẩy ở bước 0.
4. **Thêm volume**: chuột phải vào service (hoặc *Command palette*) → **Add Volume**, **Mount path** `/data`.
5. **Variables**:

   | Biến | Giá trị |
   | --- | --- |
   | `ANTHROPIC_AUTH_TOKEN` | khoá Claude của cổng trung gian (gửi dạng `Authorization: Bearer`) |
   | `ANTHROPIC_BASE_URL` | địa chỉ cổng, ví dụ `https://ten-cong.example.com` |
   | `ANTHROPIC_MODEL` | tên model cổng hỗ trợ |
   | `APP_PASSWORD` | mật khẩu đủ dài để chia sẻ cho giảng viên, hội đồng |
   | `MAX_AI_CALLS_PER_DAY` | ví dụ `200` |
   | `GITHUB_TOKEN` | (tuỳ chọn) token GitHub mặc định khi dự án chưa nhập token ở *GitHub History → Settings* |

   Gọi thẳng Anthropic thì thay hai biến đầu bằng `ANTHROPIC_API_KEY` (lấy ở platform.claude.com) và bỏ `ANTHROPIC_BASE_URL`.
   Railway tự cấp `PORT`. `DB_FILE=/data/ba-copilot.db` đã khai báo sẵn trong Dockerfile.
6. **Settings → Networking → Generate Domain** để lấy link công khai.
7. Mở link, nhập `APP_PASSWORD` là dùng được.

## Cập nhật bản mới

Sửa code → `npm run bundle` → commit, push. Railway tự deploy lại. Dữ liệu trên volume được giữ; `database/ba-copilot.db` chỉ dùng khi volume còn trống.

Muốn web quay về đúng dữ liệu bản xuất: xoá tệp `/data/ba-copilot.db` trên volume (hoặc tạo volume mới) rồi deploy lại.

## Kiểm tra nhanh khi có lỗi

- `https://<domain>/health` phải trả `{"ok":true}`.
- *Deployments → Logs* phải có dòng `BA Copilot is running` và dòng `AI: Claude API (…)`. Thấy `Mock mode` nghĩa là chưa nhập khoá.
- Lỗi `Claude API error 401/403` trong *AI Log* của web: khoá sai, hoặc nhầm `ANTHROPIC_API_KEY` với `ANTHROPIC_AUTH_TOKEN`.
- Dữ liệu mất sau mỗi lần deploy: kiểm tra volume đã mount đúng `/data`.
- Build báo thiếu `database/ba-copilot.db`: chưa chạy `npm run export-db` hoặc chưa commit thư mục `database/`.
- Chi phí: Railway tính theo tài nguyên dùng (railway.com/pricing). Chi phí Claude xem ở tab *AI Log* trong web.
