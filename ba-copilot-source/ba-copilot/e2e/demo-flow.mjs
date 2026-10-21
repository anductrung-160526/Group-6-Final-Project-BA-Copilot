// E2E luồng demo BA Copilot – đợt 5 (C11). Trình duyệt thật, chế độ Mock, DB tạm. Dựa vào data-testid (không dựa vào chữ / icon).
//
//   Luồng chính:
//     1. Chuẩn bị: 1 BA Lead + 1 BA (API), "Tôi là" BA, tạo dự án bằng giao diện
//     2. Yêu cầu nghiệp vụ: dự án chưa có module → nút thêm story bị khoá; tạo module ngay tại màn này (đợt 6 – D3)
//        rồi thêm 2 user story có cấu trúc
//     3. Tài liệu: sinh BRD → UC Spec → SRS → FRD-NFR → API Spec (Mock), bấm Xong từng bước
//     4. Sơ đồ: sinh Context, UC, BPMN (vẽ được bằng Mermaid), bấm Xong
//     5. Prototype: sinh 1 màn, Xuất HTML, bấm Xong
//     6. Test case: sinh, bấm Xong · 7. Truy vết: có ma trận
//     8. "Tôi là" BA Lead → Yêu cầu sửa API Spec → task về Đang làm + tag "Yêu cầu sửa"
//     9. "Tôi là" BA → sửa API Spec, Xong (tag vẫn giữ)
//    10. BA Lead Duyệt (dự án chưa cấu hình GitHub → "Chưa cấu hình GitHub – chưa đẩy") → Kanban: task ở Đã duyệt, hết tag
//   Ca thêm:
//     - BA không thấy nút Duyệt / Yêu cầu sửa, không thấy mục Quản trị; vào thẳng #/admin bị chặn
//     - 2 tab cùng sửa một story → tab lưu sau thấy "Bản đã thay đổi – tải lại"
//
// Dùng (trong ba-copilot-source/ba-copilot):
//   npm run build && node e2e/demo-flow.mjs
// Biến môi trường:
//   E2E_BASE=http://localhost:3000  dùng server có sẵn (DB của server đó sẽ bị ghi thêm dữ liệu)
//   E2E_PORT=31110                  cổng khi tự khởi động server (DB + thư mục tệp tạm, AI Mock)
//   CHROME_PATH=…/chrome.exe        trình duyệt; không đặt thì dùng Chromium của Playwright, thiếu thì dùng Chrome cài trên máy
//   E2E_SHOTS=e2e/screenshots/dot5  thư mục ảnh chụp (e2e/screenshots/ nằm trong .gitignore)
//   E2E_HEADED=1                    mở cửa sổ trình duyệt để xem
// Kết quả: in từng kiểm tra; ghi <E2E_SHOTS>/results.json; mã thoát 1 nếu có kiểm tra trượt.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.E2E_PORT ?? "31110";
const BASE = process.env.E2E_BASE ?? `http://localhost:${PORT}`;
const SHOTS = resolve(APP, process.env.E2E_SHOTS ?? "e2e/screenshots/dot5");
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

// ------------------------------------------------------------------ server tạm (Mock, DB và thư mục tệp riêng)
let server = null;
let tmp = null;
async function stopServer() {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once("exit", r));
    server.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  server = null;
  try {
    if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {} // Windows còn giữ khoá tệp DB: để hệ điều hành dọn
  tmp = null;
}
process.on("exit", () => {
  try {
    server?.kill();
  } catch {}
});

if (!process.env.E2E_BASE) {
  tmp = mkdtempSync(join(tmpdir(), "ba-dot5-e2e-"));
  const tsx = join(APP, "node_modules", "tsx", "dist", "cli.mjs");
  server = spawn(process.execPath, [tsx, "server/index.ts"], {
    cwd: APP,
    env: { ...process.env, PORT, DB_FILE: join(tmp, "e2e.db"), DATA_DIR: tmp, AI_MODE: "mock", APP_PASSWORD: "", ANTHROPIC_API_KEY: "", GITHUB_TOKEN: "" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try {
      up = (await fetch(`${BASE}/api/settings`)).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!up) {
    console.error(`Không khởi động được server ở ${BASE}`);
    process.exit(1);
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.error ?? ""}`);
  return data;
}

// ------------------------------------------------------------------ trình duyệt
async function launch() {
  const headless = !process.env.E2E_HEADED;
  if (process.env.CHROME_PATH) return chromium.launch({ headless, executablePath: process.env.CHROME_PATH });
  try {
    return await chromium.launch({ headless });
  } catch {
    return chromium.launch({ headless, channel: "chrome" }); // chưa chạy `npx playwright install chromium`
  }
}
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "vi-VN", acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.on("dialog", (d) => d.accept()); // confirm() gốc của trình duyệt (nếu còn)
};
watch(page);

// ------------------------------------------------------------------ ghi kết quả
const results = []; // { flow, msg, ok, soft? }
let current = "";
const flow = (name) => {
  current = name;
  console.log(`\n▶ ${name}`);
};
/** Kiểm tra cứng: trượt thì dừng bước hiện tại. */
const check = (cond, msg) => {
  results.push({ flow: current, msg, ok: !!cond });
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) throw new Error(`[${current}] ${msg}`);
};
/** Kiểm tra mềm: trượt thì ghi lại (lỗi app) nhưng chạy tiếp. */
const expect = (cond, msg) => {
  results.push({ flow: current, msg, ok: !!cond, soft: true });
  console.log(`  ${cond ? "✓" : "✗ (ghi lỗi, chạy tiếp)"} ${msg}`);
  return !!cond;
};
const shot = (name, p = page) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });

/** Chạy một bước; lỗi ngoài dự kiến được ghi lại và chụp ảnh, các bước sau vẫn chạy. */
async function step(name, fn) {
  flow(name);
  try {
    await fn();
  } catch (e) {
    if (!results.some((r) => r.flow === current && !r.ok && !r.soft)) results.push({ flow: current, msg: `Lỗi: ${e.message.split("\n")[0]}`, ok: false });
    console.log(`  ✗ ${e.message.split("\n")[0]}`);
    await shot(`loi-${name.replace(/[^\p{L}\d]+/gu, "-")}`).catch(() => {});
  }
}

// ------------------------------------------------------------------ thao tác dùng lại
const tid = (id, p = page) => p.getByTestId(id);
const LEAD = "Ha Tran";
const BA = "Minh Nguyen";
const MODULE = "Order Management";
let projectId = "";
let moduleId = "";
let leadId = "";
let baId = "";
let taskId = "";

/** Chọn "Tôi là…" ở thanh trên (theo tên, nhãn có thể kèm vai trò). */
async function iAm(name, p = page) {
  const picker = tid("me-picker", p);
  await picker.waitFor();
  const value = await picker.locator("option", { hasText: name }).first().getAttribute("value");
  await picker.selectOption(value);
  await p.waitForFunction((v) => localStorage.getItem("bacopilot.me") === v, value);
}
const work = (stepKey, sub) => `${BASE}/#/p/${projectId}/work/${moduleId}/${stepKey}${sub ? `/${sub}` : ""}`;
const bar = (testId = "approval-bar", p = page) => p.locator(`[data-testid="${testId}"]`);
async function waitStatus(status, testId = "approval-bar", timeout = 15000) {
  await page.locator(`[data-testid="${testId}"][data-status="${status}"]`).waitFor({ timeout });
}
async function toastWith(text, timeout = 6000) {
  return page
    .locator(".toast", { hasText: text })
    .first()
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false);
}
const card = (status, title) => page.locator(`[data-column="${status}"] [data-card]`, { hasText: title });
async function columnOf(title) {
  await page.goto(`${BASE}/#/p/${projectId}/tasks`);
  await tid("kanban").waitFor();
  await page.locator("[data-card]", { hasText: title }).first().waitFor({ timeout: 8000 });
  for (const s of ["todo", "doing", "done", "approved"]) if (await card(s, title).count()) return s;
  return null;
}
const COL = { todo: "To do", doing: "In progress", done: "Done", approved: "Approved" };
const DOCS = ["BRD", "UC_SPEC", "SRS", "FRD_NFR", "API_SPEC"];
const TASK_TITLE = "Write the API Spec for the Orders module";

try {
  // ================================================================ 1. Chuẩn bị
  await step("1. Chuẩn bị", async () => {
    leadId = (await api("POST", "/api/members", { name: LEAD, role: "BA_LEAD" })).id;
    baId = (await api("POST", "/api/members", { name: BA, role: "BA", actorId: leadId })).id;
    await page.goto(`${BASE}/#/`);
    await iAm(BA);
    await page.reload();
    check((await tid("me-picker").locator("option:checked").innerText()).includes(BA), `"Tôi là" nhớ ${BA} sau khi tải lại`);
    await tid("new-project").click();
    await tid("project-name").fill("Omnichannel Sales (E2E)");
    await tid("create-project").click();
    await page.waitForURL(/#\/p\/[^/]+\/tasks/);
    projectId = decodeURIComponent(page.url().match(/#\/p\/([^/]+)\//)[1]);
    check(!!projectId, "tạo dự án → mở thẳng Quản lý công việc");
    await tid("pnav-work").click();
    await tid("go-stories").waitFor();
    check((await tid("new-module").count()) === 0, "Thực hiện công việc không còn nút tạo module, chỉ dẫn sang Yêu cầu nghiệp vụ");
  });

  // ================================================================ 2. Yêu cầu nghiệp vụ
  await step("2. Yêu cầu nghiệp vụ", async () => {
    await tid("go-stories").click();
    await tid("stories-view").waitFor();
    check(await tid("story-add").isDisabled(), "dự án chưa có module → nút Thêm user story bị khoá");
    check((await tid("story-add-hint").innerText()).includes("Create a module before"), 'có lời nhắc "Tạo module trước…"');
    await shot("02a-chua-co-module");
    await tid("new-module").click();
    await tid("module-name").fill(MODULE);
    await tid("create-module").click();
    await page.waitForURL(/#\/p\/[^/]+\/stories\/[^/]+/);
    moduleId = decodeURIComponent(page.url().match(/\/stories\/([^/]+)/)[1]);
    check(!!moduleId && (await tid("story-add").isEnabled()), `tạo module "${MODULE}" ở Yêu cầu nghiệp vụ → nút Thêm user story mở`);
    // Task gắn tài liệu API Spec (BA Lead giao) – để kiểm tra task đi theo vòng Xong / Yêu cầu sửa / Duyệt
    taskId = (await api("POST", `/api/projects/${projectId}/tasks`, { title: TASK_TITLE, moduleId, assigneeId: baId, artifactType: "doc", artifactId: moduleId, artifactSub: "API_SPEC", actorId: leadId })).id;
    const stories = [
      { asA: "sales clerk", iWant: "view the list of orders by status", soThat: "I can process new orders the same day", ac: ["Filter defaults to New orders", "Show at most 20 orders, newest first"], priority: "High" },
      { asA: "sales clerk", iWant: "cancel an order that has not been delivered", soThat: "stock is returned when the customer changes their mind", ac: ["A cancellation reason is required"], priority: "Medium" },
    ];
    for (const [i, s] of stories.entries()) {
      await tid("story-add").click();
      await tid("story-editor").waitFor();
      await tid("story-asA").fill(s.asA);
      await tid("story-iWant").fill(s.iWant);
      await tid("story-soThat").fill(s.soThat);
      check((await tid("story-module").inputValue()) === moduleId, "dòng mới mặc định chọn module đang xem");
      await tid("story-priority").selectOption(s.priority);
      for (const [k, c] of s.ac.entries()) {
        if (k > 0) await tid("story-ac-add").click();
        await tid("story-ac").nth(k).fill(c);
      }
      await tid("story-save").click();
      await tid(`story-row-US-0${i + 1}`).waitFor();
    }
    check((await page.locator('[data-testid^="story-row-US-"]').count()) === 2, "thêm 2 user story (US-01, US-02) có As a / I want / So that + tiêu chí");
    await shot("02-yeu-cau-nghiep-vu");
  });

  // ================================================================ 3. Tài liệu
  await step("3. Tài liệu BRD → API Spec", async () => {
    for (const k of DOCS) {
      await page.goto(work("docs", k));
      await tid("docs-view").waitFor();
      await tid("doc-generate").click();
      await waitStatus("draft");
      check((await tid("doc-content").innerText()).trim().length > 50, `${k}: AI (Mock) sinh nội dung`);
      await tid("approval-bar-done").click();
      await waitStatus("done");
      check(true, `${k}: bấm Xong → trạng thái Xong`);
      if (k === "BRD" || k === "API_SPEC") await shot(`03-tai-lieu-${k}`);
    }
    // Bước sau mở khoá khi bước trước Xong: đã chứng minh bằng việc sinh được cả 5 bước liên tiếp
  });

  // ================================================================ Ca: BA không có quyền duyệt / quản trị
  await step("Ca: quyền của BA", async () => {
    await page.goto(work("docs", "BRD"));
    await waitStatus("done");
    check((await tid("approval-bar-approve").count()) === 0 && (await tid("approval-bar-request-change").count()) === 0, "BA không thấy nút Duyệt / Yêu cầu sửa trên tài liệu Xong");
    check((await tid("nav-admin").count()) === 0, 'BA không thấy mục "Quản trị hệ thống" trên thanh trên');
    await page.goto(`${BASE}/#/admin`);
    expect(await tid("admin-forbidden").waitFor({ timeout: 5000 }).then(() => true).catch(() => false), "BA vào thẳng #/admin → báo không có quyền");
    await shot("ca-ba-khong-quyen-admin");
    const r = await fetch(`${BASE}/api/artifacts/doc/${moduleId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub: "BRD", actorId: baId }) });
    check(r.status === 403, `server chặn BA gọi thẳng API Duyệt (403, thực tế ${r.status})`);
  });

  // ================================================================ 4. Sơ đồ
  await step("4. Sơ đồ Context / UC / BPMN", async () => {
    for (const k of ["CONTEXT", "UC", "BPMN"]) {
      await page.goto(work("diagrams", k));
      await tid("diagrams-view").waitFor();
      await tid("generate-diagram").click();
      await waitStatus("draft");
      await page.locator(".mermaid-svg svg, [data-testid=mermaid-error]").first().waitFor({ timeout: 20000 });
      check((await tid("mermaid-error").count()) === 0 && (await page.locator(".mermaid-svg svg").count()) > 0, `${k}: sinh sơ đồ, Mermaid vẽ được`);
      await tid("approval-bar-done").click();
      await waitStatus("done");
      await shot(`04-so-do-${k}`);
    }
    check(true, "3 sơ đồ đã Xong");
  });

  // ================================================================ 5. Prototype
  await step("5. Prototype", async () => {
    await page.goto(work("prototype"));
    await tid("new-screen").click();
    await tid("screen-name").fill("Order List");
    await tid("screen-prompt").fill("Order list: filter by status, a table with columns Order no, Customer, Total, Order date, Status; Cancel order button.");
    await tid("generate-screen").click();
    await page.locator(".screen-item", { hasText: "Order List" }).waitFor({ timeout: 20000 });
    await tid("canvas").waitFor();
    check(true, "AI (Mock) sinh 1 màn");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), tid("export-html").click()]);
    check(dl.suggestedFilename().endsWith(".html"), `Xuất HTML tải tệp ${dl.suggestedFilename()}`);
    await waitStatus("draft", "screen-approval");
    await tid("screen-approval-done").click();
    await waitStatus("done", "screen-approval");
    check(true, "màn: bấm Xong → Xong");
    await shot("05-prototype");
  });

  // ================================================================ 6–7. Test case, Truy vết
  await step("6. Test case", async () => {
    await page.goto(work("tests"));
    await tid("tests-step").waitFor();
    await tid("generate-tests").click();
    await waitStatus("draft", "tests-approval", 20000);
    await tid("tests-approval-done").click();
    await waitStatus("done", "tests-approval");
    check(true, "sinh test case → Xong");
    await shot("06-test-case");
  });
  await step("7. Truy vết", async () => {
    await page.goto(work("trace"));
    await tid("trace-matrix").waitFor({ timeout: 10000 });
    check((await tid("trace-matrix").locator("tbody tr").count()) > 0, "ma trận truy vết có dòng");
    await shot("07-truy-vet");
  });

  // ================================================================ 8. BA Lead: Yêu cầu sửa
  await step("8. BA Lead yêu cầu sửa API Spec", async () => {
    expect((await columnOf(TASK_TITLE)) === "done", `trước đó task "${TASK_TITLE}" ở cột Xong (tự đi theo tài liệu)`);
    await iAm(LEAD);
    check((await tid("nav-admin").count()) === 1, 'BA Lead thấy mục "Quản trị hệ thống"');
    await page.goto(work("docs", "API_SPEC"));
    await waitStatus("done");
    await tid("approval-bar-request-change").click();
    await waitStatus("draft");
    check((await tid("approval-bar-revision").count()) === 1, 'API Spec về Đang làm + tag "Yêu cầu sửa"');
    const col = await columnOf(TASK_TITLE);
    check(col === "doing", `task lùi về cột Đang làm (thực tế: ${COL[col] ?? "không thấy"})`);
    check((await tid(`revision-${taskId}`).count()) === 1, 'thẻ task có tag "Yêu cầu sửa"');
    await shot("08-kanban-yeu-cau-sua");
  });

  // ================================================================ 9. BA sửa, Xong
  await step("9. BA sửa và bấm Xong", async () => {
    await iAm(BA);
    await page.goto(work("docs", "API_SPEC"));
    await waitStatus("draft");
    await tid("doc-edit").click();
    const box = tid("doc-editor-text");
    await box.fill((await box.inputValue()) + "\n\n## Notes\n- Add error code 409 when cancelling a delivered order.\n");
    await tid("doc-editor-save").click();
    await tid("doc-editor").waitFor({ state: "detached" });
    await tid("approval-bar-done").click();
    await waitStatus("done");
    check((await tid("approval-bar-revision").count()) === 1, 'sửa xong bấm Xong → Xong, tag "Yêu cầu sửa" vẫn giữ');
    const col = await columnOf(TASK_TITLE);
    check(col === "done", `task sang cột Xong (thực tế: ${COL[col] ?? "không thấy"})`);
  });

  // ================================================================ 10. BA Lead Duyệt
  await step("10. BA Lead duyệt", async () => {
    await iAm(LEAD);
    await page.goto(work("docs", "API_SPEC"));
    await waitStatus("done");
    await tid("approval-bar-approve").click();
    const gitMsg = await toastWith("GitHub is not configured");
    await waitStatus("approved");
    check(true, "API Spec → Đã duyệt");
    expect(gitMsg, 'màn Tài liệu báo "Chưa cấu hình GitHub – chưa đẩy" khi duyệt (dự án chưa cấu hình repo)');
    await shot("10-tai-lieu-da-duyet");
    const col = await columnOf(TASK_TITLE);
    check(col === "approved", `Kanban: task ở cột Đã duyệt (thực tế: ${COL[col] ?? "không thấy"})`);
    check((await tid(`revision-${taskId}`).count()) === 0, 'duyệt xong hết tag "Yêu cầu sửa"');
    await shot("10-kanban-da-duyet");
    // Màn Test case hiện thông báo GitHub khi duyệt (đối chiếu)
    await page.goto(work("tests"));
    await waitStatus("done", "tests-approval");
    await tid("tests-approval-approve").click();
    expect(await toastWith("GitHub is not configured"), 'màn Test case báo "Chưa cấu hình GitHub – chưa đẩy" khi duyệt');
    await waitStatus("approved", "tests-approval");
    const hist = await api("GET", `/api/projects/${projectId}/git/history`);
    check(hist.configured === false, "Lịch sử GitHub: dự án chưa cấu hình, không đẩy");
  });

  // ================================================================ Ca: 2 tab cùng sửa một story → 409
  await step("Ca: 2 tab cùng sửa story", async () => {
    await iAm(BA);
    const page2 = await context.newPage();
    watch(page2);
    const url = `${BASE}/#/p/${projectId}/stories`;
    await page.goto(url);
    await page2.goto(url);
    for (const p of [page, page2]) {
      await tid("story-US-01-edit", p).click();
      await tid("story-editor", p).waitFor();
    }
    await tid("story-iWant").fill("view the list of orders by status and sales channel");
    await tid("story-save").click();
    await tid("story-editor").waitFor({ state: "detached" });
    await tid("story-iWant", page2).fill("view the latest orders");
    await tid("story-save", page2).click();
    const notice = tid("conflict-notice", page2);
    await notice.waitFor({ timeout: 5000 });
    check(/This version has changed/.test(await notice.innerText()), 'tab lưu sau thấy "Bản đã thay đổi – tải lại"');
    await shot("ca-2-tab-xung-dot", page2);
    await tid("conflict-notice-reload", page2).click();
    const fresh = await page2
      .waitForFunction(() => document.querySelector('[data-testid="story-iWant"]')?.value.includes("sales channel"), null, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    check(fresh && (await tid("conflict-notice", page2).count()) === 0, "bấm Tải lại → nhận bản mới của tab kia, hết thông báo");
    await page2.close();
  });

  // ================================================================ ảnh màn chính (1440 px và 375 px)
  await step("Ảnh màn chính", async () => {
    const pages = [
      ["kanban", `${BASE}/#/p/${projectId}/tasks`, "kanban"],
      ["yeu-cau", `${BASE}/#/p/${projectId}/stories`, "stories-view"],
      ["tai-lieu", work("docs", "BRD"), "docs-view"],
      ["so-do", work("diagrams", "BPMN"), "diagrams-view"],
      ["prototype", work("prototype"), "canvas"],
      ["lich-su-github", `${BASE}/#/p/${projectId}/git`, null],
      ["quan-tri", `${BASE}/#/admin`, "members-view"],
    ];
    for (const w of [1440, 375]) {
      await page.setViewportSize({ width: w, height: w === 375 ? 812 : 900 });
      for (const [name, url, ready] of pages) {
        await page.goto(url);
        if (ready) await tid(ready).waitFor({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(300);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(sw <= w + 1, `${w}px – ${name}: không tràn ngang (rộng ${sw}px)`);
        await shot(`${w}-${name}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  flow("Lỗi JavaScript");
  expect(errors.length === 0, `không có lỗi JavaScript trên trang${errors.length ? `: ${[...new Set(errors)].slice(0, 3).join(" | ")}` : ""}`);
} finally {
  await browser.close();
  await stopServer();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(join(SHOTS, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), total: results.length, failed: failed.length, results, errors: [...new Set(errors)] }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra qua${failed.length ? `, ${failed.length} trượt:` : "."}`);
for (const f of failed) console.log(`  ✗ [${f.flow}] ${f.msg}`);
console.log(`Ảnh: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
