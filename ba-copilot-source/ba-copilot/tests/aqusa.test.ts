// Bộ chấm AQUSA (shared/aqusa.ts): ví dụ lấy từ bài báo (Bảng 2, §5.1, §6) và ví dụ tự viết – không lấy từ dữ liệu đánh giá.
import "../shared/nlp-node.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSet, chunk } from "../shared/aqusa.ts";

const crit = (texts: string[], i = 0) => new Set(analyzeSet(texts)[i].map((d) => d.criterion));

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

test("liên từ trong mệnh đề phụ, '+' dính chữ, '/' sau tính từ không tính atomic", () => {
  assert.ok(!crit(["As a clerk, I want reports that summarise sales and highlight trends."]).has("atomic"));
  assert.ok(!crit(["As a dev, I want to learn how teams build and deploy apps."]).has("atomic"));
  assert.ok(!crit(["As a dev, I want to write C++ bindings."]).has("atomic"));
  assert.ok(!crit(["As an analyst, I want to save a custom chart/table."]).has("atomic"));
  assert.ok(crit(["As an analyst, I want to import a file and share it."]).has("atomic"));
});

test("'be + tính từ' là hành động; 'I don't want' là cụm chỉ dấu, lệch mẫu uniform", () => {
  assert.ok(!crit(["As a viewer, I want prices to be accurate."]).has("well-formed"));
  const set = ["As a user, I want to log in.", "As a user, I want to log out.", "As a user, I don't want to see ads."];
  assert.ok(!crit(set, 2).has("well-formed"));
  assert.ok(crit(set, 2).has("uniform"));
});

test("uniform xét phần ends trong các story có ends; '(s)' và '. So that' không tính minimal", () => {
  const set = ["As a user, I want to log in.", "As a user, I want to log out.", "As a user, I want to pay so that I get goods.", "As a user, I want to rate so that others know.", "As a user, I want to chat, so I can ask."];
  assert.ok(crit(set, 4).has("uniform"));
  assert.ok(!crit(set, 0).has("uniform"));
  assert.ok(!crit(["As a planner, I want to edit the Plan(s) so that they stay current."]).has("minimal"));
  assert.ok(!crit(["As a clerk, I want to close a case. So that I can finish it."]).has("minimal"));
  assert.ok(crit(["As a clerk, I want to see fees, so that I can plan, such as permit fees."]).has("minimal"));
});

const codes = (t: string) => analyzeSet([t])[0].map((d) => d.code);

test("đọc được (nhóm): chữ linh tinh trong vai trò / hành động / lý do bị WF_UNREADABLE, mỗi phần một lỗi", () => {
  assert.equal(codes("As a asdf, I want qwer, so that zxcv.").filter((c) => c === "WF_UNREADABLE").length, 3);
  assert.equal(codes("As a customer, I want sdfsdf sdf, so that I can track orders.").filter((c) => c === "WF_UNREADABLE").length, 1);
  assert.equal(codes("As a lkjlkj, I want to view my orders.").filter((c) => c === "WF_UNREADABLE").length, 1);
});

test("đọc được (nhóm): từ ghép, số nhiều, viết tắt, tên riêng, từ phần mềm không bị bắt nhầm", () => {
  for (const t of [
    "As a VisualDesigner, I want to review validations so that the uploaded files are correct.",
    "As a corporatesponsor, I want non-existent records removed.",
    "As an admin, I want to export orders to CSV so that I can reconcile payments.",
    "As a CSM, I want to sync my Shopee listings with Lazada.",
    "As a BA Lead, I want to approve the BRD of a module so that developers can start.",
  ])
    assert.ok(!codes(t).includes("WF_UNREADABLE"), t);
});
