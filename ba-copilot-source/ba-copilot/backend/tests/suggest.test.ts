import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extractModel } from "../../shared/extract.ts";
import type { UINode } from "../../shared/design.ts";
import type { Requirement, ScreenSuggestions } from "../../shared/types.ts";
import { splitStories, type StructuredStory } from "../../shared/qus.ts";
import { storyKey, suggestionSources, suggestNextScreens, toSuggestion } from "../../shared/suggest.ts";
import { isAcceptancePhrase, mockMissingScreens } from "../src/ai/mock.ts";
import { createServer } from "node:http";
import { openDb } from "../src/db.ts";
import { createApp } from "../src/app.ts";
import * as repo from "../src/repo.ts";

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

// Màn còn thiếu do AI đề xuất; các test hàm thuần dùng bản Mock (so khớp từ khoá) để có kết quả xác định.
const withMock = (i: { model: ReturnType<typeof extractModel>; requirements: Requirement[]; stories: (string | StructuredStory)[]; dismissed?: string[] }) => {
  const sources = suggestionSources(i.requirements, i.stories);
  const byKey = new Map(sources.map((s) => [s.key, s]));
  const uncovered = mockMissingScreens(i.model, sources).map((x) => toSuggestion(byKey.get(x.key)!, x.name, x.reason));
  return suggestNextScreens({ model: i.model, uncovered, dismissed: i.dismissed });
};

test("Nguồn hỏi AI (BR-07 / G5): có FR thì chỉ FR (bỏ NFR), chưa có FR thì story (bỏ story trống)", () => {
  const stories = ["Là khách hàng, tôi muốn xem lịch sử đơn hàng."];
  assert.deepEqual(
    suggestionSources([fr("FR-01", "Xem lịch sử đơn hàng"), fr("NFR-01", "Nhanh", "NFR")], stories).map((s) => [s.key, s.kind, s.code]),
    [["fr:FR-01", "fr", "FR-01"]],
  );
  const fromStories = suggestionSources([fr("NFR-01", "Nhanh", "NFR")], [...stories, { code: "US-02", asA: "", iWant: "", soThat: "" }]);
  assert.deepEqual(fromStories.map((s) => [s.key, s.kind]), [[storyKey(stories[0]), "story"]]);
});

test("toSuggestion: lý do của AI được giữ, thiếu thì dùng lý do mặc định kèm nguồn (FN-59)", () => {
  const [src] = suggestionSources([fr("FR-04", "Xem lịch sử đơn hàng")], []);
  const s = toSuggestion(src, "Order History", "No screen lists past orders.");
  assert.deepEqual([s.key, s.kind, s.name, s.reason, s.source], ["fr:FR-04", "uncovered-fr", "Order History", "No screen lists past orders.", "FR-04"]);
  assert.equal(s.prompt, "Screen Order History satisfying FR-04: Xem lịch sử đơn hàng");
  assert.equal(toSuggestion(src, "Order History").reason, "FR-04 is not covered by any screen");
});

test("(a) [Mock] FR chưa có màn nào phủ thì được gợi ý; FR đã phủ và NFR thì không", () => {
  const res = withMock({
    model,
    requirements: [fr("FR-01", "Người dùng đăng nhập bằng email và mật khẩu"), fr("FR-04", "Xem lịch sử đơn hàng"), fr("NFR-01", "Thời gian phản hồi dưới 2 giây", "NFR")],
    stories: [],
  });
  const frs = res.filter((s) => s.kind === "uncovered-fr");
  assert.deepEqual(frs.map((s) => s.source), ["FR-04"]);
  assert.equal(frs[0].key, "fr:FR-04");
  assert.equal(frs[0].reason, "FR-04 is not covered by any screen");
  assert.ok(frs[0].prompt.includes("Xem lịch sử đơn hàng"));
});

test("(b) link gãy: ghi rõ màn nguồn và nhãn nút, xếp trước FR chưa phủ", () => {
  const res = withMock({ model, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] });
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
  const res = withMock({ model: full, requirements: [fr("FR-01", "Người dùng đăng nhập bằng email và mật khẩu")], stories: [] });
  assert.deepEqual(res, []);
});

test("(d) chưa có FR thì dựa trên user story (G5 / BR-07); có FR thì bỏ qua story", () => {
  const stories = splitStories(`- Là khách hàng, tôi muốn đăng nhập bằng email để mua hàng.
- Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.`);
  const fromStories = withMock({ model, requirements: [], stories }).filter((s) => s.kind === "uncovered-story");
  assert.equal(fromStories.length, 1);
  assert.equal(fromStories[0].name, "Xem lịch sử đơn hàng");
  assert.ok(fromStories[0].prompt.includes(stories[1]));
  // Khoá story theo hợp đồng: "story:<hash>", ổn định khi chỉ đổi dấu câu / khoảng trắng
  assert.match(fromStories[0].key, /^story:[0-9a-z]+$/);
  assert.equal(fromStories[0].key, storyKey(stories[1]));
  assert.equal(storyKey(stories[1]), storyKey(`  ${stories[1].replace(/\.$/, "")} `));
  assert.notEqual(storyKey(stories[0]), storyKey(stories[1]));

  const withFr = withMock({ model, requirements: [fr("FR-01", "Người dùng đăng nhập bằng email và mật khẩu")], stories });
  assert.ok(!withFr.some((s) => s.kind === "uncovered-story"));
});

test("(d2) tên màn đề xuất gọn, không cắt giữa cụm; FR kiểm tra dữ liệu không thành gợi ý màn (Q-10)", () => {
  const res = withMock({
    model,
    requirements: [
      fr("FR-01", 'Hệ thống phải cho phép Quản trị viên thực hiện "Mở màn hình thêm mới (Quản lý sản phẩm)".'),
      fr("FR-02", 'Hệ thống phải cho phép Quản trị viên thực hiện "Xem danh sách – Quản lý danh mục".'),
      fr("FR-03", "Hệ thống phải kiểm tra: Tên sản phẩm là bắt buộc."),
      fr("FR-04", "Hệ thống phải kiểm tra: Giá bán: chỉ nhận số."),
      fr("FR-05", "Hệ thống phải xuất báo cáo doanh thu theo tháng."),
    ],
    stories: [],
  });
  assert.deepEqual(
    res.filter((s) => s.kind === "uncovered-fr").map((s) => [s.source, s.name]),
    [
      ["FR-01", "Thêm mới – Quản lý sản phẩm"],
      ["FR-02", "Xem danh sách – Quản lý danh mục"],
      ["FR-05", "Xuất báo cáo doanh thu"],
    ],
  );

  const stories = splitStories(`- Là nhân viên bán hàng, tôi muốn xem danh sách các đơn hàng theo trạng thái để xử lý đơn mới.
- Là nhân viên bán hàng, tôi muốn tạo đơn hàng và in hóa đơn cho khách.
- Là kế toán, tôi muốn xuất danh sách đơn hàng ra Excel (ví dụ theo tháng) để đối soát.`);
  const names = withMock({ model, requirements: [], stories }).map((s) => s.name);
  assert.deepEqual(names.slice(1), ["Xem danh sách các đơn hàng", "Tạo đơn hàng và in hóa đơn", "Xuất danh sách đơn hàng ra excel"]);
});

test("(d3) quy tắc nghiệp vụ / tiêu chí chấp nhận (Ensure that, Verify, Given/When/Then) không thành tên màn", () => {
  const res = withMock({
    model,
    requirements: [
      fr("FR-01", "The system shall allow Customer to pay by card."),
      fr("FR-02", "The system shall ensure that: Card is tokenized."),
      fr("FR-03", "The system shall verify that the card has not expired."),
      fr("FR-04", "Ensure that: Payment receipt is emailed."),
      fr("FR-05", "Given a saved card, when the customer pays, then no card number is shown."),
      fr("FR-06", "Verify: the order total is recalculated."),
      fr("FR-07", "Hệ thống phải đảm bảo: Mật khẩu được mã hoá."),
      fr("FR-08", "The system shall export the monthly revenue report."),
      fr("FR-09", 'The system shall validate the input data of "Add product" and show a clear error on each invalid field.'),
      fr("FR-10", "The system shall allow Customer to confirm the order."),
    ],
    stories: [],
  });
  const names = res.filter((s) => s.kind === "uncovered-fr").map((s) => [s.source, s.name]);
  assert.deepEqual(names, [
    ["FR-01", "Pay"],
    ["FR-08", "Export the monthly revenue report"],
    ["FR-10", "Confirm the order"],
  ]);
  assert.ok(!names.some(([, n]) => /^(ensure|verify|given)\b/i.test(n)));

  // Story mà phần "I want" là tiêu chí chấp nhận bị bỏ qua; thao tác thật bắt đầu bằng "verify" thì vẫn gợi ý
  const fromStory = withMock({
    model,
    requirements: [],
    stories: ["As a customer, I want ensure that: card data is masked so that it stays private.", "As a customer, I want to verify my email address so that I can sign in."],
  });
  assert.deepEqual(fromStory.filter((s) => s.kind === "uncovered-story").map((s) => s.name), ["Verify my email address"]);

  // Tên màn Claude trả về: bỏ tên dạng quy tắc, giữ tên màn thật
  assert.equal(isAcceptancePhrase("Ensure that: Card is tokenized"), true);
  assert.equal(isAcceptancePhrase("Verify that the card is valid"), true);
  assert.equal(isAcceptancePhrase("Given a saved card"), true);
  assert.equal(isAcceptancePhrase("Verify Email"), false);
  assert.equal(isAcceptancePhrase("Order Confirmation"), false);
  assert.equal(isAcceptancePhrase("Checkout"), false);
});

test("(e) gợi ý đã bị bỏ qua thì không hiện lại", () => {
  const res = withMock({
    model,
    requirements: [fr("FR-04", "Xem lịch sử đơn hàng")],
    stories: [],
    dismissed: ["fr:FR-04", "link:s1:forgot"],
  });
  assert.deepEqual(res, []);

  // Hai màn cùng trỏ tới "Quên mật khẩu": chỉ một gợi ý; Bỏ qua nó thì gợi ý trùng tên ở màn kia không hiện lên thay
  const twoSources = extractModel([
    { id: "s1", name: "Đăng nhập", tree: loginTree },
    { id: "s2", name: "Trang chủ", tree: homeTree },
    { id: "s3", name: "Hồ sơ", tree: { id: "root", type: "Page", props: { title: "Hồ sơ" }, children: [{ id: "pw", type: "Button", props: { label: "Đổi mật khẩu", navigateTo: "Quên mật khẩu" } }] } },
  ]);
  assert.deepEqual(withMock({ model: twoSources, requirements: [], stories: [] }).map((s) => s.key), ["link:s1:forgot"]);
  assert.deepEqual(withMock({ model: twoSources, requirements: [], stories: [], dismissed: ["link:s1:forgot"] }), []);
});

test("Đã có màn trùng tên đề xuất (vừa tạo từ gợi ý) thì gợi ý biến mất", () => {
  const before = withMock({ model, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] });
  assert.deepEqual(before.map((s) => s.key), ["link:s1:forgot", "fr:FR-04"]);
  const after = extractModel([
    { id: "s1", name: "Đăng nhập", tree: loginTree },
    { id: "s2", name: "Trang chủ", tree: homeTree },
    { id: "s3", name: "Quên mật khẩu", tree: { id: "root", type: "Page", props: { title: "Khôi phục tài khoản" }, children: [] } },
    { id: "s4", name: before[1].name, tree: { id: "root", type: "Page", props: { title: "Đơn của tôi" }, children: [] } },
  ]);
  assert.deepEqual(withMock({ model: after, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] }), []);
});

test("Hàm thuần: không đổi đầu vào, gọi hai lần cho cùng kết quả", () => {
  const input = { model, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] as string[] };
  const before = JSON.stringify(input);
  assert.deepEqual(withMock(input), withMock(input));
  assert.equal(JSON.stringify(input), before);
});


// ------------------------------------------------------------------ API (FN-57 → FN-61, docs/api.md mục 6)
let server: Server;
let base = "";
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/frontend/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const call = async <T = any>(method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as T };
};
const sugg = (mid: string) => call<ScreenSuggestions>("GET", `/api/modules/${mid}/suggestions`);
const refresh = (mid: string) => call<ScreenSuggestions>("POST", `/api/modules/${mid}/suggestions/refresh`, {});
const enc = encodeURIComponent;

function seedModule(requirementInput = "- Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.") {
  const p = repo.createProject("Shop");
  const m = repo.createModule(p.id, "Tài khoản", requirementInput);
  const s = repo.createScreen(m.id, "Đăng nhập");
  repo.addVersion(s.id, { kind: "generate", prompt: "", tree: loginTree });
  return { m, s };
}

test("API: GET chỉ có link gãy cho tới khi BA bấm hỏi AI; refresh (Mock) thêm story chưa phủ", async () => {
  const { m, s } = seedModule();
  const r = await sugg(m.id);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.dismissed, []);
  assert.deepEqual(r.data.items.map((i) => i.kind), ["broken-link", "broken-link"]);
  assert.deepEqual(r.data.ai, { hasSource: true, checkedAt: null, outdated: false, provider: null });
  const forgot = r.data.items.find((i) => i.key === `link:${s.id}:forgot`)!;
  assert.equal(forgot.name, "Quên mật khẩu");
  assert.ok(forgot.prompt.includes("Quên mật khẩu?") && forgot.prompt.includes("Đăng nhập"));

  const f = await refresh(m.id);
  assert.equal(f.status, 200, JSON.stringify(f.data));
  assert.deepEqual(f.data.items.map((i) => i.kind), ["broken-link", "broken-link", "uncovered-story"]);
  assert.equal(f.data.ai.provider, "mock");
  assert.ok(f.data.ai.checkedAt);
  assert.equal(f.data.ai.outdated, false);
  // GET sau đó đọc lại kết quả đã lưu, không gọi AI lại
  assert.deepEqual((await sugg(m.id)).data.items, f.data.items);
  const runs = (await call<any[]>("GET", `/api/modules/${m.id}/runs`)).data;
  assert.equal(runs.filter((x) => x.type === "suggest_missing_screens").length, 1);

  assert.equal((await sugg("khong-co")).status, 404);
  assert.equal((await refresh("khong-co")).status, 404);
});

test("API: yêu cầu đổi sau lần hỏi AI thì báo đã cũ; module không có FR / story thì không hỏi được", async () => {
  const { m } = seedModule();
  await refresh(m.id);
  assert.equal((await call("PATCH", `/api/modules/${m.id}`, { requirementInput: "- Là khách hàng, tôi muốn đổi địa chỉ giao hàng." })).status, 200);
  const r = await sugg(m.id);
  assert.equal(r.data.ai.outdated, true);
  // story cũ không còn → gợi ý của nó mất theo
  assert.ok(!r.data.items.some((i) => i.kind === "uncovered-story"));
  assert.equal((await refresh(m.id)).data.ai.outdated, false);

  const empty = seedModule("");
  assert.equal((await sugg(empty.m.id)).data.ai.hasSource, false);
  assert.equal((await refresh(empty.m.id)).status, 400);
});

test("API: Bỏ qua / Khôi phục lưu theo module, lặp lại không lỗi (FN-61)", async () => {
  const { m, s } = seedModule();
  const key = `link:${s.id}:forgot`;
  for (let i = 0; i < 2; i++) {
    const r = await call("POST", `/api/modules/${m.id}/suggestions/${enc(key)}/dismiss`, {});
    assert.deepEqual([r.status, r.data], [200, { ok: true }]);
  }
  let r = await sugg(m.id);
  assert.ok(!r.data.items.some((i) => i.key === key));
  assert.deepEqual(r.data.dismissed.map((i) => i.key), [key]);
  // Module khác không bị ảnh hưởng
  const other = seedModule();
  assert.ok((await sugg(other.m.id)).data.items.some((i) => i.key === `link:${other.s.id}:forgot`));

  for (let i = 0; i < 2; i++) assert.equal((await call("DELETE", `/api/modules/${m.id}/suggestions/${enc(key)}/dismiss`)).status, 200);
  r = await sugg(m.id);
  assert.ok(r.data.items.some((i) => i.key === key));
  assert.deepEqual(r.data.dismissed, []);

  assert.equal((await call("POST", `/api/modules/${m.id}/suggestions/${enc("bad-key")}/dismiss`, {})).status, 400);
  assert.equal((await call("POST", `/api/modules/khong-co/suggestions/${enc(key)}/dismiss`, {})).status, 404);
});

test("API: tạo màn từ gợi ý (Mock) thì gợi ý biến mất", async () => {
  const { m, s } = seedModule();
  const item = (await sugg(m.id)).data.items.find((i) => i.key === `link:${s.id}:forgot`)!;
  const created = await call("POST", `/api/modules/${m.id}/screens`, { name: item.name, prompt: item.prompt });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const keys = (await sugg(m.id)).data.items.map((i) => i.key);
  assert.ok(!keys.includes(item.key), keys.join(", "));
});

test("API: màn còn thiếu do Claude đề xuất – tool use, tự sửa khi sourceRef sai, lưu provider claude", async () => {
  const calls: any[] = [];
  const fake = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    calls.push(JSON.parse(body));
    const screens =
      calls.length === 1
        ? [{ sourceRef: "S9", name: "Ghost", reason: "x" }]
        : [{ sourceRef: "S1", name: "Order History", reason: "No screen lists past orders." }];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ content: [{ type: "tool_use", id: `tu_${calls.length}`, name: "submit_missing_screens", input: { screens } }], usage: { input_tokens: 10, output_tokens: 5 } }));
  });
  await new Promise<void>((r) => fake.listen(0, r));
  process.env.ANTHROPIC_API_KEY = "sk-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  try {
    const { m } = seedModule();
    const r = await refresh(m.id);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].tool_choice, { type: "tool", name: "submit_missing_screens" });
    const prompt: string = calls[0].messages[0].content;
    assert.ok(prompt.includes("S1: Là khách hàng, tôi muốn xem lịch sử đơn hàng") && prompt.includes('"name":"Đăng nhập"'), prompt);
    const story = r.data.items.find((i) => i.kind === "uncovered-story")!;
    assert.equal(story.name, "Order History");
    assert.equal(story.reason, "No screen lists past orders.");
    assert.equal(r.data.ai.provider, "claude");
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    fake.close();
  }
});
