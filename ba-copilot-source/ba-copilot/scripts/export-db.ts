// Xuất cơ sở dữ liệu ra thư mục database/ (không bị .gitignore) để nộp kèm mã nguồn:
//   ba-copilot.db   bản sao một tệp, chụp nhất quán bằng VACUUM INTO (không kèm -wal/-shm), mở bằng DB Browser for SQLite
//   ba-copilot.sql  cấu trúc + dữ liệu dạng lệnh SQL (đọc được bằng mắt; nạp lại: sqlite3 moi.db < ba-copilot.sql)
//   files/          tệp của Kho tài liệu (cột files.stored_name trỏ tới)
//   ERD.md + ảnh    sơ đồ quan hệ sinh từ chính bản DB vừa xuất (scripts/erd.ts)
//   README.md       cách mở, số dòng từng bảng
//
// Bản xuất đã xoá bí mật: token GitHub (project_git.token), mật khẩu thành viên (members.password_hash),
// khoá ký phiên (app_meta.session_secret). DB gốc trong data/ không bị đụng tới.
//
// Dùng: npm run export-db   (DB nguồn: DB_FILE hoặc data/ba-copilot.db; tệp: DATA_DIR/files). Chạy được cả khi server đang mở.
import { DatabaseSync } from "node:sqlite";
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readSchema, writeErd } from "./erd.ts";

const root = join(import.meta.dirname, "..");
const src = process.env.DB_FILE ?? join(root, "data", "ba-copilot.db");
const dataDir = process.env.DATA_DIR ?? dirname(src);
const outDir = join(root, "database");
const outDb = join(outDir, "ba-copilot.db");

if (!existsSync(src)) {
  console.error(`Không thấy DB ở ${src}. Chạy "npm run seed" (tạo dữ liệu mẫu) hoặc "npm start" trước.`);
  process.exit(1);
}

// 1. Dọn bản xuất cũ (chỉ các mục do lệnh này tạo)
mkdirSync(outDir, { recursive: true });
for (const f of ["ba-copilot.db", "ba-copilot.db-wal", "ba-copilot.db-shm", "ba-copilot.db-journal", "ba-copilot.sql", "files"])
  rmSync(join(outDir, f), { recursive: true, force: true });

// 2. Chụp DB thành một tệp. Checkpoint WAL trước cho gọn; VACUUM INTO tự đọc cả phần còn trong WAL nên vẫn đúng nếu checkpoint bận.
const source = new DatabaseSync(src);
try {
  source.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch {
  /* server đang ghi – bỏ qua */
}
source.exec(`VACUUM INTO '${outDb.replaceAll("'", "''")}'`);
source.close();

// 3. Xoá bí mật trên bản sao, rồi VACUUM để dữ liệu đã xoá không còn sót trong trang trống của tệp
const db = new DatabaseSync(outDb);
db.exec("PRAGMA journal_mode = DELETE");
const scrubbed: string[] = [];
const has = (t: string, c?: string) =>
  c ? (db.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).some((r) => r.name === c) : !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
if (has("project_git", "token")) scrubbed.push(`${db.prepare("UPDATE project_git SET token = '' WHERE token <> ''").run().changes} token GitHub`);
if (has("members", "password_hash")) scrubbed.push(`${db.prepare("UPDATE members SET password_hash = NULL WHERE password_hash IS NOT NULL").run().changes} mật khẩu thành viên`);
if (has("app_meta")) scrubbed.push(`${db.prepare("DELETE FROM app_meta WHERE key = 'session_secret'").run().changes} khoá ký phiên`);
db.exec("VACUUM");

// 4. Tệp SQL: cấu trúc + dữ liệu
const sqlValue = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString("hex")}'`;
  return `'${String(v).replaceAll("'", "''")}'`;
};
const objects = db
  .prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type = 'index', name")
  .all() as { type: string; name: string; sql: string }[];
const sql: string[] = [
  "-- BA Copilot – cấu trúc và dữ liệu cơ sở dữ liệu (SQLite)",
  `-- Xuất lúc ${new Date().toISOString()} bằng: npm run export-db`,
  "-- Nạp lại: sqlite3 ba-copilot-moi.db < ba-copilot.sql   (hoặc DB Browser for SQLite → File → Import → Database from SQL file)",
  "-- Đã xoá bí mật: token GitHub, mật khẩu thành viên, khoá ký phiên.",
  "PRAGMA foreign_keys = OFF;",
  "BEGIN TRANSACTION;",
];
for (const o of objects.filter((o) => o.type === "table")) {
  sql.push("", `-- Bảng ${o.name}`, `${o.sql};`);
  const cols = (db.prepare(`PRAGMA table_info("${o.name}")`).all() as { name: string }[]).map((c) => c.name);
  const head = `INSERT INTO "${o.name}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES `;
  for (const row of db.prepare(`SELECT * FROM "${o.name}"`).all() as Record<string, unknown>[])
    sql.push(`${head}(${cols.map((c) => sqlValue(row[c])).join(", ")});`);
}
sql.push("", "-- Chỉ mục");
for (const o of objects.filter((o) => o.type !== "table")) sql.push(`${o.sql};`);
sql.push("", "COMMIT;", "PRAGMA foreign_keys = ON;", "");
writeFileSync(join(outDir, "ba-copilot.sql"), sql.join("\n"));

// 5. Tệp của Kho tài liệu (+ thư mục uploads của bản cũ nếu còn)
for (const sub of ["files", "uploads"]) {
  rmSync(join(outDir, sub), { recursive: true, force: true });
  if (existsSync(join(dataDir, sub))) cpSync(join(dataDir, sub), join(outDir, sub), { recursive: true });
}
mkdirSync(join(outDir, "files"), { recursive: true });
const fileCount = has("files") ? (db.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number }).n : 0;

// 6. ERD + README
const tables = readSchema(db, true);
const erd = await writeErd(db, outDir, { title: "ERD – cơ sở dữ liệu BA Copilot (bản xuất)", source: "npm run export-db", withCounts: true });
db.close();

const kb = (f: string) => `${Math.max(1, Math.round(statSync(f).size / 1024))} KB`;
const totalRows = tables.reduce((s, t) => s + (t.rows ?? 0), 0);
writeFileSync(
  join(outDir, "README.md"),
  `# Cơ sở dữ liệu BA Copilot (bản xuất)

Xuất lúc ${new Date().toISOString()} bằng lệnh \`npm run export-db\`. Gồm ${tables.length} bảng, ${totalRows} dòng.

| Tệp | Nội dung |
|---|---|
| \`ba-copilot.db\` (${kb(outDb)}) | Toàn bộ dữ liệu dạng tệp SQLite, một tệp duy nhất |
| \`ba-copilot.sql\` (${kb(join(outDir, "ba-copilot.sql"))}) | Cùng dữ liệu đó dưới dạng lệnh SQL (cấu trúc bảng + \`INSERT\`), đọc được bằng trình soạn thảo |
| \`files/\` | Tệp trong Kho tài liệu. Bảng \`files\`, cột \`stored_name\` là tên tệp trong thư mục này |
| \`ERD.md\` | Sơ đồ quan hệ, danh sách bảng kèm số dòng, khoá ngoại${erd.images ? ". Ảnh: `ERD.png` (tổng quan), `ERD-day-du.png` (đầy đủ)" : ""} |

## Xem dữ liệu

1. Cài **DB Browser for SQLite** (miễn phí, https://sqlitebrowser.org/dl/).
2. *Open Database* → chọn \`ba-copilot.db\`.
3. Tab *Browse Data* để xem từng bảng; tab *Execute SQL* để chạy truy vấn, ví dụ:

\`\`\`sql
-- Số user story, tài liệu, sơ đồ của từng dự án
SELECT p.name,
  (SELECT COUNT(*) FROM user_stories s WHERE s.project_id = p.id) AS stories,
  (SELECT COUNT(*) FROM module_docs d JOIN modules m ON m.id = d.module_id WHERE m.project_id = p.id) AS docs,
  (SELECT COUNT(*) FROM module_diagrams g JOIN modules m ON m.id = g.module_id WHERE m.project_id = p.id) AS diagrams
FROM projects p;
\`\`\`

Không cài gì: mở \`ba-copilot.sql\` bằng trình soạn thảo bất kỳ.

## Chạy phần mềm trên đúng dữ liệu này

Chép \`ba-copilot.db\` vào \`data/ba-copilot.db\` và thư mục \`files/\` vào \`data/files/\`, rồi \`npm start\`.

## Bảo mật

Bản xuất đã xoá token GitHub, mật khẩu thành viên và khoá ký phiên đăng nhập. Dữ liệu gốc ở \`data/\` (không đưa lên Git) vẫn giữ nguyên.
`,
);

console.log(`Đã xuất DB vào ${relative(root, outDir)}/`);
console.log(`  ba-copilot.db (${kb(outDb)}), ba-copilot.sql, ERD.md${erd.images ? " + ảnh" : ""}, README.md – ${tables.length} bảng, ${totalRows} dòng`);
console.log(`  Kho tài liệu: ${fileCount} tệp (bảng files), chép vào database/files/`);
console.log(`  Đã xoá bí mật: ${scrubbed.join(", ") || "không có"}`);
