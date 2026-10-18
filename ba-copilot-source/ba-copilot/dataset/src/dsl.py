# DSL gọn để soạn màn gốc (dataset/roots/*.json). Mỗi file batch_*.py khai báo ROOTS = [R(...), ...]
# rồi gọi dump(ROOTS, "<tên file>"). Dùng: python3 dataset/src/batch_main1.py
import json, os

def _n(type_, id_, props=None, kids=None):
    d = {"id": id_, "type": type_, "props": {k: v for k, v in (props or {}).items() if v is not None}}
    if kids is not None:
        d["children"] = list(kids)
    return d

# container
def P(title, *k): return _n("Page", "page", {"title": title}, k)
def HDR(id, *k, title=None): return _n("Header", id, {"title": title}, k)
def SB(id, *k): return _n("Sidebar", id, {}, k)
def SEC(id, title, *k): return _n("Section", id, {"title": title}, k)
def CARD(id, title, *k): return _n("Card", id, {"title": title}, k)
def ROW(id, *k, align=None, gap=8): return _n("Row", id, {"gap": gap, "align": align}, k)
def COL(id, *k, width=None): return _n("Column", id, {"width": width}, k)
def FORM(id, title, submit, *k): return _n("Form", id, {"title": title, "submitAction": submit}, k)
def LIST(id, *k): return _n("List", id, {}, k)
def MODAL(id, title, *k): return _n("Modal", id, {"title": title, "open": True}, k)
# lá
def H(id, text, level=1): return _n("Heading", id, {"text": text, "level": level})
def T(id, text, tone=None): return _n("Text", id, {"text": text, "tone": tone})
def B(id, label, variant="primary", action=None): return _n("Button", id, {"label": label, "variant": variant, "action": action or id.replace("btn_", "")})
def L(id, text, nav=None): return _n("Link", id, {"text": text, "navigateTo": nav})
def I(id, label, name, t="text", req=None, ph=None, **kw):
    return _n("Input", id, {"label": label, "name": name, "placeholder": ph, "inputType": t, "required": req, **kw})
def TA(id, label, name, req=None, ph=None, maxl=None):
    return _n("Textarea", id, {"label": label, "name": name, "placeholder": ph, "required": req, "maxLength": maxl})
def S(id, label, name, opts, req=None): return _n("Select", id, {"label": label, "name": name, "options": opts, "required": req})
def CB(id, label, name): return _n("Checkbox", id, {"label": label, "name": name})
def RA(id, label, name, opts): return _n("Radio", id, {"label": label, "name": name, "options": opts})
def D(id, label, name, req=None): return _n("DatePicker", id, {"label": label, "name": name, "required": req})
def TB(id, cols, rows=None, acts=None): return _n("Table", id, {"columns": cols, "rows": rows, "rowActions": acts})
def IMG(id, alt): return _n("Image", id, {"alt": alt})
def BD(id, text, tone=None): return _n("Badge", id, {"text": text, "tone": tone})
def A(id, text, tone="info"): return _n("Alert", id, {"text": text, "tone": tone})
def ST(id, label, value): return _n("Stat", id, {"label": label, "value": value})
def AV(id, name): return _n("Avatar", id, {"name": name})
def DV(id): return _n("Divider", id, {})
def PG(id, pages=5): return _n("Pagination", id, {"pages": pages})

def R(id, title, actor, desc, perms, rules, tree, notes=None):
    r = {"id": id, "requirement": {"title": title, "actor": actor, "description": desc, "permissions": perms, "rules": rules}, "tree": tree}
    if notes: r["notes"] = notes
    return r

def dump(roots, name):
    out = os.path.join(os.path.dirname(__file__), "..", "roots", name)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(roots, f, ensure_ascii=False, indent=1)
    print(f"{name}: {len(roots)} màn")
