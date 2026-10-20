// Lưu trữ: SQLite tích hợp sẵn trong Node (node:sqlite) – không cần cài DB riêng.
// Cấu trúc bảng tương ứng data model trong kế hoạch; có thể chuyển sang PostgreSQL sau.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: DatabaseSync | null = null;

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

-- v2 (mục 5 tài liệu v2) – sơ đồ quan hệ: docs/erd.md
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'BA' CHECK(role IN ('BA','BA_LEAD')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uc_diagrams (
  module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE, code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','stale')),
  approved_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  assignee_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  due_date TEXT, priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High','Medium','Low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','redo')),
  artifact_type TEXT CHECK(artifact_type IN ('screen','docs','diagram','tests')), artifact_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
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
`;

/**
 * Cột thêm vào bảng đã có. DB cũ được nâng cấp bằng migrate(): thiếu cột nào thì ALTER TABLE ADD COLUMN cột đó.
 * Cột có REFERENCES phải mặc định NULL (giới hạn của SQLite khi bật foreign_keys).
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
];

/** Idempotent: gọi bao nhiêu lần cũng được. Trả về danh sách cột vừa thêm ("bảng.cột"). */
export function migrate(d: DatabaseSync = getDb()): string[] {
  const added: string[] = [];
  const cols = new Map<string, Set<string>>();
  for (const c of COLUMNS) {
    if (!cols.has(c.table)) cols.set(c.table, new Set((d.prepare(`PRAGMA table_info(${c.table})`).all() as { name: string }[]).map((r) => r.name)));
    const have = cols.get(c.table)!;
    if (have.has(c.column)) continue;
    d.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.ddl}`);
    have.add(c.column);
    added.push(`${c.table}.${c.column}`);
  }
  return added;
}

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error("Database chưa được mở");
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
