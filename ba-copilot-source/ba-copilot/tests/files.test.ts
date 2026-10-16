// Kiểm thử tích hợp cho Kho tài liệu (upload, download, validation, chống path traversal).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";

let server: Server;
let base = "";
let tmpUploadDir = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, data: data as any };
}

before(async () => {
  tmpUploadDir = mkdtempSync(join(tmpdir(), "ba-test-uploads-"));
  process.env.UPLOAD_DIR = tmpUploadDir;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  if (tmpUploadDir && existsSync(tmpUploadDir)) {
    try {
      rmSync(tmpUploadDir, { recursive: true, force: true });
    } catch {}
  }
  delete process.env.UPLOAD_DIR;
});

test("kho tài liệu: upload docx hợp lệ -> liệt kê -> tải xuống -> xóa -> 404", async () => {
  // 1. Tạo dự án
  const p = await api("POST", "/api/projects", { name: "Dự án test kho tài liệu" });
  assert.equal(p.status, 200);
  const projectId = p.data.id;

  // 2. Upload file docx hợp lệ (chữ ký PK)
  const fakeDocxContent = Buffer.from("PK\x03\x04Hello Word Document");
  const uploadRes = await api("POST", `/api/projects/${projectId}/files`, {
    name: "Tai_Lieu_SRS.docx",
    contentBase64: fakeDocxContent.toString("base64"),
  });
  assert.equal(uploadRes.status, 200, JSON.stringify(uploadRes.data));
  assert.equal(uploadRes.data.name, "Tai_Lieu_SRS.docx");
  assert.equal(uploadRes.data.mime, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(uploadRes.data.size, fakeDocxContent.length);
  assert.equal(uploadRes.data.source, "upload");
  const fileId = uploadRes.data.id;

  // 3. Liệt kê danh sách file của dự án
  const listRes = await api("GET", `/api/projects/${projectId}/files`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.data.length, 1);
  assert.equal(listRes.data[0].id, fileId);

  // 4. Tải xuống đúng nội dung
  const dlRes = await api("GET", `/api/files/${fileId}/download`);
  assert.equal(dlRes.status, 200);
  assert.equal(Buffer.compare(dlRes.data, fakeDocxContent), 0);

  // 5. Xóa file
  const delRes = await api("DELETE", `/api/files/${fileId}`);
  assert.equal(delRes.status, 200);

  // 6. Tải lại ra 404
  const dlAgain = await api("GET", `/api/files/${fileId}/download`);
  assert.equal(dlAgain.status, 404);

  // Danh sách cũng rỗng
  const listEmpty = await api("GET", `/api/projects/${projectId}/files`);
  assert.equal(listEmpty.data.length, 0);
});

test("kho tài liệu: từ chối đuôi không cho phép (.exe)", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án test đuôi exe" });
  const fakeExe = Buffer.from("MZ\x90\x00malicious-program");
  const res = await api("POST", `/api/projects/${p.data.id}/files`, {
    name: "tool.exe",
    contentBase64: fakeExe.toString("base64"),
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /không được hỗ trợ/);
});

test("kho tài liệu: từ chối file vượt quá 10MB", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án test size lớn" });
  const bigBuf = Buffer.alloc(10 * 1024 * 1024 + 10);
  bigBuf[0] = 0x50; // 'P'
  bigBuf[1] = 0x4b; // 'K'
  const res = await api("POST", `/api/projects/${p.data.id}/files`, {
    name: "giant.docx",
    contentBase64: bigBuf.toString("base64"),
  });
  assert.ok(res.status === 400 || res.status === 413, `Status was ${res.status}`);
  assert.match(res.data.error, /10MB|quá lớn/);
});

test("kho tài liệu: từ chối chữ ký sai (tên .pdf nhưng nội dung không phải PDF)", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án test signature" });
  const fakePdf = Buffer.from("THIS IS NOT A VALID PDF FILE");
  const res = await api("POST", `/api/projects/${p.data.id}/files`, {
    name: "gia_mao.pdf",
    contentBase64: fakePdf.toString("base64"),
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /chữ ký %PDF/);
});

test("kho tài liệu: từ chối moduleId của dự án khác", async () => {
  const p1 = await api("POST", "/api/projects", { name: "Dự án 1" });
  const p2 = await api("POST", "/api/projects", { name: "Dự án 2" });
  const m2 = await api("POST", `/api/projects/${p2.data.id}/modules`, { name: "Module của D2" });

  const fakePdf = Buffer.from("%PDF-1.4\nvalid pdf content");
  const res = await api("POST", `/api/projects/${p1.data.id}/files`, {
    name: "tai_lieu.pdf",
    moduleId: m2.data.id,
    contentBase64: fakePdf.toString("base64"),
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /Module không thuộc dự án/);
});

test("kho tài liệu: tên file chứa '../' bị làm sạch và không ghi ra ngoài uploadDir", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án test path traversal" });
  const fakeDocx = Buffer.from("PK\x03\x04safe content");
  const res = await api("POST", `/api/projects/${p.data.id}/files`, {
    name: "../../../etc/passwd.docx",
    contentBase64: fakeDocx.toString("base64"),
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.name, "passwd.docx");
  assert.ok(!res.data.name.includes("/"));
  assert.ok(!res.data.name.includes("\\"));
  assert.ok(!res.data.name.includes(".."));

  const dl = await api("GET", `/api/files/${res.data.id}/download`);
  assert.equal(dl.status, 200);
  assert.equal(Buffer.compare(dl.data, fakeDocx), 0);
});
