import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ANVIL, RPC, decryptKeystoreV3, installAnvilWallet, installKeyWallet, installUnauthorizedWallet } from "./anvil-wallet";

/** axe WCAG 2.2 AA ở các trạng thái chỉ có sau khi đăng nhập / mở hộp thoại. */
async function expectAccessible(page: Page, label: string) {
  await page.waitForTimeout(500);
  // nút Google do Google tự vẽ — xem GOOGLE_BUTTON trong a11y.spec.ts
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("[data-google-button]").analyze();
  const v = r.violations.map((x) => `${label}: ${x.id} (${x.impact}) ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(v, v.join(" || ")).toEqual([]);
}

// Luồng nghiệp vụ thật trên Anvil + backend + QC thật. Chạy tuần tự, các vai trò dùng context riêng.
test.describe.configure({ mode: "serial" });

const PROMPT = "cho tôi hỏi lãi suất gửi tiết kiệm hiện nay là bao nhiêu"; // khớp fixture micro
const SHOTS = "e2e/.results/screens";
const WALLET_PASSWORD = "MatKhau@2026";
let campaignId = -1;
let contributor: { ctx: BrowserContext; page: Page };
let contributorEmail = "";

/** Số dư ETH (phí mạng) đọc thẳng từ Anvil: nền tảng trả phí hộ nên ví người dùng không được giảm. */
async function ethBalance(request: APIRequestContext, address: string): Promise<bigint> {
  const r = await request.post(RPC, { data: { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] } });
  return BigInt((await r.json()).result);
}

async function role(browser: Browser, account?: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Robot không đăng nhập Google được ⇒ bật khung "Đăng nhập thử" (ẩn với người dùng, chỉ có khi backend chạy local).
  await ctx.addInitScript(() => localStorage.setItem("datasetmarketplace.devLogin", "1"));
  if (account) await installAnvilWallet(ctx, account);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

/**
 * Đăng nhập bằng Gmail (dev login) qua nút "Đăng nhập" trong `where`. Ví đi theo Gmail: email đã gắn ví (vd. CLI demo
 * `datasetmarketplace login --as <tên>` chạy trước, cùng email <tên>@datasetmarketplace.local) thì vào thẳng và web tự kết nối đúng ví;
 * lần đầu thì kết nối ví giả của test rồi ký gắn ví với email.
 */
async function login(page: Page, email: string, where: Locator = page.getByRole("main")) {
  await where.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Đăng nhập thử" }).click();
  // Hoặc hộp đóng (email đã gắn ví), hoặc chuyển sang bước "Gắn ví với Gmail" (lần đầu)
  await page.waitForFunction(() => !document.querySelector("dialog[open]") || document.body.innerText.includes("Liên kết ví"), undefined, { timeout: 30_000 });
  if (await dialog.getByRole("heading", { name: "Liên kết ví" }).isVisible()) {
    await dialog.getByRole("button", { name: "Kết nối MetaMask / Core" }).click();
    await dialog.getByRole("button", { name: "Ký & gắn ví này" }).click();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });
}

test("người tạo: kết nối ví, đăng nhập, tạo chiến dịch có quỹ mồi qua wizard", async ({ browser, request }) => {
  await request.post("http://127.0.0.1:8000/demo/faucet", { data: { address: ANVIL.creator, amount_usdc: 100 } });
  const { page, ctx, errors } = await role(browser, ANVIL.creator);
  await page.goto("/create");
  // Nút ở header là "Đăng nhập" (Gmail), không còn nút "Kết nối ví" riêng
  await expect(page.getByRole("banner").getByRole("button", { name: "Đăng nhập", exact: true })).toBeVisible();
  // Cùng email với CLI (`datasetmarketplace login --as creator`): một ví chỉ gắn một email, nên CLI demo và e2e
  // chạy chung một database (vd. Neon) theo thứ tự nào cũng được.
  await login(page, "creator@datasetmarketplace.local");
  await expect(page.getByRole("link", { name: "+ Tạo chiến dịch mới" })).toBeVisible();
  // Header hiện Gmail đang đăng nhập (ví đi theo Gmail)
  await expect(page.getByRole("button", { name: "Tài khoản creator@datasetmarketplace.local" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/creator-dashboard.png`, fullPage: true });

  await page.getByRole("link", { name: "+ Tạo chiến dịch mới" }).click();
  await page.getByLabel("Tên chiến dịch").fill("E2E – Giọng miền Nam ngân hàng");
  await page.getByLabel("Mô tả cho người đóng góp và người mua").fill("Chiến dịch kiểm thử end-to-end từ giao diện web.");
  await page.getByLabel("Mục đích sử dụng dữ liệu").fill("Kiểm thử luồng nghiệp vụ");
  await page.getByRole("button", { name: "Tiếp tục →" }).click();
  // Nhập bộ câu mẫu từ file .txt (CRLF + BOM như file soạn trên Windows) — đọc ngay trên trình duyệt
  await page.locator('input[type="file"][name="prompts-file"]').setInputFiles({ name: "cau-mau.txt", mimeType: "text/plain", buffer: Buffer.from(`﻿${PROMPT}\r\n`, "utf8") });
  await expect(page.getByText("Đã nhập câu mẫu từ file")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Câu mẫu \(1 câu\)/ })).toHaveValue(PROMPT);
  await page.getByRole("button", { name: "Tiếp tục →" }).click();
  await page.getByRole("button", { name: "Tiếp tục →" }).click(); // điều khoản mẫu
  // "0.01" giờ là số thập phân (36 giây), không phải "001" = 1 giờ
  await page.getByLabel("Mục tiêu (giờ giọng nói)").fill("0.01");
  await expect(page.getByText("= 36 giây")).toBeVisible();
  await page.getByLabel("Quỹ mồi (VNĐ, tùy chọn)").fill("260000");
  await page.getByRole("button", { name: "Tiếp tục →" }).click();
  // Hóa đơn bằng VNĐ: quỹ mồi + phí xử lý (đã gồm phí mạng nền tảng trả hộ) = tổng trừ từ ví
  const bill = page.getByLabel("Hóa đơn tạo chiến dịch");
  await expect(bill.getByText("Phí xử lý")).toBeVisible();
  await expect(bill.getByText("≈ 13.000 ₫")).toBeVisible();
  await expect(bill.getByText("≈ 273.000 ₫")).toBeVisible();
  await expect(page.getByText("Ký cho phép trừ quỹ mồi + phí xử lý (miễn phí)")).toBeVisible();
  // Toast "Đã nhập câu mẫu từ file" (5 giây) có thể đang mờ dần đúng lúc này: đợi nó biến mất hẳn rồi mới quét axe,
  // nếu không chữ bán trong suốt bị tính là thiếu tương phản (lỗi canh thời gian, không phải lỗi giao diện).
  await expect(page.getByText("Đã nhập câu mẫu từ file")).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/creator-review.png`, fullPage: true });
  await expectAccessible(page, "creator-review");
  const eth0 = await ethBalance(request, ANVIL.creator);
  await page.getByRole("button", { name: "Ký & tạo chiến dịch" }).click();
  await page.waitForURL(/\/datasets\/\d+$/, { timeout: 90_000 });
  campaignId = Number(page.url().split("/").pop());
  await expect(page.getByRole("heading", { name: "E2E – Giọng miền Nam ngân hàng" })).toBeVisible();
  expect(await ethBalance(request, ANVIL.creator)).toBe(eth0); // chỉ ký, không tốn phí mạng
  expect(errors).toEqual([]);
  await ctx.close();
});

test("người đóng góp: tạo ví, đăng nhập, ký đồng thuận, ghi âm qua micro, QC thật đạt", async ({ browser }) => {
  const r = await role(browser);
  contributor = r;
  const { page } = r;
  await page.goto(`/earn/campaigns/${campaignId}`);
  await page.screenshot({ path: `${SHOTS}/onboarding.png`, fullPage: true });
  // Đăng nhập Gmail TRƯỚC; email mới chưa gắn ví ⇒ bước gắn ví
  contributorEmail = `an-${Date.now()}@datasetmarketplace.vn`;
  const main = page.getByRole("main");
  await main.getByLabel("Email").fill(contributorEmail);
  await main.getByRole("button", { name: "Đăng nhập thử" }).click();
  await expect(main.getByRole("heading", { name: "Liên kết ví" })).toBeVisible();
  // Hai lựa chọn ví: MetaMask/Core hoặc tạo ví trên trình duyệt (cơ bản)
  await expect(main.getByRole("button", { name: "Kết nối MetaMask / Core" })).toBeVisible();
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
  await pw.fill(WALLET_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu").fill("MatKhau@2025");
  await expect(page.getByText("Hai mật khẩu chưa khớp").first()).toBeVisible();
  await expect(create).toBeDisabled();
  await page.getByLabel("Nhập lại mật khẩu").fill(WALLET_PASSWORD);
  await expect(page.getByText("✓ Hai mật khẩu đã khớp")).toBeVisible();
  await create.click(); // tạo ví rồi ký gắn ví với Gmail ngay

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
  await expect(page.getByRole("heading", { name: /Tuyệt vời|chờ chủ chiến dịch duyệt|chưa đạt/ })).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${SHOTS}/qc-result.png`, fullPage: true });
  await expectAccessible(page, "qc-result");
  await expect(page.getByRole("heading", { name: "Tuyệt vời! Bản ghi đã được ghi nhận" })).toBeVisible();
});

test("người đóng góp: tải file sao lưu, nạp vào MetaMask và nâng cấp (cùng địa chỉ ví)", async () => {
  const { page, ctx } = contributor;
  await page.getByRole("navigation", { name: "Khu vực người đóng góp" }).getByRole("link", { name: "Tổng quan" }).click();
  await expect(page.getByText("Chưa sao lưu ví")).toBeVisible();
  await page.getByRole("button", { name: "Tải file sao lưu" }).click();
  const dialog = page.getByRole("dialog");
  // Sai mật khẩu: không xuất file
  await dialog.getByLabel("Mật khẩu ví").fill("SaiMatKhau@1");
  await dialog.getByRole("button", { name: "Tải file ví" }).click();
  await expect(dialog.getByText("Sai mật khẩu ví")).toBeVisible();
  await dialog.getByLabel("Mật khẩu ví").fill(WALLET_PASSWORD);
  await expectAccessible(page, "backup-dialog");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), dialog.getByRole("button", { name: "Tải file ví" }).click()]);
  const name = download.suggestedFilename();
  expect(name).toMatch(/^vi-datasetmarketplace-0x[0-9a-fA-F]{40}\.json$/);
  const walletAddress = name.slice("vi-datasetmarketplace-".length, -".json".length);
  // Giải file bằng cài đặt độc lập (Node crypto) như MetaMask: đúng chuẩn V3, đúng mật khẩu, đúng địa chỉ ví
  const { privateKey, address } = decryptKeystoreV3(await readFile((await download.path())!, "utf8"), WALLET_PASSWORD);
  expect(address).toBe(walletAddress);
  await expect(dialog.getByText(/✓ Đã tải file lúc/)).toBeVisible();
  await dialog.getByRole("button", { name: "Đóng" }).first().click();
  await expect(page.getByText(/✓ Đã tải file sao lưu lúc/)).toBeVisible();

  // "Nạp file vào MetaMask": ví giả lập ký bằng chính khóa giải ra từ file. Tải lại trang ⇒ ví trình duyệt bị khóa.
  await installKeyWallet(ctx, privateKey);
  await page.reload();
  await page.getByLabel("Mật khẩu ví").fill(WALLET_PASSWORD);
  await page.getByRole("button", { name: "Mở khóa" }).click();
  await page.getByRole("button", { name: "Nâng cấp lên MetaMask" }).click();
  await expect(page.getByRole("dialog").getByText("JSON File")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/upgrade-dialog.png` });
  await expectAccessible(page, "upgrade-dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Kết nối MetaMask" }).click();
  await expect(page.getByText("Đã chuyển sang MetaMask")).toBeVisible();
  // Cùng địa chỉ ⇒ dùng tiếp phiên đăng nhập cũ, không phải đăng nhập lại; thẻ sao lưu ẩn đi
  // Khung Kiếm tiền chỉ ghi loại ví (không hiện mã ví); địa chỉ nằm ở data-wallet để test đối chiếu cùng ví sau nâng cấp
  const kind = page.getByTestId("earn-wallet-kind");
  await expect(kind).toHaveText("MetaMask");
  expect((await kind.getAttribute("data-wallet"))?.toLowerCase()).toBe(walletAddress.toLowerCase());
  await expect(page.getByRole("button", { name: "Tải file sao lưu" })).toHaveCount(0);
});

test("Gmail gắn ví khác ví MetaMask đang chọn: đăng nhập vẫn được, trang hướng dẫn chọn / nạp đúng ví", async ({ browser }) => {
  const { page, ctx } = await role(browser, ANVIL.labx);
  await page.goto("/create");
  // Gmail của người đóng góp đã gắn ví trình duyệt (ở "máy" khác) — MetaMask ở đây là ví labx
  await login(page, contributorEmail);
  const notice = page.getByRole("alert").filter({ hasText: "MetaMask đang chọn ví khác" });
  await expect(notice).toBeVisible();
  await expect(notice.getByText("nạp ví đó vào MetaMask", { exact: false })).toBeVisible();
  await expect(notice.getByRole("button", { name: "Chọn tài khoản trong MetaMask" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Tạo chiến dịch mới" })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/email-bound.png` });
  await expectAccessible(page, "email-bound");
  await ctx.close();
});

test("ví từ chối ký (MetaMask khóa / tài khoản chưa cấp quyền): báo lỗi tiếng Việt, không lộ tiếng Anh", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("datasetmarketplace.devLogin", "1"));
  await installUnauthorizedWallet(ctx, ANVIL.labx);
  const page = await ctx.newPage();
  await page.goto("/create");
  await page.getByRole("main").getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("vi-tu-choi@vidu.vn");
  await dialog.getByRole("button", { name: "Đăng nhập thử" }).click();
  // Lần đầu: gắn ví — ví từ chối ký thông điệp xác nhận
  await dialog.getByRole("button", { name: "Kết nối MetaMask / Core" }).click();
  await dialog.getByRole("button", { name: "Ký & gắn ví này" }).click();
  await expect(dialog.getByText("Ví từ chối vì trang chưa được phép dùng tài khoản này", { exact: false })).toBeVisible();
  await expect(page.getByText("has not been authorized", { exact: false })).toHaveCount(0);
  await ctx.close();
});

test("phiên đăng nhập cũ (database đã reset) bị xóa: trang tạo chiến dịch hỏi đăng nhập lại", async ({ browser }) => {
  const { page, ctx, errors } = await role(browser, ANVIL.labx);
  // Phiên còn hạn trong trình duyệt nhưng máy chủ không nhận (như sau reset-local) -> /auth/me trả 401
  await ctx.addInitScript((addr) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem("datasetmarketplace.sessions.v1", JSON.stringify({ [addr.toLowerCase()]: { token: "phien.cu.khong-hop-le", expiresAt: exp, email: "cu@vidu.vn", address: addr } }));
    localStorage.setItem("datasetmarketplace.activeAccount.v1", addr.toLowerCase());
  }, ANVIL.labx);
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Đăng nhập để tạo chiến dịch" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Tạo chiến dịch mới" })).toHaveCount(0);
  // Giao diện đổi trước, localStorage được ghi lại ngay sau đó ⇒ chờ thay vì đọc một lần
  await expect.poll(() => page.evaluate(() => localStorage.getItem("datasetmarketplace.sessions.v1"))).toBe("{}");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("datasetmarketplace.activeAccount.v1"))).toBeNull();
  expect(errors).toEqual([]);
  await ctx.close();
});

test("người mua: kết nối ví, nhận mUSDC thử, ký cho phép + mua (nền tảng trả phí mạng)", async ({ browser, request }) => {
  const { page, ctx, errors } = await role(browser, ANVIL.labx);
  await page.goto(`/datasets/${campaignId}`);
  // Cùng email với CLI (`datasetmarketplace login --as labx`) để chạy được theo thứ tự nào cũng được
  await login(page, "labx@datasetmarketplace.local", page.getByLabel("Mua bộ dữ liệu"));
  const buy = page.getByRole("button", { name: /^Mua license/ });
  if (await page.getByRole("button", { name: "Nhận mUSDC thử nghiệm" }).isVisible()) {
    await page.getByRole("button", { name: "Nhận mUSDC thử nghiệm" }).click();
  }
  await expect(buy).toBeEnabled();
  // Hóa đơn: giá + phí xử lý (đã gồm phí mạng) = tổng thanh toán, tất cả bằng VNĐ
  const bill = page.getByLabel("Hóa đơn mua");
  await expect(bill.getByText("Phí xử lý")).toBeVisible();
  await expect(bill.getByText("≈ 13.000 ₫")).toBeVisible();
  await expect(bill.getByText("Tổng thanh toán")).toBeVisible();
  const eth0 = await ethBalance(request, ANVIL.labx);
  await buy.click();
  await expect(page.getByText("Bạn đã có license")).toBeVisible({ timeout: 60_000 });
  expect(await ethBalance(request, ANVIL.labx)).toBe(eth0);
  await page.screenshot({ path: `${SHOTS}/bought.png`, fullPage: true });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("người tạo: rút phần doanh thu chỉ bằng chữ ký (phí xử lý trừ vào số rút)", async ({ browser, request }) => {
  const { page, ctx, errors } = await role(browser, ANVIL.creator);
  await page.goto("/create");
  await login(page, "creator@datasetmarketplace.local"); // đã gắn ví ⇒ vào thẳng, web tự kết nối đúng ví
  // Menu tài khoản gọn: số dư, Cài đặt, Đăng xuất; Cài đặt đổi tên hiển thị + ảnh đại diện (lưu ở máy chủ)
  await page.getByRole("button", { name: "Tài khoản creator@datasetmarketplace.local" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByText("Số dư")).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["Cài đặt", "Đăng xuất"]);
  await menu.getByRole("menuitem", { name: "Cài đặt" }).click();
  const settings = page.getByRole("dialog");
  await settings.getByLabel("Tên hiển thị").fill("Nhà tạo E2E");
  await settings.locator('label[title="Biển"]').click(); // bấm ảnh đại diện nhìn thấy được (ô radio ẩn cho trình đọc màn hình)
  await expect(settings.getByLabel("Biển")).toBeChecked();
  await expectAccessible(page, "account-settings");
  await settings.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu cài đặt")).toBeVisible();
  await expect(page.getByRole("banner").getByText("Nhà tạo E2E").first()).toBeVisible();
  const withdraw = page.getByRole("button", { name: "Rút về ví" });
  await expect(withdraw).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByText(/Phí xử lý ≈ 2\.600 ₫/)).toBeVisible();
  const eth0 = await ethBalance(request, ANVIL.creator);
  await withdraw.click();
  await expect(page.getByText("Đã rút phần doanh thu về ví")).toBeVisible({ timeout: 60_000 });
  await expect(withdraw).toBeDisabled();
  expect(await ethBalance(request, ANVIL.creator)).toBe(eth0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("người đóng góp (đã nâng cấp lên MetaMask): rút tiền qua relayer, ký bằng MetaMask", async () => {
  const { page } = contributor;
  await expect(page.getByTestId("earn-wallet-kind")).toHaveText("MetaMask");
  await page.getByRole("navigation", { name: "Khu vực người đóng góp" }).getByRole("link", { name: "Thu nhập" }).click();
  await page.getByRole("button", { name: "Rút tiền" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Ký & rút/ }).click();
  await expect(page.getByText("Đã rút tiền về ví")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/claimed.png` });
  await expectAccessible(page, "claim-dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Đóng" }).first().click();
});

test("chủ chiến dịch: xem bản tóm tắt rồi ký công bố phiên bản dataset (không có admin)", async ({ browser, request }) => {
  const { page, ctx, errors } = await role(browser, ANVIL.creator);
  await page.goto("/create");
  await login(page, "creator@datasetmarketplace.local");
  // Thẻ của đúng chiến dịch vừa tạo (bảng điều khiển có thể chứa chiến dịch của các lần chạy trước)
  const card = page
    .getByRole("main")
    .locator("div")
    .filter({ has: page.locator(`a[href="/datasets/${campaignId}"]`) })
    .filter({ has: page.getByRole("heading", { name: "Phiên bản dataset" }) })
    .last();
  await expect(card.getByRole("heading", { name: "Bản ghi chờ bạn duyệt" })).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Công bố phiên bản mới" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Công bố phiên bản v\d+/ })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("Số bản ghi")).toBeVisible();
  await expectAccessible(page, "publish-dialog");
  const eth0 = await ethBalance(request, ANVIL.creator);
  await dialog.getByRole("button", { name: "Ký & công bố" }).click();
  await expect(page.getByText(/Đã công bố phiên bản v\d+/)).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText(/Đang phát hành v\d+/)).toBeVisible({ timeout: 30_000 });
  expect(await ethBalance(request, ANVIL.creator)).toBe(eth0); // chủ chiến dịch chỉ ký, nền tảng trả phí mạng
  await page.screenshot({ path: `${SHOTS}/creator-publish.png`, fullPage: true });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("người mua: tải phiên bản dataset từ thư viện", async ({ browser }) => {
  const { page, ctx } = await role(browser, ANVIL.labx);
  await page.goto("/library");
  await login(page, "labx@datasetmarketplace.local");
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

test("người đóng góp (MetaMask): thu hồi đồng thuận một bản ghi", async () => {
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
