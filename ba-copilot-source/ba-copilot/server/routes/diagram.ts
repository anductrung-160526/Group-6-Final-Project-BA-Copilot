// Sơ đồ UC của module (FN-11 → FN-14). Hợp đồng: docs/api.md mục "Sơ đồ UC". Chủ sở hữu: A5.

import { route, notImplemented } from "../http.ts";

route("GET", "/api/modules/:id/diagram", notImplemented("FN-11"));
route("POST", "/api/modules/:id/diagram/generate", notImplemented("FN-11"));
route("PUT", "/api/modules/:id/diagram", notImplemented("FN-12"));
route("POST", "/api/modules/:id/diagram/approve", notImplemented("FN-13"));
