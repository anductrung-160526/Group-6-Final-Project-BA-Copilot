"""Tái lập Vanilla Transformer Tree Decoder của Li et al. 2020 (arXiv:2001.05308, mục 4.1–4.2) trên cây UI web của nhóm.

Dữ liệu: data/paper/{train,val,test}.jsonl do scripts/paper/build-dataset.ts tạo (chỉ dataset/roots, không WebSight).
Mỗi node: c (loại), t (lá?), b = [x, y, x2, y2] trên lưới 128 × 256.

Duỗi cây (mục 4.2): DFS tiền thứ tự, thêm "(" ")" quanh các con của mỗi cha, bỏ ngoặc khi cha chỉ có 1 con, kết thúc bằng EOS.
Embedding (Eq.1–5): e = e_b + e_c + e_t, e_b = ghép 4 embedding tọa độ (mỗi cái d/4). Token ngoặc/EOS có e_c, còn t và tọa độ dùng chỉ số "rỗng".
Khác bài báo: thêm embedding vị trí trong chuỗi (token ngoặc không có tọa độ nên cần vị trí để phân biệt thứ tự).
Bộ giải mã nhân quả (Eq.6), softmax riêng cho c, t, x, y, x2, y2 (Eq.7); token ngoặc/EOS chỉ tính loss của c.

Đánh giá (mục 5.2–5.3), cây dở = tiền tố DFS gồm 10/50/80% số node (Vanilla chỉ hỗ trợ DFS):
  - Next-element accuracy: node đầu tiên mô hình sinh sau tiền tố so với node kế tiếp thật (chặt: loại + 4 tọa độ; nới lỏng: loại; kèm Top-3 loại).
  - Parent-child pair P/R/F1 (đa tập) giữa cây mô hình hoàn thiện (giải mã tham lam) và cây thật, chặt và nới lỏng.
  - Layout Tree Edit Distance Zhang–Shasha, chi phí KLM như scripts/tree-metrics.ts (chèn 5,05 s, đổi 3,95 s, xóa 0,10 s).
  - Mốc "Không gợi ý" = giữ nguyên cây dở.

Dùng: python3 scripts/paper/vanilla.py [--grid "64,128:2,4"] [--epochs 80] [--out dataset/export/eval/paper-vanilla]
"""
import argparse
import json
import math
import os
import random
import time

import torch
import torch.nn as nn
import torch.nn.functional as F

TYPES = ["Page", "Header", "Sidebar", "Section", "Card", "Row", "Column", "Form", "List", "Modal", "Heading", "Text", "Button", "Link",
         "Input", "Textarea", "Select", "Checkbox", "Radio", "DatePicker", "Table", "Image", "Badge", "Alert", "Stat", "Avatar", "Divider", "Pagination"]
N_TYPES = len(TYPES)
OPEN, CLOSE, EOS, BOS = N_TYPES, N_TYPES + 1, N_TYPES + 2, N_TYPES + 3
N_C = N_TYPES + 4
GX, GY = 128, 256
KLM = {"insert": 1.35 + 3 * 1.1 + 4 * 0.1, "relabel": 1.35 + 2 * 1.1 + 4 * 0.1, "delete": 0.1}


# ------------------------------------------------------------------ cây ↔ chuỗi
def kids(n):
    return n.get("k") or []


def linearize(tree):
    """Chuỗi token (c, t, x, y, x2, y2); token đặc biệt có t = 2 và tọa độ = chỉ số rỗng."""
    seq = []

    def tok(n):
        x, y, x2, y2 = n["b"]
        return (n["c"], n["t"], x, y, x2, y2)

    def rec(n):
        seq.append(tok(n))
        ch = kids(n)
        if not ch:
            return
        if len(ch) == 1:
            rec(ch[0])
            return
        seq.append(special(OPEN))
        for c in ch:
            rec(c)
        seq.append(special(CLOSE))

    rec(tree)
    seq.append(special(EOS))
    return seq


def special(c):
    return (c, 2, GX, GY, GX, GY)


def parse(seq):
    """Khôi phục cây từ chuỗi (chịu lỗi: thiếu ngoặc đóng, node không lá thiếu con → coi là lá)."""
    pos = [0]

    def node_at():
        while pos[0] < len(seq) and seq[pos[0]][0] in (CLOSE, OPEN):
            pos[0] += 1  # bỏ ngoặc lạc
        if pos[0] >= len(seq) or seq[pos[0]][0] >= N_TYPES:
            return None
        c, t, x, y, x2, y2 = seq[pos[0]]
        pos[0] += 1
        n = {"c": c, "t": t, "b": [x, y, x2, y2]}
        if t == 0 and pos[0] < len(seq):
            if seq[pos[0]][0] == OPEN:
                pos[0] += 1
                ch = []
                while pos[0] < len(seq) and seq[pos[0]][0] not in (CLOSE, EOS):
                    k = node_at()
                    if k is None:
                        break
                    ch.append(k)
                if pos[0] < len(seq) and seq[pos[0]][0] == CLOSE:
                    pos[0] += 1
                if ch:
                    n["k"] = ch
            elif seq[pos[0]][0] < N_TYPES:
                n["k"] = [node_at()]
        return n

    return node_at()


def preorder(tree):
    out = [tree]
    for c in kids(tree):
        out.extend(preorder(c))
    return out


def prefix_tokens(tree, k):
    """Chuỗi token của cây đến hết node thứ k (tiền thứ tự) – đúng cây dở theo luồng DFS."""
    seq = linearize(tree)
    seen = 0
    for i, s in enumerate(seq):
        if s[0] < N_TYPES:
            seen += 1
            if seen == k:
                return seq[: i + 1]
    return seq


def prefix_tree(tree, k):
    keep = {id(n) for n in preorder(tree)[:k]}

    def rec(n):
        m = {"c": n["c"], "t": n["t"], "b": n["b"]}
        ch = [rec(c) for c in kids(n) if id(c) in keep]
        if ch:
            m["k"] = ch
        return m

    return rec(tree)


# ------------------------------------------------------------------ mô hình
class Vanilla(nn.Module):
    def __init__(self, d, layers, heads=4, max_len=256, drop=0.1):
        super().__init__()
        self.emb_c = nn.Embedding(N_C, d)
        self.emb_t = nn.Embedding(3, d)
        self.emb_x = nn.Embedding(GX + 1, d // 4)
        self.emb_y = nn.Embedding(GY + 1, d // 4)
        self.emb_x2 = nn.Embedding(GX + 1, d // 4)
        self.emb_y2 = nn.Embedding(GY + 1, d // 4)
        self.emb_pos = nn.Embedding(max_len, d)
        layer = nn.TransformerEncoderLayer(d, heads, 4 * d, drop, batch_first=True, norm_first=True, activation="gelu")
        self.dec = nn.TransformerEncoder(layer, layers)
        self.ln = nn.LayerNorm(d)
        self.heads = nn.ModuleDict({"c": nn.Linear(d, N_C), "t": nn.Linear(d, 2), "x": nn.Linear(d, GX), "y": nn.Linear(d, GY), "x2": nn.Linear(d, GX), "y2": nn.Linear(d, GY)})
        self.max_len = max_len

    def forward(self, tok, pad):
        c, t, x, y, x2, y2 = tok.unbind(-1)
        e_b = torch.cat([self.emb_x(x), self.emb_y(y), self.emb_x2(x2), self.emb_y2(y2)], -1)
        h = e_b + self.emb_c(c) + self.emb_t(t) + self.emb_pos(torch.arange(tok.shape[1]).unsqueeze(0))
        mask = torch.triu(torch.full((tok.shape[1], tok.shape[1]), float("-inf")), 1)
        h = self.ln(self.dec(h, mask=mask, src_key_padding_mask=pad))
        return {k: v(h) for k, v in self.heads.items()}


def batchify(seqs):
    L = max(len(s) for s in seqs)
    tok = torch.tensor([s + [special(EOS)] * (L - len(s)) for s in seqs])
    pad = torch.tensor([[False] * len(s) + [True] * (L - len(s)) for s in seqs])
    return tok, pad


def loss_fn(model, seqs):
    inp = [[special(BOS)] + s[:-1] for s in seqs]
    tok, pad = batchify(inp)
    tgt, _ = batchify(seqs)
    out = model(tok, pad)
    valid = ~pad
    is_node = valid & (tgt[..., 0] < N_TYPES)
    loss = F.cross_entropy(out["c"][valid], tgt[..., 0][valid])
    for i, k in enumerate(["t", "x", "y", "x2", "y2"], 1):
        loss = loss + F.cross_entropy(out[k][is_node], tgt[..., i][is_node]) / 5
    return loss


@torch.no_grad()
def decode(model, prefix, max_nodes=100, max_tokens=250):
    """Giải mã tham lam tiếp sau tiền tố. Trả (chuỗi đầy đủ, node đầu tiên sinh ra, top-3 loại tại bước đó)."""
    seq = list(prefix)
    first, top3 = None, None
    depth = sum(1 if s[0] == OPEN else -1 if s[0] == CLOSE else 0 for s in seq)
    while len(seq) < min(max_tokens, model.max_len - 1) and sum(1 for s in seq if s[0] < N_TYPES) < max_nodes:
        tok, pad = batchify([[special(BOS)] + seq])
        out = model(tok, pad)
        lc = out["c"][0, -1].clone()
        lc[BOS] = -1e9
        if depth <= 0:
            lc[CLOSE] = -1e9
        c = int(lc.argmax())
        if c == EOS:
            break
        if c in (OPEN, CLOSE):
            depth += 1 if c == OPEN else -1
            seq.append(special(c))
            continue
        node = (c, int(out["t"][0, -1].argmax()), int(out["x"][0, -1].argmax()), int(out["y"][0, -1].argmax()), int(out["x2"][0, -1].argmax()), int(out["y2"][0, -1].argmax()))
        if first is None:
            first = node
            top3 = lc[:N_TYPES].topk(3).indices.tolist()
        seq.append(node)
    return seq, first, top3


# ------------------------------------------------------------------ thước đo
def label(n, strict):
    return (n["c"], *n["b"]) if strict else n["c"]


def pairs(tree, strict):
    out = {}
    for p in preorder(tree):
        for c in kids(p):
            k = (label(p, strict), label(c, strict))
            out[k] = out.get(k, 0) + 1
    return out


def pair_prf(pred, gold, strict):
    a, b = pairs(pred, strict), pairs(gold, strict)
    hit = sum(min(v, b.get(k, 0)) for k, v in a.items())
    p = hit / max(sum(a.values()), 1)
    r = hit / max(sum(b.values()), 1)
    return p, r, (2 * p * r / (p + r) if p + r else 0.0)


def ted(a, b, strict):
    """Zhang–Shasha: chi phí biến cây dự đoán a thành cây đúng b (giây KLM)."""
    def post(t):
        labels, lml = [], []

        def rec(n):
            first = None
            for c in kids(n):
                i = rec(c)
                first = i if first is None else first
            labels.append(label(n, strict))
            idx = len(labels) - 1
            lml.append(lml[first] if first is not None else idx)
            return idx

        rec(t)
        return labels, lml

    A, la = post(a)
    B, lb = post(b)
    kr = lambda lml: sorted({max(i for i in range(len(lml)) if lml[i] == l) for l in set(lml)})
    td = [[0.0] * len(B) for _ in A]
    for i in kr(la):
        for j in kr(lb):
            m, n = i - la[i] + 2, j - lb[j] + 2
            fd = [[0.0] * n for _ in range(m)]
            for x in range(1, m):
                fd[x][0] = fd[x - 1][0] + KLM["delete"]
            for y in range(1, n):
                fd[0][y] = fd[0][y - 1] + KLM["insert"]
            for x in range(1, m):
                for y in range(1, n):
                    i1, j1 = la[i] + x - 1, lb[j] + y - 1
                    if la[i1] == la[i] and lb[j1] == lb[j]:
                        fd[x][y] = min(fd[x - 1][y] + KLM["delete"], fd[x][y - 1] + KLM["insert"], fd[x - 1][y - 1] + (0 if A[i1] == B[j1] else KLM["relabel"]))
                        td[i1][j1] = fd[x][y]
                    else:
                        p, q = la[i1] - la[i], lb[j1] - lb[j]
                        fd[x][y] = min(fd[x - 1][y] + KLM["delete"], fd[x][y - 1] + KLM["insert"], fd[p][q] + td[i1][j1])
    return td[-1][-1]


@torch.no_grad()
def evaluate(model, trees, fracs=(0.1, 0.5, 0.8)):
    model.eval()
    res = {}
    for f in fracs:
        acc = {k: 0.0 for k in ["n", "next_strict", "next_relaxed", "next_top3",
                                 "f1_strict", "f1_relaxed", "edit_strict", "edit_relaxed",
                                 "none_f1_strict", "none_f1_relaxed", "none_edit_strict", "none_edit_relaxed"]}
        for t in trees:
            nodes = preorder(t)
            N = len(nodes)
            k = min(N - 1, max(1, round(f * N)))
            target = nodes[k]
            seq, first, top3 = decode(model, prefix_tokens(t, k))
            pred = parse(seq) or prefix_tree(t, k)
            part = prefix_tree(t, k)
            acc["n"] += 1
            if first is not None:
                acc["next_relaxed"] += first[0] == target["c"]
                acc["next_strict"] += (first[0], *first[2:]) == (target["c"], *target["b"])
                acc["next_top3"] += target["c"] in top3
            for s, tag in ((True, "strict"), (False, "relaxed")):
                acc[f"f1_{tag}"] += pair_prf(pred, t, s)[2]
                acc[f"edit_{tag}"] += ted(pred, t, s)
                acc[f"none_f1_{tag}"] += pair_prf(part, t, s)[2]
                acc[f"none_edit_{tag}"] += ted(part, t, s)
        n = max(acc["n"], 1)
        res[f"DFS {int(f * 100)}%"] = {k: (v if k == "n" else round(100 * v / n, 2) if not k.startswith(("edit", "none_edit")) else round(v / n, 2)) for k, v in acc.items()}
    model.train()
    return res


# ------------------------------------------------------------------ chạy
def load(path):
    return [json.loads(l) for l in open(path, encoding="utf8") if l.strip()]


def train_one(train, val, d, layers, epochs, patience, lr, seed, batch=32):
    torch.manual_seed(seed)
    rnd = random.Random(seed)
    model = Vanilla(d, layers)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    seqs = [linearize(r["tree"]) for r in train]
    vseqs = [linearize(r["tree"]) for r in val]
    best, best_state, bad, hist = 1e9, None, 0, []
    for ep in range(epochs):
        rnd.shuffle(seqs)
        tot = 0.0
        for i in range(0, len(seqs), batch):
            loss = loss_fn(model, seqs[i:i + batch])
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            tot += loss.item()
        model.eval()
        with torch.no_grad():
            vl = sum(loss_fn(model, vseqs[i:i + 64]).item() * len(vseqs[i:i + 64]) for i in range(0, len(vseqs), 64)) / len(vseqs)
        model.train()
        hist.append({"epoch": ep + 1, "train": round(tot / math.ceil(len(seqs) / batch), 4), "val": round(vl, 4)})
        if vl < best - 1e-4:
            best, bad = vl, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                break
    model.load_state_dict(best_state)
    return model, best, hist


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/paper")
    ap.add_argument("--grid", default="64,128:2,4", help="hidden:layers để dò trên val")
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--patience", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--threads", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--out", default="dataset/export/eval/paper-vanilla")
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    train, val, test = (load(f"{a.data}/{s}.jsonl") for s in ("train", "val", "test"))
    ds, ls = a.grid.split(":")
    t0 = time.time()
    search = []
    best = None
    for d in map(int, ds.split(",")):
        for L in map(int, ls.split(",")):
            s = time.time()
            m, vl, hist = train_one(train, val, d, L, a.epochs, a.patience, a.lr, a.seed)
            params = sum(p.numel() for p in m.parameters())
            search.append({"d": d, "layers": L, "val_loss": round(vl, 4), "epochs": len(hist), "params": params, "seconds": round(time.time() - s, 1), "history": hist})
            print(f"d={d} layers={L}: val loss {vl:.4f} · {len(hist)} epoch · {params:,} tham số · {time.time() - s:.0f}s", flush=True)
            if best is None or vl < best[1]:
                best = (m, vl, d, L)
    model, vl, d, L = best
    print(f"chọn d={d}, layers={L} (val loss {vl:.4f}); đánh giá trên {len(test)} cây test…", flush=True)
    res = evaluate(model, [r["tree"] for r in test])
    report = {"data": {k: len(v) for k, v in (("train", train), ("val", val), ("test", test))}, "chosen": {"d": d, "layers": L, "val_loss": round(vl, 4)},
              "search": search, "test": res, "train_seconds": round(time.time() - t0, 1)}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump(report, open(a.out + ".json", "w"), ensure_ascii=False, indent=1)
    torch.save(model.state_dict(), os.path.join(a.data, "vanilla.pt"))
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
