// Đóng gói sẵn để chạy KHÔNG cần npm install: dist/server.mjs + public/app.js + public/vendor/mermaid.min.js
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
await esbuild.build({
  entryPoints: { app: "client/main.tsx", "app-style": "client/styles.css" },
  bundle: true, outdir: "public", format: "iife", jsx: "automatic", minify: true, sourcemap: false,
  target: ["chrome110", "safari16", "firefox115"], define: { "process.env.NODE_ENV": '"production"' }, logLevel: "info",
});
await esbuild.build({
  entryPoints: ["server/index.ts"], bundle: true, platform: "node", format: "esm", target: "node22",
  outfile: "dist/server.mjs", external: ["node:*"], logLevel: "info",
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
mkdirSync("public/vendor", { recursive: true });
copyFileSync(join(dirname(require.resolve("mermaid/package.json")), "dist", "mermaid.min.js"), "public/vendor/mermaid.min.js");
console.log("Đã đóng gói: dist/server.mjs, public/app.js, public/vendor/mermaid.min.js");
