// Mô hình đối chứng n-gram (chỉ dùng trong script đánh giá, không dùng trong app).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTree, UINode, ALL_TYPES } from "../shared/design.ts";
import {
  allProb,
  baselinePredict,
  countTree,
  emptyModel,
  END,
  mergeModels,
  predictNext,
  prob,
  START,
  surprisal,
} from "../shared/nextComponent.ts";

const T = (x: unknown) => normalizeTree(x);

// Mẫu "đúng": Form gồm 2 Input rồi Button
const loginLike = () =>
  T({
    id: "page",
    type: "Page",
    props: { title: "Đăng nhập" },
    children: [
      {
        id: "form",
        type: "Form",
        props: {},
        children: [
          { id: "e", type: "Input", props: { label: "Email", name: "email", inputType: "email", required: true } },
          { id: "p", type: "Input", props: { label: "Mật khẩu", name: "password", inputType: "password", minLength: 8, required: true } },
          { id: "b", type: "Button", props: { label: "Đăng nhập", action: "login" } },
        ],
      },
    ],
  });

function trained(n = 10) {
  const m = emptyModel();
  for (let i = 0; i < n; i++) countTree(m, loginLike());
  return m;
}

test("đếm: sự kiện cha–con và <END> được ghi đủ 3 mức ngữ cảnh", () => {
  const m = countTree(emptyModel(), loginLike());
  assert.equal(m.counts.tri[`Page|Form|Input`]?.Input, 1);
  assert.equal(m.counts.tri[`Page|Form|Input`]?.Button, 1);
  assert.equal(m.counts.bi[`Form|Button`]?.[END], 1);
  assert.equal(m.counts.uni.Form?.Input, 2);
  assert.equal(m.meta.trees, 1);
  // Page: <START>→Form, Form→<END>; Form: 3 con + <END>
  assert.equal(m.meta.events, 6);
});

test("trọng số và gộp mô hình", () => {
  const a = countTree(emptyModel(), loginLike(), 3);
  assert.equal(a.counts.uni.Form?.Input, 6);
  const b = mergeModels(emptyModel(), a, 2);
  assert.equal(b.counts.uni.Form?.Input, 12);
});

test("xác suất: không bao giờ bằng 0, tổng mức chung = 1, backoff khi thiếu dữ liệu", () => {
  const m = trained();
  for (const t of ALL_TYPES) assert.ok(prob(m, { g: "Modal", p: "Sidebar", s: "Pagination" }, t) > 0);
  const total = [...ALL_TYPES, END].reduce((s, x) => s + allProb(m, x), 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  // ngữ cảnh đầy đủ có dữ liệu → dùng tri
  assert.equal(prob(m, { g: "Page", p: "Form", s: "Input" }, "Input"), 0.5);
  // ông lạ → lùi về bi, nhân 0.4
  assert.equal(prob(m, { g: "Card", p: "Form", s: "Input" }, "Input"), 0.4 * 0.5);
});

test("predictNext: Form có 2 Input → Button nằm trong top-3", () => {
  const m = trained();
  const partial = T({ id: "page", type: "Page", props: { title: "x" }, children: [{ id: "f", type: "Form", props: {}, children: [{ id: "a", type: "Input", props: { label: "A" } }, { id: "b", type: "Input", props: { label: "B" } }] }] });
  const top = predictNext(m, partial, "f", 3).map((x) => x.type);
  assert.ok(top.includes("Button"), top.join());
  assert.ok(!top.includes(END));
  assert.deepEqual(predictNext(m, partial, "a"), []); // lá không có con
});

test("surprisal: Pagination trong Form lạ hơn Input trong Form", () => {
  const m = trained();
  const t = T({ id: "page", type: "Page", props: { title: "x" }, children: [{ id: "f", type: "Form", props: {}, children: [{ id: "i", type: "Input", props: { label: "A" } }, { id: "pg", type: "Pagination", props: {} }] }] });
  assert.ok(surprisal(m, t, "pg") > surprisal(m, t, "i"));
  assert.equal(surprisal(m, t, "page"), 0);
});

test("baseline = loại phổ biến nhất", () => {
  assert.equal(baselinePredict(trained()), "Input");
});
