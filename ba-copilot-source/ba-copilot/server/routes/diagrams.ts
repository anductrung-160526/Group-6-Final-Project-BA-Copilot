// Sơ đồ theo bước Context → UC → Sequence → BPMN → ERD (kế hoạch đợt 5, mục 3 "C6"). Chủ sở hữu: C6
// (C6 có thể gộp tệp này vào server/routes/diagram.ts). Khung do C2 tạo: trả 501 cho tới khi C6 thay.
// Hợp đồng: docs/api.md "Đợt 5" mục 5.4. Bảng `module_diagrams` (server/db.ts). `:kind` ∈ DIAGRAM_KINDS.
// Ghi phải: requireMember(ctx), assertRev(rev, baseRevOf(body)), bumpRev, phát "artifact.drafted" { kind: "diagram", sub }.
// Route cũ /api/modules/:id/diagram (số ít, bảng uc_diagrams) giữ tới khi C6 thay DiagramTab.

import { notImplemented, route } from "../http.ts";

route("GET", "/api/modules/:id/diagrams", notImplemented("C6 – đủ 5 sơ đồ của module"));
route("GET", "/api/modules/:id/diagrams/:kind", notImplemented("C6 – xem một sơ đồ"));
route("PUT", "/api/modules/:id/diagrams/:kind", notImplemented("C6 – lưu mã Mermaid (baseRev)"));
route("POST", "/api/modules/:id/diagrams/:kind/generate", notImplemented("C6 – sinh sơ đồ bằng AI"));
