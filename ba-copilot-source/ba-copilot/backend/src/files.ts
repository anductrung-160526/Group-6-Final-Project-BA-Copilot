// Kho tài liệu (FN-04 → FN-10): lưu tệp trên đĩa (DATA_DIR/files), kiểm tra loại/kích thước,
// đọc/ghi thông tin nguồn (sender, received_at, note, uploaded_by). Chủ sở hữu: A4.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { BizError } from "./service.ts";
import { getDb, tx } from "./db.ts";
import * as repo from "./repo.ts";
import type { FileItem } from "../../shared/types.ts";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (body upload base64 ~13,4 MB < 15 MB của readBody)

/** Loại tệp cho phép: Word, PDF, Excel, ảnh. */
export const EXT_TO_MIME: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
export const ALLOWED_EXTS = Object.keys(EXT_TO_MIME);

/** Xem trước được trong trình duyệt (FN-09): PDF và ảnh. */
export const canPreview = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

/** Thư mục dữ liệu: DATA_DIR, mặc định là thư mục chứa DB. Đọc env mỗi lần gọi để test đổi được. */
export function dataDir(): string {
  return process.env.DATA_DIR ?? dirname(process.env.DB_FILE ?? "data/ba-copilot.db");
}

/** Thư mục lưu tệp: DATA_DIR/files (UPLOAD_DIR ghi đè, dùng cho test). */
export function filesDir(): string {
  const dir = process.env.UPLOAD_DIR ?? join(dataDir(), "files");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Thư mục cũ của nhánh htrung-c4 (DATA_DIR/uploads): chỉ đọc/xoá, không ghi mới. */
function legacyDir(): string | null {
  return process.env.UPLOAD_DIR ? null : join(dataDir(), "uploads");
}

/** Làm sạch tên file, loại bỏ đường dẫn, dấu nháy và ký tự điều khiển. */
export function cleanName(name: string): string {
  if (typeof name !== "string") throw new BizError("Invalid file name");
  let s = name.replace(/^.*[/\\]/, "").replace(/[/\\]/g, "");
  s = s.replace(/["']/g, "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (s === "." || s === "..") throw new BizError("Invalid file name");
  s = s.slice(0, 150).trim();
  if (!s) throw new BizError("File name is required");
  return s;
}

/** Kiểm tra chữ ký (magic bytes) của file theo đuôi. */
export function checkSignature(ext: string, buf: Buffer): boolean {
  const e = ext.toLowerCase();
  const fail = (what: string) => {
    throw new BizError(`File content does not match the ${ext} format (missing ${what} signature)`);
  };
  if (e === ".docx" || e === ".xlsx") {
    if (buf.length < 2 || buf[0] !== 0x50 || buf[1] !== 0x4b) fail("PK");
  } else if (e === ".doc" || e === ".xls") {
    if (buf.length < 4 || buf[0] !== 0xd0 || buf[1] !== 0xcf || buf[2] !== 0x11 || buf[3] !== 0xe0) fail("OLE");
  } else if (e === ".pdf") {
    if (buf.length < 4 || buf.toString("ascii", 0, 4) !== "%PDF") fail("%PDF");
  } else if (e === ".png") {
    if (buf.length < 4 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) fail("PNG");
  } else if (e === ".jpg" || e === ".jpeg") {
    if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) fail("JFIF");
  } else if (e === ".gif") {
    if (buf.length < 4 || buf.toString("ascii", 0, 4) !== "GIF8") fail("GIF");
  } else if (e === ".webp") {
    if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") fail("WEBP");
  }
  return true;
}

/** Ghép và kiểm tra đường dẫn nằm trong `root` (chống path traversal). */
export function safePath(root: string, storedName: string): string {
  const base = resolve(root);
  const target = resolve(base, storedName);
  if (!target.startsWith(base + sep)) throw new BizError("Invalid file path (path traversal)");
  return target;
}

export function saveFileToDisk(id: string, ext: string, buf: Buffer): string {
  const storedName = `${id}${ext}`;
  writeFileSync(safePath(filesDir(), storedName), buf);
  return storedName;
}

/** Đường dẫn thật của tệp đã lưu (thư mục mới trước, thư mục cũ sau); null nếu không còn trên đĩa. */
function locate(storedName: string): string | null {
  for (const root of [filesDir(), legacyDir()]) {
    if (!root) continue;
    const p = safePath(root, storedName);
    if (existsSync(p)) return p;
  }
  return null;
}

export function readFileFromDisk(storedName: string): Buffer | null {
  const p = locate(storedName);
  return p ? readFileSync(p) : null;
}

export function removeFileFromDisk(storedName: string): void {
  const p = locate(storedName);
  if (!p) return;
  try {
    unlinkSync(p);
  } catch {
    // bỏ qua lỗi nếu không xóa được
  }
}

// ---------------------------------------------------------------- Thông tin nguồn (FN-05)

export interface FileMeta {
  sender?: string;
  receivedAt?: string | null;
  note?: string;
  uploadedBy?: string | null;
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Ngày thuần YYYY-MM-DD; rỗng → null. */
export function cleanDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw new BizError("Invalid received date (format YYYY-MM-DD)");
  }
  return s;
}

/** Đọc thông tin nguồn từ body; chỉ trả các trường có mặt. */
export function readMeta(body: any): FileMeta {
  const m: FileMeta = {};
  if (has(body, "sender")) m.sender = typeof body.sender === "string" ? body.sender.trim().slice(0, 200) : "";
  if (has(body, "receivedAt")) m.receivedAt = cleanDate(body.receivedAt);
  if (has(body, "note")) m.note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  return m;
}

/** Thành viên không tồn tại (A3 chưa có, hoặc đã xoá) thì bỏ qua, không lỗi. */
function memberOrNull(id: string | null | undefined): string | null {
  if (!id) return null;
  return getDb().prepare("SELECT id FROM members WHERE id = ?").get(id) ? id : null;
}

function writeMeta(id: string, m: FileMeta) {
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  const set = (col: string, v: string | null) => (sets.push(`${col} = ?`), vals.push(v));
  if (m.sender !== undefined) set("sender", m.sender);
  if (m.receivedAt !== undefined) set("received_at", m.receivedAt);
  if (m.note !== undefined) set("note", m.note);
  if (m.uploadedBy !== undefined) set("uploaded_by", memberOrNull(m.uploadedBy));
  if (sets.length) getDb().prepare(`UPDATE files SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
}

// ---------------------------------------------------------------- Đọc

type Row = Record<string, any>;
const toItem = (r: Row): FileItem => ({
  id: r.id,
  projectId: r.project_id,
  moduleId: r.module_id ?? null,
  name: r.name,
  mime: r.mime,
  size: Number(r.size),
  source: r.source,
  createdAt: r.created_at,
  sender: r.sender ?? "",
  receivedAt: r.received_at ?? null,
  note: r.note ?? "",
  uploadedBy: r.uploaded_by ?? null,
});

/** Bỏ dấu, chữ thường – để tìm "tai lieu" ra "Tài liệu". */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase(); // vi-keep: bỏ dấu tiếng Việt khi tìm kiếm

export function getFileItem(id: string): (FileItem & { storedName: string }) | null {
  const r = getDb().prepare("SELECT * FROM files WHERE id = ?").get(id) as Row | undefined;
  return r ? { ...toItem(r), storedName: r.stored_name } : null;
}

/** Danh sách tệp của dự án, mới nhất trước; lọc theo module và tìm theo tên không phân biệt dấu (FN-08). */
export function listFileItems(projectId: string, q: { moduleId?: string; q?: string } = {}): FileItem[] {
  const rows = getDb().prepare("SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC, rowid DESC").all(projectId) as Row[];
  const needle = fold((q.q ?? "").trim());
  return rows
    .map(toItem)
    .filter((f) => !q.moduleId || f.moduleId === q.moduleId)
    .filter((f) => !needle || fold(f.name).includes(needle));
}

// ---------------------------------------------------------------- Ghi

/** Lưu buffer vào đĩa và ghi DB (dùng chung cho upload và export). */
export function saveBuffer(
  projectId: string,
  moduleId: string | null,
  name: string,
  buf: Buffer,
  source: "upload" | "export",
  meta: FileMeta = {},
): FileItem {
  const cName = cleanName(name);
  const ext = extname(cName).toLowerCase();
  if (!EXT_TO_MIME[ext]) {
    throw new BizError(`Unsupported file format: ${ext || "(no extension)"}. Only Word, PDF, Excel and images are accepted (${ALLOWED_EXTS.join(", ")})`);
  }
  if (!buf || buf.length === 0) throw new BizError("The file is empty");
  if (buf.length > MAX_FILE_BYTES) throw new BizError("The file exceeds the 10 MB size limit", 413);
  checkSignature(ext, buf);

  const id = randomUUID();
  const storedName = saveFileToDisk(id, ext, buf);
  try {
    tx(() => {
      repo.createFile({ id, projectId, moduleId, name: cName, storedName, mime: EXT_TO_MIME[ext], size: buf.length, source, createdAt: new Date().toISOString() });
      writeMeta(id, meta);
    });
  } catch (e) {
    removeFileFromDisk(storedName);
    throw e;
  }
  return getFileItem(id)!;
}

/** Đổi tên giữ nguyên đuôi: thiếu đuôi thì tự thêm; đổi sang đuôi được hỗ trợ khác thì báo lỗi. */
export function renameKeepExt(oldName: string, newName: string): string {
  const oldExt = extname(oldName).toLowerCase();
  const n = cleanName(newName);
  const ext = extname(n).toLowerCase();
  if (ext === oldExt) return n;
  if (EXT_TO_MIME[ext]) throw new BizError(`The file extension cannot be changed (${oldExt} → ${ext})`);
  return cleanName(n + oldExt);
}

/** FN-06: đổi tên, chuyển module, sửa thông tin nguồn. */
export function updateFileItem(id: string, body: any): FileItem {
  const f = getFileItem(id);
  if (!f) throw new BizError("File not found", 404);
  const meta = readMeta(body);
  tx(() => {
    if (has(body, "name")) {
      getDb().prepare("UPDATE files SET name = ? WHERE id = ?").run(renameKeepExt(f.name, String(body.name ?? "")), id);
    }
    if (has(body, "moduleId")) {
      const mid = body.moduleId ? String(body.moduleId) : null;
      if (mid) {
        const mod = repo.getModule(mid);
        if (!mod || mod.projectId !== f.projectId) throw new BizError("The module does not belong to this project", 400);
      }
      getDb().prepare("UPDATE files SET module_id = ? WHERE id = ?").run(mid, id);
    }
    writeMeta(id, meta);
  });
  return getFileItem(id)!;
}

/** Xoá dòng DB và tệp vật lý. */
export function deleteFileItem(id: string): void {
  const f = getFileItem(id);
  if (!f) throw new BizError("File not found", 404);
  repo.deleteFileRow(id);
  removeFileFromDisk(f.storedName);
}

/**
 * Tự động lưu bản xuất Word/Excel vào Kho tài liệu.
 * Quy ước: mỗi module chỉ giữ bản xuất MỚI NHẤT cho mỗi loại file.
 * Nếu đã có bản export cùng (project, module, tên file) thì xóa bản cũ (dòng DB + file trên đĩa) rồi lưu bản mới.
 * Bọc toàn bộ trong try/catch: nếu lưu vào kho thất bại thì console.error rồi bỏ qua,
 * TUYỆT ĐỐI không làm hỏng việc tải file về của người dùng.
 */
export function saveExport(projectId: string, moduleId: string, name: string, buf: Buffer, _mime?: string): FileItem | null {
  try {
    const cName = cleanName(name);
    const old = repo.findExportFile(projectId, moduleId, cName);
    if (old) {
      removeFileFromDisk(old.storedName);
      repo.deleteFileRow(old.id);
    }
    return saveBuffer(projectId, moduleId, cName, buf, "export");
  } catch (err) {
    console.error("Failed to auto-save the exported file to the document repository:", err);
    return null;
  }
}
