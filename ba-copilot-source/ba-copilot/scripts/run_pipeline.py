"""Quy trình đầy đủ, từng bước, để tái lập hai mô hình phân tích của BA Copilot trong MỘT file:

  * Transformer – Recursive Transformer Tree Decoder (Li et al. 2020, arXiv:2001.05308) cho gợi ý bố cục,
    kèm hai mô hình tham chiếu của bài báo (Pointer, Vanilla) → Bảng 1–3 (dataset/export/eval/TRANSFORMER-RESULTS.md).
  * NLP – bộ chấm chất lượng user story theo AQUSA (Lucassen et al. 2016) → Bảng 4–5 (dataset/export/eval/QUS-AQUSA.md).

File này KHÔNG viết lại thuật toán: mỗi bước gọi đúng script gốc trong repo (đường dẫn ghi ở từng bước), để kết quả trùng với
số trong báo cáo. Chú giải ở mỗi bước nói bước đó làm gì, đầu vào/đầu ra, và phần nào theo bài báo, phần nào là thiết kế của nhóm.

Chạy từ ba-copilot-source/ba-copilot:
  python3 scripts/run_pipeline.py --list                 # liệt kê các bước
  python3 scripts/run_pipeline.py --steps nlp            # chỉ NLP (nhanh, chạy được ngay với dữ liệu trong repo)
  python3 scripts/run_pipeline.py --steps eval           # chấm lại Bảng 1–3 từ trọng số đã có
  python3 scripts/run_pipeline.py --steps all            # toàn bộ, từ tải WebSight tới bảng kết quả (nhiều giờ trên CPU)
  python3 scripts/run_pipeline.py --steps 4,5,6 --dry-run  # in lệnh, không chạy
Trên Windows dùng `python` thay cho `python3`; các bước dùng Node gọi qua `npx` (cần Node ≥ 22.13 và `npm install`).

Yêu cầu:
  - Python 3.10+, torch (pip install torch); bước 1 cần thêm: pip install datasets beautifulsoup4.
  - Bước 2–3 render màn bằng Chromium qua Playwright: đặt biến CHROME trỏ tới chrome (vd /opt/pw-browsers/.../chrome).
  - Thư mục data/ bị gitignore: dữ liệu và trọng số (.pt) chỉ có sau khi chạy bước 1–5. Mô hình đã xuất cho app
    (backend/model/recursive-layout.json) và bộ dữ liệu NLP (dataset/qus-eval/) có sẵn trong repo.
"""
import argparse
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PY = sys.executable
NPX = "npx.cmd" if os.name == "nt" else "npx"

# Cấu hình chung của mô hình trong app (đã chọn theo val loss trước đó): hidden 256 × 4 lớp, không embedding vị trí (đúng bài báo),
# lưới 32 cột × ô cao 40 px (G2, ngoài bài báo). Bảy độ rộng màn hình khi render (test chỉ dùng 1280 px).
WIDTHS = "768,1024,1280,1366,1440,1600,1920"
GRID = ["--cell-x", "32", "--cell-y", "40", "--gy", "128"]
WS = "data/ws-G2"                      # dữ liệu tiền huấn luyện (WebSight)
FT = "data/sn80-G2-w7-r800-aug2"       # dữ liệu tinh chỉnh (785 màn gốc của nhóm + tăng cường ×2)
TRAIN = [PY, "scripts/paper/strict_next_experiment.py", "--threads", os.environ.get("THREADS", "4"), "--no-pos", "--grid", "256:4"]
LOG = "dataset/export/eval/data-limited"
OUT = "dataset/export/eval/transformer"


def steps():
    """Danh sách bước: (mã, nhóm, tiêu đề, chú giải, [lệnh...])."""
    return [
        # ------------------------------------------------------------------ TRANSFORMER: DỮ LIỆU
        ("1", "data", "Tải WebSight và chuyển HTML sang cây UI",
         "scripts/websight_to_trees.py – tải 30.000 trang HTML của HuggingFaceM4/WebSight (v0.2, streaming, không tải ảnh) và chuyển\n"
         "mỗi trang sang cây UINode với 28 loại component của app. Đầu ra data/corpus/websight.jsonl (lần chạy của nhóm: 24.784 cây\n"
         "hợp lệ). WebSight là dữ liệu NGOÀI bài báo (bài báo dùng Rico), chỉ dùng để tiền huấn luyện.",
         [[PY, "scripts/websight_to_trees.py", "--n", "30000", "--out", "data/corpus/websight.jsonl"]]),
        ("2", "data", "Dựng bộ tiền huấn luyện WebSight (data/ws-G2)",
         "scripts/paper/build-dataset.ts --trees – render từng cây WebSight bằng Renderer của app trong Chromium ở một độ rộng (chọn\n"
         "theo băm trong 7 độ rộng), đo khung bao từng phần tử, rời rạc hóa lên lưới 32 × 40 px. Lọc như bài báo: bỏ cây có node\n"
         "ẩn/ra ngoài cha, > 100 node hoặc cha > 30 con. ~2% vào val để dừng sớm. Đầu ra train/val.jsonl (23.382 cây train).",
         [[NPX, "tsx", "scripts/paper/build-dataset.ts", "--widths", WIDTHS, *GRID, "--trees", "data/corpus/websight.jsonl", "--out", WS]]),
        ("3", "data", "Dựng bộ tinh chỉnh từ 785 màn gốc của nhóm (data/sn80-G2-w7-r800-aug2)",
         "scripts/paper/build-dataset.ts – render dataset/roots/*.json (màn web nghiệp vụ do nhóm soạn) ở 7 độ rộng; chia 80/10/10\n"
         "THEO MÀN GỐC (mọi biến thể của một màn cùng tập). --aug 2: thêm 2 biến thể bố cục cho mỗi màn train (đổi độ dài chữ, số dòng\n"
         "bảng, khoảng cách Row, chiều cao ảnh; giữ nguyên cấu trúc cây) – tăng cường NGOÀI bài báo. Test: 38 màn ở 1280 px.\n"
         "Đầu ra train/val/test.jsonl (13.168 cây train).",
         [[NPX, "tsx", "scripts/paper/build-dataset.ts", "--widths", WIDTHS, *GRID, "--aug", "2", "--out", FT]]),
        # ------------------------------------------------------------------ TRANSFORMER: MÔ HÌNH CỦA APP (RECURSIVE)
        ("4", "train", "Tiền huấn luyện Recursive trên WebSight",
         "scripts/paper/strict_next_experiment.py → tree_decoders.Recursive (§4.4 của bài báo): mỗi container giải mã danh sách con\n"
         "riêng, bộ nhớ là trạng thái ẩn của tổ tiên (Eq. 10); embedding e = e_b + e_c + e_t (không embedding vị trí). Tối đa 10 epoch,\n"
         "dừng sớm sau 3 epoch không giảm val loss. Trọng số: data/ws-G2/models/P-websight.pt.",
         [[*TRAIN, "--data", WS, "--epochs", "10", "--patience", "3", "--out", f"{LOG}/P-websight.json"]]),
        ("5", "train", "Tinh chỉnh Recursive trên 785 màn gốc (mô hình cuối của app)",
         "Khởi tạo từ trọng số bước 4, lr 3e-4, dropout 0.2 (ngoài bài báo). Chọn theo val loss; --eval-test chấm test 38 màn MỘT lần.\n"
         "Trọng số: data/sn80-G2-w7-r800-aug2/models/final.pt; nhật ký: dataset/export/eval/data-limited/final.json.",
         [[*TRAIN, "--data", FT, "--dropout", "0.2", "--init", f"{WS}/models/P-websight.pt", "--lr", "3e-4", "--eval-test", "--test-new",
           "--out", f"{LOG}/final.json"]]),
        ("6", "eval", "Chấm Bảng 1–3 cho mô hình của app",
         "scripts/paper/eval_app_model.py – giao thức §5 của bài báo: cho mô hình 10/50/80% cây đúng theo BFS hoặc DFS, mô hình tự\n"
         "hoàn thiện phần còn lại. F1 = cặp cha–con; Next = đoán đúng phần tử kế tiếp; Edit = khoảng cách sửa cây Zhang–Shasha quy\n"
         "đổi KLM (giây). Thang chặt: đúng loại và đúng cả 4 tọa độ. Bảng 3: xáo thứ tự anh em (seed 0).\n"
         "Đầu ra dataset/export/eval/transformer/app-model.json.",
         [[PY, "scripts/paper/eval_app_model.py", "--data", FT, "--kind", "recursive", "--weights", f"{FT}/models/final.pt",
           "--out", f"{OUT}/app-model.json"]]),
        ("7", "export", "Xuất trọng số sang JSON cho app",
         "scripts/paper/export_recursive.py – ghi backend/model/recursive-layout.json (tensor float32 base64 + cấu hình lưới) và mẫu đối chiếu\n"
         "backend/model/recursive-layout.parity.json. App suy luận bằng TypeScript (shared/recursive.ts); backend/tests/recursive.test.ts kiểm tra\n"
         "kết quả TypeScript khớp PyTorch (sai số xác suất < 1e-3).",
         [[PY, "scripts/paper/export_recursive.py", "--result", f"{LOG}/final.json"]]),
        # ------------------------------------------------------------------ TRANSFORMER: MÔ HÌNH THAM CHIẾU
        ("8", "reference", "Huấn luyện và chấm Pointer (§4.3) – cùng quy trình",
         "Như bước 4–6 nhưng --kind pointer: giải mã cả cây thành một chuỗi, mỗi phần tử 'trỏ' về cha. Dropout 0.2.\n"
         "Đầu ra dataset/export/eval/transformer/pointer.json.",
         [[*TRAIN, "--kind", "pointer", "--data", WS, "--epochs", "10", "--patience", "3", "--dropout", "0.2", "--out", f"{OUT}/train-logs/pointer-websight.json"],
          [*TRAIN, "--kind", "pointer", "--data", FT, "--dropout", "0.2", "--init", f"{WS}/models/pointer-websight.pt", "--lr", "3e-4", "--eval-test",
           "--out", f"{OUT}/train-logs/pointer-final.json"],
          [PY, "scripts/paper/eval_app_model.py", "--data", FT, "--kind", "pointer", "--weights", f"{FT}/models/pointer-final.pt", "--out", f"{OUT}/pointer.json"]]),
        ("9", "reference", "Huấn luyện và chấm Vanilla (§4.2) – cùng quy trình",
         "Như bước 4–6 nhưng --kind vanilla (scripts/paper/vanilla.py): duỗi cây theo DFS với token đóng container; chỉ có luồng DFS,\n"
         "như bài báo. Đầu ra dataset/export/eval/transformer/vanilla.json.",
         [[*TRAIN, "--kind", "vanilla", "--data", WS, "--epochs", "10", "--patience", "3", "--out", f"{OUT}/train-logs/vanilla-websight.json"],
          [*TRAIN, "--kind", "vanilla", "--data", FT, "--init", f"{WS}/models/vanilla-websight.pt", "--lr", "3e-4", "--eval-test",
           "--out", f"{OUT}/train-logs/vanilla-final.json"],
          [PY, "scripts/paper/eval_app_model.py", "--data", FT, "--kind", "vanilla", "--weights", f"{FT}/models/vanilla-final.pt", "--out", f"{OUT}/vanilla.json"]]),
        # ------------------------------------------------------------------ NLP: AQUSA / QUS
        ("10", "nlp", "Chấm Bảng 4–5 của bộ chấm NLP trên 671 story",
         "scripts/qus-eval/eval.ts → shared/aqusa.ts: tách story thành vai trò / hành động / lý do theo cụm chỉ dấu, gán từ loại bằng\n"
         "wink-nlp, chạy 5 bộ phân tích AQUSA (well-formed, atomic, minimal trên từng story; uniform, unique trong từng bộ). So với nhãn\n"
         "đa số của 3 người gán độc lập (dataset/qus-eval/labels.jsonl, Fleiss' κ 0,98); tính recall/precision micro, macro, từng tiêu\n"
         "chí và khoảng tin cậy bootstrap (ngoài bài báo). Đầu ra dataset/export/eval/qus/all.json.",
         [[NPX, "tsx", "scripts/qus-eval/eval.ts", "--split", "all"]]),
        ("11", "nlp", "Chấm Bảng 4–5 trên tập held-out test3 (345 story)",
         "Như bước 10 trên 5 dự án g10–g14 chưa từng dùng khi xây luật của nhóm – đo khả năng tổng quát. Chấm một lần với cùng cấu hình.\n"
         "Đầu ra dataset/export/eval/qus/test3.json.",
         [[NPX, "tsx", "scripts/qus-eval/eval.ts", "--split", "test3"]]),
        # ------------------------------------------------------------------ KIỂM THỬ
        ("12", "test", "Kiểm thử đơn vị của hai mô hình",
         "backend/tests/aqusa.test.ts (mỗi luật của nhóm có ví dụ) và backend/tests/recursive.test.ts (TypeScript khớp PyTorch, chèn theo khe).",
         [[NPX, "tsx", "--test", "backend/tests/aqusa.test.ts", "backend/tests/recursive.test.ts"]]),
    ]


GROUPS = {
    "all": None,
    "transformer": {"data", "train", "eval", "export", "reference"},
    "data": {"data"}, "train": {"train"}, "eval": {"eval"}, "export": {"export"}, "reference": {"reference"},
    "nlp": {"nlp"}, "test": {"test"},
}


def select(spec, all_steps):
    out = []
    for part in spec.split(","):
        part = part.strip()
        if part in GROUPS:
            g = GROUPS[part]
            out += [s for s in all_steps if g is None or s[1] in g]
        else:
            out += [s for s in all_steps if s[0] == part]
    seen = set()
    return [s for s in out if not (s[0] in seen or seen.add(s[0]))]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--steps", default="nlp", help="all | transformer | data | train | eval | export | reference | nlp | test | danh sách số, vd 4,5,6")
    ap.add_argument("--list", action="store_true", help="liệt kê các bước rồi thoát")
    ap.add_argument("--dry-run", action="store_true", help="chỉ in lệnh")
    a = ap.parse_args()
    os.chdir(ROOT)
    all_steps = steps()
    if a.list:
        for code, group, title, note, _ in all_steps:
            print(f"[{code:>2}] ({group}) {title}\n     " + note.replace("\n", "\n     ") + "\n")
        return
    chosen = select(a.steps, all_steps)
    if not chosen:
        sys.exit(f"Không có bước nào khớp '{a.steps}' (xem --list)")
    if not a.dry_run and shutil.which(NPX) is None and any(c[0] == NPX for s in chosen for c in s[4]):
        sys.exit("Không tìm thấy npx – cài Node ≥ 22.13 rồi chạy `npm install` trong ba-copilot-source/ba-copilot")
    for code, group, title, note, cmds in chosen:
        print(f"\n=== Bước {code} ({group}): {title}\n    " + note.replace("\n", "\n    "))
        for cmd in cmds:
            print("  $ " + " ".join(cmd))
            if a.dry_run:
                continue
            t0 = time.time()
            r = subprocess.run(cmd)
            if r.returncode != 0:
                sys.exit(f"Bước {code} lỗi (mã {r.returncode}) – dừng.")
            print(f"  ✓ {time.time() - t0:.0f} s")
    print("\nXong. Bảng kết quả: dataset/export/eval/TRANSFORMER-RESULTS.md (Bảng 1–3), dataset/export/eval/QUS-AQUSA.md (Bảng 4–5).")


if __name__ == "__main__":
    main()
