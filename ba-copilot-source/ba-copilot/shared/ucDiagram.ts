// Sơ đồ Use Case dạng Mermaid flowchart (FN-11 → FN-14). Hàm thuần, dùng chung cho server (bản Mock + bản AI) và test.
// Quy ước hình: actor = hình tròn (( )), UC = hình bầu dục ([ ]) nằm trong khung "Hệ thống",
// actor – UC nối bằng nét liền; «include» đi từ UC gốc tới UC được gộp, «extend» đi từ UC mở rộng tới UC gốc (nét đứt).

import type { AltFlow, FlowStep } from "./types.ts";

/** Phần UC cần để vẽ. Nhận được cả `UseCase` đầy đủ. */
export interface UcDiagramInput {
  code: string;
  name: string;
  actors: string[];
  /** Quan hệ khai báo sẵn (mã UC). Không có thì suy ra từ luồng – xem `inferRelations`. */
  includes?: string[];
  extends?: string[];
  mainFlow?: FlowStep[];
  altFlows?: AltFlow[];
  exceptions?: AltFlow[];
}

export type UcRelationType = "include" | "extend";

export interface UcRelation {
  from: string; // mã UC đầu mũi tên
  to: string; // mã UC cuối mũi tên
  type: UcRelationType;
}

const SYSTEM_ACTOR = /^(?:hệ thống|system|the system)$/i; // vi-keep: actor "Hệ thống" trong UC cũ tiếng Việt
const UC_CODE = /\bUC-\d+\b/gi;

/** Nhãn an toàn trong chuỗi "…" của Mermaid: bỏ ngoặc kép, xuống dòng, ký tự HTML. */
export function ucLabel(s: string, max = 80): string {
  const t = String(s ?? "")
    .replace(/["`]/g, "'")
    .replace(/[<>]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/**
 * Quan hệ giữa các UC:
 * - lấy `includes` / `extends` khai báo sẵn;
 * - bước luồng chính nhắc mã UC khác → «include»;
 * - luồng thay thế / ngoại lệ nhắc mã UC khác, hoặc trùng tên UC khác → «extend» (UC kia mở rộng UC này).
 * Bỏ quan hệ tới UC không tồn tại, tự trỏ chính mình và quan hệ trùng.
 */
export function inferRelations(useCases: UcDiagramInput[]): UcRelation[] {
  const byCode = new Map(useCases.map((u) => [u.code.toUpperCase(), u.code]));
  const byName = new Map(useCases.map((u) => [ucLabel(u.name).toLowerCase(), u.code]));
  const out: UcRelation[] = [];
  const seen = new Set<string>();
  const add = (from: string | undefined, to: string | undefined, type: UcRelationType) => {
    if (!from || !to || from === to) return;
    const key = `${from}|${to}|${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from, to, type });
  };
  const codesIn = (text: string) => [...String(text ?? "").matchAll(UC_CODE)].map((m) => byCode.get(m[0].toUpperCase()));

  for (const u of useCases) {
    for (const c of u.includes ?? []) add(u.code, byCode.get(String(c).toUpperCase()), "include");
    for (const c of u.extends ?? []) add(u.code, byCode.get(String(c).toUpperCase()), "extend");
    for (const s of u.mainFlow ?? []) for (const c of codesIn(s.text)) add(u.code, c, "include");
    for (const f of [...(u.altFlows ?? []), ...(u.exceptions ?? [])]) {
      for (const c of codesIn([f.name, ...f.steps].join(" "))) add(c, u.code, "extend");
      add(byName.get(ucLabel(f.name).toLowerCase()), u.code, "extend");
    }
  }
  return out;
}

/**
 * Mã băm ngắn (FNV-1a) của phần UC mà sơ đồ dựa vào: mã, tên, actor và quan hệ suy ra được từ UC. Dùng cho FN-14.
 * Chỉ tính trên UC (không tính quan hệ AI chọn) để cùng một bộ UC luôn ra cùng mã băm.
 */
export function ucSourceHash(useCases: UcDiagramInput[]): string {
  const relations = inferRelations(useCases);
  const src = JSON.stringify([
    useCases.map((u) => [u.code, ucLabel(u.name), [...u.actors].map((a) => ucLabel(a)).sort()]),
    relations.map((r) => `${r.from}>${r.to}:${r.type}`).sort(),
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Dòng chú thích ghi mã băm nguồn UC trong mã Mermaid. */
export const SOURCE_MARK = "%% nguon-uc:";

/** Đọc mã băm nguồn UC từ mã Mermaid (null nếu BA đã xoá dòng chú thích). */
export function readSourceHash(code: string): string | null {
  const m = String(code ?? "").match(/^\s*%% nguon-uc:\s*([0-9a-f]{8})\s*$/m);
  return m ? m[1] : null;
}

/**
 * Sinh mã Mermaid mô phỏng UC diagram.
 * @param useCases danh sách UC (thứ tự giữ nguyên)
 * @param actors danh sách actor; actor có trong UC mà thiếu ở đây vẫn được thêm. "Hệ thống" bị bỏ.
 * @param relations quan hệ «include»/«extend»; mặc định suy ra bằng `inferRelations`.
 */
export function buildUcMermaid(useCases: UcDiagramInput[], actors: string[] = [], relations?: UcRelation[]): string {
  const ucs = useCases.filter((u) => u && u.code);
  const rels = relations ?? inferRelations(ucs);
  const actorNames: string[] = [];
  const actorKey = new Map<string, string>();
  for (const a of [...actors, ...ucs.flatMap((u) => u.actors ?? [])]) {
    const name = ucLabel(a, 40);
    if (!name || SYSTEM_ACTOR.test(name) || actorKey.has(name.toLowerCase())) continue;
    actorKey.set(name.toLowerCase(), `A${actorNames.length + 1}`);
    actorNames.push(name);
  }
  const ucId = new Map(ucs.map((u, i) => [u.code, `UC${i + 1}`]));

  const lines = ["flowchart LR", `  ${SOURCE_MARK} ${ucSourceHash(ucs)}`];
  actorNames.forEach((a, i) => lines.push(`  A${i + 1}(("${a}"))`));
  lines.push(`  subgraph SYS["System"]`, "    direction TB");
  if (!ucs.length) lines.push(`    EMPTY["No use cases yet"]`);
  ucs.forEach((u) => lines.push(`    ${ucId.get(u.code)}(["${ucLabel(`${u.code}: ${u.name}`)}"])`));
  lines.push("  end");
  for (const u of ucs)
    for (const a of u.actors ?? []) {
      const id = actorKey.get(ucLabel(a, 40).toLowerCase());
      if (id) lines.push(`  ${id} --- ${ucId.get(u.code)}`);
    }
  for (const r of rels) {
    const from = ucId.get(r.from);
    const to = ucId.get(r.to);
    if (from && to) lines.push(`  ${from} -.->|"«${r.type}»"| ${to}`);
  }
  return lines.join("\n");
}

/** Kiểm tra nhanh cú pháp (không thay cho Mermaid thật): dòng đầu, khối subgraph/end, ngoặc nhãn. */
export function checkUcMermaid(code: string): string[] {
  const errs: string[] = [];
  const lines = String(code ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  if (!lines.length) return ["Diagram code is empty"];
  if (!/^(flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/.test(lines[0])) errs.push('The first line must be "flowchart LR" (or TB/TD/RL/BT)');
  let depth = 0;
  for (const l of lines.slice(1)) {
    if (/^subgraph\b/.test(l)) depth++;
    if (l === "end") depth--;
    if (depth < 0) errs.push('Extra "end"');
    if ((l.match(/"/g) ?? []).length % 2) errs.push(`Missing double quote: ${l}`);
  }
  if (depth > 0) errs.push('Missing "end" for subgraph block');
  return errs;
}
