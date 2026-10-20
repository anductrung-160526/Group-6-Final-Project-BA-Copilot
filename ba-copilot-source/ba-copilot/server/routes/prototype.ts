// Prototype – xuất HTML tĩnh (kế hoạch đợt 5, mục 3 "C9"). Chủ sở hữu: C9.
// Khung do C2 tạo: trả 501 cho tới khi C9 thay (dùng shared/exportHtml.ts, trả FileResponse text/html).
// Hợp đồng: docs/api.md "Đợt 5" mục 5.7. Các route sửa màn trong app.ts đã nhận `baseRev` và tăng `screens.rev` (C2).

import { notImplemented, route } from "../http.ts";

route("GET", "/api/screens/:id/export/html", notImplemented("C9 – xuất màn hình thành HTML tĩnh"));
