import { test } from "node:test";
import assert from "node:assert/strict";
import { extractModel } from "../shared/extract.ts";
import type { UINode } from "../shared/design.ts";
import type { Requirement } from "../shared/types.ts";
import { splitStories } from "../shared/qus.ts";
import { suggestNextScreens } from "../shared/suggest.ts";

const loginTree: UINode = {
  id: "root",
  type: "Page",
  props: { title: "Đăng nhập" },
  children: [
    { id: "h1", type: "Heading", props: { text: "Đăng nhập" } },
    { id: "email", type: "Input", props: { label: "Email" } },
    { id: "pw", type: "Input", props: { label: "Mật khẩu" } },
    { id: "btn", type: "Button", props: { label: "Đăng nhập", navigateTo: "Trang chủ" } },
    { id: "forgot", type: "Link", props: { text: "Quên mật khẩu?", navigateTo: "Quên mật khẩu" } },
  ],
};
const homeTree: UINode = { id: "root", type: "Page", props: { title: "Trang chủ" }, children: [{ id: "h", type: "Heading", props: { text: "Tổng quan" } }] };

const fr = (code: string, statement: string, type: "FR" | "NFR" = "FR"): Requirement => ({
  code,
  type,
  statement,
  priority: "High",
  useCaseCodes: [],
  source: "",
  isAssumption: false,
});

const model = extractModel([
  { id: "s1", name: "Đăng nhập", tree: loginTree },
  { id: "s2", name: "Trang chủ", tree: homeTree },
]);

test("(a) FR chưa có màn nào phủ thì được gợi ý; FR đã phủ và NFR thì không", () => {
  const res = suggestNextScreens({
    model,
    requirements: [fr("FR-01", "Người dùng đăng nhập bằng email và mật khẩu"), fr("FR-04", "Xem lịch sử đơn hàng"), fr("NFR-01", "Thời gian phản hồi dưới 2 giây", "NFR")],
    stories: [],
  });
  const frs = res.filter((s) => s.kind === "uncovered-fr");
  assert.deepEqual(frs.map((s) => s.source), ["FR-04"]);
  assert.equal(frs[0].key, "fr:FR-04");
  assert.equal(frs[0].reason, "FR-04 chưa có màn nào phủ");
  assert.ok(frs[0].prompt.includes("Xem lịch sử đơn hàng"));
});

test("(b) link gãy: ghi rõ màn nguồn và nhãn nút, xếp trước FR chưa phủ", () => {
  const res = suggestNextScreens({ model, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] });
  assert.equal(res[0].kind, "broken-link");
  assert.equal(res[0].name, "Quên mật khẩu");
  assert.equal(res[0].key, "link:s1:forgot");
  assert.ok(res[0].source.includes("Đăng nhập") && res[0].source.includes("Quên mật khẩu?"));
  assert.equal(res[1].kind, "uncovered-fr");
  // Nút "Đăng nhập" trỏ tới "Trang chủ" đã tồn tại -> không phải link gãy
  assert.ok(!res.some((s) => s.name === "Trang chủ"));
});

test("(c) không còn khoảng trống thì trả về danh sách rỗng", () => {
  const full = extractModel([
    { id: "s1", name: "Đăng nhập", tree: { ...loginTree, children: loginTree.children!.filter((c) => c.id !== "forgot") } },
    { id: "s2", name: "Trang chủ", tree: homeTree },
  ]);
  const res = suggestNextScreens({ model: full, requirements: [fr("FR-01", "Người dùng đăng nhập bằng email và mật khẩu")], stories: [] });
  assert.deepEqual(res, []);
});

test("(d) chưa có FR thì dựa trên user story (G5 / BR-07); có FR thì bỏ qua story", () => {
  const stories = splitStories(`- Là khách hàng, tôi muốn đăng nhập bằng email để mua hàng.
- Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.`);
  const fromStories = suggestNextScreens({ model, requirements: [], stories }).filter((s) => s.kind === "uncovered-story");
  assert.equal(fromStories.length, 1);
  assert.equal(fromStories[0].name, "Xem lịch sử đơn hàng");
  assert.ok(fromStories[0].prompt.includes(stories[1]));

  const withFr = suggestNextScreens({ model, requirements: [fr("FR-01", "Người dùng đăng nhập bằng email và mật khẩu")], stories });
  assert.ok(!withFr.some((s) => s.kind === "uncovered-story"));
});

test("(e) gợi ý đã bị bỏ qua thì không hiện lại", () => {
  const res = suggestNextScreens({
    model,
    requirements: [fr("FR-04", "Xem lịch sử đơn hàng")],
    stories: [],
    dismissed: ["fr:FR-04", "link:s1:forgot"],
  });
  assert.deepEqual(res, []);
});

test("Hàm thuần: không đổi đầu vào, gọi hai lần cho cùng kết quả", () => {
  const input = { model, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] as string[] };
  const before = JSON.stringify(input);
  assert.deepEqual(suggestNextScreens(input), suggestNextScreens(input));
  assert.equal(JSON.stringify(input), before);
});
