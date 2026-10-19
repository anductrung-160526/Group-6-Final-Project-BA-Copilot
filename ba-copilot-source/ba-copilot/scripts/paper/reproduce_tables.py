"""Tái lập 3 bảng đánh giá của Li et al. 2020 (arXiv:2001.05308, mục 5.3) trên bộ cây UI web của nhóm.

  Table 1 – luồng thiết kế BFS:                         Pointer, Recursive
  Table 2 – luồng thiết kế DFS:                         Vanilla, Pointer, Recursive
  Table 3 – luồng BFS, thứ tự không gian ngẫu nhiên:    Pointer, Recursive (huấn luyện và chấm với thứ tự anh em xáo trộn)
  Mỗi ô: F1 (%) cặp cha–con, Next (%) phần tử kế tiếp, Edit (giây KLM) khoảng cách sửa cây; cây dở 10% / 50% / 80%.

Theo bài báo:
  - Thước đo chặt như bài báo: một node "khớp" khi đúng loại VÀ đúng cả 4 tọa độ khung bao (mục 5.2).
  - Next: phần tử đầu tiên mô hình sinh sau tiền tố BFS/DFS so với phần tử kế tiếp thật.
  - Edit: Zhang–Shasha, chi phí theo KLM (chèn / đổi / xóa tối thiểu).
  - Khung bao là positional embedding (Eq.4–5) cho Pointer và Recursive; giải mã tham lam; chọn cấu hình theo val loss.
Khác bài báo (thiết kế của nhóm, ghi rõ trong báo cáo):
  - Dữ liệu: cây UI web của nhóm (400 màn gốc, 7 độ rộng; lưới 128 × ô dọc 20 px), không phải Rico 72 × 128.
  - Chia 70/15/15 theo màn gốc, phân tầng theo nhóm màn (bài báo 80/10/10 ngẫu nhiên).
  - Lưới siêu tham số mặc định hidden {128, 256} × số lớp {2, 4} (bài báo {128, 256, 512} × {2, 4, 6}) vì chạy trên CPU.
  - Vanilla giữ embedding vị trí trong chuỗi (token ngoặc không có tọa độ).
  - Pointer huấn luyện một mô hình trên cả chuỗi BFS và DFS cho Table 1–2 (bài báo không nói rõ); Table 3 dùng chuỗi BFS xáo trộn.
  - Kèm thêm bản "nới lỏng" (chỉ xét loại) ở mục 6 của bài báo và mốc "không gợi ý" (giữ nguyên cây dở).

Dùng: python3 scripts/paper/reproduce_tables.py [--data data/paper-s701515] [--grid 128,256:2,4] [--only vanilla,pointer,recursive,pointer_rso,recursive_rso]
      → dataset/export/eval/paper-tables.json + PAPER-TABLES.md (chạy lại sẽ bỏ qua mô hình đã có, trừ khi --force)
"""
import argparse
import json
import os
import sys
import time

import torch

sys.path.insert(0, os.path.dirname(__file__))
import tree_decoders as T  # noqa: E402
import vanilla as V  # noqa: E402

PAPER = {  # số liệu in trong bài báo: (F1, Next, Edit) ở 10% / 50% / 80%
    "Table 1": {"Pointer": [(11.19, 12.25, 87.40), (61.31, 16.76, 35.78), (87.24, 27.56, 13.55)],
                "Recursive": [(15.23, 18.4, 71.26), (64.07, 26.84, 46.47), (86.41, 36.58, 27.22)]},
    "Table 2": {"Vanilla": [(5.35, 0.74, 234.17), (40.4, 5.35, 138.88), (68.82, 17.03, 84.32)],
                "Pointer": [(13.12, 20.21, 76.44), (65.49, 12.03, 21.41), (88.96, 22.38, 9.13)],
                "Recursive": [(15.05, 29.02, 62.49), (60.79, 22.93, 52.26), (84.65, 33.16, 34.24)]},
    "Table 3": {"Pointer": [(11.19, 12.25, 87.40), (61.31, 16.76, 35.78), (87.24, 27.56, 13.55)],
                "Recursive": [(15.23, 18.4, 71.26), (70.0, 17.0, 22.46), (91.8, 30.47, 11.79)]},
}
TABLES = {  # bảng → (luồng, [(tên hiển thị, khóa mô hình)], xáo trộn khi chấm)
    "Table 1": ("BFS", [("Pointer", "pointer"), ("Recursive", "recursive")], False),
    "Table 2": ("DFS", [("Vanilla", "vanilla"), ("Pointer", "pointer"), ("Recursive", "recursive")], False),
    "Table 3": ("BFS", [("Pointer", "pointer_rso"), ("Recursive", "recursive_rso")], True),
}
SHUFFLE_SEED = 1000


def train_kind(kind, train, val, grid, a):
    ds, ls = grid.split(":")
    search, best = [], None
    for d in map(int, ds.split(",")):
        for L in map(int, ls.split(",")):
            s = time.time()
            if kind == "vanilla":
                m, vl, hist = V.train_one(train, val, d, L, a.epochs, a.patience, a.lr, a.seed)
            else:
                base = kind.replace("_rso", "")
                rso = kind.endswith("_rso")
                m, vl, hist = T.train_model(base, train, val, d, L, a.epochs, a.patience, a.lr, a.seed, use_pos=False, shuffle=rso,
                                            orders=("bfs",) if (rso and base == "pointer") else ("bfs", "dfs"))
            m.eval()
            params = sum(p.numel() for p in m.parameters())
            search.append({"d": d, "layers": L, "val_loss": round(vl, 4), "epochs": len(hist), "params": params, "seconds": round(time.time() - s, 1)})
            print(f"{kind} d={d} L={L}: val loss {vl:.4f} · {len(hist)} epoch · {params:,} tham số · {time.time() - s:.0f}s", flush=True)
            if best is None or vl < best[1]:
                best = (m, vl, d, L, params)
    return best, search


def completer(kind, m):
    if kind == "vanilla":
        return lambda t, part, k, order: T.vanilla_complete(m, t, k)
    if kind.startswith("pointer"):
        return lambda t, part, k, order: T.pointer_complete(m, part, order)
    return lambda t, part, k, order: T.recursive_complete(m, part)


def write_md(rep, path):
    L = ["# Tái lập 3 bảng đánh giá của Li et al. 2020 trên dữ liệu UI web của nhóm", ""]
    d = rep["data"]
    L += [f"- Dữ liệu `{rep['dataDir']}`: train {d['train']} cây / val {d['val']} cây / test {d['test']} cây "
          f"({d['roots']['train']} / {d['roots']['val']} / {d['roots']['test']} màn gốc, chia 70/15/15 theo màn gốc, phân tầng theo nhóm màn).",
          "- Mỗi ô: **F1** cặp cha–con (%) · **Next** phần tử kế tiếp (%) · **Edit** khoảng cách sửa cây (giây KLM). F1, Next càng cao càng tốt; Edit càng thấp càng tốt.",
          "- Thước đo **chặt** như bài báo: khớp khi đúng loại và đúng cả 4 tọa độ khung bao. Bản **nới lỏng** (chỉ xét loại, mục 6 bài báo) để tham khảo.",
          "- Số của bài báo đo trên Rico (điện thoại, 55 nghìn màn, lưới 72 × 128). Hai bên khác dữ liệu, khác lưới tọa độ, khác đơn vị Edit, nên **chỉ so xu hướng**, không so trực tiếp con số.", ""]
    for tab, (flow, models, rso) in TABLES.items():
        title = {"Table 1": "Luồng thiết kế BFS", "Table 2": "Luồng thiết kế DFS", "Table 3": "Luồng BFS, thứ tự không gian ngẫu nhiên"}[tab]
        L += [f"## {tab} – {title}", ""]
        for strict, tag in ((True, "chặt (như bài báo)"), (False, "nới lỏng (chỉ loại)")):
            L += [f"**Kết quả của nhóm – {tag}**", "", f"| Mô hình | {flow} 10% F1 | Next | Edit | {flow} 50% F1 | Next | Edit | {flow} 80% F1 | Next | Edit |", "|---|" + "---|" * 9]
            k = "strict" if strict else "relaxed"
            none_row = None
            for name, key in models:
                r = rep["models"].get(key, {}).get("test", {})
                cells = []
                for f in (10, 50, 80):
                    c = r.get(f"{flow} {f}%")
                    cells += [f"{c[f'f1_{k}']:.2f}", f"{c[f'next_{k}']:.2f}", f"{c[f'edit_{k}']:.2f}"] if c else ["–"] * 3
                    if c and none_row is None:
                        none_row = []
                L.append(f"| {name} | " + " | ".join(cells) + " |")
            base = next((rep["models"][key]["test"] for _, key in models if key in rep["models"]), None)
            if base:
                cells = []
                for f in (10, 50, 80):
                    c = base[f"{flow} {f}%"]
                    cells += [f"{c[f'none_f1_{k}']:.2f}", "–", f"{c[f'none_edit_{k}']:.2f}"]
                L.append("| *Không gợi ý (giữ cây dở)* | " + " | ".join(cells) + " |")
            L.append("")
        L += ["**Số trong bài báo (Rico)**", "", f"| Mô hình | {flow} 10% F1 | Next | Edit | {flow} 50% F1 | Next | Edit | {flow} 80% F1 | Next | Edit |", "|---|" + "---|" * 9]
        for name, row in PAPER[tab].items():
            L.append(f"| {name} | " + " | ".join(f"{v}" for cell in row for v in cell) + " |")
        L.append("")
        if tab == "Table 3":
            L += ["*Ghi chú:* trong bài báo, hàng Pointer của Table 3 trùng hệt Table 1; bảng trên chép đúng như bản in.", ""]
    L += ["## Mô hình được chọn (theo val loss)", "", "| Mô hình | hidden | Số lớp | Tham số | Val loss | Lưới đã dò |", "|---|---|---|---|---|---|"]
    for key, v in rep["models"].items():
        ch = v["chosen"]
        L.append(f"| {key} | {ch['d']} | {ch['layers']} | {ch['params']:,} | {ch['val_loss']} | " + ", ".join(f"{s['d']}×{s['layers']}: {s['val_loss']}" for s in v["search"]) + " |")
    L += ["", "Tái lập: `python3 scripts/paper/reproduce_tables.py --data data/paper-s701515` (dữ liệu dựng bằng `scripts/paper/build-dataset.ts`, xem README).", ""]
    open(path, "w").write("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/paper-s701515")
    ap.add_argument("--grid", default="128,256:2,4")
    ap.add_argument("--only", default="vanilla,pointer,recursive,pointer_rso,recursive_rso")
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--patience", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--threads", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--out", default="dataset/export/eval/paper-tables")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    train, val, test = (T.load(f"{a.data}/{s}.jsonl") for s in ("train", "val", "test"))
    tests = [r["tree"] for r in test]
    rep = json.load(open(a.out + ".json")) if os.path.exists(a.out + ".json") and not a.force else {"models": {}}
    rep["dataDir"] = a.data
    rep["data"] = {"train": len(train), "val": len(val), "test": len(test),
                   "roots": {k: len({r["rootId"] for r in v}) for k, v in (("train", train), ("val", val), ("test", test))}}
    for kind in a.only.split(","):
        if kind in rep["models"] and not a.force:
            print(f"{kind}: đã có, bỏ qua", flush=True)
            continue
        t0 = time.time()
        (m, vl, d, L, params), search = train_kind(kind, train, val, a.grid, a)
        torch.save(m.state_dict(), os.path.join(a.data, f"{kind}.pt"))
        rso = kind.endswith("_rso")
        orders = ("dfs",) if kind == "vanilla" else ("bfs",) if rso else ("bfs", "dfs")
        res = T.evaluate(completer(kind, m), tests, orders=orders, shuffle_seed=SHUFFLE_SEED if rso else None)
        rep["models"][kind] = {"chosen": {"d": d, "layers": L, "val_loss": round(vl, 4), "params": params}, "search": search, "test": res, "seconds": round(time.time() - t0, 1)}
        print(kind, json.dumps(res, ensure_ascii=False), flush=True)
        os.makedirs(os.path.dirname(a.out), exist_ok=True)
        json.dump(rep, open(a.out + ".json", "w"), ensure_ascii=False, indent=1)
        write_md(rep, os.path.join(os.path.dirname(a.out), "PAPER-TABLES.md"))
    write_md(rep, os.path.join(os.path.dirname(a.out), "PAPER-TABLES.md"))


if __name__ == "__main__":
    main()
