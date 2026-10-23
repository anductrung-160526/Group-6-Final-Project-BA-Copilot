// Vẽ sơ đồ Mermaid (thư viện tải lười từ /vendor/mermaid.min.js) + kiểm tra cú pháp bằng mermaid.parse. Chủ sở hữu: C6.
//   <Mermaid code={code} name="diagram-erd" title="ERD diagram" />   vẽ, lỗi thì hiện khung cảnh báo gọn (dòng lỗi + chi tiết có thể mở xem)
//     sơ đồ rộng (BPMN, Context nhiều actor): xem trước không nhỏ hơn MIN_PREVIEW_SCALE, cuộn ngang; nút "View full size"
//     mở Modal size="full" có phóng to / thu nhỏ / vừa khung
//   const err = await parseMermaid(code);               null = hợp lệ; { line, message } khi sai (dùng trước khi lưu)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Icon, IconBtn, Modal } from "./ui.tsx";

declare global {
  interface Window {
    mermaid?: any;
  }
}

let loader: Promise<any> | null = null;
export function loadMermaid(): Promise<any> {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (!loader)
    loader = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = "/vendor/mermaid.min.js";
      sc.onload = () => {
        window.mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict", sequence: { useMaxWidth: true, mirrorActors: false } });
        resolve(window.mermaid);
      };
      sc.onerror = () => {
        loader = null;
        reject(new Error("Could not load the Mermaid library"));
      };
      document.head.appendChild(sc);
    });
  return loader;
}

export interface MermaidError {
  /** Số dòng lỗi (bắt đầu từ 1); 0 = không xác định. */
  line: number;
  /** Câu báo lỗi ngắn. */
  message: string;
  /** Thông báo đầy đủ của Mermaid (có đoạn mã và vị trí "^"). */
  detail: string;
}

/** Đọc số dòng và câu ngắn từ lỗi của Mermaid ("Parse error on line 3: …", "Lexical error on line 2. …"). */
export function toMermaidError(e: unknown): MermaidError {
  const detail = String((e as Error)?.message ?? e ?? "Unknown error");
  const line = Number(detail.match(/on line (\d+)/i)?.[1] ?? 0);
  const expecting = detail.match(/Expecting (.+?), got '([^']*)'/);
  let message = detail.split("\n")[0].replace(/[:.]\s*$/, "");
  if (/^(Parse|Lexical) error on line \d+/i.test(message)) message = expecting ? `Syntax error near "${expecting[2]}"` : "Syntax error";
  else if (/No diagram type detected/i.test(detail)) message = "The diagram type on the first line was not recognised (e.g. flowchart LR, sequenceDiagram, erDiagram)";
  return { line, message: message.slice(0, 200), detail };
}

/** Kiểm tra cú pháp bằng Mermaid thật. null = hợp lệ. */
export async function parseMermaid(code: string): Promise<MermaidError | null> {
  if (!code.trim()) return { line: 0, message: "Diagram code is empty", detail: "" };
  const m = await loadMermaid();
  try {
    await m.parse(code);
    return null;
  } catch (e) {
    return toMermaidError(e);
  }
}

let counter = 0;

/** Xem trước không thu nhỏ sơ đồ dưới 60% cỡ thật (chữ còn đọc được); sơ đồ rộng hơn khung thì cuộn ngang. */
export const MIN_PREVIEW_SCALE = 0.6;
/** Các mức phóng to / thu nhỏ trong hộp thoại "View full size". */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Cỡ thật của SVG Mermaid, đọc từ viewBox ("0 0 3160 429" → 3160 × 429). null = không đọc được. */
export function svgSize(svg: string): { w: number; h: number } | null {
  const m = svg.match(/viewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** Mức kế tiếp trong ZOOM_STEPS (dir = 1 phóng to, -1 thu nhỏ), tính từ mức hiện tại (có thể là mức "vừa khung" lẻ). */
export function nextZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 1e-6) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) ?? ZOOM_STEPS[0];
}

export function Mermaid({ code, name, title = "Diagram", downloadable = true }: { code: string; name: string; title?: string; downloadable?: boolean }) {
  const [error, setError] = useState<MermaidError | null>(null);
  const [svg, setSvg] = useState("");
  const [renderId, setRenderId] = useState("");
  const [full, setFull] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    const id = `mmd-${++counter}`;
    setError(null);
    loadMermaid()
      .then(async (m) => {
        const { svg } = await m.render(id, code);
        if (alive) {
          setSvg(svg);
          setRenderId(id);
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setSvg("");
        setError(toMermaidError(e));
      })
      .finally(() => {
        // Mermaid để lại phần tử tạm (#d<id>) trong body khi vẽ lỗi
        document.getElementById(`d${id}`)?.remove();
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const size = svg ? svgSize(svg) : null;

  // Sơ đồ rộng hơn khung xem trước (đã chạm mức thu nhỏ tối thiểu) → hiện câu "cuộn ngang"
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [svg]);

  const downloadSvg = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (error)
    return (
      <div className="mermaid-error" data-testid="mermaid-error">
        <div className="notice notice-warn" role="alert">
          <span className="notice-text">
            The diagram could not be rendered{error.line ? ` – line ${error.line}` : ""}: {error.message}
          </span>
        </div>
        {error.detail && error.detail !== error.message && (
          <details>
            <summary className="muted small">Error details</summary>
            <pre className="code">{error.detail}</pre>
          </details>
        )}
      </div>
    );
  return (
    <div className="mermaid-wrap">
      <div
        ref={box}
        className="mermaid-svg"
        // Kích thước động (theo cỡ thật của từng sơ đồ) – ngoại lệ "giá trị tính khi chạy" của design system
        style={size ? ({ "--mermaid-min-w": `${Math.round(size.w * MIN_PREVIEW_SCALE)}px` } as React.CSSProperties) : undefined}
        data-testid="mermaid-preview"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {svg && overflow && (
        <span className="muted small" data-testid="mermaid-scroll-hint">
          Wide diagram – scroll sideways, or click View full size to zoom.
        </span>
      )}
      {svg && (
        <div className="mermaid-actions">
          <Btn kind="ghost" size="sm" onClick={() => setFull(true)} data-testid="mermaid-full">
            <Icon name="maximize" size="sm" />
            View full size
          </Btn>
          {downloadable && (
            <Btn kind="ghost" size="sm" onClick={downloadSvg}>
              <Icon name="download" size="sm" />
              Download SVG
            </Btn>
          )}
        </div>
      )}
      {full && svg && <MermaidZoom svg={svg} renderId={renderId} size={size} title={title} onClose={() => setFull(false)} onDownload={downloadable ? downloadSvg : undefined} />}
    </div>
  );
}

/** Hộp thoại "View full size": sơ đồ ở cỡ thật, phóng to / thu nhỏ / vừa khung, cuộn hai chiều. */
function MermaidZoom({ svg, renderId, size, title, onClose, onDownload }: { svg: string; renderId: string; size: { w: number; h: number } | null; title: string; onClose: () => void; onDownload?: () => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  // Bản sao SVG đổi id (mmd-3 → mmd-3-full) để không trùng id với bản xem trước (marker mũi tên, <style> của Mermaid)
  const copy = useMemo(() => (renderId ? svg.replace(new RegExp(`${renderId}(?!\\d)`, "g"), `${renderId}-full`) : svg), [svg, renderId]);
  const fit = () => {
    const el = canvas.current;
    if (!el || !size) return;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) * 2 || 0;
    setZoom(Math.max(ZOOM_STEPS[0], Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], (el.clientWidth - pad) / size.w)));
  };
  const pct = `${Math.round(zoom * 100)}%`;
  return (
    <Modal title={title} onClose={onClose} size="full">
      <div className="mermaid-zoom-bar" data-testid="mermaid-zoom-bar">
        <IconBtn icon="zoomOut" label="Zoom out" disabled={!size || zoom <= ZOOM_STEPS[0] + 1e-6} onClick={() => setZoom((z) => nextZoom(z, -1))} data-testid="mermaid-zoom-out" />
        <span className="mermaid-zoom-level" aria-live="polite" data-testid="mermaid-zoom-level">
          {pct}
        </span>
        <IconBtn icon="zoomIn" label="Zoom in" disabled={!size || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 1e-6} onClick={() => setZoom((z) => nextZoom(z, 1))} data-testid="mermaid-zoom-in" />
        <Btn kind="ghost" size="sm" disabled={!size} onClick={fit} data-testid="mermaid-zoom-fit">
          Fit to width
        </Btn>
        <Btn kind="ghost" size="sm" disabled={!size || zoom === 1} onClick={() => setZoom(1)}>
          Actual size
        </Btn>
        <span className="spacer" />
        {onDownload && (
          <Btn kind="ghost" size="sm" onClick={onDownload}>
            <Icon name="download" size="sm" />
            Download SVG
          </Btn>
        )}
      </div>
      <div
        ref={canvas}
        className="mermaid-zoom"
        style={size ? ({ "--mermaid-w": `${Math.round(size.w * zoom)}px` } as React.CSSProperties) : undefined}
        data-testid="mermaid-zoom"
        dangerouslySetInnerHTML={{ __html: copy }}
      />
    </Modal>
  );
}
