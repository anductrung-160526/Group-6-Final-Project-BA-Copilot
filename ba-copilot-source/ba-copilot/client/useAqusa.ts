// Tải public/nlp.js (mô hình NLP của bộ chấm QUS) một lần; trả về true khi đã sẵn sàng để component chấm lại.
import { useEffect, useState } from "react";
import { nlpReady } from "../shared/aqusa.ts";

let loading = false;
export function useAqusa(): boolean {
  const [ready, setReady] = useState(nlpReady());
  useEffect(() => {
    if (ready) return;
    const done = () => setReady(nlpReady());
    window.addEventListener("aqusa-ready", done);
    if (!loading) {
      loading = true;
      const s = document.createElement("script");
      s.src = "nlp.js";
      s.async = true;
      document.head.appendChild(s);
    }
    return () => window.removeEventListener("aqusa-ready", done);
  }, [ready]);
  return ready;
}
