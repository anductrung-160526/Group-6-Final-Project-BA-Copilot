// Thành viên nhóm (FN-01 → FN-03). Hợp đồng: docs/api.md mục "Thành viên". Chủ sở hữu: A3.

import { route, notImplemented } from "../http.ts";

route("GET", "/api/members", notImplemented("FN-01"));
route("POST", "/api/members", notImplemented("FN-01"));
route("PATCH", "/api/members/:id", notImplemented("FN-01"));
route("DELETE", "/api/members/:id", notImplemented("FN-01"));
