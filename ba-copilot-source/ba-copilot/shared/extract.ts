// Bước (a) của Doc Generator: trích "mô hình trung gian" có cấu trúc từ component tree.
// Phần này chạy tất định (rule-based) nên tài liệu sinh ra luôn bám vào thiết kế thật.

import { UINode, walk } from "./design.ts";

export interface FieldSpec {
  nodeId: string;
  label: string;
  name: string;
  kind: string; // Input/Select/...
  inputType: string;
  required: boolean;
  constraints: string[]; // "minLength=8", "maxLength=50", "pattern=..."
  options?: string[];
}

export interface ActionSpec {
  nodeId: string;
  label: string;
  action: string;
  navigateTo: string;
  variant: string;
  formId: string | null; // nằm trong Form nào
}

export interface DisplaySpec {
  nodeId: string;
  kind: string; // Table/Stat/List
  title: string;
  columns: string[];
  rowActions: string[];
}

export interface ScreenModel {
  screenId: string;
  screenName: string;
  title: string;
  headings: string[];
  fields: FieldSpec[];
  actions: ActionSpec[];
  displays: DisplaySpec[];
  links: { nodeId: string; text: string; navigateTo: string }[];
  forms: { nodeId: string; title: string; fieldIds: string[]; actionIds: string[] }[];
}

export interface DesignModel {
  screens: ScreenModel[];
  navigation: { from: string; to: string; via: string }[];
}

const FIELD_TYPES = ["Input", "Textarea", "Select", "Checkbox", "Radio", "DatePicker"];

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d") // vi-keep: bỏ dấu tiếng Việt khi tạo slug (dữ liệu cũ)
    .replace(/Đ/g, "D") // vi-keep: bỏ dấu tiếng Việt khi tạo slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function extractScreen(screenId: string, screenName: string, tree: UINode): ScreenModel {
  const m: ScreenModel = {
    screenId,
    screenName,
    title: String(tree.props.title ?? screenName),
    headings: [],
    fields: [],
    actions: [],
    displays: [],
    links: [],
    forms: [],
  };
  const formOf = new Map<string, string>();
  walk(tree, (n, parent) => {
    const parentForm = parent ? formOf.get(parent.id) : undefined;
    if (n.type === "Form") formOf.set(n.id, n.id);
    else if (parentForm) formOf.set(n.id, parentForm);
  });
  walk(tree, (n) => {
    const p = n.props ?? {};
    if (n.type === "Heading") m.headings.push(String(p.text ?? ""));
    if (FIELD_TYPES.includes(n.type)) {
      const constraints: string[] = [];
      for (const k of ["minLength", "maxLength", "min", "max", "pattern"]) if (p[k] !== undefined && p[k] !== "") constraints.push(`${k}=${p[k]}`);
      const inputType = String(p.inputType ?? (n.type === "DatePicker" ? "date" : n.type === "Input" ? "text" : n.type.toLowerCase()));
      if (inputType === "email") constraints.push("email format");
      if (inputType === "number") constraints.push("numbers only");
      m.fields.push({
        nodeId: n.id,
        label: String(p.label ?? ""),
        name: String(p.name ?? slug(String(p.label ?? n.id))),
        kind: n.type,
        inputType,
        required: Boolean(p.required),
        constraints,
        options: Array.isArray(p.options) ? (p.options as string[]) : undefined,
      });
    }
    if (n.type === "Button") {
      m.actions.push({
        nodeId: n.id,
        label: String(p.label ?? ""),
        action: String(p.action ?? ""),
        navigateTo: String(p.navigateTo ?? ""),
        variant: String(p.variant ?? "primary"),
        formId: formOf.get(n.id) ?? null,
      });
    }
    if (n.type === "Link") m.links.push({ nodeId: n.id, text: String(p.text ?? ""), navigateTo: String(p.navigateTo ?? "") });
    if (n.type === "Table") {
      m.displays.push({
        nodeId: n.id,
        kind: "Table",
        title: "",
        columns: Array.isArray(p.columns) ? (p.columns as string[]) : [],
        rowActions: Array.isArray(p.rowActions) ? (p.rowActions as string[]) : [],
      });
    }
    if (n.type === "Stat") m.displays.push({ nodeId: n.id, kind: "Stat", title: String(p.label ?? ""), columns: [], rowActions: [] });
    if (n.type === "Form") {
      const fieldIds: string[] = [];
      const actionIds: string[] = [];
      walk(n, (d) => {
        if (FIELD_TYPES.includes(d.type)) fieldIds.push(d.id);
        if (d.type === "Button") actionIds.push(d.id);
      });
      m.forms.push({ nodeId: n.id, title: String(p.title ?? ""), fieldIds, actionIds });
    }
  });
  // Tiêu đề bảng = Heading/Section gần nhất (đơn giản: tiêu đề màn hình)
  for (const d of m.displays) if (!d.title) d.title = m.headings[0] ?? m.title;
  return m;
}

export function extractModel(screens: { id: string; name: string; tree: UINode }[]): DesignModel {
  const models = screens.map((s) => extractScreen(s.id, s.name, s.tree));
  const navigation: DesignModel["navigation"] = [];
  const byName = new Map<string, string>();
  for (const s of screens) {
    byName.set(slug(s.name), s.name);
    byName.set(slug(String(s.tree.props.title ?? s.name)), s.name);
  }
  for (const sm of models) {
    for (const a of sm.actions) if (a.navigateTo) navigation.push({ from: sm.screenName, to: byName.get(slug(a.navigateTo)) ?? a.navigateTo, via: a.label });
    for (const l of sm.links) if (l.navigateTo) navigation.push({ from: sm.screenName, to: byName.get(slug(l.navigateTo)) ?? l.navigateTo, via: l.text });
  }
  return { screens: models, navigation };
}

export { slug };
