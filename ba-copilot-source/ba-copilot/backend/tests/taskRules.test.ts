// Quy tắc trạng thái task đợt 5 (shared/taskRules.ts): theo sự kiện sản phẩm + kéo thẻ bằng tay. Chủ sở hữu: C7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactTitle, initialTaskState, moveError, nextStatus, nextTaskState, statusReason, taskMove, type TaskState } from "../../shared/taskRules.ts";
import type { ArtifactEventType, TaskStatus } from "../../shared/types.ts";

const S = (status: TaskStatus, revisionRequested = false): TaskState => ({ status, revisionRequested });
const fmt = (s: TaskState | null) => (s ? `${s.status}${s.revisionRequested ? "+cờ" : ""}` : "giữ");

// Bảng quyết định: trạng thái (không cờ / có cờ) × sự kiện → kết quả ("giữ" = không đổi gì)
const TABLE: [TaskState, ArtifactEventType, string][] = [
  [S("todo"), "artifact.drafted", "doing"],
  [S("doing"), "artifact.drafted", "giữ"],
  [S("doing", true), "artifact.drafted", "giữ"],
  [S("done"), "artifact.drafted", "doing"],
  [S("done", true), "artifact.drafted", "doing+cờ"],
  [S("approved"), "artifact.drafted", "doing"],
  [S("todo"), "artifact.done", "done"],
  [S("doing"), "artifact.done", "done"],
  [S("doing", true), "artifact.done", "done+cờ"],
  [S("done"), "artifact.done", "giữ"],
  [S("approved"), "artifact.done", "done"],
  [S("todo"), "artifact.approved", "approved"],
  [S("doing", true), "artifact.approved", "approved"],
  [S("done", true), "artifact.approved", "approved"],
  [S("approved"), "artifact.approved", "giữ"],
  [S("todo"), "artifact.revision_requested", "doing+cờ"],
  [S("doing"), "artifact.revision_requested", "doing+cờ"],
  [S("doing", true), "artifact.revision_requested", "giữ"],
  [S("done"), "artifact.revision_requested", "doing+cờ"],
  [S("approved"), "artifact.revision_requested", "doing+cờ"],
  [S("todo"), "artifact.stale", "giữ"],
  [S("doing"), "artifact.stale", "giữ"],
  [S("done"), "artifact.stale", "doing"],
  [S("done", true), "artifact.stale", "doing+cờ"],
  [S("approved"), "artifact.stale", "doing"],
  [S("done"), "artifact.unapproved", "doing"],
  [S("todo"), "artifact.unapproved", "giữ"],
  // "redo" cũ = Đang làm + cờ
  [S("redo"), "artifact.drafted", "doing+cờ"],
  [S("redo"), "artifact.done", "done+cờ"],
  [S("redo"), "artifact.approved", "approved"],
];

for (const [cur, ev, want] of TABLE) {
  test(`nextTaskState: ${fmt(cur)} + ${ev} → ${want}`, () => {
    assert.equal(fmt(nextTaskState(cur, ev)), want);
  });
}

test("nextTaskState không bao giờ trả về y hệt trạng thái hiện tại, và không bao giờ ghi redo", () => {
  const statuses: TaskStatus[] = ["todo", "doing", "done", "approved", "redo"];
  const events: ArtifactEventType[] = ["artifact.drafted", "artifact.done", "artifact.approved", "artifact.revision_requested", "artifact.stale", "artifact.unapproved"];
  for (const s of statuses)
    for (const rr of [false, true])
      for (const e of events) {
        const n = nextTaskState(S(s, rr), e);
        if (!n) continue;
        assert.notEqual(n.status, "redo");
        assert.ok(n.status !== s || n.revisionRequested !== rr, `${s}/${rr} + ${e}`);
      }
});

test("nextStatus: chỉ trạng thái, null khi trạng thái giữ nguyên", () => {
  assert.equal(nextStatus("todo", "artifact.drafted"), "doing");
  assert.equal(nextStatus("doing", "artifact.revision_requested"), null, "chỉ bật cờ, trạng thái giữ");
  assert.equal(nextStatus("done", "artifact.approved"), "approved");
});

test("taskMove + moveError: chỉ theo mũi tên, Xong cần người bấm, Duyệt / Yêu cầu sửa chỉ BA Lead", () => {
  const ba = { role: "BA" };
  const lead = { role: "BA_LEAD" };
  assert.equal(taskMove("todo", "doing"), "start");
  assert.equal(taskMove("doing", "done"), "done");
  assert.equal(taskMove("done", "approved"), "approve");
  assert.equal(taskMove("done", "doing"), "request-change");
  assert.equal(taskMove("approved", "doing"), "request-change");
  for (const [f, t] of [["todo", "done"], ["todo", "approved"], ["doing", "todo"], ["doing", "approved"], ["done", "todo"], ["approved", "done"], ["approved", "todo"]] as [TaskStatus, TaskStatus][])
    assert.equal(taskMove(f, t), null, `${f}→${t}`);

  assert.equal(moveError("todo", "doing", null), null);
  assert.equal(moveError("doing", "done", ba), null);
  assert.match(moveError("doing", "done", null)!, /Acting as/);
  assert.equal(moveError("done", "approved", ba), "Only a BA Lead can approve");
  assert.equal(moveError("done", "approved", null), "Only a BA Lead can approve");
  assert.equal(moveError("done", "approved", lead), null);
  assert.equal(moveError("approved", "doing", ba), "Only a BA Lead can request changes");
  assert.equal(moveError("done", "doing", lead), null);
  assert.match(moveError("todo", "approved", lead)!, /Cannot move directly from “To do” to “Approved”/);
  assert.equal(moveError("doing", "doing", null), null, "không đổi thì không lỗi");
});

test("statusReason / artifactTitle: lý do tiếng Việt ghi rõ sản phẩm", () => {
  assert.equal(statusReason("artifact.revision_requested", "doc", "Xác thực", "BRD"), "BA Lead requested changes to BRD document – Xác thực");
  assert.equal(statusReason("artifact.approved", "screen", "Đăng nhập"), "BA Lead approved Screen “Đăng nhập”");
  assert.equal(statusReason("artifact.done", "diagram", "Xác thực", "ERD"), "BA marked ERD diagram – Xác thực as done");
  assert.equal(statusReason("artifact.drafted", "screen", "Đăng nhập"), "Screen “Đăng nhập” has a new draft");
  assert.equal(statusReason("artifact.drafted", "tests"), "Test suite was generated");
  assert.equal(statusReason("artifact.stale", "doc", "Xác thực", "SRS"), "SRS document – Xác thực became Outdated because a previous step changed");
  assert.equal(statusReason("artifact.unapproved", "docs", "Xác thực"), "Documents (legacy) – Xác thực approval was withdrawn");
  assert.equal(artifactTitle("diagram", null, "M"), "Use Case diagram – M", "sơ đồ thiếu sub = UC");
  assert.equal(artifactTitle("doc", "UC_SPEC", "M"), "UC Specification document – M");
});

test("initialTaskState: task mới gắn sản phẩm bắt đầu khớp trạng thái sản phẩm", () => {
  const A = (status: string, revisionRequested = false) => ({ status, revisionRequested });
  const cases: [TaskStatus, ReturnType<typeof A> | null, string][] = [
    ["todo", null, "todo"],
    ["doing", null, "doing"],
    ["todo", A("none"), "todo"],
    ["todo", A("draft"), "todo"],
    ["doing", A("outdated"), "doing"],
    ["todo", A("draft", true), "doing+cờ"],
    ["todo", A("outdated", true), "doing+cờ"],
    ["todo", A("done"), "done"],
    ["doing", A("done", true), "done+cờ"],
    ["todo", A("approved"), "approved"],
    ["todo", A("approved", true), "approved"],
  ];
  for (const [req, art, want] of cases) assert.equal(fmt(initialTaskState(req, art)), want, `${req} + ${JSON.stringify(art)}`);
});
