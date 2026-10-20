// Bảng quyết định nextStatus(): đủ 4 trạng thái × 4 sự kiện (FN-20 → FN-22). Chủ sở hữu: A7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStatus, statusReason } from "../shared/taskRules.ts";
import type { ArtifactEventType, TaskStatus } from "../shared/types.ts";

// null = giữ nguyên
const TABLE: Record<TaskStatus, Record<ArtifactEventType, TaskStatus | null>> = {
  todo: { "artifact.drafted": "doing", "artifact.approved": "done", "artifact.unapproved": null, "artifact.stale": null },
  doing: { "artifact.drafted": null, "artifact.approved": "done", "artifact.unapproved": null, "artifact.stale": null },
  done: { "artifact.drafted": null, "artifact.approved": null, "artifact.unapproved": "redo", "artifact.stale": "redo" },
  redo: { "artifact.drafted": "doing", "artifact.approved": "done", "artifact.unapproved": null, "artifact.stale": null },
};

for (const [current, row] of Object.entries(TABLE) as [TaskStatus, Record<ArtifactEventType, TaskStatus | null>][]) {
  for (const [event, expected] of Object.entries(row) as [ArtifactEventType, TaskStatus | null][]) {
    test(`nextStatus: ${current} + ${event} → ${expected ?? "giữ nguyên"}`, () => {
      assert.equal(nextStatus(current, event), expected);
    });
  }
}

test("nextStatus: bảng đủ 16 ô và không bao giờ trả về trạng thái hiện tại", () => {
  const statuses: TaskStatus[] = ["todo", "doing", "done", "redo"];
  const events: ArtifactEventType[] = ["artifact.drafted", "artifact.approved", "artifact.unapproved", "artifact.stale"];
  let n = 0;
  for (const s of statuses)
    for (const e of events) {
      n++;
      assert.notEqual(nextStatus(s, e), s, `${s} + ${e}`);
    }
  assert.equal(n, 16);
});

test("statusReason: ghi rõ sản phẩm, tên và lý do (FN-23)", () => {
  assert.equal(statusReason("artifact.approved", "screen", "Đăng nhập"), "Màn hình “Đăng nhập” đã được duyệt");
  assert.equal(statusReason("artifact.drafted", "screen", "Đăng nhập"), "Màn hình “Đăng nhập” có bản nháp mới");
  assert.equal(statusReason("artifact.unapproved", "docs", "Xác thực"), "Tài liệu “Xác thực” bị bỏ duyệt");
  assert.match(statusReason("artifact.stale", "tests", "Xác thực"), /Bộ test “Xác thực” thành Lỗi thời.*BR-02/);
  assert.match(statusReason("artifact.stale", "diagram", "Xác thực"), /Sơ đồ UC.*FN-14/);
  assert.equal(statusReason("artifact.drafted", "tests"), "Bộ test vừa được sinh");
});
