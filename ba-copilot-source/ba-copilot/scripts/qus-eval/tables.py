"""In kết quả một cấu hình theo đúng dạng Bảng 4 và Bảng 5 của Lucassen et al. 2016.
Dùng: python3 scripts/qus-eval/tables.py <kết-quả.json> "<tên cấu hình trong results>" """
import json, sys
d = json.load(open(sys.argv[1])); r = next(x for x in d["results"] if x["name"] == sys.argv[2])
f = lambda x: "–" if x is None else f"{x:.1f}"
print(f"Table 4  Overall recall and precision of {r['name']}, computed using both the micro- and the macro-average of the data sets\n")
print("| | Recall (%) | Precision (%) |\n|---|---|---|")
print(f"| Macro | {f(r['macro']['recall'])} | {f(r['macro']['precision'])} |")
print(f"| Micro | {f(r['micro']['recall'])} | {f(r['micro']['precision'])} |\n")
print(f"Table 5  Number of defects, false positives, false negatives, recall, and precision per quality criterion\n")
print(f"| n = {d['nStories']} | # Def | # FP | # FN | Rec (%) | Prec (%) |\n|---|---|---|---|---|---|")
for c, k in r["perCriterion"].items():
    print(f"| {c.capitalize()} | {k['def']} | {k['fp']} | {k['fn']} | {f(k['recall'])} | {f(k['precision'])} |")
m = r["micro"]; print(f"| SUM | {m['def']} | {m['fp']} | {m['fn']} | {f(m['recall'])} | {f(m['precision'])} |")
