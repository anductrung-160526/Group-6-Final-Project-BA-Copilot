// E2E luồng demo BA Copilot v2 (A11). Chạy trình duyệt thật qua giao diện, chế độ Mock, DB tạm.
//
//   Luồng demo (UC-24 → UC-26):
//     1. Tạo task "Vẽ UC diagram" gắn sơ đồ UC của module          → cột Cần làm
//     2. AI sinh sơ đồ                                               → task sang Đang làm   (FN-20)
//     3. BA Lead duyệt sơ đồ                                         → task sang Xong       (FN-21)
//     4. Sửa một màn đã duyệt                                        → task tài liệu sang Cần làm lại (FN-22, BR-02)
//   Luồng thêm:
//     - QUS: gõ story lỗi trong popup Tạo module → điểm < 60 kèm danh sách lỗi; vẫn lưu được (FN-53, FN-55, BR-05)
//     - Gợi ý: bấm Tạo ở khối "Gợi ý tiếp theo" → hộp thoại điền sẵn → màn mới xuất hiện (FN-59, FN-60, BR-06)
//   Cuối cùng chụp các trang chính và #/_gallery ở 1280 px và 375 px (đối chiếu docs/design-system.md).
//
// Dùng (trong ba-copilot-source/ba-copilot):
//   npm run build && node e2e/demo-flow.mjs
// Biến môi trường:
//   E2E_BASE=http://localhost:3000  dùng server có sẵn thay vì tự khởi động (DB của server đó sẽ bị ghi thêm dữ liệu)
//   E2E_PORT=3299                   cổng khi tự khởi động server
//   CHROME_PATH=…/chrome.exe        trình duyệt; không đặt thì dùng Chromium của Playwright, thiếu thì dùng Chrome cài trên máy
//   E2E_SHOTS=e2e/demo-flow         thư mục ảnh chụp (đã nằm trong .gitignore: e2e/demo-*/)
//   E2E_HEADED=1                    mở cửa sổ trình duyệt để xem

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.E2E_PORT ?? "3299";
const BASE = process.env.E2E_BASE ?? `http://localhost:${PORT}`;
const SHOTS = resolve(APP, process.env.E2E_SHOTS ?? "e2e/demo-flow");
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

// ------------------------------------------------------------------ server tạm (Mock, DB và thư mục tệp riêng)
let server = null;
let tmp = null;
const removeTmp = () => {
  try {
    if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {} // Windows còn giữ khoá tệp DB: để hệ điều hành dọn thư mục tạm
  tmp = null;
};
/** Tắt server tạm, chờ tiến trình thoát hẳn (nhả khoá tệp DB) rồi xoá thư mục tạm. */
async function stopServer() {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once("exit", r));
    server.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  server = null;
  removeTmp();
}
process.on("exit", () => {
  try {
    server?.kill();
  } catch {}
});

if (!process.env.E2E_BASE) {
  tmp = mkdtempSync(join(tmpdir(), "ba-demo-flow-"));
  const tsx = join(APP, "node_modules", "tsx", "dist", "cli.mjs");
  server = spawn(process.execPath, [tsx, "server/index.ts"], {
    cwd: APP,
    env: { ...process.env, PORT, DB_FILE: join(tmp, "e2e.db"), DATA_DIR: tmp, AI_MODE: "mock", APP_PASSWORD: "", ANTHROPIC_API_KEY: "" },
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
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "vi-VN" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept()); // confirm() của "Sinh lại", xoá…

const results = [];
let current = "";
const flow = (name) => {
  current = name;
  console.log(`\n▶ ${name}`);
};
const check = (cond, msg) => {
  if (!cond) throw new Error(`[${current}] ${msg}`);
  results.push(`${current} – ${msg}`);
  console.log("  ✓ " + msg);
};
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

// ------------------------------------------------------------------ thao tác dùng lại
const exact = (text) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
/** Dòng màn hình trong cột trái tab Thiết kế, khớp đúng tên. */
const screenItem = (name) => page.locator(".screen-item").filter({ has: page.locator(".screen-name", { hasText: exact(name) }) });

/** Chọn option có chứa `text` (nhãn có thể kèm vai trò, vd "Minh · BA"). */
async function selectByText(select, text) {
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  await select.selectOption(value);
  return value;
}

/** Chọn "Tôi là…" ở thanh trên (SCR-02, FN-02). */
async function iAm(name) {
  const picker = page.getByTestId("me-picker");
  if (!(await picker.count())) throw new Error(`[${current}] Thanh trên không có ô "Tôi là…" (data-testid="me-picker") – TopBar chưa gắn vào main.tsx (R-005 của A3)`);
  const value = await selectByText(picker, name);
  await page.waitForFunction((v) => localStorage.getItem("bacopilot.me")?.includes(v), value);
}

async function addMember(name, roleLabel) {
  await page.getByTestId("new-member").click();
  await page.getByTestId("member-name").fill(name);
  await page.getByTestId("member-role").selectOption({ label: roleLabel });
  await page.getByTestId("save-member").click();
  await page.getByTestId("member-row").filter({ hasText: name }).waitFor();
}

async function newScreen(name, prompt) {
  await page.getByTestId("new-screen").click();
  await page.getByTestId("screen-name").fill(name);
  await page.getByTestId("screen-prompt").fill(prompt);
  await page.getByTestId("generate-screen").click();
  await screenItem(name).waitFor();
}

/** Thẻ Kanban có tiêu đề `title`, nằm ở cột trạng thái `status`. */
const card = (status, title) => page.locator(`[data-column="${status}"] [data-card]`, { hasText: title });
const STATUS_LABEL = { todo: "Cần làm", doing: "Đang làm", done: "Xong", redo: "Cần làm lại" };
async function expectCard(status, title, why) {
  await page.goto(`${BASE}/#/p/${projectId}/tasks`);
  await page.getByTestId("kanban").waitFor();
  await card(status, title).waitFor({ timeout: 5000 }).catch(() => {});
  const where = [];
  for (const s of Object.keys(STATUS_LABEL)) if (await card(s, title).count()) where.push(STATUS_LABEL[s]);
  check(where.length === 1 && where[0] === STATUS_LABEL[status], `${why}: task "${title}" ở cột ${STATUS_LABEL[status]}${where[0] !== STATUS_LABEL[status] ? ` (thực tế: ${where.join(", ") || "không thấy"})` : ""}`);
}

async function createTask({ title, assignee, moduleName, artifactLabel }) {
  await page.goto(`${BASE}/#/p/${projectId}/tasks`);
  await page.getByTestId("new-task").click();
  await page.getByTestId("task-title").fill(title);
  if (assignee) await selectByText(page.getByTestId("task-assignee"), assignee);
  await page.getByTestId("task-module").selectOption({ label: moduleName });
  await page.getByTestId("task-artifact").selectOption({ label: artifactLabel });
  await page.getByTestId("task-save").click();
  await card("todo", title).waitFor();
}

const openModuleTab = async (tab) => {
  await page.goto(`${BASE}/#/m/${moduleId}/${tab}`);
  await page.getByTestId(`tab-${tab}`).waitFor();
};

// ------------------------------------------------------------------ chạy
const LEAD = "Trần Thu Hà";
const BA = "Nguyễn Văn Minh";
const MODULE = "Xác thực";
let projectId = "";
let moduleId = "";

try {
  // ================================================================ chuẩn bị: thành viên, dự án, module, màn hình
  flow("Chuẩn bị");
  await page.goto(`${BASE}/#/members`);
  await page.getByTestId("members-view").waitFor();
  await addMember(LEAD, "BA Lead");
  await addMember(BA, "BA");
  check((await page.getByTestId("member-row").count()) === 2, "thêm 2 thành viên (1 BA Lead, 1 BA) ở trang Thành viên");
  await iAm(BA);
  await page.reload();
  await page.getByTestId("members-view").waitFor();
  const meLabel = await page.getByTestId("me-picker").locator("option:checked").innerText();
  check(meLabel.includes(BA), `"Tôi là…" nhớ ${BA} sau khi tải lại trang`);

  await page.goto(`${BASE}/#/`);
  await page.getByTestId("new-project").click();
  await page.getByPlaceholder("VD: Hệ thống bán hàng online").fill("Cửa hàng online");
  await page.getByTestId("create-project").click();
  await page.waitForURL(/#\/p\/[^/]+/);
  projectId = page.url().match(/#\/p\/([^/]+)/)[1];
  await page.getByTestId("new-module").click();
  await page.getByPlaceholder("VD: Xác thực người dùng").fill(MODULE);
  await page.getByText("Dùng ví dụ mẫu").click();
  await page.getByTestId("create-module").click();
  await page.waitForURL(/#\/m\/[^/]+\/design/);
  moduleId = page.url().match(/#\/m\/([^/]+)/)[1];
  check(true, "tạo dự án và module bằng ví dụ mẫu");

  await newScreen("Đăng nhập", "Màn hình đăng nhập bằng email và mật khẩu, nút Đăng nhập, có quên mật khẩu và link đăng ký");
  await page.locator('[data-node-id="btn_login"]').waitFor();
  check(true, "AI (Mock) sinh màn Đăng nhập");

  // ================================================================ Gợi ý màn tiếp theo (FN-59, FN-60, BR-06)
  flow("Gợi ý màn tiếp theo");
  const block = page.getByTestId("suggest-block");
  await block.waitFor();
  const cards = block.getByTestId("suggestion-card");
  await cards.first().waitFor();
  const before = await cards.count();
  const pick = cards.first();
  const sugTitle = (await pick.locator(".suggestion-title").innerText()).trim();
  const sugReason = (await pick.locator(".suggestion-reason").innerText()).trim();
  check(before > 0 && sugTitle && sugReason, `khối "Gợi ý tiếp theo" có ${before} gợi ý, gợi ý đầu "${sugTitle}" ghi lý do: ${sugReason}`);
  const screensBefore = await page.locator(".screen-item").count();
  await shot("goi-y-truoc-khi-tao");
  await pick.getByRole("button", { name: "Tạo" }).click();
  const nameInput = page.getByTestId("screen-name");
  await nameInput.waitFor();
  check((await page.locator(".screen-item").count()) === screensBefore, "bấm Tạo chỉ mở hộp thoại, chưa tự tạo màn (BR-06)");
  const preName = await nameInput.inputValue();
  const prePrompt = await page.getByTestId("screen-prompt").inputValue();
  check(preName === sugTitle && prePrompt.trim().length > 0, `hộp thoại "Màn hình mới" điền sẵn tên "${preName}" và prompt (${prePrompt.length} ký tự)`);
  await page.getByTestId("generate-screen").click();
  await screenItem(sugTitle).waitFor();
  check((await page.locator(".screen-item").count()) === screensBefore + 1, `màn mới "${sugTitle}" xuất hiện trong danh sách màn`);
  await page.waitForTimeout(500);
  const titlesAfter = await block.locator(".suggestion-title").allInnerTexts();
  check(!titlesAfter.map((t) => t.trim()).includes(sugTitle), `gợi ý "${sugTitle}" biến mất sau khi tạo màn (còn ${titlesAfter.length} gợi ý)`);
  await shot("goi-y-sau-khi-tao");

  // ================================================================ Luồng demo: task tự cập nhật theo sản phẩm
  flow("Luồng demo – task");
  // Duyệt cả hai màn (BA Lead), để sinh được tài liệu (BR-01)
  await iAm(LEAD);
  for (const name of ["Đăng nhập", sugTitle]) {
    await screenItem(name).click();
    await page.getByTestId("approve-screen").click();
    await screenItem(name).getByText("Đã duyệt").waitFor();
  }
  check(true, "BA Lead duyệt 2 màn");
  await iAm(BA);

  // Bước 1 – tạo task (và một task tài liệu cho bước 4)
  await createTask({ title: "Vẽ UC diagram", assignee: BA, moduleName: MODULE, artifactLabel: `Sơ đồ UC – ${MODULE}` });
  check(true, 'bước 1: tạo task "Vẽ UC diagram" gắn sơ đồ UC của module → cột Cần làm');
  await createTask({ title: "Viết tài liệu đặc tả", assignee: BA, moduleName: MODULE, artifactLabel: `Tài liệu – ${MODULE}` });
  check(true, 'tạo task "Viết tài liệu đặc tả" gắn bộ tài liệu của module → cột Cần làm');
  await shot("kanban-buoc-1");

  // Sinh và duyệt tài liệu → task tài liệu Đang làm rồi Xong (cần có UC để vẽ sơ đồ)
  await openModuleTab("docs");
  await page.getByTestId("generate-docs").click();
  await page.locator(".paper h2").first().waitFor();
  await expectCard("doing", "Viết tài liệu đặc tả", "sinh tài liệu");
  await iAm(LEAD);
  await openModuleTab("docs");
  await page.getByTestId("approve-docs").click();
  await page.getByTestId("tab-docs").getByText("Đã duyệt").waitFor();
  await expectCard("done", "Viết tài liệu đặc tả", "BA Lead duyệt tài liệu");
  await iAm(BA);

  // Bước 2 – AI sinh sơ đồ → Đang làm
  await openModuleTab("diagram");
  await page.getByTestId("generate-diagram").click();
  await page.getByTestId("diagram-code").waitFor();
  check((await page.getByTestId("diagram-code").inputValue()).trim().startsWith("flowchart"), "AI (Mock) sinh mã Mermaid cho sơ đồ UC");
  await page.locator(".mermaid-svg svg").first().waitFor({ timeout: 15000 });
  await shot("so-do-uc");
  await expectCard("doing", "Vẽ UC diagram", "bước 2: AI sinh sơ đồ");

  // Bước 3 – BA Lead duyệt → Xong
  await iAm(LEAD);
  await openModuleTab("diagram");
  await page.getByTestId("approve-diagram").click();
  await page.getByTestId("unapprove-diagram").waitFor();
  await expectCard("done", "Vẽ UC diagram", "bước 3: BA Lead duyệt sơ đồ");
  await card("done", "Vẽ UC diagram").click();
  await page.getByTestId("task-event").last().waitFor();
  const history = await page.getByTestId("task-event").allInnerTexts();
  check(history.length >= 3 && history.slice(1).every((h) => h.includes("Hệ thống")), `lịch sử task ghi ${history.length} lần đổi, các lần tự động ghi "Hệ thống" kèm lý do (FN-23)`);
  await page.waitForTimeout(400); // chờ ngăn phải chạy xong hiệu ứng mở rồi mới chụp
  await shot("task-lich-su");
  await page.keyboard.press("Escape");

  // Bước 4 – sửa màn đã duyệt → task tài liệu Cần làm lại
  await iAm(BA);
  await openModuleTab("design");
  await screenItem("Đăng nhập").click();
  await page.locator('[data-node-type="Heading"]').first().click();
  await page.getByTestId("edit-prompt").fill("Đổi chữ thành Đăng nhập hệ thống");
  await page.getByTestId("apply-edit").click();
  await page.locator('[data-node-type="Heading"]', { hasText: "Đăng nhập hệ thống" }).waitFor();
  await page.getByTestId("tab-docs").getByText("Lỗi thời").waitFor({ timeout: 5000 });
  check(true, "sửa màn Đăng nhập đã duyệt → tài liệu Lỗi thời (BR-02)");
  await expectCard("redo", "Viết tài liệu đặc tả", "bước 4: sửa màn đã duyệt");
  await expectCard("done", "Vẽ UC diagram", "sơ đồ không đổi khi chỉ sửa màn");
  await shot("kanban-buoc-4");

  // ================================================================ QUS (FN-53, FN-55, BR-05)
  flow("QUS");
  await page.goto(`${BASE}/#/p/${projectId}/modules`);
  await page.getByTestId("new-module").click();
  await page.getByPlaceholder("VD: Xác thực người dùng").fill("Giỏ hàng");
  const req = page.locator(".modal textarea").first();
  await req.fill("Tôi muốn đăng nhập nhanh và dễ dùng\nHệ thống phải chạy tốt, ổn định");
  const total = page.getByTestId("qus-total");
  await total.waitFor();
  await page.waitForTimeout(400); // panel chấm lại sau 300 ms
  const score = Number((await total.innerText()).match(/(\d+)\s*\/\s*100/)?.[1] ?? NaN);
  check(score < 60, `story lỗi → điểm ${score}/100 (< 60, xếp hạng "${(await total.innerText()).replace(/\s+/g, " ").trim()}")`);
  const issues = await page.getByTestId("qus-panel").getByTestId("issue").allInnerTexts();
  check(issues.length > 0 && issues.some((t) => t.includes("WELL_FORMED")), `danh sách lỗi có ${issues.length} mục, gồm WELL_FORMED`);
  check(issues.some((t) => /Gợi ý/.test(t)), "lỗi kèm gợi ý cách viết lại (FN-55)");
  await shot("qus-diem-thap");
  await page.getByTestId("create-module").click();
  await page.waitForURL(/#\/m\/[^/]+\/design/);
  check(true, "điểm thấp vẫn lưu được module (BR-05)");

  // ================================================================ chụp màn hình 1280 / 375 px
  flow("Chụp màn hình");
  const pages = [
    ["trang-chu", "#/"],
    ["du-an", `#/p/${projectId}/modules`],
    ["thiet-ke", `#/m/${moduleId}/design`],
    ["tai-lieu", `#/m/${moduleId}/docs`],
    ["so-do-uc", `#/m/${moduleId}/diagram`],
    ["cong-viec", `#/p/${projectId}/tasks`],
    ["kho-tai-lieu", `#/p/${projectId}/files`],
    ["thanh-vien", "#/members"],
    ["gallery", "#/_gallery"],
  ];
  const overflow = [];
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 860 });
    for (const [name, hash] of pages) {
      await page.goto(`${BASE}/${hash}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(SHOTS, `${width}-${name}.png`), fullPage: true });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > width + 1) overflow.push(`${name}@${width}: rộng ${sw}px`);
    }
  }
  check(true, `chụp ${pages.length * 2} ảnh vào ${SHOTS}`);
  if (overflow.length) console.log("  ⚠ trang tràn ngang (ghi vào QA_REPORT): " + overflow.join("; "));

  check(errors.length === 0, "không có lỗi JavaScript trên trang" + (errors.length ? ": " + [...new Set(errors)].join(" | ") : ""));
  console.log(`\nE2E demo-flow OK – ${results.length} kiểm tra, ảnh chụp trong ${SHOTS}`);
} catch (e) {
  await shot("THAT-BAI").catch(() => {});
  console.error("\n✗ " + e.message);
  if (errors.length) console.error("Lỗi trên trang:", [...new Set(errors)]);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stopServer();
  process.exit();
}
