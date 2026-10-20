// Yêu cầu nghiệp vụ – user story cấp dự án (kế hoạch đợt 5, mục 3 "C4"). Chủ sở hữu: C4.
// Khung do C2 tạo: mọi endpoint trả 501 cho tới khi C4 thay bằng handler thật. Hợp đồng: docs/api.md "Đợt 5" mục 5.2.
// Bảng `user_stories` (server/db.ts). Ghi phải: requireMember(ctx), assertRev(rev hiện tại, baseRevOf(body)), rev + 1,
// updated_by = actor. Mã US-xx: storyCode(nextStoryNumber(getDb(), projectId)) trong server/db.ts.

import { notImplemented, route } from "../http.ts";

route("GET", "/api/projects/:id/stories", notImplemented("C4 – danh sách user story (?moduleId=)"));
route("POST", "/api/projects/:id/stories", notImplemented("C4 – thêm user story"));
route("POST", "/api/projects/:id/stories/reorder", notImplemented("C4 – sắp xếp user story"));
route("GET", "/api/stories/:id", notImplemented("C4 – xem user story"));
route("PATCH", "/api/stories/:id", notImplemented("C4 – sửa user story (baseRev)"));
route("DELETE", "/api/stories/:id", notImplemented("C4 – xoá user story"));
