"""Xuất Recursive (model/recursive-layout.pt) sang JSON cho suy luận TypeScript (shared/recursive.ts) + mẫu đối chiếu số học.
Mẫu đối chiếu: 3 cây test, mỗi cây lấy tiền tố DFS 50%; với mọi container đã có, sinh tham lam tối đa 6 con (đúng predictChildren).
Dùng: python3 scripts/paper/export_recursive.py"""
import base64, json, os, sys, time
import torch
sys.path.insert(0, os.path.dirname(__file__))
import tree_decoders as T  # noqa: E402
import vanilla as V  # noqa: E402

info = json.load(open("dataset/export/eval/recursive-faithful.json"))
d, L = info["chosen"]["d"], info["chosen"]["layers"]
m = T.Recursive(d, L, use_pos=False)
m.load_state_dict(torch.load("model/recursive-layout.pt"))
m.eval()
cfg = {"d": d, "layers": L, "heads": 4, "gx": T.GX, "gy": T.GY, "cellY": 20, "nTypes": T.N_TYPES, "maxLen": m.max_len}
tensors = {k: {"shape": list(v.shape), "b64": base64.b64encode(v.detach().float().contiguous().numpy().astype("<f4").tobytes()).decode()} for k, v in m.state_dict().items()}
train = [json.loads(l) for l in open(f"{info['data']}/train.jsonl")]
meta = {"builtAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "method": "Recursive Transformer Tree Decoder (Li et al. 2020, §4.4)", "trees": len(train),
        "roots": len({r["rootId"] for r in train}), "params": sum(p.numel() for p in m.parameters()), "val_loss": info["chosen"]["val_loss"], "data": info["data"]}
json.dump({"config": cfg, "meta": meta, "tensors": tensors}, open("model/recursive-layout.json", "w"))


@torch.no_grad()
def predict_children(tree, max_per=6):
    out = []
    def visit(n, anc, own, path):
        if n["t"] != 0:
            return
        given = T.kids(n)[: m.max_len - 1]
        seq = [T.tok_of(n)] + [T.tok_of(c) for c in given]
        mem = torch.stack(anc + ([own] if own is not None else [])).unsqueeze(0)
        mp = torch.zeros(1, mem.shape[1], dtype=torch.bool)
        gen, h0 = [], None
        while len(seq) < m.max_len and len(gen) < max_per:
            h, o = m.run(torch.tensor([seq]), torch.zeros(1, len(seq), dtype=torch.bool), mem, mp)
            h0 = h if h0 is None else h0
            lc = o["c"][0, -1].clone(); lc[T.N_TYPES + 1] = -1e9
            pr = lc.softmax(-1); c = int(lc.argmax())
            if c == T.EOS:
                break
            t = int(o["t"][0, -1].argmax()); b = [int(o[k][0, -1].argmax()) for k in ("x", "y", "x2", "y2")]
            gen.append({"c": c, "t": t, "box": b, "p": round(float(pr[c]), 5)})
            seq.append((c, t, *b))
        if gen:
            out.append({"path": path, "children": gen})
        if h0 is None:
            h0, _ = m.run(torch.tensor([seq]), torch.zeros(1, len(seq), dtype=torch.bool), mem, mp)
        own_h = own if own is not None else h0[0, 0]
        for j, c in enumerate(given):
            visit(c, anc + [own_h], h0[0, j + 1], path + [j])
    visit(tree, [m.canvas[0, 0]], None, [])
    return out


@torch.no_grad()
def first_steps(tree, k=3):
    """Một bước giải mã ở mọi container (đúng nextInContainer / nextElements): top-k loại (không gồm EOS), xác suất, EOS."""
    out = []
    def visit(n, anc, own, path):
        if n["t"] != 0:
            return
        given = T.kids(n)[: m.max_len - 1]
        seq = [T.tok_of(n)] + [T.tok_of(c) for c in given]
        mem = torch.stack(anc + ([own] if own is not None else [])).unsqueeze(0)
        mp = torch.zeros(1, mem.shape[1], dtype=torch.bool)
        h, o = m.run(torch.tensor([seq]), torch.zeros(1, len(seq), dtype=torch.bool), mem, mp)
        lc = o["c"][0, -1].clone(); lc[T.N_TYPES + 1] = -1e9
        pr = lc.softmax(-1)
        top = pr[: T.N_TYPES].topk(k)
        out.append({"path": path, "eos": int(lc.argmax()) == T.EOS, "pEos": round(float(pr[T.EOS]), 5),
                    "top": [[int(i), round(float(v), 5)] for v, i in zip(top.values, top.indices)],
                    "box": [int(o[q][0, -1].argmax()) for q in ("x", "y", "x2", "y2")]})
        own_h = own if own is not None else h[0, 0]
        for j, c in enumerate(given):
            visit(c, anc + [own_h], h[0, j + 1], path + [j])
    visit(tree, [m.canvas[0, 0]], None, [])
    return out


def complete_order(pred, part):
    """Node mới của recursive_complete theo đúng thứ tự giải mã (sinh con của một node, rồi đệ quy từng con), kèm tham chiếu cha."""
    out = []
    def rec(n, ref):
        for c in T.kids(n):
            if c.get("_new"):
                c["_ref"] = f"g{len(out) + 1}"
                out.append({"parent": ref, "c": c["c"], "t": c["t"], "box": c["b"]})
        for j, c in enumerate(T.kids(n)):
            rec(c, c.get("_ref") or f"{ref}_{j}")
    rec(pred, "n")
    return out


test = [json.loads(l) for l in open(f"{info['data']}/test.jsonl")][:3]
parity = []
for r in test:
    t = r["tree"]
    part = T.prefix_tree(t, V.partial_size(len(V.preorder(t)), 0.5), "dfs")
    parity.append({"tree": part, "expected": predict_children(part), "first": first_steps(part),
                   "complete": complete_order(T.recursive_complete(m, part), part)})
json.dump(parity, open("model/recursive-layout.parity.json", "w"))
print(f"→ model/recursive-layout.json ({os.path.getsize('model/recursive-layout.json') / 1e6:.1f} MB), parity {sum(len(p['expected']) for p in parity)} container")
