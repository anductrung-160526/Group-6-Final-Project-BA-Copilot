// Kho tài liệu (FN-04 → FN-10). Hợp đồng: docs/api.md mục "Kho tài liệu". Chủ sở hữu: A4.
// Các route đã chạy được (từ nhánh htrung-c4) chuyển nguyên từ app.ts sang đây; endpoint mới là stub 501.

import * as repo from "../repo.ts";
import { BizError } from "../service.ts";
import { route, notImplemented, FileResponse, str } from "../http.ts";
import { saveBuffer, readFileFromDisk, removeFileFromDisk } from "../files.ts";

route("GET", "/api/projects/:id/files", ({ params }) => {
  if (!repo.getProject(params.id)) throw new BizError("Không tìm thấy dự án", 404);
  return repo.listFiles(params.id);
});
route("POST", "/api/projects/:id/files", ({ params, body }) => {
  if (!repo.getProject(params.id)) throw new BizError("Không tìm thấy dự án", 404);
  if (body.moduleId) {
    const mod = repo.getModule(str(body.moduleId));
    if (!mod || mod.projectId !== params.id) throw new BizError("Module không thuộc dự án này", 400);
  }
  const b64 = typeof body.contentBase64 === "string" ? body.contentBase64.trim() : "";
  if (!b64) throw new BizError("Nội dung file (base64) không được để trống");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new BizError("Nội dung base64 không hợp lệ");
  }
  if (!buf.length) throw new BizError("Nội dung file rỗng");
  return saveBuffer(params.id, body.moduleId ? str(body.moduleId) : null, str(body.name), buf, "upload");
});
route("GET", "/api/files/:id/download", ({ params }) => {
  const f = repo.getFile(params.id);
  if (!f) throw new BizError("Không tìm thấy file", 404);
  const buf = readFileFromDisk(f.storedName);
  if (!buf) throw new BizError("Không tìm thấy file trên đĩa", 404);
  return new FileResponse(buf, f.name, f.mime);
});
route("DELETE", "/api/files/:id", ({ params }) => {
  const f = repo.getFile(params.id);
  if (!f) throw new BizError("Không tìm thấy file", 404);
  removeFileFromDisk(f.storedName);
  repo.deleteFileRow(params.id);
  return { ok: true };
});

route("GET", "/api/files/:id", notImplemented("FN-09"));
route("PATCH", "/api/files/:id", notImplemented("FN-06"));
route("GET", "/api/files/:id/preview", notImplemented("FN-09"));
