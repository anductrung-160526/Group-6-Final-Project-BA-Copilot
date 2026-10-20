// Test C8 – GitHub: commit đúng tệp khi Duyệt, tạo nhánh, repo rỗng, dịch lỗi, token không lộ, chưa cấu hình.
// GitHub giả lập bằng fetch giả (setGitHubFetch) – KHÔNG gọi mạng thật, token trong test là chuỗi giả.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { openDb, getDb } from "../server/db.ts";
import { createApp } from "../server/app.ts";
import { pushApproved } from "../server/events.ts";
import { setGitHubFetch, parseRepo, translateError, type FetchLike } from "../server/github.ts";
import { buildExport, slugify, extractDsCss } from "../server/gitExport.ts";

const FAKE_TOKEN = "ghp_GIA_LAP_KHONG_PHAI_TOKEN_THAT_123";
let server: Server;
let base = "";

// ---------------------------------------------------------------- GitHub giả
interface FakeRepo {
  exists: boolean;
  defaultBranch: string;
  push: boolean;
  refs: Map<string, string>;
  commits: Map<string, { tree: string; parents: string[]; message: string }>;
  trees: Map<string, Map<string, string>>; // path → blob sha
  blobs: Map<string, string>; // sha → nội dung
}
let gh: FakeRepo;
let calls: { method: string; url: string; auth: string }[] = [];
let forceStatus: number | null = null;
let seq = 0;
const sha = (p: string) => `${p}${(++seq).toString(16).padStart(39, "0")}`.slice(0, 40);

function resetGh(opts: Partial<Pick<FakeRepo, "exists" | "defaultBranch" | "push">> & { empty?: boolean } = {}) {
  gh = { exists: opts.exists ?? true, defaultBranch: opts.defaultBranch ?? "main", push: opts.push ?? true, refs: new Map(), commits: new Map(), trees: new Map(), blobs: new Map() };
  calls = [];
  forceStatus = null;
  if (!opts.empty) {
    const t = sha("t");
    gh.trees.set(t, new Map([["README.md", "b0"]]));
    const c = sha("c");
    gh.commits.set(c, { tree: t, parents: [], message: "init" });
    gh.refs.set(gh.defaultBranch, c);
  }
}

const reply = (status: number, data?: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => null },
  json: async () => data,
  text: async () => (data === undefined ? "" : JSON.stringify(data)),
});

const fakeFetch: FetchLike = async (url, init = {}) => {
  const method = init.method ?? "GET";
  calls.push({ method, url, auth: init.headers?.authorization ?? "" });
  if (forceStatus) return reply(forceStatus, { message: "Bad credentials" });
  const m = url.match(/^https:\/\/api\.github\.com\/repos\/acme\/ba-docs(\/[^?]*)?(\?.*)?$/);
  if (!m || !gh.exists) return reply(404, { message: "Not Found" });
  const path = m[1] ?? "";
  const body = init.body ? JSON.parse(init.body) : {};
  const empty = gh.refs.size === 0;
  if (method === "GET" && path === "") return reply(200, { default_branch: gh.defaultBranch, permissions: { push: gh.push, admin: false } });
  let r;
  if (method === "GET" && (r = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
    if (empty) return reply(409, { message: "Git Repository is empty." });
    const s = gh.refs.get(decodeURIComponent(r[1]));
    return s ? reply(200, { object: { sha: s } }) : reply(404, { message: "Not Found" });
  }
  if (method === "PUT" && path === "/contents/README.md") {
    const t = sha("t");
    gh.trees.set(t, new Map([["README.md", "b0"]]));
    const c = sha("c");
    gh.commits.set(c, { tree: t, parents: [], message: body.message });
    gh.refs.set(gh.defaultBranch, c);
    return reply(201, { commit: { sha: c } });
  }
  if (empty) return reply(409, { message: "Git Repository is empty." });
  if (!gh.push && method !== "GET") return reply(403, { message: "Resource not accessible by personal access token" });
  if (method === "GET" && (r = path.match(/^\/git\/commits\/(\w+)$/))) {
    const c = gh.commits.get(r[1]);
    return c ? reply(200, { sha: r[1], tree: { sha: c.tree } }) : reply(404, { message: "Not Found" });
  }
  if (method === "POST" && path === "/git/blobs") {
    const s = sha("b");
    gh.blobs.set(s, Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8").toString("utf8"));
    return reply(201, { sha: s });
  }
  if (method === "POST" && path === "/git/trees") {
    const t = new Map(gh.trees.get(body.base_tree) ?? []);
    for (const e of body.tree) t.set(e.path, e.sha);
    const s = sha("t");
    gh.trees.set(s, t);
    return reply(201, { sha: s });
  }
  if (method === "POST" && path === "/git/commits") {
    const s = sha("c");
    gh.commits.set(s, { tree: body.tree, parents: body.parents, message: body.message });
    return reply(201, { sha: s, html_url: `https://github.com/acme/ba-docs/commit/${s}` });
  }
  if (method === "POST" && path === "/git/refs") {
    const name = String(body.ref).replace("refs/heads/", "");
    if (gh.refs.has(name)) return reply(422, { message: "Reference already exists" });
    gh.refs.set(name, body.sha);
    return reply(201, {});
  }
  if (method === "PATCH" && (r = path.match(/^\/git\/refs\/heads\/(.+)$/))) {
    const name = decodeURIComponent(r[1]);
    if (!gh.refs.has(name)) return reply(422, { message: "Reference does not exist" });
    gh.refs.set(name, body.sha);
    return reply(200, {});
  }
  if (method === "GET" && path === "/commits") {
    const branch = new URLSearchParams(m[2]?.slice(1)).get("sha") ?? gh.defaultBranch;
    let cur: string | undefined = gh.refs.get(branch);
    if (!cur) return reply(404, { message: "No commit found for SHA" });
    const out = [];
    while (cur) {
      const c: { tree: string; parents: string[]; message: string } = gh.commits.get(cur)!;
      out.push({ sha: cur, html_url: `https://github.com/acme/ba-docs/commit/${cur}`, commit: { message: c.message, author: { name: "bot", date: "2026-10-20T00:00:00Z" } } });
      cur = c.parents[0];
    }
    return reply(200, out);
  }
  return reply(404, { message: "Not Found" });
};

/** Nội dung các tệp ở đầu nhánh. */
function filesAt(branch: string): Map<string, string> {
  const c = gh.commits.get(gh.refs.get(branch)!)!;
  const out = new Map<string, string>();
  for (const [p, b] of gh.trees.get(c.tree)!) out.set(p, gh.blobs.get(b) ?? "");
  return out;
}

// ---------------------------------------------------------------- dữ liệu mẫu
const now = new Date().toISOString();
before(async () => {
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_API_URL;
  openDb(":memory:");
  const d = getDb();
  d.prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)").run("lead", "Chị Hà", "BA_LEAD", now);
  d.prepare("INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)").run("ba1", "Anh Nam", "BA", now);
  d.prepare("INSERT INTO projects (id, name, description, created_at) VALUES ('p1', 'Dự án A', '', ?)").run(now);
  d.prepare("INSERT INTO projects (id, name, description, created_at) VALUES ('p2', 'Dự án B', '', ?)").run(now);
  d.prepare("INSERT INTO modules (id, project_id, name, created_at) VALUES ('m1', 'p1', 'Đăng nhập & Bảo mật', ?)").run(now);
  d.prepare("INSERT INTO modules (id, project_id, name, created_at) VALUES ('m2', 'p2', 'Khác', ?)").run(now);
  d.prepare("INSERT INTO module_docs (module_id, kind, content, status, rev, updated_by, updated_at) VALUES ('m1', 'BRD', '# BRD\n\nNội dung BRD', 'done', 3, 'ba1', ?)").run(now);
  d.prepare("INSERT INTO module_diagrams (module_id, kind, code, parts, status, rev, updated_at) VALUES ('m1', 'SEQUENCE', '', ?, 'done', 1, ?)").run(
    JSON.stringify([
      { key: "UC-01", title: "Đăng nhập", code: "sequenceDiagram\nA->>B: x" },
      { key: "UC-02", title: "Quên mật khẩu", code: "sequenceDiagram\nA->>B: y" },
    ]),
    now,
  );
  const tree = { id: "root", type: "Page", props: {}, children: [{ id: "c1", type: "Card", props: { title: "Đăng nhập hệ thống" }, children: [] }] };
  d.prepare("INSERT INTO screens (id, module_id, name, status, current_version_id, created_at) VALUES ('s1', 'm1', 'Màn Đăng nhập', 'done', 'v1', ?)").run(now);
  d.prepare("INSERT INTO screens (id, module_id, name, status, current_version_id, created_at) VALUES ('s2', 'm1', 'Quên mật khẩu', 'approved', NULL, ?)").run(now);
  d.prepare("INSERT INTO screens (id, module_id, name, status, current_version_id, created_at) VALUES ('s3', 'm1', 'Nháp', 'draft', NULL, ?)").run(now);
  d.prepare("INSERT INTO screen_versions (id, screen_id, number, kind, tree, created_at) VALUES ('v1', 's1', 1, 'generate', ?, ?)").run(JSON.stringify(tree), now);
  d.prepare("INSERT INTO test_cases (module_id, code, ord, data) VALUES ('m1', 'TC-01', 1, ?)").run(
    JSON.stringify({ code: "TC-01", title: "Đăng nhập đúng", type: "Positive", priority: "High", useCaseCode: "UC-01", flowRef: "main", requirementCodes: ["FR-01"], preconditions: "", testData: "", steps: ["Mở màn", "Nhập"], expected: "Vào được" }),
  );
  setGitHubFetch(fakeFetch);
  server = createApp({ publicDir: process.cwd() + "/public" });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  setGitHubFetch(null);
  server.close();
});
beforeEach(() => resetGh());

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, text, data: text ? JSON.parse(text) : null };
}
const configure = (p = "p1", branch = "main") => api("PUT", `/api/projects/${p}/git`, { repo: "https://github.com/acme/ba-docs.git", branch, token: FAKE_TOKEN, actorId: "lead" });

// ---------------------------------------------------------------- tiện ích
test("parseRepo nhận link https, .git, owner/name; từ chối link lạ", () => {
  assert.deepEqual(parseRepo("https://github.com/acme/ba-docs"), { owner: "acme", name: "ba-docs" });
  assert.deepEqual(parseRepo("https://github.com/acme/ba-docs.git"), { owner: "acme", name: "ba-docs" });
  assert.deepEqual(parseRepo("acme/ba-docs"), { owner: "acme", name: "ba-docs" });
  assert.deepEqual(parseRepo("git@github.com:acme/ba-docs.git"), { owner: "acme", name: "ba-docs" });
  assert.equal(parseRepo("https://gitlab.com/acme/x"), null);
  assert.equal(parseRepo("acme"), null);
  assert.equal(parseRepo(""), null);
});

test("slugify bỏ dấu tiếng Việt, an toàn cho đường dẫn", () => {
  assert.equal(slugify("Đăng nhập & Bảo mật"), "dang-nhap-bao-mat");
  assert.equal(slugify("../../etc"), "etc");
  assert.equal(slugify("!!!", "module"), "module");
});

test("dịch lỗi GitHub 401/403/404 sang tiếng Việt", () => {
  assert.match(translateError(401, "Bad credentials", "a/b"), /Token GitHub không hợp lệ/);
  assert.match(translateError(403, "", "a/b"), /không có quyền ghi/);
  assert.match(translateError(403, "API rate limit exceeded", "a/b"), /gọi quá nhiều/);
  assert.match(translateError(404, "Not Found", "a/b"), /Không tìm thấy repo a\/b/);
});

test("gitExport: bố cục tệp đúng kế hoạch", () => {
  assert.deepEqual(buildExport({ kind: "doc", id: "m1", moduleId: "m1", sub: "BRD" }).files.map((f) => f.path), ["dang-nhap-bao-mat/docs/01-BRD.md"]);
  const seq = buildExport({ kind: "diagram", id: "m1", moduleId: "m1", sub: "SEQUENCE" }).files;
  assert.deepEqual(seq.map((f) => f.path), ["dang-nhap-bao-mat/diagrams/sequence.md"]);
  assert.equal((seq[0].content.match(/```mermaid/g) ?? []).length, 2, "SEQUENCE gộp mọi phần");
  const proto = buildExport({ kind: "screen", id: "s1", moduleId: "" });
  assert.deepEqual(proto.files.map((f) => f.path), ["dang-nhap-bao-mat/prototype/man-dang-nhap.html", "dang-nhap-bao-mat/prototype/index.html"]);
  assert.match(proto.files[0].content, /Đăng nhập hệ thống/);
  assert.match(proto.files[0].content, /\.ds-page/);
  const index = proto.files[1].content;
  assert.match(index, /man-dang-nhap\.html/);
  assert.match(index, /quen-mat-khau\.html/, "màn đã duyệt có trong index");
  assert.doesNotMatch(index, /Nháp/, "màn chưa duyệt không có trong index");
  const tests = buildExport({ kind: "tests", id: "m1", moduleId: "m1" }).files;
  assert.deepEqual(tests.map((f) => f.path), ["dang-nhap-bao-mat/tests/test-cases.md"]);
  assert.match(tests[0].content, /TC-01/);
  assert.match(extractDsCss(".a{x:1}\n.ds-b{y:2}\n@media (max-width:1px){.ds-c{z:3}.d{w:4}}"), /\.ds-b\{y:2\}[\s\S]*@media[^{]*\{\.ds-c\{z:3\}\}/);
});

// ---------------------------------------------------------------- cài đặt + token
test("chưa cấu hình → pushApproved trả pushed:false, không gọi GitHub", async () => {
  const out = await pushApproved({ kind: "doc", id: "m2", moduleId: "m2", sub: "BRD" }, "lead");
  assert.deepEqual(out, { pushed: false, message: "Chưa cấu hình GitHub – chưa đẩy" });
  assert.equal(calls.length, 0);
});

test("cài đặt: chỉ BA Lead (thiếu actorId hay BA → 403), token không bao giờ trả về", async () => {
  assert.equal((await api("PUT", "/api/projects/p1/git", { repo: "acme/ba-docs", token: FAKE_TOKEN })).status, 403);
  assert.equal((await api("PUT", "/api/projects/p1/git", { repo: "acme/ba-docs", token: FAKE_TOKEN, actorId: "ba1" })).status, 403);
  assert.equal((await api("POST", "/api/projects/p1/git/test", { actorId: "ba1" })).status, 403);
  assert.equal((await api("PUT", "/api/projects/p1/git", { repo: "https://gitlab.com/x/y", actorId: "lead" })).status, 400);
  const saved = await configure();
  assert.equal(saved.status, 200);
  assert.equal(saved.data.hasToken, true);
  assert.equal(saved.data.branch, "main");
  assert.ok(!saved.text.includes(FAKE_TOKEN));
  assert.ok(!("token" in saved.data));
  const got = await api("GET", "/api/projects/p1/git");
  assert.equal(got.data.repo, "https://github.com/acme/ba-docs.git");
  assert.ok(!got.text.includes(FAKE_TOKEN));
  // để trống token = giữ token cũ
  const keep = await api("PUT", "/api/projects/p1/git", { repo: "acme/ba-docs", branch: "release", actorId: "lead" });
  assert.equal(keep.data.hasToken, true);
  assert.equal(keep.data.branch, "release");
  assert.equal((getDb().prepare("SELECT token FROM project_git WHERE project_id = 'p1'").get() as { token: string }).token, FAKE_TOKEN);
  // "" = xoá token
  const cleared = await api("PUT", "/api/projects/p1/git", { repo: "acme/ba-docs", token: "", actorId: "lead" });
  assert.equal(cleared.data.hasToken, false);
  const hist = await api("GET", "/api/projects/p1/git/history");
  assert.equal(hist.data.configured, false);
  await configure();
});

test("thử kết nối: có quyền ghi, báo nhánh chưa có; sai token → thông báo tiếng Việt, không lộ token", async () => {
  await configure("p1", "ba-copilot");
  const ok = await api("POST", "/api/projects/p1/git/test", { actorId: "lead" });
  assert.equal(ok.data.ok, true);
  assert.equal(ok.data.branchExists, false);
  assert.equal(ok.data.defaultBranch, "main");
  assert.ok(calls.every((c) => c.auth === `Bearer ${FAKE_TOKEN}`));
  forceStatus = 401;
  const bad = await api("POST", "/api/projects/p1/git/test", { actorId: "lead" });
  assert.equal(bad.data.ok, false);
  assert.match(bad.data.message, /Token GitHub không hợp lệ/);
  assert.ok(!bad.text.includes(FAKE_TOKEN));
  forceStatus = null;
  gh.push = false;
  const ro = await api("POST", "/api/projects/p1/git/test", { actorId: "lead" });
  assert.equal(ro.data.ok, false);
  assert.match(ro.data.message, /không có quyền ghi/);
  gh.exists = false;
  const nf = await api("POST", "/api/projects/p1/git/test", { actorId: "lead" });
  assert.match(nf.data.message, /Không tìm thấy repo acme\/ba-docs/);
  await configure();
});

// ---------------------------------------------------------------- Duyệt → commit
test("Duyệt tài liệu: commit đúng tệp lên nhánh, message đúng, ghi git_pushes, lịch sử hiện commit", async () => {
  await configure();
  const before = gh.refs.get("main")!;
  const out = await pushApproved({ kind: "doc", id: "m1", moduleId: "m1", sub: "BRD" }, "lead");
  assert.equal(out.pushed, true);
  const head = gh.refs.get("main")!;
  assert.notEqual(head, before);
  assert.equal(out.commitSha, head);
  assert.equal(out.commitUrl, `https://github.com/acme/ba-docs/commit/${head}`);
  const c = gh.commits.get(head)!;
  assert.deepEqual(c.parents, [before]);
  assert.equal(c.message, "Duyệt: Tài liệu BRD – Đăng nhập & Bảo mật · BA Anh Nam · duyệt bởi Chị Hà");
  const files = filesAt("main");
  assert.equal(files.get("dang-nhap-bao-mat/docs/01-BRD.md"), "# BRD\n\nNội dung BRD\n");
  assert.ok(files.has("README.md"), "giữ tệp cũ (tree dựa trên tree hiện tại)");
  assert.equal(files.size, 2);
  const row = getDb().prepare("SELECT * FROM git_pushes WHERE commit_sha = ?").get(head) as Record<string, string>;
  assert.equal(row.artifact_kind, "doc");
  assert.equal(row.artifact_sub, "BRD");
  assert.equal(row.by_member_id, "lead");
  assert.equal(row.branch, "main");
  assert.deepEqual(JSON.parse(row.files), ["dang-nhap-bao-mat/docs/01-BRD.md"]);
  const hist = await api("GET", "/api/projects/p1/git/history");
  assert.equal(hist.data.configured, true);
  assert.equal(hist.data.commits[0].sha, head);
  assert.ok(hist.data.pushes.some((p: { commitSha: string }) => p.commitSha === head));
  assert.ok(!hist.text.includes(FAKE_TOKEN));
});

test("Duyệt màn khi nhánh chưa có → tạo nhánh từ nhánh mặc định", async () => {
  await configure("p1", "ba-copilot");
  const mainHead = gh.refs.get("main")!;
  const out = await pushApproved({ kind: "screen", id: "s1", moduleId: "m1" }, "lead");
  assert.equal(out.pushed, true);
  assert.equal(gh.refs.get("main"), mainHead, "nhánh mặc định không đổi");
  const head = gh.refs.get("ba-copilot")!;
  assert.deepEqual(gh.commits.get(head)!.parents, [mainHead]);
  const files = filesAt("ba-copilot");
  assert.ok(files.has("dang-nhap-bao-mat/prototype/man-dang-nhap.html"));
  assert.ok(files.has("dang-nhap-bao-mat/prototype/index.html"));
  await configure();
});

test("repo rỗng → khởi tạo README rồi commit sản phẩm", async () => {
  resetGh({ empty: true });
  await configure();
  const out = await pushApproved({ kind: "tests", id: "m1", moduleId: "m1" }, "lead");
  assert.equal(out.pushed, true);
  const files = filesAt("main");
  assert.ok(files.has("README.md"));
  assert.ok(files.has("dang-nhap-bao-mat/tests/test-cases.md"));
  assert.equal(gh.commits.get(gh.refs.get("main")!)!.parents.length, 1);
});

test("lỗi GitHub khi đã cấu hình → ném lỗi tiếng Việt (401/403/404), không ghi git_pushes", async () => {
  await configure();
  const n = () => (getDb().prepare("SELECT COUNT(*) AS n FROM git_pushes").get() as { n: number }).n;
  const before = n();
  forceStatus = 401;
  await assert.rejects(pushApproved({ kind: "doc", id: "m1", moduleId: "m1", sub: "BRD" }, "lead"), /Token GitHub không hợp lệ/);
  forceStatus = null;
  gh.push = false;
  await assert.rejects(pushApproved({ kind: "doc", id: "m1", moduleId: "m1", sub: "BRD" }, "lead"), /không có quyền ghi/);
  gh.exists = false;
  await assert.rejects(pushApproved({ kind: "doc", id: "m1", moduleId: "m1", sub: "BRD" }, "lead"), (e: Error) => /Không tìm thấy repo/.test(e.message) && !e.message.includes(FAKE_TOKEN));
  assert.equal(n(), before);
  // lịch sử vẫn trả nhật ký trong app, kèm lỗi đọc commit
  const hist = await api("GET", "/api/projects/p1/git/history");
  assert.equal(hist.status, 200);
  assert.match(hist.data.commitsError, /Không tìm thấy repo/);
});

test("lỗi mạng → thông báo kiểm tra mạng", async () => {
  await configure();
  setGitHubFetch(async () => {
    throw new Error("ECONNREFUSED " + FAKE_TOKEN);
  });
  try {
    await assert.rejects(pushApproved({ kind: "doc", id: "m1", moduleId: "m1", sub: "BRD" }, "lead"), (e: Error) => /Không kết nối được GitHub/.test(e.message) && !e.message.includes(FAKE_TOKEN));
  } finally {
    setGitHubFetch(fakeFetch);
  }
});
