// Dữ liệu mẫu tuân thủ luật bước tiên quyết (D2 đợt 6): chạy scripts/seed.ts trên DB tạm rồi khẳng định mọi sản phẩm
// Xong / Đã duyệt đều có bước tiên quyết Xong / Đã duyệt (shared/prereq.ts – cùng luật với nút Sinh và nút Xong).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isReady, prereqBlockReason, type PrereqFacts, type PrereqTarget } from "../shared/prereq.ts";
import { DIAGRAM_KINDS, DOC_KINDS, type ArtifactStatus, type DocKind } from "../shared/types.ts";

const root = join(import.meta.dirname, "..");
let dir = "";
let d: DatabaseSync;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "ba-seed-"));
  const file = join(dir, "seed.db");
  const env = { ...process.env, DB_FILE: file, AI_MODE: "mock", SEED_AI: "", PORT: "0" };
  delete (env as Record<string, string | undefined>).ANTHROPIC_API_KEY;
  delete (env as Record<string, string | undefined>).ANTHROPIC_AUTH_TOKEN;
  const r = spawnSync(process.execPath, ["--import", "tsx", join(root, "scripts", "seed.ts")], { cwd: root, env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `seed lỗi:\n${r.stdout}\n${r.stderr}`);
  d = new DatabaseSync(file);
});
after(() => {
  d?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const docStatus = (m: string, k: DocKind) => ((d.prepare("SELECT status FROM module_docs WHERE module_id = ? AND kind = ?").get(m, k) as { status: ArtifactStatus } | undefined)?.status ?? "none");

function factsOf(m: string): PrereqFacts {
  const legacy = d.prepare("SELECT docs_status FROM modules WHERE id = ?").get(m) as { docs_status: string };
  return {
    docStatus: (k) => docStatus(m, k),
    storyCount: Number((d.prepare("SELECT COUNT(*) AS n FROM user_stories WHERE module_id = ?").get(m) as { n: number }).n),
    legacyDocsApproved: legacy.docs_status === "approved",
  };
}

test("seed: mọi sản phẩm Xong / Đã duyệt đều có bước tiên quyết Xong / Đã duyệt", () => {
  const modules = d.prepare("SELECT id, name, tests_status FROM modules WHERE project_id = 'demo-shop'").all() as { id: string; name: string; tests_status: ArtifactStatus }[];
  assert.ok(modules.length >= 2);
  const violations: string[] = [];
  let checked = 0;
  for (const m of modules) {
    const f = factsOf(m.id);
    const check = (t: PrereqTarget, st: string, what: string) => {
      if (!isReady(st)) return;
      checked++;
      const why = prereqBlockReason(t, f, "done");
      if (why) violations.push(`${m.name} – ${what} (${st}): ${why}`);
    };
    for (const k of DOC_KINDS) check({ kind: "doc", sub: k }, docStatus(m.id, k), `tài liệu ${k}`);
    for (const r of d.prepare("SELECT kind, status FROM module_diagrams WHERE module_id = ?").all(m.id) as { kind: string; status: string }[])
      check({ kind: "diagram", sub: r.kind as PrereqTarget["sub"] }, r.status, `sơ đồ ${r.kind}`);
    check({ kind: "tests" }, m.tests_status, "bộ test case");
  }
  assert.deepEqual(violations, []);
  assert.ok(checked >= 8, `seed phải có đủ sản phẩm Xong / Đã duyệt để demo (hiện ${checked})`);
});

test("seed: module mẫu có tài liệu từ UC Spec trở đi thì BRD Xong / Đã duyệt; đủ bộ sơ đồ (có Context khi đã có BPMN)", () => {
  const m = "demo-mod-products";
  assert.ok(isReady(docStatus(m, "BRD")), `BRD: ${docStatus(m, "BRD")}`);
  for (const k of DOC_KINDS) assert.notEqual(docStatus(m, k), "none", `tài liệu ${k} phải có`);
  const kinds = (d.prepare("SELECT kind FROM module_diagrams WHERE module_id = ?").all(m) as { kind: string }[]).map((r) => r.kind).sort();
  assert.deepEqual(kinds, [...DIAGRAM_KINDS].sort(), "đủ 5 sơ đồ");
  // Task gắn sản phẩm khớp trạng thái sản phẩm: task Xong / Đã duyệt thì sản phẩm cũng Xong / Đã duyệt
  const tasks = d.prepare("SELECT title, status, artifact_type AS t, artifact_id AS id, artifact_sub AS sub FROM tasks WHERE artifact_type IN ('doc','diagram','tests') AND status IN ('done','approved')").all() as {
    title: string;
    status: string;
    t: string;
    id: string;
    sub: string | null;
  }[];
  for (const t of tasks) {
    const st =
      t.t === "doc"
        ? docStatus(t.id, t.sub as DocKind)
        : t.t === "diagram"
          ? (d.prepare("SELECT status FROM module_diagrams WHERE module_id = ? AND kind = ?").get(t.id, t.sub ?? "UC") as { status: string }).status
          : (d.prepare("SELECT tests_status AS s FROM modules WHERE id = ?").get(t.id) as { s: string }).s;
    assert.equal(st, t.status, `task "${t.title}"`);
  }
});
