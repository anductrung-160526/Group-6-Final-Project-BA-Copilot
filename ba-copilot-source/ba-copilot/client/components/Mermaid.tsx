// Vẽ sơ đồ Mermaid (thư viện tải lười từ /vendor/mermaid.min.js) + kiểm tra cú pháp bằng mermaid.parse. Chủ sở hữu: C6.
//   <Mermaid code={code} name="so-do-erd" />            vẽ, lỗi thì hiện khung cảnh báo gọn (dòng lỗi + chi tiết có thể mở xem)
//   const err = await parseMermaid(code);               null = hợp lệ; { line, message } khi sai (dùng trước khi lưu)

import React, { useEffect, useState } from "react";
import { Btn, Icon } from "./ui.tsx";

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
        reject(new Error("Không tải được thư viện Mermaid"));
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
  const detail = String((e as Error)?.message ?? e ?? "Lỗi không rõ");
  const line = Number(detail.match(/on line (\d+)/i)?.[1] ?? 0);
  const expecting = detail.match(/Expecting (.+?), got '([^']*)'/);
  let message = detail.split("\n")[0].replace(/[:.]\s*$/, "");
  if (/^(Parse|Lexical) error on line \d+/i.test(message)) message = expecting ? `Cú pháp sai gần "${expecting[2]}"` : "Cú pháp sai";
  else if (/No diagram type detected/i.test(detail)) message = "Không nhận ra loại sơ đồ ở dòng đầu (vd flowchart LR, sequenceDiagram, erDiagram)";
  return { line, message: message.slice(0, 200), detail };
}

/** Kiểm tra cú pháp bằng Mermaid thật. null = hợp lệ. */
export async function parseMermaid(code: string): Promise<MermaidError | null> {
  if (!code.trim()) return { line: 0, message: "Mã sơ đồ trống", detail: "" };
  const m = await loadMermaid();
  try {
    await m.parse(code);
    return null;
  } catch (e) {
    return toMermaidError(e);
  }
}

let counter = 0;

export function Mermaid({ code, name, downloadable = true }: { code: string; name: string; downloadable?: boolean }) {
  const [error, setError] = useState<MermaidError | null>(null);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    const id = `mmd-${++counter}`;
    setError(null);
    loadMermaid()
      .then(async (m) => {
        const { svg } = await m.render(id, code);
        if (alive) setSvg(svg);
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
            Sơ đồ chưa vẽ được{error.line ? ` – dòng ${error.line}` : ""}: {error.message}
          </span>
        </div>
        {error.detail && error.detail !== error.message && (
          <details>
            <summary className="muted small">Chi tiết lỗi</summary>
            <pre className="code">{error.detail}</pre>
          </details>
        )}
      </div>
    );
  return (
    <div className="mermaid-wrap">
      <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      {svg && downloadable && (
        <Btn kind="ghost" size="sm" onClick={downloadSvg}>
          <Icon name="download" size="sm" />
          Tải SVG
        </Btn>
      )}
    </div>
  );
}
