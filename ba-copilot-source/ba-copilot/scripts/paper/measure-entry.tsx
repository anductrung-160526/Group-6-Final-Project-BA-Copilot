// Trang đo khung bao: render cây bằng Renderer của app, trả về getBoundingClientRect của từng node (theo data-node-id).
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Renderer } from "../../client/components/Renderer.tsx";
import type { UINode } from "../../shared/design.ts";

const root = createRoot(document.getElementById("root")!);
(window as unknown as { measure: (t: UINode) => Record<string, number[]> }).measure = (tree) => {
  flushSync(() => root.render(<Renderer node={tree} />));
  const out: Record<string, number[]> = {};
  const base = document.getElementById("root")!.getBoundingClientRect();
  document.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
    const r = el.getBoundingClientRect();
    out[el.dataset.nodeId!] = [r.left - base.left, r.top - base.top, r.right - base.left, r.bottom - base.top];
  });
  return out;
};
