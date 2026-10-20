// Dựng danh sách tệp đẩy lên GitHub cho MỘT sản phẩm được duyệt (kế hoạch đợt 5, mục 3 "C8", quyết định 16).
// Chủ sở hữu: C8. Đọc thẳng các bảng bằng getDb() (không import tệp của agent khác đang làm song song).
//
// Bố cục repo:
//   <module>/docs/01-BRD.md … 05-API-Spec.md
//   <module>/diagrams/<kind>.md            (khối ```mermaid; SEQUENCE gộp mọi phần)
//   <module>/prototype/<màn>.html, index.html (liệt kê các màn đã duyệt)
//   <module>/tests/test-cases.md

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDb } from "./db.ts";
import { Renderer } from "../client/components/Renderer.tsx";
import type { UINode } from "../shared/design.ts";
import {
  DIAGRAM_KIND_LABEL,
  DOC_KINDS,
  DOC_KIND_LABEL,
  type ArtifactRef,
  type DiagramKind,
  type DiagramPart,
  type DocKind,
  type TestCase,
} from "../shared/types.ts";

export interface ExportFile {
  /** Đường dẫn trong repo, dùng "/" (vd "dang-nhap/docs/01-BRD.md"). */
  path: string;
  content: string;
}

export interface ExportResult {
  projectId: string;
  moduleId: string;
  moduleName: string;
  moduleDir: string;
  /** Tên sản phẩm hiển thị trong commit, vd "Màn Đăng nhập", "Tài liệu BRD", "Sơ đồ ERD", "Test case". */
  label: string;
  files: ExportFile[];
}

// ---------------------------------------------------------------- tên thư mục / tệp

/** Slug không dấu, an toàn cho đường dẫn: chữ thường a-z0-9 nối bằng "-". Rỗng → `fallback`. */
export function slugify(text: string, fallback = "muc"): string {
  const s = (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || fallback;
}

/** Tên tệp tài liệu theo thứ tự bước: 01-BRD.md … 05-API-Spec.md. */
export const DOC_FILE: Record<DocKind, string> = {
  BRD: "01-BRD.md",
  UC_SPEC: "02-UC-Specification.md",
  SRS: "03-SRS.md",
  FRD_NFR: "04-FRD-NFR.md",
  API_SPEC: "05-API-Spec.md",
};

/** Tên tệp sơ đồ: <kind>.md (chữ thường). */
export const diagramFile = (kind: DiagramKind) => `${kind.toLowerCase()}.md`;

interface ModuleRow {
  id: string;
  project_id: string;
  name: string;
}

function moduleRow(moduleId: string): ModuleRow {
  const m = getDb().prepare("SELECT id, project_id, name FROM modules WHERE id = ?").get(moduleId) as ModuleRow | undefined;
  if (!m) throw new Error("Không tìm thấy module của sản phẩm");
  return m;
}

/** Thư mục module trong repo. Trùng slug với module khác cùng dự án → thêm đuôi mã module cho khỏi đè nhau. */
export function moduleDir(moduleId: string): string {
  const m = moduleRow(moduleId);
  const slug = slugify(m.name, "module");
  const others = getDb().prepare("SELECT id, name FROM modules WHERE project_id = ? AND id <> ?").all(m.project_id, m.id) as { id: string; name: string }[];
  return others.some((o) => slugify(o.name, "module") === slug) ? `${slug}-${slugify(m.id).slice(0, 8)}` : slug;
}

interface ScreenRow {
  id: string;
  name: string;
  status: string;
  tree: string | null;
}

function moduleScreens(moduleId: string): ScreenRow[] {
  return getDb()
    .prepare(
      `SELECT s.id, s.name, s.status, v.tree AS tree FROM screens s LEFT JOIN screen_versions v ON v.id = s.current_version_id
       WHERE s.module_id = ? ORDER BY s.created_at, s.id`,
    )
    .all(moduleId) as unknown as ScreenRow[];
}

/** Tên tệp HTML của từng màn trong module (slug tên màn; trùng thì thêm đuôi mã màn). */
export function screenFiles(screens: { id: string; name: string }[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const s of screens) count.set(slugify(s.name, "man"), (count.get(slugify(s.name, "man")) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const s of screens) {
    const slug = slugify(s.name, "man");
    const name = slug === "index" || (count.get(slug) ?? 0) > 1 ? `${slug}-${slugify(s.id).slice(0, 8)}` : slug;
    out.set(s.id, `${name}.html`);
  }
  return out;
}

// ---------------------------------------------------------------- HTML prototype
// TẠM THỜI (C8): dựng HTML tĩnh bằng Renderer của app qua react-dom/server + CSS khối .ds-* trong client/styles.css.
// C0 thay bằng shared/exportHtml.ts của C9 khi gộp (cùng hàm "cây giao diện → HTML tự chứa").

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FALLBACK_CSS = `body{margin:0;font-family:Inter,system-ui,sans-serif;color:#1f2937;background:#fff}
.ds-page{padding:24px;display:flex;flex-direction:column;gap:16px;font-size:14px}
.ds-card,.ds-section{border:1px solid #e5e7eb;border-radius:8px;padding:12px}
.ds-row{display:flex;gap:12px;flex-wrap:wrap}`;

/** Lấy các khối CSS có ".ds-" (kể cả trong @media) + :root từ một tệp CSS. */
export function extractDsCss(css: string): string {
  const out: string[] = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (head.startsWith("@media") || head.startsWith("@supports")) {
      const inner = extractDsCss(body);
      if (inner) out.push(`${head}{${inner}}`);
    } else if (!head.startsWith("@") && (head.includes(".ds-") || head === ":root")) {
      out.push(`${head}{${body.trim()}}`);
    }
    i = j;
  }
  return out.join("\n");
}

let cssCache: string | null = null;
function prototypeCss(): string {
  if (cssCache !== null) return cssCache;
  const here = (() => {
    try {
      return dirname(fileURLToPath(import.meta.url));
    } catch {
      return process.cwd();
    }
  })();
  for (const p of [join(here, "..", "client", "styles.css"), join(process.cwd(), "client", "styles.css"), join(process.cwd(), "public", "app-style.css")]) {
    try {
      const css = extractDsCss(readFileSync(p, "utf8"));
      if (css.includes(".ds-")) return (cssCache = `body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}\n${css}`);
    } catch {
      // thử đường dẫn kế tiếp
    }
  }
  return (cssCache = FALLBACK_CSS);
}

/** HTML tĩnh tự chứa của một màn (tạm – xem ghi chú ở trên). */
export function screenHtml(name: string, tree: UINode | null, moduleName: string): string {
  let body = `<p style="padding:24px">Màn chưa có bản thiết kế.</p>`;
  if (tree) {
    try {
      body = renderToStaticMarkup(createElement(Renderer, { node: tree }));
    } catch {
      body = `<p style="padding:24px">Không dựng được giao diện của màn này.</p>`;
    }
  }
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} – ${esc(moduleName)}</title>
<style>
${prototypeCss()}
</style></head>
<body>${body}</body></html>
`;
}

function prototypeIndex(moduleName: string, items: { name: string; file: string }[]): string {
  const list = items.length ? items.map((s) => `<li><a href="${esc(s.file)}">${esc(s.name)}</a></li>`).join("\n") : "<li>Chưa có màn nào được duyệt.</li>";
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prototype – ${esc(moduleName)}</title>
<style>body{margin:0;padding:32px;font-family:Inter,system-ui,sans-serif;color:#1c2a30;background:#fff}h1{font-size:24px}li{margin:6px 0}a{color:#0f5a6e}</style>
</head><body>
<h1>Prototype – ${esc(moduleName)}</h1>
<p>Các màn đã được BA Lead duyệt:</p>
<ul>
${list}
</ul>
</body></html>
`;
}

// ---------------------------------------------------------------- Markdown

const fence = (code: string) => "```mermaid\n" + code.trim() + "\n```";
const cell = (s: unknown) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function diagramMarkdown(kind: DiagramKind, moduleName: string, code: string, parts: DiagramPart[]): string {
  const head = `# Sơ đồ ${DIAGRAM_KIND_LABEL[kind]} – ${moduleName}\n`;
  const blocks: string[] = [];
  if (kind === "SEQUENCE" && parts.length) {
    for (const p of parts) blocks.push(`## ${[p.key, p.title].filter(Boolean).join(" – ")}\n\n${fence(p.code)}`);
  } else if (code.trim()) {
    blocks.push(fence(code));
  } else {
    for (const p of parts) blocks.push(`## ${[p.key, p.title].filter(Boolean).join(" – ")}\n\n${fence(p.code)}`);
  }
  return `${head}\n${blocks.length ? blocks.join("\n\n") : "_(Chưa có sơ đồ)_"}\n`;
}

export function testsMarkdown(moduleName: string, cases: TestCase[]): string {
  const lines = [`# Test case – ${moduleName}`, ""];
  if (!cases.length) return lines.concat("_(Chưa có test case)_", "").join("\n");
  lines.push(`Tổng: ${cases.length} test case.`, "", "| Mã | Tên | Loại | Ưu tiên | Use case | Yêu cầu |", "|---|---|---|---|---|---|");
  for (const c of cases) lines.push(`| ${cell(c.code)} | ${cell(c.title)} | ${cell(c.type)} | ${cell(c.priority)} | ${cell(c.useCaseCode)} | ${cell((c.requirementCodes ?? []).join(", "))} |`);
  for (const c of cases) {
    lines.push("", `## ${c.code} – ${c.title}`, "");
    lines.push(`- **Loại:** ${c.type} · **Ưu tiên:** ${c.priority} · **Use case:** ${c.useCaseCode || "—"}${c.flowRef ? ` (${c.flowRef})` : ""}`);
    if (c.requirementCodes?.length) lines.push(`- **Yêu cầu:** ${c.requirementCodes.join(", ")}`);
    if (c.preconditions) lines.push(`- **Điều kiện trước:** ${c.preconditions}`);
    if (c.testData) lines.push(`- **Dữ liệu test:** ${c.testData}`);
    if (c.steps?.length) lines.push("", "**Các bước:**", "", ...c.steps.map((s, i) => `${i + 1}. ${s}`));
    if (c.expected) lines.push("", `**Kết quả mong đợi:** ${c.expected}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- dựng tệp cho một sản phẩm

/** Module của sản phẩm (screen: tra bảng screens; loại khác: id = moduleId). */
export function refModuleId(ref: ArtifactRef): string {
  if (ref.kind !== "screen") return ref.id;
  if (ref.moduleId) return ref.moduleId;
  const r = getDb().prepare("SELECT module_id FROM screens WHERE id = ?").get(ref.id) as { module_id: string } | undefined;
  if (!r) throw new Error("Không tìm thấy màn hình");
  return r.module_id;
}

/** Tên sản phẩm hiển thị (commit message, nhật ký). */
export function artifactLabel(ref: ArtifactRef): string {
  switch (ref.kind) {
    case "screen": {
      const r = getDb().prepare("SELECT name FROM screens WHERE id = ?").get(ref.id) as { name: string } | undefined;
      return `Màn ${r?.name ?? ref.id}`;
    }
    case "doc":
      return `Tài liệu ${DOC_KIND_LABEL[(ref.sub as DocKind) ?? "BRD"] ?? ref.sub}`;
    case "diagram":
      return `Sơ đồ ${DIAGRAM_KIND_LABEL[(ref.sub as DiagramKind) ?? "UC"] ?? ref.sub}`;
    case "tests":
      return "Test case";
    default:
      return "Tài liệu";
  }
}

/** Danh sách tệp của đúng sản phẩm `ref` theo bố cục repo ở đầu tệp. */
export function buildExport(ref: ArtifactRef): ExportResult {
  const d = getDb();
  const moduleId = refModuleId(ref);
  const m = moduleRow(moduleId);
  const dir = moduleDir(moduleId);
  const files: ExportFile[] = [];

  switch (ref.kind) {
    case "doc": {
      const kind = ref.sub as DocKind;
      if (!DOC_KINDS.includes(kind)) throw new Error("Thiếu loại tài liệu");
      const r = d.prepare("SELECT content FROM module_docs WHERE module_id = ? AND kind = ?").get(moduleId, kind) as { content: string } | undefined;
      const content = r?.content?.trim() ? r.content : `# ${DOC_KIND_LABEL[kind]} – ${m.name}\n\n_(Chưa có nội dung)_`;
      files.push({ path: `${dir}/docs/${DOC_FILE[kind]}`, content: content.endsWith("\n") ? content : content + "\n" });
      break;
    }
    case "diagram": {
      const kind = ((ref.sub as DiagramKind) ?? "UC") as DiagramKind;
      const r = d.prepare("SELECT code, parts FROM module_diagrams WHERE module_id = ? AND kind = ?").get(moduleId, kind) as { code: string; parts: string } | undefined;
      files.push({ path: `${dir}/diagrams/${diagramFile(kind)}`, content: diagramMarkdown(kind, m.name, r?.code ?? "", parseJson<DiagramPart[]>(r?.parts, [])) });
      break;
    }
    case "screen": {
      const screens = moduleScreens(moduleId);
      const names = screenFiles(screens);
      const me = screens.find((s) => s.id === ref.id);
      if (!me) throw new Error("Không tìm thấy màn hình");
      files.push({ path: `${dir}/prototype/${names.get(me.id)}`, content: screenHtml(me.name, parseJson<UINode | null>(me.tree, null), m.name) });
      // index.html: các màn đã duyệt + màn đang được duyệt (trạng thái chưa đổi lúc đẩy).
      const approved = screens.filter((s) => s.id === me.id || s.status === "approved").map((s) => ({ name: s.name, file: names.get(s.id)! }));
      files.push({ path: `${dir}/prototype/index.html`, content: prototypeIndex(m.name, approved) });
      break;
    }
    case "tests": {
      const rows = d.prepare("SELECT data FROM test_cases WHERE module_id = ? ORDER BY ord").all(moduleId) as { data: string }[];
      const cases = rows.map((r) => parseJson<TestCase | null>(r.data, null)).filter((c): c is TestCase => !!c);
      files.push({ path: `${dir}/tests/test-cases.md`, content: testsMarkdown(m.name, cases) });
      break;
    }
    default:
      throw new Error("Loại sản phẩm không đẩy lên GitHub được");
  }

  return { projectId: m.project_id, moduleId, moduleName: m.name, moduleDir: dir, label: artifactLabel(ref), files };
}
