"""Mô phỏng thời gian thao tác (KLM) khi dựng lại màn test bằng tính năng gợi ý bố cục, và độ chính xác theo từng loại phần tử.

Hằng số KLM lấy đúng như thang đo Edit của Li et al. 2020 (scripts/paper/vanilla.py):
  M (suy nghĩ) = 1,35 s · P (trỏ chuột) = 1,1 s · B (nhấn/nhả nút) = 0,1 s
  chèn tay một phần tử = M + 3P + 4B = 5,05 s  (bằng chi phí "insert" của Edit)
Cách tính mỗi thao tác khi có gợi ý là THIẾT KẾ MÔ PHỎNG CỦA NHÓM (bài báo không mô phỏng giao diện):
  chấp nhận khung mờ (loại đúng top-1, nhấn Tab)       = M + 2B       = 1,55 s
  chọn loại khác trong top-3 rồi chấp nhận            = M + P + 4B   = 2,85 s
  gợi ý sai (không có trong top-3): bỏ qua (Esc) + chèn tay = 2B + 5,05 = 5,25 s
Ba cách dựng phần còn thiếu của một cây test, bắt đầu từ cây dở BFS/DFS 10/50/80% (như thang đo của bài báo):
  (a) tay: chèn từng phần tử còn thiếu – 5,05 s × số phần tử;
  (b) từng bước: theo thứ tự BFS/DFS, mỗi phần tử kế tiếp được gợi ý trong đúng container cha (người dùng đang chọn container đó),
      phần tử luôn được đặt về đúng loại/vị trí thật trước bước sau (người dùng sửa nếu sai);
  (c) "Hoàn thành bố cục": M (xem lại) + Edit (KLM) từ cây mô hình sinh tới cây đúng – đúng thang đo Edit của bài báo (nới lỏng: chỉ loại).
Độ chính xác theo loại: ở chế độ (b), loại thật của phần tử kế tiếp có là top-1 / nằm trong top-3 hay không (container đã biết).
Dùng: python3 scripts/paper/klm_sim.py [--data=data/paper-w7c20-r400] [--model=backend/model/recursive-layout.pt] [--out=klm-sim.json]
"""
import json, os, sys, time
from collections import defaultdict
import torch
sys.path.insert(0, os.path.dirname(__file__))
import tree_decoders as T  # noqa: E402
import vanilla as V  # noqa: E402
from coords_experiment import load  # noqa: E402

M, P, B = 1.35, 1.1, 0.1
INSERT = M + 3 * P + 4 * B
ACCEPT, PICK, MISS = M + 2 * B, M + P + 4 * B, 2 * B + INSERT
TYPES = ["Page", "Header", "Sidebar", "Section", "Card", "Row", "Column", "Form", "List", "Modal", "Heading", "Text", "Button", "Link", "Input",
         "Textarea", "Select", "Checkbox", "Radio", "DatePicker", "Table", "Image", "Badge", "Alert", "Stat", "Avatar", "Divider", "Pagination"]
arg = lambda k, d: next((a.split("=", 1)[1] for a in sys.argv if a.startswith(f"--{k}=")), d)


@torch.no_grad()
def top3_for(model, tree, parent):
    """Một bước giải mã cho container `parent` (object trong `tree`): top-3 loại không gồm EOS (như nextInContainer)."""
    path = []

    def find(n):
        path.append(n)
        if n is parent:
            return True
        for c in T.kids(n):
            if find(c):
                return True
        path.pop()
        return False

    find(tree)
    anc, own = [model.canvas[0, 0]], None
    for i, n in enumerate(path):
        given = T.kids(n)[: model.max_len - 1]
        seq = [T.tok_of(n)] + [T.tok_of(c) for c in given]
        mem = torch.stack(anc + ([own] if own is not None else [])).unsqueeze(0)
        mp = torch.zeros(1, mem.shape[1], dtype=torch.bool)
        h, o = model.run(torch.tensor([seq]), torch.zeros(1, len(seq), dtype=torch.bool), mem, mp)
        if i == len(path) - 1:
            lc = o["c"][0, -1].clone()
            lc[T.N_TYPES + 1] = -1e9
            return lc[: T.N_TYPES].topk(3).indices.tolist()
        j = given.index(path[i + 1])
        anc, own = anc + [own if own is not None else h[0, 0]], h[0, j + 1]


def strip(t):
    m = {"c": t["c"], "t": t["t"], "b": list(t["b"])}
    if T.kids(t):
        m["k"] = [strip(c) for c in T.kids(t)]
    return m


def simulate(model, recs):
    res, by_type = {}, defaultdict(lambda: {"n": 0, "top1": 0, "top3": 0})
    for order in ("bfs", "dfs"):
        for f in (0.1, 0.5, 0.8):
            acc = {"trees": 0, "nodes": 0, "manual": 0.0, "step": 0.0, "complete": 0.0, "top1": 0, "top3": 0}
            for r in recs:
                gold = r["tree"]
                nodes = T.order_nodes(gold, order)
                k = V.partial_size(len(nodes), f)
                if k >= len(nodes):
                    continue
                acc["trees"] += 1
                rest = len(nodes) - k
                acc["nodes"] += rest
                acc["manual"] += INSERT * rest
                # (c) hoàn thành bố cục rồi sửa
                part = T.prefix_tree(gold, k, order)
                pred = T.strip_meta(T.recursive_complete(model, part))
                acc["complete"] += M + V.ted(pred, gold, False)
                # (b) từng bước: dựng lại theo thứ tự, phần tử kế tiếp luôn là con cuối mới của cha nó (tính chất cây tiền tố)
                cur = T.prefix_tree(gold, k, order)
                for i in range(k, len(nodes)):
                    target = nodes[i]
                    # tìm cha của target trong cây đang dựng: cùng đường đi chỉ số như cây đúng
                    gp = parent_path(gold, target)
                    p = cur
                    for j in gp:
                        p = T.kids(p)[j]
                    top3 = top3_for(model, cur, p)
                    hit1, hit3 = target["c"] == top3[0], target["c"] in top3
                    acc["step"] += ACCEPT if hit1 else PICK if hit3 else MISS
                    acc["top1"] += hit1
                    acc["top3"] += hit3
                    bt = by_type[TYPES[target["c"]]]
                    bt["n"] += 1
                    bt["top1"] += hit1
                    bt["top3"] += hit3
                    p.setdefault("k", []).append({"c": target["c"], "t": target["t"], "b": list(target["b"])})
            n = max(acc["nodes"], 1)
            res[f"{order.upper()} {int(f * 100)}%"] = {
                "trees": acc["trees"], "nodes": acc["nodes"],
                "manual_s": round(acc["manual"], 1), "step_s": round(acc["step"], 1), "complete_s": round(acc["complete"], 1),
                "step_saving_pct": round(100 * (1 - acc["step"] / max(acc["manual"], 1e-9)), 1),
                "complete_saving_pct": round(100 * (1 - acc["complete"] / max(acc["manual"], 1e-9)), 1),
                "top1_pct": round(100 * acc["top1"] / n, 1), "top3_pct": round(100 * acc["top3"] / n, 1)}
    types = {t: {"n": v["n"], "top1_pct": round(100 * v["top1"] / v["n"], 1), "top3_pct": round(100 * v["top3"] / v["n"], 1)} for t, v in sorted(by_type.items(), key=lambda x: -x[1]["n"])}
    return res, types


def parent_path(tree, target):
    """Đường chỉ số từ gốc tới CHA của target."""
    def rec(n, path):
        for j, c in enumerate(T.kids(n)):
            if c is target:
                return path
            r = rec(c, path + [j])
            if r is not None:
                return r
        return None
    return rec(tree, [])


def main():
    torch.set_num_threads(int(arg("threads", str(os.cpu_count() or 4))))
    data = arg("data", "data/paper-w7c20-r400")
    info = json.load(open("dataset/export/eval/recursive-faithful.json"))
    d, L = info["chosen"]["d"], info["chosen"]["layers"]
    model = T.Recursive(d, L, use_pos=False)
    model.load_state_dict(torch.load(arg("model", "backend/model/recursive-layout.pt")))
    model.eval()
    test = load(f"{data}/test.jsonl")[: int(arg("limit", "100000"))]
    old = [r for r in test if int(r["rootId"][1:]) <= 200]
    t0 = time.time()
    out = {"data": data, "model": {"d": d, "layers": L}, "constants_s": {"M": M, "P": P, "B": B, "insert": INSERT, "accept": ACCEPT, "pick_top3": PICK, "miss": MISS}}
    out["test_all"], out["by_type_all"] = simulate(model, test)
    out["test_old_roots"], out["by_type_old_roots"] = simulate(model, old)
    out["n_trees"] = {"all": len(test), "old_roots": len(old)}
    out["seconds"] = round(time.time() - t0, 1)
    o = arg("out", "klm-sim.json")
    json.dump(out, open(o if o.startswith("/") else f"dataset/export/eval/{o}", "w"), ensure_ascii=False, indent=1)
    for k in ("test_all", "test_old_roots"):
        print(k)
        for s, v in out[k].items():
            print(f"  {s}: tay {v['manual_s']}s · từng bước {v['step_s']}s ({v['step_saving_pct']}%) · hoàn thành {v['complete_s']}s ({v['complete_saving_pct']}%) · top1 {v['top1_pct']} top3 {v['top3_pct']}")
    print(json.dumps(out["by_type_all"], ensure_ascii=False))


if __name__ == "__main__":
    main()
