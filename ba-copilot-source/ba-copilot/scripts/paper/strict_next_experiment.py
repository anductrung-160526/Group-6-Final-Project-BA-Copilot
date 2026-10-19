"""Thí nghiệm tăng Next chặt (STRICT-NEXT.md) – một lần chạy = một tổ hợp lưới × độ rộng × mô hình.

Giữ đúng kiến trúc/quy trình bài báo (Li et al. 2020); các biến thể sau là NGOÀI BÀI BÁO, thiết kế của nhóm:
  G0/G1/G2: lưới 128×20 px / 64×40 px / 32×40 px (lưới thô hơn → bài toán dễ hơn, không so trực tiếp Next chặt giữa lưới;
            dùng Next ±1 ô và Next IoU ≥ 0.5 tính theo pixel để so),
  W0: train/val 7 độ rộng, test 1280 · W1: chỉ 1280 · W2: như W0 + nhúng độ rộng cộng vào canvas (chỉ Recursive),
  giải mã có ràng buộc (constrained_box: con nằm trong cha theo chiều ngang, x2 ≥ x, y2 ≥ y; không ràng buộc thứ tự anh em).
Chọn cấu hình (hidden × layers) theo val loss; chọn tổ hợp theo val (độ rộng 1280); test chấm một lần.

Chia dữ liệu 80/10/10 theo màn gốc (splitOf, phân tầng theo nhóm màn); test của 400 màn cũ cố định cho mọi biến thể.
Quy trình đúng nguyên tắc "chọn trên val, test chấm một lần ở bước cuối":
  1) huấn luyện + chấm VAL (1280 px):  --only G0W0,G1W0,...        (mỗi tổ hợp lưu trọng số vào <data>/models/)
  2) chấm TEST một lần cho các tổ hợp: --only ... --eval-only --eval-test
Dùng:
  python3 scripts/paper/strict_next_experiment.py --only G0W0,G1W0,G2W0 [--roots 400] [--kind recursive] [--seed 42] [--train-frac 1]
  python3 scripts/paper/strict_next_experiment.py --only G1W1 --eval-only --eval-test
  (chế độ cấp thấp: --data data/sn80-G1-w7 [--w2] --out ...json)
Tổ hợp: G0 = 128 ô × 20 px, G1 = 64 ô × 40 px, G2 = 32 ô × 40 px; W0 = 7 độ rộng (test 1280), W1 = chỉ 1280, W2 = W0 + nhúng độ rộng.
Dữ liệu: data/sn80-G<g>-w7[-r500], data/sn80-G<g>-w1[-r500] (dựng bằng scripts/paper/build-dataset.ts, xem STRICT-NEXT.md).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

GRIDS = {"G0": (128, 20, 256), "G1": (64, 40, 128), "G2": (32, 40, 128)}  # ô ngang, px/ô dọc, số ô dọc tối đa (cùng 5120 px)
EVAL_DIR = "dataset/export/eval/strict-next"

ap = argparse.ArgumentParser()
ap.add_argument("--only", help="danh sách tổ hợp, vd G0W0,G1W2 (W2 = nhúng độ rộng); thêm :pointer / :vanilla để đổi mô hình")
ap.add_argument("--roots", type=int, default=400, help="400 (mốc) hoặc 500 (thêm R401–R500)")
ap.add_argument("--eval-only", action="store_true", help="không huấn luyện: nạp trọng số đã lưu và chấm lại")
ap.add_argument("--eval-test", action="store_true", help="chấm TEST (và test-mới) – chỉ dùng ở bước cuối, một lần mỗi biến thể")
ap.add_argument("--data")
ap.add_argument("--kind", default="recursive", choices=["recursive", "pointer", "vanilla"])
ap.add_argument("--w2", action="store_true", help="nhúng độ rộng (ngoài bài báo)")
ap.add_argument("--grid", default="128,256:2,4")
ap.add_argument("--epochs", type=int, default=80)
ap.add_argument("--patience", type=int, default=8)
ap.add_argument("--lr", type=float, default=1e-3)
ap.add_argument("--seed", type=int, default=42)
ap.add_argument("--train-frac", type=float, default=1.0, help="tỷ lệ màn gốc train giữ lại (đường cong học)")
ap.add_argument("--threads", type=int, default=1)
ap.add_argument("--test-new", action="store_true", help="chấm thêm test-mới (test_new.jsonl, màn R401+)")
ap.add_argument("--out")
a = ap.parse_args()

if a.only:  # chế độ điều phối: chạy lần lượt từng tổ hợp bằng tiến trình con
    for combo in a.only.split(","):
        name, _, kind = combo.partition(":")
        kind = kind or a.kind
        g, w = name[:2], name[2:]
        data = f"data/sn80-{g}-{'w1' if w == 'W1' else 'w7'}" + ("-r500" if a.roots == 500 else "")
        tag = f"{name}-{kind}-r{a.roots}-s{a.seed}" + (f"-f{a.train_frac:g}" if a.train_frac < 1 else "")
        cmd = [sys.executable, __file__, "--data", data, "--kind", kind, "--grid", a.grid, "--seed", str(a.seed), "--threads", str(a.threads),
               "--train-frac", str(a.train_frac), "--out", f"{EVAL_DIR}/{tag}.json"] + (["--w2"] if w == "W2" else []) \
            + (["--eval-only"] if a.eval_only else []) + (["--eval-test", "--test-new"] if a.eval_test else [])
        print(">>", " ".join(cmd), flush=True)
        subprocess.run(cmd, check=True)
    sys.exit(0)
if not a.data or not a.out:
    ap.error("cần --only hoặc --data và --out")

stats = json.load(open(os.path.join(a.data, "stats.json"), encoding="utf8"))
os.environ["PAPER_GX"], os.environ["PAPER_GY"] = str(stats.get("gx", 128)), str(stats.get("gy", 256))
sys.path.insert(0, os.path.dirname(__file__))
import torch  # noqa: E402
import vanilla as V  # noqa: E402
import tree_decoders as T  # noqa: E402

torch.set_num_threads(a.threads)
WIDTHS = stats["widths"]
CELL = (1280 / V.GX, stats.get("cellY", 20))  # px mỗi ô ở độ rộng test 1280


def load(name):
    p = os.path.join(a.data, name)
    rows = T.load(p) if os.path.exists(p) else []
    for r in rows:
        r["tree"]["_w"] = WIDTHS.index(r["width"]) if r["width"] in WIDTHS else 0
    return rows


train, val, test, test_new = load("train.jsonl"), load("val.jsonl"), load("test.jsonl"), load("test_new.jsonl")
if a.train_frac < 1:
    roots = sorted({r["rootId"] for r in train}, key=lambda i: hashlib.sha1(i.encode()).hexdigest())
    keep = set(roots[: round(len(roots) * a.train_frac)])
    train = [r for r in train if r["rootId"] in keep]
val1280 = [r for r in val if r["width"] == 1280]
n_w = len(WIDTHS) if a.w2 else 0


def val_loss(m, rows):
    m.eval()
    with torch.no_grad():
        if a.kind == "vanilla":
            seqs = [V.linearize(r["tree"]) for r in rows]
            return sum(V.loss_fn(m, seqs[i:i + 64]).item() * len(seqs[i:i + 64]) for i in range(0, len(seqs), 64)) / len(seqs)
        items = [T.pointer_seq(r["tree"], o) for r in rows for o in ("bfs", "dfs")] if a.kind == "pointer" else [r["tree"] for r in rows]
        lf = T.pointer_loss if a.kind == "pointer" else T.recursive_loss
        return sum(lf(m, items[i:i + 64]).item() * len(items[i:i + 64]) for i in range(0, len(items), 64)) / len(items)


ds, ls = a.grid.split(":")
cands = []
t0 = time.time()
mpath = os.path.join(a.data, "models", os.path.basename(a.out).replace(".json", ".pt"))
prev = json.load(open(a.out, encoding="utf8")) if a.eval_only and os.path.exists(a.out) else None
if a.eval_only:  # nạp trọng số và kết quả chọn cấu hình đã có
    ck = torch.load(mpath)
    d, L = ck["d"], ck["layers"]
    if a.kind == "vanilla":
        m = V.Vanilla(d, L)
    elif a.kind == "pointer":
        m = T.Pointer(d, L)
    else:
        m = T.Recursive(d, L, n_widths=n_w)
    m.load_state_dict(ck["state"])
    m.eval()
    if n_w:
        m.test_w = WIDTHS.index(1280)
    cands = [dict(c, _m=None) for c in prev["candidates"]] if prev else [{"d": d, "layers": L}]
    ds, ls = "", ""
for d in (map(int, ds.split(",")) if ds else []):
    for L in (map(int, ls.split(",")) if ls else []):
        s = time.time()
        if a.kind == "vanilla":
            m, vl, hist = V.train_one(train, val, d, L, a.epochs, a.patience, a.lr, a.seed)
            m.eval()
        else:
            m, vl, hist = T.train_model(a.kind, train, val, d, L, a.epochs, a.patience, a.lr, a.seed, n_widths=n_w)
        if n_w:
            m.test_w = WIDTHS.index(1280)
        cands.append({"d": d, "layers": L, "val_loss": round(vl, 4), "val_loss_1280": round(val_loss(m, val1280), 4),
                      "epochs": len(hist), "minutes": round((time.time() - s) / 60, 1), "_m": m})
        print(a.data, a.kind, d, L, cands[-1]["val_loss"], cands[-1]["val_loss_1280"], flush=True)
if a.eval_only:
    best = dict(prev["chosen"], _m=m) if prev else {"d": d, "layers": L, "_m": m}
else:
    best = min(cands, key=lambda c: c["val_loss"])
    m = best["_m"]
    os.makedirs(os.path.dirname(mpath), exist_ok=True)
    torch.save({"d": best["d"], "layers": best["layers"], "state": m.state_dict()}, mpath)


def completer(constrain):
    if a.kind == "vanilla":
        return lambda t, part, k, order: T.vanilla_complete(m, t, k)
    if a.kind == "pointer":
        return lambda t, part, k, order: T.pointer_complete(m, part, order)
    return lambda t, part, k, order: T.recursive_complete(m, part, constrain=constrain)


orders = ("dfs",) if a.kind == "vanilla" else ("bfs", "dfs")
decodes = {"free": False, "constrained": True} if a.kind == "recursive" else {"free": False}
res = {"data": a.data, "kind": a.kind, "w2": a.w2, "seed": a.seed, "train_frac": a.train_frac, "grid": {"gx": V.GX, "gy": V.GY, "cell_px": CELL},
       "sizes": {"train": len(train), "train_roots": len({r["rootId"] for r in train}), "val": len(val), "val1280": len(val1280), "test": len(test), "test_new": len(test_new)},
       "candidates": [{k: v for k, v in c.items() if k != "_m"} for c in cands], "chosen": {k: v for k, v in best.items() if k != "_m"}, "eval": {}}
for name, con in decodes.items():
    ev = (prev or {}).get("eval", {}).get(name) or {}
    if "val1280" not in ev:
        ev["val1280"] = T.evaluate(completer(con), [r["tree"] for r in val1280], orders, cell=CELL)
    if a.eval_test:  # chỉ ở bước cuối
        ev["test"] = T.evaluate(completer(con), [r["tree"] for r in test], orders, cell=CELL)
        if a.test_new and test_new:
            ev["test_new"] = T.evaluate(completer(con), [r["tree"] for r in test_new], orders, cell=CELL)
    res["eval"][name] = ev
res["minutes"] = round((time.time() - t0) / 60, 1)
os.makedirs(os.path.dirname(a.out), exist_ok=True)
json.dump(res, open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print("done", a.out, res["minutes"], "min", flush=True)
