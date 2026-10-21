"""Độ đồng thuận giữa nhiều bộ nhãn QUS: Cohen's kappa từng cặp theo tiêu chí, Fleiss' kappa, nhãn đa số.
Dùng: python3 scripts/qus-eval/agreement.py <ra-nhãn-đa-số.jsonl> tên1=file1.jsonl tên2=file2.jsonl ..."""
import json, sys, itertools
C = ["well-formed", "atomic", "minimal", "uniform", "unique"]
out = sys.argv[1]
sets = {kv.split("=", 1)[0]: {json.loads(l)["id"]: json.loads(l)["defects"] for l in open(kv.split("=", 1)[1]) if l.strip()} for kv in sys.argv[2:]}
ids = sorted(set.intersection(*[set(v) for v in sets.values()]))
print(f"{len(ids)} story chung giữa {len(sets)} bộ nhãn\n")
def cohen(a, b):
    n = len(a); po = sum(x == y for x, y in zip(a, b)) / n
    pa, pb = sum(a) / n, sum(b) / n; pe = pa * pb + (1 - pa) * (1 - pb)
    return (po - pe) / (1 - pe) if pe < 1 else 1.0
def fleiss(cols):  # cols: list of rating lists (mỗi người một list 0/1)
    n, m = len(cols[0]), len(cols)
    P = [(sum(c[i] for c in cols) ** 2 + (m - sum(c[i] for c in cols)) ** 2 - m) / (m * (m - 1)) for i in range(n)]
    p1 = sum(sum(c) for c in cols) / (n * m); pe = p1 ** 2 + (1 - p1) ** 2
    return (sum(P) / n - pe) / (1 - pe) if pe < 1 else 1.0
names = list(sets)
print("Số lỗi mỗi bộ nhãn: | " + " | ".join(f"{k}: " + ", ".join(f"{c} {sum(sets[k][i][c] for i in ids)}" for c in C) for k in names))
print("\n| Cặp | " + " | ".join(C) + " | gộp |\n|---|" + "---|" * (len(C) + 1))
for a, b in itertools.combinations(names, 2):
    row = [cohen([int(sets[a][i][c]) for i in ids], [int(sets[b][i][c]) for i in ids]) for c in C]
    allk = cohen([int(sets[a][i][c]) for i in ids for c in C], [int(sets[b][i][c]) for i in ids for c in C])
    print(f"| {a} – {b} | " + " | ".join(f"{k:.2f}" for k in row) + f" | {allk:.2f} |")
agents = [k for k in names if k.startswith("A")]
if len(agents) >= 2:
    print("\nFleiss' kappa giữa các agent: " + ", ".join(f"{c} {fleiss([[int(sets[k][i][c]) for i in ids] for k in agents]):.2f}" for c in C)
          + f", gộp {fleiss([[int(sets[k][i][c]) for i in ids for c in C] for k in agents]):.2f}")
    with open(out, "w") as f:
        for i in ids:
            f.write(json.dumps({"id": i, "defects": {c: sum(sets[k][i][c] for k in agents) * 2 > len(agents) for c in C}}) + "\n")
    print(f"Nhãn đa số của {len(agents)} agent → {out}")
