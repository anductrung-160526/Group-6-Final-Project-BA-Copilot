// Chụp tab "Gợi ý" của Design Studio cho màn do scripts/dataset/demo-suggest.ts tạo.
// Dùng: node e2e/demo-suggest-shot.mjs <url-module-design> <ảnh-ra.png>
import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
await p.goto(url);
await p.getByTestId("suggest-tab").click();
await p.getByTestId("suggest-panel").waitFor();
await p.waitForTimeout(1500);
await p.screenshot({ path: out });
await b.close();
