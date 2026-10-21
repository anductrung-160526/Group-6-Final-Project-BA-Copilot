// Tải public/nlp.js (mô hình NLP của bộ chấm QUS) một lần; trả về trạng thái để component chấm lại khi đã sẵn sàng.
// Chưa sẵn sàng thì không có điểm (shared/qus.ts không chấm thay bằng luật) – component hiện QusModelStatus.
import { useEffect, useState } from "react";
import { nlpReady } from "../shared/aqusa.ts";

export type AqusaStatus = "loading" | "ready" | "error";

let loading = false;
let failed = false;
const current = (): AqusaStatus => (nlpReady() ? "ready" : failed ? "error" : "loading");

export function useAqusa(): AqusaStatus {
  const [status, setStatus] = useState(current());
  useEffect(() => {
    if (status !== "loading") return;
    const done = () => setStatus(current());
    window.addEventListener("aqusa-ready", done);
    window.addEventListener("aqusa-error", done);
    if (!loading) {
      loading = true;
      const s = document.createElement("script");
      s.src = "nlp.js";
      s.async = true;
      s.onerror = () => {
        failed = true;
        window.dispatchEvent(new Event("aqusa-error"));
      };
      document.head.appendChild(s);
    }
    return () => {
      window.removeEventListener("aqusa-ready", done);
      window.removeEventListener("aqusa-error", done);
    };
  }, [status]);
  return status;
}
