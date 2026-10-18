// Chạy thử tab "Gợi ý" trên một mẫu của bộ dữ liệu: tạo dự án/module/màn trong DB, nạp partialTree của mẫu làm phiên bản
// hiện tại, rồi gọi đúng service mà tab Gợi ý dùng (svc.screenSuggestions) và so với đáp án acceptedPatch.
// Dùng: NEXT_TF_FILE=model/next-transformer.json DB_FILE=data/demo-suggest.db npx tsx scripts/dataset/demo-suggest.ts --sample R041-09
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../../server/db.ts";
import * as repo from "../../server/repo.ts";
import * as svc from "../../server/service.ts";
import type { UINode } from "../../shared/design.ts";
import type { Sample } from "./build-samples.ts";

const root = join(import.meta.dirname, "..", "..");
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};
const id = arg("--sample", "R041-09");
const line = readFileSync(join(root, "data", "dataset", "samples.jsonl"), "utf8").split("\n").find((l) => l.includes(`"id":"${id}"`));
if (!line) throw new Error(`không thấy mẫu ${id}`);
const s = JSON.parse(line) as Sample;

openDb(process.env.DB_FILE ?? join(root, "data", "demo-suggest.db"));
const p = repo.createProject("Chạy thử gợi ý (bộ dữ liệu bổ sung UI)", `Mẫu ${s.id} – tập ${s.split}`);
const m = repo.createModule(p.id, s.requirement.title, `${s.requirement.description}\nQuyền: ${s.requirement.permissions.join("; ")}`);
const sc = repo.createScreen(m.id, s.requirement.title);
repo.addVersion(sc.id, { kind: "generate", prompt: `Mẫu ${s.id} (partialTree)`, tree: s.partialTree });

const label = (n: UINode) => `${n.type}${n.props.label ?? n.props.text ? ` "${String(n.props.label ?? n.props.text)}"` : ""}`;
const res = svc.screenSuggestions(sc.id, []);
console.log(`Mẫu ${s.id} (${s.split}, ${s.kind}) – ${s.requirement.title}`);
console.log(`Đáp án: ${s.acceptedPatch.map((x) => `${label((x as { node: UINode }).node)} → ${(x as { parentId: string }).parentId}[${(x as { index: number }).index}]`).join("; ") || "không thiếu"}`);
console.log(`Mô hình: ${JSON.stringify(res.model)}`);
for (const g of res.suggestions) console.log(`- [${g.kind}] ${g.title} (độ tin cậy ${g.confidence.toFixed(2)})\n    prompt: ${g.fixPrompt}`);
console.log(`\nMở: http://localhost:${process.env.PORT ?? 3000}/#/m/${m.id}/design`);
console.log(JSON.stringify({ moduleId: m.id, screenId: sc.id }));
