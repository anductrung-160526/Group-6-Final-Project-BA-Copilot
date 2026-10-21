# Deploy BA Copilot lên Render

Kết quả: một đường link `https://….onrender.com` (bản đang chạy: <https://ba-copilot-vz0t.onrender.com/>). Lần chạy đầu, web có sẵn dữ liệu của bản xuất `database/ba-copilot.db` (dự án mẫu *Electronics Store (sample)*).

## Đã chuẩn bị sẵn trong code

| Tệp / biến | Vai trò |
| --- | --- |
| `Dockerfile` | Image `node:22-slim` chạy bản đã đóng gói `dist/server.mjs`, không cần `npm install` khi build. Thư mục `/data` còn trống thì chép `database/ba-copilot.db` làm dữ liệu ban đầu. |
| `railway.json` | Chỉ dùng khi deploy lên Railway. Render bỏ qua tệp này. |
| `APP_PASSWORD` | Đặt biến này thì mọi trang và API đều yêu cầu mật khẩu. Phiên đăng nhập lưu bằng cookie có ký, hạn 30 ngày. Sai quá 10 lần trong 10 phút thì bị chặn tạm. |
| `MAX_AI_CALLS_PER_DAY` | Giới hạn số lượt gọi Claude mỗi ngày, tránh phát sinh chi phí ngoài ý muốn. |

Tệp `.env` (chứa khoá Claude) nằm trong `.gitignore` và không được Dockerfile chép vào image, nên khoá **không** lên GitHub và **không** nằm trong bản deploy. Trên Render, khoá được nhập ở mục *Environment*.

## Gói miễn phí và ổ lưu trữ

| | Free | Starter trở lên + Disk |
| --- | --- | --- |
| Chi phí | 0 đ | Starter khoảng 7 USD/tháng, cộng ổ lưu trữ 0,25 USD/GB/tháng (1 GB là đủ) |
| Dữ liệu người dùng nhập | **Mất** mỗi khi web khởi động lại, ngủ rồi thức dậy, hoặc deploy bản mới. Web quay về dữ liệu của `database/ba-copilot.db`. | Giữ nguyên qua các lần khởi động lại và deploy |
| Khi không ai dùng | Ngủ sau 15 phút. Lượt mở đầu tiên sau đó chờ khoảng 1 phút | Luôn chạy |

Gói Free không gắn được ổ lưu trữ. Gói Free hợp để xem thử với dữ liệu mẫu. Cần giữ dữ liệu (ví dụ cho buổi bảo vệ có nhập liệu thật) thì chuyển sang Starter và gắn Disk (bước 6 ở Bước 1).

## Bước 0 – Chuẩn bị bản code

```bash
npm run bundle      # cập nhật dist/ và public/app.js
npm run export-db   # cập nhật database/ (dữ liệu ban đầu của bản deploy)
```

Commit rồi đẩy lên GitHub (repo `db_ba_final`), nhánh muốn deploy.

## Bước 1 – Tạo dịch vụ trên Render

1. Vào [render.com](https://render.com), đăng nhập bằng GitHub.
2. **New → Web Service** → chọn repo `db_ba_final`.
3. Điền thông tin:
   - **Language**: `Docker`.
   - **Branch**: nhánh đã đẩy ở bước 0.
   - **Root Directory**: `ba-copilot-source/ba-copilot` (phần mềm nằm trong thư mục con, không ở gốc repo).
   - **Dockerfile Path**: `./Dockerfile`.
   - **Instance Type**: `Free` hoặc `Starter` (xem bảng ở trên).
4. **Environment Variables**:

   | Biến | Giá trị |
   | --- | --- |
   | `ANTHROPIC_AUTH_TOKEN` | khoá Claude của cổng trung gian (gửi dạng `Authorization: Bearer`) |
   | `ANTHROPIC_BASE_URL` | địa chỉ cổng, ví dụ `https://ten-cong.example.com` |
   | `ANTHROPIC_MODEL` | tên model cổng hỗ trợ |
   | `APP_PASSWORD` | mật khẩu đủ dài để chia sẻ cho giảng viên, hội đồng |
   | `MAX_AI_CALLS_PER_DAY` | ví dụ `200` |
   | `GITHUB_TOKEN` | (tuỳ chọn) token GitHub mặc định khi dự án chưa nhập token ở *GitHub History → Settings* |

   Gọi thẳng Anthropic thì thay hai biến đầu bằng `ANTHROPIC_API_KEY` (lấy ở platform.claude.com) và bỏ `ANTHROPIC_BASE_URL`.
   Render tự cấp `PORT`. `DB_FILE=/data/ba-copilot.db` đã khai báo sẵn trong Dockerfile.
5. **Advanced → Health Check Path**: `/health`.
6. **Chỉ với gói trả phí – Advanced → Add Disk**: **Mount Path** `/data`, **Size** `1` GB.
7. Bấm **Deploy Web Service**. Xong, link công khai hiện ở đầu trang dịch vụ.
8. Mở link, nhập `APP_PASSWORD` là dùng được.

Dịch vụ đã tạo ở gói Free mà muốn giữ dữ liệu: vào **Settings → Instance Type** đổi sang `Starter`, rồi vào **Disks → Add Disk** như bước 6.

## Cập nhật bản mới

Sửa code → `npm run bundle` → commit, push. Render tự deploy lại khi nhánh có commit mới (*Auto-Deploy: On Commit*). Có Disk thì dữ liệu được giữ; `database/ba-copilot.db` chỉ dùng khi `/data` còn trống.

Muốn web quay về đúng dữ liệu bản xuất: vào tab **Shell** của dịch vụ, chạy `rm /data/ba-copilot.db`, rồi **Manual Deploy → Deploy latest commit**. Gói Free không cần làm gì, web tự quay về dữ liệu bản xuất sau mỗi lần khởi động lại.

## Kiểm tra nhanh khi có lỗi

- `https://<domain>/health` phải trả `{"ok":true}`.
- Tab *Logs* phải có dòng `BA Copilot is running` và dòng `AI: Claude API (…)`. Thấy `Mock mode` nghĩa là chưa nhập khoá.
- Lỗi `Claude API error 401/403` trong *AI Log* của web: khoá sai, hoặc nhầm `ANTHROPIC_API_KEY` với `ANTHROPIC_AUTH_TOKEN`.
- Dữ liệu mất sau mỗi lần deploy: gói Free không giữ dữ liệu; gói trả phí thì kiểm tra Disk đã mount đúng `/data`.
- Mở link phải chờ lâu: gói Free đang ngủ, đợi khoảng 1 phút.
- Build báo thiếu `database/ba-copilot.db`: chưa chạy `npm run export-db` hoặc chưa commit thư mục `database/`.
- Chi phí: xem ở render.com/pricing. Chi phí Claude xem ở tab *AI Log* trong web.
