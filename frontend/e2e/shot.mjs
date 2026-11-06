// Chụp ảnh màn hình để tự đánh giá giao diện sau khi render.
// node e2e/shot.mjs <path> <width> <out.png> [fullPage=1]
import { chromium } from "@playwright/test";

const [, , path = "/", width = "1440", out = "shot.png", full = "1"] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  // cuộn qua trang để kích hoạt scroll-reveal rồi quay lại đầu
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo({ top: y, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo({ top: 0, behavior: "instant" });
});
await page.waitForTimeout(900);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await page.screenshot({ path: out, fullPage: full === "1" });
console.log(JSON.stringify({ path, width, overflowPx: overflow, errors }));
await browser.close();
