// Quy tắc trạng thái task đợt 5 (shared/taskRules.ts): theo sự kiện sản phẩm + kéo thẻ bằng tay. Chủ sở hữu: C7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactTitle, moveError, nextStatus, nextTaskState, statusReason, taskMove, type TaskState } from "../shared/taskRules.ts";
import type { ArtifactEventType, TaskStatus } from "../shared/types.ts";

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
  assert.match(moveError("doing", "done", null)!, /Tôi là/);
  assert.equal(moveError("done", "approved", ba), "Chỉ BA Lead được duyệt");
  assert.equal(moveError("done", "approved", null), "Chỉ BA Lead được duyệt");
  assert.equal(moveError("done", "approved", lead), null);
  assert.equal(moveError("approved", "doing", ba), "Chỉ BA Lead được yêu cầu sửa");
  assert.equal(moveError("done", "doing", lead), null);
  assert.match(moveError("todo", "approved", lead)!, /Không chuyển thẳng từ “Cần làm” sang “Đã duyệt”/);
  assert.equal(moveError("doing", "doing", null), null, "không đổi thì không lỗi");
});

test("statusReason / artifactTitle: lý do tiếng Việt ghi rõ sản phẩm", () => {
  assert.equal(statusReason("artifact.revision_requested", "doc", "Xác thực", "BRD"), "BA Lead yêu cầu sửa Tài liệu BRD – Xác thực");
  assert.equal(statusReason("artifact.approved", "screen", "Đăng nhập"), "BA Lead duyệt Màn hình “Đăng nhập”");
  assert.equal(statusReason("artifact.done", "diagram", "Xác thực", "ERD"), "BA bấm Xong Sơ đồ ERD – Xác thực");
  assert.equal(statusReason("artifact.drafted", "screen", "Đăng nhập"), "Màn hình “Đăng nhập” có bản nháp mới");
  assert.equal(statusReason("artifact.drafted", "tests"), "Bộ test vừa được sinh");
  assert.equal(statusReason("artifact.stale", "doc", "Xác thực", "SRS"), "Tài liệu SRS – Xác thực thành Lỗi thời do bước trước thay đổi");
  assert.equal(statusReason("artifact.unapproved", "docs", "Xác thực"), "Tài liệu (cũ) – Xác thực bị bỏ duyệt");
  assert.equal(artifactTitle("diagram", null, "M"), "Sơ đồ Use Case – M", "sơ đồ thiếu sub = UC");
  assert.equal(artifactTitle("doc", "UC_SPEC", "M"), "Tài liệu UC Specification – M");
});
