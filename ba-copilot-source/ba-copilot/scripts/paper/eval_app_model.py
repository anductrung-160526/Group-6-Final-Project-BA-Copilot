"""Chấm mô hình gợi ý bố cục ĐANG DÙNG TRONG APP theo đúng 3 bảng của Li et al. 2020:
Table 1 (BFS), Table 2 (DFS), Table 3 (BFS, thứ tự anh em xáo ngẫu nhiên). Thang đo chặt: F1 cặp cha–con, Next, Edit (giây KLM).
Trọng số: <data>/models/final.pt (cùng trọng số với model/recursive-layout.json – xuất bằng export_recursive.py).
Dùng: python3 scripts/paper/eval_app_model.py --data data/sn80-G2-w7-r800-aug2 [--out dataset/export/eval/transformer/app-model.json]
"""
import argparse, json, os, sys, time
ap = argparse.ArgumentParser()
ap.add_argument("--data", default="data/sn80-G2-w7-r800-aug2")
ap.add_argument("--weights")
ap.add_argument("--out", default="dataset/export/eval/transformer/app-model.json")
ap.add_argument("--threads", type=int, default=4)
a = ap.parse_args()
stats = json.load(open(os.path.join(a.data, "stats.json"), encoding="utf8"))
os.environ["PAPER_GX"], os.environ["PAPER_GY"] = str(stats.get("gx", 128)), str(stats.get("gy", 256))
sys.path.insert(0, os.path.dirname(__file__))
import torch  # noqa: E402
import vanilla as V  # noqa: E402
import tree_decoders as T  # noqa: E402

torch.set_num_threads(a.threads)
ck = torch.load(a.weights or os.path.join(a.data, "models", "final.pt"))
m = T.Recursive(ck["d"], ck["layers"], use_pos=False)
m.load_state_dict(ck["state"])
m.eval()
test = T.load(os.path.join(a.data, "test.jsonl"))
trees = [r["tree"] for r in test]
complete = lambda t, part, k, order: T.recursive_complete(m, part, constrain=False)
cell = (1280 / V.GX, stats.get("cellY", 20))
t0 = time.time()
res = {"data": a.data, "model": {"d": ck["d"], "layers": ck["layers"], "grid": {"gx": V.GX, "gy": V.GY, "cell_y": stats.get("cellY")}},
       "n_test_trees": len(trees), "n_test_roots": len({r["rootId"] for r in test}),
       "table1_2": T.evaluate(complete, trees, ("bfs", "dfs"), cell=cell),
       "table3": T.evaluate(complete, trees, ("bfs",), shuffle_seed=0, cell=cell)}
res["seconds"] = round(time.time() - t0, 1)
os.makedirs(os.path.dirname(a.out), exist_ok=True)
json.dump(res, open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
for tb in ("table1_2", "table3"):
    for s, v in res[tb].items():
        print(tb, s, "F1", v["f1_strict"], "Next", v["next_strict"], "Edit", v["edit_strict"])
