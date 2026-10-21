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
  projectName: "Cửa hàng điện tử (mẫu)",
  products: "demo-mod-products",
  orders: "demo-mod-orders",
};
const LAN = "demo-mem-lan"; // BA Lead
const DUC = "demo-mem-duc"; // BA
const ANH = "demo-mem-anh"; // BA
const MEMBERS = [
  { id: LAN, name: "Nguyễn Thị Lan", role: "BA_LEAD" },
  { id: DUC, name: "Trần Minh Đức", role: "BA" },
  { id: ANH, name: "Lê Hoàng Anh", role: "BA" },
] as const;
const OLD_DEMO_MEMBERS = ["demo-mem-ha", "demo-mem-huy"]; // seed bản cũ (5 người)

const iso = (d: Date) => d.toISOString();
const ago = (days: number) => iso(new Date(Date.now() - days * 24 * 3600_000));
const dayOffset = (days: number) => iso(new Date(Date.now() + days * 24 * 3600_000)).slice(0, 10);

// ------------------------------------------------------------- 1. Dọn dữ liệu demo cũ
const old = db.prepare("SELECT id FROM projects WHERE id = ? OR name = ?").all(DEMO.project, DEMO.projectName) as { id: string }[];
for (const { id } of old) {
  for (const f of db.prepare("SELECT stored_name FROM files WHERE project_id = ?").all(id) as { stored_name: string }[]) removeFileFromDisk(f.stored_name);
  tx(() => {
    // prompt_runs, suggestion_events chỉ tham chiếu logic (không có khoá ngoại) nên xoá tay
    db.prepare("DELETE FROM prompt_runs WHERE module_id IN (SELECT id FROM modules WHERE project_id = ?)").run(id);
    db.prepare("DELETE FROM suggestion_events WHERE screen_id IN (SELECT s.id FROM screens s JOIN modules m ON m.id = s.module_id WHERE m.project_id = ?)").run(id);
    repo.deleteProject(id); // CASCADE: module, story, tài liệu, sơ đồ, màn, test, task, lịch sử task, git_pushes…
  });
}
if (old.length) console.log(`Đã xoá ${old.length} dự án demo cũ.`);

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
    "Dự án mẫu cho buổi demo: website bán hàng điện tử – quản lý sản phẩm và đơn hàng.",
    ago(14),
  );
  const mod = db.prepare("INSERT INTO modules (id, project_id, name, created_at) VALUES (?, ?, ?, ?)");
  mod.run(DEMO.products, DEMO.project, "Quản lý sản phẩm", ago(14));
  mod.run(DEMO.orders, DEMO.project, "Quản lý đơn hàng", ago(13));
});
console.log(`Thành viên: ${MEMBERS.map((m) => `${m.name}${m.role === "BA_LEAD" ? " (BA Lead)" : " (BA)"}`).join(", ")}`);

// ------------------------------------------------------------- 3. Bật app trong tiến trình, gọi API như giao diện
const server = createApp({ publicDir: join(root, "public") });
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function api<T = any>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.error ?? "lỗi"}`);
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
        asA: "quản trị viên",
        iWant: "tìm kiếm sản phẩm theo tên hoặc mã SKU",
        soThat: "kiểm tra tồn kho trước khi nhập hàng",
        ac: ["Tìm theo một phần tên, không phân biệt hoa thường", "Không có kết quả thì hiện thông báo 'Không tìm thấy sản phẩm'", "Kết quả phân trang 20 dòng/trang"],
        priority: "High",
      },
      {
        asA: "quản trị viên",
        iWant: "thêm sản phẩm mới với tên, mã SKU, danh mục, giá bán và tồn kho",
        soThat: "mở bán sản phẩm trên website",
        ac: ["Tên sản phẩm bắt buộc, tối đa 100 ký tự", "Mã SKU không được trùng", "Giá bán phải lớn hơn 0"],
        priority: "High",
      },
      {
        asA: "quản trị viên",
        iWant: "sửa giá bán và tồn kho của sản phẩm",
        soThat: "thông tin trên website luôn đúng",
        ac: ["Lưu thành công thì hiện thông báo và cập nhật danh sách", "Tồn kho không được âm"],
        priority: "Medium",
      },
      {
        asA: "quản trị viên",
        iWant: "lọc sản phẩm theo danh mục và trạng thái",
        soThat: "rà soát giá bán của từng nhóm hàng",
        ac: ["Lọc kết hợp được với ô tìm kiếm", "Có lựa chọn 'Tất cả danh mục'"],
        priority: "Medium",
      },
      {
        asA: "quản trị viên",
        iWant: "ngừng bán một sản phẩm",
        soThat: "khách không đặt được hàng đã hết mẫu",
        ac: ["Hỏi xác nhận trước khi ngừng bán", "Sản phẩm ngừng bán không hiện trên website"],
        priority: "Low",
      },
    ],
    [DEMO.orders]: [
      {
        asA: "nhân viên bán hàng",
        iWant: "xem danh sách đơn hàng theo trạng thái",
        soThat: "xử lý đơn mới trong ngày",
        ac: ["Mặc định lọc đơn 'Mới'", "Hiện mã đơn, khách hàng, tổng tiền, ngày đặt"],
        priority: "High",
      },
      {
        asA: "nhân viên bán hàng",
        iWant: "tạo đơn hàng tại quầy và in hoá đơn",
        soThat: "khách nhận hoá đơn ngay khi thanh toán",
        ac: ["Chọn sản phẩm còn tồn kho", "Tổng tiền tự tính theo số lượng"],
        priority: "High",
      },
      {
        asA: "nhân viên bán hàng",
        iWant: "huỷ đơn hàng chưa giao",
        soThat: "trả lại tồn kho khi khách đổi ý",
        ac: ["Bắt buộc nhập lý do huỷ", "Đơn đã giao thì không huỷ được"],
        priority: "Medium",
      },
      {
        asA: "kế toán",
        iWant: "xuất danh sách đơn hàng ra Excel theo tháng",
        soThat: "đối soát doanh thu cuối tháng",
        ac: ["Tệp có cột mã đơn, ngày, kênh bán, tổng tiền"],
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
  console.log(`User story: ${STORIES[DEMO.products].length} (Sản phẩm) + ${STORIES[DEMO.orders].length} (Đơn hàng)`);

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
    description: `Sinh và rà soát ${title.replace(/^Viết /, "")} của module Quản lý sản phẩm, bấm Xong để BA Lead duyệt.`,
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
    description: "Sinh bằng AI từ tài liệu đã Xong, chỉnh mã Mermaid nếu cần.",
    moduleId: P,
    assigneeId: who,
    due,
    priority: "Medium",
    artifactType: "diagram",
    artifactId: P,
    artifactSub: kind,
  });
  for (const t of [
    docTask("BRD", "Viết BRD", DUC, -4),
    docTask("UC_SPEC", "Viết UC Specification", DUC, -2),
    docTask("SRS", "Viết SRS", ANH, 1),
    docTask("FRD_NFR", "Viết FRD-NFR", ANH, 2),
    docTask("API_SPEC", "Viết API Spec", DUC, 4),
    diagramTask("CONTEXT", "Vẽ sơ đồ Context", ANH, -1),
    diagramTask("BPMN", "Vẽ sơ đồ BPMN quy trình nhập hàng", ANH, 3),
    diagramTask("ERD", "Vẽ ERD", DUC, 5),
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
    "Danh sách sản phẩm",
    "Quản lý sản phẩm: tìm kiếm theo tên hoặc SKU, lọc theo danh mục, trạng thái, bảng danh sách có cột Mã, Tên sản phẩm, Giá bán, Tồn kho, Trạng thái, thao tác xem/sửa/xoá, nút Thêm mới, phân trang.",
    DUC,
  );
  const scrAdd = await screen(
    "Thêm sản phẩm",
    "Form thêm sản phẩm: tên sản phẩm (bắt buộc, tối đa 100 ký tự), mã SKU, danh mục, giá bán, tồn kho, mô tả; nút Lưu và Huỷ.",
    DUC,
  );
  await screen("Quản lý danh mục", "Quản lý danh mục: tìm kiếm theo tên, bảng danh sách có cột Mã, Tên danh mục, Số sản phẩm, thao tác sửa/xoá, nút Thêm mới.", ANH);
  await api("POST", `/api/screens/${scrAdd}/annotations`, { comment: "Thêm ô chọn ảnh sản phẩm và gợi ý định dạng giá (VNĐ).", nodeIds: [], actorId: LAN });
  for (const t of [
    { key: "screen-list", title: "Thiết kế màn Danh sách sản phẩm", id: scrList, who: DUC, due: -3 },
    { key: "screen-add", title: "Thiết kế màn Thêm sản phẩm", id: scrAdd, who: DUC, due: 2 },
  ])
    await createTask({ key: t.key, title: t.title, description: "Prototype sinh từ SRS, FRD-NFR và user story.", moduleId: P, assigneeId: t.who, due: t.due, priority: "High", artifactType: "screen", artifactId: t.id });
  for (const k of ["screen-list", "screen-add"]) await api("PATCH", `/api/tasks/${taskIds[k]}/status`, { status: "doing", actorId: DUC });
  await done("screen", scrList, undefined, DUC);
  await approve("screen", scrList);
  await done("screen", scrAdd, undefined, DUC);
  // Quản lý danh mục: để Đang làm (chưa có task)

  // ----------------------------------------------------------- 9. Test case module 1 (cần FRD-NFR Xong)
  await createTask({ key: "tests", title: "Viết test case module Sản phẩm", description: "Sinh test case từ UC Specification + FRD-NFR.", moduleId: P, assigneeId: ANH, due: 3, priority: "Medium", artifactType: "tests", artifactId: P });
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
  await createTask({ key: "orders-brd", title: "Viết BRD module Đơn hàng", description: "Sinh BRD từ 4 user story của module Đơn hàng.", moduleId: DEMO.orders, assigneeId: ANH, due: 6, priority: "High", artifactType: "doc", artifactId: DEMO.orders, artifactSub: "BRD" });
  await createTask({ key: "orders-review", title: "Rà soát story Đơn hàng với phòng kinh doanh", description: "Đối chiếu tiêu chí chấp nhận với quy trình thực tế tại quầy.", moduleId: DEMO.orders, assigneeId: DUC, due: 2, priority: "Medium" });
  await createTask({ key: "orders-nfr", title: "Bổ sung yêu cầu phi chức năng cho đơn hàng", description: "Thời gian phản hồi danh sách đơn, giới hạn số đơn mỗi trang.", moduleId: DEMO.orders, assigneeId: DUC, due: 4, priority: "Low" });
  await api("PATCH", `/api/tasks/${taskIds["orders-review"]}/status`, { status: "doing", actorId: DUC });

  // ----------------------------------------------------------- 12. Tổng kết
  const docs = await api<any[]>("GET", `/api/modules/${P}/docs`);
  const diagrams = await api<any[]>("GET", `/api/modules/${P}/diagrams`);
  const screens = (await api<any>("GET", `/api/modules/${P}`)).screens as any[];
  const tasks = await api<any[]>("GET", `/api/projects/${DEMO.project}/tasks`);
  const ST: Record<string, string> = { none: "Chưa có", draft: "Đang làm", done: "Xong", approved: "Đã duyệt", outdated: "Bản cũ", todo: "Cần làm", doing: "Đang làm" };
  const flag = (x: { revisionRequested?: boolean }) => (x.revisionRequested ? " + Yêu cầu sửa" : "");
  console.log(`Tài liệu: ${docs.map((d) => `${d.kind} ${ST[d.status]}${flag(d)}`).join(" · ")}`);
  console.log(`Sơ đồ: ${diagrams.map((d) => `${d.kind} ${ST[d.status]}`).join(" · ")}`);
  console.log(`Prototype: ${screens.map((s) => `${s.name} ${ST[s.status]}`).join(" · ")}`);
  const count: Record<string, number> = { todo: 0, doing: 0, done: 0, approved: 0 };
  for (const t of tasks) count[t.status]++;
  console.log(
    `Công việc: ${tasks.length} task – Cần làm ${count.todo}, Đang làm ${count.doing}, Xong ${count.done}, Đã duyệt ${count.approved}; Yêu cầu sửa: ${tasks.filter((t) => t.revisionRequested).map((t) => t.title).join(", ") || "không có"}`,
  );
  const missing = (["todo", "doing", "done", "approved"] as const).filter((s) => !count[s]);
  if (missing.length || !tasks.some((t) => t.revisionRequested)) throw new Error(`Dữ liệu demo thiếu: cột ${missing.join(", ") || "–"} / task Yêu cầu sửa`);

  const port = process.env.PORT ?? 3000;
  console.log(`\nXong. Mở http://localhost:${port}/#/p/${DEMO.project}/tasks`);
  console.log(`  Tài liệu: http://localhost:${port}/#/p/${DEMO.project}/work/${P}/docs`);
} finally {
  server.close();
}
