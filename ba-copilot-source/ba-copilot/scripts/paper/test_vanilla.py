"""Kiểm thử các hàm nền của scripts/paper/vanilla.py. Chạy: python3 scripts/paper/test_vanilla.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from vanilla import OPEN, linearize, pair_prf, parse, prefix_tokens, prefix_tree, preorder, ted, KLM  # noqa: E402

leaf = lambda c, b=(0, 0, 1, 1): {"c": c, "t": 1, "b": list(b)}
tree = {"c": 0, "t": 0, "b": [0, 0, 127, 80], "k": [
    leaf(10), {"c": 7, "t": 0, "b": [0, 5, 60, 40], "k": [{"c": 5, "t": 0, "b": [0, 5, 60, 10], "k": [leaf(14), leaf(12)]}]}, leaf(27)]}


def strip(t):
    return json.dumps(t, sort_keys=True)


# 1. cây ↔ chuỗi: khôi phục đúng, cha 1 con (Form → Row) không có ngoặc
seq = linearize(tree)
assert strip(parse(seq)) == strip(tree), "khôi phục cây"
form_i = next(i for i, s in enumerate(seq) if s[0] == 7)
assert seq[form_i + 1][0] != OPEN, "cha 1 con không có ngoặc"
assert sum(1 for s in seq if s[0] == OPEN) == 2, "ngoặc cho Page và Row"
# mọi cây trong dữ liệu thật đều khôi phục được
for split in ("train", "val", "test"):
    p = f"data/paper/{split}.jsonl"
    if os.path.exists(p):
        for l in open(p, encoding="utf8"):
            t = json.loads(l)["tree"]
            assert strip(parse(linearize(t))) == strip(t), f"khôi phục {split}"

# 2. tiền tố DFS: k node đầu tiên theo tiền thứ tự
for k in range(1, len(preorder(tree)) + 1):
    pt = prefix_tree(tree, k)
    assert [n["c"] for n in preorder(pt)] == [n["c"] for n in preorder(tree)[:k]]
    assert sum(1 for s in prefix_tokens(tree, k) if s[0] < 28) == k
    assert strip(parse(prefix_tokens(tree, k))) == strip(pt), f"tiền tố {k} khôi phục đúng cây dở"

# 3. Zhang–Shasha: cây trùng = 0; thiếu 1 lá = 1 lần chèn; thừa 1 lá = 1 lần xóa; sai loại = 1 lần đổi
assert ted(tree, tree, True) == 0
small = prefix_tree(tree, len(preorder(tree)) - 1)  # bỏ Pagination
assert abs(ted(small, tree, False) - KLM["insert"]) < 1e-9
assert abs(ted(tree, small, False) - KLM["delete"]) < 1e-9
wrong = json.loads(strip(tree)); wrong["k"][0]["c"] = 11
assert abs(ted(wrong, tree, False) - KLM["relabel"]) < 1e-9
moved = json.loads(strip(tree)); moved["k"][0]["b"] = [5, 5, 9, 9]
assert ted(moved, tree, False) == 0 and abs(ted(moved, tree, True) - KLM["relabel"]) < 1e-9

# 4. pair F1
assert pair_prf(tree, tree, True) == (1.0, 1.0, 1.0)
p, r, f = pair_prf(small, tree, False)
assert p == 1.0 and abs(r - 5 / 6) < 1e-9
print("OK – 4 nhóm kiểm thử đều qua")
