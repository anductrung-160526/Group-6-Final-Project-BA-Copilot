import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { createApp } from "./app.ts";
import { aiConfig } from "./ai/client.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Nạp biến môi trường từ .env (không cần thư viện dotenv)
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const port = Number(process.env.PORT ?? 3000);
openDb(process.env.DB_FILE ?? join(root, "data", "ba-copilot.db"));
const server = createApp({ publicDir: join(root, "public") });
server.listen(port, () => {
  const c = aiConfig();
  console.log(`\n  BA Copilot is running: http://localhost:${port}`);
  console.log(`  AI: ${c.provider === "claude" ? `Claude API (${c.model})` : "Mock mode (rule-based) – set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in .env to use Claude"}\n`);
});
