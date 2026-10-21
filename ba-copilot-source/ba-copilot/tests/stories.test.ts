// User story cấp dự án (C4, đợt 5): CRUD, mã US tăng dần, chặn đè 409, sửa story làm BRD thành Bản cũ, QUS lưu theo module.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getDb, openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { on } from "../server/events.ts";
import { storiesText } from "../server/repo/stories.ts";
import type { ArtifactEvent } from "../shared/types.ts";
import { extractModel } from "../shared/extract.ts";
import { storyKey, suggestionSources, suggestNextScreens, toSuggestion } from "../shared/suggest.ts";
import { mockMissingScreens } from "../server/ai/mock.ts";

let server: Server;
let base = "";
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as any };
}
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server?.close());

async function setup(name = "Dự án") {
  const p = (await api("POST", "/api/projects", { name })).data;
  const m1 = (await api("POST", `/api/projects/${p.id}/modules`, { name: "Đơn hàng" })).data;
  const m2 = (await api("POST", `/api/projects/${p.id}/modules`, { name: "Thanh toán" })).data;
  return { p, m1, m2 };
}

const GOOD = { asA: "Khách hàng", iWant: "xem lịch sử đơn hàng", soThat: "theo dõi giao hàng", acceptanceCriteria: ["Hiện 20 đơn mới nhất"] };

test("CRUD user story: thêm, xem, lọc theo module, sửa, xoá", async () => {
  const { p, m1, m2 } = await setup();
  const created = await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id, priority: "High", acceptanceCriteria: [" Hiện 20 đơn ", "", "Có ô tìm"] });
  assert.equal(created.status, 200);
  const s = created.data;
  assert.equal(s.code, "US-01");
  assert.equal(s.rev, 1);
  assert.equal(s.moduleId, m1.id);
  assert.equal(s.priority, "High");
  assert.deepEqual(s.acceptanceCriteria, ["Hiện 20 đơn", "Có ô tìm"], "bỏ dòng trống, cắt khoảng trắng");

  // Dòng mới trống (chỉ có module) vẫn tạo được, mặc định Medium
  const blank = (await api("POST", `/api/projects/${p.id}/stories`, { moduleId: m2.id })).data;
  assert.equal(blank.priority, "Medium");
  assert.equal(blank.moduleId, m2.id);

  assert.equal((await api("GET", `/api/stories/${s.id}`)).data.iWant, "xem lịch sử đơn hàng");
  assert.equal((await api("GET", `/api/projects/${p.id}/stories`)).data.length, 2);
  assert.deepEqual((await api("GET", `/api/projects/${p.id}/stories?moduleId=${m1.id}`)).data.map((x: any) => x.id), [s.id]);
  assert.deepEqual((await api("GET", `/api/projects/${p.id}/stories?moduleId=${m2.id}`)).data.map((x: any) => x.id), [blank.id]);

  const upd = await api("PATCH", `/api/stories/${s.id}`, { soThat: "biết khi nào nhận hàng", moduleId: m2.id, baseRev: 1 });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.rev, 2);
  assert.equal(upd.data.soThat, "biết khi nào nhận hàng");
  assert.equal(upd.data.asA, "Khách hàng", "trường không gửi giữ nguyên");
  assert.equal(upd.data.moduleId, m2.id);

  // Không đổi gì → không tăng rev
  assert.equal((await api("PATCH", `/api/stories/${s.id}`, { asA: "Khách hàng", baseRev: 2 })).data.rev, 2);

  assert.equal((await api("DELETE", `/api/stories/${s.id}`)).status, 200);
  assert.equal((await api("GET", `/api/stories/${s.id}`)).status, 404);
  assert.equal((await api("PATCH", `/api/stories/khong-co`, { asA: "x" })).status, 404);
});

test("Kiểm dữ liệu: module khác dự án, độ ưu tiên sai, tiêu chí không phải danh sách → 400", async () => {
  const { p, m1 } = await setup("A");
  const other = await setup("B");
  assert.equal((await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: other.m1.id })).status, 400);
  assert.equal((await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id, priority: "Urgent" })).status, 400);
  assert.equal((await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id, acceptanceCriteria: "một dòng" })).status, 400);
  assert.equal((await api("POST", `/api/projects/khong-co/stories`, { ...GOOD, moduleId: m1.id })).status, 404);
});

test("Module bắt buộc: dự án chưa có module / thiếu module → 400 kèm câu nhắc; story cũ chưa gắn module được giữ và gắn lại", async () => {
  const empty = (await api("POST", "/api/projects", { name: "Trống" })).data;
  const none = await api("POST", `/api/projects/${empty.id}/stories`, GOOD);
  assert.equal(none.status, 400);
  assert.match(none.data.error, /create a module before/);

  const { p, m1, m2 } = await setup("Bắt buộc");
  for (const moduleId of [undefined, null, "", "  "]) {
    const r = await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId });
    assert.equal(r.status, 400, `moduleId = ${JSON.stringify(moduleId)}`);
    assert.match(r.data.error, /No module selected/);
  }
  const la = await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: "khong-co" });
  assert.equal(la.status, 400);
  assert.match(la.data.error, /module does not exist/);
  assert.equal((await api("GET", `/api/projects/${p.id}/stories`)).data.length, 0, "không tạo story nào khi bị từ chối");

  // Story cũ: xoá module → story còn, chưa gắn module
  const s = (await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id })).data;
  await api("DELETE", `/api/modules/${m1.id}`);
  const legacy = (await api("GET", `/api/stories/${s.id}`)).data;
  assert.equal(legacy.moduleId, null);
  assert.deepEqual((await api("GET", `/api/projects/${p.id}/stories?moduleId=none`)).data.map((x: any) => x.id), [s.id]);
  // Sửa nội dung không gửi moduleId → vẫn được; bỏ gắn (null / rỗng) → 400; gắn lại module hợp lệ → được
  assert.equal((await api("PATCH", `/api/stories/${s.id}`, { iWant: "xem đơn", baseRev: legacy.rev })).status, 200);
  assert.equal((await api("PATCH", `/api/stories/${s.id}`, { moduleId: null })).status, 400);
  assert.equal((await api("PATCH", `/api/stories/${s.id}`, { moduleId: "" })).status, 400);
  const fixed = await api("PATCH", `/api/stories/${s.id}`, { moduleId: m2.id });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.data.moduleId, m2.id);
  assert.equal((await api("GET", `/api/projects/${p.id}/stories?moduleId=none`)).data.length, 0);
});

test("Mã US tăng dần theo dự án, không dùng lại mã ở giữa đã xoá, dự án khác đánh lại từ US-01", async () => {
  const { p, m1 } = await setup("Mã");
  const codes: string[] = [];
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const s = (await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id })).data;
    codes.push(s.code);
    ids.push(s.id);
  }
  assert.deepEqual(codes, ["US-01", "US-02", "US-03"]);
  await api("DELETE", `/api/stories/${ids[1]}`);
  assert.equal((await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id })).data.code, "US-04");
  const q = await setup("Khác");
  assert.equal((await api("POST", `/api/projects/${q.p.id}/stories`, { ...GOOD, moduleId: q.m1.id })).data.code, "US-01");
});

test("Chặn đè: lệch rev khi sửa hoặc xoá → 409 CONFLICT kèm rev hiện tại", async () => {
  const { p, m1 } = await setup("Đè");
  const s = (await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id })).data;
  assert.equal((await api("PATCH", `/api/stories/${s.id}`, { iWant: "A sửa", baseRev: 1 })).data.rev, 2);
  const late = await api("PATCH", `/api/stories/${s.id}`, { iWant: "B sửa trên bản cũ", baseRev: 1 });
  assert.equal(late.status, 409);
  assert.equal(late.data.code, "CONFLICT");
  assert.equal(late.data.rev, 2);
  assert.equal((await api("GET", `/api/stories/${s.id}`)).data.iWant, "A sửa", "bản của A không bị đè");
  // Xoá: baseRev đi ở query
  assert.equal((await api("DELETE", `/api/stories/${s.id}?baseRev=1`)).status, 409);
  assert.equal((await api("DELETE", `/api/stories/${s.id}?baseRev=2`)).status, 200);
});

test("Sắp xếp: ids theo thứ tự mới, story không gửi xếp sau, id lạ → 400", async () => {
  const { p, m1 } = await setup("Thứ tự");
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push((await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id })).data.id);
  const res = await api("POST", `/api/projects/${p.id}/stories/reorder`, { ids: [ids[2], ids[0]] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.map((s: any) => s.id), [ids[2], ids[0], ids[1]]);
  assert.deepEqual((await api("GET", `/api/projects/${p.id}/stories`)).data.map((s: any) => s.order), [1, 2, 3]);
  assert.equal((await api("POST", `/api/projects/${p.id}/stories/reorder`, { ids: ["la"] })).status, 400);
});

test("Sửa story làm tài liệu đang có của module thành Bản cũ + phát artifact.stale; người sửa được ghi", async () => {
  const { p, m1, m2 } = await setup("BRD");
  const member = (await api("POST", "/api/members", { name: "Lan", role: "BA" })).data;
  const s = (await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id })).data;
  const at = new Date().toISOString();
  const ins = getDb().prepare("INSERT INTO module_docs (module_id, kind, content, status, rev, updated_at) VALUES (?, ?, '# x', ?, 1, ?)");
  ins.run(m1.id, "BRD", "done", at);
  ins.run(m1.id, "UC_SPEC", "approved", at);
  ins.run(m2.id, "BRD", "done", at);
  const events: ArtifactEvent[] = [];
  const off = on("artifact.stale", (e) => events.push(e));
  try {
    const upd = await api("PATCH", `/api/stories/${s.id}`, { iWant: "xem chi tiết đơn hàng", baseRev: 1, actorId: member.id });
    assert.equal(upd.data.updatedBy, member.id);
    const status = (mid: string, kind: string) => (getDb().prepare("SELECT status FROM module_docs WHERE module_id = ? AND kind = ?").get(mid, kind) as any).status;
    assert.equal(status(m1.id, "BRD"), "outdated");
    assert.equal(status(m1.id, "UC_SPEC"), "outdated");
    assert.equal(status(m2.id, "BRD"), "done", "module khác không bị ảnh hưởng");
    assert.deepEqual(
      events.map((e) => [e.artifact.kind, e.artifact.id, e.artifact.sub, e.actorId]),
      [
        ["doc", m1.id, "BRD", member.id],
        ["doc", m1.id, "UC_SPEC", member.id],
      ],
    );
    // Đổi thứ tự không làm tài liệu thành Bản cũ
    events.length = 0;
    await api("POST", `/api/projects/${p.id}/stories/reorder`, { ids: [s.id] });
    assert.equal(events.length, 0);
    // Chuyển story sang module 2 → BRD module 2 cũng thành Bản cũ
    await api("PATCH", `/api/stories/${s.id}`, { moduleId: m2.id });
    assert.equal(status(m2.id, "BRD"), "outdated");
  } finally {
    off();
  }
});

test("QUS lưu theo module khi story đổi; storiesText ghép story cho AI", async () => {
  const { p, m1 } = await setup("QUS");
  const qus = async () => (await api("GET", `/api/modules/${m1.id}/qus`)).data;
  assert.equal((await qus()).score, null);
  const s = (await api("POST", `/api/projects/${p.id}/stories`, { ...GOOD, moduleId: m1.id, priority: "High" })).data;
  assert.equal((await qus()).score, 100);
  await api("PATCH", `/api/stories/${s.id}`, { soThat: "" }); // thiếu lợi ích → NO_END −15
  const q = await qus();
  assert.equal(q.score, 85);
  assert.equal(q.result.stories[0].code, "US-01");
  assert.equal(q.result.stories[0].id, s.id);

  await api("POST", `/api/projects/${p.id}/stories`, { moduleId: m1.id, iWant: "xuất hoá đơn", acceptanceCriteria: [] });
  assert.equal(
    storiesText(m1.id),
    ["US-01 (High): As a Khách hàng, I want xem lịch sử đơn hàng.", "  Acceptance criteria:", "  - Hiện 20 đơn mới nhất", "US-02 (Medium): I want xuất hoá đơn."].join("\n"),
  );
  await api("DELETE", `/api/stories/${s.id}`);
  assert.ok((await qus()).score < 85);
});

test("Gợi ý màn (shared/suggest.ts + Mock) đọc story có cấu trúc: tên màn từ I want, nguồn là mã US, bỏ story trống", () => {
  const model = extractModel([]);
  const sources = suggestionSources([], [
    { code: "US-01", asA: "Khách hàng", iWant: "xem lịch sử đơn hàng", soThat: "theo dõi giao hàng" },
    { code: "US-02", asA: "", iWant: "", soThat: "" },
  ]);
  assert.equal(sources.length, 1);
  const byKey = new Map(sources.map((s) => [s.key, s]));
  const uncovered = mockMissingScreens(model, sources).map((x) => toSuggestion(byKey.get(x.key)!, x.name, x.reason));
  const res = suggestNextScreens({ model, uncovered });
  assert.equal(res.length, 1);
  assert.equal(res[0].kind, "uncovered-story");
  assert.equal(res[0].source, "US-01");
  assert.match(res[0].name, /^Xem lịch sử đơn hàng/);
  assert.match(res[0].prompt, /US-01: As a Khách hàng, I want xem lịch sử đơn hàng, so that theo dõi giao hàng\./);
  assert.equal(res[0].key, storyKey("As a Khách hàng, I want xem lịch sử đơn hàng, so that theo dõi giao hàng."));
});
