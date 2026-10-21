// Bộ chấm AQUSA (shared/aqusa.ts): ví dụ lấy từ bài báo (Bảng 2, §5.1, §6) và ví dụ tự viết – không lấy từ tập test.
import "../shared/nlp-node.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSet, chunk, ALL_V2 } from "../shared/aqusa.ts";

const crit = (texts: string[], i = 0, v2 = ALL_V2) => new Set(analyzeSet(texts, { v2 })[i].map((d) => d.criterion));

test("chunk tách role / means / ends", () => {
  const c = chunk("As a manager, I want to export orders so that I can report.");
  assert.equal(c.role, "manager");
  assert.equal(c.means, "export orders");
  assert.equal(c.ends, "I can report.");
});

test("well-formed: thiếu role hoặc means", () => {
  assert.ok(crit(["I want to export orders."]).has("well-formed"));
  assert.ok(crit(["As a manager, export orders please."]).has("well-formed"));
  assert.ok(!crit(["As a manager, I want to export orders."]).has("well-formed"));
});

test("atomic: hai hành động nối bằng and; không tính hai tân ngữ của một động từ", () => {
  assert.ok(crit(["As a manager, I want to add and delete products."]).has("atomic"));
  assert.ok(crit(["As a user, I want to see my orders and cancel an order."]).has("atomic"));
  assert.ok(!crit(["As a manager, I want to export orders and invoices."]).has("atomic"));
  assert.ok(!crit(["As a user, I want to update my profile and the type of alerts I receive."]).has("atomic"));
});

test("atomic v2 §6.5: R&D Manager không phải hai vai trò; Admin & Editor là hai vai trò", () => {
  assert.ok(!crit(["As an R&D Manager, I want to view budgets."]).has("atomic"));
  assert.ok(crit(["As an Admin & Editor, I want to publish articles."]).has("atomic"));
});

test("atomic v2 §6.3: '/' nối hai động từ; không tính UI/UX", () => {
  assert.ok(crit(["As an editor, I want to create/edit pages."]).has("atomic"));
  assert.ok(!crit(["As a developer, I want to attend UI/UX lessons."]).has("atomic"));
});

test("minimal: chữ thừa ở đầu, ngoặc; v2 §6.6 bỏ qua viết tắt", () => {
  assert.ok(crit(["[Analytics] As a marketing analyst, I want to see a dashboard."]).has("minimal"));
  assert.ok(crit(["As a user, I want to filter orders (by date, status and customer)."]).has("minimal"));
  assert.ok(!crit(["As a user, I want to use the Content Management System (CMS) so that I can edit pages."]).has("minimal"));
  assert.ok(crit(["As a user, I want to use the Content Management System (CMS) so that I can edit pages."], 0, []).has("minimal"));
});

test("uniform: lệch mẫu đa số; 'I want to be able to' cùng họ 'I want'", () => {
  const set = ["As a user, I want to log in.", "As a user, I want to be able to log out.", "As a user, I can reset my password.", "As a user, I want to view orders."];
  assert.ok(!crit(set, 1).has("uniform"));
  assert.ok(crit(set, 2).has("uniform"));
});

test("unique: trùng chính xác (bỏ qua hoa thường, dấu câu)", () => {
  const set = ["As a user, I want to log in.", "as a user I want to log in"];
  assert.ok(crit(set, 1).has("unique"));
  assert.ok(!crit(set, 0).has("unique"));
});
