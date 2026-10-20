// Dữ liệu demo BA Copilot v2 (A10): 5 thành viên, 1 dự án, 2 module, story tốt + story lỗi (QUS),
// 3 màn đã duyệt + 1 màn nháp có link gãy (gợi ý màn), 4 tệp trong kho, 1 sơ đồ UC, 8 task đủ 4 cột.
// Dùng: npm run seed
//
// Chạy lại được nhiều lần: dữ liệu demo dùng mã cố định (DEMO); lần chạy sau xoá dự án demo cũ (kèm tệp trên đĩa)
// rồi tạo lại, thành viên demo được ghi đè theo mã. Không đụng tới dự án, thành viên khác trong DB.
//
// Mặc định sinh màn bằng chế độ Mock để dữ liệu demo luôn giống nhau (link gãy, điểm QUS cố định).
// Muốn dùng Claude (cần ANTHROPIC_API_KEY): SEED_AI=claude npm run seed
//
// Bảng thành viên, task, sơ đồ UC được ghi thẳng theo docs/erd.md (không qua route), nên seed không phụ thuộc thứ tự gộp đợt 2.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { getDb, openDb, tx } from "../server/db.ts";
import * as repo from "../server/repo.ts";
import * as svc from "../server/service.ts";
import { removeFileFromDisk, saveBuffer } from "../server/files.ts";
import { qusRating, RATING_LABEL, scoreStories, splitStories } from "../shared/qus.ts";
import { suggestNextScreens } from "../shared/suggest.ts";
import { extractModel } from "../shared/extract.ts";
import type { UseCase } from "../shared/types.ts";

const root = join(import.meta.dirname, "..");
const envFile = join(root, ".env");
if (existsSync(envFile))
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
if (process.env.SEED_AI?.trim().toLowerCase() !== "claude") process.env.AI_MODE = "mock";
openDb(process.env.DB_FILE ?? join(root, "data", "ba-copilot.db"));
const db = getDb();

// ------------------------------------------------------------- Mã cố định của dữ liệu demo
const DEMO = {
  project: "demo-shop",
  projectName: "Cửa hàng điện tử (mẫu)",
  products: "demo-mod-products",
  orders: "demo-mod-orders",
};
const MEMBERS = [
  { id: "demo-mem-lan", name: "Nguyễn Thị Lan", role: "BA_LEAD" },
  { id: "demo-mem-duc", name: "Trần Minh Đức", role: "BA" },
  { id: "demo-mem-anh", name: "Lê Hoàng Anh", role: "BA" },
  { id: "demo-mem-ha", name: "Phạm Thu Hà", role: "BA" },
  { id: "demo-mem-huy", name: "Vũ Quang Huy", role: "BA" },
] as const;
type MemberKey = "lan" | "duc" | "anh" | "ha" | "huy";
const mem = (k: MemberKey) => MEMBERS.find((m) => m.id === `demo-mem-${k}`)!;

const iso = (d: Date) => d.toISOString();
const ago = (days: number, hours = 0) => iso(new Date(Date.now() - (days * 24 + hours) * 3600_000));
const dayOffset = (days: number) => iso(new Date(Date.now() + days * 24 * 3600_000)).slice(0, 10);

// ------------------------------------------------------------- 1. Dọn dữ liệu demo cũ
// Gồm dự án demo theo mã cố định và dự án mẫu do seed bản cũ tạo (cùng tên, mã ngẫu nhiên).
function cleanup(): number {
  const old = db.prepare("SELECT id FROM projects WHERE id = ? OR name = ?").all(DEMO.project, DEMO.projectName) as { id: string }[];
  for (const { id } of old) {
    const files = db.prepare("SELECT stored_name FROM files WHERE project_id = ?").all(id) as { stored_name: string }[];
    for (const f of files) removeFileFromDisk(f.stored_name);
    tx(() => {
      // prompt_runs và suggestion_events chỉ tham chiếu logic (không có khoá ngoại) nên xoá tay
      db.prepare("DELETE FROM prompt_runs WHERE module_id IN (SELECT id FROM modules WHERE project_id = ?)").run(id);
      db.prepare("DELETE FROM suggestion_events WHERE screen_id IN (SELECT s.id FROM screens s JOIN modules m ON m.id = s.module_id WHERE m.project_id = ?)").run(id);
      repo.deleteProject(id); // CASCADE: module, màn, tài liệu, test, tệp, sơ đồ, task, lịch sử task, gợi ý đã bỏ qua
    });
  }
  return old.length;
}
const removed = cleanup();
if (removed) console.log(`Đã xoá ${removed} dự án demo cũ.`);

// ------------------------------------------------------------- 2. Thành viên (FN-01)
tx(() => {
  const st = db.prepare(
    `INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role`,
  );
  MEMBERS.forEach((m, i) => st.run(m.id, m.name, m.role, ago(30 - i)));
});
console.log(`Thành viên: ${MEMBERS.map((m) => `${m.name}${m.role === "BA_LEAD" ? " (BA Lead)" : ""}`).join(", ")}`);

// ------------------------------------------------------------- 3. Dự án và 2 module
// Module Sản phẩm: story viết tốt (điểm QUS cao). Module Đơn hàng: trộn story tốt và story lỗi để demo QUS.
const PRODUCT_STORIES = `- Là quản trị viên, tôi muốn tìm kiếm sản phẩm theo tên để kiểm tra tồn kho trước khi nhập hàng.
- Là quản trị viên, tôi muốn lọc sản phẩm theo danh mục để rà soát giá bán của từng nhóm hàng.
- Là quản trị viên, tôi muốn thêm sản phẩm mới với tên, mã SKU, giá bán để mở bán sản phẩm trên website.
- Là quản trị viên, tôi muốn sắp xếp danh mục sản phẩm để khách hàng tìm đúng nhóm hàng.
- Là quản trị viên, tôi muốn đăng nhập bằng email để bảo vệ dữ liệu cửa hàng.`;
const ORDER_STORIES = `- Là nhân viên bán hàng, tôi muốn xem danh sách đơn hàng theo trạng thái để xử lý đơn mới trong ngày.
- Là nhân viên bán hàng, tôi muốn tạo đơn hàng và in hóa đơn cho khách.
- Hệ thống phải xử lý đơn hàng nhanh và thân thiện với người dùng.
- Hủy đơn.
- Là nhân viên bán hàng, tôi muốn xem danh sách các đơn hàng theo trạng thái để xử lý đơn mới trong ngày.
- Là kế toán, tôi muốn xuất danh sách đơn hàng ra Excel (ví dụ: theo tháng, theo kênh bán) để đối soát doanh thu.`;

tx(() => {
  db.prepare("INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)").run(
    DEMO.project,
    DEMO.projectName,
    "Dự án mẫu cho buổi demo: website bán hàng điện tử – quản lý sản phẩm và đơn hàng.",
    ago(14),
  );
  const st = db.prepare("INSERT INTO modules (id, project_id, name, requirement_input, created_at) VALUES (?, ?, ?, ?, ?)");
  st.run(DEMO.products, DEMO.project, "Quản lý sản phẩm", PRODUCT_STORIES, ago(14));
  st.run(DEMO.orders, DEMO.project, "Quản lý đơn hàng", ORDER_STORIES, ago(13));
});

// ------------------------------------------------------------- 4. Màn hình: 3 đã duyệt + 1 nháp có link gãy
async function screen(name: string, prompt: string, author: MemberKey, approvedBy?: MemberKey) {
  console.log(`Sinh màn hình: ${name}`);
  const a = mem(author);
  const r = await svc.createScreenFromPrompt(DEMO.products, prompt, name, a.id);
  // FN-03: ghi tên người tạo vào phiên bản (seed ghi thẳng, không chờ route của A3)
  db.prepare("UPDATE screen_versions SET author = ?, author_id = ? WHERE screen_id = ?").run(a.name, a.id, r.screen!.id);
  if (approvedBy) svc.setScreenApproval(r.screen!.id, true, mem(approvedBy).id);
  return { id: r.screen!.id, versionId: r.version.id };
}
// Ba màn đã duyệt không có nút trỏ tới màn chưa tồn tại → không sinh gợi ý link gãy.
const scrList = await screen(
  "Quản lý sản phẩm",
  "Quản lý sản phẩm: tìm kiếm theo tên, lọc theo danh mục, trạng thái, bảng danh sách có cột Mã, Tên sản phẩm, Giá bán, Tồn kho, Trạng thái, thao tác xem/sửa/xóa, nút Thêm mới, phân trang.",
  "duc",
  "lan",
);
await screen(
  "Thêm sản phẩm",
  "Form thêm sản phẩm: tên sản phẩm (bắt buộc, tối đa 100 ký tự), mã SKU, danh mục, giá bán, tồn kho, mô tả; nút Lưu và Hủy.",
  "duc",
  "lan",
);
await screen(
  "Quản lý danh mục",
  "Quản lý danh mục: tìm kiếm theo tên, bảng danh sách có cột Mã, Tên danh mục, Số sản phẩm, Trạng thái, thao tác sửa/xóa, nút Thêm mới.",
  "anh",
  "lan",
);

// ------------------------------------------------------------- 5. Tài liệu (UC/SRS/Sequence) và test case
console.log("Sinh tài liệu…");
await svc.generateDocs(DEMO.products, mem("anh").id);
svc.approveDocs(DEMO.products, true, mem("lan").id);
console.log("Sinh test case…");
await svc.generateTests(DEMO.products, mem("duc").id);
// Tài liệu được chỉnh lại và duyệt sau khi sinh test → test Lỗi thời (BR-02), khớp task "Cần làm lại" bên dưới
repo.updateModule(DEMO.products, { testsStatus: "outdated" });

// Màn nháp tạo sau khi duyệt tài liệu (tạo màn mới không làm tài liệu lỗi thời).
// Link "Quên mật khẩu?" trỏ tới màn chưa có → gợi ý link gãy (FN-57).
const scrLogin = await screen(
  "Đăng nhập",
  "Màn hình đăng nhập quản trị bằng email và mật khẩu, có ghi nhớ đăng nhập, nút Đăng nhập và link Quên mật khẩu?",
  "ha",
);
const loginTree = repo.getVersion(scrLogin.versionId)!.tree;
const forgotLink = JSON.stringify(loginTree).match(/"id":"([^"]+)","type":"Link"/)?.[1];
if (forgotLink) {
  const ann = repo.createAnnotation({
    screenId: scrLogin.id,
    versionId: scrLogin.versionId,
    nodeIds: [forgotLink],
    bbox: null,
    comment: "Link này chưa có màn đích. Em làm thêm màn Quên mật khẩu nhé.",
    author: mem("lan").name,
  });
  db.prepare("UPDATE annotations SET author_id = ? WHERE id = ?").run(mem("lan").id, ann.id);
}

// ------------------------------------------------------------- 6. Sơ đồ UC (FN-11), đã duyệt
// Sau khi gộp A5 thì dùng buildUcMermaid (có dòng mã băm nguồn UC cho FN-14); trước đó dùng bản vẽ tối giản cùng quy ước.
type UcBuilder = (ucs: UseCase[]) => string;
async function ucBuilder(): Promise<UcBuilder> {
  const path = "../shared/ucDiagram.ts"; // để trong biến: tsc không đòi tệp khi chưa gộp A5
  try {
    const mod = (await import(path)) as { buildUcMermaid: UcBuilder };
    return (ucs) => mod.buildUcMermaid(ucs);
  } catch {
    return (ucs) => {
      const label = (s: string) => s.replace(/["`<>]/g, "'").replace(/\s+/g, " ").trim();
      const actors = [...new Set(ucs.flatMap((u) => u.actors).filter((a) => !/^hệ thống$/i.test(a)))];
      return [
        "flowchart LR",
        ...actors.map((a, i) => `  A${i + 1}(("${label(a)}"))`),
        `  subgraph SYS["Hệ thống"]`,
        "    direction TB",
        ...ucs.map((u, i) => `    UC${i + 1}(["${label(`${u.code}: ${u.name}`)}"])`),
        "  end",
        ...ucs.flatMap((u, i) => u.actors.filter((a) => actors.includes(a)).map((a) => `  A${actors.indexOf(a) + 1} --- UC${i + 1}`)),
      ].join("\n");
    };
  }
}
const diagramCode = (await ucBuilder())(repo.getDocs(DEMO.products).useCases);
db.prepare("INSERT INTO uc_diagrams (module_id, code, status, approved_at, updated_at) VALUES (?, ?, 'approved', ?, ?)").run(
  DEMO.products,
  diagramCode,
  ago(1),
  ago(1, 2),
);

// ------------------------------------------------------------- 7. Kho tài liệu: 4 tệp mẫu (FN-04, FN-05)
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** Ảnh PNG phác thảo màn đăng nhập (khung, 2 ô nhập, nút, link). */
function wireframePng(w = 360, h = 260): Buffer {
  const rects: [number, number, number, number, [number, number, number]][] = [
    [0, 0, w, h, [244, 246, 248]],
    [70, 30, 220, 200, [255, 255, 255]],
    [90, 50, 120, 14, [60, 70, 80]],
    [90, 85, 180, 26, [214, 219, 224]],
    [90, 125, 180, 26, [214, 219, 224]],
    [90, 170, 180, 30, [16, 163, 127]],
    [90, 210, 80, 8, [16, 120, 200]],
  ];
  const row = w * 3 + 1;
  const px = Buffer.alloc(h * row);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let c: [number, number, number] = [0, 0, 0];
      for (const [rx, ry, rw, rh, col] of rects) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) c = col;
      px.set(c, y * row + 1 + x * 3);
    }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bit, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}
/** PDF một trang, chữ không dấu (font chuẩn Helvetica không có tiếng Việt). */
function simplePdf(lines: string[]): Buffer {
  const text = lines.map((l, i) => `BT /F1 ${i ? 11 : 16} Tf 56 ${780 - i * 22} Td (${l.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
async function kickoffDocx(): Promise<Buffer> {
  const p = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Biên bản họp kickoff – Cửa hàng điện tử", heading: HeadingLevel.HEADING_1 }),
          p("Thời gian: 09:00 thứ Hai. Địa điểm: phòng họp tầng 5."),
          p("Thành phần: anh Tùng (chủ đầu tư), chị Lan (BA Lead), Đức, Hoàng Anh, Thu Hà, Quang Huy."),
          p("Nội dung đã thống nhất", true),
          p("1. Giai đoạn 1 làm 2 phân hệ: Quản lý sản phẩm và Quản lý đơn hàng."),
          p("2. Quản trị viên đăng nhập bằng email, có chức năng quên mật khẩu."),
          p("3. Đơn hàng xuất được ra Excel để kế toán đối soát cuối tháng."),
          p("Việc tiếp theo", true),
          p("BA hoàn thiện user story và màn hình phân hệ Sản phẩm trước buổi duyệt tuần sau."),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
/** Bảng Excel một trang tính (chuỗi inline, không cần sharedStrings). */
async function simpleXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const cell = (v: string | number, ref: string) =>
    typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  const sheet = rows.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => cell(v, `${col(x)}${y + 1}`)).join("")}</row>`).join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sản phẩm" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
const productsXlsx = await simpleXlsx([
  ["Mã SKU", "Tên sản phẩm", "Danh mục", "Giá bán", "Tồn kho"],
  ["SP001", "Điện thoại Galaxy A55", "Điện thoại", 8990000, 42],
  ["SP002", "Laptop Vivobook 15", "Máy tính", 15490000, 12],
  ["SP003", "Tai nghe AirPods 3", "Phụ kiện", 4290000, 80],
  ["SP004", "Màn hình Dell 24 inch", "Máy tính", 3890000, 25],
]);

const FILES: { name: string; moduleId: string | null; buf: Buffer; sender: string; receivedDays: number; note: string; by: MemberKey }[] = [
  { name: "Biên bản họp kickoff.docx", moduleId: null, buf: await kickoffDocx(), sender: "Anh Tùng – chủ đầu tư", receivedDays: 12, note: "Phạm vi giai đoạn 1 đã chốt", by: "lan" },
  {
    name: "Yêu cầu nghiệp vụ đơn hàng.pdf",
    moduleId: DEMO.orders,
    buf: simplePdf([
      "Yeu cau nghiep vu - Quan ly don hang",
      "1. Nhan vien ban hang xem danh sach don theo trang thai.",
      "2. Tao don hang tai quay, in hoa don cho khach.",
      "3. Huy don truoc khi giao, ghi ly do huy.",
      "4. Ke toan xuat danh sach don ra Excel theo thang.",
    ]),
    sender: "Chị Mai – phòng kinh doanh",
    receivedDays: 6,
    note: "Bản gốc của khách, chưa tách story",
    by: "huy",
  },
  { name: "Phác thảo màn đăng nhập.png", moduleId: DEMO.products, buf: wireframePng(), sender: "Anh Tùng – chủ đầu tư", receivedDays: 3, note: "Khách vẽ tay, có link Quên mật khẩu", by: "ha" },
  { name: "Danh sách sản phẩm mẫu.xlsx", moduleId: DEMO.products, buf: productsXlsx, sender: "Kho hàng", receivedDays: 2, note: "Dữ liệu mẫu cho màn Quản lý sản phẩm", by: "duc" },
];
for (const f of FILES) {
  const rec = saveBuffer(DEMO.project, f.moduleId, f.name, f.buf, "upload");
  db.prepare("UPDATE files SET sender = ?, received_at = ?, note = ?, uploaded_by = ?, created_at = ? WHERE id = ?").run(
    f.sender,
    dayOffset(-f.receivedDays),
    f.note,
    mem(f.by).id,
    ago(f.receivedDays - 0.5),
    rec.id,
  );
}
console.log(`Kho tài liệu: ${FILES.length} tệp`);

// ------------------------------------------------------------- 8. Công việc: 8 task đủ 4 cột (FN-15 → FN-23)
type Status = "todo" | "doing" | "done" | "redo";
interface Step {
  to: Status;
  daysAgo: number;
  by?: MemberKey; // người đổi; bỏ trống = hệ thống tự cập nhật (A7)
  reason?: string;
}
interface DemoTask {
  title: string;
  description: string;
  moduleId: string | null;
  assignee: MemberKey;
  due: number; // số ngày so với hôm nay, âm = đã qua
  priority: "High" | "Medium" | "Low";
  artifact?: { type: "screen" | "docs" | "diagram" | "tests"; id: string };
  steps: Step[]; // bước đầu là lúc tạo (BA Lead tạo, luôn "todo")
}
// Không gắn task nào vào sơ đồ UC: luồng demo của A11 tự tạo task "Vẽ UC diagram" rồi cho AI sinh lại sơ đồ.
const TASKS: DemoTask[] = [
  {
    title: "Tạo màn Quên mật khẩu",
    description: 'Màn đích cho link "Quên mật khẩu?" ở màn Đăng nhập. Dùng gợi ý màn tiếp theo để tạo.',
    moduleId: DEMO.products,
    assignee: "ha",
    due: 3,
    priority: "High",
    steps: [{ to: "todo", daysAgo: 0.2 }],
  },
  {
    title: "Viết lại story module Đơn hàng theo khuôn mẫu",
    description: "Điểm QUS đang thấp: có story thiếu vai trò, story trùng, story dùng từ mơ hồ. Sửa theo gợi ý trong panel QUS.",
    moduleId: DEMO.orders,
    assignee: "huy",
    due: 5,
    priority: "Medium",
    steps: [{ to: "todo", daysAgo: 1 }],
  },
  {
    title: "Thiết kế màn Đăng nhập",
    description: "Đăng nhập quản trị bằng email và mật khẩu, có ghi nhớ đăng nhập.",
    moduleId: DEMO.products,
    assignee: "ha",
    due: 1,
    priority: "High",
    artifact: { type: "screen", id: scrLogin.id },
    steps: [
      { to: "todo", daysAgo: 2 },
      { to: "doing", daysAgo: 0.25, reason: "Màn hình có bản nháp mới" },
    ],
  },
  {
    title: "Rà soát yêu cầu nghiệp vụ đơn hàng với phòng kinh doanh",
    description: 'Đối chiếu tệp "Yêu cầu nghiệp vụ đơn hàng.pdf" trong kho với story hiện có.',
    moduleId: DEMO.orders,
    assignee: "anh",
    due: 2,
    priority: "Medium",
    steps: [
      { to: "todo", daysAgo: 5 },
      { to: "doing", daysAgo: 4, by: "anh" },
    ],
  },
  {
    title: "Thiết kế màn Quản lý sản phẩm",
    description: "Danh sách sản phẩm có tìm kiếm, lọc theo danh mục, phân trang.",
    moduleId: DEMO.products,
    assignee: "duc",
    due: -3,
    priority: "High",
    artifact: { type: "screen", id: scrList.id },
    steps: [
      { to: "todo", daysAgo: 9 },
      { to: "doing", daysAgo: 8, reason: "Màn hình có bản nháp mới" },
      { to: "done", daysAgo: 6, reason: "Màn hình đã được duyệt" },
    ],
  },
  {
    title: "Viết tài liệu UC/SRS module Sản phẩm",
    description: "Sinh tài liệu từ các màn đã duyệt, rà soát rồi gửi BA Lead duyệt.",
    moduleId: DEMO.products,
    assignee: "anh",
    due: -1,
    priority: "Medium",
    artifact: { type: "docs", id: DEMO.products },
    steps: [
      { to: "todo", daysAgo: 6 },
      { to: "doing", daysAgo: 4, reason: "Tài liệu có bản nháp mới" },
      { to: "done", daysAgo: 2, reason: "Tài liệu đã được duyệt" },
    ],
  },
  {
    title: "Viết test case module Sản phẩm",
    description: "Sinh test case từ UC/SRS đã duyệt.",
    moduleId: DEMO.products,
    assignee: "duc",
    due: 2,
    priority: "Medium",
    artifact: { type: "tests", id: DEMO.products },
    steps: [
      { to: "todo", daysAgo: 4 },
      { to: "doing", daysAgo: 3, reason: "Test case có bản nháp mới" },
      { to: "done", daysAgo: 2.5, by: "duc" },
      { to: "redo", daysAgo: 1.5, reason: "Tài liệu thay đổi, test case lỗi thời" },
    ],
  },
  {
    title: "Bổ sung yêu cầu phi chức năng vào SRS",
    description: "Thêm thời gian phản hồi tối đa của màn danh sách và giới hạn số lần đăng nhập sai.",
    moduleId: DEMO.products,
    assignee: "huy",
    due: 1,
    priority: "Low",
    steps: [
      { to: "todo", daysAgo: 5 },
      { to: "doing", daysAgo: 4, by: "huy" },
      { to: "done", daysAgo: 3, by: "huy" },
      { to: "redo", daysAgo: 1, by: "lan", reason: "BA Lead trả lại: thiếu thời gian phản hồi tối đa" },
    ],
  },
];

tx(() => {
  const insTask = db.prepare(
    `INSERT INTO tasks (id, project_id, module_id, title, description, assignee_id, due_date, priority, status, artifact_type, artifact_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insEvent = db.prepare(
    "INSERT INTO task_events (id, task_id, from_status, to_status, by_member_id, by_system, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  TASKS.forEach((t, i) => {
    const id = `demo-task-${i + 1}`;
    const last = t.steps[t.steps.length - 1];
    insTask.run(
      id,
      DEMO.project,
      t.moduleId,
      t.title,
      t.description,
      mem(t.assignee).id,
      dayOffset(t.due),
      t.priority,
      last.to,
      t.artifact?.type ?? null,
      t.artifact?.id ?? null,
      ago(t.steps[0].daysAgo),
      ago(last.daysAgo),
    );
    t.steps.forEach((s, k) => {
      const by = k === 0 ? "lan" : s.by;
      insEvent.run(randomUUID(), id, k === 0 ? null : t.steps[k - 1].to, s.to, by ? mem(by).id : null, by ? 0 : 1, s.reason ?? "", ago(s.daysAgo));
    });
  });
});
const counts = { todo: 0, doing: 0, done: 0, redo: 0 };
for (const t of TASKS) counts[t.steps[t.steps.length - 1].to]++;
console.log(`Công việc: ${TASKS.length} task – Cần làm ${counts.todo}, Đang làm ${counts.doing}, Xong ${counts.done}, Cần làm lại ${counts.redo}`);

// ------------------------------------------------------------- 9. Điểm QUS lưu sẵn (FN-56), chấm giống A8: kèm story module khác để bắt trùng chéo
const modules = repo.listModules(DEMO.project);
for (const m of modules) {
  const others = modules.filter((x) => x.id !== m.id).map((x) => ({ moduleName: x.name, text: x.requirementInput }));
  const r = scoreStories(m.requirementInput, { others });
  const score = r.stories.length ? r.total : null;
  db.prepare("UPDATE modules SET qus_score = ?, qus_checked_at = ? WHERE id = ?").run(score, score === null ? null : iso(new Date()), m.id);
  const bad = r.stories.filter((s) => s.score < 60).length;
  console.log(`QUS ${m.name}: ${score ?? "—"} (${score === null ? "chưa chấm" : RATING_LABEL[qusRating(score)]}), ${r.stories.length} story, ${bad} story dưới 60`);
}

// ------------------------------------------------------------- 10. Gợi ý màn tiếp theo (cùng đầu vào với GET /api/modules/:id/suggestions)
// Module Sản phẩm: FR sinh từ màn đã duyệt (chủ yếu FR kiểm tra dữ liệu) bị coi là "chưa có màn phủ". BA đã bấm Bỏ qua các gợi ý này
// (FN-60), để danh sách chính chỉ còn link gãy "Quên mật khẩu" và mục "Đã bỏ qua" có sẵn dữ liệu để demo Khôi phục.
const suggestionsOf = (moduleId: string) => {
  const m = repo.getModule(moduleId)!;
  const shots = repo.listScreens(m.id).filter((s) => s.tree);
  const dismissed = (db.prepare("SELECT key FROM suggestion_dismissals WHERE module_id = ?").all(m.id) as { key: string }[]).map((r) => r.key);
  return suggestNextScreens({
    model: extractModel(shots.map((s) => ({ id: s.id, name: s.name, tree: s.tree! }))),
    requirements: repo.getDocs(m.id).requirements,
    stories: splitStories(m.requirementInput),
    dismissed,
  });
};
tx(() => {
  const st = db.prepare("INSERT OR IGNORE INTO suggestion_dismissals (module_id, key, created_at) VALUES (?, ?, ?)");
  // Lặp vì suggestNextScreens gộp gợi ý trùng tên: bỏ qua FR-04 thì FR-05 cùng tên rút gọn mới hiện ra
  for (let fr = suggestionsOf(DEMO.products).filter((s) => s.kind === "uncovered-fr"); fr.length; fr = suggestionsOf(DEMO.products).filter((s) => s.kind === "uncovered-fr"))
    for (const s of fr) st.run(DEMO.products, s.key, ago(0, 4));
});
for (const m of modules) {
  const items = suggestionsOf(m.id);
  const hidden = (db.prepare("SELECT COUNT(*) AS n FROM suggestion_dismissals WHERE module_id = ?").get(m.id) as { n: number }).n;
  const links = items.filter((s) => s.kind === "broken-link").map((s) => s.name);
  console.log(`Gợi ý ${m.name}: ${items.length} gợi ý${links.length ? ` (link gãy: ${links.join(", ")})` : ""}${hidden ? `, ${hidden} đã bỏ qua` : ""}`);
}

const port = process.env.PORT ?? 3000;
console.log(`\nXong. Mở http://localhost:${port}/#/p/${DEMO.project}`);
console.log(`  Thiết kế + gợi ý màn: http://localhost:${port}/#/m/${DEMO.products}/design`);
