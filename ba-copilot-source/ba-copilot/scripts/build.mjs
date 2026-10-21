// Đóng gói giao diện React (client/) thành public/app.js + public/app.css bằng esbuild.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: { app: "client/main.tsx" },
  bundle: true,
  outdir: "public",
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
options.entryPoints = { app: "client/main.tsx", "app-style": "client/styles.css", nlp: "client/nlp-entry.ts" };

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
