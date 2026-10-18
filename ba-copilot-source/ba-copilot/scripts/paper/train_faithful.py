"""Huấn luyện Recursive Transformer đúng phương pháp Li et al. 2020 (mục 4.1, 4.4, 5.3) cho tính năng Gợi ý của app (phương án B).

Đúng bài báo: e = e_b + e_c + e_t (khung bao là positional embedding, KHÔNG cộng vị trí chuỗi); self-attention trên cha + anh em
(Eq.9) rồi chú ý trạng thái ẩn tầng cuối của tổ tiên (Eq.10); softmax riêng cho c, t, x, y, x2, y2 và EOS (Eq.7), tọa độ là lớp
rời rạc, cross-entropy thường (không làm mềm nhãn); huấn luyện trên cây đầy đủ, thứ tự con giữ như cấu trúc cây (không xáo trộn);
chọn cấu hình theo tập val; giải mã tham lam, không ràng buộc.
Khác bài báo (ghi rõ): lưới tọa độ khổ web 128 ô ngang × ô dọc 20 px (bài báo 72×128 cho điện thoại); dò hidden {128, 256} ×
số lớp {2, 4, 6} (bài báo thêm 512 – bỏ vì CPU); dừng sớm theo val loss; "canvas" là vector học được làm trạng thái tổ tiên của gốc.
Dữ liệu: data/paper-w7c20-r300 (300 màn gốc web, 7 độ rộng; chia theo màn gốc) – bản 200 màn: data/paper-w7c20.
Chỉ dữ liệu của nhóm, không WebSight.
Dùng: python3 scripts/paper/train_faithful.py [--data=data/paper-w7c20-r300]
      → model/recursive-layout.pt + dataset/export/eval/recursive-faithful.json
"""
import json, os, sys, time
import torch
sys.path.insert(0, os.path.dirname(__file__))
import tree_decoders as T  # noqa: E402
import coords_experiment as C  # noqa: E402

D = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--data=")), "data/paper-w7c20-r300")
torch.set_num_threads(os.cpu_count() or 4)
train, val, test = (C.load(f"{D}/{s}.jsonl") for s in ("train", "val", "test"))
val1280 = [r for r in val if r["width"] == 1280]
search, best = [], None
for d in (128, 256):
    for L in (2, 4, 6):
        t0 = time.time()
        m, vl, hist = T.train_model("recursive", train, val, d, L, 80, 8, 1e-3, 42, use_pos=False)
        n = sum(p.numel() for p in m.parameters())
        search.append({"d": d, "layers": L, "val_loss": round(vl, 4), "epochs": len(hist), "params": n, "seconds": round(time.time() - t0, 1)})
        print(f"d={d} L={L}: val loss {vl:.4f} · {len(hist)} epoch · {n:,} tham số · {time.time() - t0:.0f}s", flush=True)
        if best is None or vl < best[1]:
            best = (m, vl, d, L)
m, vl, d, L = best
print(f"chọn d={d} L={L}", flush=True)
os.makedirs("model", exist_ok=True)
torch.save(m.state_dict(), "model/recursive-layout.pt")
old_test = [r for r in test if int(r["rootId"][1:]) <= 200]  # cùng 22 cây test của bản 200 màn – so sánh trước/sau
res = {"val": {"next": C.next_metrics(m, val1280, False), "insert": C.insertion_metrics(m, val1280, False)},
       "test": {"next": C.next_metrics(m, test, False), "insert": C.insertion_metrics(m, test, False)},
       "paper_metrics_test": T.evaluate(lambda t, part, k, order: T.recursive_complete(m, part), [r["tree"] for r in test]),
       "test_old_roots": {"n": len(old_test), "next": C.next_metrics(m, old_test, False), "insert": C.insertion_metrics(m, old_test, False),
                          "paper_metrics": T.evaluate(lambda t, part, k, order: T.recursive_complete(m, part), [r["tree"] for r in old_test])}}
json.dump({"data": D, "train_trees": len(train), "val_trees": len(val), "test_trees": len(test), "chosen": {"d": d, "layers": L, "val_loss": round(vl, 4)}, "search": search, **res},
          open("dataset/export/eval/recursive-faithful.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: res[k] for k in ("val", "test")}, ensure_ascii=False))
