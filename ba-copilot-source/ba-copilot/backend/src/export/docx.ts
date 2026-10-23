// Xuất tài liệu Use Case + SRS + Sequence ra file Word (.docx).

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DocBundle, Module, Project, UseCase } from "../../../shared/types.ts";

const FONT = "Arial";
const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };
const CONTENT_W = 9360; // US Letter, lề 1 inch

function runs(text: string, opts: { bold?: boolean; italics?: boolean } = {}): TextRun[] {
  // hỗ trợ **đậm** và _nghiêng_ đơn giản
  const out: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...opts }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, font: FONT, italics: opts.italics }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, font: FONT, bold: opts.bold }));
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...opts }));
  return out;
}

const p = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) => new Paragraph({ children: runs(text, opts), spacing: { after: 80 } });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) => new Paragraph({ heading: level, children: [new TextRun({ text, font: FONT })], spacing: { before: 240, after: 120 } });
const bullet = (text: string) => new Paragraph({ children: runs(text), bullet: { level: 0 }, spacing: { after: 40 } });

function table(header: string[], rows: string[][], widths?: number[]): Table {
  const w = widths ?? header.map(() => Math.floor(CONTENT_W / header.length));
  const cell = (t: string, i: number, head: boolean) =>
    new TableCell({
      borders,
      width: { size: w[i], type: WidthType.DXA },
      shading: head ? { fill: "E8EEF7", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: String(t)
        .split("\n")
        .map((line) => new Paragraph({ children: runs(line, { bold: head }) })),
    });
  return new Table({
    width: { size: w.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: w,
    rows: [new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, i, true)) }), ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, i, false)) }))],
  });
}

/** Chuyển markdown đơn giản (###, -, bảng |) thành các khối docx. */
function markdownBlocks(md: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) continue;
    if (line.startsWith("|")) {
      const tbl: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) tbl.push(cells);
        i++;
      }
      i--;
      if (tbl.length) {
        // độ rộng cột tỉ lệ với độ dài nội dung dài nhất của cột
        const lens = tbl[0].map((_, c) => Math.min(60, Math.max(6, ...tbl.map((r) => (r[c] ?? "").length))));
        const total = lens.reduce((a, b) => a + b, 0);
        const widths = lens.map((l) => Math.floor((l / total) * CONTENT_W));
        out.push(table(tbl[0], tbl.slice(1), widths), new Paragraph({ children: [] }));
      }
    } else if (line.startsWith("### ")) out.push(h(line.slice(4), HeadingLevel.HEADING_3));
    else if (line.startsWith("## ")) out.push(h(line.slice(3), HeadingLevel.HEADING_2));
    else if (/^\s*[-*] /.test(line)) out.push(bullet(line.replace(/^\s*[-*] /, "")));
    else if (line.startsWith("> ")) out.push(p(line.slice(2), { italics: true }));
    else out.push(p(line));
  }
  return out;
}

function useCaseBlocks(u: UseCase, screenName: (id: string) => string): (Paragraph | Table)[] {
  const flow = (f: { code: string; name: string; branchFrom: number; steps: string[] }) => `${f.code}. ${f.name} (from step ${f.branchFrom})\n${f.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`;
  const rows: string[][] = [
    ["ID", u.code],
    ["Use Case Name", u.name],
    ["Actors", u.actors.join(", ")],
    ["Description", u.description],
    ["Trigger", u.trigger],
    ["Preconditions", u.preconditions.map((x) => `- ${x}`).join("\n")],
    ["Postconditions", u.postconditions.map((x) => `- ${x}`).join("\n")],
    ["Main Flow", u.mainFlow.map((s) => `${s.no}. [${s.actor}] ${s.text}`).join("\n")],
    ["Alternative Flows", u.altFlows.map(flow).join("\n") || "-"],
    ["Exception Flows", u.exceptions.map(flow).join("\n") || "-"],
    ["Business Rules", u.businessRules.map((x) => `- ${x}`).join("\n") || "-"],
    ["Related Screens", u.screenIds.map(screenName).join(", ") || "-"],
    ["Assumptions (to be confirmed by the BA)", u.assumptions.map((x) => `- ${x}`).join("\n") || "-"],
  ];
  return [h(`${u.code}: ${u.name}`, HeadingLevel.HEADING_2), table(["Item", "Content"], rows, [2400, CONTENT_W - 2400]), new Paragraph({ children: [] })];
}

export async function buildDocx(project: Project, module: Module, docs: DocBundle, screenName: (id: string) => string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `ANALYSIS DOCUMENT – ${module.name.toUpperCase()}`, bold: true, size: 32, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [new TextRun({ text: `Project: ${project.name} · Status: ${statusVi(module.docsStatus)} · Exported on ${new Date().toLocaleDateString("en-US")}`, font: FONT, color: "666666" })] }),
    new Paragraph({ children: [new TextRun({ text: "Draft generated automatically by BA Copilot – items labelled Assumption must be confirmed by the BA.", italics: true, font: FONT, color: "8A6D00" })], spacing: { after: 240 } }),
    h("Part A. Use Case Specification", HeadingLevel.HEADING_1),
    table(
      ["ID", "Use Case", "Actors", "Screens"],
      docs.useCases.map((u) => [u.code, u.name, u.actors.join(", "), u.screenIds.map(screenName).join(", ")]),
      [1100, 4060, 2000, 2200],
    ),
    ...docs.useCases.flatMap((u) => useCaseBlocks(u, screenName)),
    h("Part B. Software Requirements Specification (SRS)", HeadingLevel.HEADING_1),
    ...(docs.srs?.sections.flatMap((s) => [h(s.title, HeadingLevel.HEADING_2), ...markdownBlocks(s.content)]) ?? [p("No SRS yet")]),
    h("Part C. Sequence Diagrams (Mermaid code)", HeadingLevel.HEADING_1),
    p("View the diagrams graphically in BA Copilot, or paste the code into mermaid.live.", { italics: true }),
    ...docs.sequences.flatMap((s) => [
      h(s.title, HeadingLevel.HEADING_2),
      ...s.mermaid.split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, font: "Courier New", size: 18 })], spacing: { after: 0 } })),
    ]),
  ];
  const doc = new Document({
    creator: "BA Copilot",
    title: `Documents – ${module.name}`,
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: FONT, color: "1F3864" }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: FONT, color: "2F5496" }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
      ],
    },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
  return Packer.toBuffer(doc);
}

export function statusVi(s: string): string {
  return ({ none: "Not started", draft: "Draft", done: "Done", approved: "Approved", outdated: "Outdated" } as Record<string, string>)[s] ?? s;
}
