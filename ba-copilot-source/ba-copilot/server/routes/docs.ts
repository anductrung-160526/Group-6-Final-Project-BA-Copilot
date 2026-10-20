// Tài liệu theo bước BRD → UC Spec → SRS → FRD-NFR → API Spec (kế hoạch đợt 5, mục 3 "C5"). Chủ sở hữu: C5.
// Khung do C2 tạo: mọi endpoint trả 501 cho tới khi C5 thay. Hợp đồng: docs/api.md "Đợt 5" mục 5.3.
// Bảng `module_docs` (server/db.ts). `:kind` ∈ DOC_KINDS (shared/types.ts). Ghi phải: requireMember(ctx),
// assertRev(rev hiện tại, baseRevOf(body)), rev + 1 (bumpRev), phát "artifact.drafted" { kind: "doc", sub }.
// Route cũ /api/modules/:id/docs/generate|refine|approve (app.ts) giữ tới khi C9 chuyển service.ts sang module_docs.

import { notImplemented, route } from "../http.ts";

route("GET", "/api/modules/:id/docs", notImplemented("C5 – đủ 5 tài liệu của module"));
route("GET", "/api/modules/:id/docs/:kind", notImplemented("C5 – xem một tài liệu"));
route("PUT", "/api/modules/:id/docs/:kind", notImplemented("C5 – lưu tài liệu sửa tay (baseRev)"));
route("POST", "/api/modules/:id/docs/:kind/generate", notImplemented("C5 – sinh tài liệu bằng AI"));
route("POST", "/api/modules/:id/docs/:kind/refine", notImplemented("C5 – chỉnh tài liệu bằng AI theo mục"));
