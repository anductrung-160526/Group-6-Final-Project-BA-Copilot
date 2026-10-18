"""Đóng gói dataset/export/websight thành Parquet theo kiểu WebSight: cột image (PNG bytes), text (HTML), llm_generated_idea,
cùng các cột riêng (id, split, group, screenKind, domain, permission, layout, actor, tree). Đọc bằng datasets.load_dataset("parquet", ...).
Dùng: python3 scripts/dataset/websight_parquet.py"""
import json, os
import pyarrow as pa, pyarrow.parquet as pq

d = os.path.join(os.path.dirname(__file__), "..", "..", "dataset", "export", "websight")
rows = [json.loads(l) for l in open(os.path.join(d, "metadata.jsonl"), encoding="utf8") if l.strip()]
for split in ("train", "val", "test"):
    part = [r for r in rows if r["split"] == split]
    table = pa.table({
        "image": [{"bytes": open(os.path.join(d, r["image"]), "rb").read(), "path": os.path.basename(r["image"])} for r in part],
        "text": [open(os.path.join(d, r["html"]), encoding="utf8").read() for r in part],
        "llm_generated_idea": [r["llm_generated_idea"] for r in part],
        **{k: [r[k] for r in part] for k in ("id", "group", "screenKind", "domain", "permission", "layout", "actor")},
        "tree": [json.dumps(r["tree"], ensure_ascii=False) for r in part],
    })
    pq.write_table(table, os.path.join(d, f"{split}.parquet"))
    print(split, len(part))
