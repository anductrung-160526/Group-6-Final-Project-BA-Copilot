// GitHub của dự án: cài đặt repo, thử kết nối, lịch sử (kế hoạch đợt 5, mục 3 "C8"). Chủ sở hữu: C8.
// Khung do C2 tạo: trả 501 cho tới khi C8 thay. Hợp đồng: docs/api.md "Đợt 5" mục 5.6.
// Bảng `project_git` (token KHÔNG BAO GIỜ trả về client – chỉ `hasToken`), `git_pushes`.
// GET: requireMember; PUT và POST test: requireLead (server/http.ts).

import { notImplemented, route } from "../http.ts";

route("GET", "/api/projects/:id/git", notImplemented("C8 – xem cài đặt GitHub (không có token)"));
route("PUT", "/api/projects/:id/git", notImplemented("C8 – lưu cài đặt GitHub"));
route("POST", "/api/projects/:id/git/test", notImplemented("C8 – thử kết nối GitHub"));
route("GET", "/api/projects/:id/git/history", notImplemented("C8 – lịch sử commit + nhật ký đẩy"));
