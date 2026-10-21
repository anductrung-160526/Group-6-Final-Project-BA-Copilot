// Kiểm thử tích hợp: chạy server thật (DB trong bộ nhớ) và đi trọn luồng nghiệp vụ.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDb, openDb, setArtifactState } from "../server/db.ts";
import type { Requirement, UseCase } from "../shared/types.ts";
import { createApp } from "../server/app.ts";
import JSZip from "jszip";

let server: Server;
let base = "";
let fakeClaude: Server;
const claudeCalls: any[] = [];
let tmpUploadDir = "";

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data: data as any };
}

before(async () => {
  tmpUploadDir = mkdtempSync(join(tmpdir(), "ba-test-api-uploads-"));
  process.env.UPLOAD_DIR = tmpUploadDir;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  fakeClaude?.close();
  if (tmpUploadDir && existsSync(tmpUploadDir)) {
    try {
      rmSync(tmpUploadDir, { recursive: true, force: true });
    } catch {}
  }
  delete process.env.UPLOAD_DIR;
});

// ------------------------------------------------------------------ Đợt 5 (C9): dữ liệu bước trước ghi thẳng vào bảng
// User story (C4) và tài liệu (C5) có route riêng đang làm song song → test ghi thẳng `user_stories` / `module_docs`.
function seedStories(pid: string, mid: string) {
  const at = new Date().toISOString();
  const ins = getDb().prepare(
    "INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, acceptance_criteria, priority, ord, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
  );
  ins.run(randomUUID(), pid, mid, "US-01", "Khách hàng", "đăng nhập bằng email và mật khẩu", "mua hàng", JSON.stringify(["Sai mật khẩu thì báo lỗi"]), "High", 0, at, at);
  ins.run(randomUUID(), pid, mid, "US-02", "Quản lý", "xuất báo cáo doanh thu theo tháng", "theo dõi kinh doanh", "[]", "Low", 1, at, at);
}

const UC: UseCase = {
  code: "UC-01",
  name: "Đăng nhập hệ thống",
  actors: ["Khách hàng"],
  description: "Khách hàng đăng nhập vào hệ thống bằng email và mật khẩu",
  trigger: "Khách hàng mở trang đăng nhập",
  preconditions: ["Đã có tài khoản"],
  postconditions: ["Đăng nhập thành công"],
  mainFlow: [
    { no: 1, actor: "Khách hàng", text: "Nhập email và mật khẩu" },
    { no: 2, actor: "Hệ thống", text: "Kiểm tra thông tin" },
  ],
  altFlows: [],
  exceptions: [{ code: "E1", name: "Sai mật khẩu", branchFrom: 2, steps: ["Hệ thống báo sai mật khẩu"] }],
  businessRules: [],
  screenIds: [],
  assumptions: [],
};
const REQS: Requirement[] = [
  { code: "FR-01", type: "FR", statement: "Hệ thống cho phép khách hàng đăng nhập bằng email và mật khẩu", priority: "High", useCaseCodes: ["UC-01"], source: "US-01", isAssumption: false },
  { code: "FR-02", type: "FR", statement: "Hệ thống khoá tài khoản sau 5 lần nhập sai mật khẩu", priority: "Medium", useCaseCodes: ["UC-01"], source: "US-01", isAssumption: false },
  { code: "NFR-01", type: "NFR", statement: "Thời gian phản hồi dưới 2 giây", priority: "Low", useCaseCodes: [], source: "", isAssumption: false },
];
function putDoc(mid: string, kind: string, status: string, content: string, data: unknown) {
  getDb()
    .prepare(
      "INSERT INTO module_docs (module_id, kind, content, data, status, rev, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(module_id, kind) DO UPDATE SET content = excluded.content, data = excluded.data, status = excluded.status",
    )
    .run(mid, kind, content, data === null ? null : JSON.stringify(data), status, new Date().toISOString());
}

test("luồng end-to-end đợt 5 (mock): story → tài liệu → màn (bối cảnh SRS/FRD) → sửa có chặn đè → Xong → test case → truy vết → HTML", async () => {
  const p = await api("POST", "/api/projects", { name: "Luận án demo" });
  assert.equal(p.status, 200);
  const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Xác thực" });
  const mid = m.data.id;
  seedStories(p.data.id, mid);
  putDoc(mid, "SRS", "done", "# SRS\n\n## Đăng nhập\n\nEmail tối đa 100 ký tự, mật khẩu tối thiểu 8 ký tự.\n", { srs: { sections: [{ key: "s1", title: "Đăng nhập", content: "Email tối đa 100 ký tự" }] } });
  putDoc(mid, "UC_SPEC", "done", "# UC Specification\n", { useCases: [UC] });
  putDoc(mid, "FRD_NFR", "draft", "# FRD-NFR\n", { requirements: REQS });

  // Sinh màn: AI nhận bối cảnh user story + SRS + FRD-NFR (thay cho requirementInput)
  const s = await api("POST", `/api/modules/${mid}/screens`, {
    prompt: "Màn hình đăng nhập bằng email và mật khẩu (bắt buộc, mật khẩu tối thiểu 8 ký tự, email tối đa 100 ký tự), nút Đăng nhập",
    name: "Đăng nhập",
  });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const sid = s.data.screen.id;
  assert.equal(s.data.screen.rev, 1);
  assert.equal(s.data.screen.revisionRequested, false);
  const runs = await api("GET", `/api/modules/${mid}/runs`);
  const genInput = runs.data.find((r: any) => r.type === "generate_screen").input as string;
  assert.match(genInput, /US-01/);
  assert.match(genInput, /FR-01/);
  assert.match(genInput, /mật khẩu tối thiểu 8 ký tự/); // từ SRS

  // Prompt trống: AI (mock) thiết kế theo tên màn + story/FR liên quan
  const s2 = await api("POST", `/api/modules/${mid}/screens`, { prompt: "", name: "Báo cáo doanh thu" });
  assert.equal(s2.status, 200, JSON.stringify(s2.data));
  assert.equal((await api("POST", `/api/modules/${mid}/screens`, { prompt: "", name: "" })).status, 400);

  // Bình luận theo component + sửa theo vùng, có baseRev
  const ann = await api("POST", `/api/screens/${sid}/annotations`, { nodeIds: ["btn_login"], comment: 'Đổi chữ thành "Vào hệ thống"', bbox: { x: 1, y: 2, w: 3, h: 4 } });
  assert.equal(ann.status, 200);
  const edit = await api("POST", `/api/screens/${sid}/edit`, { prompt: "", nodeIds: [], annotationIds: [ann.data.id], baseRev: 1 });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  assert.equal(edit.data.version.scope, "region");
  assert.deepEqual(edit.data.version.selectedIds, ["btn_login"]);
  // Chặn đè: gửi lại rev cũ → 409 CONFLICT kèm rev hiện tại
  const stale = await api("POST", `/api/screens/${sid}/edit`, { prompt: "Thêm nút Huỷ", nodeIds: [], annotationIds: [], baseRev: 1 });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, "CONFLICT");
  assert.equal(stale.data.rev, 2);

  let detail = await api("GET", `/api/modules/${mid}`);
  let scr = detail.data.screens.find((x: any) => x.id === sid);
  assert.ok(JSON.stringify(scr.tree).includes("Vào hệ thống"));
  assert.equal(scr.rev, 2);
  assert.equal(detail.data.annotations[0].status, "sent");
  // Tài liệu module đọc từ module_docs (đợt 5)
  assert.deepEqual(detail.data.docs.requirements.map((r: any) => r.code), ["FR-01", "FR-02", "NFR-01"]);
  assert.equal(detail.data.testsRev, 0);

  // Phiên bản + khôi phục (baseRev)
  const versions = await api("GET", `/api/screens/${sid}/versions`);
  assert.equal(versions.data.length, 2);
  const rv = await api("POST", `/api/screens/${sid}/revert`, { versionId: versions.data[0].id, baseRev: 2 });
  assert.equal(rv.status, 200, JSON.stringify(rv.data));
  assert.equal(rv.data.number, 3);

  // Màn đang Xong (C7 bấm) + cờ Yêu cầu sửa → sửa → về Bản nháp, giữ cờ
  setArtifactState({ kind: "screen", id: sid, moduleId: mid }, { status: "done", revisionRequested: true });
  const e2 = await api("POST", `/api/screens/${sid}/manual`, { op: "up", id: "btn_login", baseRev: 3 });
  assert.ok([200, 400].includes(e2.status), JSON.stringify(e2.data)); // nút có thể đã ở đầu container
  const e3 = await api("POST", `/api/screens/${sid}/edit`, { prompt: 'Đổi tiêu đề thành "Đăng nhập tài khoản"', nodeIds: [], annotationIds: [] });
  assert.equal(e3.status, 200, JSON.stringify(e3.data));
  detail = await api("GET", `/api/modules/${mid}`);
  scr = detail.data.screens.find((x: any) => x.id === sid);
  assert.equal(scr.status, "draft");
  assert.equal(scr.revisionRequested, true);

  // Test case: chặn khi FRD-NFR chưa Xong, kèm lý do
  const blocked = await api("POST", `/api/modules/${mid}/tests/generate`, { baseRev: 0 });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /FRD-NFR.*Done/);
  assert.equal((await api("GET", `/api/modules/${mid}/tests/readiness`)).data.ready, false);
  putDoc(mid, "FRD_NFR", "done", "# FRD-NFR\n", { requirements: REQS });
  assert.equal((await api("GET", `/api/modules/${mid}/tests/readiness`)).data.source, "v5");
  const tests = await api("POST", `/api/modules/${mid}/tests/generate`, { baseRev: 0 });
  assert.equal(tests.status, 200, JSON.stringify(tests.data));
  assert.ok(tests.data.length >= 2);
  for (const fr of ["FR-01", "FR-02"]) assert.ok(tests.data.some((t: any) => t.requirementCodes.includes(fr)), `${fr} chưa có test`);
  detail = await api("GET", `/api/modules/${mid}`);
  assert.equal(detail.data.testsStatus, "draft");
  assert.equal(detail.data.testsRev, 1);
  assert.equal(detail.data.testsRevisionRequested, false);
  const again = await api("POST", `/api/modules/${mid}/tests/generate`, { baseRev: 0 });
  assert.equal(again.status, 409);
  assert.equal(again.data.code, "CONFLICT");

  // Truy vết Story → UC → FR → Màn → TC, chỉ ra chỗ hở
  const tr = await api("GET", `/api/modules/${mid}/trace`);
  assert.equal(tr.status, 200);
  const mx = tr.data.matrix;
  assert.deepEqual(mx.storyLinks["US-01"].map((l: any) => l.code), ["UC-01"]);
  assert.deepEqual(mx.gaps.storiesWithoutUc, ["US-02"]);
  assert.deepEqual(mx.gaps.frWithoutTest, []);
  assert.ok(!mx.gaps.frWithoutScreen.includes("FR-01"), "FR-01 phải gắn được màn Đăng nhập");
  const row = mx.rows.find((r: any) => r.requirement === "FR-01");
  assert.equal(row.story, "US-01");
  assert.equal(row.useCase, "UC-01");
  assert.ok(row.screens.some((x: any) => x.id === sid));
  assert.ok(row.tests.length >= 1);
  assert.equal(tr.data.coverage.flowsWithTests, tr.data.coverage.flowsTotal);

  // Màn đang Xong bị sửa → bộ test (bước sau) thành Bản cũ
  setArtifactState({ kind: "tests", id: mid, moduleId: mid }, { status: "done" });
  setArtifactState({ kind: "screen", id: sid, moduleId: mid }, { status: "done" });
  const st = await api("GET", `/api/artifacts/screen/${sid}/state`);
  const e4 = await api("POST", `/api/screens/${sid}/edit`, { prompt: 'Thêm nút "Đăng nhập bằng Google"', nodeIds: ["login_form"], annotationIds: [], baseRev: st.data.rev });
  assert.equal(e4.status, 200, JSON.stringify(e4.data));
  detail = await api("GET", `/api/modules/${mid}`);
  assert.equal(detail.data.testsStatus, "outdated");
  assert.equal(detail.data.screens.find((x: any) => x.id === sid).status, "draft");

  // Xuất HTML tĩnh tự chứa
  const html = await fetch(`${base}/api/screens/${sid}/export/html`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get("content-type") ?? "", /text\/html/);
  assert.match(html.headers.get("content-disposition") ?? "", /attachment/);
  const text = await html.text();
  assert.match(text, /^<!doctype html>/);
  assert.ok(text.includes("Vào hệ thống"));
  assert.ok(!/<script|<link /i.test(text));
  const inline = await fetch(`${base}/api/screens/${sid}/export/html?inline=1`);
  assert.match(inline.headers.get("content-disposition") ?? "", /^inline/);
  assert.equal((await api("GET", `/api/screens/khong-co/export/html`)).status, 404);

  // Bỏ BR-01: luồng tài liệu cũ sinh được khi chưa có màn nào Đã duyệt
  const docs = await api("POST", `/api/modules/${mid}/docs/generate`);
  assert.equal(docs.status, 200, JSON.stringify(docs.data));

  const xlsx = await api("GET", `/api/modules/${mid}/export/xlsx`);
  assert.equal(xlsx.status, 200);
  const xz = await JSZip.loadAsync(xlsx.data);
  assert.ok((await xz.file("xl/worksheets/sheet1.xml")!.async("string")).includes("TC-001"));
});

test("luồng cũ (v2) vẫn chạy: tài liệu cũ đã duyệt → test case → BR-02 khi sửa màn đã duyệt", async () => {
  const p = await api("POST", "/api/projects", { name: "Luồng cũ" });
  const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Xác thực", requirementInput: "As a Khách hàng, I want đăng nhập để mua hàng" });
  const mid = m.data.id;
  const s = await api("POST", `/api/modules/${mid}/screens`, { prompt: "Màn hình đăng nhập bằng email và mật khẩu (bắt buộc, mật khẩu tối thiểu 8 ký tự), nút Đăng nhập", name: "Đăng nhập" });
  const sid = s.data.screen.id;
  await api("POST", `/api/screens/${sid}/approve`, {});
  const docs = await api("POST", `/api/modules/${mid}/docs/generate`);
  assert.equal(docs.status, 200, JSON.stringify(docs.data));
  assert.ok(docs.data.useCases.length >= 1);
  assert.equal(docs.data.srs.sections.length, 7);
  // Chưa duyệt tài liệu cũ và không có FRD-NFR → chặn
  assert.equal((await api("POST", `/api/modules/${mid}/tests/generate`)).status, 400);
  const uc = docs.data.useCases[0].code;
  assert.equal((await api("POST", `/api/modules/${mid}/docs/refine`, { target: uc, instruction: "Bổ sung khóa tài khoản sau 5 lần sai" })).status, 200);
  await api("POST", `/api/modules/${mid}/docs/approve`, {});
  const tests = await api("POST", `/api/modules/${mid}/tests/generate`);
  assert.equal(tests.status, 200, JSON.stringify(tests.data));
  assert.ok(tests.data.length > 3);
  const tr = await api("GET", `/api/modules/${mid}/trace`);
  assert.equal(tr.data.coverage.flowsWithTests, tr.data.coverage.flowsTotal);

  await api("POST", `/api/screens/${sid}/edit`, { prompt: 'Thêm nút "Đăng nhập bằng Google"', nodeIds: ["login_form"], annotationIds: [] });
  const detail = await api("GET", `/api/modules/${mid}`);
  assert.equal(detail.data.docsStatus, "outdated");
  assert.equal(detail.data.testsStatus, "outdated");
  assert.equal(detail.data.screens[0].status, "draft");

  const docx = await api("GET", `/api/modules/${mid}/export/docx`);
  assert.equal(docx.status, 200);
  const dz = await JSZip.loadAsync(docx.data);
  assert.ok((await dz.file("word/document.xml")!.async("string")).includes(uc));
  const runs = await api("GET", `/api/modules/${mid}/runs`);
  assert.ok(runs.data.length >= 6);
});
test("đường gọi Claude thật: tool use, tự sửa khi kết quả sai schema, ghi log token", async () => {
  // Giả lập Claude API: lần 1 trả cây sai (gốc không phải Page), lần 2 trả đúng
  fakeClaude = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const parsed = JSON.parse(body);
    claudeCalls.push({ url: req.url, headers: req.headers, body: parsed });
    const good = claudeCalls.length > 1;
    const tree = good
      ? { id: "page", type: "Page", props: { title: "Từ Claude" }, children: [{ id: "h", type: "Heading", props: { text: "Xin chào" } }] }
      : { id: "card", type: "Card", props: {} };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ content: [{ type: "tool_use", id: `tu_${claudeCalls.length}`, name: "submit_screen", input: { name: "Chào", tree } }], usage: { input_tokens: 100, output_tokens: 50 } }));
  });
  await new Promise<void>((r) => fakeClaude.listen(0, r));
  process.env.ANTHROPIC_API_KEY = "sk-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fakeClaude.address() as AddressInfo).port}`;
  try {
    const p = await api("POST", "/api/projects", { name: "P2" });
    const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "M2" });
    const s = await api("POST", `/api/modules/${m.data.id}/screens`, { prompt: "Trang chào", name: "" });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.equal(s.data.screen.name, "Chào");
    assert.equal(claudeCalls.length, 2);
    assert.equal(claudeCalls[0].headers["x-api-key"], "sk-test");
    assert.deepEqual(claudeCalls[0].body.tool_choice, { type: "tool", name: "submit_screen" });
    const second = claudeCalls[1].body.messages.at(-1).content[0];
    assert.equal(second.type, "tool_result");
    assert.equal(second.is_error, true);
    const runs = await api("GET", `/api/modules/${m.data.id}/runs`);
    assert.equal(runs.data[0].provider, "claude");
    assert.equal(runs.data[0].inputTokens, 200);
    assert.match(runs.data[0].error, /self-corrected/);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
  }
});
test("Claude qua cổng trung gian: ANTHROPIC_AUTH_TOKEN gửi Authorization: Bearer, base URL có dấu / cuối", async () => {
  // Dùng lại máy chủ giả của test trên (đã qua lần trả sai nên từ đây luôn trả cây đúng)
  process.env.ANTHROPIC_AUTH_TOKEN = "tok-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fakeClaude.address() as AddressInfo).port}/`;
  const before = claudeCalls.length;
  try {
    const p = await api("POST", "/api/projects", { name: "P3" });
    const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "M3" });
    const s = await api("POST", `/api/modules/${m.data.id}/screens`, { prompt: "Trang chào", name: "" });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    assert.equal(claudeCalls.length, before + 1);
    assert.equal(claudeCalls[before].url, "/v1/messages");
    assert.equal(claudeCalls[before].headers.authorization, "Bearer tok-test");
    assert.equal(claudeCalls[before].headers["x-api-key"], undefined);
  } finally {
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
  }
});

test("gợi ý bố cục (Recursive): phần tử tiếp theo, hoàn thành bố cục, chấp nhận, sửa tay, event", async () => {
  const p = await api("POST", "/api/projects", { name: "Gợi ý" });
  const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Sản phẩm" });
  const s = await api("POST", `/api/modules/${m.data.id}/screens`, { prompt: "Form thêm sản phẩm: tên, giá; nút Lưu", name: "Thêm sản phẩm" });
  const sid = s.data.screen.id;
  const tree = s.data.version.tree;
  // khung bao giả: xếp mọi node theo chiều dọc, mỗi node cao 40 px, thụt vào theo độ sâu
  const boxes: Record<string, number[]> = {};
  let y = 0;
  const lay = (n: any, depth: number) => {
    const y0 = y;
    y += 40;
    (n.children ?? []).forEach((c: any) => lay(c, depth + 1));
    boxes[n.id] = [depth * 16, y0, 1280 - depth * 16, Math.max(y, y0 + 40)];
  };
  lay(tree, 0);
  const layout = { pageWidth: 1280, boxes };

  assert.equal((await api("POST", `/api/screens/${sid}/suggestions`, { nodeIds: [] })).status, 400); // thiếu khung bao
  const r = await api("POST", `/api/screens/${sid}/suggestions`, { nodeIds: [], layout, mode: "next" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(Array.isArray(r.data.items) && r.data.items.length <= 3);
  assert.equal(r.data.model.kind, "recursive");
  assert.ok(r.data.model.trees >= 1);
  const form = tree.children.find((c: any) => c.type === "Form") ?? tree;
  const one = await api("POST", `/api/screens/${sid}/suggestions`, { nodeIds: [form.id], layout, mode: "next" });
  assert.equal(one.data.items.length, 1);
  const e = one.data.items[0];
  assert.equal(e.parentId, form.id);
  assert.equal(e.candidates.length, 3);
  assert.ok(e.candidates.every((c: any) => c.p >= 0 && c.p <= 1) && e.pEos >= 0 && e.boxPx.length === 4);
  const all = await api("POST", `/api/screens/${sid}/suggestions`, { nodeIds: [], layout, mode: "complete" });
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(all.data.items));

  // chấp nhận: chèn Checkbox vào đầu form và một Row mới chứa Button ở cuối
  const acc = await api("POST", `/api/screens/${sid}/layout/accept`, {
    versionId: r.data.versionId,
    items: [{ ref: "a", parentId: form.id, index: 0, type: "Checkbox" }, { ref: "g1", parentId: form.id, index: 99, type: "Row" }, { ref: "g2", parentId: "g1", index: 0, type: "Button" }],
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  assert.equal(acc.data.version.kind, "layout");
  const f2 = acc.data.version.tree.children.find((c: any) => c.id === form.id) ?? acc.data.version.tree;
  assert.equal(f2.children[0].type, "Checkbox");
  assert.equal(f2.children.at(-1).type, "Row");
  assert.equal(f2.children.at(-1).children[0].type, "Button");
  assert.equal(acc.data.added.length, 3);
  // gợi ý cũ (phiên bản trước) không còn đúng
  assert.equal((await api("POST", `/api/screens/${sid}/layout/accept`, { versionId: r.data.versionId, items: [{ ref: "x", parentId: form.id, index: 0, type: "Text" }] })).status, 409);
  assert.equal((await api("POST", `/api/screens/${sid}/layout/accept`, { versionId: acc.data.version.id, items: [{ ref: "x", parentId: form.id, index: 0, type: "Page" }] })).status, 400);

  // sửa tay: chuyển xuống, xóa
  const down = await api("POST", `/api/screens/${sid}/manual`, { op: "down", id: f2.children[0].id });
  assert.equal(down.data.version.kind, "manual");
  const f3 = down.data.version.tree.children.find((c: any) => c.id === form.id) ?? down.data.version.tree;
  assert.equal(f3.children[1].type, "Checkbox");
  const rm = await api("POST", `/api/screens/${sid}/manual`, { op: "remove", id: f2.children[0].id });
  assert.equal(JSON.stringify(rm.data.version.tree).includes(f2.children[0].id), false);
  assert.equal((await api("POST", `/api/screens/${sid}/manual`, { op: "remove", id: tree.id })).status, 400);

  for (const action of ["shown", "shown", "applied", "dismissed"])
    assert.equal((await api("POST", "/api/suggestions/events", { screenId: sid, versionId: r.data.versionId, kind: "layout", targetNodeId: form.id, title: "Checkbox", confidence: 0.4, action })).status, 200);
  assert.equal((await api("POST", "/api/suggestions/events", { screenId: sid, action: "bad" })).status, 400);
  const st = await api("GET", `/api/modules/${m.data.id}/suggestion-stats`);
  assert.equal(st.data.shown, 2);
  assert.equal(st.data.applied, 1);
  assert.equal(st.data.acceptanceRate, 0.5);
});
