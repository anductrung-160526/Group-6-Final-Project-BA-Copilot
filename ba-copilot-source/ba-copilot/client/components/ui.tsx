import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
// Chỉ import đích danh từng icon (esbuild bỏ phần còn lại khi đóng gói). Thêm icon mới: thêm vào đây + ICONS bên dưới.
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BookText,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Crosshair,
  Download,
  Ellipsis,
  ExternalLink,
  FileText,
  FlaskConical,
  Folder,
  FolderOpen,
  GitBranch,
  History,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  ScrollText,
  Settings,
  Sparkles,
  SquareKanban,
  Trash2,
  Upload,
  User,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

// Bộ component dùng chung của BA Copilot. Quy tắc dùng: docs/design-system.md. Xem trực quan: #/_gallery.

// ---------------------------------------------------------------- Icon (Lucide)
/** Bảng tên dùng chung → icon Lucide. Màn hình chỉ gọi theo tên ở đây, không import lucide-react trực tiếp. */
const ICONS = {
  edit: Pencil,
  delete: Trash2,
  folder: Folder,
  ai: Sparkles,
  check: Check,
  approve: BadgeCheck,
  revision: RotateCcw,
  done: CircleCheck,
  reload: RefreshCw,
  regenerate: RefreshCw, // Sinh lại bằng AI (tạo lần đầu vẫn dùng `ai`)
  arrowRight: ArrowRight,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  more: Ellipsis,
  up: ArrowUp,
  down: ArrowDown,
  external: ExternalLink,
  play: Play,
  grid: LayoutGrid,
  upload: Upload,
  target: Crosshair,
  github: GitBranch, // Lucide 1.x đã bỏ icon thương hiệu (Github) → dùng GitBranch
  plus: Plus,
  close: X,
  user: User,
  logout: LogOut,
  settings: Settings,
  history: History,
  lock: Lock,
  download: Download,
  menu: Menu,
  navCollapse: PanelLeftClose, // thu gọn menu trái
  navExpand: PanelLeftOpen, // mở rộng menu trái
  calendar: Calendar,
  // Loại sản phẩm BA (R-080) – dùng chung cho task, thẻ liên quan
  screen: LayoutTemplate,
  doc: FileText,
  diagram: Network,
  tests: FlaskConical,
  // Menu trái của dự án (R-040) – khoá = tên Lucide viết thường chữ đầu, ProjectShell tự tra theo projectMenu.ts
  squareKanban: SquareKanban,
  bookText: BookText,
  workflow: Workflow,
  folderOpen: FolderOpen,
  scrollText: ScrollText,
  fileText: FileText,
  network: Network,
  layoutTemplate: LayoutTemplate,
  flaskConical: FlaskConical,
  route: Route,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
const ICON_SIZE = { xs: 12, sm: 14, md: 16, lg: 20 } as const;
export type IconSize = keyof typeof ICON_SIZE;

/**
 * Icon Lucide theo tên dùng chung. Màu kế thừa `currentColor` (đặt màu ở phần tử cha).
 * `label` chỉ truyền khi icon đứng một mình mang nghĩa; icon đi kèm chữ thì bỏ trống (ẩn với trình đọc màn hình).
 */
export function Icon({ name, size = "md", label, className = "" }: { name: IconName; size?: IconSize | number; label?: string; className?: string }) {
  const C = ICONS[name];
  const px = typeof size === "number" ? size : ICON_SIZE[size];
  return <C size={px} strokeWidth={2} className={`icon ${className}`} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} focusable="false" />;
}

/** Nút chỉ có icon (vuông, nền trong suốt). Bắt buộc có `label` → dùng làm `title` (tooltip) và `aria-label`. */
export function IconBtn({
  icon,
  label,
  tone = "default",
  size = "md",
  className = "",
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { icon: IconName; label: string; tone?: "default" | "danger"; size?: IconSize }) {
  return (
    <button type="button" {...rest} title={rest.title ?? label} aria-label={label} className={`icon-action ${tone === "danger" ? "icon-action-danger" : ""} ${className}`}>
      <Icon name={icon} size={size} />
    </button>
  );
}

// ---------------------------------------------------------------- Toast + busy overlay
export type ToastKind = "ok" | "err" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: React.ReactNode;
}
/** Hộp xác nhận: tiêu đề là câu hỏi, `message` giải thích hậu quả; `danger` cho thao tác xoá. */
export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  okLabel?: string;
  danger?: boolean;
}
interface UICtx {
  toast: (text: React.ReactNode, kind?: Toast["kind"]) => void;
  /** Chạy tác vụ async: hiện lớp "AI đang xử lý", bắt lỗi thành toast. */
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>;
  /** Hỏi xác nhận bằng `Modal` (thay `window.confirm`); trả `true` khi người dùng đồng ý. */
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}
const Ctx = createContext<UICtx>({ toast: () => {}, run: async () => undefined, confirm: async () => false });
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), []);
  const answer = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };
  const toast = useCallback((text: React.ReactNode, kind: Toast["kind"] = "info") => {
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
    <Ctx.Provider value={{ toast, run, confirm }}>
      {children}
      {ask && (
        <Modal
          title={ask.title}
          onClose={() => answer(false)}
          footer={
            <>
              <Btn kind="ghost" onClick={() => answer(false)} data-testid="confirm-cancel">
                Cancel
              </Btn>
              <Btn kind={ask.danger ? "danger" : "primary"} onClick={() => answer(true)} autoFocus data-testid="confirm-ok">
                {ask.okLabel ?? "OK"}
              </Btn>
            </>
          }
        >
          {ask.message ? <div className="muted">{ask.message}</div> : null}
        </Modal>
      )}
      {busy && (
        <div className="busy" role="status" aria-live="polite">
          <div className="busy-card">
            <div className="spinner" />
            <div>
              <strong>{busy}</strong>
              <div className="muted small">{elapsed}s · AI may take 10–60 seconds</div>
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

/**
 * Nội dung toast sau khi BA Lead Duyệt: thông báo GitHub của server ("Chưa cấu hình GitHub – chưa đẩy" / đã đẩy)
 * + liên kết commit nếu có. Dùng: `toast(<GitOutcome git={r.git} />, r.git.pushed ? "ok" : "info")`.
 */
export function GitOutcome({ git }: { git: { message: string; commitUrl?: string } }) {
  return (
    <span data-testid="git-outcome">
      {git.message}
      {git.commitUrl && (
        <>
          {" "}
          <a className="link" href={git.commitUrl} target="_blank" rel="noopener noreferrer" data-testid="git-outcome-link">
            Xem commit <Icon name="external" size="xs" />
          </a>
        </>
      )}
    </span>
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

const STATUS: Record<string, [string, BadgeTone]> = {
  // Sản phẩm BA (ArtifactStatus)
  none: ["Not started", "gray"],
  draft: ["Draft", "blue"],
  done: ["Done", "orange"], // chờ BA Lead duyệt – dùng chung cho task "done"
  approved: ["Approved", "green"],
  outdated: ["Outdated", "amber"],
  // Công việc (TaskStatus)
  todo: ["To do", "gray"],
  doing: ["In progress", "blue"],
  // Bình luận
  open: ["Open", "blue"],
  sent: ["Sent to AI", "violet"],
  resolved: ["Resolved", "green"],
};
/** Nhãn trạng thái tiếng Việt cho sản phẩm BA, công việc và bình luận. Trạng thái lạ → hiện nguyên mã, màu xám. */
export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  const [label, tone] = STATUS[status] ?? [status, "gray"];
  return (
    <span className={`badge badge-${tone}`} data-testid={testId} data-status={status}>
      {label}
    </span>
  );
}

/** Tag "Yêu cầu sửa" – hiện khi BA Lead trả task về (cờ `revisionRequested`), giữ tới khi Duyệt. */
/** `compact`: chỉ hiện icon (tooltip + aria-label "Changes requested") – dùng trong hàng tab chật. */
export function RevisionTag({ testId = "revision-tag", compact }: { testId?: string; compact?: boolean }) {
  return (
    <span className="badge badge-red" data-testid={testId} title={compact ? "Changes requested" : undefined} aria-label={compact ? "Changes requested" : undefined}>
      <Icon name="revision" size="xs" />
      {!compact && "Changes requested"}
    </span>
  );
}

/** "Đang được sửa bởi …" – người khác đang mở cùng màn/tài liệu. Danh sách rỗng thì không hiện gì. */
export function EditingBadge({ names, max = 2, testId = "editing-badge" }: { names: string[]; max?: number; testId?: string }) {
  const list = [...new Set(names.filter(Boolean))];
  if (!list.length) return null;
  const rest = list.length - max;
  return (
    <span className="badge badge-violet" title={list.join(", ")} data-testid={testId}>
      <Icon name="edit" size="xs" />
      Being edited by {list.slice(0, max).join(", ")}
      {rest > 0 ? ` and ${rest} ${rest === 1 ? "other" : "others"}` : ""}
    </span>
  );
}

/** Báo lưu bị chặn vì bản đã đổi (HTTP 409). Đặt ngay trên vùng đang sửa; nút "Tải lại" lấy bản mới. */
export function ConflictNotice({
  onReload,
  message = "This version has changed – someone just edited it. Reload to see the latest version.",
  busy,
  testId = "conflict-notice",
}: {
  onReload: () => void;
  message?: React.ReactNode;
  busy?: boolean;
  testId?: string;
}) {
  return (
    <div className="notice notice-warn" role="alert" data-testid={testId}>
      <span className="notice-text">{message}</span>
      <Btn size="sm" onClick={onReload} disabled={busy} data-testid={`${testId}-reload`}>
        <Icon name="reload" size="sm" />
        Reload
      </Btn>
    </div>
  );
}

// ---------------------------------------------------------------- Sửa / Xoá
export interface DeleteConfirm {
  title: string;
  message?: React.ReactNode;
  okLabel?: string;
}
/**
 * Cặp hành động Sửa / Xoá cho một dòng hoặc một mục.
 * - `variant="icons"` (mặc định): icon bút chì + thùng rác ở **cột cuối bảng / cuối dòng danh sách**.
 * - `variant="buttons"`: nút chữ "Sửa" + nút danger "Xoá" – dùng trong **ngăn phải (Drawer)**, hộp thoại.
 * Xoá luôn hỏi xác nhận (`useUI().confirm`, kiểu danger) rồi mới gọi `onDelete`. Cú bấm không lan lên dòng cha.
 */
export function RowActions({
  onEdit,
  onDelete,
  deleteConfirm,
  editLabel = "Edit",
  deleteLabel = "Delete",
  variant = "icons",
  disabled,
  testId,
  testIds,
}: {
  onEdit?: () => void;
  onDelete?: () => void | Promise<unknown>;
  deleteConfirm?: DeleteConfirm;
  editLabel?: string;
  deleteLabel?: string;
  variant?: "icons" | "buttons";
  disabled?: boolean;
  testId?: string;
  /** Đặt riêng testId từng nút (giữ testId cũ của màn khi chuyển sang RowActions). */
  testIds?: { edit?: string; delete?: string };
}) {
  const { confirm } = useUI();
  const tid = (s: "edit" | "delete") => testIds?.[s] ?? (testId ? `${testId}-${s}` : `row-${s}`);
  const edit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };
  const del = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    const c = deleteConfirm ?? { title: `${deleteLabel} this item?` };
    if (await confirm({ title: c.title, message: c.message, okLabel: c.okLabel ?? deleteLabel, danger: true })) await onDelete();
  };
  if (variant === "buttons")
    return (
      <span className="row-actions row-actions-buttons" data-testid={testId}>
        {onEdit && (
          <Btn onClick={edit} disabled={disabled} data-testid={tid("edit")}>
            {editLabel}
          </Btn>
        )}
        {onDelete && (
          <Btn kind="danger" onClick={del} disabled={disabled} data-testid={tid("delete")}>
            {deleteLabel}
          </Btn>
        )}
      </span>
    );
  return (
    <span className="row-actions" data-testid={testId} onClick={(e) => e.stopPropagation()}>
      {onEdit && <IconBtn icon="edit" label={editLabel} onClick={edit} disabled={disabled} data-testid={tid("edit")} />}
      {onDelete && <IconBtn icon="delete" label={deleteLabel} tone="danger" onClick={del} disabled={disabled} data-testid={tid("delete")} />}
    </span>
  );
}

// ---------------------------------------------------------------- Thanh duyệt (Xong / Duyệt / Yêu cầu sửa)
/** Trạng thái sản phẩm BA (ArtifactStatus) + trạng thái task không gắn sản phẩm (`todo` / `doing`, R-080). */
export type ApprovalStatus = "none" | "draft" | "done" | "approved" | "outdated" | "todo" | "doing";
/**
 * Thanh trạng thái + nút luồng duyệt, đặt ở đầu **mọi màn sản phẩm** và trong ngăn chi tiết task. Chỉ hiển thị, không gọi API.
 * - "Bắt đầu làm" (task): khi `todo` và có `onStart`.
 * - "Xong" (mọi BA): khi `draft` / `outdated` / `doing` và có `onDone`.
 * - "Yêu cầu sửa" + "Duyệt": chỉ khi `isLead` và `status = "done"` (nút nào có handler mới hiện).
 *   `reopenApproved` cho BA Lead "Yêu cầu sửa" cả khi đã duyệt (task không gắn sản phẩm).
 * `disabledReason` khoá mọi nút và hiện lý do (vd "Bước Tài liệu chưa Xong"). `busy` khoá nút khi đang gửi.
 */
export function ApprovalBar({
  status,
  revisionRequested,
  isLead,
  onStart,
  onDone,
  onApprove,
  onRequestChange,
  reopenApproved,
  busy,
  disabledReason,
  testId = "approval-bar",
}: {
  status: ApprovalStatus;
  revisionRequested?: boolean;
  isLead: boolean;
  onStart?: () => void;
  onDone?: () => void;
  onApprove?: () => void;
  onRequestChange?: () => void;
  reopenApproved?: boolean;
  busy?: boolean;
  disabledReason?: string;
  testId?: string;
}) {
  const off = !!busy || !!disabledReason;
  const canStart = status === "todo" && !!onStart;
  const canDone = (status === "draft" || status === "outdated" || status === "doing") && !!onDone;
  const canApprove = isLead && status === "done" && !!onApprove;
  const canRequest = isLead && (status === "done" || (!!reopenApproved && status === "approved")) && !!onRequestChange;
  const canReview = canApprove || canRequest;
  return (
    <div className="approval-bar" data-testid={testId} data-status={status}>
      <span className="approval-state">
        <span className="muted small">Status</span>
        <StatusBadge status={status} testId={`${testId}-status`} />
        {revisionRequested && <RevisionTag testId={`${testId}-revision`} />}
      </span>
      {(canStart || canDone || canReview) && (
        <span className="approval-actions">
          {disabledReason && <span className="muted small">{disabledReason}</span>}
          {canStart && (
            <Btn size="sm" onClick={onStart} disabled={off} title={disabledReason} data-testid={`${testId}-start`}>
              <Icon name="play" size="sm" />
              Start work
            </Btn>
          )}
          {canDone && (
            <Btn kind="primary" size="sm" onClick={onDone} disabled={off} title={disabledReason} data-testid={`${testId}-done`}>
              <Icon name="done" size="sm" />
              Mark as done
            </Btn>
          )}
          {canRequest && (
            <Btn size="sm" onClick={onRequestChange} disabled={off} title={disabledReason} data-testid={`${testId}-request-change`}>
              <Icon name="revision" size="sm" />
              Request changes
            </Btn>
          )}
          {canApprove && (
            <Btn kind="primary" size="sm" onClick={onApprove} disabled={off} title={disabledReason} data-testid={`${testId}-approve`}>
              <Icon name="approve" size="sm" />
              Approve
            </Btn>
          )}
        </span>
      )}
    </div>
  );
}

export type BadgeTone = "gray" | "blue" | "mint" | "green" | "amber" | "orange" | "red" | "violet" | "flag";
/** Nhãn trạng thái – luôn ôm sát chữ. Giữ kiểu string để không vỡ chỗ gọi cũ; mã mới dùng BadgeTone. */
/** `title`: tooltip (dùng khi chữ dài có thể bị cắt "…" – bọc chữ trong `<span className="badge-text">`). */
export function Badge({ tone = "gray", title, children }: { tone?: BadgeTone | (string & {}); title?: string; children: React.ReactNode }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
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
          <IconBtn icon="close" label="Close" size="lg" onClick={onClose} />
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

/**
 * Ngăn trượt từ phải. Dùng cho mọi panel xem/sửa chi tiết (SCR-04, SCR-07). Esc hoặc bấm nền để đóng.
 * Rộng 40% màn hình (`--drawer-w`), tối thiểu 360px; màn ≤ 768px thì phủ hết chiều ngang.
 */
export function Drawer({
  title,
  onClose,
  children,
  footer,
  actions,
  testId,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Nút phụ cạnh tiêu đề (ví dụ "Tải về"). */
  actions?: React.ReactNode;
  /** @deprecated Mọi ngăn phải đều rộng 40% (quyết định đợt 5). Vẫn nhận để mã cũ không vỡ, không còn tác dụng. */
  size?: "md" | "lg";
  testId?: string;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} data-testid={testId}>
        <div className="drawer-head">
          <h3>{title}</h3>
          {actions}
          <IconBtn icon="close" label="Close" size="lg" onClick={onClose} />
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
/**
 * Thanh tab ngang.
 * - `line` (mặc định): tab đang chọn chữ mint-700, gạch chân mint-500 – dùng trong trang (tab module, tab dự án).
 * - `pill`: nút bo tròn, tab đang chọn nền mint-50, chữ mint-700 đậm – dùng cho menu thanh trên, bộ lọc nhanh.
 */
export function Tabs<K extends string>({
  items,
  active,
  onChange,
  className = "",
  variant = "line",
}: {
  items: TabItem<K>[];
  active: K;
  onChange?: (key: K) => void;
  className?: string;
  variant?: "line" | "pill";
}) {
  return (
    <nav className={`tabs ${variant === "pill" ? "tabs-pill" : ""} ${className}`} role="tablist">
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

export interface SideNavItem {
  key: string;
  label: React.ReactNode;
  /** Có href thì mục là liên kết (#/...), không thì là nút gọi `onSelect`. Mục cha không href → bấm để mở/thu. */
  href?: string;
  icon?: IconName;
  children?: SideNavItem[];
  /** Số bước hiện trong vòng tròn trước nhãn (vd luồng Tài liệu → Sơ đồ → Prototype…). */
  step?: number;
  /** Badge / ghi chú nhỏ cuối dòng (vd StatusBadge). */
  extra?: React.ReactNode;
  testId?: string;
}
const hasKey = (it: SideNavItem, key: string): boolean => it.key === key || !!it.children?.some((c) => hasKey(c, key));
/** Tên chữ của mục (dùng cho tooltip / aria-label khi menu thu gọn chỉ còn icon). */
const navText = (it: SideNavItem) => (typeof it.label === "string" ? it.label : it.key);
/** Mục bấm được khi thu gọn: có href, có `onSelect`, hoặc không có mục con (mục cha chỉ để mở/thu thì bỏ). */
const railable = (it: SideNavItem, selectable: boolean) => !!(it.href || selectable || !it.children?.length);
/** Có mục cấp 1 có icon (và bấm được) → khi thu gọn còn dải icon; không có thì menu thu gọn ẩn hẳn. */
export const sideNavHasRail = (items: SideNavItem[], selectable = false) => items.some((it) => !!it.icon && railable(it, selectable));

/**
 * Menu trái nhiều cấp. Mục đang chọn: nền mint-50, vạch trái mint-500, chữ đậm, `aria-current="page"`.
 * Mục cha mở/thu bằng nút mũi tên (tự mở khi có mục con đang chọn). `header` là chỗ chèn bộ chọn module.
 * `collapsed`: dải icon – chỉ còn mục cấp 1 có icon (kèm các mục con cấp 2 có số bước / icon), tên mục thành tooltip +
 * `aria-label`; ẩn `header`, nhãn, badge. Không có mục nào có icon (`sideNavHasRail` = false) thì không hiện gì.
 */
export function SideNav({
  items,
  active,
  header,
  onSelect,
  ariaLabel = "Menu",
  className = "",
  testId,
  collapsed = false,
}: {
  items: SideNavItem[];
  active: string;
  header?: React.ReactNode;
  onSelect?: (key: string) => void;
  ariaLabel?: string;
  className?: string;
  testId?: string;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const baseId = useId();
  const isOpen = (it: SideNavItem) => open[it.key] ?? hasKey(it, active);
  // Chuyển sang mục con của nhóm đã bị thu → mở lại nhóm đó (không đóng nhóm người dùng đã mở).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    setOpen((o) => {
      let next = o;
      const walk = (list: SideNavItem[]) =>
        list.forEach((it) => {
          if (!it.children?.length) return;
          if (o[it.key] === false && hasKey(it, active)) next = { ...next, [it.key]: true };
          walk(it.children);
        });
      walk(itemsRef.current);
      return next;
    });
  }, [active]);

  const render = (list: SideNavItem[], depth: number): React.ReactNode =>
    list.map((it) => {
      const kids = it.children?.length ? it.children : null;
      const expanded = kids ? isOpen(it) : false;
      const toggle = () => setOpen((o) => ({ ...o, [it.key]: !expanded }));
      const childId = `${baseId}-${it.key}`;
      const selected = it.key === active;
      const cls = `side-nav-item ${selected ? "active" : ""} ${!selected && kids && hasKey(it, active) ? "has-active" : ""}`;
      const body = (
        <>
          {it.step !== undefined && <span className="side-nav-step">{it.step}</span>}
          {it.icon && <Icon name={it.icon} />}
          <span className="side-nav-label">{it.label}</span>
          {it.extra}
        </>
      );
      const style = { "--depth": depth } as React.CSSProperties;
      const main = it.href ? (
        <a href={it.href} className={cls} style={style} aria-current={selected ? "page" : undefined} data-testid={it.testId} onClick={() => onSelect?.(it.key)}>
          {body}
        </a>
      ) : kids && !onSelect ? (
        <button type="button" className={cls} style={style} aria-expanded={expanded} aria-controls={childId} data-testid={it.testId} onClick={toggle}>
          {body}
          <Icon name={expanded ? "chevronDown" : "chevronRight"} size="sm" className="side-nav-caret" />
        </button>
      ) : (
        <button type="button" className={cls} style={style} aria-current={selected ? "page" : undefined} data-testid={it.testId} onClick={() => (onSelect ? onSelect(it.key) : undefined)}>
          {body}
        </button>
      );
      const needToggleBtn = kids && (it.href || onSelect);
      return (
        <li key={it.key} className="side-nav-node">
          {needToggleBtn ? (
            <div className="side-nav-row">
              {main}
              <IconBtn icon={expanded ? "chevronDown" : "chevronRight"} size="sm" label={expanded ? "Collapse" : "Expand"} aria-expanded={expanded} aria-controls={childId} onClick={toggle} />
            </div>
          ) : (
            main
          )}
          {kids && (
            <ul id={childId} className="side-nav-list" hidden={!expanded}>
              {render(kids, depth + 1)}
            </ul>
          )}
        </li>
      );
    });

  if (collapsed) {
    const railItem = (it: SideNavItem, isActive: boolean, hasActive: boolean) => {
      const cls = `side-nav-item side-nav-rail-item ${isActive ? "active" : ""} ${hasActive ? "has-active" : ""}`;
      const text = navText(it);
      const body = it.icon ? <Icon name={it.icon} /> : <span className="side-nav-step">{it.step}</span>;
      return it.href ? (
        <a href={it.href} className={cls} title={text} aria-label={text} aria-current={isActive ? "page" : undefined} data-testid={it.testId} onClick={() => onSelect?.(it.key)}>
          {body}
        </a>
      ) : (
        <button type="button" className={cls} title={text} aria-label={text} aria-current={isActive ? "page" : undefined} data-testid={it.testId} onClick={() => onSelect?.(it.key)}>
          {body}
        </button>
      );
    };
    const rail = items.filter((it) => it.icon && railable(it, !!onSelect));
    if (!rail.length) return null;
    return (
      <nav className={`side-nav side-nav-collapsed ${className}`} aria-label={ariaLabel} data-testid={testId}>
        <ul className="side-nav-list">
          {rail.map((it) => {
            const kids = (it.children ?? []).filter((c) => (c.icon || c.step !== undefined) && railable(c, !!onSelect));
            const kidActive = kids.some((c) => hasKey(c, active));
            return (
              <li key={it.key} className="side-nav-node">
                {railItem(it, kidActive ? false : hasKey(it, active), kidActive)}
                {kids.length > 0 && (
                  <ul className="side-nav-list side-nav-rail-kids">
                    {kids.map((c) => (
                      <li key={c.key} className="side-nav-node">
                        {railItem(c, hasKey(c, active), false)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav className={`side-nav ${className}`} aria-label={ariaLabel} data-testid={testId}>
      {header && <div className="side-nav-header">{header}</div>}
      <ul className="side-nav-list">{render(items, 0)}</ul>
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
    <span className={`avatar ${size === "sm" ? "avatar-sm" : ""} ${name ? "" : "avatar-empty"}`} title={name ?? "Unassigned"} aria-hidden="true">
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
  placeholder = "Unassigned",
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
  title = "Drag and drop files here",
  hint = "or click to choose files from your computer",
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
      <span className="filedrop-icon">
        <Icon name="upload" size="lg" />
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
const SCORE_LABEL: Record<ScoreLevel, string> = { good: "Good", fair: "Fair", poor: "Poor" };

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
const SEVERITY: Record<IssueSeverity, [string, BadgeTone]> = { error: ["Error", "red"], warn: ["Warning", "amber"], info: ["Suggestion", "blue"] };

/** Danh sách lỗi theo mức error / warn / info, lỗi nặng xếp trước. */
export function IssueList({ issues, empty = "No issues found." }: { issues: IssueItem[]; empty?: React.ReactNode }) {
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
          {i.suggestion && <div className="issue-sugg">
              <Icon name="arrowRight" size="xs" /> Suggestion: {i.suggestion}
            </div>}
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
  acceptLabel = "Create",
  dismissLabel = "Dismiss",
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
        <Btn size="sm" onClick={onAccept} disabled={disabled}>
          {acceptLabel}
        </Btn>
        <Btn size="sm" kind="ghost" onClick={onDismiss} disabled={disabled}>
          {dismissLabel}
        </Btn>
      </div>
    </div>
  );
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
