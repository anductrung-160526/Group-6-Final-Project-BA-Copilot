# Deploy BA Copilot lên Railway

Kết quả sau khi làm xong: một đường link `https://….up.railway.app`. Người mở link phải nhập mật khẩu mới vào được. Dữ liệu được lưu trên volume nên không mất khi deploy lại.

## Đã chuẩn bị sẵn trong code

| File | Vai trò |
| --- | --- |
| `Dockerfile` | Image `node:22-slim` chạy bản đã đóng gói `dist/server.mjs`. Không cần chạy `npm install` khi build. |
| `railway.json` | Railway tự build bằng Dockerfile, kiểm tra tình trạng server qua `/health` và tự khởi động lại khi lỗi. |
| `APP_PASSWORD` | Khi đặt biến này, mọi trang và API đều yêu cầu đăng nhập. Phiên đăng nhập lưu bằng cookie HttpOnly có ký, hạn 30 ngày. Sai mật khẩu quá 10 lần trong 10 phút thì bị chặn tạm. |
| `MAX_AI_CALLS_PER_DAY` | Giới hạn số lượt gọi Claude mỗi ngày để tránh phát sinh chi phí ngoài ý muốn. |

## Bước 1 – Đưa code lên GitHub (repo private)

Chọn một trong hai cách:

- **Nhờ Claude đẩy giúp:** kết nối GitHub với Claude (Settings → Connectors → GitHub), rồi nhắn "đẩy code lên GitHub".
- **Tự làm:** cài GitHub Desktop, chọn *Add Local Repository*, trỏ tới `Documents/ba-copilot`, rồi *Publish repository* và tick **Private**.

File `.env` (chứa API key) đã nằm trong `.gitignore`, nên sẽ **không** bị đưa lên GitHub.

## Bước 2 – Tạo dịch vụ trên Railway

1. Vào [railway.com](https://railway.com) và đăng nhập bằng GitHub.
2. Chọn **New Project → Deploy from GitHub repo**, rồi chọn repo `ba-copilot`. Railway sẽ tự nhận `Dockerfile`.
3. **Thêm volume:** chuột phải vào service (hoặc dùng *Command palette*), chọn **Add Volume**, đặt **Mount path** là `/data`.
4. **Variables:** thêm các biến sau.

   | Biến | Giá trị |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | key lấy từ platform.claude.com |
   | `ANTHROPIC_MODEL` | `claude-sonnet-4-5` (hoặc model mới hơn) |
   | `APP_PASSWORD` | mật khẩu đủ dài để chia sẻ cho giảng viên hoặc hội đồng |
   | `MAX_AI_CALLS_PER_DAY` | ví dụ `200` |
   | `GITHUB_TOKEN` | (tuỳ chọn) token GitHub mặc định khi dự án chưa nhập token trong *Lịch sử GitHub → Cài đặt* |

   Railway tự cấp biến `PORT`, cậu không cần đặt. `DB_FILE=/data/ba-copilot.db` đã được khai báo sẵn trong Dockerfile.
5. Vào **Settings → Networking → Generate Domain** để lấy link công khai.
6. Mở link, nhập `APP_PASSWORD` là dùng được.

## Cập nhật bản mới

Sau khi sửa code: chạy `npm run bundle` để cập nhật `dist/` và `public/app.js`, rồi commit và push lên GitHub. Railway sẽ tự deploy lại.

## Kiểm tra nhanh khi có lỗi

- Mở `https://<domain>/health` phải thấy `{"ok":true}`.
- Mục *Deployments → Logs* trên Railway phải có dòng `BA Copilot đang chạy` và dòng `AI: Claude API (…)`.
- Nếu dữ liệu mất sau mỗi lần deploy, kiểm tra lại volume đã mount đúng `/data` chưa.
- Chi phí: Railway tính theo mức dùng tài nguyên, xem bảng giá hiện hành tại railway.com/pricing. Chi phí Claude xem ở tab *Nhật ký AI* trong ứng dụng và trong Claude Console.
