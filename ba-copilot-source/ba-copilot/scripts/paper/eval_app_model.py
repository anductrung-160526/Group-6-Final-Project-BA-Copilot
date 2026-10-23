"""Chấm mô hình gợi ý bố cục ĐANG DÙNG TRONG APP (Recursive) – hoặc mô hình tham chiếu Pointer / Vanilla huấn luyện trên cùng dữ liệu
(--kind, --weights) – theo đúng 3 bảng của Li et al. 2020:
Table 1 (BFS), Table 2 (DFS), Table 3 (BFS, thứ tự anh em xáo ngẫu nhiên). Thang đo chặt: F1 cặp cha–con, Next, Edit (giây KLM).
Trọng số: <data>/models/final.pt (cùng trọng số với backend/model/recursive-layout.json – xuất bằng export_recursive.py).
Vanilla chỉ có DFS (như bài báo); Table 3 chỉ chấm Recursive và Pointer.
Dùng: python3 scripts/paper/eval_app_model.py --data data/sn80-G2-w7-r800-aug2 [--kind recursive|pointer|vanilla] [--weights …pt] [--out …json]
"""
import argparse, json, os, sys, time
ap = argparse.ArgumentParser()
ap.add_argument("--data", default="data/sn80-G2-w7-r800-aug2")
ap.add_argument("--weights")
ap.add_argument("--kind", default="recursive", choices=["recursive", "pointer", "vanilla"])
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
m = {"recursive": lambda: T.Recursive(ck["d"], ck["layers"], use_pos=False), "pointer": lambda: T.Pointer(ck["d"], ck["layers"], use_pos=False),
     "vanilla": lambda: V.Vanilla(ck["d"], ck["layers"])}[a.kind]()
m.load_state_dict(ck["state"])
m.eval()
test = T.load(os.path.join(a.data, "test.jsonl"))
trees = [r["tree"] for r in test]
complete = {"recursive": lambda t, part, k, order: T.recursive_complete(m, part, constrain=False),
            "pointer": lambda t, part, k, order: T.pointer_complete(m, part, order),
            "vanilla": lambda t, part, k, order: T.vanilla_complete(m, t, k)}[a.kind]
cell = (1280 / V.GX, stats.get("cellY", 20))
t0 = time.time()
res = {"data": a.data, "kind": a.kind, "model": {"d": ck["d"], "layers": ck["layers"], "grid": {"gx": V.GX, "gy": V.GY, "cell_y": stats.get("cellY")}},
       "n_test_trees": len(trees), "n_test_roots": len({r["rootId"] for r in test}),
       "table1_2": T.evaluate(complete, trees, ("dfs",) if a.kind == "vanilla" else ("bfs", "dfs"), cell=cell)}
if a.kind != "vanilla":
    res["table3"] = T.evaluate(complete, trees, ("bfs",), shuffle_seed=0, cell=cell)
res["seconds"] = round(time.time() - t0, 1)
os.makedirs(os.path.dirname(a.out), exist_ok=True)
json.dump(res, open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
for tb in [k for k in ("table1_2", "table3") if k in res]:
    for s, v in res[tb].items():
        print(tb, s, "F1", v["f1_strict"], "Next", v["next_strict"], "Edit", v["edit_strict"])
