// Task gắn sản phẩm đi theo sự kiện (server/taskAutomation.ts, đợt 5). Chủ sở hữu: C7.
// Phát thẳng sự kiện như các agent sản phẩm (C5, C6, C9) và luồng duyệt (C7) sẽ làm, trong tx() như nơi phát thật.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, getDb, tx } from "../src/db.ts";
import { createApp } from "../src/app.ts";
import { emit } from "../src/events.ts";
import { registerTaskAutomation } from "../src/taskAutomation.ts";
import * as repo from "../src/repo.ts";
import * as tasks from "../src/repo/tasks.ts";
import type { ArtifactEventType, ArtifactRef, DiagramKind, DocKind } from "../../shared/types.ts";

let server: Server;

before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/frontend/public" });
  // Gọi 2 lần: vẫn chỉ một bộ handler.
  registerTaskAutomation();
  registerTaskAutomation();
  await new Promise<void>((r) => server.listen(0, r));
  void (server.address() as AddressInfo).port;
});
after(() => server.close());

function setup(name: string) {
  const pid = repo.createProject(`Dự án ${name}`).id;
  const mid = repo.createModule(pid, name).id;
  const sid = repo.createScreen(mid, "Đăng nhập").id;
  return { pid, mid, sid };
}

function task(pid: string, title: string, a?: { kind: ArtifactRef["kind"]; id: string; moduleId: string; sub?: DocKind | DiagramKind | null }) {
  return tasks.createTask(pid, {
    moduleId: a?.moduleId ?? null,
    title,
    description: "",
    assigneeId: null,
    dueDate: null,
    priority: "Medium",
    artifactType: a?.kind ?? null,
    artifactId: a?.id ?? null,
    artifactSub: a?.sub ?? null,
  }).id;
}

const fire = (type: ArtifactEventType, artifact: ArtifactRef, actorId?: string) => tx(() => emit({ type, artifact, actorId }));
const state = (id: string) => {
  const t = tasks.getTask(id)!;
  return `${t.status}${t.revisionRequested ? "+cờ" : ""}`;
};
const sysEvents = (id: string) => tasks.listEvents(id).filter((e) => e.bySystem);

test("tài liệu theo sub: drafted → done → revision_requested → done → approved; tài liệu khác không bị động", () => {
  const { pid, mid } = setup("Xác thực");
  const brd: ArtifactRef = { kind: "doc", id: mid, moduleId: mid, sub: "BRD" };
  const tBrd = task(pid, "BRD", { kind: "doc", id: mid, moduleId: mid, sub: "BRD" });
  const tSrs = task(pid, "SRS", { kind: "doc", id: mid, moduleId: mid, sub: "SRS" });
  const tFree = task(pid, "Họp khách hàng");

  fire("artifact.drafted", brd);
  assert.equal(state(tBrd), "doing");
  fire("artifact.done", brd);
  assert.equal(state(tBrd), "done");
  fire("artifact.revision_requested", brd);
  assert.equal(state(tBrd), "doing+cờ");
  fire("artifact.drafted", brd);
  assert.equal(state(tBrd), "doing+cờ", "sửa tiếp giữ cờ");
  fire("artifact.done", brd);
  assert.equal(state(tBrd), "done+cờ");
  fire("artifact.approved", brd);
  assert.equal(state(tBrd), "approved");
  assert.deepEqual(
    sysEvents(tBrd).map((e) => `${e.fromStatus}→${e.toStatus}`),
    ["todo→doing", "doing→done", "done→doing", "doing→done", "done→approved"],
  );
  assert.equal(sysEvents(tBrd)[2].reason, "BA Lead requested changes to BRD document – Xác thực");
  assert.equal(sysEvents(tBrd)[4].reason, "BA Lead approved BRD document – Xác thực");

  for (const t of [tSrs, tFree]) {
    assert.equal(state(t), "todo");
    assert.equal(sysEvents(t).length, 0);
  }

  // Sửa sản phẩm đã duyệt → Đang làm (phải bấm Xong lại)
  fire("artifact.drafted", brd);
  assert.equal(state(tBrd), "doing");
  assert.equal(sysEvents(tBrd).at(-1)!.reason, "BRD document – Xác thực has a new draft");

  // doc thiếu sub (sai hợp đồng) → không đoán
  fire("artifact.done", { kind: "doc", id: mid, moduleId: mid });
  assert.equal(state(tSrs), "todo");
});

test("stale: Xong / Đã duyệt → Đang làm, đang làm thì giữ", () => {
  const { pid, mid } = setup("Giỏ hàng");
  const ref = (sub: DocKind): ArtifactRef => ({ kind: "doc", id: mid, moduleId: mid, sub });
  const tUc = task(pid, "UC", { kind: "doc", id: mid, moduleId: mid, sub: "UC_SPEC" });
  const tSrs = task(pid, "SRS", { kind: "doc", id: mid, moduleId: mid, sub: "SRS" });
  fire("artifact.done", ref("UC_SPEC"));
  fire("artifact.approved", ref("UC_SPEC"));
  fire("artifact.drafted", ref("SRS"));
  fire("artifact.stale", ref("UC_SPEC"));
  fire("artifact.stale", ref("SRS"));
  assert.equal(state(tUc), "doing");
  assert.equal(state(tSrs), "doing");
  assert.match(sysEvents(tUc).at(-1)!.reason, /UC Specification document – Giỏ hàng became Outdated/);
});

test("sơ đồ: task cũ không có sub = Use Case; sơ đồ khác không bị động", () => {
  const { pid, mid } = setup("Thanh toán");
  const tOld = task(pid, "Sơ đồ UC cũ", { kind: "diagram", id: mid, moduleId: mid });
  const tErd = task(pid, "ERD", { kind: "diagram", id: mid, moduleId: mid, sub: "ERD" });
  assert.equal(tasks.getTask(tOld)!.artifactSub, "UC");
  getDb().prepare("UPDATE tasks SET artifact_sub = NULL WHERE id = ?").run(tOld); // như dữ liệu trước đợt 5
  fire("artifact.drafted", { kind: "diagram", id: mid, moduleId: mid }); // mã v2 phát không có sub
  assert.equal(state(tOld), "doing");
  assert.equal(state(tErd), "todo");
  fire("artifact.done", { kind: "diagram", id: mid, moduleId: mid, sub: "ERD" });
  assert.equal(state(tErd), "done");
  assert.equal(sysEvents(tErd)[0].reason, "BA marked ERD diagram – Thanh toán as done");
});

test("mã v2: duyệt màn bằng route cũ → task Đã duyệt; bỏ duyệt → Đang làm; actorId lạ không làm hỏng thao tác", async () => {
  const { pid, mid, sid } = setup("Hồ sơ");
  const tScreen = task(pid, "Màn Đăng nhập", { kind: "screen", id: sid, moduleId: mid });
  const lan = randomUUID();
  getDb().prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, 'Lan', 'BA_LEAD', ?)").run(lan, new Date().toISOString());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  assert.equal((await post(`/api/screens/${sid}/approve`, { actorId: lan })).status, 200);
  assert.equal(state(tScreen), "approved");
  assert.equal(sysEvents(tScreen)[0].byMemberId, lan);
  assert.equal(sysEvents(tScreen)[0].reason, "BA Lead approved Screen “Đăng nhập”");

  assert.equal((await post(`/api/screens/${sid}/approve`, { approved: false, actorId: "khong-ton-tai" })).status, 200);
  assert.equal(state(tScreen), "doing");
  assert.equal(sysEvents(tScreen)[1].byMemberId, null);
  assert.equal(sysEvents(tScreen).length, 2, "đăng ký 2 lần nhưng mỗi lần đổi chỉ ghi một dòng");
});

test("Yêu cầu sửa khi task đang Đang làm: chỉ bật cờ, vẫn ghi một dòng lịch sử", () => {
  const { pid, mid, sid } = setup("Đơn hàng");
  const t = task(pid, "Màn", { kind: "screen", id: sid, moduleId: mid });
  tasks.setTaskStatus(t, "doing");
  fire("artifact.revision_requested", { kind: "screen", id: sid, moduleId: mid });
  assert.equal(state(t), "doing+cờ");
  const ev = sysEvents(t);
  assert.equal(ev.length, 1);
  assert.equal(`${ev[0].fromStatus}→${ev[0].toStatus}`, "doing→doing");
});
