// Test C5 – tài liệu theo bước (Mock, không có API key): docs/api.md "Đợt 5" mục 5.3.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getDb, openDb, setArtifactState } from "../src/db.ts";
import { createApp } from "../src/app.ts";
import { on } from "../src/events.ts";
import { parseReqMarkdown, parseUcMarkdown, reqMarkdown, splitSections, ucMarkdown, mockUcSpec, mockBrd, mockFrd, type DocGenInput } from "../src/ai/docsPipelines.ts";
import type { ArtifactEvent, DocKind, ModuleDoc, UserStory } from "../../shared/types.ts";

let server: Server;
let base = "";
const events: ArtifactEvent[] = [];

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.AI_MODE = "mock";
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/frontend/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const t of ["artifact.drafted", "artifact.stale"] as const) on(t, (e) => events.push(e));
});
after(() => server.close());

let seq = 0;
function addStory(projectId: string, moduleId: string, s: { asA: string; iWant: string; soThat?: string; ac?: string[]; priority?: string }) {
  const now = new Date().toISOString();
  seq++;
  getDb()
    .prepare("INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, acceptance_criteria, priority, ord, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
    .run(`st-${seq}`, projectId, moduleId, `US-${String(seq).padStart(2, "0")}`, s.asA, s.iWant, s.soThat ?? "", JSON.stringify(s.ac ?? []), s.priority ?? "Medium", seq, now, now);
}

async function setup(name: string) {
  const p = await api("POST", "/api/projects", { name: `Dự án ${name}` });
  const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name });
  const mem = await api("POST", "/api/members", { name: `BA ${name}`, role: "BA" });
  return { pid: p.data.id as string, mid: m.data.id as string, actorId: mem.data.id as string };
}

const gen = (mid: string, kind: DocKind, body: object = {}) => api("POST", `/api/modules/${mid}/docs/${kind}/generate`, body);
const done = (mid: string, kind: DocKind) => setArtifactState({ kind: "doc", id: mid, moduleId: mid, sub: kind }, { status: "done" });

test("GET trả đủ 5 loại, chưa sinh = none / rev 0; loại sai → 400; module sai → 404", async () => {
  const { mid } = await setup("Rỗng");
  const r = await api("GET", `/api/modules/${mid}/docs`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.map((d: ModuleDoc) => [d.kind, d.status, d.rev]), [
    ["BRD", "none", 0],
    ["UC_SPEC", "none", 0],
    ["SRS", "none", 0],
    ["FRD_NFR", "none", 0],
    ["API_SPEC", "none", 0],
  ]);
  assert.equal((await api("GET", `/api/modules/${mid}/docs/PRD`)).status, 400);
  assert.equal((await api("GET", `/api/modules/khong-co/docs`)).status, 404);
  // BRD cần ≥ 1 story; không cần màn hình đã duyệt (bỏ BR-01)
  const b = await gen(mid, "BRD");
  assert.equal(b.status, 400);
  assert.match(b.data.error, /user story/);
});

test("Mock: sinh đủ chuỗi 5 bước, chặn khi bước trước chưa Xong", async () => {
  const { pid, mid, actorId } = await setup("Đặt hàng");
  addStory(pid, mid, { asA: "khách hàng", iWant: "đặt hàng trực tuyến", soThat: "không phải đến cửa hàng", ac: ["Giỏ hàng không được rỗng", "Số lượng tối thiểu là 1"], priority: "High" });
  addStory(pid, mid, { asA: "nhân viên bán hàng", iWant: "xem danh sách đơn hàng", soThat: "xử lý đơn kịp thời" });

  const brd = await gen(mid, "BRD", { actorId });
  assert.equal(brd.status, 200, JSON.stringify(brd.data));
  assert.equal(brd.data.status, "draft");
  assert.equal(brd.data.rev, 1);
  assert.equal(brd.data.updatedBy, actorId);
  assert.match(brd.data.content, /^# BRD – Đặt hàng/);
  assert.match(brd.data.content, /US-0\d/);
  assert.ok(splitSections(brd.data.content).sections.length >= 5);

  // UC Spec bị chặn khi BRD chưa Xong
  const blocked = await gen(mid, "UC_SPEC");
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /BRD.*not Done/);

  done(mid, "BRD");
  const uc = await gen(mid, "UC_SPEC", { actorId });
  assert.equal(uc.status, 200, JSON.stringify(uc.data));
  assert.equal(uc.data.data.useCases.length, 2);
  assert.equal(uc.data.data.useCases[0].code, "UC-01");
  assert.equal(uc.data.data.useCases[0].storyCodes.length, 1);
  assert.match(uc.data.content, /## UC-01 – Đặt hàng trực tuyến/);

  assert.equal((await gen(mid, "SRS")).status, 400);
  done(mid, "UC_SPEC");
  const srs = await gen(mid, "SRS");
  assert.equal(srs.status, 200);
  assert.equal(srs.data.data.srs.sections.length, 7);

  done(mid, "SRS");
  const frd = await gen(mid, "FRD_NFR");
  assert.equal(frd.status, 200);
  const reqs = frd.data.data.requirements;
  assert.ok(reqs.some((r: any) => r.type === "FR" && r.useCaseCodes.includes("UC-01")));
  assert.ok(reqs.some((r: any) => r.type === "NFR" && r.isAssumption));
  assert.ok(reqs.some((r: any) => /Giỏ hàng không được rỗng/.test(r.statement)));

  done(mid, "FRD_NFR");
  const apiSpec = await gen(mid, "API_SPEC");
  assert.equal(apiSpec.status, 200);
  assert.match(apiSpec.data.content, /## POST \/api\/v1\/dat-hang-truc-tuyen/);
  assert.match(apiSpec.data.content, /## GET \/api\/v1\/xem-danh-sach-don-hang/);
  assert.match(apiSpec.data.content, /\| 401 \| UNAUTHORIZED/);
  assert.equal(apiSpec.data.data, null);

  // Nhật ký AI ghi đủ 5 lần sinh
  const runs = getDb().prepare("SELECT type FROM prompt_runs WHERE module_id = ? ORDER BY created_at").all(mid) as { type: string }[];
  assert.deepEqual(runs.map((r) => r.type), ["generate_doc_brd", "generate_doc_uc_spec", "generate_doc_srs", "generate_doc_frd_nfr", "generate_doc_api_spec"]);
});

test("Sinh lại bước trước → các bước sau và bộ test thành Bản cũ + artifact.stale; sửa bản đang Xong về draft", async () => {
  const { pid, mid } = await setup("Kho");
  addStory(pid, mid, { asA: "thủ kho", iWant: "nhập kho hàng hoá", ac: ["Số lượng phải lớn hơn 0"] });
  for (const k of ["BRD", "UC_SPEC", "SRS", "FRD_NFR"] as DocKind[]) {
    assert.equal((await gen(mid, k)).status, 200);
    done(mid, k);
  }
  getDb().prepare("UPDATE modules SET tests_status = 'draft' WHERE id = ?").run(mid);
  events.length = 0;

  const ucBefore = (await api("GET", `/api/modules/${mid}/docs/UC_SPEC`)).data as ModuleDoc;
  const again = await gen(mid, "UC_SPEC", { baseRev: ucBefore.rev });
  assert.equal(again.status, 200);
  assert.equal(again.data.status, "draft");
  assert.equal(again.data.rev, ucBefore.rev + 1);

  const list = (await api("GET", `/api/modules/${mid}/docs`)).data as ModuleDoc[];
  assert.deepEqual(list.map((d) => d.status), ["done", "draft", "outdated", "outdated", "none"]);
  const tests = getDb().prepare("SELECT tests_status FROM modules WHERE id = ?").get(mid) as { tests_status: string };
  assert.equal(tests.tests_status, "outdated");
  assert.deepEqual(
    events.map((e) => `${e.type}:${e.artifact.kind}:${e.artifact.sub ?? ""}`),
    ["artifact.drafted:doc:UC_SPEC", "artifact.stale:doc:SRS", "artifact.stale:doc:FRD_NFR", "artifact.stale:tests:"],
  );

  // SRS đang Bản cũ → không sinh được FRD-NFR
  assert.equal((await gen(mid, "FRD_NFR")).status, 400);
});

test("PUT sửa tay: 409 khi lệch rev, cấu trúc UC đọc ngược từ Markdown, Xong → draft", async () => {
  const { pid, mid, actorId } = await setup("Thanh toán");
  addStory(pid, mid, { asA: "khách hàng", iWant: "thanh toán đơn hàng", ac: ["Chỉ thanh toán đơn chưa huỷ"] });
  await gen(mid, "BRD");
  done(mid, "BRD");
  const uc = (await gen(mid, "UC_SPEC")).data as ModuleDoc;
  done(mid, "UC_SPEC");

  const edited = uc.content.replace("thanh toán đơn hàng", "thanh toán đơn hàng bằng ví điện tử").replace("**Business rules:**", "**Business rules:**\n- Ví phải đủ số dư");
  const stale = await api("PUT", `/api/modules/${mid}/docs/UC_SPEC`, { content: edited, baseRev: uc.rev - 1, actorId });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, "CONFLICT");
  assert.equal(stale.data.rev, uc.rev);

  const ok = await api("PUT", `/api/modules/${mid}/docs/UC_SPEC`, { content: edited, baseRev: uc.rev, actorId });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.status, "draft");
  assert.equal(ok.data.rev, uc.rev + 1);
  const u = ok.data.data.useCases[0];
  assert.equal(u.code, "UC-01");
  assert.ok(u.businessRules.includes("Ví phải đủ số dư"));
  assert.ok(u.businessRules.includes("Chỉ thanh toán đơn chưa huỷ"));
  assert.equal(u.storyCodes.length, 1);
  assert.match(u.storyCodes[0], /^US-\d+$/);
  assert.ok(u.mainFlow.length >= 4);

  // Cùng baseRev cũ lần nữa → 409
  assert.equal((await api("PUT", `/api/modules/${mid}/docs/UC_SPEC`, { content: edited, baseRev: uc.rev })).status, 409);
  // Rỗng → 400
  assert.equal((await api("PUT", `/api/modules/${mid}/docs/UC_SPEC`, { content: "  " })).status, 400);
});

test("Chỉnh bằng AI theo mục (Mock): chỉ đổi đúng mục, giữ cấu trúc, 409 khi lệch rev, mục sai → 400", async () => {
  const { pid, mid } = await setup("Khách hàng");
  addStory(pid, mid, { asA: "nhân viên", iWant: "thêm khách hàng mới", ac: ["Email là duy nhất"] });
  addStory(pid, mid, { asA: "nhân viên", iWant: "tra cứu khách hàng" });
  const brd = (await gen(mid, "BRD")).data as ModuleDoc;

  const r = await api("POST", `/api/modules/${mid}/docs/BRD/refine`, { instruction: "Thêm mục tiêu giảm thời gian nhập liệu", section: "1. Background and Objectives", baseRev: brd.rev });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.rev, brd.rev + 1);
  const secs = splitSections(r.data.content).sections;
  assert.match(secs[0].text, /Refinement note \(BA\):\*\* Thêm mục tiêu giảm thời gian nhập liệu/);
  assert.equal(secs[1].text, splitSections(brd.content).sections[1].text);

  assert.equal((await api("POST", `/api/modules/${mid}/docs/BRD/refine`, { instruction: "x", baseRev: brd.rev })).status, 409);
  assert.equal((await api("POST", `/api/modules/${mid}/docs/BRD/refine`, { instruction: "x", section: "Không có" })).status, 400);
  assert.equal((await api("POST", `/api/modules/${mid}/docs/BRD/refine`, { instruction: "  " })).status, 400);
  assert.equal((await api("POST", `/api/modules/${mid}/docs/SRS/refine`, { instruction: "x" })).status, 400);

  done(mid, "BRD");
  const uc = (await gen(mid, "UC_SPEC")).data as ModuleDoc;
  const ru = await api("POST", `/api/modules/${mid}/docs/UC_SPEC/refine`, { instruction: "Thêm bước gửi email chào mừng", section: "UC-01 – Thêm khách hàng mới", baseRev: uc.rev });
  assert.equal(ru.status, 200, JSON.stringify(ru.data));
  const u1 = ru.data.data.useCases.find((u: any) => u.code === "UC-01");
  assert.ok(u1.assumptions.some((a: string) => a.includes("Thêm bước gửi email chào mừng")));
  assert.equal(ru.data.data.useCases.length, 2);
  const runs = getDb().prepare("SELECT type FROM prompt_runs WHERE module_id = ? AND type LIKE 'refine_doc_%'").all(mid) as { type: string }[];
  assert.deepEqual(runs.map((x) => x.type), ["refine_doc_brd", "refine_doc_uc_spec"]);
});

test("Markdown ⇄ cấu trúc: UC và FR/NFR đọc ngược đúng", () => {
  const input: DocGenInput = {
    moduleId: "m",
    moduleName: "M",
    stories: [{ id: "s", projectId: "p", moduleId: "m", code: "US-01", asA: "khách", iWant: "đăng ký tài khoản", soThat: "mua hàng", acceptanceCriteria: ["Email hợp lệ"], priority: "High", order: 1, createdAt: "", rev: 1, updatedBy: null, updatedAt: null }],
    storiesText: "",
  };
  const ucs = mockUcSpec(input);
  const back = parseUcMarkdown(ucMarkdown(ucs, "M"), ucs);
  assert.deepEqual(back, ucs);
  const reqs = [
    { code: "FR-01", type: "FR" as const, statement: "Cho phép đăng ký", priority: "High" as const, useCaseCodes: ["UC-01"], source: "UC-01", isAssumption: false },
    { code: "NFR-01", type: "NFR" as const, statement: "Phản hồi < 2 giây", priority: "Medium" as const, useCaseCodes: ["UC-01"], source: "Gợi ý", isAssumption: true },
  ];
  assert.deepEqual(parseReqMarkdown(reqMarkdown(reqs, "M")), reqs);
});

test("Tài liệu cũ đã chuyển sang module_docs hiển thị qua API mới", async () => {
  const { mid } = await setup("Cũ");
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO module_docs (module_id, kind, content, data, status, rev, updated_at) VALUES (?, 'SRS', ?, ?, 'approved', 1, ?)")
    .run(mid, "# SRS\n\n## 1. Giới thiệu\n\nNội dung cũ\n", JSON.stringify({ srs: { sections: [{ key: "intro", title: "1. Giới thiệu", content: "Nội dung cũ" }] } }), now);
  const r = await api("GET", `/api/modules/${mid}/docs/SRS`);
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "approved");
  assert.equal(r.data.rev, 1);
  assert.equal(r.data.data.srs.sections[0].key, "intro");
  // Sửa bản Đã duyệt → về draft, giữ key mục
  const e = await api("PUT", `/api/modules/${mid}/docs/SRS`, { content: r.data.content.replace("Nội dung cũ", "Nội dung mới"), baseRev: 1 });
  assert.equal(e.data.status, "draft");
  assert.equal(e.data.data.srs.sections[0].key, "intro");
  assert.equal(e.data.data.srs.sections[0].content, "Nội dung mới");
});

test("Bản Claude: gọi tool đúng tên, kết quả sai thì tự sửa 1 lần, nhật ký ghi provider claude", async () => {
  const { createServer } = await import("node:http");
  const calls: any[] = [];
  const fake = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      calls.push(body);
      const tool = body.tool_choice.name;
      let input: unknown;
      if (tool === "submit_brd") input = { markdown: "# BRD – X\n\n## 1. Bối cảnh\nA\n## 2. Phạm vi\nB\n## 3. Bên liên quan\nC\n## 4. Yêu cầu\nD\n## 5. Tiêu chí\nE\n## 6. Giả định\nF" };
      else if (calls.filter((c) => c.tool_choice.name === "submit_use_cases").length === 1) input = { useCases: [{ code: "UC-1x", name: "Sai mã", actors: ["A"], storyCodes: [], description: "", mainFlow: [], altFlows: [], exceptions: [], businessRules: [] }] };
      else input = { useCases: [{ code: "UC-01", name: "Đăng ký", actors: ["Khách"], storyCodes: ["US-99", "KHONG"], description: "d", mainFlow: [{ no: 1, actor: "Khách", text: "Nhập email" }], altFlows: [], exceptions: [], businessRules: ["Email duy nhất"] }] };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ content: [{ type: "tool_use", id: `t${calls.length}`, name: tool, input }], usage: { input_tokens: 10, output_tokens: 20 } }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, r));
  const env = { ...process.env };
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  delete process.env.AI_MODE;
  try {
    const { pid, mid } = await setup("Claude");
    addStory(pid, mid, { asA: "khách", iWant: "đăng ký" });
    const brd = await gen(mid, "BRD");
    assert.equal(brd.status, 200, JSON.stringify(brd.data));
    assert.match(brd.data.content, /## 6\. Giả định/);
    done(mid, "BRD");
    const uc = await gen(mid, "UC_SPEC");
    assert.equal(uc.status, 200, JSON.stringify(uc.data));
    assert.equal(uc.data.data.useCases[0].code, "UC-01");
    assert.deepEqual(uc.data.data.useCases[0].storyCodes, []); // mã story không có trong module bị bỏ
    assert.equal(calls.filter((c) => c.tool_choice.name === "submit_use_cases").length, 2);
    assert.match(calls[0].messages[0].content, /đăng ký/);
    const run = getDb().prepare("SELECT provider, ok, error FROM prompt_runs WHERE module_id = ? AND type = 'generate_doc_uc_spec'").get(mid) as any;
    assert.equal(run.provider, "claude");
    assert.equal(run.ok, 1);
    assert.match(run.error, /self-corrected/);
  } finally {
    process.env = env;
    fake.close();
  }
});

test("Mock: story gõ kèm cụm mở đầu (to / I want to / so that / As a) không làm câu lặp chữ, tên UC không bắt đầu bằng To", () => {
  const story = (code: string, asA: string, iWant: string, soThat: string): UserStory =>
    ({ id: code, projectId: "p", moduleId: "m", code, asA, iWant, soThat, acceptanceCriteria: [], priority: "High", order: 1, createdAt: "", rev: 1, updatedBy: null, updatedAt: null });
  const input: DocGenInput = {
    moduleId: "m",
    moduleName: "Checkout",
    stories: [story("US-01", "Shopper", "to pay for my order", "so that I receive my goods"), story("US-02", "As a Guest", "I want to track my parcel", "")],
    storiesText: "",
  };
  const ucs = mockUcSpec(input);
  assert.deepEqual(ucs.map((u) => u.name), ["Pay for my order", "Track my parcel"]);
  assert.deepEqual(ucs.map((u) => u.actors[0]), ["Shopper", "Guest"]);
  assert.equal(ucs[0].description, "Shopper wants to pay for my order so that I receive my goods.");
  assert.equal(ucs[0].postconditions[0], "Goal achieved: I receive my goods");
  const frs = mockFrd({ ...input, ucSpec: { content: "", useCases: ucs } }).filter((r) => r.type === "FR");
  assert.equal(frs[0].statement, "The system shall allow Shopper to pay for my order.");
  // Tên UC do AI đặt bắt đầu bằng "To …" cũng không thành "to to"
  const fromAi = mockFrd({ ...input, ucSpec: { content: "", useCases: [{ ...ucs[0], name: "To pay for my order" }] } });
  assert.equal(fromAi[0].statement, "The system shall allow Shopper to pay for my order.");
  const brd = mockBrd(input);
  assert.match(brd, /- I receive my goods \(US-01\)/);
  assert.match(brd, /\| BR-02 \| Guest can track my parcel \|/);
  const all = [brd, ...frs.map((r) => r.statement), ...ucs.map((u) => u.description)].join("\n");
  for (const bad of [/\bto to\b/i, /so that so that/i, /I want to want/i, /As a As a/i, /\bcan to\b/i, /- To /]) assert.doesNotMatch(all, bad);
});
