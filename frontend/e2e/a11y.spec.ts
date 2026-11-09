import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Kiểm tra tự động WCAG 2.2 AA (axe-core) trên các trang chính + hành vi prefers-reduced-motion + bàn phím.
const PAGES = ["/", "/explore", "/datasets/0", "/earn", "/create", "/library", "/create/new"];
// Nút Google Identity Services do Google tự vẽ bên trong khung [data-google-button] (lúc là iframe, lúc là div; nhãn
// "…Mở trong thẻ mới" không sửa được từ phía mình). Khung bọc của mình vẫn có nhãn "Đăng nhập với Google".
export const GOOGLE_BUTTON = "[data-google-button]";

for (const path of PAGES) {
  test(`a11y WCAG 2.2 AA: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800); // chờ animation vào trang kết thúc
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).exclude(GOOGLE_BUTTON).analyze();
    const summary = res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} — ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
}

test("prefers-reduced-motion: không còn animation lặp vô hạn", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.waitForTimeout(1200);
  const infinite = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity).length,
  );
  expect(infinite).toBe(0);
  await ctx.close();
});

test("bàn phím: liên kết bỏ qua và focus hiển thị rõ", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Bỏ qua tới nội dung chính" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
});
