// Dữ liệu demo BA Copilot – đợt 5 (C11).
//   - 3 thành viên: 1 BA Lead + 2 BA (không mật khẩu – app không có màn đăng nhập, chọn ở ô "Tôi là…")
//   - Dự án "Cửa hàng điện tử (mẫu)" (mã cố định demo-shop), 2 module
//   - User story có cấu trúc (US-xx, As a / I want / So that, tiêu chí, ưu tiên) cho cả 2 module
//   - Module 1: đủ 5 tài liệu BRD → API Spec, đủ 5 sơ đồ Context → ERD, 3 màn prototype (+ bình luận BA Lead), bộ test case;
//     sản phẩm ở nhiều trạng thái: Đã duyệt, Xong, Đang làm, 1 tài liệu có cờ "Yêu cầu sửa"
//   - Task ở đủ 4 cột Cần làm / Đang làm / Xong / Đã duyệt, 1 task có tag "Yêu cầu sửa", task gắn tài liệu, sơ đồ, màn, bộ test
//
// Dùng: npm run seed            (DB mặc định data/ba-copilot.db, hoặc DB_FILE=…)
//
// Cách làm: mở DB rồi bật app ngay trong tiến trình này (createApp, cổng ngẫu nhiên) và gọi đúng các API mà giao diện gọi
// (story, sinh tài liệu / sơ đồ / màn / test bằng pipeline Mock, Xong / Duyệt / Yêu cầu sửa, task). Nhờ vậy dữ liệu luôn
// khớp quy tắc của app (rev, trạng thái, task tự đi theo sản phẩm, lịch sử task) và Mermaid do bộ dựng của shared/diagrams.ts sinh.
// Chỉ thành viên, dự án, module được ghi thẳng DB (để giữ mã cố định).
//
// Chạy lại được nhiều lần: xoá dự án demo cũ (theo mã hoặc cùng tên, kèm tệp trên đĩa) rồi tạo lại; thành viên demo ghi đè theo mã.
// Không đụng tới dự án, thành viên khác trong DB. Mặc định chế độ Mock; SEED_AI=claude để dùng Claude (cần ANTHROPIC_API_KEY).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { getDb, openDb, tx } from "../server/db.ts";
import * as repo from "../server/repo.ts";
import { removeFileFromDisk } from "../server/files.ts";
import { createApp } from "../server/app.ts";
import { DOC_KINDS, DIAGRAM_KINDS, type DocKind, type DiagramKind } from "../shared/types.ts";

const root = join(import.meta.dirname, "..");
const envFile = join(root, ".env");
if (existsSync(envFile))
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
if (process.env.SEED_AI?.trim().toLowerCase() !== "claude") {
  process.env.AI_MODE = "mock";
  delete process.env.ANTHROPIC_API_KEY;
}
delete process.env.APP_PASSWORD; // app trong tiến trình seed không cần cổng mật khẩu
openDb(process.env.DB_FILE ?? join(root, "data", "ba-copilot.db"));
const db = getDb();

// ------------------------------------------------------------- Mã cố định
const DEMO = {
  project: "demo-shop",
  projectName: "Electronics Store (sample)",
  products: "demo-mod-products",
  orders: "demo-mod-orders",
};
const LAN = "demo-mem-lan"; // BA Lead
const DUC = "demo-mem-duc"; // BA
const ANH = "demo-mem-anh"; // BA
const MEMBERS = [
  { id: LAN, name: "Lan Nguyen", role: "BA_LEAD" },
  { id: DUC, name: "Duc Tran", role: "BA" },
  { id: ANH, name: "Anh Le", role: "BA" },
] as const;
const OLD_DEMO_MEMBERS = ["demo-mem-ha", "demo-mem-huy"]; // seed bản cũ (5 người)
const OLD_PROJECT_NAME = "Cửa hàng điện tử (mẫu)"; // vi-keep: tên dự án demo bản tiếng Việt cũ, để dọn khi chạy lại

const iso = (d: Date) => d.toISOString();
const ago = (days: number) => iso(new Date(Date.now() - days * 24 * 3600_000));
const dayOffset = (days: number) => iso(new Date(Date.now() + days * 24 * 3600_000)).slice(0, 10);

// ------------------------------------------------------------- 1. Dọn dữ liệu demo cũ
// Tên cũ (bản seed tiếng Việt) cũng được dọn khi chạy lại
const old = db.prepare("SELECT id FROM projects WHERE id = ? OR name IN (?, ?)").all(DEMO.project, DEMO.projectName, OLD_PROJECT_NAME) as { id: string }[];
for (const { id } of old) {
  for (const f of db.prepare("SELECT stored_name FROM files WHERE project_id = ?").all(id) as { stored_name: string }[]) removeFileFromDisk(f.stored_name);
  tx(() => {
    // prompt_runs, suggestion_events chỉ tham chiếu logic (không có khoá ngoại) nên xoá tay
    db.prepare("DELETE FROM prompt_runs WHERE module_id IN (SELECT id FROM modules WHERE project_id = ?)").run(id);
    db.prepare("DELETE FROM suggestion_events WHERE screen_id IN (SELECT s.id FROM screens s JOIN modules m ON m.id = s.module_id WHERE m.project_id = ?)").run(id);
    repo.deleteProject(id); // CASCADE: module, story, tài liệu, sơ đồ, màn, test, task, lịch sử task, git_pushes…
  });
}
if (old.length) console.log(`Deleted ${old.length} old demo ${old.length === 1 ? "project" : "projects"}.`);

// ------------------------------------------------------------- 2. Thành viên, dự án, module (ghi thẳng để giữ mã cố định)
tx(() => {
  // Thành viên demo cũ không còn dùng: chỉ xoá khi không còn giữ việc ở dự án khác
  for (const id of OLD_DEMO_MEMBERS) {
    const busy = db.prepare("SELECT 1 FROM tasks WHERE assignee_id = ? LIMIT 1").get(id);
    if (!busy) db.prepare("DELETE FROM members WHERE id = ?").run(id);
  }
  const st = db.prepare(
    `INSERT INTO members (id, name, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role`,
  );
  MEMBERS.forEach((m, i) => st.run(m.id, m.name, m.role, ago(30 - i)));
  db.prepare("INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)").run(
    DEMO.project,
    DEMO.projectName,
    "Sample project for demos: an electronics e-commerce website – product and order management.",
    ago(14),
  );
  const mod = db.prepare("INSERT INTO modules (id, project_id, name, created_at) VALUES (?, ?, ?, ?)");
  mod.run(DEMO.products, DEMO.project, "Product Management", ago(14));
  mod.run(DEMO.orders, DEMO.project, "Order Management", ago(13));
});
console.log(`Members: ${MEMBERS.map((m) => `${m.name}${m.role === "BA_LEAD" ? " (BA Lead)" : " (BA)"}`).join(", ")}`);

// ------------------------------------------------------------- 3. Bật app trong tiến trình, gọi API như giao diện
const server = createApp({ publicDir: join(root, "public") });
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function api<T = any>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.error ?? "error"}`);
  return data as T;
}
const done = (kind: string, id: string, sub?: string, by = DUC) => api("POST", `/api/artifacts/${kind}/${id}/done`, { sub, actorId: by });
const approve = (kind: string, id: string, sub?: string) => api("POST", `/api/artifacts/${kind}/${id}/approve`, { sub, actorId: LAN });
const requestChange = (kind: string, id: string, sub?: string) => api("POST", `/api/artifacts/${kind}/${id}/request-change`, { sub, actorId: LAN });

try {
  // ----------------------------------------------------------- 4. User story có cấu trúc (R-050: qua API, không qua requirementInput)
  type S = { asA: string; iWant: string; soThat: string; ac: string[]; priority: "High" | "Medium" | "Low" };
  const STORIES: Record<string, S[]> = {
    [DEMO.products]: [
      {
        asA: "administrator",
        iWant: "search products by name or SKU",
        soThat: "I can check stock before restocking",
        ac: ["Search matches part of the name, case-insensitive", "When there are no results, show the message 'No products found'", "Results are paginated at 20 rows per page"],
        priority: "High",
      },
      {
        asA: "administrator",
        iWant: "add a new product with name, SKU, category, price and stock",
        soThat: "the product can go on sale on the website",
        ac: ["Product name is required, up to 100 characters", "SKU must be unique", "Price must be greater than 0"],
        priority: "High",
      },
      {
        asA: "administrator",
        iWant: "edit the price and stock of a product",
        soThat: "the information on the website is always correct",
        ac: ["On successful save, show a confirmation and refresh the list", "Stock cannot be negative"],
        priority: "Medium",
      },
      {
        asA: "administrator",
        iWant: "filter products by category and status",
        soThat: "I can review prices for each product group",
        ac: ["Filters can be combined with the search box", "There is an 'All categories' option"],
        priority: "Medium",
      },
      {
        asA: "administrator",
        iWant: "discontinue a product",
        soThat: "customers cannot order discontinued items",
        ac: ["Ask for confirmation before discontinuing", "Discontinued products are not shown on the website"],
        priority: "Low",
      },
    ],
    [DEMO.orders]: [
      {
        asA: "sales clerk",
        iWant: "view the list of orders by status",
        soThat: "I can process new orders the same day",
        ac: ["Filter defaults to 'New' orders", "Show order number, customer, total amount and order date"],
        priority: "High",
      },
      {
        asA: "sales clerk",
        iWant: "create an in-store order and print the invoice",
        soThat: "the customer receives the invoice at checkout",
        ac: ["Only products in stock can be selected", "The total is calculated automatically from the quantity"],
        priority: "High",
      },
      {
        asA: "sales clerk",
        iWant: "cancel an order that has not been delivered",
        soThat: "stock is returned when the customer changes their mind",
        ac: ["A cancellation reason is required", "Delivered orders cannot be cancelled"],
        priority: "Medium",
      },
      {
        asA: "accountant",
        iWant: "export the monthly order list to Excel",
        soThat: "I can reconcile revenue at month end",
        ac: ["The file has order number, date, sales channel and total amount columns"],
        priority: "Low",
      },
    ],
  };
  for (const [moduleId, list] of Object.entries(STORIES))
    for (const s of list)
      await api("POST", `/api/projects/${DEMO.project}/stories`, {
        moduleId,
        asA: s.asA,
        iWant: s.iWant,
        soThat: s.soThat,
        acceptanceCriteria: s.ac,
        priority: s.priority,
        actorId: ANH,
      });
  console.log(`User story: ${STORIES[DEMO.products].length} (Products) + ${STORIES[DEMO.orders].length} (Orders)`);

  // ----------------------------------------------------------- 5. Task gắn sản phẩm (tạo trước để tự đi theo vòng đời sản phẩm)
  type TaskSpec = {
    key: string;
    title: string;
    description: string;
    moduleId: string;
    assigneeId: string;
    due: number;
    priority: "High" | "Medium" | "Low";
    artifactType?: "doc" | "diagram" | "screen" | "tests";
    artifactId?: string;
    artifactSub?: string;
  };
  const taskIds: Record<string, string> = {};
  async function createTask(t: TaskSpec) {
    const r = await api("POST", `/api/projects/${DEMO.project}/tasks`, {
      title: t.title,
      description: t.description,
      moduleId: t.moduleId,
      assigneeId: t.assigneeId,
      dueDate: dayOffset(t.due),
      priority: t.priority,
      artifactType: t.artifactType,
      artifactId: t.artifactId,
      artifactSub: t.artifactSub,
      actorId: LAN,
    });
    taskIds[t.key] = r.id;
  }
  const P = DEMO.products;
  const docTask = (kind: DocKind, title: string, who: string, due: number): TaskSpec => ({
    key: `doc-${kind}`,
    title,
    description: `Generate and review the ${title.replace(/^Write (the )?/, "")} of the Product Management module, then mark it as done for BA Lead approval.`,
    moduleId: P,
    assigneeId: who,
    due,
    priority: "High",
    artifactType: "doc",
    artifactId: P,
    artifactSub: kind,
  });
  const diagramTask = (kind: DiagramKind, title: string, who: string, due: number): TaskSpec => ({
    key: `diagram-${kind}`,
    title,
    description: "Generate with AI from the Done documents, adjust the Mermaid code if needed.",
    moduleId: P,
    assigneeId: who,
    due,
    priority: "Medium",
    artifactType: "diagram",
    artifactId: P,
    artifactSub: kind,
  });
  for (const t of [
    docTask("BRD", "Write the BRD", DUC, -4),
    docTask("UC_SPEC", "Write the UC Specification", DUC, -2),
    docTask("SRS", "Write the SRS", ANH, 1),
    docTask("FRD_NFR", "Write the FRD-NFR", ANH, 2),
    docTask("API_SPEC", "Write the API Spec", DUC, 4),
    diagramTask("CONTEXT", "Draw the Context diagram", ANH, -1),
    diagramTask("BPMN", "Draw the BPMN diagram for the restocking process", ANH, 3),
    diagramTask("ERD", "Draw the ERD", DUC, 5),
  ])
    await createTask(t);

  // ----------------------------------------------------------- 6. Tài liệu module 1: sinh lần lượt 5 bước (Mock), bấm Xong từng bước
  // (bước N chỉ sinh / Xong được khi bước N−1 đã Xong – shared/prereq.ts; tests/seedRules.test.ts kiểm lại dữ liệu)
  for (const kind of DOC_KINDS) {
    await api("POST", `/api/modules/${P}/docs/${kind}/generate`, { actorId: kind === "SRS" || kind === "FRD_NFR" ? ANH : DUC });
    await done("doc", P, kind, kind === "SRS" || kind === "FRD_NFR" ? ANH : DUC);
  }

  // ----------------------------------------------------------- 7. Sơ đồ module 1: đủ 5 loại (Mermaid do pipeline Mock + shared/diagrams.ts dựng)
  for (const kind of DIAGRAM_KINDS) await api("POST", `/api/modules/${P}/diagrams/${kind}/generate`, { actorId: kind === "ERD" ? DUC : ANH });
  for (const kind of ["CONTEXT", "UC", "SEQUENCE", "BPMN"] as DiagramKind[]) await done("diagram", P, kind, ANH);
  await approve("diagram", P, "CONTEXT");
  await approve("diagram", P, "UC");
  // ERD để Đang làm (bản nháp)

  // ----------------------------------------------------------- 8. Prototype: 3 màn (Mock), Đã duyệt / Xong / Đang làm + bình luận BA Lead
  async function screen(name: string, prompt: string, by: string) {
    const r = await api("POST", `/api/modules/${P}/screens`, { name, prompt, actorId: by });
    return r.screen.id as string;
  }
  const scrList = await screen(
    "Product List",
    "Product management: search by name or SKU, filter by category and status, a list table with columns Code, Product name, Price, Stock, Status, view/edit/delete actions, an Add new button and pagination.",
    DUC,
  );
  const scrAdd = await screen(
    "Add Product",
    "Add product form: product name (required, up to 100 characters), SKU, category, price, stock, description; Save and Cancel buttons.",
    DUC,
  );
  await screen("Category Management", "Category management: search by name, a list table with columns Code, Category name, Number of products, edit/delete actions and an Add new button.", ANH);
  await api("POST", `/api/screens/${scrAdd}/annotations`, { comment: "Add a product image picker and a price format hint (USD).", nodeIds: [], actorId: LAN });
  for (const t of [
    { key: "screen-list", title: "Design the Product List screen", id: scrList, who: DUC, due: -3 },
    { key: "screen-add", title: "Design the Add Product screen", id: scrAdd, who: DUC, due: 2 },
  ])
    await createTask({ key: t.key, title: t.title, description: "Prototype generated from the SRS, FRD-NFR and user stories.", moduleId: P, assigneeId: t.who, due: t.due, priority: "High", artifactType: "screen", artifactId: t.id });
  for (const k of ["screen-list", "screen-add"]) await api("PATCH", `/api/tasks/${taskIds[k]}/status`, { status: "doing", actorId: DUC });
  await done("screen", scrList, undefined, DUC);
  await approve("screen", scrList);
  await done("screen", scrAdd, undefined, DUC);
  // Quản lý danh mục: để Đang làm (chưa có task)

  // ----------------------------------------------------------- 9. Test case module 1 (cần FRD-NFR Xong)
  await createTask({ key: "tests", title: "Write test cases for the Products module", description: "Generate test cases from the UC Specification + FRD-NFR.", moduleId: P, assigneeId: ANH, due: 3, priority: "Medium", artifactType: "tests", artifactId: P });
  await api("POST", `/api/modules/${P}/tests/generate`, { actorId: ANH });
  await done("tests", P, undefined, ANH);

  // ----------------------------------------------------------- 10. BA Lead duyệt / yêu cầu sửa
  // Duyệt khi dự án chưa cấu hình GitHub: vẫn duyệt, kết quả "Chưa cấu hình GitHub – chưa đẩy".
  await approve("doc", P, "BRD");
  await approve("doc", P, "UC_SPEC");
  // Yêu cầu sửa bước cuối (API Spec) – không bước nào dựa trên nó, nên chuỗi BRD → FRD-NFR, sơ đồ, test case vẫn Xong.
  // (Yêu cầu sửa bước giữa sẽ làm các bước sau đang Xong thành Bản cũ – server/prereq.ts cascadeOutdated.)
  await requestChange("doc", P, "API_SPEC"); // API Spec về Đang làm + tag "Yêu cầu sửa"; task "Viết API Spec" lùi về Đang làm

  // ----------------------------------------------------------- 11. Module 2: task Cần làm / Đang làm
  await createTask({ key: "orders-brd", title: "Write the BRD for the Orders module", description: "Generate the BRD from the 4 user stories of the Orders module.", moduleId: DEMO.orders, assigneeId: ANH, due: 6, priority: "High", artifactType: "doc", artifactId: DEMO.orders, artifactSub: "BRD" });
  await createTask({ key: "orders-review", title: "Review the Orders stories with the sales team", description: "Check the acceptance criteria against the actual in-store process.", moduleId: DEMO.orders, assigneeId: DUC, due: 2, priority: "Medium" });
  await createTask({ key: "orders-nfr", title: "Add non-functional requirements for orders", description: "Order list response time, maximum number of orders per page.", moduleId: DEMO.orders, assigneeId: DUC, due: 4, priority: "Low" });
  await api("PATCH", `/api/tasks/${taskIds["orders-review"]}/status`, { status: "doing", actorId: DUC });

  // ----------------------------------------------------------- 12. Tổng kết
  const docs = await api<any[]>("GET", `/api/modules/${P}/docs`);
  const diagrams = await api<any[]>("GET", `/api/modules/${P}/diagrams`);
  const screens = (await api<any>("GET", `/api/modules/${P}`)).screens as any[];
  const tasks = await api<any[]>("GET", `/api/projects/${DEMO.project}/tasks`);
  const ST: Record<string, string> = { none: "Not started", draft: "Draft", done: "Done", approved: "Approved", outdated: "Outdated", todo: "To do", doing: "In progress" };
  const flag = (x: { revisionRequested?: boolean }) => (x.revisionRequested ? " + Changes requested" : "");
  console.log(`Documents: ${docs.map((d) => `${d.kind} ${ST[d.status]}${flag(d)}`).join(" · ")}`);
  console.log(`Diagrams: ${diagrams.map((d) => `${d.kind} ${ST[d.status]}`).join(" · ")}`);
  console.log(`Prototype: ${screens.map((s) => `${s.name} ${ST[s.status]}`).join(" · ")}`);
  const count: Record<string, number> = { todo: 0, doing: 0, done: 0, approved: 0 };
  for (const t of tasks) count[t.status]++;
  console.log(
    `Tasks: ${tasks.length} – To do ${count.todo}, In progress ${count.doing}, Done ${count.done}, Approved ${count.approved}; Changes requested: ${tasks.filter((t) => t.revisionRequested).map((t) => t.title).join(", ") || "none"}`,
  );
  const missing = (["todo", "doing", "done", "approved"] as const).filter((s) => !count[s]);
  if (missing.length || !tasks.some((t) => t.revisionRequested)) throw new Error(`Demo data is missing: column ${missing.join(", ") || "–"} / a task with Changes requested`);

  const port = process.env.PORT ?? 3000;
  console.log(`\nDone. Open http://localhost:${port}/#/p/${DEMO.project}/tasks`);
  console.log(`  Documents: http://localhost:${port}/#/p/${DEMO.project}/work/${P}/docs`);
} finally {
  server.close();
}
