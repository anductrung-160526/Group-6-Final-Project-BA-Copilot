// Trang đo khung bao: render cây bằng Renderer của app, trả về getBoundingClientRect của từng node (theo data-node-id), tính theo toàn trang.
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Renderer } from "../../client/components/Renderer.tsx";
import type { UINode } from "../../shared/design.ts";

const root = createRoot(document.getElementById("root")!);
(window as unknown as { measure: (t: UINode) => Record<string, number[]> }).measure = (tree) => {
  flushSync(() => root.render(<Renderer node={tree} />));
  const out: Record<string, number[]> = {};
  document.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
    const r = el.getBoundingClientRect();
    out[el.dataset.nodeId!] = [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY];
  });
  return out;
};
