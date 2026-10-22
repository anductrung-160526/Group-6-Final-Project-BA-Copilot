// Xuất bộ dữ liệu theo định dạng giống WebSight (HuggingFaceM4/WebSight): mỗi màn gốc = ảnh chụp (PNG) + mã HTML + mô tả.
// HTML được render tĩnh từ cây bằng Renderer của app (cùng giao diện BA thấy), ảnh chụp bằng Chromium ở khung 1280 px.
// Đầu ra dataset/export/websight/: images/<id>.png, html/<id>.html, styles.css, metadata.jsonl, index.html (thư viện xem).
// File Parquet (cột image, text, llm_generated_idea …) do scripts/dataset/websight_parquet.py tạo từ metadata.jsonl.
// Dùng: CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/dataset/export-websight.tsx
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { Renderer } from "../../frontend/src/components/Renderer.tsx";
import { loadRoots } from "./roots.ts";
import { splitOf } from "./build-samples.ts";

const root = join(import.meta.dirname, "..", "..");
const out = join(root, "dataset", "export", "websight");
for (const d of ["images", "html"]) mkdirSync(join(out, d), { recursive: true });
copyFileSync(join(root, "frontend", "src", "styles.css"), join(out, "styles.css"));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const meta: string[] = [];
const items = loadRoots().items;
for (const r of items) {
  const body = renderToStaticMarkup(<Renderer node={r.tree} />);
  const html = `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.requirement.title)}</title><link rel="stylesheet" href="../styles.css"><style>body{margin:0;background:#fff}</style></head>\n<body>${body}</body></html>\n`;
  writeFileSync(join(out, "html", `${r.id}.html`), html);
  await page.goto("file://" + join(out, "html", `${r.id}.html`));
  await page.screenshot({ path: join(out, "images", `${r.id}.png`), fullPage: true });
  meta.push(JSON.stringify({
    id: r.id, split: splitOf(r.id), image: `images/${r.id}.png`, html: `html/${r.id}.html`,
    llm_generated_idea: `${r.requirement.title}. ${r.requirement.description}`,
    group: r.group, screenKind: r.screenKind, domain: r.domain, permission: r.permission, layout: r.layout,
    actor: r.requirement.actor, permissions: r.requirement.permissions, rules: r.requirement.rules ?? [], tree: r.tree,
  }));
}
await browser.close();
writeFileSync(join(out, "metadata.jsonl"), meta.join("\n") + "\n");

// thư viện xem: lưới ảnh, bấm vào xem ảnh lớn + mô tả + mã HTML
const rows = meta.map((l) => JSON.parse(l));
const cards = rows.map((m) => `<a class="card" href="#${m.id}" data-text="${esc((m.id + " " + m.llm_generated_idea + " " + m.group + " " + m.domain).toLowerCase())}" data-group="${m.group}"><img loading="lazy" src="${m.image}" alt="${esc(m.id)}"><div><b>${m.id}</b> · ${esc(m.screenKind)}<br><span>${esc(m.llm_generated_idea.split(". ")[0])}</span></div></a>`).join("\n");
const groups = [...new Set(rows.map((m) => m.group))];
writeFileSync(join(out, "index.html"), `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bộ dữ liệu UI web</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f6f8;color:#1d2433}header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e4e7ec;padding:10px 16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;z-index:2}
input,select{padding:6px 8px;border:1px solid #cfd4dc;border-radius:6px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;padding:16px}
.card{background:#fff;border:1px solid #e4e7ec;border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;font-size:13px}.card img{width:100%;height:180px;object-fit:contain;object-position:top;background:#fff;border-bottom:1px solid #eee}.card div{padding:8px}.card span{color:#5b6475}
#view{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:5;overflow:auto}#view .box{background:#fff;max-width:1200px;margin:24px auto;border-radius:12px;padding:16px}#view img{width:100%;border:1px solid #ddd}
pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;max-height:360px;font-size:12px;white-space:pre-wrap}.tags span{display:inline-block;background:#eef2f7;border-radius:999px;padding:2px 8px;margin:2px;font-size:12px}</style></head><body>
<header><b>Bộ dữ liệu UI web – ${rows.length} màn gốc (định dạng giống WebSight)</b><input id="q" placeholder="Tìm theo tên, miền…"><select id="g"><option value="">Tất cả nhóm</option>${groups.map((g) => `<option>${g}</option>`).join("")}</select><span id="count"></span></header>
<div class="grid" id="grid">${cards}</div>
<div id="view"><div class="box"><p><a href="#">✕ Đóng</a></p><h2 id="vt"></h2><div class="tags" id="vg"></div><p id="vd"></p><img id="vi"><h3>Mã HTML (cột "text")</h3><pre id="vh"></pre></div></div>
<script>const META=${JSON.stringify(rows.map(({ tree, ...m }) => m)).replace(/</g, "\\u003c")};
const q=document.getElementById('q'),g=document.getElementById('g'),cards=[...document.querySelectorAll('.card')];
function filter(){let n=0;for(const c of cards){const ok=(!q.value||c.dataset.text.includes(q.value.toLowerCase()))&&(!g.value||c.dataset.group===g.value);c.style.display=ok?'':'none';n+=ok}document.getElementById('count').textContent=n+' màn'}
q.oninput=g.onchange=filter;filter();
async function show(){const id=location.hash.slice(1),m=META.find(x=>x.id===id),v=document.getElementById('view');if(!m){v.style.display='none';return}
v.style.display='block';document.getElementById('vt').textContent=m.id+' – '+m.llm_generated_idea.split('. ')[0];document.getElementById('vd').textContent=m.llm_generated_idea;
document.getElementById('vg').innerHTML=[m.split,m.group,m.screenKind,m.domain,m.permission,m.layout].map(t=>'<span>'+t+'</span>').join('');document.getElementById('vi').src=m.image;
const h=document.getElementById('vh');h.textContent='Đang tải…';try{h.textContent=await (await fetch(m.html)).text()}catch(e){h.innerHTML='Trình duyệt chặn đọc file cục bộ – <a href="'+m.html+'" target="_blank">mở file HTML</a>'}}
window.onhashchange=show;show();</script></body></html>`);
console.log(`→ dataset/export/websight: ${rows.length} ảnh, ${rows.length} HTML, metadata.jsonl, index.html`);
