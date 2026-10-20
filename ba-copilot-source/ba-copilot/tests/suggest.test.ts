import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extractModel } from "../shared/extract.ts";
import type { UINode } from "../shared/design.ts";
import type { Requirement, ScreenSuggestions } from "../shared/types.ts";
import { splitStories } from "../shared/qus.ts";
import { storyKey, suggestNextScreens } from "../shared/suggest.ts";
import { openDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import * as repo from "../server/repo.ts";

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
  // Khoá story theo hợp đồng: "story:<hash>", ổn định khi chỉ đổi dấu câu / khoảng trắng
  assert.match(fromStories[0].key, /^story:[0-9a-z]+$/);
  assert.equal(fromStories[0].key, storyKey(stories[1]));
  assert.equal(storyKey(stories[1]), storyKey(`  ${stories[1].replace(/\.$/, "")} `));
  assert.notEqual(storyKey(stories[0]), storyKey(stories[1]));

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

  // Hai màn cùng trỏ tới "Quên mật khẩu": chỉ một gợi ý; Bỏ qua nó thì gợi ý trùng tên ở màn kia không hiện lên thay
  const twoSources = extractModel([
    { id: "s1", name: "Đăng nhập", tree: loginTree },
    { id: "s2", name: "Trang chủ", tree: homeTree },
    { id: "s3", name: "Hồ sơ", tree: { id: "root", type: "Page", props: { title: "Hồ sơ" }, children: [{ id: "pw", type: "Button", props: { label: "Đổi mật khẩu", navigateTo: "Quên mật khẩu" } }] } },
  ]);
  assert.deepEqual(suggestNextScreens({ model: twoSources, requirements: [], stories: [] }).map((s) => s.key), ["link:s1:forgot"]);
  assert.deepEqual(suggestNextScreens({ model: twoSources, requirements: [], stories: [], dismissed: ["link:s1:forgot"] }), []);
});

test("Đã có màn trùng tên đề xuất (vừa tạo từ gợi ý) thì gợi ý biến mất", () => {
  const before = suggestNextScreens({ model, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] });
  assert.deepEqual(before.map((s) => s.key), ["link:s1:forgot", "fr:FR-04"]);
  const after = extractModel([
    { id: "s1", name: "Đăng nhập", tree: loginTree },
    { id: "s2", name: "Trang chủ", tree: homeTree },
    { id: "s3", name: "Quên mật khẩu", tree: { id: "root", type: "Page", props: { title: "Khôi phục tài khoản" }, children: [] } },
    { id: "s4", name: before[1].name, tree: { id: "root", type: "Page", props: { title: "Đơn của tôi" }, children: [] } },
  ]);
  assert.deepEqual(suggestNextScreens({ model: after, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] }), []);
});

test("Hàm thuần: không đổi đầu vào, gọi hai lần cho cùng kết quả", () => {
  const input = { model, requirements: [fr("FR-04", "Xem lịch sử đơn hàng")], stories: [] as string[] };
  const before = JSON.stringify(input);
  assert.deepEqual(suggestNextScreens(input), suggestNextScreens(input));
  assert.equal(JSON.stringify(input), before);
});

// ------------------------------------------------------------------ API (FN-57 → FN-61, docs/api.md mục 6)
let server: Server;
let base = "";
before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  openDb(":memory:");
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const call = async <T = any>(method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as T };
};
const sugg = (mid: string) => call<ScreenSuggestions>("GET", `/api/modules/${mid}/suggestions`);
const enc = encodeURIComponent;

function seedModule() {
  const p = repo.createProject("Shop");
  const m = repo.createModule(p.id, "Tài khoản", "- Là khách hàng, tôi muốn xem lịch sử đơn hàng để theo dõi giao hàng.");
  const s = repo.createScreen(m.id, "Đăng nhập");
  repo.addVersion(s.id, { kind: "generate", prompt: "", tree: loginTree });
  return { m, s };
}

test("API: GET trả link gãy trước, story chưa phủ sau (chưa có FR)", async () => {
  const { m, s } = seedModule();
  const r = await sugg(m.id);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.dismissed, []);
  assert.deepEqual(
    r.data.items.map((i) => i.kind),
    ["broken-link", "broken-link", "uncovered-story"],
  );
  const forgot = r.data.items.find((i) => i.key === `link:${s.id}:forgot`)!;
  assert.equal(forgot.name, "Quên mật khẩu");
  assert.ok(forgot.prompt.includes("Quên mật khẩu?") && forgot.prompt.includes("Đăng nhập"));
  assert.equal((await sugg("khong-co")).status, 404);
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
