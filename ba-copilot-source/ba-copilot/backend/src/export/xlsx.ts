// Xuất test case + ma trận truy vết ra Excel (.xlsx) – tự dựng OOXML bằng JSZip.

import JSZip from "jszip";
import type { TestCase } from "../../../shared/types.ts";
import type { TraceResult } from "../../../shared/trace.ts";

interface Sheet {
  name: string;
  header: string[];
  rows: (string | number)[][];
  widths: number[];
}

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colName(i: number): string {
  let s = "";
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function sheetXml(sh: Sheet): string {
  const cell = (v: string | number, r: number, c: number, style: number) => {
    const ref = `${colName(c)}${r}`;
    if (typeof v === "number") return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
  };
  const rows = [
    `<row r="1">${sh.header.map((h, c) => cell(h, 1, c, 1)).join("")}</row>`,
    ...sh.rows.map((r, i) => `<row r="${i + 2}">${r.map((v, c) => cell(v, i + 2, c, 2)).join("")}</row>`),
  ];
  const last = `${colName(sh.header.length - 1)}${sh.rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${rows.join("")}</sheetData>
<autoFilter ref="A1:${last}"/>
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5496"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export async function buildXlsx(sheets: Sheet[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
<definedNames>${sheets.map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name.slice(0, 31))}'!$A$1:$${colName(s.header.length - 1)}$${s.rows.length + 1}</definedName>`).join("")}</definedNames>
</workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );
  zip.file("xl/styles.xml", STYLES);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const typeVi = (t: string) => ({ Positive: "Positive", Negative: "Negative", Boundary: "Boundary" })[t] ?? t;
const prioVi = (p: string) => ({ High: "High", Medium: "Medium", Low: "Low" })[p] ?? p;

export function testWorkbook(tests: TestCase[], trace: TraceResult, screenName: (id: string) => string): Promise<Buffer> {
  return buildXlsx([
    {
      name: "Test case",
      header: ["TC ID", "Title", "Type", "Priority", "Use Case", "Flow", "Requirements", "Preconditions", "Test Data", "Test Steps", "Expected Result", "Actual Result", "Status"],
      rows: tests.map((t) => [t.code, t.title, typeVi(t.type), prioVi(t.priority), t.useCaseCode, t.flowRef, t.requirementCodes.join(", "), t.preconditions, t.testData, t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"), t.expected, "", "Not run"]),
      widths: [10, 38, 13, 12, 10, 8, 14, 26, 28, 46, 40, 24, 12],
    },
    {
      name: "Traceability",
      header: ["Requirement", "Type", "Statement", "Use Case", "Screens", "Test Cases", "Coverage"],
      rows: trace.rows.map((r) => [r.requirement.code, r.requirement.type, r.requirement.statement, r.useCases.join(", "), r.screenIds.map(screenName).join(", "), r.tests.join(", "), r.tests.length ? "Covered" : "NOT COVERED"]),
      widths: [10, 8, 60, 16, 24, 36, 16],
    },
  ]);
}
