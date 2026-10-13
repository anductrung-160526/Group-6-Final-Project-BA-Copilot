import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

// ---------------------------------------------------------------- Toast + busy overlay
interface Toast {
  id: number;
  kind: "ok" | "err" | "info";
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
          <div key={t.id} className={`toast toast-${t.kind}`} role="alert">
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
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

export function Badge({ tone = "gray", children }: { tone?: string; children: React.ReactNode }) {
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

export const fmtTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
