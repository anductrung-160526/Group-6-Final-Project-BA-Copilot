// Gợi ý màn tiếp theo (FN-57 → FN-61). Hợp đồng: docs/api.md mục "Gợi ý màn tiếp theo". Chủ sở hữu: A9.

import { route, notImplemented } from "../http.ts";

route("GET", "/api/modules/:id/suggestions", notImplemented("FN-57"));
route("POST", "/api/modules/:id/suggestions/:key/dismiss", notImplemented("FN-61"));
route("DELETE", "/api/modules/:id/suggestions/:key/dismiss", notImplemented("FN-61"));
