// Trình hiển thị markdown tối giản cho nội dung SRS (tiêu đề, gạch đầu dòng, bảng, đậm/nghiêng, trích dẫn).
import React from "react";

function inline(text: string, key: string | number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) parts.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) parts.push(<code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>);
    else parts.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      out.push(
        <div className="table-wrap" key={i}>
          <table className="tbl">
            <thead>
              <tr>{rows[0]?.map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, k) => (
                <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c, j)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ""));
      i--;
      out.push(
        <ul key={i}>
          {items.map((it, k) => (
            <li key={k}>{inline(it, k)}</li>
          ))}
        </ul>,
      );
    } else if (line.startsWith("### ")) out.push(<h4 key={i}>{inline(line.slice(4), i)}</h4>);
    else if (line.startsWith("## ")) out.push(<h3 key={i}>{inline(line.slice(3), i)}</h3>);
    else if (line.startsWith("> ")) out.push(<blockquote key={i}>{inline(line.slice(2), i)}</blockquote>);
    else out.push(<p key={i}>{inline(line, i)}</p>);
  }
  return <div className="md">{out}</div>;
}
