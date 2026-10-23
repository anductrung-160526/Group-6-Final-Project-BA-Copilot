// Kho tài liệu (FN-04 → FN-10). Hợp đồng: docs/api.md mục "Kho tài liệu". Chủ sở hữu: A4.
// Logic lưu tệp, kiểm tra và thông tin nguồn nằm ở server/files.ts; tệp vật lý ở DATA_DIR/files.

import * as repo from "../repo.ts";
import { BizError } from "../service.ts";
import { route, FileResponse, str, actor } from "../http.ts";
import { saveBuffer, readFileFromDisk, getFileItem, listFileItems, updateFileItem, deleteFileItem, readMeta, canPreview } from "../files.ts";

function mustFile(id: string) {
  const f = getFileItem(id);
  if (!f) throw new BizError("File not found", 404);
  return f;
}

function readContent(f: { storedName: string }) {
  const buf = readFileFromDisk(f.storedName);
  if (!buf) throw new BizError("File not found on disk", 404);
  return buf;
}

// FN-07, FN-08: danh sách (lọc module, tìm theo tên)
route("GET", "/api/projects/:id/files", ({ params, query }) => {
  if (!repo.getProject(params.id)) throw new BizError("Project not found", 404);
  return listFileItems(params.id, { moduleId: query.get("moduleId") ?? undefined, q: query.get("q") ?? undefined });
});

// FN-04, FN-05: tải lên (nhiều tệp = gọi nhiều lần) kèm thông tin nguồn
route("POST", "/api/projects/:id/files", ({ params, body }) => {
  if (!repo.getProject(params.id)) throw new BizError("Project not found", 404);
  if (body.moduleId) {
    const mod = repo.getModule(str(body.moduleId));
    if (!mod || mod.projectId !== params.id) throw new BizError("The module does not belong to this project", 400);
  }
  const b64 = typeof body.contentBase64 === "string" ? body.contentBase64.trim() : "";
  if (!b64) throw new BizError("File content (base64) is required");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) throw new BizError("The file is empty");
  const meta = { ...readMeta(body), uploadedBy: actor(body) ?? null };
  return saveBuffer(params.id, body.moduleId ? str(body.moduleId) : null, str(body.name), buf, "upload", meta);
});

// FN-09: thông tin tệp
route("GET", "/api/files/:id", ({ params }) => {
  const { storedName: _, ...f } = mustFile(params.id);
  return f;
});

// FN-06: đổi tên, chuyển module, sửa thông tin nguồn
route("PATCH", "/api/files/:id", ({ params, body }) => updateFileItem(params.id, body));

// FN-09: xem trước PDF và ảnh
route("GET", "/api/files/:id/preview", ({ params }) => {
  const f = mustFile(params.id);
  if (!canPreview(f.mime)) throw new BizError("This file type cannot be previewed – download it to view", 415);
  return new FileResponse(readContent(f), f.name, f.mime, "inline");
});

// FN-10: tải về
route("GET", "/api/files/:id/download", ({ params }) => {
  const f = mustFile(params.id);
  return new FileResponse(readContent(f), f.name, f.mime, "attachment");
});

// Xoá tệp (xoá cả tệp vật lý)
route("DELETE", "/api/files/:id", ({ params }) => {
  deleteFileItem(params.id);
  return { ok: true };
});
