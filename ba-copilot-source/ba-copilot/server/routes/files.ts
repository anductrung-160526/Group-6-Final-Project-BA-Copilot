// Kho tài liệu (FN-04 → FN-10). Hợp đồng: docs/api.md mục "Kho tài liệu". Chủ sở hữu: A4.
// Logic lưu tệp, kiểm tra và thông tin nguồn nằm ở server/files.ts; tệp vật lý ở DATA_DIR/files.

import type { ServerResponse } from "node:http";
import * as repo from "../repo.ts";
import { BizError } from "../service.ts";
import { route, FileResponse, str, actor } from "../http.ts";
import { saveBuffer, readFileFromDisk, getFileItem, listFileItems, updateFileItem, deleteFileItem, readMeta, canPreview, fold } from "../files.ts";

function mustFile(id: string) {
  const f = getFileItem(id);
  if (!f) throw new BizError("Không tìm thấy file", 404);
  return f;
}

/**
 * Trả nội dung tệp với content-disposition mong muốn.
 * app.ts luôn ghi `attachment; filename="<tên>"` – không xem trước được và lỗi với tên tiếng Việt
 * (ký tự ngoài Latin-1 không được nằm trong header). Ở đây ghi đè header ngay trong lần writeHead của
 * phản hồi này: tên ASCII cho filename=, tên gốc cho filename*=. (Yêu cầu A2 hỗ trợ sẵn: REQUESTS.md R-005.)
 */
function sendFile(res: ServerResponse, f: { name: string; mime: string }, buf: Buffer, disposition: "inline" | "attachment") {
  const ascii = fold(f.name).replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_");
  const cd = `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`;
  const writeHead = res.writeHead.bind(res) as (status: number, headers?: Record<string, string>) => ServerResponse;
  (res as any).writeHead = (status: number, headers?: Record<string, string>) =>
    writeHead(status, { ...(headers ?? {}), "content-disposition": cd, "x-content-type-options": "nosniff", "cache-control": "no-store" });
  return new FileResponse(buf, ascii, f.mime);
}

function readContent(f: { storedName: string }) {
  const buf = readFileFromDisk(f.storedName);
  if (!buf) throw new BizError("Không tìm thấy file trên đĩa", 404);
  return buf;
}

// FN-07, FN-08: danh sách (lọc module, tìm theo tên)
route("GET", "/api/projects/:id/files", ({ params, query }) => {
  if (!repo.getProject(params.id)) throw new BizError("Không tìm thấy dự án", 404);
  return listFileItems(params.id, { moduleId: query.get("moduleId") ?? undefined, q: query.get("q") ?? undefined });
});

// FN-04, FN-05: tải lên (nhiều tệp = gọi nhiều lần) kèm thông tin nguồn
route("POST", "/api/projects/:id/files", ({ params, body }) => {
  if (!repo.getProject(params.id)) throw new BizError("Không tìm thấy dự án", 404);
  if (body.moduleId) {
    const mod = repo.getModule(str(body.moduleId));
    if (!mod || mod.projectId !== params.id) throw new BizError("Module không thuộc dự án này", 400);
  }
  const b64 = typeof body.contentBase64 === "string" ? body.contentBase64.trim() : "";
  if (!b64) throw new BizError("Nội dung file (base64) không được để trống");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) throw new BizError("Nội dung file rỗng");
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
route("GET", "/api/files/:id/preview", ({ params, res }) => {
  const f = mustFile(params.id);
  if (!canPreview(f.mime)) throw new BizError("Loại tệp này không xem trước được, hãy tải về để xem", 415);
  return sendFile(res, f, readContent(f), "inline");
});

// FN-10: tải về
route("GET", "/api/files/:id/download", ({ params, res }) => {
  const f = mustFile(params.id);
  return sendFile(res, f, readContent(f), "attachment");
});

// Xoá tệp (xoá cả tệp vật lý)
route("DELETE", "/api/files/:id", ({ params }) => {
  deleteFileItem(params.id);
  return { ok: true };
});
