import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ANVIL, installAnvilWallet } from "./anvil-wallet";

/** axe WCAG 2.2 AA ở các trạng thái chỉ có sau khi đăng nhập / mở hộp thoại. */
async function expectAccessible(page: Page, label: string) {
  await page.waitForTimeout(500);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const v = r.violations.map((x) => `${label}: ${x.id} (${x.impact}) ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(v, v.join(" || ")).toEqual([]);
}

// Luồng nghiệp vụ thật trên Anvil + backend + QC thật. Chạy tuần tự, các vai trò dùng context riêng.
test.describe.configure({ mode: "serial" });

const PROMPT = "cho tôi hỏi lãi suất gửi tiết kiệm hiện nay là bao nhiêu"; // khớp fixture micro
const SHOTS = "e2e/.results/screens";
let campaignId = -1;
let contributor: { ctx: BrowserContext; page: Page };

async function role(browser: Browser, account?: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (account) await installAnvilWallet(ctx, account);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

test("người tạo: kết nối ví, đăng nhập, tạo chiến dịch có quỹ mồi qua wizard", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:8000/demo/faucet", { data: { address: ANVIL.creator, amount_usdc: 100 } });
  const { page, ctx, errors } = await role(browser, ANVIL.creator);
  await page.goto("/create");
  await page.getByRole("main").getByRole("button", { name: "Kết nối ví" }).click();
  // Cùng email với CLI (`giongque login --as creator`): một ví chỉ gắn một email, nên CLI demo và e2e
  // chạy chung một database (vd. Neon) theo thứ tự nào cũng được.
  await page.getByLabel("Email tổ chức").fill("creator@giongque.local");
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await expect(page.getByRole("link", { name: "+ Tạo chiến dịch mới" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/creator-dashboard.png`, fullPage: true });

  await page.getByRole("link", { name: "+ Tạo chiến dịch mới" }).click();
  await page.getByLabel("Tên chiến dịch").fill("E2E – Giọng miền Nam ngân hàng");
  await page.getByLabel("Mô tả cho người đóng góp và người mua").fill("Chiến dịch kiểm thử end-to-end từ giao diện web.");
  await page.getByLabel("Mục đích sử dụng dữ liệu").fill("Kiểm thử luồng nghiệp vụ");
  await page.getByRole("button", { name: "Tiếp tục →" }).click();
  await page.getByLabel(/Câu mẫu/).fill(PROMPT);
  await page.getByRole("button", { name: "Tiếp tục →" }).click();
  await page.getByRole("button", { name: "Tiếp tục →" }).click(); // điều khoản mẫu
  await page.getByLabel("Mục tiêu (giờ giọng nói)").fill("0.01");
  await page.getByLabel("Quỹ mồi (VNĐ, tùy chọn)").fill("260000");
  await page.getByRole("button", { name: "Tiếp tục →" }).click();
  await page.screenshot({ path: `${SHOTS}/creator-review.png`, fullPage: true });
  await expectAccessible(page, "creator-review");
  await page.getByRole("button", { name: "Ký & tạo chiến dịch" }).click();
  await page.waitForURL(/\/datasets\/\d+$/, { timeout: 90_000 });
  campaignId = Number(page.url().split("/").pop());
  await expect(page.getByRole("heading", { name: "E2E – Giọng miền Nam ngân hàng" })).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("người đóng góp: tạo ví, đăng nhập, ký đồng thuận, ghi âm qua micro, QC thật đạt", async ({ browser }) => {
  const r = await role(browser);
  contributor = r;
  const { page } = r;
  await page.goto(`/earn/campaigns/${campaignId}`);
  await page.screenshot({ path: `${SHOTS}/onboarding.png`, fullPage: true });
  // Mật khẩu yếu: nút tạo ví bị khóa, danh sách điều kiện báo còn thiếu
  const pw = page.getByLabel("Mật khẩu ví");
  const create = page.getByRole("button", { name: "Tạo ví của tôi" });
  await pw.fill("matkhau123");
  await expect(page.getByText("Còn 2 điều kiện chưa đạt.")).toBeVisible();
  await expect(create).toBeDisabled();
  // Nút con mắt: hiện / ẩn mật khẩu
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Hiện mật khẩu" }).first().click();
  await expect(pw).toHaveAttribute("type", "text");
  // Mật khẩu mạnh nhưng nhập lại sai → báo chưa khớp
  await pw.fill("MatKhau@2026");
  await page.getByLabel("Nhập lại mật khẩu").fill("MatKhau@2025");
  await expect(page.getByText("Hai mật khẩu chưa khớp").first()).toBeVisible();
  await expect(create).toBeDisabled();
  await page.getByLabel("Nhập lại mật khẩu").fill("MatKhau@2026");
  await expect(page.getByText("✓ Hai mật khẩu đã khớp")).toBeVisible();
  await create.click();
  await page.getByLabel("Email").fill(`an-${Date.now()}@giongque.vn`);
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();

  await page.getByRole("button", { name: "Đọc & ký đồng thuận" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("khớp đúng mã băm")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/consent-dialog.png` });
  await expectAccessible(page, "consent-dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Ký đồng thuận (miễn phí)" }).click();
  await page.waitForURL(/\/record$/, { timeout: 60_000 });

  await page.getByRole("button", { name: "Nhận câu và bắt đầu ghi âm" }).click();
  await expect(page.getByRole("button", { name: "Dừng & gửi" })).toBeEnabled({ timeout: 20_000 });
  // "Dừng" bật ở giây 1,5; đọc xong câu (~2,7 giây giọng nói) thì dừng ngay như người dùng thật
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/recording.png` });
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "Dừng & gửi" }).click();
  await expect(page.getByRole("heading", { name: /Tuyệt vời|chờ người duyệt|chưa đạt/ })).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${SHOTS}/qc-result.png`, fullPage: true });
  await expectAccessible(page, "qc-result");
  await expect(page.getByRole("heading", { name: "Tuyệt vời! Bản ghi đã được ghi nhận" })).toBeVisible();
});

test("người mua: kết nối ví, nhận mUSDC thử, phê duyệt và mua license", async ({ browser }) => {
  const { page, ctx, errors } = await role(browser, ANVIL.labx);
  await page.goto(`/datasets/${campaignId}`);
  await page.getByLabel("Mua bộ dữ liệu").getByRole("button", { name: "Kết nối ví" }).click();
  const buy = page.getByRole("button", { name: /^Mua license/ });
  if (await page.getByRole("button", { name: "Nhận mUSDC thử nghiệm" }).isVisible()) {
    await page.getByRole("button", { name: "Nhận mUSDC thử nghiệm" }).click();
  }
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(page.getByText("Bạn đã có license")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/bought.png`, fullPage: true });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("người đóng góp: xem thu nhập và rút tiền qua relayer", async () => {
  const { page } = contributor;
  // Điều hướng trong ứng dụng (tải lại trang sẽ khóa ví — khóa giải mã chỉ nằm trong bộ nhớ)
  await page.getByRole("navigation", { name: "Khu vực người đóng góp" }).getByRole("link", { name: "Thu nhập" }).click();
  await page.getByRole("button", { name: "Rút tiền" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Ký & rút/ }).click();
  await expect(page.getByText("Đã rút tiền về ví")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/claimed.png` });
  await expectAccessible(page, "claim-dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().click();
});

test("quản trị: công bố phiên bản dataset", async ({ browser }) => {
  const { page, ctx } = await role(browser);
  await page.goto("/admin");
  await page.getByLabel("Admin key").fill("local-admin-key");
  await page.getByRole("button", { name: "Vào bảng điều khiển" }).click();
  await page.getByRole("tab", { name: "Phiên bản dataset" }).click();
  await page.getByRole("listitem").filter({ hasText: `#${campaignId} ·` }).getByRole("button", { name: "Công bố phiên bản mới" }).click();
  await expect(page.getByText(/Đã công bố phiên bản v\d+/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Relayer & giao dịch" }).click();
  await expect(page.getByText("Giao dịch gần đây")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/admin.png`, fullPage: true });
  await expectAccessible(page, "admin");
  await ctx.close();
});

test("người mua: tải phiên bản dataset từ thư viện", async ({ browser }) => {
  const { page, ctx } = await role(browser, ANVIL.labx);
  await page.goto("/library");
  await page.getByRole("main").getByRole("button", { name: "Kết nối ví" }).click();
  // Thẻ của đúng chiến dịch vừa tạo (thư viện có thể chứa license của các lần chạy trước)
  const card = page
    .getByRole("main")
    .locator("div")
    .filter({ has: page.locator(`a[href="/datasets/${campaignId}"]`) })
    .filter({ has: page.getByRole("button", { name: "Tải phiên bản mới nhất" }) })
    .last();
  await expect(card.getByText(/Phiên bản v\d+: 1 bản ghi/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), card.getByRole("button", { name: "Tải phiên bản mới nhất" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^dataset-campaign\d+-v\d+\.zip$/);
  await page.screenshot({ path: `${SHOTS}/library.png`, fullPage: true });
  await expectAccessible(page, "library");
  await ctx.close();
});

test("người đóng góp: thu hồi đồng thuận một bản ghi", async () => {
  const { page, ctx } = contributor;
  await page.getByRole("navigation", { name: "Khu vực người đóng góp" }).getByRole("link", { name: "Bản ghi của tôi" }).click();
  await page.getByRole("button", { name: "Thu hồi" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Thu hồi bản ghi này" }).click();
  await expect(page.getByText("Đã thu hồi đồng thuận")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/revoked.png` });
  await page.getByRole("dialog").getByRole("button", { name: "Xong" }).click();
  await expect(page.getByText("Đã thu hồi").first()).toBeVisible();
  await ctx.close();
});
