import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Bộ component dùng chung của BA Copilot. Quy tắc dùng: docs/design-system.md. Xem trực quan: #/_gallery.

// ---------------------------------------------------------------- Toast + busy overlay
export type ToastKind = "ok" | "err" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}
interface UICtx {
  toast: (text: string, kind?: Toast["kind"]) => void;
  /** Chạy tác vụ async: hiện lớp "AI đang xử lý", bắt lỗi thành toast. */
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>;
}
const Ctx = createContext<UICtx>({ toast: () => {}, run: async () => undefined });
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 7000 : 3500);
  }, []);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>) => {
      setBusy(label);
      try {
        return await fn();
      } catch (e) {
        toast((e as Error).message, "err");
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return (
    <Ctx.Provider value={{ toast, run }}>
      {children}
      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <div className="busy-card">
            <div className="spinner" />
            <div>
              <strong>{busy}</strong>
              <div className="muted small">{elapsed}s · AI có thể mất 10–60 giây</div>
            </div>
          </div>
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <ToastItem key={t.id} kind={t.kind}>
            {t.text}
          </ToastItem>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Một thông báo nổi. Trong màn hình hãy gọi `useUI().toast(...)`; component này chỉ để hiển thị. */
export function ToastItem({ kind = "info", children }: { kind?: ToastKind; children: React.ReactNode }) {
  return (
    <div className={`toast toast-${kind}`} role="alert">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Small components
export function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const { kind = "secondary", size = "md", className = "", ...rest } = props;
  return <button {...rest} className={`btn btn-${kind} btn-${size} ${className}`} />;
}

const STATUS: Record<string, [string, string]> = {
  none: ["Chưa có", "gray"],
  draft: ["Bản nháp", "blue"],
  approved: ["Đã duyệt", "green"],
  outdated: ["Lỗi thời", "amber"],
  open: ["Mở", "blue"],
  sent: ["Đã gửi AI", "violet"],
  resolved: ["Đã xử lý", "green"],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status, "gray"];
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export type BadgeTone = "gray" | "blue" | "mint" | "green" | "amber" | "orange" | "red" | "violet" | "flag";
/** Nhãn trạng thái – luôn ôm sát chữ. Giữ kiểu string để không vỡ chỗ gọi cũ; mã mới dùng BadgeTone. */
export function Badge({ tone = "gray", children }: { tone?: BadgeTone | (string & {}); children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- Component bổ sung (A1)

/** Ngăn trượt từ phải. Dùng cho mọi panel xem/sửa chi tiết (SCR-04, SCR-07). Esc hoặc bấm nền để đóng. */
export function Drawer({
  title,
  onClose,
  children,
  footer,
  actions,
  size = "md",
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Nút phụ cạnh tiêu đề (ví dụ "Tải về"). */
  actions?: React.ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`drawer ${size === "lg" ? "drawer-lg" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="drawer-head">
          <h3>{title}</h3>
          {actions}
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}

export interface TabItem<K extends string = string> {
  key: K;
  label: React.ReactNode;
  /** Badge hoặc ghi chú nhỏ sau nhãn. */
  extra?: React.ReactNode;
  /** Có href thì tab là liên kết (điều hướng bằng #/...), không thì là nút gọi onChange. */
  href?: string;
  testId?: string;
}
/** Thanh tab ngang. Tab đang chọn: chữ mint-700, gạch chân mint-500. */
export function Tabs<K extends string>({ items, active, onChange, className = "" }: { items: TabItem<K>[]; active: K; onChange?: (key: K) => void; className?: string }) {
  return (
    <nav className={`tabs ${className}`} role="tablist">
      {items.map((t) => {
        const cls = `tab ${t.key === active ? "active" : ""}`;
        return t.href ? (
          <a key={t.key} href={t.href} role="tab" aria-selected={t.key === active} className={cls} data-testid={t.testId}>
            {t.label}
            {t.extra}
          </a>
        ) : (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === active} className={cls} onClick={() => onChange?.(t.key)} data-testid={t.testId}>
            {t.label}
            {t.extra}
          </button>
        );
      })}
    </nav>
  );
}

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}
/** Ô chọn một giá trị. `placeholder` hiện thành lựa chọn rỗng (value = ""). */
export function Select<V extends string>({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  id,
  testId,
}: {
  value: V | "";
  options: SelectOption<V>[];
  onChange: (value: V | "") => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  testId?: string;
}) {
  return (
    <select id={id} className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as V | "")} data-testid={testId}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** Ảnh đại diện bằng chữ cái đầu. */
export function Avatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" }) {
  return (
    <span className={`avatar ${size === "sm" ? "avatar-sm" : ""} ${name ? "" : "avatar-empty"}`} title={name ?? "Chưa giao"} aria-hidden="true">
      {name ? initials(name) : "?"}
    </span>
  );
}

export interface MemberOption {
  id: string;
  name: string;
  role?: string;
}
/** Chọn thành viên (chỉ phần khung). Danh sách `members` do màn gọi truyền vào – A3 nối dữ liệu thật. */
export function MemberPicker({
  members,
  value,
  onChange,
  placeholder = "Chưa giao",
  disabled,
  testId,
}: {
  members: MemberOption[];
  value: string | null;
  onChange: (memberId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
}) {
  const current = members.find((m) => m.id === value);
  return (
    <div className="member-picker">
      <Avatar name={current?.name} />
      <Select
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        testId={testId}
        options={members.map((m) => ({ value: m.id, label: m.role ? `${m.name} · ${m.role}` : m.name }))}
        onChange={(v) => onChange(v || null)}
      />
    </div>
  );
}

/** Vùng kéo thả hoặc bấm để chọn tệp. */
export function FileDrop({
  onFiles,
  accept,
  multiple = true,
  disabled,
  title = "Kéo thả tệp vào đây",
  hint = "hoặc bấm để chọn tệp từ máy",
  testId,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  title?: React.ReactNode;
  hint?: React.ReactNode;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!disabled && files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  const pick = () => !disabled && input.current?.click();
  return (
    <div
      className={`filedrop ${over ? "over" : ""} ${disabled ? "disabled" : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      data-testid={testId}
      onClick={pick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <span className="filedrop-icon" aria-hidden="true">
        ⇪
      </span>
      <span className="filedrop-title">{title}</span>
      <span className="muted small">{hint}</span>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const KANBAN_MIME = "application/x-ba-card";

/** Cột Kanban (chỉ trình bày). Nhận thẻ kéo vào bằng HTML5 DnD và báo lên qua `onDropCard`. */
export function KanbanColumn({
  id,
  title,
  count,
  onDropCard,
  footer,
  children,
}: {
  id: string;
  title: React.ReactNode;
  count?: number;
  onDropCard?: (cardId: string, columnId: string) => void;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <section
      className={`kanban-col ${over ? "over" : ""}`}
      data-column={id}
      onDragOver={(e) => {
        if (!onDropCard || !e.dataTransfer.types.includes(KANBAN_MIME)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const cardId = e.dataTransfer.getData(KANBAN_MIME);
        if (cardId && onDropCard) {
          e.preventDefault();
          onDropCard(cardId, id);
        }
      }}
    >
      <header className="kanban-col-head">
        <span>{title}</span>
        {count !== undefined && <Badge tone="gray">{count}</Badge>}
      </header>
      <div className="kanban-col-body">{children}</div>
      {footer && <div className="kanban-col-foot">{footer}</div>}
    </section>
  );
}

/** Thẻ Kanban (chỉ trình bày), kéo được sang cột khác. */
export function KanbanCard({
  id,
  title,
  meta,
  onClick,
  draggable = true,
}: {
  id: string;
  title: React.ReactNode;
  /** Dòng phụ: badge, người làm, hạn… */
  meta?: React.ReactNode;
  onClick?: () => void;
  draggable?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <article
      className={`kanban-card ${dragging ? "dragging" : ""}`}
      data-card={id}
      draggable={draggable}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      onDragStart={(e) => {
        e.dataTransfer.setData(KANBAN_MIME, id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <div className="kanban-card-title">{title}</div>
      {meta && <div className="kanban-card-meta">{meta}</div>}
    </article>
  );
}

export type ScoreLevel = "good" | "fair" | "poor";
/** Ngưỡng giống shared/qus.ts (FN-52): Tốt ≥ 80, Khá 60–79, Cần sửa < 60. */
export const scoreLevel = (score: number): ScoreLevel => (score >= 80 ? "good" : score >= 60 ? "fair" : "poor");
const SCORE_LABEL: Record<ScoreLevel, string> = { good: "Tốt", fair: "Khá", poor: "Cần sửa" };

/** Điểm chất lượng 0–100 với 3 ngưỡng màu. */
export function ScoreBadge({ score, showLabel = true, testId }: { score: number; showLabel?: boolean; testId?: string }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const level = scoreLevel(s);
  return (
    <span className={`score-badge score-${level}`} data-testid={testId} title={`${s}/100 – ${SCORE_LABEL[level]}`}>
      <strong>{s}/100</strong>{showLabel && <span>{SCORE_LABEL[level]}</span>}
    </span>
  );
}

export type IssueSeverity = "error" | "warn" | "info";
export interface IssueItem {
  severity: IssueSeverity;
  /** Mã lỗi, ví dụ WELL_FORMED. */
  code?: string;
  message: React.ReactNode;
  suggestion?: React.ReactNode;
}
const SEVERITY: Record<IssueSeverity, [string, BadgeTone]> = { error: ["Lỗi", "red"], warn: ["Cảnh báo", "amber"], info: ["Gợi ý", "blue"] };

/** Danh sách lỗi theo mức error / warn / info, lỗi nặng xếp trước. */
export function IssueList({ issues, empty = "Không có vấn đề nào." }: { issues: IssueItem[]; empty?: React.ReactNode }) {
  if (!issues.length) return <div className="muted small">{empty}</div>;
  const order: IssueSeverity[] = ["error", "warn", "info"];
  const sorted = [...issues].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return (
    <div className="issue-list">
      {sorted.map((i, idx) => (
        <div key={idx} className={`issue issue-${i.severity}`} data-testid="issue">
          <div className="issue-msg">
            <Badge tone={SEVERITY[i.severity][1]}>{i.code ?? SEVERITY[i.severity][0]}</Badge>
            <span>{i.message}</span>
          </div>
          {i.suggestion && <div className="issue-sugg">→ Gợi ý: {i.suggestion}</div>}
        </div>
      ))}
    </div>
  );
}

/** Thẻ gợi ý: tiêu đề, lý do và 2 nút (SCR-16). */
export function SuggestionCard({
  title,
  reason,
  onAccept,
  onDismiss,
  acceptLabel = "Tạo",
  dismissLabel = "Bỏ qua",
  disabled,
}: {
  title: React.ReactNode;
  reason: React.ReactNode;
  onAccept: () => void;
  onDismiss: () => void;
  acceptLabel?: string;
  dismissLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="suggestion-card" data-testid="suggestion-card">
      <div className="suggestion-title">{title}</div>
      <div className="suggestion-reason">{reason}</div>
      <div className="suggestion-actions">
        <Btn size="sm" kind="primary" onClick={onAccept} disabled={disabled}>
          {acceptLabel}
        </Btn>
        <Btn size="sm" kind="ghost" onClick={onDismiss} disabled={disabled}>
          {dismissLabel}
        </Btn>
      </div>
    </div>
  );
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
