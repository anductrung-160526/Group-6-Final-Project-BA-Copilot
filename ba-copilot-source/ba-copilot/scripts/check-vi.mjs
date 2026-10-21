// Soát sót tiếng Việt: quét chuỗi (không tính chú thích) trong client/, server/, shared/, scripts/seed.ts
// và public/index.html, báo mọi chuỗi có ký tự tiếng Việt có dấu.
//
// Chỗ được phép giữ tiếng Việt (mảng từ khoá NLP để nhận diện nội dung cũ trong DB…) phải đánh dấu:
//   - cùng dòng hoặc dòng ngay trên:   // vi-keep: <lý do>
//   - cả một vùng:                     // vi-keep-start: <lý do>   …   // vi-keep-end
//
// Chạy: npm run check-vi  (hoặc node scripts/check-vi.mjs)           (thoát mã 1 nếu còn chuỗi chưa dịch)
//       node scripts/check-vi.mjs --kept    (liệt kê thêm các vùng vi-keep kèm lý do)
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGETS = ["client", "server", "shared", "scripts/seed.ts", "public/index.html"];
const EXTS = new Set([".ts", ".tsx", ".mjs", ".js", ".html"]);
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

// Từ tiếng Việt không dấu hay gặp trên giao diện (vd nút "Xong", "Sinh lại") – ký tự có dấu không bắt được.
const VI_ASCII = /\b(?:Xong|xong|Sinh|sinh|Trang|Nhanh|Khung|Ngay|Nhom|Danh|Chung|Khong|Dong y)\b/;

function walk(p, out) {
  const abs = join(ROOT, p);
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const name of readdirSync(abs)) walk(join(p, name), out);
  } else if (EXTS.has(extname(p))) out.push(p);
  return out;
}

/** Dòng nào được phép giữ tiếng Việt (theo dấu vi-keep). Trả về Map dòng → lý do. */
function keptLines(text) {
  const lines = text.split(/\r?\n/);
  const kept = new Map();
  let region = null;
  lines.forEach((line, i) => {
    const start = line.match(/vi-keep-start:?\s*(.*)$/);
    const end = /vi-keep-end/.test(line);
    const one = !start && line.match(/vi-keep:?\s*(.*)$/);
    if (start) region = start[1].replace(/\*\/\s*\}?\s*$/, "").trim() || "(không ghi lý do)";
    if (region) kept.set(i + 1, region);
    if (one) {
      const why = one[1].replace(/\*\/\s*\}?\s*$/, "").trim() || "(không ghi lý do)";
      kept.set(i + 1, why);
      kept.set(i + 2, why);
    }
    if (end) region = null;
  });
  return kept;
}

const kind = (k) => ts.SyntaxKind[k];
const findings = [];
const keptHits = [];

for (const file of TARGETS.flatMap((t) => walk(t, []))) {
  const text = readFileSync(join(ROOT, file), "utf8");
  const kept = keptLines(text);
  const report = (line, str, what) => {
    const s = str.replace(/\s+/g, " ").trim();
    if (!VI.test(s) && !VI_ASCII.test(s)) return;
    if (kept.has(line)) keptHits.push({ file, line, str: s, why: kept.get(line) });
    else findings.push({ file, line, str: s, what });
  };

  if (file.endsWith(".html")) {
    // HTML tĩnh: bỏ chú thích <!-- --> rồi soát từng dòng
    text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " ")).split("\n").forEach((l, i) => report(i + 1, l, "html"));
    continue;
  }

  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
      case ts.SyntaxKind.JsxText:
      case ts.SyntaxKind.RegularExpressionLiteral: {
        const start = node.getStart(sf);
        const raw = text.slice(start, node.getEnd());
        // Chuỗi nhiều dòng: soát theo từng dòng để dấu vi-keep áp đúng chỗ
        const firstLine = sf.getLineAndCharacterOfPosition(start).line + 1;
        raw.split("\n").forEach((l, i) => report(firstLine + i, l, kind(node.kind)));
        break;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Gộp chuỗi trùng (một dòng nhiều token)
const uniq = (arr) => {
  const seen = new Set();
  return arr.filter((f) => {
    const k = `${f.file}:${f.line}:${f.str}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const out = uniq(findings);
const keptOut = uniq(keptHits);

for (const f of out) console.log(`${f.file.replace(/\\/g, "/")}:${f.line}  ${f.str.slice(0, 140)}`);
if (process.argv.includes("--kept")) {
  console.log("\n--- Vùng được phép giữ tiếng Việt (vi-keep) ---");
  const byWhy = new Map();
  for (const k of keptOut) {
    const key = `${k.file.replace(/\\/g, "/")} – ${k.why}`;
    byWhy.set(key, (byWhy.get(key) ?? 0) + 1);
  }
  for (const [k, n] of byWhy) console.log(`${k}  (${n} dòng)`);
}
console.log(`\ncheck-vi: ${out.length} chuỗi tiếng Việt chưa dịch, ${keptOut.length} dòng giữ có chủ đích (vi-keep).`);
process.exit(out.length ? 1 : 0);
