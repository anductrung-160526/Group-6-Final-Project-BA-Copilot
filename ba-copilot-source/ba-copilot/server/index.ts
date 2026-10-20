import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { createApp } from "./app.ts";
import { aiConfig } from "./ai/client.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Nạp biến môi trường từ .env (không cần thư viện dotenv).
// Chấp nhận file UTF-16 (PowerShell `echo > .env`), BOM, tiền tố `export`; biến hệ thống rỗng không che giá trị trong file.
const envFile = join(root, ".env");
const envNote: string[] = [];
if (existsSync(envFile)) {
  const raw = readFileSync(envFile);
  const text = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString("utf16le") : raw.toString("utf8");
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1].toUpperCase();
    if (!process.env[key]?.trim()) process.env[key] = m[2].replace(/^["']|["']$/g, "");
  }
} else envNote.push(`không thấy file ${envFile}`);
if (!process.env.ANTHROPIC_API_KEY?.trim() && process.env.CLAUDE_API_KEY?.trim()) process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
if (process.env.AI_MODE?.trim().toLowerCase() === "mock") envNote.push("AI_MODE=mock đang bật");
else if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.ANTHROPIC_AUTH_TOKEN?.trim()) envNote.push("ANTHROPIC_API_KEY (hoặc ANTHROPIC_AUTH_TOKEN) trống hoặc không có trong .env");

const port = Number(process.env.PORT ?? 3000);
openDb(process.env.DB_FILE ?? join(root, "data", "ba-copilot.db"));
const server = createApp({ publicDir: join(root, "public") });
server.listen(port, () => {
  const c = aiConfig();
  console.log(`\n  BA Copilot đang chạy: http://localhost:${port}`);
  console.log(`  AI: ${c.provider === "claude" ? `Claude API (${c.model}${c.baseUrl !== "https://api.anthropic.com" ? ` qua ${c.baseUrl}` : ""})` : `Chế độ Mock (rule-based) – ${envNote.join("; ") || "đặt ANTHROPIC_API_KEY trong .env để dùng Claude"}`}\n`);
});
