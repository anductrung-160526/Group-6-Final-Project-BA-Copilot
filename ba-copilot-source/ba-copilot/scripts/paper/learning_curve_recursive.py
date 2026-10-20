# Đường học của Recursive: huấn luyện trên 25/50/75/100% màn gốc train (tập val/test giữ nguyên). Dùng: python3 scripts/paper/learning_curve_recursive.py <thư mục chứa paper25..paper100>
import sys, json
sys.path.insert(0, "scripts/paper")
import tree_decoders as T, torch
torch.set_num_threads(4)
S = sys.argv[1]
for f in (25, 50, 75, 100):
    tr, va, te = (T.load(f"{S}/paper{f}/{s}.jsonl") for s in ("train", "val", "test"))
    m, vl, h = T.train_model("recursive", tr, va, 128, 2, 80, 8, 1e-3, 42)
    r = T.evaluate(lambda t, part, k, o: T.recursive_complete(m, part), [x["tree"] for x in te])
    avg = lambda key: round(sum(v[key] for v in r.values()) / len(r), 1)
    print(f"recursive {f}% ({len(tr)} cây): val loss {vl:.3f} · TB 6 thiết lập: F1 nới lỏng {avg('f1_relaxed')} · Next nới lỏng {avg('next_relaxed')} · Edit nới lỏng {avg('edit_relaxed')} · F1 chặt {avg('f1_strict')}", flush=True)
