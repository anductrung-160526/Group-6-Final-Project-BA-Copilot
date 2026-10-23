// Lưu trữ: SQLite tích hợp sẵn trong Node (node:sqlite) – không cần cài DB riêng.
// Cấu trúc bảng tương ứng data model trong kế hoạch; có thể chuyển sang PostgreSQL sau.
// Sơ đồ quan hệ: docs/erd.md. Đợt 5 (C2): bảng sản phẩm mới, cột rev/updated_by/updated_at, migration dữ liệu cũ.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { splitStories } from "../../shared/qus.ts";
import { isReady, prereqBlockReason, type PrereqFacts, type PrereqTarget } from "../../shared/prereq.ts";
import { DOC_KINDS } from "../../shared/types.ts";
import type {
  ArtifactRef,
  ArtifactState,
  ArtifactStatus,
  DiagramKind,
  DocKind,
  Requirement,
  SequenceDiagram,
  SrsDoc,
  UseCase,
} from "../../shared/types.ts";

let db: DatabaseSync | null = null;

/** Bảng `tasks` (dùng chung cho SCHEMA và lần dựng lại bảng khi nâng cấp CHECK ở đợt 5). */
function tasksDdl(name: string): string {
  return `CREATE TABLE IF NOT EXISTS ${name} (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  assignee_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  due_date TEXT, priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High','Medium','Low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','approved','redo')),
  revision_requested INTEGER NOT NULL DEFAULT 0,
  artifact_type TEXT CHECK(artifact_type IN ('screen','doc','diagram','tests','docs')), artifact_id TEXT, artifact_sub TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, requirement_input TEXT NOT NULL DEFAULT '',
  docs_status TEXT NOT NULL DEFAULT 'none', tests_status TEXT NOT NULL DEFAULT 'none', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY, module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', current_version_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS screen_versions (
  id TEXT PRIMARY KEY, screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, kind TEXT NOT NULL, prompt TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT '',
  selected_ids TEXT NOT NULL DEFAULT '[]', changed_ids TEXT NOT NULL DEFAULT '[]', rejected TEXT NOT NULL DEFAULT '[]',
  tree TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY, screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL, node_ids TEXT NOT NULL, bbox TEXT, comment TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'BA', status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS use_cases (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, code)
);
CREATE TABLE IF NOT EXISTS requirements (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, code)
);
CREATE TABLE IF NOT EXISTS srs (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sequences (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, use_case_code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, use_case_code)
);
CREATE TABLE IF NOT EXISTS test_cases (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL, ord INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (module_id, code)
);
CREATE TABLE IF NOT EXISTS prompt_runs (
  id TEXT PRIMARY KEY, module_id TEXT, type TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  input TEXT NOT NULL, output TEXT NOT NULL, ok INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suggestion_events (
  id TEXT PRIMARY KEY, screen_id TEXT NOT NULL, version_id TEXT, suggestion_kind TEXT NOT NULL,
  target_node_id TEXT, title TEXT NOT NULL, confidence REAL NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('shown','applied','dismissed')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_learned_trees (
  version_id TEXT PRIMARY KEY, screen_id TEXT NOT NULL, tree TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sugg_screen ON suggestion_events(screen_id);
CREATE INDEX IF NOT EXISTS idx_modules_project ON modules(project_id);
CREATE INDEX IF NOT EXISTS idx_screens_module ON screens(module_id);
CREATE INDEX IF NOT EXISTS idx_versions_screen ON screen_versions(screen_id);
CREATE INDEX IF NOT EXISTS idx_ann_screen ON annotations(screen_id);
CREATE INDEX IF NOT EXISTS idx_runs_module ON prompt_runs(module_id);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_module ON files(module_id);

-- v2 (mục 5 tài liệu v2) – sơ đồ quan hệ: docs/erd.md  -- vi-keep: chú thích SQL
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'BA' CHECK(role IN ('BA','BA_LEAD')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uc_diagrams (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','stale')),
  approved_at TEXT, updated_at TEXT NOT NULL
);
${tasksDdl("tasks")}
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_artifact ON tasks(artifact_type, artifact_id);
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL,
  by_member_id TEXT REFERENCES members(id) ON DELETE SET NULL, by_system INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
CREATE TABLE IF NOT EXISTS suggestion_dismissals (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE, key TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (module_id, key)
);
-- Lần chạy AI "màn còn thiếu" gần nhất của module (UC-29): chỉ gọi Claude khi BA bấm, fingerprint để báo kết quả đã cũ  -- vi-keep: chú thích SQL
CREATE TABLE IF NOT EXISTS screen_suggestion_runs (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, items TEXT NOT NULL, fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL, created_at TEXT NOT NULL
);

-- Đợt 5 (C2) – docs/erd.md mục "Đợt 5"  -- vi-keep: chú thích SQL
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_stories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  as_a TEXT NOT NULL DEFAULT '', i_want TEXT NOT NULL DEFAULT '', so_that TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High','Medium','Low')),
  ord INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, code)
);
CREATE INDEX IF NOT EXISTS idx_stories_project ON user_stories(project_id, ord);
CREATE INDEX IF NOT EXISTS idx_stories_module ON user_stories(module_id);
CREATE TABLE IF NOT EXISTS module_docs (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('BRD','UC_SPEC','SRS','FRD_NFR','API_SPEC')),
  content TEXT NOT NULL DEFAULT '',
  data TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('none','draft','done','approved','outdated')),
  revision_requested INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (module_id, kind)
);
CREATE TABLE IF NOT EXISTS module_diagrams (
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('CONTEXT','UC','SEQUENCE','BPMN','ERD')),
  code TEXT NOT NULL DEFAULT '',
  parts TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('none','draft','done','approved','outdated')),
  revision_requested INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (module_id, kind)
);
CREATE TABLE IF NOT EXISTS project_git (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  repo TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT 'main',
  updated_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS git_pushes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  artifact_kind TEXT NOT NULL CHECK(artifact_kind IN ('screen','doc','diagram','tests')),
  artifact_id TEXT NOT NULL,
  artifact_sub TEXT,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_url TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  files TEXT NOT NULL DEFAULT '[]',
  by_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_git_pushes_project ON git_pushes(project_id, created_at);
`;

/**
 * Cột thêm vào bảng đã có. DB cũ được nâng cấp bằng migrate(): thiếu cột nào thì ALTER TABLE ADD COLUMN cột đó.
 * Cột có REFERENCES phải mặc định NULL (giới hạn của SQLite khi bật foreign_keys).
 * Bảng chưa tồn tại thì bỏ qua (SCHEMA tạo bảng mới đã có sẵn cột).
 */
export const COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: "modules", column: "qus_score", ddl: "qus_score INTEGER" },
  { table: "modules", column: "qus_checked_at", ddl: "qus_checked_at TEXT" },
  { table: "screen_versions", column: "author", ddl: "author TEXT NOT NULL DEFAULT ''" },
  { table: "screen_versions", column: "author_id", ddl: "author_id TEXT REFERENCES members(id) ON DELETE SET NULL" },
  { table: "annotations", column: "author_id", ddl: "author_id TEXT REFERENCES members(id) ON DELETE SET NULL" },
  { table: "files", column: "sender", ddl: "sender TEXT NOT NULL DEFAULT ''" },
  { table: "files", column: "received_at", ddl: "received_at TEXT" },
  { table: "files", column: "note", ddl: "note TEXT NOT NULL DEFAULT ''" },
  { table: "files", column: "uploaded_by", ddl: "uploaded_by TEXT REFERENCES members(id) ON DELETE SET NULL" },
  // Đợt 5 (C2)
  { table: "members", column: "password_hash", ddl: "password_hash TEXT" },
  { table: "screens", column: "rev", ddl: "rev INTEGER NOT NULL DEFAULT 1" },
  { table: "screens", column: "revision_requested", ddl: "revision_requested INTEGER NOT NULL DEFAULT 0" },
  { table: "screens", column: "updated_by", ddl: "updated_by TEXT REFERENCES members(id) ON DELETE SET NULL" },
  { table: "screens", column: "updated_at", ddl: "updated_at TEXT" },
  { table: "modules", column: "tests_rev", ddl: "tests_rev INTEGER NOT NULL DEFAULT 0" },
  { table: "modules", column: "tests_revision_requested", ddl: "tests_revision_requested INTEGER NOT NULL DEFAULT 0" },
  { table: "modules", column: "tests_updated_by", ddl: "tests_updated_by TEXT REFERENCES members(id) ON DELETE SET NULL" },
  { table: "modules", column: "tests_updated_at", ddl: "tests_updated_at TEXT" },
];

const tableExists = (d: DatabaseSync, table: string) => !!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
const nowIso = () => new Date().toISOString();

/**
 * Idempotent: gọi bao nhiêu lần cũng được. Trả về danh sách cột vừa thêm ("bảng.cột").
 * Sau khi thêm cột, chạy luôn nâng cấp bảng `tasks` và migration dữ liệu đợt 5 (`migrateData`) nếu đủ bảng.
 */
export function migrate(d: DatabaseSync = getDb()): string[] {
  const added: string[] = [];
  const cols = new Map<string, Set<string>>();
  for (const c of COLUMNS) {
    if (!cols.has(c.table)) cols.set(c.table, new Set((d.prepare(`PRAGMA table_info(${c.table})`).all() as { name: string }[]).map((r) => r.name)));
    const have = cols.get(c.table)!;
    if (!have.size) continue; // bảng chưa có
    if (have.has(c.column)) continue;
    d.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.ddl}`);
    have.add(c.column);
    added.push(`${c.table}.${c.column}`);
  }
  migrateData(d);
  return added;
}

/** Tạo bảng (CREATE IF NOT EXISTS) rồi migrate(). Dùng cho openDb() và cho test nâng cấp DB cũ không đụng DB toàn cục. */
export function initSchema(d: DatabaseSync): string[] {
  d.exec(SCHEMA);
  return migrate(d);
}

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  initSchema(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error("Database is not open");
  return db;
}

// Lồng được: tx() gọi bên trong tx() khác (vd handler sự kiện) chạy chung transaction ngoài cùng.
let depth = 0;
export function tx<T>(fn: () => T): T {
  const d = getDb();
  if (depth > 0) {
    depth++;
    try {
      return fn();
    } finally {
      depth--;
    }
  }
  d.exec("BEGIN");
  depth = 1;
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    depth = 0;
  }
}

// =============================================================== Đợt 5 – app_meta

export function getMeta(key: string, d: DatabaseSync = getDb()): string | null {
  const r = d.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setMeta(key: string, value: string, d: DatabaseSync = getDb()): void {
  d.prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
    key,
    value,
    nowIso(),
  );
}

// =============================================================== Đợt 5 – migration dữ liệu cũ
// Mỗi bước một lần cho mỗi DB (đánh dấu `migration:<tên>` trong app_meta), trừ bước đổi `redo` chạy mọi lần khởi động
// vì mã v2 (taskRules của A7) còn ghi `redo` cho tới khi C7 thay. KHÔNG xoá cột/bảng cũ (màn cũ còn đọc).

/** Danh sách bước vừa chạy (để test và log). */
export function migrateData(d: DatabaseSync): string[] {
  const done: string[] = [];
  if (tableExists(d, "tasks")) {
    if (upgradeTasksTable(d)) done.push("tasks.rebuild");
    const n = Number(d.prepare("UPDATE tasks SET status = 'doing', revision_requested = 1 WHERE status = 'redo'").run().changes);
    if (n) done.push(`tasks.redo→doing:${n}`);
  }
  if (!tableExists(d, "app_meta") || !tableExists(d, "modules")) return done;
  const once = (name: string, need: string[], fn: () => void) => {
    if (!need.every((t) => tableExists(d, t)) || getMeta(`migration:${name}`, d)) return;
    d.exec("BEGIN");
    try {
      fn();
      setMeta(`migration:${name}`, nowIso(), d);
      d.exec("COMMIT");
      done.push(name);
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  };
  once("d5.docs", ["module_docs", "use_cases", "requirements", "srs"], () => migrateLegacyDocs(d));
  once("d5.diagrams", ["module_diagrams", "sequences", "uc_diagrams"], () => migrateLegacyDiagrams(d));
  once("d5.stories", ["user_stories", "projects"], () => migrateRequirementInput(d));
  once("d6.prereq", ["module_docs", "module_diagrams", "tasks", "task_events"], () => normalizePrereqStates(d));
  return done;
}

/**
 * Đợt 6 (D2): dữ liệu cũ vi phạm luật bước tiên quyết (shared/prereq.ts) → Bản cũ.
 * Nguồn gốc: "d5.docs"/"d5.diagrams" chép nguyên `modules.docs_status` (vd Đã duyệt) sang UC Spec / SRS / FRD-NFR /
 * Sequence trong khi BRD (và Context, BPMN, ERD) chưa từng có – nên có UC Spec Đã duyệt khi BRD chưa Xong.
 * Sản phẩm Xong / Đã duyệt có bước tiên quyết chưa Xong → `outdated` (giữ nội dung, rev, cờ Yêu cầu sửa); task gắn kèm
 * đang Xong / Đã duyệt → Đang làm (ghi task_events của hệ thống). Luật user story của BRD không xét (không đoán dữ liệu).
 */
function normalizePrereqStates(d: DatabaseSync): void {
  const at = nowIso();
  const docStatus = (m: string, k: DocKind) =>
    ((d.prepare("SELECT status FROM module_docs WHERE module_id = ? AND kind = ?").get(m, k) as { status: ArtifactStatus } | undefined)?.status ?? "none");
  const reason = "Previous step is not Done – legacy data normalised, artifact set to Outdated";
  const syncTasks = (where: string, args: string[]) => {
    const rows = d.prepare(`SELECT id, status FROM tasks WHERE status IN ('done','approved') AND ${where}`).all(...args) as { id: string; status: string }[];
    for (const t of rows) {
      d.prepare("UPDATE tasks SET status = 'doing', updated_at = ? WHERE id = ?").run(at, t.id);
      d.prepare("INSERT INTO task_events (id, task_id, from_status, to_status, by_member_id, by_system, reason, created_at) VALUES (?, ?, ?, 'doing', NULL, 1, ?, ?)").run(randomUUID(), t.id, t.status, reason, at);
    }
  };
  const modules = d.prepare("SELECT id, docs_status FROM modules").all() as { id: string; docs_status: string }[];
  for (const m of modules) {
    const facts: PrereqFacts = { docStatus: (k) => docStatus(m.id, k), legacyDocsApproved: m.docs_status === "approved" };
    const bad = (t: PrereqTarget, st: string) => isReady(st) && !!prereqBlockReason(t, facts, "done");
    for (const k of DOC_KINDS) {
      if (!bad({ kind: "doc", sub: k }, docStatus(m.id, k))) continue;
      d.prepare("UPDATE module_docs SET status = 'outdated' WHERE module_id = ? AND kind = ?").run(m.id, k);
      syncTasks("artifact_type = 'doc' AND artifact_id = ? AND artifact_sub = ?", [m.id, k]);
    }
    for (const r of d.prepare("SELECT kind, status FROM module_diagrams WHERE module_id = ?").all(m.id) as { kind: DiagramKind; status: string }[]) {
      if (!bad({ kind: "diagram", sub: r.kind }, r.status)) continue;
      d.prepare("UPDATE module_diagrams SET status = 'outdated' WHERE module_id = ? AND kind = ?").run(m.id, r.kind);
      syncTasks("artifact_type = 'diagram' AND artifact_id = ? AND COALESCE(artifact_sub, 'UC') = ?", [m.id, r.kind]);
    }
    const tests = d.prepare("SELECT tests_status AS s FROM modules WHERE id = ?").get(m.id) as { s: string } | undefined;
    if (tests && bad({ kind: "tests" }, tests.s)) {
      d.prepare("UPDATE modules SET tests_status = 'outdated' WHERE id = ?").run(m.id);
      syncTasks("artifact_type = 'tests' AND artifact_id = ?", [m.id]);
    }
  }
}

/**
 * Bảng `tasks` của v2 có CHECK cũ (status thiếu 'approved', artifact_type thiếu 'doc') và thiếu cột
 * `revision_requested`, `artifact_sub`. SQLite không sửa được CHECK nên dựng lại bảng theo quy trình chuẩn
 * (tắt foreign_keys → tạo bảng mới → chép → xoá → đổi tên). Trả về true nếu đã dựng lại.
 */
function upgradeTasksTable(d: DatabaseSync): boolean {
  const sql = (d.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get() as { sql: string }).sql;
  if (sql.includes("'approved'") && sql.includes("artifact_sub")) return false;
  const fkOn = Number((d.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys) === 1;
  if (fkOn) d.exec("PRAGMA foreign_keys = OFF");
  try {
    const old = new Set((d.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map((r) => r.name));
    const col = (c: string, fallback: string) => (old.has(c) ? c : fallback);
    d.exec("BEGIN");
    try {
      d.exec("DROP TABLE IF EXISTS tasks__d5");
      d.exec(tasksDdl("tasks__d5"));
      d.exec(`INSERT INTO tasks__d5 (id, project_id, module_id, title, description, assignee_id, due_date, priority, status, revision_requested,
                artifact_type, artifact_id, artifact_sub, created_at, updated_at)
              SELECT id, project_id, module_id, title, ${col("description", "''")}, ${col("assignee_id", "NULL")}, ${col("due_date", "NULL")},
                ${col("priority", "'Medium'")},
                CASE status WHEN 'redo' THEN 'doing' ELSE status END,
                CASE status WHEN 'redo' THEN 1 ELSE ${col("revision_requested", "0")} END,
                ${col("artifact_type", "NULL")}, ${col("artifact_id", "NULL")}, ${col("artifact_sub", "NULL")}, created_at, updated_at
              FROM tasks`);
      d.exec("DROP TABLE tasks");
      d.exec("ALTER TABLE tasks__d5 RENAME TO tasks");
      d.exec("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)");
      d.exec("CREATE INDEX IF NOT EXISTS idx_tasks_artifact ON tasks(artifact_type, artifact_id)");
      const broken = d.prepare("PRAGMA foreign_key_check").all();
      if (broken.length && fkOn) throw new Error(`Upgrading the tasks table broke foreign keys (${broken.length} rows)`);
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw e;
    }
  } finally {
    if (fkOn) d.exec("PRAGMA foreign_keys = ON");
  }
  return true;
}

const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/** Trạng thái tài liệu cũ (modules.docs_status) → ArtifactStatus của dòng mới. */
const legacyStatus = (s: string | null | undefined): ArtifactStatus =>
  s === "approved" || s === "outdated" || s === "done" ? s : s === "stale" ? "outdated" : "draft";

function migrateLegacyDocs(d: DatabaseSync): void {
  const modules = d.prepare("SELECT id, docs_status FROM modules").all() as { id: string; docs_status: string }[];
  const ins = d.prepare("INSERT OR IGNORE INTO module_docs (module_id, kind, content, data, status, rev, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)");
  const at = nowIso();
  for (const m of modules) {
    const status = legacyStatus(m.docs_status);
    const ucs = (d.prepare("SELECT data FROM use_cases WHERE module_id = ? ORDER BY ord").all(m.id) as { data: string }[])
      .map((r) => parseJson<UseCase | null>(r.data, null))
      .filter((x): x is UseCase => !!x);
    if (ucs.length) ins.run(m.id, "UC_SPEC", ucMarkdown(ucs), JSON.stringify({ useCases: ucs }), status, at);
    const reqs = (d.prepare("SELECT data FROM requirements WHERE module_id = ? ORDER BY ord").all(m.id) as { data: string }[])
      .map((r) => parseJson<Requirement | null>(r.data, null))
      .filter((x): x is Requirement => !!x);
    if (reqs.length) ins.run(m.id, "FRD_NFR", reqMarkdown(reqs), JSON.stringify({ requirements: reqs }), status, at);
    const srsRow = d.prepare("SELECT data FROM srs WHERE module_id = ?").get(m.id) as { data: string } | undefined;
    const srs = parseJson<SrsDoc | null>(srsRow?.data, null);
    if (srs?.sections?.length) ins.run(m.id, "SRS", srsMarkdown(srs), JSON.stringify({ srs }), status, at);
  }
}

function migrateLegacyDiagrams(d: DatabaseSync): void {
  const ins = d.prepare("INSERT OR IGNORE INTO module_diagrams (module_id, kind, code, parts, status, rev, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)");
  const at = nowIso();
  const modules = d.prepare("SELECT id, docs_status FROM modules").all() as { id: string; docs_status: string }[];
  for (const m of modules) {
    const seqs = (d.prepare("SELECT data FROM sequences WHERE module_id = ? ORDER BY ord").all(m.id) as { data: string }[])
      .map((r) => parseJson<SequenceDiagram | null>(r.data, null))
      .filter((x): x is SequenceDiagram => !!x && typeof x.mermaid === "string");
    if (seqs.length) {
      const parts = seqs.map((s) => ({ key: s.useCaseCode, title: s.title ?? s.useCaseCode, code: s.mermaid }));
      ins.run(m.id, "SEQUENCE", "", JSON.stringify(parts), legacyStatus(m.docs_status), at);
    }
  }
  for (const u of d.prepare("SELECT module_id, code, status, updated_at FROM uc_diagrams").all() as Record<string, string>[]) {
    if (!u.code?.trim()) continue;
    ins.run(u.module_id, "UC", u.code, "[]", legacyStatus(u.status), u.updated_at || at);
  }
}

/** Tách "As a … I want … so that …" / "Là …, tôi muốn … để …"; giữ nguyên chữ hoa thường. Không khớp → null. */
export function parseStoryParts(text: string): { asA: string; iWant: string; soThat: string } | null {
  const s = text.normalize("NFC").trim();
  // vi-keep-start: tách story tiếng Việt cũ khi chuyển dữ liệu
  const role = s.match(/^(?:as\s+an?|với\s+tư\s+cách(?:\s+là)?|là(?:\s+một)?)\s+/iu);
  if (!role) return null;
  const rest = s.slice(role[0].length);
  const means = rest.match(/[,;\s]+(?:i\s+want|tôi\s+muốn)\s+/iu);
  if (!means || means.index === undefined) return null;
  const asA = rest.slice(0, means.index).trim();
  const after = rest.slice(means.index + means[0].length);
  const end = after.match(/[,;\s]+(?:so\s+that|để)\s+/iu);
  // vi-keep-end
  const clean = (x: string) => x.trim().replace(/[\s,;.]+$/u, "");
  const iWant = clean(end && end.index !== undefined ? after.slice(0, end.index) : after);
  const soThat = end && end.index !== undefined ? clean(after.slice(end.index + end[0].length)) : "";
  if (!asA || !iWant) return null;
  return { asA, iWant, soThat };
}

/** `modules.requirement_input` → các dòng `user_stories` (chỉ cho module chưa có story). Mã US-xx đánh tiếp theo dự án. */
function migrateRequirementInput(d: DatabaseSync): void {
  const modules = d.prepare("SELECT id, project_id, requirement_input FROM modules WHERE TRIM(requirement_input) <> '' ORDER BY created_at, rowid").all() as Record<string, string>[];
  const ins = d.prepare(
    `INSERT INTO user_stories (id, project_id, module_id, code, as_a, i_want, so_that, acceptance_criteria, priority, ord, rev, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'Medium', ?, 1, ?, ?)`,
  );
  const at = nowIso();
  for (const m of modules) {
    if (d.prepare("SELECT 1 FROM user_stories WHERE module_id = ?").get(m.id)) continue;
    let next = nextStoryNumber(d, m.project_id);
    let ord = Number((d.prepare("SELECT COALESCE(MAX(ord), 0) AS n FROM user_stories WHERE project_id = ?").get(m.project_id) as { n: number }).n);
    for (const raw of splitStories(m.requirement_input)) {
      const p = parseStoryParts(raw) ?? { asA: "", iWant: raw.trim(), soThat: "" };
      ins.run(randomUUID(), m.project_id, m.id, storyCode(next++), p.asA, p.iWant, p.soThat, ++ord, at, at);
    }
  }
}

/** Mã story: US-01 … US-99, US-100 … */
export const storyCode = (n: number) => `US-${String(n).padStart(2, "0")}`;

/** Số kế tiếp cho mã US-xx trong dự án (lớn nhất hiện có + 1). C4 dùng khi thêm story. */
export function nextStoryNumber(d: DatabaseSync, projectId: string): number {
  const codes = d.prepare("SELECT code FROM user_stories WHERE project_id = ?").all(projectId) as { code: string }[];
  return codes.reduce((max, r) => Math.max(max, Number(r.code.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1;
}

// ---------- Markdown dựng từ dữ liệu cũ (chỉ dùng khi chuyển dữ liệu; C5 có bộ dựng riêng)
const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const bullets = (title: string, items: string[] | undefined) => (items?.length ? [`**${title}:**`, ...items.map((x) => `- ${x}`), ""] : []);

function ucMarkdown(ucs: UseCase[]): string {
  const out: string[] = ["# UC Specification", ""];
  for (const uc of ucs) {
    out.push(`## ${uc.code} – ${uc.name}`, "");
    if (uc.actors?.length) out.push(`**Actor:** ${uc.actors.join(", ")}`, "");
    if (uc.description) out.push(`**Description:** ${uc.description}`, "");
    if (uc.trigger) out.push(`**Trigger:** ${uc.trigger}`, "");
    out.push(...bullets("Preconditions", uc.preconditions), ...bullets("Postconditions", uc.postconditions));
    if (uc.mainFlow?.length) out.push("**Main flow:**", ...uc.mainFlow.map((s, i) => `${s.no ?? i + 1}. ${s.actor ? `${s.actor}: ` : ""}${s.text}`), "");
    for (const f of [...(uc.altFlows ?? []), ...(uc.exceptions ?? [])]) {
      out.push(`**${f.code} – ${f.name}** (branches from step ${f.branchFrom}):`, ...(f.steps ?? []).map((s, i) => `${i + 1}. ${s}`), "");
    }
    out.push(...bullets("Business rules", uc.businessRules), ...bullets("Assumptions", uc.assumptions));
  }
  return out.join("\n").trim() + "\n";
}

function reqMarkdown(reqs: Requirement[]): string {
  const table = (type: "FR" | "NFR") => {
    const rows = reqs.filter((r) => r.type === type);
    if (!rows.length) return [];
    return [
      `## ${type === "FR" ? "Functional Requirements (FR)" : "Non-functional Requirements (NFR)"}`,
      "",
      "| ID | Statement | Priority | Use case |",
      "|---|---|---|---|",
      ...rows.map((r) => `| ${cell(r.code)} | ${cell(r.statement)}${r.isAssumption ? " _(assumption)_" : ""} | ${cell(r.priority)} | ${cell((r.useCaseCodes ?? []).join(", "))} |`),
      "",
    ];
  };
  return ["# FRD-NFR", "", ...table("FR"), ...table("NFR")].join("\n").trim() + "\n";
}

function srsMarkdown(srs: SrsDoc): string {
  return ["# SRS", "", ...srs.sections.flatMap((s) => [`## ${s.title}`, "", s.content ?? "", ""])].join("\n").trim() + "\n";
}

// =============================================================== Đợt 5 – trạng thái sản phẩm dùng chung
// Một chỗ ánh xạ ArtifactRef → bảng/cột, để C7 (duyệt), C8 (GitHub) và các màn đọc/ghi trạng thái giống nhau.

interface StateTarget {
  table: string;
  where: string;
  args: string[];
  status: string;
  rr: string | null;
  rev: string | null;
  by: string | null;
  at: string | null;
}

function stateTarget(ref: ArtifactRef): StateTarget {
  switch (ref.kind) {
    case "screen":
      return { table: "screens", where: "id = ?", args: [ref.id], status: "status", rr: "revision_requested", rev: "rev", by: "updated_by", at: "updated_at" };
    case "doc":
      if (!ref.sub) throw new Error("ArtifactRef doc requires sub (DocKind)");
      return { table: "module_docs", where: "module_id = ? AND kind = ?", args: [ref.id, ref.sub], status: "status", rr: "revision_requested", rev: "rev", by: "updated_by", at: "updated_at" };
    case "diagram":
      return { table: "module_diagrams", where: "module_id = ? AND kind = ?", args: [ref.id, ref.sub ?? "UC"], status: "status", rr: "revision_requested", rev: "rev", by: "updated_by", at: "updated_at" };
    case "tests":
      return { table: "modules", where: "id = ?", args: [ref.id], status: "tests_status", rr: "tests_revision_requested", rev: "tests_rev", by: "tests_updated_by", at: "tests_updated_at" };
    case "docs":
      return { table: "modules", where: "id = ?", args: [ref.id], status: "docs_status", rr: null, rev: null, by: null, at: null };
  }
}

/**
 * Trạng thái hiện tại của sản phẩm. Tài liệu/sơ đồ chưa có dòng → `{ status: "none", rev: 0 }`.
 * Màn/module không tồn tại → null.
 */
export function getArtifactState(ref: ArtifactRef, d: DatabaseSync = getDb()): ArtifactState | null {
  const t = stateTarget(ref);
  const sel = [`${t.status} AS status`, `${t.rr ?? 0} AS rr`, `${t.rev ?? 0} AS rev`, `${t.by ?? "NULL"} AS by_id`, `${t.at ?? "NULL"} AS at`].join(", ");
  const r = d.prepare(`SELECT ${sel} FROM ${t.table} WHERE ${t.where}`).get(...t.args) as Record<string, any> | undefined;
  const norm: ArtifactRef = ref.kind === "diagram" ? { ...ref, sub: ref.sub ?? "UC" } : ref;
  if (!r) {
    if (ref.kind !== "doc" && ref.kind !== "diagram") return null;
    if (!d.prepare("SELECT 1 FROM modules WHERE id = ?").get(ref.id)) return null;
    return { ref: norm, status: "none", revisionRequested: false, rev: 0, updatedBy: null, updatedAt: null };
  }
  return { ref: norm, status: r.status as ArtifactStatus, revisionRequested: !!r.rr, rev: Number(r.rev), updatedBy: r.by_id ?? null, updatedAt: r.at ?? null };
}

/**
 * Đổi trạng thái / cờ Yêu cầu sửa (không tăng rev). Ghi nội dung và Xong / Duyệt / Yêu cầu sửa (routes/approval.ts) gọi
 * thêm `bumpRev`; lan "Bản cũ" (BR-02, story đổi, cascadeOutdated) thì không.
 * Trả về trạng thái mới, null nếu sản phẩm chưa có (tài liệu/sơ đồ chưa sinh thì không Xong/Duyệt được).
 */
export function setArtifactState(
  ref: ArtifactRef,
  patch: { status?: ArtifactStatus; revisionRequested?: boolean },
  d: DatabaseSync = getDb(),
): ArtifactState | null {
  const t = stateTarget(ref);
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (patch.status !== undefined) (sets.push(`${t.status} = ?`), vals.push(patch.status));
  if (patch.revisionRequested !== undefined && t.rr) (sets.push(`${t.rr} = ?`), vals.push(patch.revisionRequested ? 1 : 0));
  if (sets.length) d.prepare(`UPDATE ${t.table} SET ${sets.join(", ")} WHERE ${t.where}`).run(...vals, ...t.args);
  const s = getArtifactState(ref, d);
  return s && s.rev === 0 && (ref.kind === "doc" || ref.kind === "diagram") ? null : s;
}

/** Tăng rev + ghi người/lúc sửa sau khi ghi nội dung sản phẩm. Trả về rev mới (0 nếu không có dòng). */
export function bumpRev(ref: ArtifactRef, by: string | null | undefined, d: DatabaseSync = getDb()): number {
  const t = stateTarget(ref);
  if (!t.rev || !t.by || !t.at) return 0;
  const byId = by && d.prepare("SELECT 1 FROM members WHERE id = ?").get(by) ? by : null;
  d.prepare(`UPDATE ${t.table} SET ${t.rev} = ${t.rev} + 1, ${t.by} = ?, ${t.at} = ? WHERE ${t.where}`).run(byId, nowIso(), ...t.args);
  return getArtifactState(ref, d)?.rev ?? 0;
}

export type { DocKind, DiagramKind };
