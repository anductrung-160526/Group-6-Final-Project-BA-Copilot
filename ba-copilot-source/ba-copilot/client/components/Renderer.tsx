// Render component tree JSON thành giao diện (hi-fi wireframe). Mỗi phần tử mang data-node-id
// để Design Studio khoanh vùng / gắn bình luận chính xác.

import React from "react";
import type { UINode } from "../../shared/design.ts";

interface Props {
  node: UINode;
  onNavigate?: (target: string) => void;
}

const s = (v: unknown, d = "") => (v === undefined || v === null ? d : String(v));

export function Renderer({ node, onNavigate }: Props): React.ReactElement {
  const p = node.props ?? {};
  const id = node.id;
  const kids = (node.children ?? []).map((c) => <Renderer key={c.id} node={c} onNavigate={onNavigate} />);
  const common = { "data-node-id": id, "data-node-type": node.type } as Record<string, string>;
  const nav = (target: unknown) => (e: React.MouseEvent) => {
    if (onNavigate && target) {
      e.preventDefault();
      onNavigate(String(target));
    }
  };
  const req = p.required ? <span className="ds-req">*</span> : null;

  switch (node.type) {
    case "Page":
      return (
        <div {...common} className="ds-page">
          {kids}
        </div>
      );
    case "Header":
      return (
        <header {...common} className="ds-header">
          {p.title ? <div className="ds-header-title">{s(p.title)}</div> : null}
          {kids.length ? <div className="ds-header-kids">{kids}</div> : null}
        </header>
      );
    case "Sidebar":
      return (
        <aside {...common} className="ds-sidebar">
          {kids}
        </aside>
      );
    case "Section":
      return (
        <section {...common} className="ds-section">
          {p.title ? <h3 className="ds-section-title">{s(p.title)}</h3> : null}
          {kids}
        </section>
      );
    case "Card":
      return (
        <div {...common} className="ds-card">
          {p.title ? <div className="ds-card-title">{s(p.title)}</div> : null}
          {kids}
        </div>
      );
    case "Row":
      return (
        <div {...common} className={`ds-row ds-align-${s(p.align, "start")}`} style={{ gap: Number(p.gap ?? 12) }}>
          {kids}
        </div>
      );
    case "Column":
      return (
        <div {...common} className={`ds-col ds-w-${s(p.width, "auto").replace("/", "-")}`} style={{ gap: Number(p.gap ?? 12) }}>
          {kids}
        </div>
      );
    case "Form":
      return (
        <form {...common} className="ds-form" onSubmit={(e) => e.preventDefault()}>
          {p.title ? <div className="ds-form-title">{s(p.title)}</div> : null}
          {kids}
        </form>
      );
    case "List":
      return (
        <div {...common} className="ds-list">
          {p.title ? <div className="ds-card-title">{s(p.title)}</div> : null}
          {kids}
        </div>
      );
    case "Modal":
      return (
        <div {...common} className="ds-modal">
          <div className="ds-modal-head">{s(p.title, "Hộp thoại")}</div>
          {kids}
        </div>
      );
    case "Heading": {
      const lvl = Math.min(3, Math.max(1, Number(p.level ?? 2)));
      return React.createElement(`h${lvl}`, { ...common, className: `ds-h ds-h${lvl}` }, s(p.text));
    }
    case "Text":
      return (
        <p {...common} className={`ds-text ${p.tone === "muted" ? "ds-muted" : ""}`}>
          {s(p.text)}
        </p>
      );
    case "Button":
      return (
        <span {...common} role="button" className={`ds-btn ds-btn-${s(p.variant, "primary")}`} onClick={nav(p.navigateTo)} title={p.navigateTo ? `→ ${s(p.navigateTo)}` : undefined}>
          {s(p.label, "Nút")}
        </span>
      );
    case "Link":
      return (
        <a {...common} href="#" className="ds-link" onClick={nav(p.navigateTo)}>
          {s(p.text)}
        </a>
      );
    case "Input":
    case "DatePicker":
      return (
        <div {...common} className="ds-field">
          <div className="ds-label">
            {s(p.label)}
            {req}
          </div>
          <div className="ds-input">
            <span className="ds-ph">{node.type === "DatePicker" ? "dd/mm/yyyy" : p.inputType === "password" ? "••••••••" : s(p.placeholder)}</span>
            {node.type === "DatePicker" && <span className="ds-ico">▦</span>}
          </div>
        </div>
      );
    case "Textarea":
      return (
        <div {...common} className="ds-field">
          <div className="ds-label">
            {s(p.label)}
            {req}
          </div>
          <div className="ds-input ds-textarea">
            <span className="ds-ph">{s(p.placeholder)}</span>
          </div>
        </div>
      );
    case "Select":
      return (
        <div {...common} className="ds-field">
          <div className="ds-label">
            {s(p.label)}
            {req}
          </div>
          <div className="ds-input">
            <span>{Array.isArray(p.options) && p.options.length ? String(p.options[0]) : ""}</span>
            <span className="ds-ico">▾</span>
          </div>
        </div>
      );
    case "Checkbox":
      return (
        <div {...common} className="ds-check">
          <span className="ds-box" />
          {s(p.label)}
        </div>
      );
    case "Radio":
      return (
        <div {...common} className="ds-field">
          <div className="ds-label">
            {s(p.label)}
            {req}
          </div>
          <div className="ds-radios">
            {(Array.isArray(p.options) ? p.options : []).map((o, i) => (
              <span key={i} className="ds-check">
                <span className={`ds-radio ${i === 0 ? "on" : ""}`} />
                {String(o)}
              </span>
            ))}
          </div>
        </div>
      );
    case "Table": {
      const cols = Array.isArray(p.columns) ? (p.columns as unknown[]).map(String) : [];
      const rows = Array.isArray(p.rows) ? (p.rows as unknown[][]) : [];
      const acts = Array.isArray(p.rowActions) ? (p.rowActions as unknown[]).map(String) : [];
      return (
        <div {...common} className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
                {acts.length ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {(rows.length ? rows : [cols.map(() => "—")]).map((r, i) => (
                <tr key={i}>
                  {cols.map((_, j) => (
                    <td key={j}>{String((r as unknown[])?.[j] ?? "")}</td>
                  ))}
                  {acts.length ? (
                    <td className="ds-row-acts">
                      {acts.map((a) => (
                        <span key={a} className="ds-link">
                          {a}
                        </span>
                      ))}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "Image":
      return (
        <div {...common} className="ds-image" style={{ height: Number(p.height ?? 140) }}>
          <span>{s(p.alt, "Ảnh")}</span>
        </div>
      );
    case "Badge":
      return (
        <span {...common} className={`ds-badge ds-tone-${s(p.tone, "info")}`}>
          {s(p.text)}
        </span>
      );
    case "Alert":
      return (
        <div {...common} className={`ds-alert ds-tone-${s(p.tone, "info")}`}>
          {s(p.text)}
        </div>
      );
    case "Stat":
      return (
        <div {...common} className="ds-stat">
          <div className="ds-stat-label">{s(p.label)}</div>
          <div className="ds-stat-value">{s(p.value)}</div>
        </div>
      );
    case "Avatar":
      return (
        <span {...common} className="ds-avatar" title={s(p.name)}>
          {s(p.name, "?").trim().split(/\s+/).slice(-1)[0]?.[0]?.toUpperCase() ?? "?"}
        </span>
      );
    case "Divider":
      return <hr {...common} className="ds-divider" />;
    case "Pagination": {
      const n = Math.min(7, Math.max(1, Number(p.pages ?? 3)));
      return (
        <div {...common} className="ds-pagination">
          <span>‹</span>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={i === 0 ? "on" : ""}>
              {i + 1}
            </span>
          ))}
          <span>›</span>
        </div>
      );
    }
    default:
      return (
        <div {...common} className="ds-unknown">
          {node.type}
          {kids}
        </div>
      );
  }
}
