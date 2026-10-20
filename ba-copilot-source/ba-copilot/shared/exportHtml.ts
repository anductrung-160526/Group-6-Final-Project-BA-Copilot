// Xuất cây giao diện (UINode) thành trang HTML tĩnh tự chứa: CSS nội tuyến, không JavaScript, không phụ thuộc app –
// mở thẳng bằng trình duyệt được. Bố cục và kiểu chữ bám sát bản xem trước trên canvas (client/components/Renderer.tsx
// + khối .ds-* trong client/styles.css). Chủ sở hữu: C9. C8 dùng khi đẩy prototype lên GitHub (quyết định 16).
//
//   screenToHtml(tree, { title: "Đăng nhập" })                       → một trang
//   prototypeFiles([{ name, tree }, …], { title: "Module Xác thực" }) → các trang + index.html, nút điều hướng nối các trang

import type { UINode } from "./design.ts";

export interface ExportHtmlOptions {
  /** Tiêu đề thẻ <title> (mặc định: props.title của Page). */
  title?: string;
  /** Tên màn đích (navigateTo) → đường dẫn trang. Có thì nút/liên kết điều hướng thành thẻ <a href>. */
  links?: Record<string, string>;
  /** Dòng chú thích nhỏ cuối trang (vd "Xuất từ BA Copilot – v3"). Bỏ trống thì không hiện. */
  footer?: string;
  /** Liên kết "Về danh sách màn hình" đầu trang (dùng trong bộ prototype có index.html). */
  backHref?: string;
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const s = (v: unknown, d = "") => (v === undefined || v === null ? d : String(v));
/** Chỉ giữ ký tự an toàn cho tên class (giá trị props do AI sinh). */
const cls = (v: unknown, d: string) => s(v, d).replace(/[^a-zA-Z0-9_-]/g, "-");
const num = (v: unknown, d: number, min = 0, max = 2000) => {
  const n = Number(v ?? d);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

const norm = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();

/** Tên tệp an toàn (không dấu, không ký tự lạ) cho một màn: "Đăng nhập" → "dang-nhap.html". */
export function screenFileName(name: string): string {
  const base = norm(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "man-hinh"}.html`;
}

interface Ctx {
  links: Map<string, string>;
}

function navHref(ctx: Ctx, target: unknown): string | null {
  if (!target) return null;
  return ctx.links.get(norm(String(target))) ?? null;
}

function render(n: UINode, ctx: Ctx): string {
  const p = (n.props ?? {}) as Record<string, unknown>;
  const kids = (n.children ?? []).map((c) => render(c, ctx)).join("");
  const at = `data-node-id="${esc(n.id)}"`;
  const req = p.required ? '<span class="ds-req">*</span>' : "";
  const label = () => `<div class="ds-label">${esc(s(p.label))}${req}</div>`;

  switch (n.type) {
    case "Page":
      return `<div ${at} class="ds-page">${kids}</div>`;
    case "Header":
      return `<header ${at} class="ds-header">${p.title ? `<div class="ds-header-title">${esc(p.title)}</div>` : ""}${kids ? `<div class="ds-header-kids">${kids}</div>` : ""}</header>`;
    case "Sidebar":
      return `<aside ${at} class="ds-sidebar">${kids}</aside>`;
    case "Section":
      return `<section ${at} class="ds-section">${p.title ? `<h3 class="ds-section-title">${esc(p.title)}</h3>` : ""}${kids}</section>`;
    case "Card":
      return `<div ${at} class="ds-card">${p.title ? `<div class="ds-card-title">${esc(p.title)}</div>` : ""}${kids}</div>`;
    case "Row":
      return `<div ${at} class="ds-row ds-align-${cls(p.align, "start")}" style="gap:${num(p.gap, 12, 0, 200)}px">${kids}</div>`;
    case "Column":
      return `<div ${at} class="ds-col ds-w-${cls(s(p.width, "auto").replace("/", "-"), "auto")}" style="gap:${num(p.gap, 12, 0, 200)}px">${kids}</div>`;
    case "Form":
      return `<form ${at} class="ds-form">${p.title ? `<div class="ds-form-title">${esc(p.title)}</div>` : ""}${kids}</form>`;
    case "List":
      return `<div ${at} class="ds-list">${p.title ? `<div class="ds-card-title">${esc(p.title)}</div>` : ""}${kids}</div>`;
    case "Modal":
      return `<div ${at} class="ds-modal"><div class="ds-modal-head">${esc(s(p.title, "Hộp thoại"))}</div>${kids}</div>`;
    case "Heading": {
      const lvl = Math.min(3, Math.max(1, Math.round(num(p.level, 2, 1, 3))));
      return `<h${lvl} ${at} class="ds-h ds-h${lvl}">${esc(p.text)}</h${lvl}>`;
    }
    case "Text":
      return `<p ${at} class="ds-text${p.tone === "muted" ? " ds-muted" : ""}">${esc(p.text)}</p>`;
    case "Button": {
      const href = navHref(ctx, p.navigateTo);
      const title = p.navigateTo ? ` title="&#8594; ${esc(p.navigateTo)}"` : "";
      const c = `ds-btn ds-btn-${cls(p.variant, "primary")}`;
      const text = esc(s(p.label, "Nút"));
      return href ? `<a ${at} href="${esc(href)}" class="${c}"${title}>${text}</a>` : `<span ${at} role="button" class="${c}"${title}>${text}</span>`;
    }
    case "Link": {
      const href = navHref(ctx, p.navigateTo) ?? "#";
      return `<a ${at} href="${esc(href)}" class="ds-link"${p.navigateTo ? ` title="&#8594; ${esc(p.navigateTo)}"` : ""}>${esc(p.text)}</a>`;
    }
    case "Input":
    case "DatePicker": {
      const ph = n.type === "DatePicker" ? "dd/mm/yyyy" : p.inputType === "password" ? "••••••••" : s(p.placeholder);
      return `<div ${at} class="ds-field">${label()}<div class="ds-input"><span class="ds-ph">${esc(ph)}</span>${n.type === "DatePicker" ? '<span class="ds-ico">&#9638;</span>' : ""}</div></div>`;
    }
    case "Textarea":
      return `<div ${at} class="ds-field">${label()}<div class="ds-input ds-textarea"><span class="ds-ph">${esc(p.placeholder)}</span></div></div>`;
    case "Select": {
      const first = Array.isArray(p.options) && p.options.length ? String(p.options[0]) : "";
      return `<div ${at} class="ds-field">${label()}<div class="ds-input"><span>${esc(first)}</span><span class="ds-ico">&#9662;</span></div></div>`;
    }
    case "Checkbox":
      return `<div ${at} class="ds-check"><span class="ds-box"></span>${esc(p.label)}</div>`;
    case "Radio": {
      const opts = (Array.isArray(p.options) ? p.options : []).map((o, i) => `<span class="ds-check"><span class="ds-radio${i === 0 ? " on" : ""}"></span>${esc(o)}</span>`).join("");
      return `<div ${at} class="ds-field">${label()}<div class="ds-radios">${opts}</div></div>`;
    }
    case "Table": {
      const cols = Array.isArray(p.columns) ? (p.columns as unknown[]).map(String) : [];
      const rows = Array.isArray(p.rows) ? (p.rows as unknown[][]) : [];
      const acts = Array.isArray(p.rowActions) ? (p.rowActions as unknown[]).map(String) : [];
      const head = cols.map((c) => `<th>${esc(c)}</th>`).join("") + (acts.length ? "<th>Thao tác</th>" : "");
      const body = (rows.length ? rows : [cols.map(() => "—")])
        .map((r) => {
          const cells = cols.map((_, j) => `<td>${esc((Array.isArray(r) ? r : [])[j] ?? "")}</td>`).join("");
          const a = acts.length ? `<td><span class="ds-row-acts">${acts.map((x) => `<span class="ds-link">${esc(x)}</span>`).join("")}</span></td>` : "";
          return `<tr>${cells}${a}</tr>`;
        })
        .join("");
      return `<div ${at} class="ds-table-wrap"><table class="ds-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    case "Image":
      return `<div ${at} class="ds-image" style="height:${num(p.height, 140, 20, 1200)}px"><span>${esc(s(p.alt, "Ảnh"))}</span></div>`;
    case "Badge":
      return `<span ${at} class="ds-badge ds-tone-${cls(p.tone, "info")}">${esc(p.text)}</span>`;
    case "Alert":
      return `<div ${at} class="ds-alert ds-tone-${cls(p.tone, "info")}">${esc(p.text)}</div>`;
    case "Stat":
      return `<div ${at} class="ds-stat"><div class="ds-stat-label">${esc(p.label)}</div><div class="ds-stat-value">${esc(p.value)}</div></div>`;
    case "Avatar": {
      const ch = s(p.name, "?").trim().split(/\s+/).slice(-1)[0]?.[0]?.toUpperCase() ?? "?";
      return `<span ${at} class="ds-avatar" title="${esc(p.name)}">${esc(ch)}</span>`;
    }
    case "Divider":
      return `<hr ${at} class="ds-divider">`;
    case "Pagination": {
      const k = Math.round(num(p.pages, 3, 1, 7));
      const pages = Array.from({ length: k }, (_, i) => `<span${i === 0 ? ' class="on"' : ""}>${i + 1}</span>`).join("");
      return `<div ${at} class="ds-pagination"><span>&#8249;</span>${pages}<span>&#8250;</span></div>`;
    }
    default:
      return `<div ${at} class="ds-unknown">${esc(n.type)}${kids}</div>`;
  }
}

/**
 * CSS của bản thiết kế – chép từ khối `.ds-*` trong client/styles.css (bảng màu riêng của bản thiết kế, cố ý không theo
 * design system của app). Sửa khối đó thì sửa cả ở đây để bản xuất giống bản xem trước.
 */
export const PROTOTYPE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#eef0f3;font-family:Inter,"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:#1f2937}
.pt-shell{max-width:1280px;margin:24px auto;padding:0 16px}
.pt-frame{background:#fff;border:1px solid #d9dde3;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)}
.pt-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#f3f4f6;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280}
.pt-dot{width:10px;height:10px;border-radius:50%;background:#d1d5db}
.pt-url{margin-left:10px}
.pt-nav{display:flex;gap:12px;align-items:center;margin-bottom:10px;font-size:13px}
.pt-nav a{color:#2f5bea}
.pt-foot{margin-top:10px;font-size:12px;color:#6b7280;text-align:center}
.pt-index{max-width:720px;margin:40px auto;padding:0 16px}
.pt-index h1{font-size:24px;margin:0 0 16px}
.pt-index ul{list-style:none;padding:0;margin:0;background:#fff;border:1px solid #e5e7eb;border-radius:10px}
.pt-index li{border-top:1px solid #f0f1f3}
.pt-index li:first-child{border-top:0}
.pt-index li a{display:block;padding:12px 16px;color:#1f2937;text-decoration:none}
.pt-index li a:hover{background:#f9fafb;color:#2f5bea}
a.ds-btn{text-decoration:none}
.ds-page{padding:24px;display:flex;flex-direction:column;gap:16px;font-size:14px;color:#1f2937}
.ds-header{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid #e5e7eb;margin:-24px -24px 0;background:#fafafa}
.ds-header-title{font-weight:700;font-size:17px}
.ds-header-kids{display:flex;gap:12px;margin-left:auto;align-items:center}
.ds-sidebar{display:flex;flex-direction:column;gap:8px;padding:12px;background:#f8fafc;border-radius:8px;min-width:180px}
.ds-section{display:flex;flex-direction:column;gap:12px}
.ds-section-title{font-size:15px;font-weight:600;margin:0}
.ds-card{border:1px solid #e5e7eb;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px;max-width:100%;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.ds-page>.ds-card:only-child{width:420px;margin:24px auto}
.ds-card-title,.ds-form-title{font-weight:700;font-size:16px}
.ds-row{display:flex;flex-wrap:wrap;align-items:flex-end}
.ds-row>.ds-field{min-width:180px;flex:1}
.ds-row>.ds-stat{flex:1}
.ds-align-center{justify-content:center}
.ds-align-end{justify-content:flex-end}
.ds-align-between{justify-content:space-between}
.ds-col{display:flex;flex-direction:column;flex:1}
.ds-w-1-3{flex:0 0 33%}
.ds-w-1-2{flex:0 0 50%}
.ds-w-2-3{flex:0 0 66%}
.ds-form{display:flex;flex-direction:column;gap:14px}
.ds-list{display:flex;flex-direction:column;gap:8px}
.ds-modal{border:1px solid #d1d5db;border-radius:12px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.12);display:flex;flex-direction:column;gap:12px}
.ds-modal-head{font-weight:700}
.ds-h{margin:0}
.ds-h1{font-size:24px}
.ds-h2{font-size:19px}
.ds-h3{font-size:16px}
.ds-text{margin:0;line-height:1.5}
.ds-muted{color:#6b7280}
.ds-btn{display:inline-flex;align-items:center;justify-content:center;padding:9px 16px;border-radius:8px;font-weight:600;background:#2f5bea;color:#fff;user-select:none;align-self:flex-start}
.ds-form>.ds-btn{align-self:stretch}
.ds-btn-secondary{background:#fff;color:#1f2937;border:1px solid #d1d5db}
.ds-btn-ghost{background:transparent;color:#2f5bea}
.ds-btn-danger{background:#d92d20}
.ds-link{color:#2f5bea;font-size:13px}
.ds-row-acts{display:flex;gap:10px}
.ds-field{display:flex;flex-direction:column;gap:6px}
.ds-label{font-size:13px;font-weight:600}
.ds-req{color:#d92d20;margin-left:2px}
.ds-input{border:1px solid #d1d5db;border-radius:8px;padding:9px 12px;min-height:38px;display:flex;justify-content:space-between;align-items:center;background:#fff}
.ds-textarea{min-height:80px;align-items:flex-start}
.ds-ph{color:#9ca3af}
.ds-ico{color:#9ca3af}
.ds-check{display:flex;align-items:center;gap:8px;font-size:13px}
.ds-box{width:16px;height:16px;border:1.5px solid #9ca3af;border-radius:4px}
.ds-radio{width:16px;height:16px;border:1.5px solid #9ca3af;border-radius:50%}
.ds-radio.on{border:5px solid #2f5bea}
.ds-radios{display:flex;gap:16px}
.ds-table-wrap{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
.ds-table{width:100%;border-collapse:collapse;font-size:13px}
.ds-table th{background:#f9fafb;text-align:left;padding:10px 12px;color:#6b7280;font-weight:600}
.ds-table td{padding:10px 12px;border-top:1px solid #f0f1f3}
.ds-image{background:repeating-linear-gradient(45deg,#f3f4f6 0 10px,#e5e7eb 10px 20px);border-radius:8px;display:grid;place-items:center;color:#6b7280}
.ds-badge{font-size:12px;padding:2px 10px;border-radius:999px;align-self:flex-start}
.ds-alert{padding:10px 14px;border-radius:8px;font-size:13px}
.ds-tone-info{background:#eff4ff;color:#2846b8}
.ds-tone-success{background:#e7f6ee;color:#0f6b40}
.ds-tone-warning{background:#fff4dc;color:#8a5a00}
.ds-tone-danger{background:#fdecea;color:#b42318}
.ds-stat{border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;min-width:150px}
.ds-stat-label{font-size:12px;color:#6b7280}
.ds-stat-value{font-size:22px;font-weight:700;margin-top:4px}
.ds-avatar{width:32px;height:32px;border-radius:50%;background:#c7d2fe;color:#3730a3;display:grid;place-items:center;font-weight:700;font-size:13px}
.ds-divider{border:0;border-top:1px solid #e5e7eb;margin:4px 0;width:100%}
.ds-pagination{display:flex;gap:6px;justify-content:flex-end}
.ds-pagination span{min-width:30px;height:30px;border:1px solid #e5e7eb;border-radius:6px;display:grid;place-items:center;font-size:13px}
.ds-pagination span.on{background:#2f5bea;color:#fff;border-color:#2f5bea}
.ds-unknown{border:1px dashed #d92d20;padding:8px;color:#d92d20}
@media (max-width:640px){.ds-page>.ds-card:only-child{width:auto;margin:8px 0}.ds-w-1-3,.ds-w-1-2,.ds-w-2-3{flex:1 1 100%}.pt-shell{margin:8px auto;padding:0 8px}}
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="BA Copilot">
<title>${esc(title)}</title>
<style>${PROTOTYPE_CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** Một màn hình → trang HTML tự chứa (giống bản xem trước trên canvas: khung trình duyệt + bản thiết kế). */
export function screenToHtml(tree: UINode, opts: ExportHtmlOptions = {}): string {
  const title = opts.title || s(tree?.props?.title, "Màn hình");
  const links = new Map(Object.entries(opts.links ?? {}).map(([k, v]) => [norm(k), v]));
  const content = tree ? render(tree, { links }) : "";
  const nav = opts.backHref ? `<div class="pt-nav"><a href="${esc(opts.backHref)}">&#8592; Danh sách màn hình</a></div>` : "";
  const foot = opts.footer ? `<div class="pt-foot">${esc(opts.footer)}</div>` : "";
  const body = `<div class="pt-shell">${nav}<div class="pt-frame"><div class="pt-bar"><span class="pt-dot"></span><span class="pt-dot"></span><span class="pt-dot"></span><span class="pt-url">${esc(title)}</span></div>${content}</div>${foot}</div>`;
  return page(title, body);
}

export interface PrototypeScreen {
  name: string;
  tree: UINode;
}

/**
 * Bộ prototype của một module: mỗi màn một tệp + `index.html` liệt kê các màn. Nút/liên kết có `navigateTo` trùng tên
 * (hoặc tiêu đề) màn khác được nối sang tệp của màn đó. Tên tệp trùng nhau thì thêm hậu tố -2, -3…
 */
export function prototypeFiles(screens: PrototypeScreen[], opts: { title?: string; footer?: string } = {}): { path: string; html: string }[] {
  const used = new Set<string>(["index.html"]);
  const named = screens.map((sc) => {
    let f = screenFileName(sc.name);
    for (let i = 2; used.has(f); i++) f = f.replace(/(-\d+)?\.html$/, `-${i}.html`);
    used.add(f);
    return { ...sc, file: f };
  });
  const links: Record<string, string> = {};
  for (const sc of named) {
    const t = s(sc.tree?.props?.title);
    if (t && !(t in links)) links[t] = sc.file;
  }
  for (const sc of named) links[sc.name] = sc.file; // tên màn ưu tiên hơn tiêu đề
  const files = named.map((sc) => ({ path: sc.file, html: screenToHtml(sc.tree, { title: sc.name, links, footer: opts.footer, backHref: "index.html" }) }));
  const title = opts.title || "Prototype";
  const list = named.map((sc) => `<li><a href="${esc(sc.file)}">${esc(sc.name)}</a></li>`).join("");
  files.push({ path: "index.html", html: page(title, `<div class="pt-index"><h1>${esc(title)}</h1><ul>${list || "<li><a>(Chưa có màn hình)</a></li>"}</ul>${opts.footer ? `<div class="pt-foot">${esc(opts.footer)}</div>` : ""}</div>`) });
  return files;
}
