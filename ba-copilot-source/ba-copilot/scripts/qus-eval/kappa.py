"""Cohen's kappa giữa nhãn AI (labels.jsonl) và nhãn người (kappa-sample.csv đã điền 1 = vi phạm, để trống/0 = không).
Dùng: python3 scripts/qus-eval/kappa.py dataset/qus-eval/kappa-sample.csv"""
import csv, json, sys
L = {json.loads(l)["id"]: json.loads(l)["defects"] for l in open("dataset/qus-eval/labels.jsonl")}
rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")))
def kappa(a, b):
    n = len(a); po = sum(x == y for x, y in zip(a, b)) / n
    pa, pb = sum(a) / n, sum(b) / n; pe = pa * pb + (1 - pa) * (1 - pb)
    return po, (po - pe) / (1 - pe) if pe < 1 else 1.0
allA, allB = [], []
for c in ["well-formed", "atomic", "minimal", "uniform", "unique"]:
    a = [int(L[r["id"]][c]) for r in rows]; b = [int((r[c] or "0").strip() in ("1", "x", "X", "y")) for r in rows]
    allA += a; allB += b; po, k = kappa(a, b); print(f"{c:12} đồng ý {po:.0%}  kappa {k:.2f}")
po, k = kappa(allA, allB); print(f"{'tổng':12} đồng ý {po:.0%}  kappa {k:.2f}")
