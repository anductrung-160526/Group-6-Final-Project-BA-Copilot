// Bộ gán nhãn CoreNLP cho thí nghiệm so sánh (scripts/qus-eval/eval.ts --tagger corenlp). Giữ nguyên toàn bộ luật AQUSA,
// chỉ thay bộ gán nhãn từ loại: wink-nlp (Universal POS) → Stanford CoreNLP 4.5.7 MaxentTagger english-left3words-distsim
// (Penn Treebank, quy đổi sang Universal POS). Bộ chấm gọi bộ gán nhãn đồng bộ trên các đoạn câu sinh ra lúc chạy, nên làm
// nhiều lượt: chạy → ghi lại chuỗi chưa có nhãn → gán nhãn cả lô bằng Java → chạy lại, đến khi không còn chuỗi thiếu.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nlpReady, setNlp } from "../../shared/aqusa.ts";

const BE = new Set(["be", "am", "is", "are", "was", "were", "been", "being", "'s", "'re", "'m"]);
// Penn Treebank → Universal POS (quy đổi của nhóm). Dạng của "be" và MD → AUX như wink-nlp; mọi VB* khác → VERB.
function upos(tag: string, word: string): string {
  if (tag.startsWith("VB")) return BE.has(word.toLowerCase()) ? "AUX" : "VERB";
  if (tag === "MD") return "AUX";
  if (tag === "NNP" || tag === "NNPS") return "PROPN";
  if (tag.startsWith("NN")) return "NOUN";
  if (tag.startsWith("JJ")) return "ADJ";
  if (tag.startsWith("RB") || tag === "WRB") return "ADV";
  if (tag === "PRP" || tag === "PRP$" || tag === "WP" || tag === "WP$") return "PRON";
  if (tag === "DT" || tag === "PDT" || tag === "WDT") return "DET";
  if (tag === "IN") return "ADP";
  if (tag === "CC") return "CCONJ";
  if (tag === "CD") return "NUM";
  if (tag === "TO" || tag === "RP") return "PART";
  if (tag === "UH") return "INTJ";
  if (/^[.,:;!?()"'`$#-]|^-[LR]RB-$/.test(tag)) return "PUNCT";
  return "X";
}

const unbracket = (w: string) => ({ "-LRB-": "(", "-RRB-": ")", "-LSB-": "[", "-RSB-": "]", "-LCB-": "{", "-RCB-": "}", "``": '"', "''": '"' } as Record<string, string>)[w] ?? w;

export function useCoreNLP(jars: string, runAll: () => void): { strings: number; passes: number } {
  if (!nlpReady()) throw new Error("cần nạp wink-nlp trước (shared/nlp-node.ts) cho lượt ghi chuỗi đầu tiên");
  const wink = (globalThis as { __aqusaWink?: unknown }).__aqusaWink;
  const cache = new Map<string, { w: string[]; p: string[] }>();
  const missing = new Set<string>();
  const its = { normal: "normal", pos: "pos" };
  const adapter = {
    its,
    readDoc(s: string) {
      const hit = cache.get(s);
      if (!hit) missing.add(s);
      const r = hit ?? { w: [] as string[], p: [] as string[] };
      return { tokens: () => ({ out: (k: string) => (k === "pos" ? r.p : r.w) }) };
    },
  };
  void wink;
  setNlp(adapter);
  const dir = dirname(fileURLToPath(import.meta.url));
  let passes = 0;
  for (;;) {
    missing.clear();
    runAll();
    passes++;
    if (!missing.size || passes > 8) break;
    const list = [...missing].map((s) => s.replace(/[\r\n]+/g, " "));
    const out = execFileSync("java", ["-cp", `${jars}:${join(dir, "corenlp", "classes")}`, "Tag"], { input: list.join("\n") + "\n", encoding: "utf8", maxBuffer: 1 << 28, stdio: ["pipe", "pipe", "ignore"] });
    out.trimEnd().split("\n").forEach((line, i) => {
      const [ws, ps] = line.split("\u0001");
      const w = (ws ? ws.split("\t") : []).map(unbracket);
      const p = (ps ? ps.split("\t") : []).map((t, k) => upos(t, w[k] ?? ""));
      cache.set([...missing][i], { w: w.map((x) => x.toLowerCase()), p });
    });
  }
  return { strings: cache.size, passes };
}
