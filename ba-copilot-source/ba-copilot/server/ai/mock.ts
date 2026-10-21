// Bộ sinh rule-based (chế độ Mock): chạy khi không có API key, dùng cho demo/test tự động
// và làm "baseline" để so sánh với LLM trong chương thực nghiệm.
// Đợt 6 (D4): nội dung sinh ra (nhãn màn hình, UC, test case…) bằng tiếng Anh. Bộ nhận diện ý trong prompt hiểu cả
// tiếng Anh lẫn tiếng Việt (prompt/dữ liệu cũ trong DB vẫn là tiếng Việt) – các mẫu tiếng Việt nằm trong vùng vi-keep.

import { ALL_TYPES, findNode, findParent, isContainer, newId, normalizeTree, UINode, walk } from "../../shared/design.ts";
import type { PatchOp } from "../../shared/patch.ts";
import type { DesignModel, ScreenModel, FieldSpec } from "../../shared/extract.ts";
import type { AltFlow, Requirement, SequenceDiagram, SrsDoc, TestCase, UseCase, FlowStep } from "../../shared/types.ts";
import { buildUcMermaid } from "../../shared/ucDiagram.ts";
import { slug } from "../../shared/extract.ts";
import { parseStory } from "../../shared/qus.ts";
import type { MissingScreen, SuggestSource } from "../../shared/suggest.ts";

// ------------------------------------------------------------------ Screens
const has = (s: string, re: RegExp) => re.test(s.toLowerCase());
const SYSTEM = "System";
const isSys = (a: string | undefined) => /^(?:system|the system|hệ thống)$/i.test(String(a ?? "").trim()); // vi-keep: actor "Hệ thống" trong UC cũ
const sysStep = (s: string) => /^(?:system|hệ thống)\b/i.test(s); // vi-keep: bước "Hệ thống …" trong UC cũ

// vi-keep-start: nhận diện đối tượng trong prompt (tiếng Việt cũ + tiếng Anh)
function entityFrom(prompt: string, fallback: string): string {
  const m =
    prompt.match(/(?:quản lý|danh sách|thêm|tạo|chỉnh sửa|form|màn hình)\s+([\p{L}\d ]{2,40}?)(?:[,.;:\n]|$| gồm| có| với| cho)/iu) ??
    prompt.match(/(?:manage|management of|list of|add(?: new)?|create|edit|new)\s+(?:an?\s+|the\s+)?([\p{L}\d ]{2,40}?)(?:[,.;:\n]|$| with| including| for| by)/iu) ??
    prompt.match(/([\p{L}]+(?: [\p{L}]+)?)\s+(?:management|list)\b/iu);
  const e = (m?.[1] ?? fallback).trim();
  return e.charAt(0).toUpperCase() + e.slice(1);
}
// vi-keep-end

/**
 * Sinh màn hình ở chế độ Mock.
 * - Prompt mô tả cụ thể các thành phần (trường, nút, bảng...) → dựng ĐÚNG những gì được mô tả (mockFromPrompt),
 *   nên prompt thiếu gì thì màn thiếu cái đó – tab "Gợi ý" sẽ phát hiện.
 * - Prompt chỉ nêu loại màn (vd "login", "dashboard") hoặc mode "template" → dùng khuôn mẫu đầy đủ.
 */
export function mockScreen(prompt: string, name: string, opts: { mode?: "auto" | "template" } = {}): UINode {
  if (opts.mode !== "template") {
    const built = mockFromPrompt(prompt, name);
    if (built) return built;
  }
  return mockTemplate(prompt, name);
}

// ------------------------------------------------------------------ Dựng màn từ prompt
interface Part {
  at: number; // vị trí xuất hiện trong prompt để giữ thứ tự
  node: { id?: string; type: string; props: Record<string, unknown> };
}

// vi-keep-start: từ khoá nhận diện hành động của nút (tiếng Việt cũ + tiếng Anh)
const ACTIONS: [RegExp, string][] = [
  [/đăng nhập|\blog ?in\b|sign in/, "login"], [/đăng ký|register|sign up/, "register"], [/lưu|\bsave\b/, "save"], [/hủy|huỷ|cancel/, "cancel"], [/tìm|search/, "search"],
  [/xóa|xoá|delete|remove/, "delete"], [/thêm|\badd\b|\bnew\b|create/, "create"], [/cập nhật|update/, "update"], [/gửi|submit|\bsend\b/, "submit"], [/duyệt|approve/, "approve"],
  [/từ chối|reject/, "reject"], [/xuất|export/, "export"], [/thanh toán|đặt hàng|checkout|\bpay\b|place order/, "checkout"], [/quay lại|\bback\b/, "back"],
];
const SECONDARY_BTN = /hủy|huỷ|quay lại|từ chối|cancel|\bback\b|reject/i;
const splitList = (s: string) => s.split(/\s*(?:,|;|\/)\s*|\s+(?:và|hoặc|and|or)\s+/).map((x) => x.replace(/["“”']/g, "").trim()).filter((x) => x && x.length <= 40);
// vi-keep-end
const actionOf = (label: string) => ACTIONS.find(([re]) => re.test(label.toLowerCase()))?.[1] ?? "click";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stripArticle = (s: string) => s.replace(/^(?:a|an|the|with)\s+/i, "").trim();

export function mockFromPrompt(prompt: string, name: string): UINode | null {
  const text = prompt.trim();
  const p = text.toLowerCase();
  const fields: Part[] = [];
  const tools: Part[] = []; // tìm kiếm / bộ lọc trên thanh công cụ
  const buttons: Part[] = [];
  const links: Part[] = [];
  const at = (re: RegExp) => p.search(re);
  // vi-keep-start: bộ hiểu prompt mô tả màn (tiếng Việt cũ + tiếng Anh)
  // phần mô tả cột bảng / bộ lọc / chỉ số không phải trường nhập ("cột Mã, Họ tên" ≠ form có Mã, Họ tên)
  const blank = (s: string) =>
    s.replace(
      /(cột|lọc theo|chỉ số|columns?|filter by|metrics|stats)\s+[^.;\n]+?(?=$|[.;\n]|,\s*(?:thao tác|nút|phân trang|có|xuất|bảng|khoảng|actions?|buttons?|pagination|with|export|table|date range)\b)/giu,
      (m) => " ".repeat(m.length),
    );
  // tên màn trước dấu ":" ("Category management: …") và cụm "search by …" không phải trường nhập
  const pf = blank(p)
    .replace(/^[^:\n]{1,60}:/, (m) => " ".repeat(m.length))
    .replace(/search by\s+[^,.;\n]+/g, (m) => " ".repeat(m.length));
  const fieldRes: { re: RegExp; node: { type: string; props: Record<string, unknown> } }[] = [];
  const field = (re: RegExp, type: string, props: Record<string, unknown>) => {
    const i = pf.search(re);
    if (i < 0) return;
    const base: Record<string, unknown> = { ...props, name: slugName(String(props.label)) };
    if (type === "Input" || type === "Textarea") base.placeholder ??= `Enter ${String(props.label).toLowerCase()}`;
    const node = { type, props: base };
    fieldRes.push({ re, node });
    fields.push({ at: i, node });
  };
  /** Ràng buộc chỉ áp cho trường được nhắc cùng mệnh đề ("Họ tên và email bắt buộc"); không nhắc trường nào → áp cho tất cả. */
  const constrain = () => {
    for (const seg of p.split(/[.;,()\n]/)) {
      const req = /bắt buộc|required|mandatory/.test(seg);
      const max = seg.match(/(?:tối đa|max(?:imum)?|at most|up to)\s+(\d+)\s*(?:ký tự|characters?|chars?)/)?.[1];
      const min = seg.match(/(?:tối thiểu|min(?:imum)?|at least)\s+(\d+)\s*(?:ký tự|characters?|chars?)/)?.[1];
      if (!req && !max && !min) continue;
      const named = fieldRes.filter((f) => f.re.test(seg));
      const targets = named.length ? named : fieldRes.filter((f) => !(min && !max && !req) || f.node.props.inputType === "password");
      for (const { node } of targets) {
        if (req && node.type !== "Checkbox") node.props.required = true;
        if (max && (node.type === "Input" || node.type === "Textarea") && node.props.inputType !== "password") node.props.maxLength = Number(max);
        if (min && node.type === "Input") node.props.minLength = Number(min);
      }
    }
  };

  field(/email/, "Input", { label: "Email", inputType: "email" });
  field(/xác nhận mật khẩu|confirm(?:ation)? password/, "Input", { label: "Confirm password", inputType: "password" });
  field(/mật khẩu (cũ|hiện tại)|(?:old|current) password/, "Input", { label: "Current password", inputType: "password" });
  field(/mật khẩu mới|new password/, "Input", { label: "New password", inputType: "password" });
  if (!/mật khẩu (cũ|hiện tại|mới)|(?:old|current|new) password/.test(p)) field(/(?<!quên |xác nhận )mật khẩu|(?<!forgot |forgotten |confirm )password/, "Input", { label: "Password", inputType: "password" });
  field(/họ (và )?tên|tên đầy đủ|full name/, "Input", { label: "Full name" });
  field(/số điện thoại|sđt|phone(?: number)?/, "Input", { label: "Phone number", inputType: "tel" });
  field(/địa chỉ(?! email)|(?<!email )\baddress\b/, "Input", { label: "Address" });
  field(/ngày sinh|date of birth|birth ?date/, "DatePicker", { label: "Date of birth" });
  field(/ngày hiệu lực|effective date/, "DatePicker", { label: "Effective date" });
  field(/giới tính|gender/, "Radio", { label: "Gender", options: ["Male", "Female", "Other"] });
  field(/giá( bán)?\b|\bprice\b/, "Input", { label: "Price", inputType: "number" });
  field(/số lượng|quantity/, "Input", { label: "Quantity", inputType: "number" });
  field(/tồn kho|\bstock\b/, "Input", { label: "Stock", inputType: "number" });
  field(/(?<!\p{L})mã(?!\p{L})(?! số)|(?<!postal |zip |promo |discount )\bcode\b/u, "Input", { label: "Code" });
  field(/(?<!mã )\bsku\b/, "Input", { label: "SKU" });
  field(/danh mục|\bcategory\b/, "Select", { label: "Category", options: ["Type 1", "Type 2", "Type 3"] });
  field(/người phụ trách|assignee/, "Select", { label: "Assignee", options: ["Unassigned"] });
  field(/mô tả|description/, "Textarea", { label: "Description" });
  field(/ghi chú|\bnotes?\b/, "Textarea", { label: "Notes" });
  field(/ghi nhớ đăng nhập|remember me/, "Checkbox", { label: "Remember me" });
  field(/đồng ý|điều khoản|\bagree\b|\bterms\b/, "Checkbox", { label: "I agree to the terms of use" });
  const tenX = blank(text).match(/(?<![Hh]ọ )\btên\s+([\p{L}]+(?:\s[\p{L}]+)?)/u);
  if (tenX && !/^(đăng|tài khoản)/i.test(tenX[1])) field(new RegExp(`tên\\s+${tenX[1].toLowerCase()}`), "Input", { label: `${cap(tenX[1].toLowerCase())} name` });
  const nameX = pf.match(/\b([a-z]+) name\b/);
  if (nameX && !/^(full|user|first|last|file|by|the|a|an|your|my|display)$/.test(nameX[1])) field(new RegExp(`\\b${nameX[1]} name\\b`), "Input", { label: `${cap(nameX[1])} name` });

  constrain();

  // thanh công cụ của màn danh sách
  const isList = /\bbảng\b|danh sách|\btable\b|\blist\b/.test(p) && !/^màn hình (đăng|quên)|^(?:the )?(?:login|log in|sign in|sign up|register|registration|forgot password) (?:screen|page|form)/.test(p);
  const iSearch = at(/tìm kiếm|tra cứu|\bsearch\b|look ?up/);
  if (iSearch >= 0 && (isList || !fields.length)) tools.push({ at: iSearch, node: { type: "Input", props: { label: "Search", name: "keyword", placeholder: "Enter keywords..." } } });
  for (const m of p.matchAll(/(?:lọc theo|filter by)\s+([^,.;\n]+)/g)) for (const f of splitList(m[1]))
    tools.push({ at: m.index!, node: { type: "Select", props: { label: cap(f), name: slugName(f), options: ["All"] } } });
  if (/khoảng thời gian|từ ngày|date range|from date/.test(p)) {
    const i = at(/khoảng thời gian|từ ngày|date range|from date/);
    tools.push({ at: i, node: { type: "DatePicker", props: { label: "From date", name: "from_date" } } }, { at: i + 1, node: { type: "DatePicker", props: { label: "To date", name: "to_date" } } });
  }

  // nút: "nút Lưu và Hủy", "Save and Cancel buttons", "buttons Approve and Reject", "Add new button", "export to Excel"
  const addButtons = (index: number, raw: string) => {
    for (const lb of splitList(raw.replace(/\s+(vào|ở|bên|phía|cuối|dưới|trên|at|on|in|below|above)\s.*$/i, ""))) {
      const label = cap(stripArticle(lb));
      if (label && !buttons.some((b) => String(b.node.props.label).toLowerCase() === label.toLowerCase())) buttons.push({ at: index, node: { type: "Button", props: { label } } });
    }
  };
  for (const m of text.matchAll(/nút\s+([^.;:\n]+?)(?=$|[.;:\n]|,\s*(?:có|bảng|phân trang|link|liên kết)\b)/giu)) addButtons(m.index!, m[1]);
  for (const m of text.matchAll(/\bbuttons?\s*(?::\s*|(?=["“]))([^.;:\n]+?)(?=$|[.;:\n]|,\s*(?:with|table|pagination|link|has)\b)/gi)) addButtons(m.index!, m[1]);
  for (const m of text.matchAll(/(?:^|[,.;:\n]|\bwith\b)\s*([^,.;:\n]+?)\s+buttons?\b/gi)) addButtons(m.index!, m[1]);
  if (/xuất excel|export (?:to )?excel/.test(p) && !buttons.some((b) => /xuất|export/i.test(String(b.node.props.label)))) buttons.push({ at: at(/xuất excel|export (?:to )?excel/), node: { type: "Button", props: { label: "Export Excel" } } });

  // liên kết
  if (/quên mật khẩu|forgot(?:ten)? password/.test(p) && !/^màn hình quên|^quên|^forgot/.test(p)) links.push({ at: at(/quên mật khẩu|forgot(?:ten)? password/), node: { type: "Link", props: { text: "Forgot password?", navigateTo: "Forgot password" } } });
  if (/(link|liên kết)\s+đăng ký|đăng ký tài khoản|sign ?up link|register link|create (?:an )?account/.test(p) && /đăng nhập|log ?in|sign in/.test(p)) links.push({ at: at(/đăng ký|sign ?up|register|create (?:an )?account/), node: { type: "Link", props: { text: "Create an account", navigateTo: "Sign up" } } });

  const hasTable = isList;
  // trên màn danh sách, trường trùng với bộ lọc là bộ lọc chứ không phải form
  if (isList) for (let i = fields.length - 1; i >= 0; i--) if (tools.some((t) => slugName(String(t.node.props.label)) === slugName(String(fields[i].node.props.label)))) fields.splice(i, 1);
  const stats = p.match(/(?:chỉ số|metrics|stats)\s+([^.;\n]+?)(?:\s+(?:và|and)\s+(?:bảng|table)|[.;\n]|$)/)?.[1];
  const count = fields.length + tools.length + buttons.length + links.length + (hasTable ? 1 : 0) + (stats ? 1 : 0);
  if (count < 2) return null; // prompt quá chung → dùng khuôn mẫu

  const intent =
    /đăng nhập|\blog ?in\b|sign in/.test(p) && fields.some((f) => /password/i.test(String(f.node.props.label))) && !/đăng ký tài khoản:|xác nhận mật khẩu|confirm password|sign up:|register:/.test(p)
      ? "login"
      : /đăng ký|register|sign up/.test(p) && fields.length
        ? "register"
        : "";
  const title =
    name ||
    cap(
      text
        .split(/[:,.]|\s+(?:có|gồm|với|bằng|with|has|including)\s+/)[0]
        .replace(/^(màn hình|form|trang|screen|page)\s+/i, "")
        .replace(/\s+(screen|page|form)$/i, ""),
    ).slice(0, 60);
  const byAt = (a: Part, b: Part) => a.at - b.at;
  const btn = (b: Part) => {
    const lb = String(b.node.props.label);
    const action = actionOf(lb);
    return { id: action === "click" ? undefined : `btn_${action}`, type: "Button", props: { label: lb, variant: SECONDARY_BTN.test(lb) ? "secondary" : "primary", action } };
  };
  const formBtns = buttons.filter((b) => !(hasTable && /thêm|xuất|\badd\b|\bnew\b|export/i.test(String(b.node.props.label))));
  const toolBtns = buttons.filter((b) => !formBtns.includes(b));
  const children: unknown[] = [{ type: "Heading", props: { text: title, level: 1 } }];

  if (stats) children.push({ type: "Row", props: { gap: 12 }, children: splitList(stats).map((l) => ({ type: "Stat", props: { label: cap(l), value: "0" } })) });
  if (tools.length || toolBtns.length)
    children.push({ type: "Row", props: { gap: 8, align: "between" }, children: [...tools.sort(byAt).map((t) => t.node), ...toolBtns.map(btn)] });
  if (fields.length) {
    const formKids = [...fields.sort(byAt).map((f) => f.node), ...(formBtns.length > 1 ? [{ type: "Row", props: { gap: 8, align: "end" }, children: formBtns.map(btn) }] : formBtns.map(btn))];
    children.push({ id: intent ? `${intent}_form` : undefined, type: "Form", props: { submitAction: intent || "save" }, children: formKids });
  } else if (formBtns.length && !hasTable) children.push({ type: "Row", props: { gap: 8 }, children: formBtns.map(btn) });
  if (hasTable) {
    const cols = text.match(/(?:cột|columns?)\s+([^.;\n]+?)(?=$|[.;\n]|,\s*(?:thao tác|nút|phân trang|có|xuất|actions?|buttons?|pagination|with|export)\b)/i)?.[1]; // giữ chữ hoa của BA ("Mã NV")
    const acts = p.match(/(xem\/sửa\/xóa|xem\/sửa\/xoá|sửa\/xóa|sửa\/xoá|sửa và xóa|view\/edit\/delete|edit\/delete|edit and delete)/)?.[1];
    children.push({ type: "Table", props: { columns: [...(cols ? splitList(cols).map(cap) : ["Code", "Name", "Status"]), ...(acts ? ["Actions"] : [])], rows: [], ...(acts ? { rowActions: splitList(acts).map(cap) } : {}) } });
    if (hasTable && formBtns.length && fields.length === 0) children.push({ type: "Row", props: { gap: 8 }, children: formBtns.map(btn) });
  }
  if (/phân trang|pagination|paging/.test(p)) children.push({ type: "Pagination", props: { pages: 5 } });
  // vi-keep-end
  if (links.length) children.push({ type: "Row", props: { align: "between" }, children: links.sort(byAt).map((l) => l.node) });
  return normalizeTree({ id: "page", type: "Page", props: { title }, children });
}

function slugName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field"; // vi-keep: bỏ dấu tiếng Việt
}

/** Khuôn mẫu đầy đủ theo loại màn (hành vi cũ của chế độ Mock). */
export function mockTemplate(prompt: string, name: string): UINode {
  const p = prompt.toLowerCase();
  let tree: unknown;
  // vi-keep-start: nhận diện loại màn trong prompt (tiếng Việt cũ + tiếng Anh)
  const isLogin = has(p, /đăng nhập|login|log in|sign in/);
  const isRegister = has(p, /đăng ký|register|sign up/);
  const isList = has(p, /quản lý|danh sách|list|tra cứu|tìm kiếm|manage|management|search/);
  const isForm = has(p, /thêm|tạo|form|nhập|chỉnh sửa|cập nhật|\badd\b|create|edit|update|\bnew\b/);
  // vi-keep-end
  if (isLogin) {
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || "Sign in" },
      children: [
        {
          id: "login_card",
          type: "Card",
          props: { title: "Sign in to the system" },
          children: [
            {
              id: "login_form",
              type: "Form",
              props: { submitAction: "login" },
              children: [
                { id: "email", type: "Input", props: { label: "Email", name: "email", inputType: "email", placeholder: "you@company.com", required: true, maxLength: 100 } },
                { id: "password", type: "Input", props: { label: "Password", name: "password", inputType: "password", placeholder: "At least 8 characters", required: true, minLength: 8, maxLength: 32 } },
                { id: "remember", type: "Checkbox", props: { label: "Remember me", name: "remember" } },
                { id: "btn_login", type: "Button", props: { label: "Sign in", variant: "primary", action: "login", navigateTo: "Home" } },
              ],
            },
            {
              id: "login_links",
              type: "Row",
              props: { align: "between" },
              children: [
                { id: "link_forgot", type: "Link", props: { text: "Forgot password?", navigateTo: "Forgot password" } },
                { id: "link_register", type: "Link", props: { text: "Create an account", navigateTo: "Sign up" } },
              ],
            },
          ],
        },
      ],
    };
  } else if (isRegister) {
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || "Sign up" },
      children: [
        {
          id: "reg_card",
          type: "Card",
          props: { title: "Create an account" },
          children: [
            {
              id: "reg_form",
              type: "Form",
              props: { submitAction: "register" },
              children: [
                { id: "fullname", type: "Input", props: { label: "Full name", name: "full_name", required: true, maxLength: 50 } },
                { id: "reg_email", type: "Input", props: { label: "Email", name: "email", inputType: "email", required: true } },
                { id: "phone", type: "Input", props: { label: "Phone number", name: "phone", inputType: "tel", pattern: "^0\\d{9}$" } },
                { id: "reg_password", type: "Input", props: { label: "Password", name: "password", inputType: "password", required: true, minLength: 8 } },
                { id: "agree", type: "Checkbox", props: { label: "I agree to the terms of use", name: "agree" } },
                { id: "btn_register", type: "Button", props: { label: "Sign up", variant: "primary", action: "register", navigateTo: "Sign in" } },
              ],
            },
          ],
        },
      ],
    };
  } else if (isList) {
    const ent = entityFrom(prompt, name || "records");
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || `${ent} management` },
      children: [
        { id: "header", type: "Header", props: { title: `${ent} management` } },
        {
          id: "toolbar",
          type: "Row",
          props: { gap: 12, align: "between" },
          children: [
            {
              id: "filters",
              type: "Row",
              props: { gap: 8 },
              children: [
                { id: "search", type: "Input", props: { label: "Search", name: "keyword", placeholder: `${ent} name...`, maxLength: 100 } },
                { id: "status_filter", type: "Select", props: { label: "Status", name: "status", options: ["All", "Active", "Inactive"] } },
              ],
            },
            { id: "btn_add", type: "Button", props: { label: "Add new", variant: "primary", action: "create", navigateTo: `Add ${ent.toLowerCase()}` } },
          ],
        },
        {
          id: "table",
          type: "Table",
          props: {
            columns: ["Code", "Name", "Status", "Created on"],
            rows: [
              ["001", `${ent} A`, "Active", "10/01/2026"],
              ["002", `${ent} B`, "Inactive", "10/05/2026"],
            ],
            rowActions: ["View", "Edit", "Delete"],
          },
        },
        { id: "pagination", type: "Pagination", props: { pages: 5 } },
      ],
    };
  } else if (isForm) {
    const ent = entityFrom(prompt, name || "record");
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || `Add ${ent.toLowerCase()}` },
      children: [
        { id: "header", type: "Header", props: { title: `Add ${ent.toLowerCase()}` } },
        {
          id: "main_form",
          type: "Form",
          props: { title: `${ent} details`, submitAction: "save" },
          children: [
            { id: "f_name", type: "Input", props: { label: `${ent} name`, name: "name", required: true, maxLength: 100 } },
            { id: "f_category", type: "Select", props: { label: "Category", name: "category", options: ["Type 1", "Type 2", "Type 3"], required: true } },
            { id: "f_date", type: "DatePicker", props: { label: "Effective date", name: "effective_date" } },
            { id: "f_desc", type: "Textarea", props: { label: "Description", name: "description", maxLength: 500 } },
            {
              id: "form_actions",
              type: "Row",
              props: { gap: 8, align: "end" },
              children: [
                { id: "btn_cancel", type: "Button", props: { label: "Cancel", variant: "secondary", action: "cancel", navigateTo: `${ent} management` } },
                { id: "btn_save", type: "Button", props: { label: "Save", variant: "primary", action: "save", navigateTo: `${ent} management` } },
              ],
            },
          ],
        },
      ],
    };
  } else {
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || "Home" },
      children: [
        { id: "header", type: "Header", props: { title: name || "Overview" } },
        {
          id: "stats",
          type: "Row",
          props: { gap: 12 },
          children: [
            { id: "stat_1", type: "Stat", props: { label: "Total", value: "1,250" } },
            { id: "stat_2", type: "Stat", props: { label: "In progress", value: "36" } },
            { id: "stat_3", type: "Stat", props: { label: "Completed", value: "1,180" } },
          ],
        },
        {
          id: "recent",
          type: "Section",
          props: { title: "Recent activity" },
          children: [{ id: "recent_table", type: "Table", props: { columns: ["Time", "Activity", "Performed by"], rows: [["08:30", "Created a record", "BA"]] } }],
        },
      ],
    };
  }
  return normalizeTree(tree);
}

// ------------------------------------------------------------------ Edit
export function mockEditOps(tree: UINode, selectedIds: string[], instruction: string): { ops: PatchOp[]; summary: string } {
  // vi-keep-start: bộ hiểu yêu cầu sửa màn (tiếng Việt cũ + tiếng Anh)
  // vị trí chèn do gợi ý Transformer ghi: ", ngay sau Input "Email"" / ", right before Button "Save""
  const posRef = instruction.match(/,?\s*(?:ngay\s+|right\s+)?(sau|trước|after|before)\s+[\p{L}]+\s+["“]([^"”]+)["”]/u);
  const after = posRef ? /^(sau|after)$/i.test(posRef[1]) : false;
  const text = (posRef ? instruction.replace(posRef[0], "") : instruction).trim();
  const low = text.toLowerCase();
  const targets = selectedIds.length ? selectedIds : [tree.id];
  const ops: PatchOp[] = [];
  const quoted = text.match(/["“”']([^"“”']+)["“”']/)?.[1];

  // chỉ hiểu là đổi chữ khi có "thành"/"to" (vd "Đổi chữ thành X", "Change the label to X"); "sang" thường là đổi bố cục/kiểu
  const rename = /kiểu|inputType|navigateTo|bố cục|\btype\b|layout/i.test(text)
    ? null
    : text.match(/(?:đổi|sửa|thay)[^\n]*?thành\s*["“]?([^"”\n]+?)["”]?\s*$/im) ?? text.match(/(?:change|rename|replace|set)[^\n]*?\bto\s*["“]?([^"”\n]+?)["”]?\s*$/im);
  const setType = text.match(/(?:kiểu|type)\s+(email|password|number|tel|text)\b/i)?.[1];
  const minLen = text.match(/(?:tối thiểu|at least|min(?:imum)?)\s+(\d+)\s*(?:ký tự|characters?|chars?)/i)?.[1];
  const addButton =
    text.match(/(?:thêm|add)\s+(?:an?\s+)?(?:nút|button)\s*["“]?([^"”\n,.]+)["”]?/i) ?? text.match(/\badd\s+(?:an?\s+|the\s+)?["“]?([^"”\n,.]+?)["”]?\s+button\b/i);
  const addField = /\((?!Input\))[A-Z]\w+\)|ô (tích|chọn|nhập nhiều)|checkbox|drop-?down|\bselect\b|text ?area|date picker/i.test(text)
    ? null
    : text.match(/thêm\s+(?:ô|trường|field)(?:\s+nhập)?\s*["“]?([^"”\n,.(]+?)["”]?(?=\s*[(,.]|\s+vào|$)/i) ??
      text.match(/\badd\s+(?:an?\s+)?(?:new\s+)?(?:field|input)\s*["“]?([^"”\n,.(]+?)["”]?(?=\s*[(,.]|\s+(?:to|into|in)\b|$)/i) ??
      text.match(/\badd\s+(?:an?\s+|the\s+)?["“]?([^"”\n,.(]+?)["”]?\s+(?:field|input)\b/i);
  // "Thêm bộ lọc (Select) "Khách hàng"", "Add pagination (Pagination)", "Add a Select to the Row"
  const addCols = text.match(/(?:thêm|add)\s+(?:các\s+|the\s+)?(?:cột|columns?)\s+["“]?([^"”\n.]+?)["”]?(?=\s+(?:vào|to)\b|\s*[.]|$)/i)?.[1];
  const addRowActs = text.match(/(?:thêm|add)\s+(?:các\s+|the\s+)?(?:thao tác|(?:row\s+)?actions?)\s+([^\n.]+?)(?=\s+(?:vào|cho|to|for)\b|\s*[.]|$)/i)?.[1];
  const addRange = /(?:thêm|add)[^.\n]*(khoảng thời gian|từ ngày|date range|from date)/i.test(text);
  const addType = addButton || addField || addCols || addRowActs || addRange ? null : addTypeOf(text);
  const isAdd = /^\s*(thêm|bổ sung|add|insert)\b/i.test(text);
  const isRequired = /bắt buộc|required|mandatory/.test(low);
  // vi-keep-end

  for (const id of targets) {
    const n = findNode(tree, id);
    if (!n) continue;
    if (rename) {
      const leaf = firstTextNode(n);
      if (leaf) {
        const key = leaf.props.label !== undefined ? "label" : leaf.props.text !== undefined ? "text" : "title";
        ops.push({ op: "update", id: leaf.id, props: { [key]: rename[1].trim() } });
      }
    }
    if (addButton) {
      // đọc "variant primary" / "action login" nếu prompt có ghi (vd từ gợi ý thành phần)
      const variant = text.match(/variant\s+(primary|secondary|danger|ghost)/i)?.[1] ?? "secondary";
      // Nhãn trong ngoặc kép giữ nguyên ("Sign in with Google"); không có ngoặc thì bỏ phần chỉ vị trí phía sau
      const label = cap(quoted ? quoted.trim() : addButton[1].replace(/\s+(vào|ở|bên|cho|to|into|in|on|at|for)\s.*$/i, "").trim()); // vi-keep: giới từ tiếng Việt cũ
      const action = text.match(/action\s+([a-z_]+)/i)?.[1] ?? (actionOf(label) !== "click" ? actionOf(label) : undefined);
      insertNear(n, { type: "Button", props: { label, variant, ...(action ? { action } : {}) } });
    }
    const table = n.type === "Table" ? n : (isContainer(n.type) ? (n.children ?? []).find((c) => c.type === "Table") : null) ?? (findParent(tree, n.id)?.children ?? []).find((c) => c.type === "Table");
    if ((addCols || addRowActs) && table) {
      const cols = [...((table.props.columns as string[] | undefined) ?? [])];
      const acts = addRowActs ? splitList(addRowActs).map(cap) : [];
      const actIdx = cols.findIndex((c) => /^(actions|thao tác)$/i.test(c)); // vi-keep: cột "Thao tác" của bảng cũ
      if (addCols) cols.splice(actIdx >= 0 ? actIdx : cols.length, 0, ...splitList(addCols).map(cap));
      if (acts.length && actIdx < 0) cols.push("Actions");
      ops.push({ op: "update", id: table.id, props: { columns: cols, ...(acts.length ? { rowActions: acts } : {}) } });
    }
    if (addRange) {
      insertNear(n, { type: "DatePicker", props: { label: "From date", name: "from_date" } });
      insertNear(n, { type: "DatePicker", props: { label: "To date", name: "to_date" } });
    }
    if (addType) {
      const node = defaultNode(addType, quoted ?? labelAfterAlias(text, addType));
      // phân trang đặt ngay sau bảng nếu có
      const table = addType === "Pagination" ? (isContainer(n.type) ? n.children ?? [] : []).find((c) => c.type === "Table") ?? (n.type === "Table" ? n : null) : null;
      if (table) {
        const parent = findParent(tree, table.id)!;
        ops.push({ op: "insert", parentId: parent.id, index: (parent.children ?? []).indexOf(table) + 1, node: { id: newId(), ...node } });
      } else insertNear(n, node);
    }
    if (addField) {
      const label = cap(quoted ? quoted.trim() : addField[1].replace(/\s+(vào|ở|bên|cho|to|into|in|on|at|for)\s.*$/i, "").trim()); // vi-keep: giới từ tiếng Việt cũ
      const search = /tìm kiếm|search/i.test(label); // vi-keep: nhãn "Tìm kiếm" cũ
      insertNear(n, { type: "Input", props: { label, name: search ? "keyword" : snake(label), placeholder: search ? "Enter keywords..." : `Enter ${label.toLowerCase()}`, ...(setType ? { inputType: setType } : {}), ...(minLen ? { minLength: Number(minLen) } : {}), ...(isRequired ? { required: true } : {}) } });
    }
    if (!isAdd && /\b(xóa|xoá|bỏ|loại bỏ|remove|delete)\b/.test(low) && !addButton && !addField && !addType && !rename && n.id !== tree.id) ops.push({ op: "remove", id: n.id }); // vi-keep: động từ xoá tiếng Việt cũ
    const placeholder = text.match(/placeholder\s+["“]([^"”]+)["”]/i)?.[1];
    const maxLen = text.match(/(?:tối đa|at most|max(?:imum)?|up to)\s+(\d+)\s*(?:ký tự|characters?|chars?)/i)?.[1]; // vi-keep: "tối đa N ký tự" cũ
    if ((placeholder || maxLen) && !addField) walk(n, (d) => {
      if (d.type === "Input" || d.type === "Textarea") ops.push({ op: "update", id: d.id, props: { ...(placeholder ? { placeholder } : {}), ...(maxLen ? { maxLength: Number(maxLen) } : {}) } });
    });
    if ((setType || minLen) && !addField) walk(n, (d) => {
      if (d.type === "Input") ops.push({ op: "update", id: d.id, props: { ...(setType ? { inputType: setType } : {}), ...(minLen ? { minLength: Number(minLen) } : {}) } });
    });
    if (/bổ sung name|add (?:missing )?names?\b/i.test(text)) walk(n, (d) => { // vi-keep: lệnh "bổ sung name" cũ
      if (["Input", "Textarea", "Select", "DatePicker", "Checkbox", "Radio"].includes(d.type) && !d.props.name) ops.push({ op: "update", id: d.id, props: { name: snake(String(d.props.label ?? d.id)) } });
    });
    if (/bổ sung action|add (?:missing )?actions?\b/i.test(text)) walk(n, (d) => { // vi-keep: lệnh "bổ sung action" cũ
      if (d.type === "Button" && !d.props.action && !d.props.navigateTo) ops.push({ op: "update", id: d.id, props: { action: snake(String(d.props.label ?? "click")) } });
    });
    if (isRequired && !addField) walk(n, (d) => {
      if (["Input", "Textarea", "Select", "DatePicker", "Radio"].includes(d.type)) ops.push({ op: "update", id: d.id, props: { required: true } });
    });
    if (/màu đỏ|nguy hiểm|danger|cảnh báo|\bred\b|warning/.test(low)) walk(n, (d) => { // vi-keep: từ khoá màu tiếng Việt cũ
      if (d.type === "Button") ops.push({ op: "update", id: d.id, props: { variant: "danger" } });
      if (d.type === "Badge" || d.type === "Alert") ops.push({ op: "update", id: d.id, props: { tone: "danger" } });
    });
    if (/nổi bật|primary|nút chính|highlight|main button/.test(low)) walk(n, (d) => { // vi-keep: từ khoá nút chính tiếng Việt cũ
      if (d.type === "Button") ops.push({ op: "update", id: d.id, props: { variant: "primary" } });
    });
  }
  if (!ops.length) {
    const anchor = findNode(tree, targets[0]) ?? tree;
    insertNear(anchor, { type: "Alert", props: { text: `BA note: ${text.slice(0, 160)}`, tone: "info" } });
  }
  return { ops, summary: `Applied ${ops.length} change(s) (rule-based mode)` };

  function insertNear(n: UINode, node: { type: string; props: Record<string, unknown> }) {
    const full = { id: newId(), ...node };
    if (isContainer(n.type)) {
      const kids = n.children ?? [];
      const ref = posRef ? kids.findIndex((c) => String(c.props.label ?? c.props.text ?? c.props.title ?? c.props.alt ?? c.props.name ?? "").slice(0, 40) === posRef[2]) : -1;
      ops.push({ op: "insert", parentId: n.id, ...(ref >= 0 ? { index: ref + (after ? 1 : 0) } : {}), node: full });
    }
    else {
      const parent = findParent(tree, n.id);
      if (!parent) return;
      const idx = (parent.children ?? []).findIndex((c) => c.id === n.id);
      ops.push({ op: "insert", parentId: parent.id, index: idx + 1, node: full });
    }
  }
}

// vi-keep-start: tên loại thành phần trong yêu cầu sửa (tiếng Việt cũ + tiếng Anh)
const TYPE_ALIASES: [RegExp, string][] = [
  [/phân trang|pagination|paging/i, "Pagination"], [/ô chọn ngày|chọn ngày|lịch|date picker|calendar/i, "DatePicker"], [/bộ lọc|ô chọn(?! ngày)|dropdown|drop-down|danh sách chọn|\bfilter\b|\bselect\b/i, "Select"],
  [/ô nhập nhiều dòng|textarea|text area|multi-line/i, "Textarea"], [/ô tích|checkbox/i, "Checkbox"], [/tiêu đề|heading|\btitle\b/i, "Heading"], [/đoạn mô tả|đoạn văn|paragraph|text block/i, "Text"],
  [/\blink\b|liên kết/i, "Link"], [/chỉ số|metric|\bstat\b/i, "Stat"], [/\bbảng\b|\btable\b/i, "Table"], [/thông báo|\balert\b|\bnotice\b|notification/i, "Alert"], [/nhãn trạng thái|badge|status label/i, "Badge"], [/hình ảnh|ảnh|image|picture|photo/i, "Image"],
];

/** Loại component được yêu cầu thêm: ưu tiên tên loại trong ngoặc/viết thẳng, sau đó từ khóa (tiếng Anh / tiếng Việt). */
function addTypeOf(text: string): string | null {
  if (!/\bthêm\b|\badd\b|\binsert\b/i.test(text)) return null;
  const named = text.match(/\(([A-Z][A-Za-z]+)\)/)?.[1] ?? text.match(/(?:thêm|add|insert)\s+(?:một\s+|an?\s+)?([A-Z][A-Za-z]+)\b/)?.[1];
  if (named && ALL_TYPES.includes(named) && named !== "Page") return named;
  return TYPE_ALIASES.find(([re]) => re.test(text))?.[1] ?? null;
}

/** Nhãn viết liền sau từ khóa loại: "bộ lọc khách hàng" → "Khách hàng", "filter by customer" → "Customer". */
function labelAfterAlias(text: string, type: string): string | undefined {
  const re = TYPE_ALIASES.find(([, t]) => t === type)?.[0];
  const m = re && text.match(new RegExp(`(?:${re.source})\\s+(?:theo\\s+|by\\s+|for\\s+)?([\\p{L}\\d ]+?)(?=\\s+(?:vào|ở|cho|bên|phía|ngay|to|into|in|on|at|right|next|below|above)\\b|\\s*[(,.]|$)`, "iu"));
  const lb = m?.[1]?.trim();
  return lb && lb.length <= 40 ? cap(lb) : undefined;
}
// vi-keep-end

function defaultNode(type: string, label?: string): { type: string; props: Record<string, unknown> } {
  const lb = label?.trim();
  const name = lb ? snake(lb) : undefined;
  switch (type) {
    case "Select": return { type, props: { label: lb ?? "Type", name: name ?? "type", options: ["All"] } };
    case "DatePicker": return { type, props: { label: lb ?? "Date", name: name ?? "date" } };
    case "Textarea": return { type, props: { label: lb ?? "Description", name: name ?? "description", placeholder: `Enter ${(lb ?? "description").toLowerCase()}` } };
    case "Input": return { type, props: { label: lb ?? "New field", name: name ?? "new_field", placeholder: `Enter ${(lb ?? "a value").toLowerCase()}` } };
    case "Checkbox": return { type, props: { label: lb ?? "Option", name: name ?? "option" } };
    case "Radio": return { type, props: { label: lb ?? "Choice", name: name ?? "choice", options: ["Yes", "No"] } };
    case "Pagination": return { type, props: { pages: 5 } };
    case "Stat": return { type, props: { label: lb ?? "Metric", value: "0" } };
    case "Heading": return { type, props: { text: lb ?? "Heading", level: 2 } };
    case "Text": return { type, props: { text: lb ?? "Short description for the user." } };
    case "Link": return { type, props: { text: lb ?? "See more" } };
    case "Table": return { type, props: { columns: ["Code", "Name", "Status"], rows: [] } };
    case "Alert": return { type, props: { text: lb ?? "Notice", tone: "info" } };
    case "Badge": return { type, props: { text: lb ?? "New" } };
    case "Image": return { type, props: { alt: lb ?? "Image" } };
    case "Button": return { type, props: { label: lb ?? "New button", variant: "secondary" } };
    default: return { type, props: lb ? { title: lb } : {}, ...(isContainer(type) ? { children: [] } : {}) } as { type: string; props: Record<string, unknown> };
  }
}

function snake(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field"; // vi-keep: bỏ dấu tiếng Việt
}

function firstTextNode(n: UINode): UINode | null {
  let found: UINode | null = null;
  walk(n, (d) => {
    if (!found && (typeof d.props.label === "string" || typeof d.props.text === "string" || (typeof d.props.title === "string" && d.type !== "Page"))) found = d;
  });
  return found;
}

// ------------------------------------------------------------------ Docs
// vi-keep-start: nhận diện nhãn nút và vai trò trong yêu cầu cũ tiếng Việt, song song tiếng Anh
const SUBMIT_WORDS = /^(lưu|gửi|xác nhận|submit|cập nhật|hoàn tất|tiếp tục|save|send|confirm|update|complete|continue)$/i;
const ADD_NEW = /^(thêm mới|add new)$/i;
const CANCEL_LABEL = /hủy|huỷ|quay lại|cancel|\bback\b/i;
const AUTH_TEXT = /đăng nhập|đăng ký|login|log in|sign in|register|sign up/i;
const REQUIRED_TEXT = /bắt buộc|required/i;
const FORMAT_TEXT = /định dạng|format/i;
const VALIDATE_TEXT = /kiểm tra|validat/i;

export function mockActors(requirementInput: string): string[] {
  const actors = new Set<string>();
  for (const m of requirementInput.matchAll(/(?:as an?|là)\s+([\p{L} ]{2,30}?)(?:,|\s+i want|\s+tôi muốn|\s+muốn)/giu)) actors.add(cap(m[1].trim()));
  if (/quản trị|admin/i.test(requirementInput)) actors.add("Administrator");
  if (!actors.size) actors.add("User");
  return [...actors];
}
// vi-keep-end


export interface MockUcResult {
  useCases: UseCase[];
  requirements: Requirement[];
}

export function mockUseCases(model: DesignModel, requirementInput: string): MockUcResult {
  const actors = mockActors(requirementInput);
  const primary = actors[0];
  const useCases: UseCase[] = [];
  const requirements: Requirement[] = [];
  let uc = 0;
  let fr = 0;
  const ucCode = () => `UC-${String(++uc).padStart(2, "0")}`;
  const frCode = () => `FR-${String(++fr).padStart(2, "0")}`;

  for (const s of model.screens) {
    const mainActions = s.actions.filter((a) => a.variant !== "secondary" && a.variant !== "ghost" && !CANCEL_LABEL.test(a.label));
    for (const a of mainActions) {
      const fields = a.formId ? s.fields.filter((f) => s.forms.find((fm) => fm.nodeId === a.formId)?.fieldIds.includes(f.nodeId)) : [];
      const name = SUBMIT_WORDS.test(a.label) ? s.title : ADD_NEW.test(a.label) ? `Open the add-new screen (${s.title})` : a.label;
      useCases.push(buildFormUC(ucCode(), name, primary, s, a.nodeId, a.label, a.navigateTo, fields));
    }
    for (const d of s.displays.filter((x) => x.kind === "Table")) {
      const code = ucCode();
      const searchFields = s.fields.filter((f) => !s.forms.some((fm) => fm.fieldIds.includes(f.nodeId)));
      const steps: FlowStep[] = [
        { no: 1, actor: primary, text: `Opens the "${s.title}" screen`, screenId: s.screenId },
        { no: 2, actor: SYSTEM, text: `Displays a data table with the columns: ${d.columns.join(", ")}`, screenId: s.screenId, nodeId: d.nodeId },
      ];
      if (searchFields.length)
        steps.push({ no: 3, actor: primary, text: `Enters/selects the filter criteria: ${searchFields.map((f) => f.label).join(", ")}`, screenId: s.screenId, nodeId: searchFields[0].nodeId }, { no: 4, actor: SYSTEM, text: "Filters and displays the matching results", screenId: s.screenId, nodeId: d.nodeId });
      useCases.push({
        code,
        name: `View list – ${s.title}`,
        actors: [primary],
        description: `${primary} views and searches the data on the ${s.title} screen.`,
        trigger: `${primary} opens the ${s.title} screen`,
        preconditions: [`${primary} is signed in to the system`],
        postconditions: ["The data list is displayed according to the filter criteria"],
        mainFlow: steps,
        altFlows: d.rowActions.map((ra, i) => ({ code: `A${i + 1}`, name: `${ra} a data row`, branchFrom: 2, steps: [`${primary} selects "${ra}" on a row`, `System performs the ${ra.toLowerCase()} function`] })),
        exceptions: [{ code: "E1", name: "No matching data", branchFrom: steps.length, steps: ["System displays the message \"No data found\""] }],
        businessRules: [],
        screenIds: [s.screenId],
        assumptions: d.rowActions.length ? [`The ${d.rowActions.join(", ")} actions have no detailed design yet – to be confirmed by the BA`] : [],
      });
    }
  }

  for (const u of useCases) {
    requirements.push({ code: frCode(), type: "FR", statement: `The system shall allow ${u.actors.join(", ")} to perform "${u.name}".`, priority: "High", useCaseCodes: [u.code], source: `Screen ${u.screenIds.join(", ")}`, isAssumption: false });
    for (const br of u.businessRules) requirements.push({ code: frCode(), type: "FR", statement: `The system shall validate: ${br}.`, priority: "Medium", useCaseCodes: [u.code], source: "Field constraints in the design", isAssumption: false });
  }
  let nfr = 0;
  const nfrCode = () => `NFR-${String(++nfr).padStart(2, "0")}`;
  requirements.push({ code: nfrCode(), type: "NFR", statement: "The response time of the main operations shall not exceed 2 seconds with 100 concurrent users.", priority: "Medium", useCaseCodes: useCases.map((u) => u.code), source: "Default suggestion", isAssumption: true });
  if (model.screens.some((s) => s.fields.some((f) => f.inputType === "password")))
    requirements.push({ code: nfrCode(), type: "NFR", statement: "Passwords shall be stored as hashes (bcrypt/argon2), never in plain text.", priority: "High", useCaseCodes: useCases.filter((u) => model.screens.some((s) => u.screenIds.includes(s.screenId) && s.fields.some((f) => f.inputType === "password"))).map((u) => u.code), source: "Derived from the password field", isAssumption: true });
  return { useCases, requirements };

  function buildFormUC(code: string, name: string, actor: string, s: ScreenModel, actionId: string, actionLabel: string, navigateTo: string, fields: FieldSpec[]): UseCase {
    const steps: FlowStep[] = [{ no: 1, actor, text: `Opens the "${s.title}" screen`, screenId: s.screenId }];
    if (fields.length) {
      steps.push({ no: 2, actor: SYSTEM, text: `Displays a form with: ${fields.map((f) => f.label).join(", ")}`, screenId: s.screenId });
      steps.push({ no: 3, actor, text: `Enters ${fields.map((f) => f.label).join(", ")}`, screenId: s.screenId, nodeId: fields[0].nodeId });
    }
    steps.push({ no: steps.length + 1, actor, text: `Clicks the "${actionLabel}" button`, screenId: s.screenId, nodeId: actionId });
    if (fields.length) steps.push({ no: steps.length + 1, actor: SYSTEM, text: "Validates the entered data" });
    steps.push({ no: steps.length + 1, actor: SYSTEM, text: navigateTo ? `Processes the request and navigates to the "${navigateTo}" screen` : "Processes the request and shows a success message" });
    const validateStep = steps.find((x) => x.text.startsWith("Validates"))?.no ?? steps.length;
    const exceptions: AltFlow[] = [];
    const req = fields.filter((f) => f.required);
    if (req.length) exceptions.push({ code: `E${exceptions.length + 1}`, name: "Required field left empty", branchFrom: validateStep, steps: [`System shows an error on the required fields: ${req.map((f) => f.label).join(", ")}`, "Return to the data entry step"] });
    const constrained = fields.filter((f) => f.constraints.length);
    if (constrained.length) exceptions.push({ code: `E${exceptions.length + 1}`, name: "Data has an invalid format or exceeds a limit", branchFrom: validateStep, steps: [`System shows a format error on: ${constrained.map((f) => f.label).join(", ")}`, "Return to the data entry step"] });
    exceptions.push({ code: `E${exceptions.length + 1}`, name: "System error during processing", branchFrom: steps.length, steps: ["System shows an error message and keeps the entered data"] });
    const altFlows: AltFlow[] = s.links.map((l, i) => ({ code: `A${i + 1}`, name: l.text, branchFrom: Math.min(3, steps.length), steps: [`${actor} selects "${l.text}"`, l.navigateTo ? `System navigates to the "${l.navigateTo}" screen` : "System handles the link"] }));
    const cancel = s.actions.find((a) => CANCEL_LABEL.test(a.label));
    if (cancel) altFlows.push({ code: `A${altFlows.length + 1}`, name: `Clicks "${cancel.label}"`, branchFrom: Math.min(3, steps.length), steps: [`${actor} clicks "${cancel.label}"`, `System cancels the operation${cancel.navigateTo ? ` and returns to "${cancel.navigateTo}"` : ""}`] });
    const businessRules = fields.flatMap((f) => [...(f.required ? [`${f.label} is required`] : []), ...f.constraints.map((c) => `${f.label}: ${c}`)]);
    return {
      code,
      name,
      actors: [actor],
      description: `${actor} performs "${name}" on the ${s.title} screen.`,
      trigger: `${actor} clicks "${actionLabel}"`,
      preconditions: [AUTH_TEXT.test(`${name} ${s.title} ${actionLabel} ${s.actions.find((x) => x.nodeId === actionId)?.action ?? ""}`) ? `${actor} is not signed in` : `${actor} is signed in to the system`],
      postconditions: [navigateTo ? `System displays the "${navigateTo}" screen` : "The data is saved successfully"],
      mainFlow: steps,
      altFlows,
      exceptions,
      businessRules,
      screenIds: [s.screenId],
      assumptions: [`Server-side processing rules for "${actionLabel}" are not visible in the design – to be confirmed by the BA`],
    };
  }
}

export function mockSrs(moduleName: string, requirementInput: string, model: DesignModel, ucs: UseCase[], reqs: Requirement[]): SrsDoc {
  const actors = [...new Set(ucs.flatMap((u) => u.actors))];
  const frs = reqs.filter((r) => r.type === "FR");
  const nfrs = reqs.filter((r) => r.type === "NFR");
  const fields = model.screens.flatMap((s) => s.fields.map((f) => ({ ...f, screen: s.title })));
  return {
    sections: [
      { key: "intro", title: "1. Introduction", content: `### 1.1 Purpose\nSoftware requirements specification (SRS) for module **${moduleName}**, generated automatically from the approved user interface design; to be reviewed by the BA.\n\n### 1.2 Scope\n${requirementInput.trim() || "The scope is defined by the designed screens."}\n\n### 1.3 References\n- ISO/IEC/IEEE 29148:2018 – Requirements engineering\n- Module use case specification` },
      { key: "overview", title: "2. Overall Description", content: `### 2.1 Actors\n${actors.map((a) => `- ${a}`).join("\n")}\n\n### 2.2 Screens\n${model.screens.map((s) => `- ${s.title}`).join("\n")}\n\n### 2.3 Navigation\n${model.navigation.length ? model.navigation.map((n) => `- ${n.from} → ${n.to} (via "${n.via}")`).join("\n") : "- No navigation links yet"}` },
      { key: "functional", title: "3. Functional Requirements", content: `| ID | Requirement | Priority | Use Case |\n| --- | --- | --- | --- |\n${frs.map((r) => `| ${r.code} | ${r.statement} | ${r.priority} | ${r.useCaseCodes.join(", ")} |`).join("\n")}` },
      { key: "nonfunctional", title: "4. Non-functional Requirements", content: `${nfrs.map((r) => `- **${r.code}**: ${r.statement}${r.isAssumption ? " _(Assumption – to be confirmed)_" : ""}`).join("\n") || "- Not defined yet"}` },
      { key: "interfaces", title: "5. User Interfaces", content: model.screens.map((s) => `### ${s.title}\n- Data fields: ${s.fields.map((f) => f.label).join(", ") || "none"}\n- Actions: ${s.actions.map((a) => a.label).join(", ") || "none"}`).join("\n\n") },
      { key: "data", title: "6. Data Dictionary", content: `| Screen | Field | Type | Required | Constraints |\n| --- | --- | --- | --- | --- |\n${fields.map((f) => `| ${f.screen} | ${f.label} | ${f.inputType} | ${f.required ? "Yes" : "No"} | ${f.constraints.join("; ") || "-"} |`).join("\n")}` },
      { key: "assumptions", title: "7. Assumptions and Open Issues", content: [...new Set(ucs.flatMap((u) => u.assumptions))].map((a) => `- ${a}`).join("\n") || "- None" },
    ],
  };
}

export function mockSequence(uc: UseCase, screenTitle: (id: string) => string): SequenceDiagram {
  const actor = uc.actors[0] ?? "User";
  const ui = uc.screenIds[0] ? screenTitle(uc.screenIds[0]) : "User interface";
  const lines = ["sequenceDiagram", "  autonumber", `  actor A as ${safe(actor)}`, `  participant UI as ${safe(ui)}`, "  participant API as API Server", "  participant DB as Database"];
  for (const s of uc.mainFlow) {
    if (isSys(s.actor)) {
      if (/kiểm tra|validat|check/i.test(s.text)) lines.push(`  UI->>API: Send request`, `  API->>API: ${safe(s.text)}`); // vi-keep: bước UC cũ tiếng Việt
      else if (/xử lý|lưu|lọc|process|save|filter/i.test(s.text)) lines.push(`  API->>DB: Query/update data`, `  DB-->>API: Result`, `  API-->>UI: Response`, `  UI-->>A: ${safe(s.text)}`); // vi-keep: bước UC cũ tiếng Việt
      else lines.push(`  UI-->>A: ${safe(s.text)}`);
    } else lines.push(`  A->>UI: ${safe(s.text)}`);
  }
  if (uc.exceptions.length) {
    lines.push(`  alt ${safe(uc.exceptions[0].name)}`);
    for (const st of uc.exceptions[0].steps) lines.push(`    UI-->>A: ${safe(st)}`);
    lines.push("  end");
  }
  return { useCaseCode: uc.code, title: `${uc.code} – ${uc.name}`, mermaid: lines.join("\n") };
}

/** Mermaid không chấp nhận một số ký tự trong nhãn. */
export function safe(s: string): string {
  return s.replace(/[;#:]/g, " ").replace(/"/g, "'").replace(/\s+/g, " ").trim().slice(0, 90);
}

export function mockTests(ucs: UseCase[], reqs: Requirement[], model: DesignModel): TestCase[] {
  const tests: TestCase[] = [];
  let n = 0;
  const code = () => `TC-${String(++n).padStart(3, "0")}`;
  const fieldsById = new Map(model.screens.flatMap((s) => s.fields.map((f) => [f.nodeId, f] as const)));
  for (const u of ucs) {
    const ucReqs = reqs.filter((r) => r.type === "FR" && r.useCaseCodes.includes(u.code));
    const mainReq = ucReqs.slice(0, 1).map((r) => r.code);
    const pre = u.preconditions.join("; ");
    // Màn của UC: theo screenIds; UC đợt 5 (sinh từ BRD, chưa gắn màn) thì lấy màn có tên được nhắc trong UC
    const ucText = foldVi([u.name, u.description, ...u.mainFlow.map((x) => x.text)].join(" "));
    const ucScreens = u.screenIds.length ? model.screens.filter((s) => u.screenIds.includes(s.screenId)) : model.screens.filter((s) => s.title && ucText.includes(foldVi(s.title)));
    const ucFields = ucScreens.flatMap((s) => s.fields);
    const sample = ucFields.map((f) => `${f.label} = ${sampleValue(f)}`).join("; ");
    const userSteps = u.mainFlow.filter((s) => !isSys(s.actor)).map((s) => s.text);
    tests.push({ code: code(), title: `${u.name} – main flow succeeds`, type: "Positive", priority: "High", useCaseCode: u.code, flowRef: "main", requirementCodes: mainReq, preconditions: pre, testData: sample || "-", steps: userSteps, expected: u.postconditions.join("; ") });
    for (const a of u.altFlows) tests.push({ code: code(), title: `${u.name} – ${a.name}`, type: "Positive", priority: "Medium", useCaseCode: u.code, flowRef: a.code, requirementCodes: mainReq, preconditions: pre, testData: "-", steps: a.steps.filter((s) => !sysStep(s)), expected: a.steps.filter((s) => sysStep(s)).join("; ") || "System handles the alternative flow correctly" });
    for (const e of u.exceptions) {
      const rules = ucReqs.filter((r) => VALIDATE_TEXT.test(r.statement));
      const ruleReqs = (REQUIRED_TEXT.test(e.name) ? rules.filter((r) => REQUIRED_TEXT.test(r.statement)) : FORMAT_TEXT.test(e.name) ? rules.filter((r) => !REQUIRED_TEXT.test(r.statement)) : []).map((r) => r.code);
      tests.push({ code: code(), title: `${u.name} – ${e.name}`, type: "Negative", priority: "High", useCaseCode: u.code, flowRef: e.code, requirementCodes: ruleReqs.length ? ruleReqs : mainReq, preconditions: pre, testData: REQUIRED_TEXT.test(e.name) ? "Leave the required fields empty" : FORMAT_TEXT.test(e.name) ? "Enter data with an invalid format or beyond the limit" : "Simulate a server error", steps: [...userSteps], expected: e.steps.join("; ") });
    }
    // Giá trị biên cho trường có minLength/maxLength
    for (const f of ucFields) {
      const field = fieldsById.get(f.nodeId) ?? f;
      const min = num(field.constraints, "minLength");
      const max = num(field.constraints, "maxLength");
      const brCode = ucReqs.find((r) => r.statement.includes(field.label) && r.statement.includes("Length"))?.code;
      const refs = brCode ? [brCode] : mainReq;
      const formatFlow = u.exceptions.find((e) => FORMAT_TEXT.test(e.name))?.code ?? "main";
      if (min !== null) {
        tests.push({ code: code(), title: `${field.label} – length ${min - 1} characters (below boundary)`, type: "Boundary", priority: "Medium", useCaseCode: u.code, flowRef: formatFlow, requirementCodes: refs, preconditions: pre, testData: `${field.label} with ${min - 1} characters`, steps: [`Enter ${field.label} with ${min - 1} characters`, "Submit the form"], expected: `System shows an error: ${field.label} must be at least ${min} characters` });
        tests.push({ code: code(), title: `${field.label} – length ${min} characters (at boundary)`, type: "Boundary", priority: "Medium", useCaseCode: u.code, flowRef: "main", requirementCodes: refs, preconditions: pre, testData: `${field.label} with ${min} characters`, steps: [`Enter ${field.label} with ${min} characters`, "Submit the form"], expected: "System accepts the value" });
      }
      if (max !== null) {
        tests.push({ code: code(), title: `${field.label} – length ${max + 1} characters (above boundary)`, type: "Boundary", priority: "Medium", useCaseCode: u.code, flowRef: formatFlow, requirementCodes: refs, preconditions: pre, testData: `${field.label} with ${max + 1} characters`, steps: [`Enter ${field.label} with ${max + 1} characters`, "Submit the form"], expected: `System blocks the input or shows an error: ${field.label} must be at most ${max} characters` });
      }
    }
  }
  // Đợt 5: FR chưa có test nào (FRD-NFR không gắn UC, hoặc UC không có luồng) → mỗi FR một test kiểm chứng
  const covered = new Set(tests.flatMap((t) => t.requirementCodes));
  for (const r of reqs.filter((x) => x.type === "FR" && !covered.has(x.code))) {
    const uc = ucs.find((u) => r.useCaseCodes.includes(u.code));
    tests.push({
      code: code(),
      title: `${r.code} – ${r.statement.length > 80 ? r.statement.slice(0, 77) + "…" : r.statement}`,
      type: "Positive",
      priority: r.priority,
      useCaseCode: uc?.code ?? "",
      flowRef: "main",
      requirementCodes: [r.code],
      preconditions: uc?.preconditions.join("; ") ?? "",
      testData: "-",
      steps: ["Perform the operation described by requirement " + r.code, "Observe the result returned by the system"],
      expected: r.statement,
    });
  }
  return tests;
}

const foldVi = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase(); // vi-keep: bỏ dấu tiếng Việt khi so khớp

function num(constraints: string[], key: string): number | null {
  const c = constraints.find((x) => x.startsWith(`${key}=`));
  return c ? Number(c.split("=")[1]) : null;
}

function sampleValue(f: FieldSpec): string {
  if (f.inputType === "email") return "ba.test@company.com";
  if (f.inputType === "password") return "Passw0rd@123";
  if (f.inputType === "tel") return "0912345678";
  if (f.inputType === "number") return "10";
  if (f.inputType === "date") return "10/15/2026";
  if (f.options?.length) return f.options[0];
  if (f.kind === "Checkbox") return "Checked";
  return `Sample ${f.label.toLowerCase()}`;
}

// ------------------------------------------------------------------ Sơ đồ UC (A5, FN-11) – bản Mock dùng lại buildUcMermaid
export function mockUcDiagram(useCases: UseCase[]): { code: string } {
  const actors = [...new Set(useCases.flatMap((u) => u.actors))];
  return { code: buildUcMermaid(useCases, actors) };
}

// ------------------------------------------------------------------ Màn còn thiếu (UC-29, FN-58) – bản Mock của suggestMissingScreens
// So khớp từ khoá: FR / story coi là đã phủ khi ≥ COVERAGE_THRESHOLD từ khoá của nó có trên một màn. Chỉ chạy khi chưa có khoá
// Claude; giao diện gắn nhãn "Sample result" cho kết quả này.

// Tỉ lệ từ khoá của FR/story phải xuất hiện trên một màn để coi là đã phủ.
export const COVERAGE_THRESHOLD = 0.6;

// Từ không mang nghĩa nghiệp vụ, bỏ đi khi so khớp (đã bỏ dấu qua slug).
const STOPWORDS = new Set(
  [
    "he thong", "nguoi dung", "cho phep", "co the", "phai", "duoc", "can", "cua", "cho", "voi", "va", "hoac", "cac", "nhung", "mot",
    "la", "toi", "muon", "de", "khi", "theo", "trong", "tren", "tu", "den", "vao", "ra", "nay", "do", "the",
    "system", "user", "shall", "should", "must", "can", "the", "a", "an", "to", "of", "for", "and", "or", "with", "in", "on", "by", "be", "i", "my",
  ].flatMap((w) => w.split(" ")),
);

function keywords(text: string): string[] {
  return [...new Set(slug(text).split("_").filter((t) => t.length > 1 && !STOPWORDS.has(t)))];
}

// Toàn bộ chữ có trên một màn: tên, tiêu đề, heading, nhãn nút, nhãn trường, link, cột bảng.
function screenVocabulary(s: ScreenModel): Set<string> {
  const parts = [
    s.screenName,
    s.title,
    ...s.headings,
    ...s.actions.map((a) => a.label),
    ...s.fields.map((f) => f.label),
    ...s.links.map((l) => l.text),
    ...s.displays.flatMap((d) => [d.title, ...d.columns, ...d.rowActions]),
    ...s.forms.map((f) => f.title),
  ];
  return new Set(parts.flatMap((p) => slug(p).split("_")).filter(Boolean));
}

function isCovered(text: string, vocabularies: Set<string>[]): boolean {
  const kw = keywords(text);
  if (!kw.length) return true; // không có từ khoá nào để so: không gợi ý
  return vocabularies.some((v) => kw.filter((k) => v.has(k)).length / kw.length >= COVERAGE_THRESHOLD);
}

// FR kiểm tra dữ liệu ("Hệ thống phải kiểm tra: Tên là bắt buộc") là quy tắc của trường trên màn đã có, không phải màn mới.
// vi-keep-start: mẫu câu FR tiếng Việt cũ trong DB, song song tiếng Anh
const VALIDATION_FR = /^(?:(?:hệ thống|the system)\s+(?:phải|shall|must|should)\s+)?(?:kiểm tra|validate)\s*:/iu;
// Phần mở đầu không mang tên màn: "Hệ thống phải (cho phép <vai trò> thực hiện)", "The system shall (allow <role> to)".
const LEAD = /^(?:hệ thống|the system)\s+(?:phải|shall|must|should)\s+(?:cho phép\s+(?:\S+\s+){0,4}?thực hiện\s+|allow\s+(?:\S+\s+){0,3}?to\s+)?/iu;
// Từ mở đầu mệnh đề phụ: tên màn dừng trước chúng ("… theo trạng thái", "… để xử lý").
const CLAUSE_WORDS = new Set(["để", "nhằm", "theo", "khi", "trong", "cho", "when", "for", "by", "so", "via"]);
// Từ nối không được đứng cuối tên.
const TRAILING_WORDS = new Set(["và", "hoặc", "của", "các", "với", "and", "or", "of", "the", "a", "an", "to", "with"]);
// vi-keep-end
const MAX_NAME_WORDS = 8;

// Tên màn đề xuất: bỏ phần mở đầu chung, dừng ở mệnh đề phụ, tối đa 8 từ, không kết thúc bằng từ nối, viết hoa chữ đầu.
// FR dạng 'cho phép Quản trị viên thực hiện "Thêm sản phẩm"' lấy tên là thao tác trong ngoặc kép.
export function mockScreenName(text: string): string {
  const quoted = text.match(/["“]([^"”]+)["”]/u)?.[1];
  let words: string[] = [];
  if (quoted) {
    words = quoted.trim().replace(/^(?:mở màn hình|open(?: the)? screen)\s+/iu, "").replace(/\s*\(([^)]+)\)\s*$/u, " – $1").split(/\s+/); // vi-keep: FR tiếng Việt cũ
  } else {
    // Bỏ chú thích trong ngoặc ("… ra Excel (ví dụ theo tháng)"), kể cả ngoặc chưa đóng
    const core = text.replace(/\s*[(（][^)）]*[)）]?/gu, " ").replace(/[.。!?]+$/u, "").trim().replace(LEAD, "");
    for (const w of core.split(/\s+/)) {
      if (words.length && CLAUSE_WORDS.has(w.toLowerCase())) break;
      words.push(w);
    }
  }
  words = words.slice(0, MAX_NAME_WORDS);
  while (words.length > 1 && TRAILING_WORDS.has(words[words.length - 1].toLowerCase())) words.pop();
  const name = words.join(" ").replace(/[\s:;,–-]+$/u, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function mockMissingScreens(model: DesignModel, sources: SuggestSource[]): MissingScreen[] {
  const vocabularies = model.screens.map(screenVocabulary);
  const out: MissingScreen[] = [];
  for (const src of sources) {
    if (src.kind === "fr" && VALIDATION_FR.test(src.text)) continue;
    const text = src.kind === "story" ? parseStory(src.text).means ?? src.text : src.text;
    if (isCovered(text, vocabularies)) continue;
    out.push({ key: src.key, name: mockScreenName(text) });
  }
  return out;
}
