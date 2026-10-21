// E2E hồi quy Design Studio (đợt 5: URL #/p/:pid/work/:mid/<bước>): sinh màn, khoanh vùng, bình luận, sửa bằng prompt,
// phiên bản, Xong, test case, truy vết, gợi ý bố cục, nhật ký AI. Luồng demo đợt 5 đầy đủ: e2e/demo-flow.mjs.
// Chạy trình duyệt thật bằng giao diện (chế độ Mock, DB tạm).
// Dùng: npm run e2e   (tự khởi động server ở cổng 3199; chạy được cả trên Windows)
// Biến môi trường: E2E_BASE (dùng server có sẵn), E2E_PORT, CHROME_PATH (không đặt thì dùng Chromium của Playwright, thiếu thì Chrome cài trên máy)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.E2E_PORT ?? "3199";
const BASE = process.env.E2E_BASE ?? `http://localhost:${PORT}`;
const SHOTS = join(APP, "e2e", "screenshots");
mkdirSync(SHOTS, { recursive: true });

let server;
if (!process.env.E2E_BASE) {
  const tmp = mkdtempSync(join(tmpdir(), "ba-e2e-"));
  // Gọi thẳng tsx bằng node: spawn("npx") không chạy được trên Windows khi không có shell
  const tsx = join(APP, "node_modules", "tsx", "dist", "cli.mjs");
  server = spawn(process.execPath, [tsx, "server/index.ts"], {
    cwd: APP,
    env: { ...process.env, PORT, DB_FILE: join(tmp, "e2e.db"), DATA_DIR: tmp, AI_MODE: "mock", APP_PASSWORD: "", ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  process.on("exit", () => {
    try {
      server.kill();
    } catch {}
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {} // Windows còn giữ khoá tệp DB: để hệ điều hành dọn thư mục tạm
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

async function launch() {
  if (process.env.CHROME_PATH) return chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" }); // chưa chạy `npx playwright install chromium`
  }
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept());

let step = 0;
const shot = async (name) => page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png` });
const check = (cond, msg) => {
  if (!cond) throw new Error("E2E thất bại: " + msg);
  console.log("  ✓ " + msg);
};

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.error ?? ""}`);
  return data;
}

try {
  // Đợt 5: thành viên + user story qua API; dự án, module bằng giao diện; vào bước Prototype theo URL mới
  const lead = await api("POST", "/api/members", { name: "Lead Analyst", role: "BA_LEAD" });
  const ba = await api("POST", "/api/members", { name: "Test Analyst", role: "BA", actorId: lead.id });
  await page.goto(BASE);
  await page.getByTestId("me-picker").selectOption(ba.id);
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name").fill("Online Store");
  await page.getByTestId("create-project").click();
  await page.waitForURL(/#\/p\/[^/]+\/tasks/);
  const pid = decodeURIComponent(page.url().match(/#\/p\/([^/]+)\//)[1]);
  // Đợt 6 (D3): tạo module ở màn Yêu cầu nghiệp vụ (module trước, story sau)
  await page.getByTestId("pnav-stories").click();
  await page.getByTestId("new-module").click();
  await page.getByTestId("module-name").fill("Authentication");
  await page.getByTestId("create-module").click();
  await page.waitForURL(/#\/p\/[^/]+\/stories\/[^/]+/);
  const mid = decodeURIComponent(page.url().match(/\/stories\/([^/]+)/)[1]);
  await api("POST", `/api/projects/${pid}/stories`, {
    moduleId: mid,
    asA: "customer",
    iWant: "sign in with my email and password",
    soThat: "I can view my order history",
    acceptanceCriteria: ["A wrong password shows an error", "There is a Forgot password link"],
    priority: "High",
    actorId: ba.id,
  });
  // Tài liệu tới FRD-NFR (Mock) và bấm Xong – điều kiện để sinh test case
  for (const k of ["BRD", "UC_SPEC", "SRS", "FRD_NFR"]) {
    await api("POST", `/api/modules/${mid}/docs/${k}/generate`, { actorId: ba.id });
    await api("POST", `/api/artifacts/doc/${mid}/done`, { sub: k, actorId: ba.id });
  }
  const work = (s) => `${BASE}/#/p/${pid}/work/${mid}/${s}`;
  await page.goto(work("prototype"));
  await page.getByTestId("new-screen").waitFor();
  check(true, "tạo dự án, module, user story, tài liệu tới FRD-NFR");

  // Sinh 2 màn hình
  await page.getByTestId("new-screen").click();
  await page.getByTestId("screen-name").fill("Sign in");
  await page.getByTestId("screen-prompt").fill("Sign-in screen with email and password, a Sign in button, forgot password and a sign up link");
  await page.getByTestId("generate-screen").click();
  await page.locator('[data-node-id="btn_login"]').waitFor();
  check(true, "AI sinh màn hình Đăng nhập");
  await page.getByTestId("new-screen").click();
  await page.getByTestId("screen-name").fill("Home");
  await page.getByTestId("screen-prompt").fill("Customer overview home page");
  await page.getByTestId("generate-screen").click();
  await page.locator('[data-node-id="stats"]').waitFor();
  await page.locator(".screen-item", { hasText: "Sign in" }).click();
  await page.locator('[data-node-id="btn_login"]').waitFor();
  await shot("design-generated");

  // Khoanh vùng bằng click
  await page.locator('[data-node-id="btn_login"]').click();
  check((await page.getByTestId("selection").innerText()).includes("Sign in"), "chọn phần tử bằng click");
  await page.getByTestId("comment-input").fill('Change the text to "Enter the system"');
  await page.getByTestId("add-comment").click();
  await page.locator(".pin").first().waitFor();
  check(await page.getByTestId("ann-check").first().isChecked(), "bình luận mới được tick sẵn để gửi vào prompt");
  await shot("annotated");

  // Khoanh vùng bằng kéo khung quanh ô mật khẩu
  await page.getByTestId("mode-region").click();
  const pwd = await page.locator('[data-node-type="Input"]', { hasText: "Password" }).first().boundingBox();
  await page.mouse.move(pwd.x - 6, pwd.y - 6);
  await page.mouse.down();
  await page.mouse.move(pwd.x + pwd.width + 6, pwd.y + pwd.height + 6, { steps: 8 });
  await page.mouse.up();
  const sel = await page.getByTestId("selection").innerText();
  check(sel.includes("Password") && !sel.includes("Enter the system"), "kéo khung chọn đúng ô Mật khẩu (thay vùng chọn cũ)");

  // Gửi bình luận + vùng chọn hiện tại → AI sửa
  await page.getByTestId("mode-select").click();
  await page.locator('[data-node-id="btn_login"]').click();
  await page.getByTestId("apply-edit").click();
  await page.locator('[data-node-id="btn_login"]', { hasText: "Enter the system" }).waitFor();
  check(true, "gửi bình luận vào prompt → AI sửa đúng vùng");
  await page.waitForTimeout(300);
  await shot("edited-region");

  // Prompt sửa thêm nút trong form
  await page.locator('[data-node-id="login_form"]').click({ position: { x: 5, y: 5 } });
  await page.getByTestId("edit-prompt").fill('Add button "Sign in with Google"');
  await page.getByTestId("apply-edit").click();
  await page.getByText("Sign in with Google").first().waitFor();
  check(true, "prompt sửa thêm phần tử trong vùng");
  await page.getByTestId("versions-tab").click();
  await page.locator(".ver-head").nth(2).waitFor(); // danh sách phiên bản tải sau khi mở tab
  check((await page.locator(".ver-head").count()) === 3, "lịch sử có 3 phiên bản");
  await shot("versions");

  // Đợt 5: bấm Xong cho màn (thay nút Duyệt thiết kế cũ); sửa màn đang Xong → về Đang làm
  await page.getByTestId("screen-approval-done").click();
  await page.locator('[data-testid="screen-approval"][data-status="done"]').waitFor();
  check(true, "màn Đăng nhập: bấm Xong");
  // Nút mở lại panel "Sửa" không có data-testid: tải lại màn để về panel mặc định
  await page.reload();
  await page.locator(".screen-item", { hasText: "Sign in" }).click();
  await page.locator('[data-node-type="Heading"]').first().click();
  await page.getByTestId("edit-prompt").fill("Change the text to System sign-in");
  await page.getByTestId("apply-edit").click();
  await page.locator('[data-node-type="Heading"]', { hasText: "System sign-in" }).waitFor();
  await page.locator('[data-testid="screen-approval"][data-status="draft"]').waitFor({ timeout: 5000 });
  check(true, "sửa màn đang Xong → về Đang làm (phải bấm Xong lại)");

  // Test case (cần FRD-NFR Xong)
  await page.goto(work("tests"));
  await page.getByTestId("generate-tests").click();
  await page.getByTestId("tests-approval").waitFor({ timeout: 15000 });
  await page.locator("table tbody tr").first().waitFor();
  const n = await page.locator("table tbody tr").count();
  check(n > 3, `sinh ${n} test case`);
  await shot("tests");
  const dl2 = page.waitForEvent("download");
  await page.getByTestId("export-xlsx").click();
  check((await dl2).suggestedFilename().endsWith(".xlsx"), "xuất file Excel");

  // Truy vết
  await page.goto(work("trace"));
  await page.getByTestId("trace-matrix").waitFor();
  check((await page.getByTestId("trace-matrix").locator("tbody tr").count()) > 0, "ma trận truy vết Story → UC → FR → Màn → TC");
  await shot("trace");

  await page.goto(work("prototype"));
  await page.locator(".screen-item", { hasText: "Sign in" }).click();
  await page.locator('[data-node-type="Form"]').first().waitFor();

  // Gợi ý bố cục (Recursive Transformer, Li et al. 2020): chọn form → phần tử tiếp theo (top-3) → chấp nhận
  await page.getByTestId("suggest-tab").click();
  await page.locator('[data-node-type="Form"]').first().click({ position: { x: 3, y: 3 } });
  await page.getByTestId("candidate").first().waitFor();
  check((await page.getByTestId("candidate").count()) === 3, "gợi ý bố cục: top-3 loại phần tử tiếp theo trong container đang chọn");
  await shot("layout-suggest");
  await page.getByTestId("accept-next").click();
  await page.getByTestId("versions-tab").click();
  await page.getByText("Layout suggestion").first().waitFor();
  check(true, "chấp nhận gợi ý bố cục → phiên bản mới");
  await page.getByTestId("pnav-logs").click();
  await page.getByTestId("log-row").first().waitFor();
  await shot("logs");

  check(errors.length === 0, "không có lỗi JavaScript trên trang" + (errors.length ? ": " + errors.join(" | ") : ""));
  console.log(`\nE2E OK – ảnh chụp trong ${SHOTS}/`);
} catch (e) {
  await shot("FAILED");
  console.error(e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  process.exit();
}
