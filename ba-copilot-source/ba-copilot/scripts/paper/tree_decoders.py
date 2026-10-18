"""Pointer và Recursive Transformer Tree Decoder (Li et al. 2020, mục 4.3–4.4) + bộ đánh giá chung cho cả 3 bộ giải mã.

Dữ liệu: data/paper/{train,val,test}.jsonl (cây UI web của nhóm, có tọa độ; không WebSight).
Embedding node như Vanilla (Eq.1–5): e = e_b + e_c + e_t (+ embedding vị trí trong chuỗi).

- Pointer (Eq.8): chuỗi node theo thứ tự duyệt (huấn luyện trộn BFS và DFS), mỗi bước sinh node kế tiếp (c, t, x, y, x2, y2)
  và con trỏ tới cha = softmax tích vô hướng giữa trạng thái ẩn hiện tại và trạng thái ẩn của các node trước (chỉ node không lá).
- Recursive (Eq.9–10): cùng một bộ giải mã sinh danh sách con của từng node cha, từ gốc xuống; self-attention nhân quả trên
  [cha, các anh em đã sinh], rồi chú ý tới trạng thái ẩn của các tổ tiên (vector "canvas" + gốc … cha). Trạng thái ẩn của một node
  là đầu ra tại vị trí của nó trong chuỗi con của cha (gốc: vị trí 0 trong chuỗi của chính nó).

Đánh giá (mục 5.2–5.3) trên cây dở = tiền tố BFS hoặc DFS gồm 10/50/80% số node:
  - Next: node mới đầu tiên theo thứ tự duyệt của cây mô hình hoàn thiện so với node kế tiếp thật (chặt: loại + 4 tọa độ; nới lỏng: loại; Top-3 loại).
  - Parent-child pair F1 và Layout Tree Edit Distance (KLM) như scripts/paper/vanilla.py.
Vanilla (scripts/paper/vanilla.py) được chấm lại bằng cùng hàm, chỉ luồng DFS.

Dùng: python3 scripts/paper/tree_decoders.py [--models pointer,recursive,vanilla] [--grid "64,128:2,4"]
"""
import argparse
import json
import math
import os
import random
import sys
import time

import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(__file__))
import vanilla as V  # noqa: E402

N_TYPES, GX, GY = V.N_TYPES, V.GX, V.GY
EOS = N_TYPES          # lớp "hết" cho c
N_C = N_TYPES + 2      # + EOS + BOS


def kids(n):
    return n.get("k") or []


def order_nodes(tree, order):
    if order == "dfs":
        return V.preorder(tree)
    out, q = [], [tree]
    while q:
        n = q.pop(0)
        out.append(n)
        q.extend(kids(n))
    return out


def prefix_tree(tree, k, order):
    keep = {id(n) for n in order_nodes(tree, order)[:k]}

    def rec(n):
        m = {"c": n["c"], "t": n["t"], "b": list(n["b"])}
        ch = [rec(c) for c in kids(n) if id(c) in keep]
        if ch:
            m["k"] = ch
        return m

    return rec(tree)


class NodeEmb(nn.Module):
    def __init__(self, d, max_len=128):
        super().__init__()
        self.c = nn.Embedding(N_C, d)
        self.t = nn.Embedding(3, d)
        self.x, self.y, self.x2, self.y2 = (nn.Embedding(g + 1, d // 4) for g in (GX, GY, GX, GY))
        self.pos = nn.Embedding(max_len, d)

    def forward(self, tok):
        c, t, x, y, x2, y2 = tok.unbind(-1)
        e_b = torch.cat([self.x(x), self.y(y), self.x2(x2), self.y2(y2)], -1)
        return e_b + self.c(c) + self.t(t) + self.pos(torch.arange(tok.shape[1]).unsqueeze(0).clamp(max=self.pos.num_embeddings - 1))


def heads(d):
    return nn.ModuleDict({"c": nn.Linear(d, N_C), "t": nn.Linear(d, 2), "x": nn.Linear(d, GX), "y": nn.Linear(d, GY), "x2": nn.Linear(d, GX), "y2": nn.Linear(d, GY)})


def tok_of(n):
    return (n["c"], n["t"], *n["b"])


BOS_TOK = (N_TYPES + 1, 2, GX, GY, GX, GY)
PAD_TOK = (EOS, 2, GX, GY, GX, GY)


def soft_ce(logits, target, sigma):
    """Cross-entropy với nhãn làm mềm sang ô lân cận (Gauss, độ lệch chuẩn sigma ô) – tọa độ vẫn là lớp rời rạc như bài báo,
    nhưng đoán lệch 1 ô bị phạt nhẹ hơn đoán lệch xa."""
    if sigma <= 0:
        return F.cross_entropy(logits, target)
    idx = torch.arange(logits.shape[-1]).unsqueeze(0)
    w = torch.exp(-((idx - target.unsqueeze(1)) ** 2) / (2 * sigma ** 2))
    w = w / w.sum(-1, keepdim=True)
    return -(w * F.log_softmax(logits, -1)).sum(-1).mean()


def node_loss(out, tgt, valid, sigma=0.0):
    """tgt: (B, L, 6); valid: (B, L). Token EOS chỉ tính loss của c."""
    loss = F.cross_entropy(out["c"][valid], tgt[..., 0][valid])
    is_node = valid & (tgt[..., 0] < N_TYPES)
    if is_node.any():
        loss = loss + F.cross_entropy(out["t"][is_node], tgt[..., 1][is_node]) / 5
        for i, k in enumerate(["x", "y", "x2", "y2"], 2):
            loss = loss + soft_ce(out[k][is_node], tgt[..., i][is_node], sigma) / 5
    return loss


def pick(out, b, i, banned=()):
    lc = out["c"][b, i].clone()
    lc[N_TYPES + 1] = -1e9
    for x in banned:
        lc[x] = -1e9
    c = int(lc.argmax())
    top3 = lc[:N_TYPES].topk(3).indices.tolist()
    if c == EOS:
        return None, top3
    return (c, int(out["t"][b, i].argmax()), int(out["x"][b, i].argmax()), int(out["y"][b, i].argmax()), int(out["x2"][b, i].argmax()), int(out["y2"][b, i].argmax())), top3


# ------------------------------------------------------------------ Pointer
class Pointer(nn.Module):
    def __init__(self, d, layers, heads_=4, drop=0.1, max_len=128):
        super().__init__()
        self.emb = NodeEmb(d, max_len)
        layer = nn.TransformerEncoderLayer(d, heads_, 4 * d, drop, batch_first=True, norm_first=True, activation="gelu")
        self.dec = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.ln = nn.LayerNorm(d)
        self.out = heads(d)
        self.q, self.k = nn.Linear(d, d), nn.Linear(d, d)
        self.max_len = max_len

    def forward(self, tok, pad):
        L = tok.shape[1]
        mask = torch.triu(torch.ones(L, L, dtype=torch.bool), 1)
        h = self.ln(self.dec(self.emb(tok), mask=mask, src_key_padding_mask=pad))
        o = {k: v(h) for k, v in self.out.items()}
        # con trỏ: vị trí i (đang sinh node i) chỉ tới vị trí đầu vào j ≤ i (node j-1)
        o["ptr"] = self.q(h) @ self.k(h).transpose(1, 2) / math.sqrt(h.shape[-1])
        return o


def pointer_seq(tree, order):
    nodes = order_nodes(tree, order)
    idx = {id(n): i for i, n in enumerate(nodes)}
    parent = [-1] * len(nodes)
    for n in nodes:
        for c in kids(n):
            parent[idx[id(c)]] = idx[id(n)]
    return [tok_of(n) for n in nodes], parent


def pointer_loss(model, items):
    seqs = [[BOS_TOK] + s for s, _ in items]
    L = max(len(s) for s in seqs)
    tok = torch.tensor([s + [PAD_TOK] * (L - len(s)) for s in seqs])
    pad = torch.tensor([[False] * len(s) + [True] * (L - len(s)) for s in seqs])
    tgt = torch.tensor([s + [PAD_TOK] * (L - len(s)) for s, _ in [(s + [PAD_TOK], p) for s, p in items]])  # mục tiêu: node i, rồi EOS
    tgt = tgt[:, :L]
    valid = ~pad
    out = model(tok, pad)
    loss = node_loss(out, tgt, valid)
    # con trỏ cha cho node i ≥ 1: đáp án là vị trí đầu vào parent+1
    rows, cols, tg = [], [], []
    for b, (s, p) in enumerate(items):
        for i in range(1, len(s)):
            rows.append(b); cols.append(i); tg.append(p[i] + 1)
    if rows:
        logits = out["ptr"][rows, cols]  # (N, L)
        allowed = torch.arange(L).unsqueeze(0) <= torch.tensor(cols).unsqueeze(1)
        allowed &= torch.arange(L).unsqueeze(0) >= 1
        logits = logits.masked_fill(~allowed, -1e9)
        loss = loss + F.cross_entropy(logits, torch.tensor(tg))
    return loss


@torch.no_grad()
def pointer_complete(model, partial, order, max_nodes=100):
    nodes = order_nodes(partial, order)
    seq, parent = pointer_seq(partial, order)
    objs = [dict(n) for n in nodes]
    for o in objs:
        o.pop("k", None)
    for i, p in enumerate(parent):
        if p >= 0:
            objs[p].setdefault("k", []).append(objs[i])
    while len(seq) < min(max_nodes, model.max_len - 1):
        inp = torch.tensor([[BOS_TOK] + seq])
        out = model(inp, torch.zeros(1, inp.shape[1], dtype=torch.bool))
        i = len(seq)
        node, top3 = pick(out, 0, i)
        if node is None:
            break
        lp = out["ptr"][0, i, 1: i + 1].clone()
        for j in range(i):
            if seq[j][1] == 1:  # lá không làm cha
                lp[j] = -1e9
        if lp.max() < -1e8:
            break
        p = int(lp.argmax())
        o = {"c": node[0], "t": node[1], "b": list(node[2:]), "_new": True, "_top3": top3}
        objs[p].setdefault("k", []).append(o)
        objs.append(o)
        seq.append(node)
    return objs[0]


# ------------------------------------------------------------------ Recursive
class RecLayer(nn.Module):
    def __init__(self, d, heads_, drop):
        super().__init__()
        self.ln1, self.ln2, self.ln3 = nn.LayerNorm(d), nn.LayerNorm(d), nn.LayerNorm(d)
        self.self_attn = nn.MultiheadAttention(d, heads_, dropout=drop, batch_first=True)
        self.cross = nn.MultiheadAttention(d, heads_, dropout=drop, batch_first=True)
        self.ff = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))
        self.drop = nn.Dropout(drop)

    def forward(self, x, pad, mem, mem_pad):
        L = x.shape[1]
        mask = torch.triu(torch.ones(L, L, dtype=torch.bool), 1)
        h = self.ln1(x)
        x = x + self.drop(self.self_attn(h, h, h, attn_mask=mask, key_padding_mask=pad, need_weights=False)[0])   # Eq.9
        h = self.ln2(x)
        x = x + self.drop(self.cross(h, mem, mem, key_padding_mask=mem_pad, need_weights=False)[0])            # Eq.10
        return x + self.drop(self.ff(self.ln3(x)))


class Recursive(nn.Module):
    def __init__(self, d, layers, heads_=4, drop=0.1, max_len=40, sigma=0.0):
        super().__init__()
        self.sigma = sigma  # làm mềm nhãn tọa độ khi huấn luyện (0 = đúng bài báo)
        self.emb = NodeEmb(d, max_len)
        self.layers = nn.ModuleList([RecLayer(d, heads_, drop) for _ in range(layers)])
        self.ln = nn.LayerNorm(d)
        self.out = heads(d)
        self.canvas = nn.Parameter(torch.zeros(1, 1, d))
        self.max_len = max_len

    def run(self, tok, pad, mem, mem_pad):
        x = self.emb(tok)
        for l in self.layers:
            x = l(x, pad, mem, mem_pad)
        h = self.ln(x)
        return h, {k: v(h) for k, v in self.out.items()}


def pad_mem(mems, d):
    M = max(m.shape[0] for m in mems)
    mem = torch.zeros(len(mems), M, d)
    mp = torch.ones(len(mems), M, dtype=torch.bool)
    for i, m in enumerate(mems):
        mem[i, : m.shape[0]] = m
        mp[i, : m.shape[0]] = False
    return mem, mp


def recursive_loss(model, trees):
    """Giải mã từng tầng: mọi node cha cùng độ sâu trong batch được xử lý cùng lúc."""
    d = model.canvas.shape[-1]
    # (node, ancestors_hidden list, own hidden or None)
    level = [(t, [model.canvas[0, 0]], None) for t in trees]
    total, count = 0.0, 0
    while level:
        jobs = [(n, anc, hn) for n, anc, hn in level if n["t"] == 0 and kids(n)]
        if not jobs:
            break
        seqs = [[tok_of(n)] + [tok_of(c) for c in kids(n)][: model.max_len - 1] for n, _, _ in jobs]
        L = max(len(s) for s in seqs)
        tok = torch.tensor([s + [PAD_TOK] * (L - len(s)) for s in seqs])
        pad = torch.tensor([[False] * len(s) + [True] * (L - len(s)) for s in seqs])
        tgt = torch.tensor([s[1:] + [PAD_TOK] + [PAD_TOK] * (L - len(s)) for s in seqs])
        mems = [torch.stack(anc + ([hn] if hn is not None else [])) for _, anc, hn in jobs]
        mem, mp = pad_mem(mems, d)
        h, out = model.run(tok, pad, mem, mp)
        total = total + node_loss(out, tgt, ~pad, model.sigma)
        count += 1
        nxt = []
        for b, (n, anc, hn) in enumerate(jobs):
            own = hn if hn is not None else h[b, 0]
            new_anc = anc + [own]
            for j, c in enumerate(kids(n)[: model.max_len - 1]):
                nxt.append((c, new_anc, h[b, j + 1]))
        level = nxt
    return total / max(count, 1)


def constrained_box(out, i, parent, prev=None):
    """Chọn tọa độ có ràng buộc (chỉ chặn lựa chọn vô lý, không đổi mô hình): khung con nằm trong khung cha theo chiều ngang
    và không bắt đầu phía trên cha; x2 ≥ x, y2 ≥ y. Không ràng buộc thứ tự với anh em – để phần tử mới vẫn có thể nằm GIỮA."""
    px, py, px2, _ = parent["b"]

    def best(logits, lo, hi):
        l = logits.clone()
        n = l.shape[0]
        lo, hi = max(0, min(lo, n - 1)), max(0, min(hi, n - 1))
        lo = min(lo, hi)
        mask = torch.ones(n, dtype=torch.bool)
        mask[lo: hi + 1] = False
        l[mask] = -1e9
        return int(l.argmax())

    x = best(out["x"][0, i], px, px2)
    x2 = best(out["x2"][0, i], x, px2)
    y = best(out["y"][0, i], py, GY - 1)
    y2 = best(out["y2"][0, i], y, GY - 1)
    return [x, y, x2, y2]


@torch.no_grad()
def recursive_complete(model, partial, max_nodes=100, constrain=False):
    root = json.loads(json.dumps(partial))
    count = [len(V.preorder(root))]

    def expand(n, anc, own):
        if n["t"] != 0:
            return
        given = kids(n)
        seq = [tok_of(n)] + [tok_of(c) for c in given]
        mem = torch.stack(anc + ([own] if own is not None else [])).unsqueeze(0)
        mp = torch.zeros(1, mem.shape[1], dtype=torch.bool)
        ch = list(given)
        while len(seq) < model.max_len and count[0] < max_nodes:
            tok = torch.tensor([seq])
            h, out = model.run(tok, torch.zeros(1, len(seq), dtype=torch.bool), mem, mp)
            node, top3 = pick(out, 0, len(seq) - 1)
            if node is None:
                break
            box = constrained_box(out, len(seq) - 1, n) if constrain else list(node[2:])
            node = (node[0], node[1], *box)
            c = {"c": node[0], "t": node[1], "b": list(node[2:]), "_new": True, "_top3": top3}
            ch.append(c)
            seq.append(node)
            count[0] += 1
        if ch:
            n["k"] = ch
        tok = torch.tensor([seq])
        h, _ = model.run(tok, torch.zeros(1, len(seq), dtype=torch.bool), mem, mp)
        own_h = own if own is not None else h[0, 0]
        for j, c in enumerate(ch):
            expand(c, anc + [own_h], h[0, j + 1])

    expand(root, [model.canvas[0, 0]], None)
    return root


# ------------------------------------------------------------------ Vanilla (chấm lại bằng hàm chung)
@torch.no_grad()
def vanilla_complete(model, tree, k):
    prefix = V.prefix_tokens(tree, k)
    seq, _, top3 = V.decode(model, prefix)
    pred = V.parse(seq)
    nodes = V.preorder(pred) if pred else []
    for i, n in enumerate(nodes):
        if i >= k:
            n["_new"] = True
            if i == k and top3:
                n["_top3"] = top3  # node mới đầu tiên theo DFS chính là node Vanilla sinh đầu tiên
    return pred or V.prefix_tree(tree, k)


# ------------------------------------------------------------------ đánh giá chung
def strip_meta(t):
    m = {"c": t["c"], "t": t["t"], "b": t["b"]}
    if kids(t):
        m["k"] = [strip_meta(c) for c in kids(t)]
    return m


def evaluate(complete, trees, orders=("bfs", "dfs"), fracs=(0.1, 0.5, 0.8)):
    res = {}
    for order in orders:
        for f in fracs:
            acc = {k: 0.0 for k in ["n", "next_strict", "next_relaxed", "next_top3", "f1_strict", "f1_relaxed", "edit_strict", "edit_relaxed",
                                     "none_f1_strict", "none_f1_relaxed", "none_edit_strict", "none_edit_relaxed", "seconds"]}
            for t in trees:
                nodes = order_nodes(t, order)
                N = len(nodes)
                k = V.partial_size(N, f)
                target = nodes[k]
                part = prefix_tree(t, k, order)
                s = time.time()
                pred = complete(t, part, k, order)
                acc["seconds"] += time.time() - s
                new = [n for n in order_nodes(pred, order) if n.get("_new")]
                acc["n"] += 1
                if new:
                    x = new[0]
                    acc["next_relaxed"] += x["c"] == target["c"]
                    acc["next_strict"] += (x["c"], *x["b"]) == (target["c"], *target["b"])
                    acc["next_top3"] += target["c"] in x.get("_top3", [x["c"]])
                p = strip_meta(pred)
                for st, tag in ((True, "strict"), (False, "relaxed")):
                    acc[f"f1_{tag}"] += V.pair_prf(p, t, st)[2]
                    acc[f"edit_{tag}"] += V.ted(p, t, st)
                    acc[f"none_f1_{tag}"] += V.pair_prf(part, t, st)[2]
                    acc[f"none_edit_{tag}"] += V.ted(part, t, st)
            n = max(acc["n"], 1)
            res[f"{order.upper()} {int(f * 100)}%"] = {k: (int(v) if k == "n" else round(v / n, 3) if k == "seconds" else round(v / n, 2) if "edit" in k else round(100 * v / n, 2)) for k, v in acc.items()}
    return res


# ------------------------------------------------------------------ huấn luyện
def train_model(kind, train, val, d, layers, epochs, patience, lr, seed, batch=32, sigma=0.0):
    torch.manual_seed(seed)
    rnd = random.Random(seed)
    model = Pointer(d, layers) if kind == "pointer" else Recursive(d, layers, sigma=sigma)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    if kind == "pointer":
        tr = [pointer_seq(r["tree"], o) for r in train for o in ("bfs", "dfs")]
        va = [pointer_seq(r["tree"], o) for r in val for o in ("bfs", "dfs")]
        lf = pointer_loss
    else:
        tr = [r["tree"] for r in train]
        va = [r["tree"] for r in val]
        lf = recursive_loss
    best, best_state, bad, hist = 1e9, None, 0, []
    for ep in range(epochs):
        rnd.shuffle(tr)
        model.train()
        tot, nb = 0.0, 0
        for i in range(0, len(tr), batch):
            loss = lf(model, tr[i:i + batch])
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            tot += loss.item(); nb += 1
        model.eval()
        with torch.no_grad():
            vl = sum(lf(model, va[i:i + 64]).item() * len(va[i:i + 64]) for i in range(0, len(va), 64)) / len(va)
        hist.append({"epoch": ep + 1, "train": round(tot / nb, 4), "val": round(vl, 4)})
        if vl < best - 1e-4:
            best, bad = vl, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                break
    model.load_state_dict(best_state)
    model.eval()
    return model, best, hist


def load(p):
    return [json.loads(l) for l in open(p, encoding="utf8") if l.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/paper")
    ap.add_argument("--models", default="pointer,recursive,vanilla")
    ap.add_argument("--grid", default="64,128:2,4")
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--patience", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--threads", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--out", default="dataset/export/eval/paper-decoders")
    ap.add_argument("--eval-only", action="store_true", help="chấm lại từ trọng số đã lưu (data/paper/<model>.pt), cấu hình lấy từ báo cáo --out")
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    train, val, test = (load(f"{a.data}/{s}.jsonl") for s in ("train", "val", "test"))
    tests = [r["tree"] for r in test]
    report = {"data": {"train": len(train), "val": len(val), "test": len(test)}, "models": {}}
    if os.path.exists(a.out + ".json"):
        report = json.load(open(a.out + ".json"))
    ds, ls = a.grid.split(":")
    for kind in a.models.split(","):
        t0 = time.time()
        if kind == "vanilla":
            info = json.load(open("dataset/export/eval/paper-vanilla.json"))["chosen"]
            m = V.Vanilla(info["d"], info["layers"])
            m.load_state_dict(torch.load(os.path.join(a.data, "vanilla.pt")))
            m.eval()
            res = evaluate(lambda t, part, k, order: vanilla_complete(m, t, k), tests, orders=("dfs",))
            report["models"]["vanilla"] = {"chosen": info, "test": res, "note": "chấm lại bằng hàm chung; chỉ DFS"}
            print("vanilla", json.dumps(res), flush=True)
            continue
        if a.eval_only:
            ch = report["models"][kind]["chosen"]
            m = (Pointer if kind == "pointer" else Recursive)(ch["d"], ch["layers"])
            m.load_state_dict(torch.load(os.path.join(a.data, f"{kind}.pt")))
            m.eval()
            fn = (lambda t, part, k, order, m=m: pointer_complete(m, part, order)) if kind == "pointer" else (lambda t, part, k, order, m=m: recursive_complete(m, part))
            report["models"][kind]["test"] = evaluate(fn, tests)
            print(kind, "chấm lại xong", flush=True)
            continue
        search, best = [], None
        for d in map(int, ds.split(",")):
            for L in map(int, ls.split(",")):
                s = time.time()
                m, vl, hist = train_model(kind, train, val, d, L, a.epochs, a.patience, a.lr, a.seed)
                params = sum(p.numel() for p in m.parameters())
                search.append({"d": d, "layers": L, "val_loss": round(vl, 4), "epochs": len(hist), "params": params, "seconds": round(time.time() - s, 1), "history": hist})
                print(f"{kind} d={d} layers={L}: val loss {vl:.4f} · {len(hist)} epoch · {params:,} tham số · {time.time() - s:.0f}s", flush=True)
                if best is None or vl < best[1]:
                    best = (m, vl, d, L, params)
        m, vl, d, L, params = best
        fn = (lambda t, part, k, order: pointer_complete(m, part, order)) if kind == "pointer" else (lambda t, part, k, order: recursive_complete(m, part))
        res = evaluate(fn, tests)
        torch.save(m.state_dict(), os.path.join(a.data, f"{kind}.pt"))
        report["models"][kind] = {"chosen": {"d": d, "layers": L, "val_loss": round(vl, 4), "params": params}, "search": search, "test": res, "seconds": round(time.time() - t0, 1)}
        print(kind, json.dumps(res), flush=True)
        os.makedirs(os.path.dirname(a.out), exist_ok=True)
        json.dump(report, open(a.out + ".json", "w"), ensure_ascii=False, indent=1)
    json.dump(report, open(a.out + ".json", "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
