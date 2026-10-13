import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    mermaid?: any;
  }
}

let loader: Promise<any> | null = null;
function loadMermaid(): Promise<any> {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (!loader)
    loader = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = "/vendor/mermaid.min.js";
      sc.onload = () => {
        window.mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict", sequence: { useMaxWidth: true, mirrorActors: false } });
        resolve(window.mermaid);
      };
      sc.onerror = () => reject(new Error("Không tải được thư viện Mermaid"));
      document.head.appendChild(sc);
    });
  return loader;
}

let counter = 0;

export function Mermaid({ code, name }: { code: string; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    setError(null);
    loadMermaid()
      .then(async (m) => {
        const { svg } = await m.render(`mmd-${++counter}`, code);
        if (alive) setSvg(svg);
      })
      .catch((e: Error) => alive && setError(e.message));
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
  };

  if (error)
    return (
      <div className="mermaid-error">
        <div className="badge badge-amber">Sơ đồ chưa render được: {error}</div>
        <pre className="code">{code}</pre>
      </div>
    );
  return (
    <div className="mermaid-wrap">
      <div ref={ref} className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      {svg && (
        <button className="btn btn-ghost btn-sm" onClick={downloadSvg}>
          Tải SVG
        </button>
      )}
    </div>
  );
}
