// ERD sinh tự động từ chính cấu trúc DB (sqlite_master + PRAGMA), nên không bao giờ lệch với server/db.ts.
//   - Bảng, cột, kiểu, PK, FK, UNIQUE, giá trị CHECK đọc từ DB
//   - Cạnh liền: khoá ngoại thật (nhãn = cột FK + ON DELETE); cạnh nét đứt: tham chiếu logic (LOGICAL_REFS)
//   - Bản số: cột FK NOT NULL → "||", cho phép NULL → "|o"; FK trùng PK/UNIQUE của bảng con → 1-1 ("o|"), còn lại 1-n ("o{")
//
// Hai sơ đồ: tổng quan (bảng nghiệp vụ, chỉ cột khoá/trạng thái) và đầy đủ (mọi bảng, mọi cột).
// Dùng: npm run erd   → database/ERD.md + ảnh ERD.* (tổng quan), ERD-day-du.* (đầy đủ); dựng từ schema trống, không cần DB thật
// npm run export-db gọi lại các hàm ở đây trên bản DB vừa xuất.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { initSchema } from "../server/db.ts";

/** Nhóm và mô tả nghiệp vụ của từng bảng (bảng chưa khai báo vẫn được vẽ, xếp vào nhóm "Khác"). */
const GROUPS: { name: string; tables: Record<string, string> }[] = [
  {
    name: "Dự án và thành viên",
    tables: {
      projects: "Dự án",
      modules: "Module (phân hệ) của dự án; giữ luôn trạng thái và phiên bản của bộ test case",
      members: "Thành viên, vai BA hoặc BA Lead",
      user_stories: "User story US-xx (As a / I want / So that, tiêu chí chấp nhận, ưu tiên)",
    },
  },
  {
    name: "Sản phẩm BA",
    tables: {
      module_docs: "Tài liệu của module: BRD, UC Specification, SRS, FRD-NFR, API Spec (Markdown)",
      module_diagrams: "Sơ đồ của module: Context, Use Case, Sequence, BPMN, ERD (Mermaid)",
      screens: "Màn hình prototype",
      screen_versions: "Từng phiên bản của màn (cây component JSON)",
      annotations: "Khoanh vùng và bình luận trên màn",
      test_cases: "Test case của module",
    },
  },
  {
    name: "Quản lý công việc",
    tables: {
      tasks: "Công việc trên bảng Kanban, có thể gắn với một sản phẩm",
      task_events: "Lịch sử chuyển cột của công việc",
    },
  },
  {
    name: "Kho tài liệu và GitHub",
    tables: {
      files: "Tệp trong Kho tài liệu (tệp thật nằm ở thư mục files/)",
      project_git: "Cài đặt GitHub của dự án (repo, nhánh, token)",
      git_pushes: "Lịch sử commit lên GitHub mỗi lần BA Lead Duyệt",
    },
  },
  {
    name: "AI và gợi ý",
    tables: {
      prompt_runs: "Nhật ký AI: mỗi lần gọi Claude hoặc Mock, kèm token và thời gian",
      suggestion_events: "Gợi ý thành phần giao diện đã hiện / áp dụng / bỏ qua",
      model_learned_trees: "Cây màn đã duyệt dùng để mô hình gợi ý học thêm",
      suggestion_dismissals: "Gợi ý bước tiếp theo mà BA đã tắt",
    },
  },
  {
    name: "Bảng thế hệ cũ (trước đợt 5)",
    tables: {
      use_cases: "Use case dạng JSON của luồng sinh cũ; từ đợt 5 tài liệu chính nằm ở module_docs",
      requirements: "Yêu cầu chức năng dạng JSON của luồng sinh cũ",
      srs: "SRS dạng JSON của luồng sinh cũ",
      sequences: "Sequence dạng JSON của luồng sinh cũ; từ đợt 5 nằm ở module_diagrams",
      uc_diagrams: "Sơ đồ Use Case của luồng cũ; từ đợt 5 nằm ở module_diagrams",
    },
  },
  {
    name: "Hệ thống",
    tables: { app_meta: "Cấu hình nội bộ: khoá ký phiên, đánh dấu các bước nâng cấp dữ liệu" },
  },
];

/** Tham chiếu chỉ có trong logic của app (không có khoá ngoại trong DB). */
const LOGICAL_REFS: { table: string; column: string; parent: string }[] = [
  { table: "screens", column: "current_version_id", parent: "screen_versions" },
  { table: "annotations", column: "version_id", parent: "screen_versions" },
  { table: "prompt_runs", column: "module_id", parent: "modules" },
  { table: "suggestion_events", column: "screen_id", parent: "screens" },
  { table: "model_learned_trees", column: "version_id", parent: "screen_versions" },
];

interface Column { name: string; type: string; notnull: boolean; pk: number }
interface ForeignKey { from: string; table: string; onDelete: string }
export interface TableInfo {
  name: string;
  columns: Column[];
  fks: ForeignKey[];
  uniques: string[][];
  checks: Map<string, string[]>;
  rows?: number;
}

export function readSchema(db: DatabaseSync, withCounts = false): TableInfo[] {
  const tables = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string; sql: string }[];
  return tables.map(({ name, sql }) => {
    const columns = (db.prepare(`PRAGMA table_info("${name}")`).all() as any[]).map((c) => ({
      name: c.name, type: c.type || "ANY", notnull: !!c.notnull, pk: c.pk,
    }));
    const fks = (db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as any[]).map((f) => ({
      from: f.from, table: f.table, onDelete: f.on_delete,
    }));
    const uniques = (db.prepare(`PRAGMA index_list("${name}")`).all() as any[])
      .filter((i) => i.unique && i.origin !== "pk")
      .map((i) => (db.prepare(`PRAGMA index_info("${i.name}")`).all() as any[]).map((c) => c.name as string));
    const checks = new Map<string, string[]>();
    for (const m of sql.matchAll(/CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/gi))
      checks.set(m[1], m[2].split(",").map((v) => v.trim().replace(/^'|'$/g, "")));
    const rows = withCounts ? Number((db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as any).n) : undefined;
    return { name, columns, fks, uniques, checks, rows };
  });
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Sơ đồ tổng quan bỏ các nhóm này và các cột ghi vết "ai sửa cuối" (vẫn có đủ trong sơ đồ đầy đủ). */
const OVERVIEW_SKIP_GROUPS = ["Bảng thế hệ cũ (trước đợt 5)", "Hệ thống"];
const AUDIT_COLUMNS = new Set(["updated_by", "tests_updated_by", "author_id", "uploaded_by", "by_member_id"]);

/** Bảng và cột cho sơ đồ tổng quan: bỏ bảng cũ/hệ thống, chỉ giữ cột khoá và cột có CHECK, bỏ cạnh ghi vết. */
export function overviewTables(tables: TableInfo[]): TableInfo[] {
  const skip = new Set(GROUPS.filter((g) => OVERVIEW_SKIP_GROUPS.includes(g.name)).flatMap((g) => Object.keys(g.tables)));
  return tables
    .filter((t) => !skip.has(t.name))
    .map((t) => {
      const fks = t.fks.filter((f) => !AUDIT_COLUMNS.has(f.from));
      const keep = new Set([...fks.map((f) => f.from), ...LOGICAL_REFS.filter((r) => r.table === t.name).map((r) => r.column), ...t.checks.keys()]);
      return { ...t, fks, columns: t.columns.filter((c) => c.pk || keep.has(c.name) || c.name === "name" || c.name === "code") };
    });
}

export function schemaMermaid(tables: TableInfo[]): string {
  const out = ["erDiagram"];
  const known = new Set(tables.map((t) => t.name));
  const hasCol = (t: string, c: string) => tables.find((x) => x.name === t)?.columns.some((x) => x.name === c);
  for (const t of tables) {
    const pkCols = t.columns.filter((c) => c.pk).map((c) => c.name);
    for (const fk of t.fks) {
      if (!known.has(fk.table)) continue;
      const col = t.columns.find((c) => c.name === fk.from);
      const parent = col?.notnull ? "||" : "|o";
      const oneToOne = sameSet([fk.from], pkCols) || t.uniques.some((u) => sameSet([fk.from], u));
      out.push(`  ${fk.table} ${parent}--${oneToOne ? "o|" : "o{"} ${t.name} : "${fk.from} (${fk.onDelete})"`);
    }
  }
  for (const r of LOGICAL_REFS)
    if (known.has(r.parent) && hasCol(r.table, r.column)) out.push(`  ${r.parent} |o..o{ ${r.table} : "${r.column} (logic)"`);
  for (const t of tables) {
    out.push(`  ${t.name} {`);
    const fkCols = new Set(t.fks.map((f) => f.from).concat(LOGICAL_REFS.filter((r) => r.table === t.name).map((r) => r.column)));
    const uqCols = new Set(t.uniques.flat());
    for (const c of t.columns) {
      const keys = [c.pk ? "PK" : "", fkCols.has(c.name) ? "FK" : "", !c.pk && uqCols.has(c.name) ? "UK" : ""].filter(Boolean);
      const check = t.checks.get(c.name);
      const note = check ? ` "${check.join(" | ")}"` : "";
      out.push(`    ${c.type.replace(/\W+/g, "_")} ${c.name}${keys.length ? " " + keys.join(", ") : ""}${note}`);
    }
    out.push("  }");
  }
  return out.join("\n");
}

export function erdMarkdown(tables: TableInfo[], diagrams: { overview: string; full: string }, opts: { title: string; images: boolean; source: string }): string {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const used = new Set<string>();
  const groupRows: string[] = [];
  const showRows = tables.some((t) => t.rows !== undefined);
  for (const g of [...GROUPS, { name: "Khác", tables: {} as Record<string, string> }]) {
    const names = g.name === "Khác" ? tables.map((t) => t.name).filter((n) => !used.has(n)) : Object.keys(g.tables).filter((n) => byName.has(n));
    for (const n of names) {
      used.add(n);
      const t = byName.get(n)!;
      groupRows.push(`| ${g.name} | \`${n}\` | ${g.tables[n] ?? ""} | ${t.columns.length} |${showRows ? ` ${t.rows} |` : ""}`);
    }
  }
  const fkRows = tables.flatMap((t) => t.fks.map((f) => `| \`${t.name}.${f.from}\` | \`${f.table}\` | ${f.onDelete} |`));
  const logicRows = LOGICAL_REFS.map((r) => `| \`${r.table}.${r.column}\` | \`${r.parent}\` |`);
  return `# ${opts.title}

Sinh tự động bởi \`${opts.source}\` từ cấu trúc thật của cơ sở dữ liệu SQLite, nên luôn khớp với \`server/db.ts\`. Không sửa tay tệp này: chạy lại lệnh để cập nhật.

${opts.images ? "Ảnh: [ERD.png](ERD.png) (tổng quan) · [ERD-day-du.png](ERD-day-du.png) (đầy đủ). Bản `.svg` cùng tên phóng to không vỡ nét.\n\n" : ""}Cách đọc:
- **Cạnh liền**: khoá ngoại thật trong DB. Nhãn là cột khoá ngoại và hành vi khi xoá bản ghi cha (\`CASCADE\` = xoá theo, \`SET NULL\` = bỏ trống).
- **Cạnh nét đứt**: tham chiếu chỉ có trong logic của phần mềm, DB không ràng buộc.
- \`||\` đúng một, \`|o\` không hoặc một, \`o{\` không hoặc nhiều. Chữ cạnh cột là các giá trị cho phép (ràng buộc CHECK).

## 1. Sơ đồ tổng quan

Chỉ các bảng nghiệp vụ, cột khoá và cột trạng thái. Bỏ bảng thế hệ cũ, bảng hệ thống và các cột ghi vết người sửa cuối (\`updated_by\`, \`author_id\`, \`uploaded_by\`, \`by_member_id\`, đều trỏ tới \`members\`, \`SET NULL\`).

\`\`\`mermaid
${diagrams.overview}
\`\`\`

## 2. Sơ đồ đầy đủ

Mọi bảng, mọi cột, mọi khoá ngoại.

\`\`\`mermaid
${diagrams.full}
\`\`\`

## 3. Danh sách bảng

| Nhóm | Bảng | Ý nghĩa | Số cột |${showRows ? " Số dòng |" : ""}
|---|---|---|---|${showRows ? "---|" : ""}
${groupRows.join("\n")}

## 4. Khoá ngoại

| Bảng con.cột | Bảng cha | Khi xoá bản ghi cha |
|---|---|---|
${fkRows.join("\n")}

## 5. Tham chiếu logic (không có khoá ngoại)

| Cột | Trỏ tới |
|---|---|
${logicRows.join("\n")}
| \`tasks.artifact_type\` + \`tasks.artifact_id\` | \`screens.id\` khi loại là \`screen\`; \`modules.id\` khi là \`doc\`, \`diagram\`, \`tests\` |
| \`git_pushes.artifact_kind\` + \`git_pushes.artifact_id\` | như trên |

Các cột tên \`data\`, \`tree\`, \`parts\`, \`files\`, \`*_ids\`, \`acceptance_criteria\` chứa JSON. Cột thời gian lưu dạng chuỗi ISO 8601 (giờ UTC).
`;
}

/** Vẽ Mermaid thành SVG + PNG bằng Chromium của Playwright. Không có trình duyệt thì bỏ qua (trả false). */
export async function renderMermaid(code: string, outBase: string): Promise<boolean> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return false;
  }
  const require = createRequire(import.meta.url);
  const mermaidJs = join(dirname(require.resolve("mermaid/package.json")), "dist", "mermaid.min.js");
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }).catch(() => null));
  if (!browser) return false;
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1.5 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div id="out"></div></body></html>`);
    await page.addScriptTag({ path: mermaidJs });
    const svg = await page.evaluate(async (src) => {
      const m = (window as any).mermaid;
      m.initialize({ startOnLoad: false, theme: "default", htmlLabels: false, er: { useMaxWidth: false }, maxTextSize: 500000 });
      const { svg } = await m.render("erd", src);
      document.getElementById("out")!.innerHTML = svg;
      return svg as string;
    }, code);
    writeFileSync(`${outBase}.svg`, svg);
    await page.locator("#out svg").screenshot({ path: `${outBase}.png` });
    return true;
  } finally {
    await browser.close();
  }
}

/** Ghi ERD.md (+ ảnh ERD.svg/png tổng quan, ERD-day-du.svg/png đầy đủ nếu vẽ được) vào outDir. */
export async function writeErd(db: DatabaseSync, outDir: string, opts: { title: string; source: string; withCounts?: boolean }) {
  mkdirSync(outDir, { recursive: true });
  const tables = readSchema(db, opts.withCounts);
  const diagrams = { overview: schemaMermaid(overviewTables(tables)), full: schemaMermaid(tables) };
  let images = false;
  try {
    images = (await renderMermaid(diagrams.overview, join(outDir, "ERD"))) && (await renderMermaid(diagrams.full, join(outDir, "ERD-day-du")));
  } catch (e) {
    console.warn(`  (Không vẽ được ảnh ERD: ${(e as Error).message.split("\n")[0]})`);
  }
  writeFileSync(join(outDir, "ERD.md"), erdMarkdown(tables, diagrams, { ...opts, images }));
  return { tables: tables.length, images };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(import.meta.dirname, "..");
  const outDir = join(root, "database");
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  const r = await writeErd(db, outDir, { title: "ERD – cơ sở dữ liệu BA Copilot", source: "npm run erd" });
  console.log(`Đã vẽ ERD (${r.tables} bảng): database/ERD.md${r.images ? " + ảnh ERD.png, ERD-day-du.png (kèm .svg)" :" (không có ảnh – thiếu trình duyệt Playwright)"}`);
}
