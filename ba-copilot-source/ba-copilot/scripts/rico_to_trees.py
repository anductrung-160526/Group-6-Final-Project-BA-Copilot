"""Chuyển Rico semantic annotations (Liu et al. 2018 – bộ dữ liệu mà Li et al. 2020 dùng) sang cây UINode
của BA Copilot (28 loại component).

Tải:   curl -O https://storage.googleapis.com/crowdstf-rico-uiuc-4540/rico_dataset_v0.1/semantic_annotations.zip
       unzip -q semantic_annotations.zip -d data/rico
Chạy:  python scripts/rico_to_trees.py --dir data/rico/semantic_annotations --out data/corpus/rico.jsonl

Quy tắc chuyển (Rico là app di động, không có Form/Row như web nên dựng lại theo bố cục):
- 25 nhãn componentLabel → loại tương ứng (Text Button → Button/Link, Input → Input/Checkbox, Toolbar → Header,
  Drawer → Sidebar, List Item liên tiếp → List, Pager Indicator → Pagination...). Bỏ quảng cáo.
- Con được sắp theo vị trí (trên→dưới, trái→phải); các phần tử cùng một hàng ngang gộp thành Row.
- Đoạn liên tục chứa ô nhập (Input/Checkbox/Radio/DatePicker) và nút ngay sau đó gộp thành Form.
- Lọc như bài báo: bỏ màn quá lớn (> 80 node) hoặc quá nhỏ (< 3 node), bỏ màn trùng cấu trúc.
"""
import argparse
import json
import os
import re

MEDIA = {"Image", "Background Image", "Web View", "Map View", "Video"}
FIELD = {"Input", "Checkbox", "Radio", "DatePicker", "Select"}
LINKY = re.compile(r"forgot|sign ?up|register|create (an )?account|terms|privacy|learn more|already have|log ?in instead|skip", re.I)
_counter = [0]


def nid(prefix):
    _counter[0] += 1
    return f"{prefix}_{_counter[0]}"


def tail(rid):
    return (rid or "").split("/")[-1]


def words(s):
    return re.sub(r"[_\-.]+", " ", re.sub(r"([a-z])([A-Z])", r"\1 \2", s or "")).strip().lower()


def input_type(hint):
    if re.search(r"pass|pwd|pin\b", hint):
        return "password"
    if re.search(r"e ?mail", hint):
        return "email"
    if re.search(r"phone|mobile|tel\b", hint):
        return "tel"
    if re.search(r"age|height|weight|amount|qty|quantity|price|number|zip|code\b", hint):
        return "number"
    return "text"


def leaf(n):
    lb = n.get("componentLabel")
    text = (n.get("text") or "").strip()[:40]
    rid = tail(n.get("resource-id"))
    if lb == "Text":
        return {"type": "Text", "props": {"text": text or "Text"}}
    if lb in MEDIA:
        return {"type": "Image", "props": {"alt": words(rid) or "image"}}
    if lb == "Icon":
        icon = n.get("iconClass") or words(rid) or "icon"
        if icon == "avatar":
            return {"type": "Avatar", "props": {"name": "user"}}
        if n.get("clickable"):
            return {"type": "Button", "props": {"label": icon, "variant": "ghost", "action": icon, "icon": True}}
        return {"type": "Image", "props": {"alt": icon}}
    if lb == "Text Button":
        label = text or words(rid) or (n.get("textButtonClass") or "button")
        if LINKY.search(label):
            return {"type": "Link", "props": {"text": label, "navigateTo": "#"}}
        return {"type": "Button", "props": {"label": label, "action": n.get("textButtonClass") or words(label).replace(" ", "_")[:20]}}
    if lb == "Input":
        hint = words(rid) + " " + text.lower()
        if re.search(r"check|\bcb\b|cb |is selected", hint):
            return {"type": "Checkbox", "props": {"label": text or words(rid), "name": rid}}
        if re.search(r"search", hint):
            return {"type": "Input", "props": {"label": "Search", "name": "keyword", "inputType": "text", "placeholder": text or "Search"}}
        return {"type": "Input", "props": {"label": text or words(rid) or "field", "name": rid, "inputType": input_type(hint)}}
    if lb in ("Checkbox", "On/Off Switch"):
        return {"type": "Checkbox", "props": {"label": text or words(rid), "name": rid}}
    if lb == "Radio Button":
        return {"type": "Radio", "props": {"label": text or words(rid), "name": rid, "options": [text or "option"]}}
    if lb == "Date Picker":
        return {"type": "DatePicker", "props": {"label": text or "date", "name": rid}}
    if lb in ("Slider", "Number Stepper"):
        return {"type": "Input", "props": {"label": words(rid) or "value", "name": rid, "inputType": "number"}}
    if lb == "Pager Indicator":
        return {"type": "Pagination", "props": {}}
    return None


CONTAINER = {"Toolbar": "Header", "Drawer": "Sidebar", "Modal": "Modal", "Card": "Card", "List Item": "Row",
             "Multi-Tab": "Row", "Button Bar": "Row", "Bottom Navigation": "Row"}


def bounds(n):
    b = n.get("bounds") or [0, 0, 0, 0]
    return b if len(b) == 4 else [0, 0, 0, 0]


def convert(n):
    """Trả (node, bounds) hoặc None."""
    lb = n.get("componentLabel")
    if lb == "Advertisement":
        return None
    if lb in CONTAINER:
        kids = arrange([c for c in (convert(ch) for ch in n.get("children", [])) if c])
        if not kids:
            return None
        if lb == "List Item" and len(kids) == 1:
            return kids[0]
        node = {"type": CONTAINER[lb], "props": {}, "children": [k[0] for k in kids], "_li": lb == "List Item"}
        if lb == "Toolbar":
            for k in node["children"]:
                if k["type"] == "Text":
                    k["type"], k["props"] = "Heading", {"text": k["props"]["text"], "level": 2}
                    break
        return node, bounds(n)
    lf = leaf(n)
    return (lf, bounds(n)) if lf else None


def same_row(a, b):
    top, bot = max(a[1], b[1]), min(a[3], b[3])
    h = min(a[3] - a[1], b[3] - b[1])
    return h > 0 and (bot - top) > 0.5 * h


def arrange(items):
    """Sắp theo vị trí, gộp hàng ngang thành Row, List Item liên tiếp thành List, đoạn ô nhập thành Form."""
    items = sorted(items, key=lambda x: (x[1][1], x[1][0]))
    rows, cur = [], []
    for it in items:
        if cur and same_row(cur[0][1], it[1]) and not cur[0][0].get("_li") and not it[0].get("_li"):
            cur.append(it)
        else:
            if cur:
                rows.append(cur)
            cur = [it]
    if cur:
        rows.append(cur)
    out = []
    for r in rows:
        r.sort(key=lambda x: x[1][0])
        if len(r) == 1:
            out.append(r[0])
        else:
            b = [min(x[1][0] for x in r), min(x[1][1] for x in r), max(x[1][2] for x in r), max(x[1][3] for x in r)]
            out.append(({"type": "Row", "props": {}, "children": [x[0] for x in r]}, b))
    # List Item liên tiếp → List
    grouped, i = [], 0
    while i < len(out):
        j = i
        while j < len(out) and out[j][0].get("_li"):
            j += 1
        if j - i >= 2:
            grouped.append(({"type": "List", "props": {}, "children": [x[0] for x in out[i:j]]}, out[i][1]))
            i = j
        else:
            grouped.append(out[i])
            i += 1
    # đoạn có ô nhập → Form (kèm nút/link ngay sau)
    def is_field(x):
        t = x[0]["type"]
        return t in FIELD or (t == "Row" and any(c["type"] in FIELD for c in x[0]["children"]))
    res, i = [], 0
    while i < len(grouped):
        if is_field(grouped[i]):
            j = i
            while j + 1 < len(grouped) and (is_field(grouped[j + 1]) or grouped[j + 1][0]["type"] == "Text"):
                j += 1
            while j > i and grouped[j][0]["type"] == "Text":
                j -= 1
            k = j
            while k + 1 < len(grouped) and grouped[k + 1][0]["type"] in ("Button", "Link", "Row") and k - j < 3:
                k += 1
            seg = grouped[i:k + 1]
            n_fields = sum(1 for x in seg if is_field(x))
            if n_fields >= 1 and len(seg) >= 2:
                res.append(({"type": "Form", "props": {}, "children": [x[0] for x in seg]}, seg[0][1]))
                i = k + 1
                continue
        res.append(grouped[i])
        i += 1
    return res


def finalize(node):
    node.pop("_li", None)
    prefix = node["type"].lower()[:4]
    node["id"] = nid(prefix)
    for c in node.get("children", []):
        finalize(c)
    return node


def size(n):
    return 1 + sum(size(c) for c in n.get("children", []))


def sig(n):
    return n["type"] + ("(" + ",".join(sig(c) for c in n["children"]) + ")" if n.get("children") else "")


def app_of(n):
    for ch in [n] + n.get("children", []):
        rid = ch.get("resource-id") or ""
        if ":" in rid:
            return rid.split(":")[0]
        r = app_of(ch) if ch is not n and ch.get("children") else None
        if r:
            return r
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="data/rico/semantic_annotations")
    ap.add_argument("--out", default="data/corpus/rico.jsonl")
    ap.add_argument("--max-nodes", type=int, default=80)
    a = ap.parse_args()
    seen, kept, total = set(), 0, 0
    with open(a.out, "w", encoding="utf8") as f:
        for name in sorted(os.listdir(a.dir), key=lambda s: int(re.sub(r"\D", "", s) or 0)):
            if not name.endswith(".json"):
                continue
            total += 1
            raw = json.load(open(os.path.join(a.dir, name), encoding="utf8"))
            kids = arrange([c for c in (convert(ch) for ch in raw.get("children", [])) if c])
            if not kids:
                continue
            tree = finalize({"type": "Page", "props": {"title": "Trang"}, "children": [k[0] for k in kids]})
            tree["id"] = "page"
            n = size(tree)
            if n < 3 or n > a.max_nodes:
                continue
            s = sig(tree)
            if s in seen:
                continue
            seen.add(s)
            kept += 1
            f.write(json.dumps({"source": "rico", "app": app_of(raw), "screen": name[:-5], "tree": tree}, ensure_ascii=False) + "\n")
    print(f"Rico: {total} màn → giữ {kept} cây → {a.out}")


if __name__ == "__main__":
    main()
