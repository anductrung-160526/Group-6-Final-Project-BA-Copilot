// Kiểm thử tích hợp cho Kho tài liệu (upload, download, validation, chống path traversal).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { safePath, filesDir, renameKeepExt } from "../server/files.ts";

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
  assert.match(res.data.error, /Unsupported file format/);
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
  assert.match(res.data.error, /10 ?MB/);
});

test("kho tài liệu: từ chối chữ ký sai (tên .pdf nhưng nội dung không phải PDF)", async () => {
  const p = await api("POST", "/api/projects", { name: "Dự án test signature" });
  const fakePdf = Buffer.from("THIS IS NOT A VALID PDF FILE");
  const res = await api("POST", `/api/projects/${p.data.id}/files`, {
    name: "gia_mao.pdf",
    contentBase64: fakePdf.toString("base64"),
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /%PDF signature/);
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
  assert.match(res.data.error, /module does not belong to this project/);
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

test("tự lưu bản xuất Word/Excel vào kho tài liệu và thay thế bản cũ", async () => {
  // 1. Tạo dự án -> module -> màn hình -> duyệt màn hình -> sinh tài liệu -> duyệt tài liệu -> sinh test
  const p = await api("POST", "/api/projects", { name: "Dự án xuất file tự lưu" });
  assert.equal(p.status, 200);
  const pid = p.data.id;

  const m = await api("POST", `/api/projects/${pid}/modules`, {
    name: "Quản lý kho",
    requirementInput: "As a Thủ kho, I want kiểm kê hàng hóa",
  });
  assert.equal(m.status, 200);
  const mid = m.data.id;

  const s = await api("POST", `/api/modules/${mid}/screens`, {
    prompt: "Màn hình kiểm kê hàng hóa gồm bảng danh sách và nút Lưu",
    name: "Kiểm kê",
  });
  assert.equal(s.status, 200);
  const sid = s.data.screen.id;

  // Duyệt màn hình
  await api("POST", `/api/screens/${sid}/approve`, {});

  // Sinh tài liệu và duyệt tài liệu
  const docsRes = await api("POST", `/api/modules/${mid}/docs/generate`);
  assert.equal(docsRes.status, 200);
  await api("POST", `/api/modules/${mid}/docs/approve`, {});

  // Sinh test
  const testRes = await api("POST", `/api/modules/${mid}/tests/generate`);
  assert.equal(testRes.status, 200);

  // 2. Gọi export/docx -> GET /api/projects/:id/files phải có đúng 1 file source "export", moduleId đúng, tên kết thúc .docx, tải xuống ra nội dung giống file export trả về
  const docxExport1 = await api("GET", `/api/modules/${mid}/export/docx`);
  assert.equal(docxExport1.status, 200);
  assert.ok(docxExport1.data instanceof Buffer);

  const filesAfterDocx1 = await api("GET", `/api/projects/${pid}/files`);
  assert.equal(filesAfterDocx1.status, 200);
  const exportDocs1 = filesAfterDocx1.data.filter((f: any) => f.source === "export");
  assert.equal(exportDocs1.length, 1);
  assert.equal(exportDocs1[0].moduleId, mid);
  assert.ok(exportDocs1[0].name.endsWith(".docx"));

  const dlDocx1 = await api("GET", `/api/files/${exportDocs1[0].id}/download`);
  assert.equal(dlDocx1.status, 200);
  assert.equal(Buffer.compare(dlDocx1.data, docxExport1.data), 0);

  // 3. Gọi export/docx lần 2 -> vẫn đúng 1 file docx (bản cũ bị thay thế)
  const docxExport2 = await api("GET", `/api/modules/${mid}/export/docx`);
  assert.equal(docxExport2.status, 200);

  const filesAfterDocx2 = await api("GET", `/api/projects/${pid}/files`);
  assert.equal(filesAfterDocx2.status, 200);
  const exportDocs2 = filesAfterDocx2.data.filter((f: any) => f.source === "export" && f.name.endsWith(".docx"));
  assert.equal(exportDocs2.length, 1);

  // 4. Gọi export/xlsx -> có thêm 1 file .xlsx (tổng 2 file export)
  const xlsxExport = await api("GET", `/api/modules/${mid}/export/xlsx`);
  assert.equal(xlsxExport.status, 200);

  const filesAfterXlsx = await api("GET", `/api/projects/${pid}/files`);
  assert.equal(filesAfterXlsx.status, 200);
  const allExports = filesAfterXlsx.data.filter((f: any) => f.source === "export");
  assert.equal(allExports.length, 2);
  assert.ok(allExports.some((f: any) => f.name.endsWith(".xlsx")));
  assert.ok(allExports.some((f: any) => f.name.endsWith(".docx")));

  // 5. Xóa module hoặc xóa file không làm hỏng export lần sau
  // Xóa 1 file export
  const fileToDelete = allExports[0];
  const delRes = await api("DELETE", `/api/files/${fileToDelete.id}`);
  assert.equal(delRes.status, 200);

  // Xuất lại file đó -> vẫn thành công
  const docxExportAgain = await api("GET", `/api/modules/${mid}/export/docx`);
  assert.equal(docxExportAgain.status, 200);

  // Xóa module
  const delModRes = await api("DELETE", `/api/modules/${mid}`);
  assert.equal(delModRes.status, 200);

  // Tạo module mới trong cùng dự án, làm luồng và xuất tiếp
  const mNew = await api("POST", `/api/projects/${pid}/modules`, { name: "Module mới" });
  assert.equal(mNew.status, 200);
  const sNew = await api("POST", `/api/modules/${mNew.data.id}/screens`, { prompt: "Màn hình mới", name: "Màn hình 1" });
  await api("POST", `/api/screens/${sNew.data.screen.id}/approve`, {});
  await api("POST", `/api/modules/${mNew.data.id}/docs/generate`);
  const docxNew = await api("GET", `/api/modules/${mNew.data.id}/export/docx`);
  assert.equal(docxNew.status, 200);
});

// ---------------------------------------------------------------- v2 – A4 (FN-04 → FN-10)

const PDF = Buffer.from("%PDF-1.4\n% bản thử\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const DOCX = Buffer.from("PK\x03\x04noi dung word");
const XLSX = Buffer.from("PK\x03\x04noi dung excel");
const b64 = (b: Buffer) => b.toString("base64");
/** Tệp vật lý của một FileItem trong thư mục lưu (tên lưu = <id><đuôi>). */
const onDisk = (id: string) => readdirSync(tmpUploadDir).filter((n) => n.startsWith(id));

async function newProject(name: string) {
  const p = await api("POST", "/api/projects", { name });
  assert.equal(p.status, 200);
  return p.data.id as string;
}

test("A4: safePath chặn '../', đường dẫn tuyệt đối và thoát khỏi thư mục lưu", () => {
  const root = tmpUploadDir;
  assert.ok(safePath(root, "abc.pdf").startsWith(root));
  for (const bad of ["../x.pdf", "..\\x.pdf", "../../etc/passwd", "a/../../x.pdf", "/etc/passwd", ".", ".."]) {
    assert.throws(() => safePath(root, bad), /path traversal/, bad);
  }
});

test("A4: id chứa '../' trên URL không đọc được tệp ngoài kho", async () => {
  for (const id of ["..%2F..%2Fpackage.json", "..%2Fba-copilot.db", "%2E%2E%2Fpackage.json"]) {
    for (const suffix of ["/download", "/preview", ""]) {
      const r = await api("GET", `/api/files/${id}${suffix}`);
      assert.equal(r.status, 404, `${id}${suffix}`);
    }
  }
});

test("A4: tệp lưu ở DATA_DIR/files khi không đặt UPLOAD_DIR", () => {
  const saved = process.env.UPLOAD_DIR;
  const dir = mkdtempSync(join(tmpdir(), "ba-test-data-"));
  try {
    delete process.env.UPLOAD_DIR;
    process.env.DATA_DIR = dir;
    assert.equal(filesDir(), join(dir, "files"));
    assert.ok(existsSync(join(dir, "files")));
  } finally {
    process.env.UPLOAD_DIR = saved;
    delete process.env.DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("A4: chặn sai loại tệp – chỉ nhận Word, PDF, Excel, ảnh", async () => {
  const pid = await newProject("Dự án loại tệp");
  const bad = [
    { name: "ghi_chu.txt", buf: Buffer.from("text") },
    { name: "slide.pptx", buf: DOCX },
    { name: "logo.svg", buf: Buffer.from("<svg onload=alert(1)></svg>") },
    { name: "trang.html", buf: Buffer.from("<script>alert(1)</script>") },
    { name: "khong_duoi", buf: PDF },
    { name: "anh.png", buf: PDF }, // đuôi ảnh nhưng nội dung PDF
    { name: "bang.xls", buf: XLSX }, // .xls phải là OLE, không phải PK
  ];
  for (const f of bad) {
    const r = await api("POST", `/api/projects/${pid}/files`, { name: f.name, contentBase64: b64(f.buf) });
    assert.equal(r.status, 400, f.name);
  }
  const ok = [
    { name: "a.pdf", buf: PDF },
    { name: "b.png", buf: PNG },
    { name: "c.docx", buf: DOCX },
    { name: "d.xlsx", buf: XLSX },
    { name: "e.doc", buf: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
    { name: "f.JPG", buf: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]) },
  ];
  for (const f of ok) {
    const r = await api("POST", `/api/projects/${pid}/files`, { name: f.name, contentBase64: b64(f.buf) });
    assert.equal(r.status, 200, `${f.name}: ${JSON.stringify(r.data)}`);
  }
  const list = await api("GET", `/api/projects/${pid}/files`);
  assert.equal(list.data.length, ok.length);
});

test("A4: tải lên 3 tệp cùng lúc kèm thông tin nguồn (FN-04, FN-05)", async () => {
  const pid = await newProject("Dự án tải nhiều tệp");
  const m = await api("POST", `/api/projects/${pid}/modules`, { name: "Đặt hàng" });
  const src = { moduleId: m.data.id, sender: "Chị Lan – Phòng KD", receivedAt: "2026-10-18", note: "Bản yêu cầu đợt 1" };
  const results = await Promise.all(
    [
      { name: "Yêu cầu.pdf", buf: PDF },
      { name: "Mẫu đơn.docx", buf: DOCX },
      { name: "Ảnh chụp.png", buf: PNG },
    ].map((f) => api("POST", `/api/projects/${pid}/files`, { ...src, name: f.name, contentBase64: b64(f.buf), actorId: "khong-ton-tai" })),
  );
  for (const r of results) {
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.moduleId, m.data.id);
    assert.equal(r.data.sender, src.sender);
    assert.equal(r.data.receivedAt, src.receivedAt);
    assert.equal(r.data.note, src.note);
    assert.equal(r.data.uploadedBy, null); // thành viên không tồn tại → bỏ qua, không lỗi
    assert.equal(onDisk(r.data.id).length, 1);
  }
  const list = await api("GET", `/api/projects/${pid}/files`);
  assert.equal(list.data.length, 3);
  assert.deepEqual(new Set(list.data.map((f: any) => f.name)), new Set(["Yêu cầu.pdf", "Mẫu đơn.docx", "Ảnh chụp.png"]));

  const one = await api("GET", `/api/files/${results[0].data.id}`);
  assert.equal(one.status, 200);
  assert.equal(one.data.sender, src.sender);
  assert.equal(one.data.storedName, undefined);

  const badDate = await api("POST", `/api/projects/${pid}/files`, { name: "x.pdf", contentBase64: b64(PDF), receivedAt: "2026-02-30" });
  assert.equal(badDate.status, 400);
  assert.match(badDate.data.error, /received date/);
});

test("A4: xem trước PDF/ảnh inline, loại khác 415; tải về giữ tên tiếng Việt (FN-09, FN-10)", async () => {
  const pid = await newProject("Dự án xem trước");
  const pdf = await api("POST", `/api/projects/${pid}/files`, { name: "Tài liệu đặc tả.pdf", contentBase64: b64(PDF) });
  const png = await api("POST", `/api/projects/${pid}/files`, { name: "sơ đồ.png", contentBase64: b64(PNG) });
  const docx = await api("POST", `/api/projects/${pid}/files`, { name: "Biên bản.docx", contentBase64: b64(DOCX) });

  const pv = await api("GET", `/api/files/${pdf.data.id}/preview`);
  assert.equal(pv.status, 200);
  assert.equal(pv.headers.get("content-type"), "application/pdf");
  assert.match(pv.headers.get("content-disposition")!, /^inline;/);
  assert.equal(Buffer.compare(pv.data, PDF), 0);

  const pvImg = await api("GET", `/api/files/${png.data.id}/preview`);
  assert.equal(pvImg.status, 200);
  assert.equal(pvImg.headers.get("content-type"), "image/png");

  const pvDoc = await api("GET", `/api/files/${docx.data.id}/preview`);
  assert.equal(pvDoc.status, 415);

  const dl = await api("GET", `/api/files/${pdf.data.id}/download`);
  assert.equal(dl.status, 200);
  const cd = dl.headers.get("content-disposition")!;
  assert.match(cd, /^attachment;/);
  assert.match(cd, /filename="tai lieu dac ta\.pdf"/i);
  assert.ok(cd.includes(`filename*=UTF-8''${encodeURIComponent("Tài liệu đặc tả.pdf")}`));
  assert.equal(Buffer.compare(dl.data, PDF), 0);
});

test("A4: đổi tên giữ đuôi, chặn '../', sửa nguồn và chuyển module (FN-06)", async () => {
  const pid = await newProject("Dự án đổi tên");
  const other = await newProject("Dự án khác");
  const m = await api("POST", `/api/projects/${pid}/modules`, { name: "Kho" });
  const mOther = await api("POST", `/api/projects/${other}/modules`, { name: "Lạ" });
  const up = await api("POST", `/api/projects/${pid}/files`, { name: "ban_dau.pdf", contentBase64: b64(PDF) });
  const id = up.data.id;

  let r = await api("PATCH", `/api/files/${id}`, { name: "Biên bản họp.pdf" });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, "Biên bản họp.pdf");

  r = await api("PATCH", `/api/files/${id}`, { name: "Không đuôi" });
  assert.equal(r.data.name, "Không đuôi.pdf");

  r = await api("PATCH", `/api/files/${id}`, { name: "../../ra_ngoai.pdf" });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, "ra_ngoai.pdf");

  r = await api("PATCH", `/api/files/${id}`, { name: "doi_loai.docx" });
  assert.equal(r.status, 400);
  r = await api("PATCH", `/api/files/${id}`, { name: "   " });
  assert.equal(r.status, 400);

  r = await api("PATCH", `/api/files/${id}`, { moduleId: m.data.id, sender: "Anh Minh", receivedAt: "2026-10-01", note: "Đã xác nhận" });
  assert.equal(r.status, 200);
  assert.equal(r.data.moduleId, m.data.id);
  assert.equal(r.data.sender, "Anh Minh");
  assert.equal(r.data.receivedAt, "2026-10-01");
  assert.equal(r.data.name, "ra_ngoai.pdf"); // trường không gửi thì giữ nguyên

  r = await api("PATCH", `/api/files/${id}`, { moduleId: mOther.data.id });
  assert.equal(r.status, 400);
  r = await api("PATCH", `/api/files/${id}`, { moduleId: null, receivedAt: "" });
  assert.equal(r.data.moduleId, null);
  assert.equal(r.data.receivedAt, null);
  assert.equal(r.data.sender, "Anh Minh");

  // Tệp vật lý không đổi khi đổi tên, tải về vẫn đúng nội dung
  assert.equal(onDisk(id).length, 1);
  const dl = await api("GET", `/api/files/${id}/download`);
  assert.equal(Buffer.compare(dl.data, PDF), 0);

  assert.equal((await api("PATCH", `/api/files/khong-co`, { name: "a.pdf" })).status, 404);
  assert.equal(renameKeepExt("a.xlsx", "Bang v1.2"), "Bang v1.2.xlsx");
});

test("A4: xoá tệp thì xoá luôn tệp vật lý (FN-07)", async () => {
  const pid = await newProject("Dự án xoá");
  const up = await api("POST", `/api/projects/${pid}/files`, { name: "xoa.png", contentBase64: b64(PNG) });
  const id = up.data.id;
  assert.equal(onDisk(id).length, 1);
  const del = await api("DELETE", `/api/files/${id}`);
  assert.equal(del.status, 200);
  assert.equal(onDisk(id).length, 0);
  assert.equal((await api("GET", `/api/files/${id}`)).status, 404);
  assert.equal((await api("DELETE", `/api/files/${id}`)).status, 404);
});

test("A4: tìm theo tên (không phân biệt dấu) và lọc theo module (FN-08)", async () => {
  const pid = await newProject("Dự án tìm kiếm");
  const m1 = await api("POST", `/api/projects/${pid}/modules`, { name: "M1" });
  const m2 = await api("POST", `/api/projects/${pid}/modules`, { name: "M2" });
  await api("POST", `/api/projects/${pid}/files`, { name: "Tài liệu yêu cầu.pdf", contentBase64: b64(PDF), moduleId: m1.data.id });
  await api("POST", `/api/projects/${pid}/files`, { name: "Biên bản.docx", contentBase64: b64(DOCX), moduleId: m2.data.id });
  await api("POST", `/api/projects/${pid}/files`, { name: "tai lieu chung.xlsx", contentBase64: b64(XLSX) });

  const names = async (q: string) => (await api("GET", `/api/projects/${pid}/files${q}`)).data.map((f: any) => f.name).sort();
  assert.deepEqual(await names(`?q=${encodeURIComponent("tai lieu")}`), ["Tài liệu yêu cầu.pdf", "tai lieu chung.xlsx"].sort());
  assert.deepEqual(await names(`?q=${encodeURIComponent("BIÊN")}`), ["Biên bản.docx"]);
  assert.deepEqual(await names(`?moduleId=${m1.data.id}`), ["Tài liệu yêu cầu.pdf"]);
  assert.deepEqual(await names(`?moduleId=${m2.data.id}&q=tai`), []);
  assert.equal((await names("")).length, 3);
});

