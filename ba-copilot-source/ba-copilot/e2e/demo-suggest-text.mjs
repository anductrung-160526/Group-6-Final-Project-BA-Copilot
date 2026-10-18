// Mở tab Gợi ý của một module, chụp màn hình và in nội dung các gợi ý (dùng cho chạy thử phương án B).
// Dùng: node e2e/demo-suggest-text.mjs <url-module-design> <ảnh.png>
import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
await p.goto(url);
await p.getByTestId("suggest-tab").click();
await p.getByTestId("suggest-panel").waitFor();
await p.waitForTimeout(2500);
console.log(await p.getByTestId("suggest-panel").innerText());
await p.screenshot({ path: out });
await b.close();
