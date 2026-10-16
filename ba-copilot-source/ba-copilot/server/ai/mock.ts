// Bộ sinh rule-based (chế độ Mock): chạy khi không có API key, dùng cho demo/test tự động
// và làm "baseline" để so sánh với LLM trong chương thực nghiệm.

import { findNode, findParent, isContainer, newId, normalizeTree, UINode, walk } from "../../shared/design.ts";
import type { PatchOp } from "../../shared/patch.ts";
import type { DesignModel, ScreenModel, FieldSpec } from "../../shared/extract.ts";
import type { AltFlow, Requirement, SequenceDiagram, SrsDoc, TestCase, UseCase, FlowStep } from "../../shared/types.ts";

// ------------------------------------------------------------------ Screens
const has = (s: string, re: RegExp) => re.test(s.toLowerCase());

function entityFrom(prompt: string, fallback: string): string {
  const m = prompt.match(/(?:quản lý|danh sách|thêm|tạo|chỉnh sửa|form|màn hình)\s+([\p{L}\d ]{2,40}?)(?:[,.;:\n]|$| gồm| có| với| cho)/iu);
  const e = (m?.[1] ?? fallback).trim();
  return e.charAt(0).toUpperCase() + e.slice(1);
}

export function mockScreen(prompt: string, name: string): UINode {
  const p = prompt.toLowerCase();
  let tree: unknown;
  if (has(p, /đăng nhập|login|sign in/)) {
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || "Đăng nhập" },
      children: [
        {
          id: "login_card",
          type: "Card",
          props: { title: "Đăng nhập hệ thống" },
          children: [
            {
              id: "login_form",
              type: "Form",
              props: { submitAction: "login" },
              children: [
                { id: "email", type: "Input", props: { label: "Email", name: "email", inputType: "email", placeholder: "ban@congty.vn", required: true, maxLength: 100 } },
                { id: "password", type: "Input", props: { label: "Mật khẩu", name: "password", inputType: "password", required: true, minLength: 8, maxLength: 32 } },
                { id: "remember", type: "Checkbox", props: { label: "Ghi nhớ đăng nhập", name: "remember" } },
                { id: "btn_login", type: "Button", props: { label: "Đăng nhập", variant: "primary", action: "login", navigateTo: "Trang chủ" } },
              ],
            },
            {
              id: "login_links",
              type: "Row",
              props: { align: "between" },
              children: [
                { id: "link_forgot", type: "Link", props: { text: "Quên mật khẩu?", navigateTo: "Quên mật khẩu" } },
                { id: "link_register", type: "Link", props: { text: "Đăng ký tài khoản", navigateTo: "Đăng ký" } },
              ],
            },
          ],
        },
      ],
    };
  } else if (has(p, /đăng ký|register|sign up/)) {
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || "Đăng ký" },
      children: [
        {
          id: "reg_card",
          type: "Card",
          props: { title: "Tạo tài khoản" },
          children: [
            {
              id: "reg_form",
              type: "Form",
              props: { submitAction: "register" },
              children: [
                { id: "fullname", type: "Input", props: { label: "Họ và tên", name: "full_name", required: true, maxLength: 50 } },
                { id: "reg_email", type: "Input", props: { label: "Email", name: "email", inputType: "email", required: true } },
                { id: "phone", type: "Input", props: { label: "Số điện thoại", name: "phone", inputType: "tel", pattern: "^0\\d{9}$" } },
                { id: "reg_password", type: "Input", props: { label: "Mật khẩu", name: "password", inputType: "password", required: true, minLength: 8 } },
                { id: "agree", type: "Checkbox", props: { label: "Tôi đồng ý với điều khoản sử dụng", name: "agree" } },
                { id: "btn_register", type: "Button", props: { label: "Đăng ký", variant: "primary", action: "register", navigateTo: "Đăng nhập" } },
              ],
            },
          ],
        },
      ],
    };
  } else if (has(p, /quản lý|danh sách|list|tra cứu|tìm kiếm/)) {
    const ent = entityFrom(prompt, name || "dữ liệu");
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || `Quản lý ${ent}` },
      children: [
        { id: "header", type: "Header", props: { title: `Quản lý ${ent}` } },
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
                { id: "search", type: "Input", props: { label: "Tìm kiếm", name: "keyword", placeholder: `Tên ${ent.toLowerCase()}...`, maxLength: 100 } },
                { id: "status_filter", type: "Select", props: { label: "Trạng thái", name: "status", options: ["Tất cả", "Hoạt động", "Ngừng hoạt động"] } },
              ],
            },
            { id: "btn_add", type: "Button", props: { label: "Thêm mới", variant: "primary", action: "create", navigateTo: `Thêm ${ent.toLowerCase()}` } },
          ],
        },
        {
          id: "table",
          type: "Table",
          props: {
            columns: ["Mã", "Tên", "Trạng thái", "Ngày tạo"],
            rows: [
              ["001", `${ent} A`, "Hoạt động", "01/10/2026"],
              ["002", `${ent} B`, "Ngừng hoạt động", "05/10/2026"],
            ],
            rowActions: ["Xem", "Sửa", "Xóa"],
          },
        },
        { id: "pagination", type: "Pagination", props: { pages: 5 } },
      ],
    };
  } else if (has(p, /thêm|tạo|form|nhập|chỉnh sửa|cập nhật/)) {
    const ent = entityFrom(prompt, name || "bản ghi");
    tree = {
      id: "page",
      type: "Page",
      props: { title: name || `Thêm ${ent.toLowerCase()}` },
      children: [
        { id: "header", type: "Header", props: { title: `Thêm ${ent.toLowerCase()}` } },
        {
          id: "main_form",
          type: "Form",
          props: { title: `Thông tin ${ent.toLowerCase()}`, submitAction: "save" },
          children: [
            { id: "f_name", type: "Input", props: { label: `Tên ${ent.toLowerCase()}`, name: "name", required: true, maxLength: 100 } },
            { id: "f_category", type: "Select", props: { label: "Danh mục", name: "category", options: ["Loại 1", "Loại 2", "Loại 3"], required: true } },
            { id: "f_date", type: "DatePicker", props: { label: "Ngày hiệu lực", name: "effective_date" } },
            { id: "f_desc", type: "Textarea", props: { label: "Mô tả", name: "description", maxLength: 500 } },
            {
              id: "form_actions",
              type: "Row",
              props: { gap: 8, align: "end" },
              children: [
                { id: "btn_cancel", type: "Button", props: { label: "Hủy", variant: "secondary", action: "cancel", navigateTo: `Quản lý ${ent.toLowerCase()}` } },
                { id: "btn_save", type: "Button", props: { label: "Lưu", variant: "primary", action: "save", navigateTo: `Quản lý ${ent.toLowerCase()}` } },
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
      props: { title: name || "Trang chủ" },
      children: [
        { id: "header", type: "Header", props: { title: name || "Tổng quan" } },
        {
          id: "stats",
          type: "Row",
          props: { gap: 12 },
          children: [
            { id: "stat_1", type: "Stat", props: { label: "Tổng số", value: "1.250" } },
            { id: "stat_2", type: "Stat", props: { label: "Đang xử lý", value: "36" } },
            { id: "stat_3", type: "Stat", props: { label: "Hoàn thành", value: "1.180" } },
          ],
        },
        {
          id: "recent",
          type: "Section",
          props: { title: "Hoạt động gần đây" },
          children: [{ id: "recent_table", type: "Table", props: { columns: ["Thời gian", "Nội dung", "Người thực hiện"], rows: [["08:30", "Tạo mới bản ghi", "BA"]] } }],
        },
      ],
    };
  }
  return normalizeTree(tree);
}

// ------------------------------------------------------------------ Edit
export function mockEditOps(tree: UINode, selectedIds: string[], instruction: string): { ops: PatchOp[]; summary: string } {
  const text = instruction.trim();
  const low = text.toLowerCase();
  const targets = selectedIds.length ? selectedIds : [tree.id];
  const ops: PatchOp[] = [];
  const quoted = text.match(/["“”']([^"“”']+)["“”']/)?.[1];

  const rename = text.match(/(?:đổi|sửa|thay)[^\n]*?(?:thành|sang)\s*["“]?([^"”\n]+?)["”]?\s*$/im);
  const addButton = text.match(/thêm\s+(?:nút|button)\s*["“]?([^"”\n,.]+)["”]?/i);
  const addField = text.match(/thêm\s+(?:ô|trường|field)(?:\s+nhập)?\s*["“]?([^"”\n,.]+)["”]?/i);

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
      const action = text.match(/action\s+([a-z_]+)/i)?.[1];
      insertNear(n, { type: "Button", props: { label: (quoted ?? addButton[1]).trim(), variant, ...(action ? { action } : {}) } });
    }
    if (addField) insertNear(n, { type: "Input", props: { label: (quoted ?? addField[1]).trim(), required: /bắt buộc/.test(low) } });
    if (/\b(xóa|xoá|bỏ|loại bỏ)\b/.test(low) && !addButton && !addField && !rename && n.id !== tree.id) ops.push({ op: "remove", id: n.id });
    if (/bắt buộc/.test(low) && !addField) walk(n, (d) => {
      if (["Input", "Textarea", "Select", "DatePicker", "Radio"].includes(d.type)) ops.push({ op: "update", id: d.id, props: { required: true } });
    });
    if (/màu đỏ|nguy hiểm|danger|cảnh báo/.test(low)) walk(n, (d) => {
      if (d.type === "Button") ops.push({ op: "update", id: d.id, props: { variant: "danger" } });
      if (d.type === "Badge" || d.type === "Alert") ops.push({ op: "update", id: d.id, props: { tone: "danger" } });
    });
    if (/nổi bật|primary|nút chính/.test(low)) walk(n, (d) => {
      if (d.type === "Button") ops.push({ op: "update", id: d.id, props: { variant: "primary" } });
    });
  }
  if (!ops.length) {
    const anchor = findNode(tree, targets[0]) ?? tree;
    insertNear(anchor, { type: "Alert", props: { text: `Ghi chú BA: ${text.slice(0, 160)}`, tone: "info" } });
  }
  return { ops, summary: `Áp dụng ${ops.length} thay đổi (chế độ rule-based)` };

  function insertNear(n: UINode, node: { type: string; props: Record<string, unknown> }) {
    const full = { id: newId(), ...node };
    if (isContainer(n.type)) ops.push({ op: "insert", parentId: n.id, node: full });
    else {
      const parent = findParent(tree, n.id);
      if (!parent) return;
      const idx = (parent.children ?? []).findIndex((c) => c.id === n.id);
      ops.push({ op: "insert", parentId: parent.id, index: idx + 1, node: full });
    }
  }
}

function firstTextNode(n: UINode): UINode | null {
  let found: UINode | null = null;
  walk(n, (d) => {
    if (!found && (typeof d.props.label === "string" || typeof d.props.text === "string" || (typeof d.props.title === "string" && d.type !== "Page"))) found = d;
  });
  return found;
}

// ------------------------------------------------------------------ Docs
const SUBMIT_WORDS = /^(lưu|gửi|xác nhận|submit|cập nhật|hoàn tất|tiếp tục)$/i;

export function mockActors(requirementInput: string): string[] {
  const actors = new Set<string>();
  for (const m of requirementInput.matchAll(/(?:as an?|là)\s+([\p{L} ]{2,30}?)(?:,|\s+i want|\s+tôi muốn|\s+muốn)/giu)) actors.add(cap(m[1].trim()));
  if (/quản trị|admin/i.test(requirementInput)) actors.add("Quản trị viên");
  if (!actors.size) actors.add("Người dùng");
  return [...actors];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
    const mainActions = s.actions.filter((a) => a.variant !== "secondary" && a.variant !== "ghost" && !/hủy|quay lại|cancel/i.test(a.label));
    for (const a of mainActions) {
      const fields = a.formId ? s.fields.filter((f) => s.forms.find((fm) => fm.nodeId === a.formId)?.fieldIds.includes(f.nodeId)) : [];
      const name = SUBMIT_WORDS.test(a.label) ? s.title : a.label === "Thêm mới" ? `Mở màn hình thêm mới (${s.title})` : a.label;
      useCases.push(buildFormUC(ucCode(), name, primary, s, a.nodeId, a.label, a.navigateTo, fields));
    }
    for (const d of s.displays.filter((x) => x.kind === "Table")) {
      const code = ucCode();
      const searchFields = s.fields.filter((f) => !s.forms.some((fm) => fm.fieldIds.includes(f.nodeId)));
      const steps: FlowStep[] = [
        { no: 1, actor: primary, text: `Mở màn hình "${s.title}"`, screenId: s.screenId },
        { no: 2, actor: "Hệ thống", text: `Hiển thị bảng dữ liệu gồm các cột: ${d.columns.join(", ")}`, screenId: s.screenId, nodeId: d.nodeId },
      ];
      if (searchFields.length)
        steps.push({ no: 3, actor: primary, text: `Nhập/chọn điều kiện lọc: ${searchFields.map((f) => f.label).join(", ")}`, screenId: s.screenId, nodeId: searchFields[0].nodeId }, { no: 4, actor: "Hệ thống", text: "Lọc và hiển thị kết quả phù hợp", screenId: s.screenId, nodeId: d.nodeId });
      useCases.push({
        code,
        name: `Xem danh sách – ${s.title}`,
        actors: [primary],
        description: `${primary} xem và tra cứu dữ liệu trên màn hình ${s.title}.`,
        trigger: `${primary} truy cập màn hình ${s.title}`,
        preconditions: [`${primary} đã đăng nhập hệ thống`],
        postconditions: ["Danh sách dữ liệu được hiển thị theo điều kiện lọc"],
        mainFlow: steps,
        altFlows: d.rowActions.map((ra, i) => ({ code: `A${i + 1}`, name: `${ra} một dòng dữ liệu`, branchFrom: 2, steps: [`${primary} chọn "${ra}" tại một dòng`, `Hệ thống thực hiện chức năng ${ra.toLowerCase()}`] })),
        exceptions: [{ code: "E1", name: "Không có dữ liệu phù hợp", branchFrom: steps.length, steps: ["Hệ thống hiển thị thông báo \"Không tìm thấy dữ liệu\""] }],
        businessRules: [],
        screenIds: [s.screenId],
        assumptions: d.rowActions.length ? [`Chưa có thiết kế chi tiết cho các thao tác ${d.rowActions.join(", ")} – cần BA xác nhận`] : [],
      });
    }
  }

  for (const u of useCases) {
    requirements.push({ code: frCode(), type: "FR", statement: `Hệ thống phải cho phép ${u.actors.join(", ")} thực hiện "${u.name}".`, priority: "High", useCaseCodes: [u.code], source: `Màn hình ${u.screenIds.join(", ")}`, isAssumption: false });
    for (const br of u.businessRules) requirements.push({ code: frCode(), type: "FR", statement: `Hệ thống phải kiểm tra: ${br}.`, priority: "Medium", useCaseCodes: [u.code], source: "Ràng buộc trường dữ liệu trên thiết kế", isAssumption: false });
  }
  let nfr = 0;
  const nfrCode = () => `NFR-${String(++nfr).padStart(2, "0")}`;
  requirements.push({ code: nfrCode(), type: "NFR", statement: "Thời gian phản hồi của các thao tác chính không vượt quá 2 giây với 100 người dùng đồng thời.", priority: "Medium", useCaseCodes: useCases.map((u) => u.code), source: "Gợi ý mặc định", isAssumption: true });
  if (model.screens.some((s) => s.fields.some((f) => f.inputType === "password")))
    requirements.push({ code: nfrCode(), type: "NFR", statement: "Mật khẩu phải được lưu dưới dạng băm (bcrypt/argon2), không lưu bản rõ.", priority: "High", useCaseCodes: useCases.filter((u) => model.screens.some((s) => u.screenIds.includes(s.screenId) && s.fields.some((f) => f.inputType === "password"))).map((u) => u.code), source: "Suy ra từ trường mật khẩu", isAssumption: true });
  return { useCases, requirements };

  function buildFormUC(code: string, name: string, actor: string, s: ScreenModel, actionId: string, actionLabel: string, navigateTo: string, fields: FieldSpec[]): UseCase {
    const steps: FlowStep[] = [{ no: 1, actor, text: `Mở màn hình "${s.title}"`, screenId: s.screenId }];
    if (fields.length) {
      steps.push({ no: 2, actor: "Hệ thống", text: `Hiển thị biểu mẫu gồm: ${fields.map((f) => f.label).join(", ")}`, screenId: s.screenId });
      steps.push({ no: 3, actor, text: `Nhập thông tin ${fields.map((f) => f.label).join(", ")}`, screenId: s.screenId, nodeId: fields[0].nodeId });
    }
    steps.push({ no: steps.length + 1, actor, text: `Nhấn nút "${actionLabel}"`, screenId: s.screenId, nodeId: actionId });
    if (fields.length) steps.push({ no: steps.length + 1, actor: "Hệ thống", text: "Kiểm tra tính hợp lệ của dữ liệu nhập" });
    steps.push({ no: steps.length + 1, actor: "Hệ thống", text: navigateTo ? `Xử lý yêu cầu và chuyển tới màn hình "${navigateTo}"` : "Xử lý yêu cầu và hiển thị thông báo thành công" });
    const validateStep = steps.find((x) => x.text.startsWith("Kiểm tra"))?.no ?? steps.length;
    const exceptions: AltFlow[] = [];
    const req = fields.filter((f) => f.required);
    if (req.length) exceptions.push({ code: `E${exceptions.length + 1}`, name: "Bỏ trống trường bắt buộc", branchFrom: validateStep, steps: [`Hệ thống báo lỗi tại các trường bắt buộc: ${req.map((f) => f.label).join(", ")}`, "Quay lại bước nhập thông tin"] });
    const constrained = fields.filter((f) => f.constraints.length);
    if (constrained.length) exceptions.push({ code: `E${exceptions.length + 1}`, name: "Dữ liệu không đúng định dạng/giới hạn", branchFrom: validateStep, steps: [`Hệ thống báo lỗi định dạng tại: ${constrained.map((f) => f.label).join(", ")}`, "Quay lại bước nhập thông tin"] });
    exceptions.push({ code: `E${exceptions.length + 1}`, name: "Lỗi hệ thống khi xử lý", branchFrom: steps.length, steps: ["Hệ thống hiển thị thông báo lỗi và giữ nguyên dữ liệu đã nhập"] });
    const altFlows: AltFlow[] = s.links.map((l, i) => ({ code: `A${i + 1}`, name: l.text, branchFrom: Math.min(3, steps.length), steps: [`${actor} chọn "${l.text}"`, l.navigateTo ? `Hệ thống chuyển tới màn hình "${l.navigateTo}"` : "Hệ thống xử lý liên kết"] }));
    const cancel = s.actions.find((a) => /hủy|cancel|quay lại/i.test(a.label));
    if (cancel) altFlows.push({ code: `A${altFlows.length + 1}`, name: `Nhấn "${cancel.label}"`, branchFrom: Math.min(3, steps.length), steps: [`${actor} nhấn "${cancel.label}"`, `Hệ thống hủy thao tác${cancel.navigateTo ? ` và quay về "${cancel.navigateTo}"` : ""}`] });
    const businessRules = fields.flatMap((f) => [...(f.required ? [`${f.label} là bắt buộc`] : []), ...f.constraints.map((c) => `${f.label}: ${c}`)]);
    return {
      code,
      name,
      actors: [actor],
      description: `${actor} thực hiện "${name}" trên màn hình ${s.title}.`,
      trigger: `${actor} nhấn "${actionLabel}"`,
      preconditions: [/đăng nhập|đăng ký|login|register/i.test(`${name} ${s.title} ${actionLabel} ${s.actions.find((x) => x.nodeId === actionId)?.action ?? ""}`) ? `${actor} chưa đăng nhập` : `${actor} đã đăng nhập hệ thống`],
      postconditions: [navigateTo ? `Hệ thống hiển thị màn hình "${navigateTo}"` : "Dữ liệu được lưu thành công"],
      mainFlow: steps,
      altFlows,
      exceptions,
      businessRules,
      screenIds: [s.screenId],
      assumptions: [`Quy tắc xử lý phía máy chủ cho "${actionLabel}" chưa thể hiện trên thiết kế – cần BA xác nhận`],
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
      { key: "intro", title: "1. Giới thiệu", content: `### 1.1 Mục đích\nTài liệu đặc tả yêu cầu phần mềm (SRS) cho module **${moduleName}**, được sinh tự động từ thiết kế giao diện đã duyệt và cần BA rà soát.\n\n### 1.2 Phạm vi\n${requirementInput.trim() || "Phạm vi được xác định theo các màn hình đã thiết kế."}\n\n### 1.3 Tài liệu tham chiếu\n- ISO/IEC/IEEE 29148:2018 – Requirements engineering\n- Đặc tả Use Case của module` },
      { key: "overview", title: "2. Mô tả tổng quan", content: `### 2.1 Tác nhân\n${actors.map((a) => `- ${a}`).join("\n")}\n\n### 2.2 Danh sách màn hình\n${model.screens.map((s) => `- ${s.title}`).join("\n")}\n\n### 2.3 Điều hướng\n${model.navigation.length ? model.navigation.map((n) => `- ${n.from} → ${n.to} (qua "${n.via}")`).join("\n") : "- Chưa có liên kết điều hướng"}` },
      { key: "functional", title: "3. Yêu cầu chức năng", content: `| Mã | Yêu cầu | Ưu tiên | Use Case |\n| --- | --- | --- | --- |\n${frs.map((r) => `| ${r.code} | ${r.statement} | ${r.priority} | ${r.useCaseCodes.join(", ")} |`).join("\n")}` },
      { key: "nonfunctional", title: "4. Yêu cầu phi chức năng", content: `${nfrs.map((r) => `- **${r.code}**: ${r.statement}${r.isAssumption ? " _(Giả định – cần xác nhận)_" : ""}`).join("\n") || "- Chưa xác định"}` },
      { key: "interfaces", title: "5. Giao diện người dùng", content: model.screens.map((s) => `### ${s.title}\n- Trường dữ liệu: ${s.fields.map((f) => f.label).join(", ") || "không có"}\n- Thao tác: ${s.actions.map((a) => a.label).join(", ") || "không có"}`).join("\n\n") },
      { key: "data", title: "6. Từ điển dữ liệu", content: `| Màn hình | Trường | Kiểu | Bắt buộc | Ràng buộc |\n| --- | --- | --- | --- | --- |\n${fields.map((f) => `| ${f.screen} | ${f.label} | ${f.inputType} | ${f.required ? "Có" : "Không"} | ${f.constraints.join("; ") || "-"} |`).join("\n")}` },
      { key: "assumptions", title: "7. Giả định và vấn đề mở", content: [...new Set(ucs.flatMap((u) => u.assumptions))].map((a) => `- ${a}`).join("\n") || "- Không có" },
    ],
  };
}

export function mockSequence(uc: UseCase, screenTitle: (id: string) => string): SequenceDiagram {
  const actor = uc.actors[0] ?? "Người dùng";
  const ui = uc.screenIds[0] ? screenTitle(uc.screenIds[0]) : "Giao diện";
  const lines = ["sequenceDiagram", "  autonumber", `  actor A as ${safe(actor)}`, `  participant UI as ${safe(ui)}`, "  participant API as Máy chủ API", "  participant DB as Cơ sở dữ liệu"];
  for (const s of uc.mainFlow) {
    if (s.actor === "Hệ thống") {
      if (/kiểm tra/i.test(s.text)) lines.push(`  UI->>API: Gửi yêu cầu`, `  API->>API: ${safe(s.text)}`);
      else if (/xử lý|lưu|lọc/i.test(s.text)) lines.push(`  API->>DB: Truy vấn/cập nhật dữ liệu`, `  DB-->>API: Kết quả`, `  API-->>UI: Phản hồi`, `  UI-->>A: ${safe(s.text)}`);
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
    const ucFields = model.screens.filter((s) => u.screenIds.includes(s.screenId)).flatMap((s) => s.fields);
    const sample = ucFields.map((f) => `${f.label} = ${sampleValue(f)}`).join("; ");
    tests.push({ code: code(), title: `${u.name} – luồng chính thành công`, type: "Positive", priority: "High", useCaseCode: u.code, flowRef: "main", requirementCodes: mainReq, preconditions: pre, testData: sample || "-", steps: u.mainFlow.filter((s) => s.actor !== "Hệ thống").map((s) => s.text), expected: u.postconditions.join("; ") });
    for (const a of u.altFlows) tests.push({ code: code(), title: `${u.name} – ${a.name}`, type: "Positive", priority: "Medium", useCaseCode: u.code, flowRef: a.code, requirementCodes: mainReq, preconditions: pre, testData: "-", steps: a.steps.filter((s) => !s.startsWith("Hệ thống")), expected: a.steps.filter((s) => s.startsWith("Hệ thống")).join("; ") || "Hệ thống xử lý đúng luồng thay thế" });
    for (const e of u.exceptions) {
      const rules = ucReqs.filter((r) => r.statement.includes("kiểm tra"));
      const ruleReqs = (/bắt buộc/i.test(e.name) ? rules.filter((r) => r.statement.includes("bắt buộc")) : /định dạng/i.test(e.name) ? rules.filter((r) => !r.statement.includes("bắt buộc")) : []).map((r) => r.code);
      tests.push({ code: code(), title: `${u.name} – ${e.name}`, type: "Negative", priority: "High", useCaseCode: u.code, flowRef: e.code, requirementCodes: ruleReqs.length ? ruleReqs : mainReq, preconditions: pre, testData: /bắt buộc/i.test(e.name) ? "Để trống các trường bắt buộc" : /định dạng/i.test(e.name) ? "Nhập dữ liệu sai định dạng/vượt giới hạn" : "Giả lập lỗi máy chủ", steps: [...u.mainFlow.filter((s) => s.actor !== "Hệ thống").map((s) => s.text)], expected: e.steps.join("; ") });
    }
    // Giá trị biên cho trường có minLength/maxLength
    for (const f of ucFields) {
      const field = fieldsById.get(f.nodeId) ?? f;
      const min = num(field.constraints, "minLength");
      const max = num(field.constraints, "maxLength");
      const brCode = ucReqs.find((r) => r.statement.includes(field.label) && r.statement.includes("Length"))?.code;
      const refs = brCode ? [brCode] : mainReq;
      if (min !== null) {
        tests.push({ code: code(), title: `${field.label} – độ dài ${min - 1} ký tự (dưới biên)`, type: "Boundary", priority: "Medium", useCaseCode: u.code, flowRef: u.exceptions.find((e) => /định dạng/i.test(e.name))?.code ?? "main", requirementCodes: refs, preconditions: pre, testData: `${field.label} có ${min - 1} ký tự`, steps: [`Nhập ${field.label} có ${min - 1} ký tự`, "Gửi biểu mẫu"], expected: `Hệ thống báo lỗi: ${field.label} tối thiểu ${min} ký tự` });
        tests.push({ code: code(), title: `${field.label} – độ dài ${min} ký tự (đúng biên)`, type: "Boundary", priority: "Medium", useCaseCode: u.code, flowRef: "main", requirementCodes: refs, preconditions: pre, testData: `${field.label} có ${min} ký tự`, steps: [`Nhập ${field.label} có ${min} ký tự`, "Gửi biểu mẫu"], expected: "Hệ thống chấp nhận giá trị" });
      }
      if (max !== null) {
        tests.push({ code: code(), title: `${field.label} – độ dài ${max + 1} ký tự (vượt biên)`, type: "Boundary", priority: "Medium", useCaseCode: u.code, flowRef: u.exceptions.find((e) => /định dạng/i.test(e.name))?.code ?? "main", requirementCodes: refs, preconditions: pre, testData: `${field.label} có ${max + 1} ký tự`, steps: [`Nhập ${field.label} có ${max + 1} ký tự`, "Gửi biểu mẫu"], expected: `Hệ thống chặn/báo lỗi: ${field.label} tối đa ${max} ký tự` });
      }
    }
  }
  return tests;
}

function num(constraints: string[], key: string): number | null {
  const c = constraints.find((x) => x.startsWith(`${key}=`));
  return c ? Number(c.split("=")[1]) : null;
}

function sampleValue(f: FieldSpec): string {
  if (f.inputType === "email") return "ba.test@congty.vn";
  if (f.inputType === "password") return "MatKhau@123";
  if (f.inputType === "tel") return "0912345678";
  if (f.inputType === "number") return "10";
  if (f.inputType === "date") return "15/10/2026";
  if (f.options?.length) return f.options[0];
  if (f.kind === "Checkbox") return "Đã tích";
  return `${f.label} mẫu`;
}
