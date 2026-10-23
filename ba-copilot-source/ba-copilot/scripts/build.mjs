// Đóng gói giao diện React (frontend/src/) thành frontend/public/app.js + frontend/public/app-style.css bằng esbuild.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: { app: "frontend/src/main.tsx" },
  bundle: true,
  outdir: "frontend/public",
  format: "iife",
  jsx: "automatic",
  target: ["chrome110", "safari16", "firefox115"],
  sourcemap: true,
  minify: !watch,
  loader: { ".css": "css" },
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  logLevel: "info",
};
// CSS là entry riêng
options.entryPoints = { app: "frontend/src/main.tsx", "app-style": "frontend/src/styles.css", nlp: "frontend/src/nlp-entry.ts" };

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
