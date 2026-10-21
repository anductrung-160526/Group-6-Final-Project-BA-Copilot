import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTree, validateTree, diffTrees, topMostIds, findNode, collectIds } from "../shared/design.ts";
import { applyPatch } from "../shared/patch.ts";
import { extractModel } from "../shared/extract.ts";
import { buildTrace } from "../shared/trace.ts";
import { mockScreen, mockEditOps, mockUseCases, mockTests, mockSequence } from "../server/ai/mock.ts";
import { validateMermaid } from "../server/ai/pipelines.ts";

const tree = normalizeTree({
  id: "page",
  type: "Page",
  props: { title: "Đăng nhập" },
  children: [
    {
      id: "form",
      type: "Form",
      props: {},
      children: [
        { id: "email", type: "Input", props: { label: "Email", required: true, inputType: "email" } },
        { id: "pwd", type: "Input", props: { label: "Mật khẩu", minLength: 8 } },
        { id: "btn", type: "Button", props: { label: "Đăng nhập", navigateTo: "Trang chủ" } },
      ],
    },
    { id: "footer", type: "Text", props: { text: "© 2026" } },
  ],
});

test("normalizeTree bổ sung id thiếu và loại id trùng", () => {
  const t = normalizeTree({ type: "Page", props: { title: "x" }, children: [{ id: "a", type: "Text", props: { text: "1" } }, { id: "a", type: "Text", props: { text: "2" } }, { type: "Button", props: { label: "b" }, children: [{}] }] });
  const ids = collectIds(t);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(t.children![2].children, undefined, "leaf không giữ children");
});

test("validateTree phát hiện lỗi cấu trúc", () => {
  assert.ok(validateTree(tree).ok);
  const bad = normalizeTree({ id: "r", type: "Card", props: {}, children: [{ id: "x", type: "Foo", props: {} }, { id: "y", type: "Button", props: {} }] });
  const v = validateTree(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("Page")));
  assert.ok(v.errors.some((e) => e.includes("Foo")));
  assert.ok(v.errors.some((e) => e.includes("label")));
});

test("applyPatch: sửa trong vùng được chấp nhận, ngoài vùng bị từ chối", () => {
  const r = applyPatch(
    tree,
    [
      { op: "update", id: "email", props: { label: "Địa chỉ email" } },
      { op: "update", id: "footer", props: { text: "hack" } },
      { op: "insert", parentId: "form", index: 3, node: { type: "Checkbox", props: { label: "Ghi nhớ" } } },
    ],
    { selectedIds: ["email"] },
  );
  assert.equal(findNode(r.tree, "email")!.props.label, "Địa chỉ email");
  assert.equal(findNode(r.tree, "footer")!.props.text, "© 2026");
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0].reason, /outside the selected region/);
  assert.equal(findNode(r.tree, "form")!.children!.length, 4, "được chèn anh em vào cha trực tiếp của vùng");
  assert.equal(findNode(tree, "email")!.props.label, "Email", "cây gốc không bị đổi");
});

test("applyPatch: không khoanh vùng = sửa toàn màn hình; không xóa được gốc", () => {
  const r = applyPatch(tree, [{ op: "update", id: "footer", props: { text: "x" } }, { op: "remove", id: "page" }, { op: "remove", id: "pwd" }]);
  assert.equal(findNode(r.tree, "footer")!.props.text, "x");
  assert.equal(findNode(r.tree, "pwd"), null);
  assert.equal(r.rejected.length, 1);
});

test("applyPatch: replace giữ id và không làm trùng id", () => {
  const r = applyPatch(tree, [{ op: "replace", id: "form", node: { type: "Form", props: { title: "Mới" }, children: [{ id: "footer", type: "Text", props: { text: "dup" } }] } }], { selectedIds: ["form"] });
  const ids = collectIds(r.tree);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(findNode(r.tree, "form")!.props.title, "Mới");
  assert.ok(validateTree(r.tree).ok);
});

test("diffTrees và topMostIds", () => {
  const r = applyPatch(tree, [{ op: "update", id: "btn", props: { variant: "danger" } }, { op: "remove", id: "footer" }]);
  const d = diffTrees(tree, r.tree);
  assert.deepEqual(d.changed.sort(), ["btn", "page"].sort());
  assert.deepEqual(d.removed, ["footer"]);
  assert.deepEqual(topMostIds(tree, ["email", "form", "footer"]).sort(), ["footer", "form"]);
});

test("extractModel trích trường, ràng buộc, thao tác và điều hướng", () => {
  const m = extractModel([{ id: "s1", name: "Đăng nhập", tree }, { id: "s2", name: "Trang chủ", tree: mockScreen("trang chủ tổng quan", "Trang chủ") }]);
  const s = m.screens[0];
  assert.equal(s.fields.length, 2);
  assert.ok(s.fields[0].required);
  assert.ok(s.fields[0].constraints.includes("email format"));
  assert.ok(s.fields[1].constraints.includes("minLength=8"));
  assert.equal(s.actions[0].formId, "form");
  assert.deepEqual(m.navigation[0], { from: "Đăng nhập", to: "Trang chủ", via: "Đăng nhập" });
});

test("mock: sinh màn hình hợp lệ cho nhiều loại prompt", () => {
  for (const p of ["Màn hình đăng nhập", "Màn hình đăng ký tài khoản", "Quản lý sản phẩm, có tìm kiếm", "Thêm khách hàng mới", "Dashboard"]) {
    const t = mockScreen(p, "");
    assert.ok(validateTree(t).ok, p + ": " + validateTree(t).errors.join(";"));
  }
});

test("mock: sửa theo vùng đổi nhãn đúng phần tử", () => {
  const { ops } = mockEditOps(tree, ["btn"], 'Đổi chữ nút thành "Vào hệ thống"');
  const r = applyPatch(tree, ops, { selectedIds: ["btn"] });
  assert.equal(findNode(r.tree, "btn")!.props.label, "Vào hệ thống");
  assert.equal(r.rejected.length, 0);
});

test("pipeline tài liệu mock: UC → FR → test bao phủ mọi luồng, mermaid hợp lệ", () => {
  const login = mockScreen("đăng nhập", "Đăng nhập");
  const list = mockScreen("quản lý sản phẩm", "Quản lý sản phẩm");
  const model = extractModel([{ id: "s1", name: "Đăng nhập", tree: login }, { id: "s2", name: "Quản lý sản phẩm", tree: list }]);
  const { useCases, requirements } = mockUseCases(model, "As a Nhân viên kho, I want quản lý sản phẩm");
  assert.ok(useCases.length >= 2);
  assert.equal(useCases[0].actors[0], "Nhân viên kho");
  const tests = mockTests(useCases, requirements, model);
  const tr = buildTrace(useCases, requirements, tests);
  assert.equal(tr.coverage.flowsWithTests, tr.coverage.flowsTotal, "mọi luồng UC đều có test: " + tr.coverage.untestedFlows.join(","));
  assert.equal(tr.coverage.frWithTests, tr.coverage.frTotal, "mọi FR đều có test: " + tr.coverage.untestedRequirements.join(","));
  assert.ok(tests.some((t) => t.type === "Boundary"));
  for (const u of useCases) assert.deepEqual(validateMermaid(mockSequence(u, () => "Màn hình").mermaid), []);
});

test("validateMermaid bắt lỗi cú pháp thường gặp", () => {
  assert.ok(validateMermaid("graph TD\nA-->B").length > 0);
  assert.ok(validateMermaid("sequenceDiagram\n  alt x\n  A->>B: y").some((e) => e.includes("end")));
  assert.deepEqual(validateMermaid("sequenceDiagram\n  actor A as Người dùng\n  A->>UI: Mở\n  UI-->>A: OK"), []);
});

// Q-P3: "search box / search bar" là ô tìm kiếm, không phải nút; nhãn nút không nuốt cả "Screen with …" trước "with"
test("mock: ô tìm kiếm không thành nút; nhãn nút không lấy phần trước \"with\"", () => {
  const controls = (t: ReturnType<typeof mockScreen>) => {
    const out: string[] = [];
    const walk = (n: typeof t) => {
      if (n.type === "Button" || n.type === "Input") out.push(`${n.type}:${n.props.label}`);
      (n.children ?? []).forEach(walk);
    };
    walk(t);
    return out;
  };
  assert.deepEqual(controls(mockScreen("Category list with a Search box button and a table", "X")), ["Input:Search"]);
  assert.deepEqual(controls(mockScreen("Screen with a search bar and an Add new button", "X")), ["Input:Search", "Button:Add new"]);
  assert.deepEqual(controls(mockScreen("Order screen with Approve and Reject buttons", "X")), ["Button:Approve", "Button:Reject"]);
  assert.ok(controls(mockScreen('Sign-in screen with email, password and a "Sign in with Google" button', "X")).includes("Button:Sign in with Google"));

  const tree = { id: "root", type: "Page", props: { title: "P" }, children: [{ id: "f", type: "Form", props: { title: "F" }, children: [] }] } as Parameters<typeof mockEditOps>[0];
  const added = (instruction: string) => mockEditOps(tree, ["f"], instruction).ops.flatMap((o) => { const n = (o as { node?: { type: string; props: Record<string, unknown> } }).node; return o.op === "insert" && n ? [`${n.type}:${n.props.label}:${n.props.name ?? ""}`] : []; });
  assert.deepEqual(added("Add a Search box"), ["Input:Search:keyword"]);
  assert.deepEqual(added("Add a search bar to the form"), ["Input:Search:keyword"]);
  assert.deepEqual(added("Add a Search box button"), ["Button:Search box:"]);
});
