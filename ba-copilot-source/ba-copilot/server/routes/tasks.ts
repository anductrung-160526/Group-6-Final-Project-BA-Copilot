// Công việc Kanban (FN-15 → FN-19). Hợp đồng: docs/api.md mục "Công việc". Chủ sở hữu: A6.

import { route, notImplemented } from "../http.ts";

route("GET", "/api/projects/:id/tasks", notImplemented("FN-17"));
route("POST", "/api/projects/:id/tasks", notImplemented("FN-15"));
route("GET", "/api/projects/:id/artifacts", notImplemented("FN-16"));
route("GET", "/api/tasks/:id", notImplemented("FN-15"));
route("PATCH", "/api/tasks/:id", notImplemented("FN-15"));
route("DELETE", "/api/tasks/:id", notImplemented("FN-15"));
route("PATCH", "/api/tasks/:id/status", notImplemented("FN-18"));
route("GET", "/api/artifacts/:kind/:id/tasks", notImplemented("FN-19"));
