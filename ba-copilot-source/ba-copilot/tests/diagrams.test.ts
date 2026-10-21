// Test sơ đồ theo bước (C6): Mock sinh đủ 5 loại hợp lệ, chặn khi nguồn chưa Xong, 409, lưu mã sai bị từ chối,
// nguồn đổi → Bản cũ. Mã sinh ra được kiểm bằng bộ kiểm tra của shared/diagrams.ts VÀ trình phân tích Mermaid thật.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import DOMPurify from "dompurify";
import { openDb, getDb, getArtifactState } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { emit, on } from "../server/events.ts";
import * as repo from "../server/repo.ts";
import { checkMermaid, checkDiagram, buildErdMermaid, buildBpmnMermaid, buildContextMermaid, buildSequenceMermaid, diagramMarkdown, DIAGRAM_SYNTAX } from "../shared/diagrams.ts";
import { entityCandidates, listNames } from "../server/ai/diagramPipelines.ts";
import type { ArtifactEvent, DiagramKind, ModuleDiagram, UseCase } from "../shared/types.ts";

// Mermaid chạy trong Node cần DOMPurify (chỉ dùng để làm sạch nhãn khi vẽ) – thay bằng hàm rỗng.
const dp = DOMPurify as any;
dp.addHook ??= () => {};
dp.removeHook ??= () => {};
dp.removeAllHooks ??= () => {};
dp.sanitize = (s: unknown) => String(s);
let mermaid: any;

let server: Server;
let base = "";
let moduleId = "";
let memberId = "";
const events: ArtifactEvent[] = [];

const UCS: UseCase[] = [
  {
    code: "UC-01",
    name: "Đăng nhập",
    actors: ["Khách hàng"],
    description: "",
    trigger: "",
    preconditions: [],
    postconditions: ["Đăng nhập thành công"],
    mainFlow: [
      { no: 1, actor: "Khách hàng", text: "Nhập email và mật khẩu" },
      { no: 2, actor: "Hệ thống", text: "Kiểm tra thông tin đăng nhập" },
      { no: 3, actor: "Hệ thống", text: "Lưu phiên và chuyển tới trang chủ" },
    ],
    altFlows: [],
    exceptions: [{ code: "E1", name: "Sai mật khẩu", branchFrom: 2, steps: ["Hệ thống báo sai email hoặc mật khẩu"] }],
    businessRules: [],
    screenIds: [],
    assumptions: [],
  },
  {
    code: "UC-02",
    name: "Đặt hàng",
    actors: ["Khách hàng", "Nhân viên kho"],
    description: "",
    trigger: "",
    preconditions: [],
    postconditions: [],
    mainFlow: [
      { no: 1, actor: "Khách hàng", text: "Chọn sản phẩm; nhập số lượng: 2" },
      { no: 2, actor: "Hệ thống", text: "Tạo đơn hàng và gửi email xác nhận" },
      { no: 3, actor: "Hệ thống", text: "Thực hiện UC-01 nếu chưa đăng nhập" },
    ],
    altFlows: [],
    exceptions: [],
    businessRules: [],
    screenIds: [],
    assumptions: [],
  },
];

const BRD = `# BRD – Bán hàng
## 1. Mục tiêu
Cho phép khách hàng đặt hàng trực tuyến và thanh toán qua cổng thanh toán.
## 2. Các bên liên quan
| STT | Bên liên quan | Vai trò |
|---|---|---|
| 1 | Khách hàng | Đặt hàng |
| 2 | **Nhân viên kho** | Xuất kho |
## 3. Hệ thống tích hợp
- Cổng thanh toán VNPay: nhận lệnh thanh toán
- Dịch vụ Email – gửi xác nhận
`;

const SRS = `## Dữ liệu
Hệ thống lưu đơn hàng gồm mã đơn, ngày đặt, tổng tiền và địa chỉ giao hàng.
Quản lý sản phẩm gồm tên sản phẩm, giá bán.`;

const REQS = [
  { code: "FR-01", type: "FR", statement: "Hệ thống cho phép khách hàng tạo đơn hàng gồm sản phẩm, số lượng và địa chỉ giao hàng", priority: "High", useCaseCodes: ["UC-02"], source: "", isAssumption: false },
  { code: "FR-02", type: "FR", statement: "Nhân viên quản lý danh sách sản phẩm", priority: "Medium", useCaseCodes: [], source: "", isAssumption: false },
];

function setDoc(kind: string, status: string, content = "", data: unknown = null) {
  getDb()
    .prepare(
      `INSERT INTO module_docs (module_id, kind, content, data, status, rev, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(module_id, kind) DO UPDATE SET content = excluded.content, data = excluded.data, status = excluded.status`,
    )
    .run(moduleId, kind, content, data === null ? null : JSON.stringify(data), status, new Date().toISOString());
}
const setStatus = (kind: string, status: string) => getDb().prepare("UPDATE module_docs SET status = ? WHERE module_id = ? AND kind = ?").run(status, moduleId, kind);

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json()) as any };
}
const gen = (kind: DiagramKind, b: object = {}) => call("POST", `/api/modules/${moduleId}/diagrams/${kind}/generate`, { actorId: memberId, ...b });
const save = (kind: DiagramKind, b: object) => call("PUT", `/api/modules/${moduleId}/diagrams/${kind}`, { actorId: memberId, ...b });

/** Phân tích bằng Mermaid thật; trả thông báo lỗi hoặc null. */
async function realParse(code: string): Promise<string | null> {
  try {
    await mermaid.parse(code);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  mermaid = (await import("mermaid")).default;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const p = repo.createProject("Bán hàng online");
  const m = repo.createModule(p.id, "Đặt hàng");
  moduleId = m.id;
  memberId = "mem-ba";
  const now = new Date().toISOString();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, 'An', 'BA', ?)").run(memberId, now);
  const ins = getDb().prepare(
    "INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, acceptance_criteria, priority, ord, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'High', ?, 1, ?, ?)",
  );
  ins.run("us1", p.id, m.id, "US-01", "khách hàng", "đặt hàng và thanh toán trực tuyến", "nhận hàng nhanh", 1, now, now);
  ins.run("us2", p.id, m.id, "US-02", "nhân viên kho", "xem đơn hàng cần xuất", "giao đúng hạn", 2, now, now);
  on("artifact.drafted", (e) => events.push(e));
  on("artifact.stale", (e) => events.push(e));
});
after(() => server.close());

test("GET: đủ 5 loại theo thứ tự, chưa sinh = none / rev 0; loại sai → 400; module sai → 404", async () => {
  const r = await call("GET", `/api/modules/${moduleId}/diagrams`);
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.body.map((d: ModuleDiagram) => [d.kind, d.status, d.rev]),
    ["CONTEXT", "UC", "SEQUENCE", "BPMN", "ERD"].map((k) => [k, "none", 0]),
  );
  assert.equal((await call("GET", `/api/modules/${moduleId}/diagrams/GANTT`)).status, 400);
  assert.equal((await call("GET", `/api/modules/khong-co/diagrams/UC`)).status, 404);
  assert.equal((await call("GET", `/api/modules/${moduleId}/diagrams/erd`)).body.kind, "ERD", "loại viết thường vẫn nhận");
});

test("sinh: chặn khi tài liệu nguồn chưa Xong, báo rõ tài liệu nào", async () => {
  let r = await gen("CONTEXT");
  assert.equal(r.status, 400);
  assert.match(r.body.error, /BRD \(hiện: chưa có\)/);
  setDoc("BRD", "draft", BRD);
  setDoc("UC_SPEC", "done", "", { useCases: UCS });
  r = await gen("BPMN");
  assert.equal(r.status, 400);
  assert.match(r.body.error, /BRD \(hiện: Đang làm\)/);
  assert.doesNotMatch(r.body.error, /UC Specification/);
  setDoc("SRS", "done", SRS);
  setDoc("FRD_NFR", "outdated", "", { requirements: REQS });
  r = await gen("ERD");
  assert.equal(r.status, 400);
  assert.match(r.body.error, /FRD-NFR \(hiện: Bản cũ\)/);
  assert.equal((await call("GET", `/api/modules/${moduleId}/diagrams/ERD`)).body.status, "none");
});

test("Mock: sinh đủ 5 loại, mã hợp lệ theo bộ kiểm tra và theo Mermaid thật", async () => {
  setStatus("BRD", "approved");
  setStatus("FRD_NFR", "done");
  for (const kind of ["CONTEXT", "UC", "SEQUENCE", "BPMN", "ERD"] as DiagramKind[]) {
    const r = await gen(kind);
    assert.equal(r.status, 200, `${kind}: ${r.body.error}`);
    const d = r.body as ModuleDiagram;
    assert.equal(d.status, "draft");
    assert.equal(d.rev, 1);
    assert.equal(d.updatedBy, memberId);
    assert.deepEqual(checkDiagram(kind, d), [], kind);
    const codes = kind === "SEQUENCE" ? d.parts.map((p) => p.code) : [d.code];
    for (const c of codes) assert.equal(await realParse(c), null, `${kind}:\n${c}`);
  }
  const all = (await call("GET", `/api/modules/${moduleId}/diagrams`)).body as ModuleDiagram[];
  const by = Object.fromEntries(all.map((d) => [d.kind, d])) as Record<DiagramKind, ModuleDiagram>;
  // Context: tác nhân từ BRD (bảng), hệ thống ngoài từ mục tích hợp
  assert.match(by.CONTEXT.code, /Khách hàng/);
  assert.match(by.CONTEXT.code, /Nhân viên kho/);
  assert.match(by.CONTEXT.code, /\[\["Cổng thanh toán VNPay"\]\]/);
  assert.match(by.CONTEXT.code, /\[\["Dịch vụ Email"\]\]/);
  // UC: «include» suy ra từ luồng chính UC-02 nhắc UC-01
  assert.match(by.UC.code, /«include»/);
  // Sequence: mỗi UC một phần, code rỗng, ngoại lệ thành khối alt
  assert.equal(by.SEQUENCE.code, "");
  assert.deepEqual(by.SEQUENCE.parts.map((p) => p.key), ["UC-01", "UC-02"]);
  assert.match(by.SEQUENCE.parts[0].code, /alt Sai mật khẩu/);
  // BPMN: làn theo tác nhân, sự kiện bắt đầu/kết thúc, cổng
  assert.match(by.BPMN.code, /subgraph L\d+\["Khách hàng"\]/);
  assert.match(by.BPMN.code, /subgraph L\d+\["Hệ thống"\]/);
  assert.match(by.BPMN.code, /\(\("Bắt đầu"\)\)/);
  assert.match(by.BPMN.code, /\(\(\("Kết thúc"\)\)\)/);
  assert.match(by.BPMN.code, /\{"Hợp lệ\?"\}/);
  // ERD: thực thể lấy từ FRD/SRS
  assert.match(by.ERD.code, /^erDiagram/);
  assert.match(by.ERD.code, /DON_HANG\["Đơn hàng"\]/);
  assert.match(by.ERD.code, /SAN_PHAM\["Sản phẩm"\]/);
  assert.match(by.ERD.code, /NGUOI_DUNG \|\|--o\{ DON_HANG/);
  assert.match(by.ERD.code, /DON_HANG \}o--o\{ SAN_PHAM : "gồm"/, "trường trùng tên thực thể → quan hệ");
  assert.match(by.ERD.code, /string dia_chi_giao_hang "Địa chỉ giao hàng"/);
  assert.doesNotMatch(by.ERD.code, /^\s*HANG\[/m, '"đặt hàng" không tạo thực thể "Hàng"');
  // Nhật ký AI ghi bản Mock
  const runs = getDb().prepare("SELECT type, provider FROM prompt_runs WHERE module_id = ? AND type LIKE 'generate_diagram_%'").all(moduleId) as { type: string; provider: string }[];
  assert.equal(runs.length, 5);
  assert.ok(runs.every((r) => r.provider === "mock"));
  assert.ok(events.some((e) => e.type === "artifact.drafted" && e.artifact.kind === "diagram" && e.artifact.sub === "ERD"));
});

test("lưu: mã sai bị từ chối (400 + chi tiết theo dòng), mã đúng → rev + 1", async () => {
  const cur = (await call("GET", `/api/modules/${moduleId}/diagrams/CONTEXT`)).body as ModuleDiagram;
  let r = await save("CONTEXT", { code: 'flowchart LR\n  A(("Khách hàng") --> B', baseRev: cur.rev });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Mã Mermaid chưa hợp lệ/);
  assert.match(r.body.details[0], /^Dòng 2:/);
  r = await save("CONTEXT", { code: "sequenceDiagram\n  A->>B: x", baseRev: cur.rev });
  assert.equal(r.status, 400, "sai loại cú pháp");
  r = await save("CONTEXT", { code: "   ", baseRev: cur.rev });
  assert.equal(r.status, 400, "mã trống");
  r = await save("SEQUENCE", { parts: [{ key: "UC-01", title: "x", code: "sequenceDiagram\n  A->>B nội dung" }] });
  assert.equal(r.status, 400);
  assert.match(r.body.details[0], /UC-01 – Dòng 2/);
  r = await save("ERD", { code: "erDiagram\n  A {\n    string id PK\n" });
  assert.equal(r.status, 400, "thiếu }");
  assert.equal((await call("GET", `/api/modules/${moduleId}/diagrams/CONTEXT`)).body.rev, cur.rev, "không ghi khi lỗi");

  const code = cur.code + '\n  ACT1 -->|"Phản hồi"| SYS';
  r = await save("CONTEXT", { code, baseRev: cur.rev });
  assert.equal(r.status, 200, r.body.error);
  assert.equal(r.body.rev, cur.rev + 1);
  assert.equal(r.body.code, code);
});

test("409: lưu / sinh lại với baseRev cũ bị chặn, dữ liệu giữ nguyên", async () => {
  const cur = (await call("GET", `/api/modules/${moduleId}/diagrams/UC`)).body as ModuleDiagram;
  const ok1 = await save("UC", { code: cur.code + "\n  %% ghi chú", baseRev: cur.rev });
  assert.equal(ok1.status, 200);
  const r = await save("UC", { code: cur.code, baseRev: cur.rev });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "CONFLICT");
  assert.equal(r.body.rev, cur.rev + 1);
  const g = await gen("UC", { baseRev: cur.rev });
  assert.equal(g.status, 409);
  assert.equal((await call("GET", `/api/modules/${moduleId}/diagrams/UC`)).body.code, ok1.body.code);
  // Sequence: lưu phần đã sửa với baseRev đúng
  const seq = (await call("GET", `/api/modules/${moduleId}/diagrams/SEQUENCE`)).body as ModuleDiagram;
  const parts = seq.parts.map((p, i) => (i === 0 ? { ...p, code: p.code + "\n  A->>UI: Bấm đăng xuất" } : p));
  const s = await save("SEQUENCE", { code: "bỏ qua", parts, baseRev: seq.rev });
  assert.equal(s.status, 200, s.body.error);
  assert.equal(s.body.code, "");
  assert.match(s.body.parts[0].code, /Bấm đăng xuất/);
});

test("sửa sơ đồ đã Xong / Đã duyệt → về Đang làm, giữ cờ Yêu cầu sửa", async () => {
  getDb().prepare("UPDATE module_diagrams SET status = 'approved', revision_requested = 1 WHERE module_id = ? AND kind = 'ERD'").run(moduleId);
  const cur = (await call("GET", `/api/modules/${moduleId}/diagrams/ERD`)).body as ModuleDiagram;
  const r = await save("ERD", { code: cur.code + '\n  NGUOI_DUNG ||--o{ SAN_PHAM : "xem"', baseRev: cur.rev });
  assert.equal(r.status, 200, r.body.error);
  assert.equal(r.body.status, "draft");
  assert.equal(r.body.revisionRequested, true);
});

test("tài liệu nguồn có bản mới → sơ đồ phụ thuộc thành Bản cũ + artifact.stale", () => {
  events.length = 0;
  emit({ type: "artifact.drafted", artifact: { kind: "doc", id: moduleId, moduleId, sub: "BRD" } });
  const st = (k: DiagramKind) => getArtifactState({ kind: "diagram", id: moduleId, moduleId, sub: k })!.status;
  assert.equal(st("CONTEXT"), "outdated");
  assert.equal(st("BPMN"), "outdated");
  assert.equal(st("UC"), "draft");
  assert.equal(st("ERD"), "draft");
  assert.deepEqual(events.filter((e) => e.type === "artifact.stale").map((e) => e.artifact.sub).sort(), ["BPMN", "CONTEXT"]);
});

// ------------------------------------------------------------------ hàm thuần
test("checkMermaid: báo đúng dòng và đúng loại lỗi", () => {
  assert.deepEqual(checkMermaid("", "flowchart"), [{ line: 0, message: "Mã sơ đồ trống" }]);
  assert.equal(checkMermaid("%% chú thích\nflowchart LR\n  A --> B", "flowchart").length, 0);
  assert.equal(checkMermaid("graph TD\n  A --> B", "flowchart").length, 0);
  assert.match(checkMermaid("pie\n  \"a\": 1", "flowchart")[0].message, /flowchart LR/);
  assert.equal(checkMermaid('flowchart LR\n  subgraph X["a"]\n  A\n', "flowchart")[0].message, 'Thiếu "end" cho khối subgraph');
  assert.equal(checkMermaid('flowchart LR\n  A["x] --> B', "flowchart")[0].line, 2);
  assert.equal(checkMermaid('flowchart LR\n  A>"Bất đối xứng"] --> B{"Cổng"}', "flowchart").length, 0);
  assert.equal(checkMermaid("sequenceDiagram\n  alt x\n  A->>B: y\n  else z\n  A-->>B: k\n  end", "sequence").length, 0);
  assert.equal(checkMermaid("sequenceDiagram\n  else z", "sequence")[0].line, 2);
  assert.equal(checkMermaid('erDiagram\n  A["Nhãn"] {\n    string id PK "Mã"\n    varchar(20) ten\n  }\n  A ||--o{ B : "có"\n  B', "er").length, 0);
  assert.equal(checkMermaid("erDiagram\n  A ->> B", "er")[0].line, 2);
  assert.equal(DIAGRAM_SYNTAX.BPMN, "flowchart");
});

test("builder: nhãn có ký tự đặc biệt vẫn ra mã hợp lệ (Mermaid thật)", async () => {
  const bad = 'Tên "lạ"; #1: <b>x</b>';
  const codes = [
    buildContextMermaid({ system: bad, externals: [{ name: bad, kind: "actor" }, { name: "API ngoài", kind: "system" }], flows: [{ from: bad, to: "SYSTEM", label: bad }, { from: "SYSTEM", to: "API ngoài", label: "x" }] }),
    buildBpmnMermaid({ lanes: [bad], nodes: [{ id: "a", lane: bad, type: "start", label: "" }, { id: "b", lane: "Làn trống", type: "gateway", label: bad }, { id: "c", lane: bad, type: "end", label: "" }], edges: [{ from: "a", to: "b", label: bad }, { from: "b", to: "c" }, { from: "b", to: "zz" }] }),
    buildErdMermaid({ entities: [{ name: bad, attributes: [{ name: "Mã số", type: "varchar", key: "PK", comment: bad }, { name: "1 giá", type: "int" }] }, { name: "Đơn hàng", attributes: [] }], relations: [{ from: bad, to: "Đơn hàng", cardinality: "n-n", label: bad }] }),
    buildSequenceMermaid({ participants: [{ id: "Khách hàng", label: bad, actor: true }], messages: [{ from: "Khách hàng", to: "Máy chủ", text: bad }], alts: [{ condition: bad, messages: [{ from: "Máy chủ", to: "Khách hàng", text: "Lỗi: 500", reply: true }] }] }),
  ];
  for (const c of codes) {
    assert.deepEqual(checkMermaid(c), [], c);
    assert.equal(await realParse(c), null, c);
  }
});

test("đọc BRD / tìm thực thể (Mock)", () => {
  assert.deepEqual(listNames(["- **Khách hàng**: người mua", "| 1 | Quản trị viên | x |", "|---|---|", "| STT | Tên |", "- Một câu rất dài mô tả nhiều thứ không phải là tên của một tác nhân nào cả"]), ["Khách hàng", "Quản trị viên"]);
  assert.deepEqual(entityCandidates("Nhân viên quản lý danh sách sản phẩm của cửa hàng; khách hàng tạo đơn hàng mới. Xem thông báo."), ["Sản phẩm", "Đơn hàng"]);
});

test("diagramMarkdown: khối mermaid, Sequence theo từng phần, BPMN có chú thích", () => {
  const md = diagramMarkdown({ kind: "SEQUENCE", code: "", parts: [{ key: "UC-01", title: "UC-01 – Đăng nhập", code: "sequenceDiagram\n  A->>B: x" }] }, "Đặt hàng");
  assert.match(md, /^# Sơ đồ Sequence – Đặt hàng/);
  assert.match(md, /## UC-01 – Đăng nhập\n\n```mermaid\nsequenceDiagram/);
  assert.match(diagramMarkdown({ kind: "BPMN", code: "flowchart LR\n  A --> B" }), /BPMN mô phỏng bằng Mermaid/);
  assert.match(diagramMarkdown({ kind: "ERD", code: "" }), /Chưa có sơ đồ/);
});
