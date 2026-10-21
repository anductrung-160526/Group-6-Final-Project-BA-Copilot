// Sơ đồ UC (A5, FN-11 → FN-14): hàm thuần buildUcMermaid, bản Mock, API diagram và sự kiện.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { on } from "../server/events.ts";
import * as repo from "../server/repo.ts";
import { mockUcDiagram } from "../server/ai/mock.ts";
import { buildUcMermaid, checkUcMermaid, inferRelations, readSourceHash, ucLabel, ucSourceHash, type UcDiagramInput } from "../shared/ucDiagram.ts";
import type { ArtifactEvent, UseCase } from "../shared/types.ts";

const uc = (code: string, name: string, actors: string[], extra: Partial<UseCase> = {}): UseCase => ({
  code,
  name,
  actors,
  description: "",
  trigger: "",
  preconditions: [],
  postconditions: [],
  mainFlow: [],
  altFlows: [],
  exceptions: [],
  businessRules: [],
  screenIds: [],
  assumptions: [],
  ...extra,
});

const SAMPLE: UseCase[] = [
  uc("UC-01", "Đặt hàng", ["Khách hàng"], {
    mainFlow: [{ no: 1, actor: "Khách hàng", text: "Đăng nhập theo UC-02" }],
    altFlows: [{ code: "A1", name: "Có mã giảm giá", branchFrom: 2, steps: ["Khách hàng áp mã theo UC-03"] }],
  }),
  uc("UC-02", "Đăng nhập", ["Khách hàng", "Quản trị viên"]),
  uc("UC-03", "Áp mã giảm giá", ["Khách hàng"]),
];

// ------------------------------------------------------------------ hàm thuần
describe("buildUcMermaid", () => {
  test("actor là hình tròn, UC là hình bầu dục trong khung Hệ thống, có cạnh actor – UC", () => {
    const code = buildUcMermaid(SAMPLE, ["Khách hàng", "Quản trị viên"]);
    const lines = code.split("\n").map((l) => l.trim());
    assert.equal(lines[0], "flowchart LR");
    assert.ok(lines.includes('A1(("Khách hàng"))'));
    assert.ok(lines.includes('A2(("Quản trị viên"))'));
    assert.ok(lines.includes('subgraph SYS["Hệ thống"]'));
    assert.ok(lines.includes('UC1(["UC-01: Đặt hàng"])'));
    assert.ok(lines.includes('UC3(["UC-03: Áp mã giảm giá"])'));
    assert.ok(lines.includes("A1 --- UC1"));
    assert.ok(lines.includes("A2 --- UC2"));
    assert.deepEqual(checkUcMermaid(code), []);
  });

  test("«include» từ luồng chính, «extend» từ luồng thay thế (UC mở rộng → UC gốc)", () => {
    const code = buildUcMermaid(SAMPLE, []);
    assert.ok(code.includes('UC1 -.->|"«include»"| UC2'), code);
    assert.ok(code.includes('UC3 -.->|"«extend»"| UC1'), code);
  });

  test("quan hệ khai báo sẵn và quan hệ truyền vào; bỏ UC không tồn tại, tự trỏ, trùng lặp", () => {
    const ucs: UcDiagramInput[] = [
      { code: "UC-01", name: "A", actors: ["X"], includes: ["UC-02", "UC-02", "UC-09", "UC-01"] },
      { code: "UC-02", name: "B", actors: ["X"], extends: ["uc-01"] },
    ];
    assert.deepEqual(inferRelations(ucs), [
      { from: "UC-01", to: "UC-02", type: "include" },
      { from: "UC-02", to: "UC-01", type: "extend" },
    ]);
    const code = buildUcMermaid(ucs, [], [{ from: "UC-02", to: "UC-01", type: "include" }, { from: "UC-01", to: "UC-77", type: "extend" }]);
    assert.ok(code.includes('UC2 -.->|"«include»"| UC1'));
    assert.ok(!code.includes("«extend»"));
  });

  test("luồng thay thế trùng tên UC khác → «extend»", () => {
    const ucs = [uc("UC-01", "Thanh toán", ["Khách"], { altFlows: [{ code: "A1", name: "Áp mã giảm giá", branchFrom: 1, steps: [] }] }), uc("UC-02", "Áp mã giảm giá", ["Khách"])];
    assert.ok(buildUcMermaid(ucs).includes('UC2 -.->|"«extend»"| UC1'));
  });

  test("actor: gộp trùng (không phân biệt hoa thường), bỏ 'Hệ thống', thêm actor chỉ có trong UC", () => {
    const code = buildUcMermaid([uc("UC-01", "A", ["khách hàng", "Hệ thống", "Kế toán"])], ["Khách hàng"]);
    assert.equal((code.match(/\(\("/g) ?? []).length, 2);
    assert.ok(code.includes('A1(("Khách hàng"))'));
    assert.ok(code.includes('A2(("Kế toán"))'));
    assert.ok(!code.includes('(("Hệ thống"))'));
    assert.ok(code.includes("A1 --- UC1") && code.includes("A2 --- UC1"));
  });

  test("nhãn có ngoặc kép, xuống dòng, < > vẫn cho mã hợp lệ", () => {
    const code = buildUcMermaid([uc("UC-01", 'Xuất "báo cáo"\n<tháng>', ['Người "dùng"'])]);
    assert.ok(code.includes(`UC1(["UC-01: Xuất 'báo cáo' tháng"])`), code);
    assert.ok(code.includes(`A1(("Người 'dùng'"))`));
    assert.deepEqual(checkUcMermaid(code), []);
    assert.equal(ucLabel("x".repeat(100)).length, 80);
  });

  test("không có UC: vẫn sinh mã hợp lệ có ô giữ chỗ", () => {
    const code = buildUcMermaid([], []);
    assert.ok(code.includes("Chưa có Use Case"));
    assert.deepEqual(checkUcMermaid(code), []);
  });

  test("mã băm nguồn UC: ghi trong mã, ổn định, đổi khi tên/actor/quan hệ đổi, không đổi khi chỉ đổi mô tả", () => {
    const code = buildUcMermaid(SAMPLE);
    assert.equal(readSourceHash(code), ucSourceHash(SAMPLE));
    assert.equal(ucSourceHash(SAMPLE), ucSourceHash(structuredClone(SAMPLE)));
    assert.equal(ucSourceHash(SAMPLE.map((u) => ({ ...u, description: "khác", assumptions: ["x"] }))), ucSourceHash(SAMPLE));
    assert.notEqual(ucSourceHash([{ ...SAMPLE[0], name: "Đặt hàng nhanh" }, ...SAMPLE.slice(1)]), ucSourceHash(SAMPLE));
    assert.notEqual(ucSourceHash([{ ...SAMPLE[0], actors: ["Khách vãng lai"] }, ...SAMPLE.slice(1)]), ucSourceHash(SAMPLE));
    assert.notEqual(ucSourceHash([{ ...SAMPLE[0], mainFlow: [] }, ...SAMPLE.slice(1)]), ucSourceHash(SAMPLE));
    assert.equal(ucSourceHash([{ ...SAMPLE[0], mainFlow: [{ no: 1, actor: "Khách hàng", text: "Đăng nhập (UC-02) bằng email" }] }, ...SAMPLE.slice(1)]), ucSourceHash(SAMPLE));
    assert.equal(readSourceHash("flowchart LR\n  A --- B"), null);
  });

  test("checkUcMermaid bắt lỗi thường gặp", () => {
    assert.deepEqual(checkUcMermaid(""), ["Mã sơ đồ trống"]);
    assert.ok(checkUcMermaid("sequenceDiagram\n A->>B: x").some((e) => e.includes("Dòng đầu")));
    assert.ok(checkUcMermaid('flowchart LR\n subgraph S["x"]\n A').some((e) => e.includes('Thiếu "end"')));
    assert.ok(checkUcMermaid('flowchart LR\n A(("x))').some((e) => e.includes("ngoặc kép")));
  });

  test("bản Mock dùng lại buildUcMermaid với actor gom từ UC", () => {
    assert.equal(mockUcDiagram(SAMPLE).code, buildUcMermaid(SAMPLE, ["Khách hàng", "Quản trị viên"]));
  });
});

// ------------------------------------------------------------------ API + sự kiện (chế độ Mock)
let server: Server;
let base = "";
const events: ArtifactEvent[] = [];

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as any };
}
const diagramEvents = () => events.filter((e) => e.artifact.kind === "diagram").map((e) => e.type.replace("artifact.", ""));

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const t of ["artifact.drafted", "artifact.approved", "artifact.unapproved", "artifact.stale"] as const) on(t, (e) => events.push(e));
});
after(() => server.close());

/** Module có 1 màn đã duyệt và tài liệu đã sinh (Mock). */
async function moduleWithDocs() {
  const p = await api("POST", "/api/projects", { name: "Dự án sơ đồ" });
  const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Xác thực", requirementInput: "As a Khách hàng, I want đăng nhập để mua hàng" });
  const mid = m.data.id as string;
  const s = await api("POST", `/api/modules/${mid}/screens`, { prompt: "Màn hình đăng nhập bằng email và mật khẩu, nút Đăng nhập", name: "Đăng nhập" });
  await api("POST", `/api/screens/${s.data.screen.id}/approve`, {});
  const d = await api("POST", `/api/modules/${mid}/docs/generate`, {});
  assert.equal(d.status, 200, JSON.stringify(d.data));
  return mid;
}

describe("API sơ đồ UC (Mock)", () => {
  test("GET khi chưa sinh → null; module không tồn tại → 404; chưa có UC → generate 400; chưa có sơ đồ → approve 400", async () => {
    const p = await api("POST", "/api/projects", { name: "P" });
    const m = await api("POST", `/api/projects/${p.data.id}/modules`, { name: "Trống" });
    // Hợp đồng: trả `null` khi chưa sinh (R-009).
    const empty = await api("GET", `/api/modules/${m.data.id}/diagram`);
    assert.equal(empty.status, 200);
    assert.equal(empty.data, null);
    assert.equal((await api("GET", "/api/modules/khong-co/diagram")).status, 404);
    const g = await api("POST", `/api/modules/${m.data.id}/diagram/generate`, {});
    assert.equal(g.status, 400);
    assert.match(g.data.error, /Use Case/);
    assert.equal((await api("POST", `/api/modules/${m.data.id}/diagram/approve`, { approved: true })).status, 400);
  });

  test("FN-11 → FN-13: sinh (Mock) → sửa mã → duyệt → sửa lại → bỏ duyệt, đúng trạng thái và sự kiện", async () => {
    const mid = await moduleWithDocs();
    events.length = 0;

    // FN-11: sinh bằng Mock, mã hợp lệ, có ghi nhật ký AI
    const g = await api("POST", `/api/modules/${mid}/diagram/generate`, { actorId: "mem-1" });
    assert.equal(g.status, 200, JSON.stringify(g.data));
    assert.equal(g.data.status, "draft");
    assert.equal(g.data.moduleId, mid);
    assert.deepEqual(checkUcMermaid(g.data.code), []);
    assert.equal(g.data.code, buildUcMermaid(repo.getDocs(mid).useCases, ["Khách hàng"]));
    assert.ok(g.data.code.includes("Khách hàng"));
    const run = repo.listRuns(mid).find((r: any) => r.type === "generate_uc_diagram");
    assert.ok(run, "phải ghi nhật ký AI");
    assert.equal(run!.provider, "mock");
    assert.deepEqual(diagramEvents(), ["drafted"]);
    assert.equal(events.at(-1)!.actorId, "mem-1");
    assert.deepEqual(events.at(-1)!.artifact, { kind: "diagram", id: mid, moduleId: mid });
    assert.deepEqual((await api("GET", `/api/modules/${mid}/diagram`)).data, g.data);

    // FN-13: duyệt
    const a = await api("POST", `/api/modules/${mid}/diagram/approve`, { approved: true });
    assert.equal(a.data.status, "approved");
    assert.ok(a.data.approvedAt);
    // Duyệt lần nữa: không đổi, không phát thêm sự kiện; body rỗng = duyệt
    assert.equal((await api("POST", `/api/modules/${mid}/diagram/approve`, {})).data.status, "approved");
    assert.deepEqual(diagramEvents(), ["drafted", "approved"]);

    // FN-12: sửa mã khi Đã duyệt → về Nháp, phát unapproved rồi drafted
    const code = g.data.code + '\n  UC1 -.->|"«include»"| UC1';
    const s = await api("PUT", `/api/modules/${mid}/diagram`, { code });
    assert.equal(s.status, 200);
    assert.equal(s.data.status, "draft");
    assert.equal(s.data.approvedAt, null);
    assert.equal(s.data.code, code);
    assert.deepEqual(diagramEvents(), ["drafted", "approved", "unapproved", "drafted"]);

    // Bỏ duyệt khi đang Nháp: không đổi, không phát sự kiện
    assert.equal((await api("POST", `/api/modules/${mid}/diagram/approve`, { approved: false })).data.status, "draft");
    await api("POST", `/api/modules/${mid}/diagram/approve`, { approved: true });
    const u = await api("POST", `/api/modules/${mid}/diagram/approve`, { approved: false });
    assert.equal(u.data.status, "draft");
    assert.deepEqual(diagramEvents(), ["drafted", "approved", "unapproved", "drafted", "approved", "unapproved"]);

    // Sinh lại khi Đã duyệt → unapproved + drafted
    await api("POST", `/api/modules/${mid}/diagram/approve`, { approved: true });
    events.length = 0;
    assert.equal((await api("POST", `/api/modules/${mid}/diagram/generate`, {})).data.status, "draft");
    assert.deepEqual(diagramEvents(), ["unapproved", "drafted"]);
  });

  test("PUT kiểm tra dữ liệu: thiếu code / rỗng → 400", async () => {
    const mid = await moduleWithDocs();
    assert.equal((await api("PUT", `/api/modules/${mid}/diagram`, {})).status, 400);
    assert.equal((await api("PUT", `/api/modules/${mid}/diagram`, { code: "   " })).status, 400);
    assert.equal((await api("PUT", `/api/modules/${mid}/diagram`, { code: 123 })).status, 400);
  });

  test("FN-14: UC đổi khi sinh lại / chỉnh tài liệu → sơ đồ Bản cũ, phát artifact.stale; chỉ chỉnh SRS thì giữ nguyên", async () => {
    const mid = await moduleWithDocs();
    await api("POST", `/api/modules/${mid}/diagram/generate`, {});
    await api("POST", `/api/modules/${mid}/diagram/approve`, { approved: true });
    events.length = 0;

    // Chỉnh mục SRS: UC không đổi → sơ đồ vẫn Đã duyệt
    const srs = repo.getDocs(mid).srs!.sections[0].key;
    assert.equal((await api("POST", `/api/modules/${mid}/docs/refine`, { target: `SRS:${srs}`, instruction: "Viết gọn hơn" })).status, 200);
    assert.equal((await api("GET", `/api/modules/${mid}/diagram`)).data.status, "approved");
    assert.deepEqual(diagramEvents(), []);

    // UC đổi tên (giả lập AI chỉnh UC) rồi chỉnh tài liệu → Bản cũ
    const [first, ...rest] = repo.getDocs(mid).useCases;
    repo.saveUseCase(mid, { ...first, name: first.name + " (đã đổi)" });
    assert.equal((await api("POST", `/api/modules/${mid}/docs/refine`, { target: first.code, instruction: "Đổi tên", actorId: "mem-2" })).status, 200);
    const d = await api("GET", `/api/modules/${mid}/diagram`);
    assert.equal(d.data.status, "stale");
    assert.deepEqual(diagramEvents(), ["stale"]);
    assert.equal(events.find((e) => e.type === "artifact.stale" && e.artifact.kind === "diagram")!.actorId, "mem-2");
    void rest;

    // Đã là Bản cũ: không phát lại
    await api("POST", `/api/modules/${mid}/docs/refine`, { target: first.code, instruction: "Lần nữa" });
    assert.deepEqual(diagramEvents(), ["stale"]);

    // Sinh lại sơ đồ → Nháp; BA xoá dòng mã băm rồi lưu → lần sinh lại tài liệu sau coi như UC đổi
    await api("POST", `/api/modules/${mid}/diagram/generate`, {});
    const noHash = (await api("GET", `/api/modules/${mid}/diagram`)).data.code.replace(/^.*nguon-uc.*$/m, "");
    await api("PUT", `/api/modules/${mid}/diagram`, { code: noHash });
    events.length = 0;
    assert.equal((await api("POST", `/api/modules/${mid}/docs/generate`, {})).status, 200);
    assert.equal((await api("GET", `/api/modules/${mid}/diagram`)).data.status, "stale");
    assert.deepEqual(diagramEvents(), ["stale"]);
  });

  test("Xoá module xoá luôn sơ đồ (CASCADE)", async () => {
    const mid = await moduleWithDocs();
    await api("POST", `/api/modules/${mid}/diagram/generate`, {});
    assert.equal((await api("DELETE", `/api/modules/${mid}`)).status, 200);
    assert.equal((await api("GET", `/api/modules/${mid}/diagram`)).status, 404);
  });
});
