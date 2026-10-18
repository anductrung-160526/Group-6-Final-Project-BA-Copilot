"""Thí nghiệm nâng chất lượng tọa độ cho Recursive Transformer (Li et al. 2020, mục 4.4) trước khi đưa vào app.

Biến thể (đều là Recursive d=128, 2 lớp; chỉ dữ liệu UI web của nhóm, không WebSight):
  V0  3 độ rộng, ô dọc 10 px, không làm mềm nhãn          (mô hình đã có, data/paper/recursive.pt)
  V1  7 độ rộng (768–1920 px), ô dọc 10 px, không làm mềm  (tác dụng của thêm dữ liệu)
  V2  7 độ rộng, ô dọc 10 px, làm mềm nhãn tọa độ σ = 1 ô
  V3  7 độ rộng, ô dọc 20 px, làm mềm nhãn tọa độ σ = 1 ô
  V4  như V3 + xáo trộn thứ tự anh em khi huấn luyện (Table 3 của bài báo: "random spatial ordering")
Mỗi biến thể chấm 2 cách giải mã: tự do (đúng bài báo) và có ràng buộc tọa độ (constrained_box).

Thước đo (val và test chỉ dùng độ rộng 1280 px):
  - Next (cây dở BFS/DFS 10/50/80%, cùng quy tắc cắt với eval-transformer.ts) – node mới đầu tiên so với node kế tiếp thật:
      loại đúng · CHẶT (loại + 4 tọa độ khớp tuyệt đối, như bài báo) · ±1 ô (loại đúng, 4 tọa độ lệch ≤ 1 ô) · IoU ≥ 0,5 (loại đúng,
      khung giao/hợp ≥ 0,5 tính theo pixel nên so được giữa các cỡ ô).
  - Pair F1 chặt và Edit chặt (bài báo).
  - Chèn đúng chỗ: bỏ 1 node có anh em, chạy Recursive, lấy phần tử mới đầu tiên trong đúng container đó, xếp các con theo thứ tự đọc
    (y rồi x) để suy ra khe chèn → % đúng khe, % đúng loại, % đúng cả hai; tách riêng trường hợp thiếu ở GIỮA.
Bản "spatial": sắp con của cây dự đoán theo khung bao trước khi chấm Next/F1/Edit (cần cho V4 vì thứ tự sinh là tùy ý).
Chọn biến thể theo val (trung bình "đúng cả hai" khi chèn và IoU ≥ 0,5 của Next), báo cáo test.
Dùng: python3 scripts/paper/coords_experiment.py [--eval-only] [--only=V4]   (--eval-only: chấm lại từ trọng số đã lưu)
"""
import json
import os
import sys
import time

import torch

sys.path.insert(0, os.path.dirname(__file__))
import tree_decoders as T  # noqa: E402
import vanilla as V  # noqa: E402

GX = T.GX


def kids(n):
    return n.get("k") or []


def iou(a, b, cx, cy):
    ax1, ay1, ax2, ay2 = a[0] * cx, a[1] * cy, (a[2] + 1) * cx, (a[3] + 1) * cy
    bx1, by1, bx2, by2 = b[0] * cx, b[1] * cy, (b[2] + 1) * cx, (b[3] + 1) * cy
    iw, ih = max(0, min(ax2, bx2) - max(ax1, bx1)), max(0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union else 0.0


def spatial_sort(t):
    """Sắp các con theo thứ tự đọc của khung bao (y rồi x) – vị trí do tọa độ quyết định như bài báo."""
    if kids(t):
        t["k"] = sorted([spatial_sort(c) for c in kids(t)], key=lambda c: (c["b"][1], c["b"][0]))
    return t


def next_metrics(model, recs, constrain, fracs=(0.1, 0.5, 0.8), spatial=False):
    acc = {k: 0.0 for k in ["n", "type", "strict", "tol1", "iou50", "f1_strict", "edit_strict"]}
    for r in recs:
        t, cx, cy = r["tree"], r["width"] / GX, r["cellY"]
        for order in ("bfs", "dfs"):
            for f in fracs:
                nodes = T.order_nodes(t, order)
                k = V.partial_size(len(nodes), f)
                target = nodes[k]
                part = T.prefix_tree(t, k, order)
                pred = T.recursive_complete(model, part, constrain=constrain)
                if spatial:
                    pred = spatial_sort(pred)
                new = [n for n in T.order_nodes(pred, order) if n.get("_new")]
                acc["n"] += 1
                if new:
                    x = new[0]
                    same = x["c"] == target["c"]
                    acc["type"] += same
                    acc["strict"] += same and x["b"] == target["b"]
                    acc["tol1"] += same and all(abs(p - q) <= 1 for p, q in zip(x["b"], target["b"]))
                    acc["iou50"] += same and iou(x["b"], target["b"], cx, cy) >= 0.5
                p = T.strip_meta(pred)
                acc["f1_strict"] += V.pair_prf(p, t, True)[2]
                acc["edit_strict"] += V.ted(p, t, True)
    n = max(acc["n"], 1)
    return {k: (int(v) if k == "n" else round(v / n, 2) if k.startswith("edit") else round(100 * v / n, 1)) for k, v in acc.items()}


def insertion_metrics(model, recs, constrain):
    acc = {k: 0 for k in ["n", "pos", "type", "both", "mid_n", "mid_pos", "mid_type", "mid_both", "no_pred"]}
    for r in recs:
        t = r["tree"]

        def visit(n, path):
            ch = kids(n)
            for i, c in enumerate(ch):
                if len(ch) >= 2:
                    yield path, i
                yield from visit(c, path + [i])

        for path, idx in list(visit(t, [])):
            part = json.loads(json.dumps(T.strip_meta(t)))
            parent = part
            for j in path:
                parent = parent["k"][j]
            removed = parent["k"].pop(idx)
            if not parent["k"]:
                parent.pop("k")
            pred = T.recursive_complete(model, part, constrain=constrain)
            pp = pred
            for j in path:
                pp = pp["k"][j]
            new = [c for c in kids(pp) if c.get("_new")]
            mid = idx < len(kids(parent))  # còn anh em phía sau → thiếu ở giữa
            acc["n"] += 1
            acc["mid_n"] += mid
            if not new:
                acc["no_pred"] += 1
                continue
            x = new[0]
            order = sorted([c for c in kids(pp) if not c.get("_new")] + [x], key=lambda c: (c["b"][1], c["b"][0]))
            pos_ok = order.index(x) == idx
            type_ok = x["c"] == removed["c"]
            acc["pos"] += pos_ok
            acc["type"] += type_ok
            acc["both"] += pos_ok and type_ok
            if mid:
                acc["mid_pos"] += pos_ok
                acc["mid_type"] += type_ok
                acc["mid_both"] += pos_ok and type_ok
    out = {"n": acc["n"], "mid_n": acc["mid_n"]}
    for k in ("pos", "type", "both", "no_pred"):
        out[k] = round(100 * acc[k] / max(acc["n"], 1), 1)
    for k in ("pos", "type", "both"):
        out["mid_" + k] = round(100 * acc["mid_" + k] / max(acc["mid_n"], 1), 1)
    return out


def load(p):
    return [json.loads(l) for l in open(p, encoding="utf8") if l.strip()]


def main():
    torch.set_num_threads(os.cpu_count() or 4)
    variants = [
        ("V0", "data/paper", 0.0, "data/paper/recursive.pt"),
        ("V1", "data/paper-w7c10", 0.0, None),
        ("V2", "data/paper-w7c10", 1.0, None),
        ("V3", "data/paper-w7c20", 1.0, None),
        ("V4", "data/paper-w7c20", 1.0, None),
    ]
    only = next((a.split("=")[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
    report = {}
    old = "dataset/export/eval/coords-experiment.json"
    report_old = json.load(open(old)) if os.path.exists(old) else {}
    for name, d, sigma, weights in variants:
        shuffle = name == "V4"
        if only and name not in only:
            if name in report_old:
                report[name] = report_old[name]
            continue
        train, val, test = (load(f"{d}/{s}.jsonl") for s in ("train", "val", "test"))
        val1280 = [r for r in val if r["width"] == 1280]
        for r in train + val + test:
            r.setdefault("cellY", 10)
        t0 = time.time()
        if not weights and "--eval-only" in sys.argv:
            weights = f"{d}/recursive-s{sigma:g}{'-shuffle' if shuffle else ''}.pt"
        if weights:
            m = T.Recursive(128, 2)
            m.load_state_dict(torch.load(weights))
            m.eval()
            vl, epochs = report_old.get(name, {}).get("val_loss"), report_old.get(name, {}).get("epochs")
        else:
            m, vl, hist = T.train_model("recursive", train, val, 128, 2, 80, 8, 1e-3, 42, sigma=sigma, shuffle=shuffle)
            epochs = len(hist)
            torch.save(m.state_dict(), f"{d}/recursive-s{sigma:g}{'-shuffle' if shuffle else ''}.pt")
        rep = {"data": d, "sigma": sigma, "shuffle": shuffle, "train_trees": len(train), "val_loss": vl, "epochs": epochs, "train_seconds": round(time.time() - t0, 1)}
        for constrain in (False, True):
            tag = "constrained" if constrain else "free"
            rep[tag] = {s: {"next": next_metrics(m, recs, constrain), "next_spatial": next_metrics(m, recs, constrain, spatial=True),
                            "insert": insertion_metrics(m, recs, constrain)} for s, recs in (("val", val1280), ("test", test))}
            v = rep[tag]["val"]
            print(f"{name} {tag}: val insert both {v['insert']['both']} · next IoU50 {v['next']['iou50']} · strict {v['next']['strict']}", flush=True)
        report[name] = rep
        json.dump(report, open("dataset/export/eval/coords-experiment.json", "w"), ensure_ascii=False, indent=1)
    score = lambda r: (r["val"]["insert"]["both"] + r["val"]["next"]["iou50"]) / 2
    best = max(((n, tag) for n in report for tag in ("free", "constrained")), key=lambda x: score(report[x[0]][x[1]]))
    report["_chosen"] = {"variant": best[0], "decoding": best[1], "val_score": round(score(report[best[0]][best[1]]), 2)}
    json.dump(report, open("dataset/export/eval/coords-experiment.json", "w"), ensure_ascii=False, indent=1)
    print("chọn", report["_chosen"])


if __name__ == "__main__":
    main()
