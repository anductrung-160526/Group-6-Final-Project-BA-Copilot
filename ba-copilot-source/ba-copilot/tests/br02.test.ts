// BR-02: thiết kế (màn) đã duyệt bị sửa / khôi phục / bỏ duyệt → tài liệu hiện có (bộ cũ + 5 tài liệu `module_docs`) và
// bộ test thành Bản cũ, phát artifact.stale, task gắn kèm đi theo; sơ đồ dựa trên tài liệu vừa thành Bản cũ cũng thành Bản cũ.
// Màn chỉ Xong (chưa duyệt) bị sửa → chỉ bộ test thành Bản cũ. Chạy server thật (Mock), DB trong bộ nhớ.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { getDb, openDb, setArtifactState } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { on } from "../server/events.ts";
import type { ArtifactEvent } from "../shared/types.ts";

let server: Server;
let base = "";
let pid = "";
let ba = "";
let lead = "";
const stale: ArtifactEvent[] = [];

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
}

function member(name: string, role: "BA" | "BA_LEAD"): string {
  const id = randomUUID();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)").run(id, name, role, new Date().toISOString());
  return id;
}

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.AI_MODE = "mock";
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  on("artifact.stale", (e) => stale.push(e));
  pid = (await api("POST", "/api/projects", { name: "BR-02" })).data.id;
  ba = member("Đức", "BA");
  lead = member("Hùng", "BA_LEAD");
});
after(() => server.close());

const now = () => new Date().toISOString();
const docSt = (mid: string, k: string) => getDb().prepare("SELECT status, revision_requested AS rr, rev FROM module_docs WHERE module_id = ? AND kind = ?").get(mid, k) as { status: string; rr: number; rev: number } | undefined;
const diaSt = (mid: string, k: string) => (getDb().prepare("SELECT status FROM module_diagrams WHERE module_id = ? AND kind = ?").get(mid, k) as { status: string }).status;
const testsSt = (mid: string) => (getDb().prepare("SELECT tests_status AS s FROM modules WHERE id = ?").get(mid) as { s: string }).s;
const taskSt = (id: string) => (getDb().prepare("SELECT status FROM tasks WHERE id = ?").get(id) as { status: string }).status;

/**
 * Module có story, màn (Mock), tài liệu BRD Đã duyệt · UC Spec Xong (cờ Yêu cầu sửa) · SRS Xong · FRD-NFR Bản nháp ·
 * API Spec chưa sinh, sơ đồ UC Xong, bộ test Xong; task gắn BRD, UC Spec, sơ đồ UC, bộ test.
 */
async function setup(name: string, screen: "approved" | "done") {
  const mid = (await api("POST", `/api/projects/${pid}/modules`, { name })).data.id as string;
  getDb()
    .prepare("INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, created_at, updated_at) VALUES (?, ?, ?, ?, 'Shopper', 'to sign in', 'I can buy', ?, ?)")
    .run(randomUUID(), pid, mid, `US-${name}`, now(), now());
  const s = await api("POST", `/api/modules/${mid}/screens`, { prompt: "Sign-in screen with email, password and a Sign in button", name: `Sign in ${name}` });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const sid = s.data.screen.id as string;
  const ins = getDb().prepare("INSERT INTO module_docs (module_id, kind, content, status, revision_requested, rev, updated_at) VALUES (?, ?, '# Content', ?, ?, 1, ?)");
  ins.run(mid, "BRD", "approved", 0, now());
  ins.run(mid, "UC_SPEC", "done", 1, now());
  ins.run(mid, "SRS", "done", 0, now());
  ins.run(mid, "FRD_NFR", "draft", 0, now());
  getDb().prepare("INSERT INTO module_diagrams (module_id, kind, code, status, rev, updated_at) VALUES (?, 'UC', 'flowchart LR', 'done', 1, ?)").run(mid, now());
  setArtifactState({ kind: "tests", id: mid, moduleId: mid }, { status: "done" });
  // Màn qua luồng duyệt thật: Xong (BA) → Duyệt (BA Lead)
  assert.equal((await api("POST", `/api/artifacts/screen/${sid}/done`, { actorId: ba })).status, 200);
  if (screen === "approved") assert.equal((await api("POST", `/api/artifacts/screen/${sid}/approve`, { actorId: lead })).status, 200);
  const task = async (b: object) => {
    const r = await api("POST", `/api/projects/${pid}/tasks`, { title: "t", ...b });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data.id as string;
  };
  const tasks = {
    brd: await task({ artifactType: "doc", artifactId: mid, artifactSub: "BRD" }),
    uc: await task({ artifactType: "doc", artifactId: mid, artifactSub: "UC_SPEC" }),
    diagram: await task({ artifactType: "diagram", artifactId: mid, artifactSub: "UC" }),
    tests: await task({ artifactType: "tests", artifactId: mid }),
  };
  // Task mới gắn sản phẩm đã Xong / Đã duyệt bắt đầu đúng trạng thái đó
  assert.deepEqual([taskSt(tasks.brd), taskSt(tasks.uc), taskSt(tasks.diagram), taskSt(tasks.tests)], ["approved", "done", "done", "done"]);
  stale.length = 0;
  return { mid, sid, tasks };
}

const staleKeys = () => stale.map((e) => `${e.artifact.kind}${e.artifact.sub ? `:${e.artifact.sub}` : ""}`).sort();

/** Kiểm tra trạng thái sau BR-02. */
function assertOutdated(mid: string, tasks: Record<string, string>) {
  assert.deepEqual(
    ["BRD", "UC_SPEC", "SRS", "FRD_NFR"].map((k) => docSt(mid, k)!.status),
    ["outdated", "outdated", "outdated", "outdated"],
    "mọi tài liệu đang có nội dung (cả Bản nháp) thành Bản cũ",
  );
  assert.equal(docSt(mid, "API_SPEC"), undefined, "tài liệu chưa sinh giữ nguyên");
  assert.equal(docSt(mid, "UC_SPEC")!.rr, 1, "giữ cờ Yêu cầu sửa");
  assert.equal(docSt(mid, "BRD")!.rev, 1, "Bản cũ không tăng rev của tài liệu");
  assert.equal(testsSt(mid), "outdated");
  assert.equal(diaSt(mid, "UC"), "outdated", "sơ đồ dựa trên UC Spec vừa thành Bản cũ cũng thành Bản cũ");
  assert.deepEqual(staleKeys(), ["diagram:UC", "doc:BRD", "doc:FRD_NFR", "doc:SRS", "doc:UC_SPEC", "tests"]);
  assert.deepEqual([taskSt(tasks.brd), taskSt(tasks.uc), taskSt(tasks.diagram), taskSt(tasks.tests)], ["doing", "doing", "doing", "doing"], "task gắn kèm về Đang làm");
}

test("BR-02: sửa màn đã duyệt (khôi phục phiên bản) → tài liệu module_docs + test + sơ đồ phụ thuộc thành Bản cũ, task đi theo", async () => {
  const { mid, sid, tasks } = await setup("restore", "approved");
  const versions = (await api("GET", `/api/screens/${sid}/versions`)).data;
  const rev = (await api("GET", `/api/artifacts/screen/${sid}/state`)).data.rev;
  const r = await api("POST", `/api/screens/${sid}/revert`, { versionId: versions[versions.length - 1].id, baseRev: rev, actorId: ba });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await api("GET", `/api/artifacts/screen/${sid}/state`)).data.status, "draft");
  assertOutdated(mid, tasks);
  // Màn Tài liệu đọc trạng thái qua API → hiện "Outdated"
  const docs = (await api("GET", `/api/modules/${mid}/docs`)).data;
  assert.deepEqual(docs.map((d: any) => d.status), ["outdated", "outdated", "outdated", "outdated", "none"]);
});

test("BR-02: BA Lead Yêu cầu sửa màn đã duyệt (bỏ duyệt) → tài liệu + test thành Bản cũ", async () => {
  const { mid, sid, tasks } = await setup("request-change", "approved");
  const r = await api("POST", `/api/artifacts/screen/${sid}/request-change`, { actorId: lead });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assertOutdated(mid, tasks);
});

test("BR-02: bỏ duyệt màn qua endpoint v2 (/api/screens/:id/approve approved=false) → tài liệu + test thành Bản cũ", async () => {
  const { mid, sid, tasks } = await setup("unapprove", "approved");
  const r = await api("POST", `/api/screens/${sid}/approve`, { approved: false, actorId: lead });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assertOutdated(mid, tasks);
});

test("màn chỉ Xong (chưa duyệt) bị sửa / Yêu cầu sửa → chỉ bộ test thành Bản cũ, tài liệu giữ nguyên", async () => {
  const { mid, sid, tasks } = await setup("done-only", "done");
  const versions = (await api("GET", `/api/screens/${sid}/versions`)).data;
  const r = await api("POST", `/api/screens/${sid}/revert`, { versionId: versions[0].id, actorId: ba });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(
    ["BRD", "UC_SPEC", "SRS", "FRD_NFR"].map((k) => docSt(mid, k)!.status),
    ["approved", "done", "done", "draft"],
  );
  assert.equal(diaSt(mid, "UC"), "done");
  assert.equal(testsSt(mid), "outdated");
  assert.deepEqual(staleKeys(), ["tests"]);
  assert.deepEqual([taskSt(tasks.brd), taskSt(tasks.uc), taskSt(tasks.tests)], ["approved", "done", "doing"]);

  // Yêu cầu sửa màn đang Xong: như sửa – chỉ bộ test
  setArtifactState({ kind: "tests", id: mid, moduleId: mid }, { status: "done" });
  assert.equal((await api("POST", `/api/artifacts/screen/${sid}/done`, { actorId: ba })).status, 200);
  stale.length = 0;
  assert.equal((await api("POST", `/api/artifacts/screen/${sid}/request-change`, { actorId: lead })).status, 200);
  assert.equal(testsSt(mid), "outdated");
  assert.equal(docSt(mid, "SRS")!.status, "done");
  assert.deepEqual(staleKeys(), ["tests"]);
});

test("Duyệt tăng rev màn: bản còn thấy “Xong” sửa màn với rev cũ → 409, bản đã duyệt giữ nguyên", async () => {
  const mid = (await api("POST", `/api/projects/${pid}/modules`, { name: "stale-write" })).data.id as string;
  const s = await api("POST", `/api/modules/${mid}/screens`, { prompt: "Sign-in screen with email, password and a Sign in button", name: "Sign in" });
  const sid = s.data.screen.id as string;
  const v1 = s.data.version.id as string;
  const d = await api("POST", `/api/artifacts/screen/${sid}/done`, { actorId: ba, baseRev: 1 });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal(d.data.state.rev, 2);
  // Đức vừa bấm Xong: dùng rev trong kết quả thì sửa tiếp được, không bị báo xung đột giả
  const lead1 = await api("POST", `/api/artifacts/screen/${sid}/approve`, { actorId: lead, baseRev: d.data.state.rev });
  assert.equal(lead1.status, 200, JSON.stringify(lead1.data));
  assert.deepEqual([lead1.data.state.rev, lead1.data.state.updatedBy], [3, lead]);
  // Đức vẫn đang thấy “Xong” (rev 2) và khôi phục phiên bản → 409, không lặng lẽ đưa bản đã duyệt về Bản nháp
  const staleWrite = await api("POST", `/api/screens/${sid}/revert`, { versionId: v1, baseRev: 2, actorId: ba });
  assert.equal(staleWrite.status, 409);
  assert.equal(staleWrite.data.rev, 3);
  assert.equal((await api("GET", `/api/artifacts/screen/${sid}/state`)).data.status, "approved");
  // Yêu cầu sửa với rev cũ cũng bị chặn
  assert.equal((await api("POST", `/api/artifacts/screen/${sid}/request-change`, { actorId: lead, baseRev: 2 })).status, 409);
});
