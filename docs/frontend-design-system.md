# Dataset Marketplace — Frontend design system

Phong cách: **Modern Minimalist + Soft Fintech + Friendly SaaS + Smooth Motion**. Light mode là giao diện chính.
Nguồn sự thật của token: [`frontend/app/globals.css`](../frontend/app/globals.css) (Tailwind CSS v4, khối `@theme`).
Component dùng chung: [`frontend/components/`](../frontend/components). Tính năng theo vai trò: [`frontend/features/`](../frontend/features).

---

Tên thương hiệu hiển thị: `frontend/lib/brand.ts` (`BRAND.name`, `BRAND.wordmark` cho logo hai màu). Văn bản giao diện
nói về nền tảng dùng từ trung tính "nền tảng" để đổi tên không phải sửa nhiều nơi.

## 1. Design tokens

### Màu sắc

| Nhóm | Token (utility Tailwind) | Giá trị | Dùng cho |
|---|---|---|---|
| Nền | `canvas` | `#F8FAFC` | Nền trang |
| | `surface` / `surface-muted` | `#FFFFFF` / `#F1F5F9` | Thẻ, ô nhập / vùng phụ, skeleton |
| Viền | `line` / `line-strong` | `#E2E8F0` / `#CBD5E1` | Viền thẻ, đường chia / hover viền |
| Chữ | `ink` | `#0F172A` | Tiêu đề, nội dung chính |
| | `ink-soft` | `#334155` | Đoạn dẫn (`text-lead`), nhãn |
| | `ink-muted` | `#556275` | Chú thích, thông tin phụ (≈6:1 trên trắng; ≥4,5:1 trên nền xanh nhạt — đã kiểm bằng axe) |
| Thương hiệu | `primary` · `primary-hover` · `primary-active` | `#2563EB` · `#1D4ED8` · `#1E40AF` | Nút chính, liên kết, trạng thái chọn |
| | `primary-soft` / `primary-line` | `#EFF6FF` / `#BFDBFE` | Nền chọn (tab, nav), thẻ "soft" |
| | `cyan` / `cyan-ink` / `cyan-soft` | `#06B6D4` / `#0E7490` / `#ECFEFF` | Điểm nhấn thứ hai, cuối gradient; chữ trên nền cyan nhạt |
| | `peach` / `peach-ink` / `peach-soft` | `#FDBA74` / `#9A3412` / `#FFF7ED` | Tiền, quỹ mồi, phần người tạo |
| | `mint` | `#ECFDF5` | Nền tích cực nhẹ |
| Trạng thái | `success` / `-ink` / `-soft` | `#059669` / `#047857` / `#ECFDF5` | Đạt QC, giao dịch xong, license |
| | `warning` / `-ink` / `-soft` | `#D97706` / `#B45309` / `#FFFBEB` | Vùng xám, chờ, mạng thử nghiệm |
| | `danger` / `-ink` / `-soft` | `#DC2626` / `#B91C1C` / `#FEF2F2` | Lỗi, thu hồi, đang ghi âm |

Quy tắc: chữ trên nền màu luôn dùng biến thể `-ink` (không dùng `cyan`/`peach` làm màu chữ). Gradient chỉ dùng
`primary → cyan` trên diện tích nhỏ (nút micro, thanh tiến độ, thẻ nổi bật); nền trang dùng `bg-hero` (ba radial
gradient độ mờ 12–18%). Không dùng màu neon hay gradient đậm diện rộng.

### Typography — Be Vietnam Pro

Nạp bằng `next/font/google` (subset `vietnamese` + `latin`, weight 400/500/600/700, `display: swap`) — font thiết kế
cho tiếng Việt nên dấu thanh không bị chồng/cắt. Số dùng `tabular` (`font-variant-numeric: tabular-nums`) để tiền và
đồng hồ không nhảy.

| Utility | Cỡ | Weight / line-height | Dùng |
|---|---|---|---|
| `text-display` | `clamp(2.25rem → 3.75rem)` | 700 / 1.08, letter-spacing −0.03em | Hero |
| `text-h1` | `clamp(1.75rem → 2.5rem)` | 700 / 1.15 | Tiêu đề trang |
| `text-h2` | `clamp(1.5rem → 2rem)` | 700 / 1.2 | Tiêu đề section |
| `text-h3` | `1.25rem` | 600 / 1.3 | Tiêu đề thẻ |
| `text-lead` | `1.125rem` | 400 / 1.7, `ink-soft` | Đoạn dẫn |
| body | `1rem` | 400 / 1.6 | Nội dung |
| `text-label` | `0.875rem` | 600, `ink-soft` | Nhãn form |
| `text-caption` | `0.8125rem` | 400 / 1.5, `ink-muted` | Chú thích |
| nút | `0.875–1rem` | 600 | Button |

Tiêu đề dùng `text-wrap: balance`, đoạn văn `text-wrap: pretty`. Không viết hoa toàn bộ.

### Khoảng cách, bo góc, đổ bóng

- Container: `container-page` (max 76rem, gutter 16/24/32px theo breakpoint).
- Nhịp section: `py-20 sm:py-28` (landing), `pb-8 pt-8 sm:pt-12` (đầu trang).
- Bo góc: `--radius-card` 1.25rem (thẻ), `--radius-control` 0.75rem (nút, ô nhập), 1.5–1.75rem cho panel lớn/hộp thoại, `rounded-full` cho badge.
- Đổ bóng: `--shadow-soft` (mặc định thẻ), `--shadow-lift` (hover, toast, menu), `--shadow-ring` (focus của control).

### Chuyển động

| Token | Giá trị | Dùng |
|---|---|---|
| `--ease-soft` | `cubic-bezier(.22,1,.36,1)` | Mọi chuyển động vào/hover |
| `--ease-standard` | `cubic-bezier(.4,0,.2,1)` | Lặp, trạng thái |
| `--duration-micro` | 180ms | Nhấn nút, đổi màu, copy |
| `--duration-hover` | 240ms | Hover thẻ, viền |
| `--duration-page` | 360ms | Chuyển trang |
| `--duration-reveal` | 520ms | Xuất hiện khi cuộn |

---

## 2. Nguyên tắc animation

- **Chuyển trang:** React `<ViewTransition>` (Next.js 16 + View Transitions API) qua `PageTransition` đặt trong từng
  `page.tsx` (không đặt ở layout vì layout không unmount). Trang cũ mờ đi 180ms, trang mới nổi lên 12px trong 360ms.
  Header/footer không chuyển động. Trình duyệt không hỗ trợ: đổi trang tức thì, không lỗi.
- **Scroll reveal:** `Reveal` (motion `whileInView`, `once`, 15% diện tích) — mờ + trượt 18px, 520ms, so le 50–80ms.
  Chỉ dùng cho section landing và thẻ thống kê; không dùng trong form hay danh sách dữ liệu.
- **Micro-interaction:** nút `active:scale-[0.97]`; thẻ hover nhấc 2–4px + `shadow-lift`; nav/tab có "pill" trượt
  bằng `layoutId`; nút copy đổi icon có spring; dấu ✓ giao dịch vẽ bằng `pathLength`.
- **Số liệu:** `AnimatedNumber` chạy mềm 800ms khi tiền/giây/tiến độ thay đổi; thanh tiến độ dùng `scaleX` (không reflow).
- **Âm thanh:** `LiveWaveform` vẽ canvas 30 fps từ `AnalyserNode` của micro thật; `AudioPlayer` vẽ sóng từ đỉnh
  của chính file audio (không vẽ sóng giả).
- **Giao dịch:** `TxSteps` hiển thị từng bước "Chờ bạn xác nhận trong ví → Đang xác nhận trên Avalanche → Hoàn tất / lỗi
  đã giải mã", có mã giao dịch và liên kết Snowtrace (Fuji/mainnet).
- **Hiệu năng:** chỉ animate `transform`/`opacity`; không parallax; vòng lặp vô hạn chỉ có ở sóng hero, chấm "đang ghi" và
  thanh đang kiểm tra (trạng thái chờ thật).
- **`prefers-reduced-motion`:** `MotionConfig reducedMotion="user"` cho motion; CSS rút mọi animation/transition còn
  0,01ms và 1 lần lặp; chuyển trang chỉ còn fade; `LiveWaveform` chỉ hiện thanh mức âm lượng. Đã có test tự động:
  không còn animation lặp vô hạn khi bật reduced motion.

---

## 3. Components

| Component | File | Biến thể / kích thước | Trạng thái | Accessibility |
|---|---|---|---|---|
| `Button`, `ButtonLink` | `components/ui/button.tsx` | `primary` · `secondary` · `outline` · `ghost` · `danger`; `sm` · `md` · `lg` | hover, active (scale), focus ring, disabled, loading (`aria-busy` + spinner) | `<button type="button">` mặc định; vùng chạm ≥ 36px (sm) / 44px (md) |
| `Input`, `Textarea`, `Select`, `Field` | `components/ui/field.tsx` | — | hover, focus ring, disabled, lỗi (`aria-invalid` → viền đỏ) | `Field` tự nối `label[for]`, `aria-describedby` (gợi ý + lỗi) |
| `PasswordInput` | `components/ui/password-input.tsx` | — | ẩn/hiện bằng nút con mắt | Nút có `aria-label` "Hiện/Ẩn mật khẩu", `aria-pressed`, `aria-controls`; id/aria của `Field` chuyển thẳng xuống `<input>` |
| `PasswordRequirements` | `components/ui/password-input.tsx` | — | cập nhật theo từng ký tự: thanh độ mạnh 5 nấc (Rất yếu → Mạnh), mỗi điều kiện ✓/○ | Danh sách có nhãn "Yêu cầu mật khẩu", mỗi dòng có chữ "đã đạt/chưa đạt" cho trình đọc màn hình; mức độ mạnh `aria-live` |
| `Card`, `CardTitle` | `components/ui/card.tsx` | tone `default` · `soft` · `mint` · `peach`; padding `none`–`lg`; `interactive` | hover nhấc (interactive) | — |
| `Badge`, `CampaignStatusBadge`, `ContributionStatusBadge` | `components/ui/badge.tsx` | 7 tone, có/không chấm | — | Trạng thái luôn có chữ, không chỉ dựa vào màu |
| `Progress`, `ProgressRing` | `components/ui/progress.tsx` | `sm` · `md`; `primary` · `success` | animate khi giá trị đổi | `role="progressbar"` + `aria-valuenow` / ring `role="img"` + nhãn |
| `Dialog`, `ConfirmDialog` | `components/ui/dialog.tsx` | `sm` · `md` · `lg`; `dismissible` | vào/ra, khóa khi đang xử lý | `<dialog>` gốc + `showModal()`: bẫy focus, Esc, nền inert, `aria-labelledby/describedby` |
| `Tabs` | `components/ui/tabs.tsx` | có đếm số | pill trượt | WAI-ARIA tabs: ←/→/Home/End, roving `tabIndex` |
| Toast (`useToast`) | `providers/toast-provider.tsx` | success · error · info | vào/ra, tự đóng 5–8s | `aria-live="polite"`, lỗi `role="alert"`; nằm ở top layer (Popover API) để không bị hộp thoại che |
| `Skeleton`, `SkeletonCard`, `LoadingBlock` | `components/ui/states.tsx` | — | shimmer | `role="status"` + chữ cho screen reader |
| `EmptyState`, `ErrorState` | `components/ui/states.tsx` | có hành động / nút Thử lại | — | `ErrorState` là `role="alert"` |
| `AnimatedNumber`, `Reveal`, `CopyButton`, `Stepper`, `SectionHeading` | `components/ui/misc.tsx` | — | — | Stepper `aria-current="step"`; Copy đổi `aria-label` |
| `MoneyText` | `components/money.tsx` | `sm`–`xl` | — | VNĐ "≈" dòng chính, token dòng phụ |
| `AudioPlayer` | `components/audio/audio-player.tsx` | `src` công khai hoặc `load()` (blob cần phiên đăng nhập, vd. bản ghi chờ người tạo duyệt) | tải, phát, tua, lỗi | nút có nhãn "Phát/Tạm dừng …" |
| `LiveWaveform` | `components/audio/live-waveform.tsx` | — | reduced motion → thanh mức | `aria-hidden` (trạng thái do chữ/đồng hồ thể hiện) |
| `TxSteps`, `TxHash` | `components/tx/tx-steps.tsx` | — | idle · waiting · simulating · signing · pending · success · error | `aria-live="polite"` |
| `AccountMenu` (header) | `features/auth/account-menu.tsx` | — | chưa đăng nhập (nút **Đăng nhập**) · đã đăng nhập: ảnh đại diện + tên; menu chỉ có **số dư (VNĐ)**, **Cài đặt**, **Đăng xuất** (implementation-plan §3 #31) | menu `aria-haspopup`, Esc/đóng khi bấm ngoài; nút có `aria-label="Tài khoản <email>"` |
| `AccountSettings`, `Avatar` | `features/auth/account-settings.tsx`, `features/auth/profile.tsx` | ảnh đại diện: 8 mẫu (`--avatar-*` trong `globals.css`) + chữ cái đầu | tên hiển thị, chọn ảnh đại diện, ví liên kết (sao chép) | `Dialog`; ảnh đại diện là nhóm radio có nhãn; chữ trắng trên nền đủ tối |
| `LoginButton` + `LoginPanel` | `features/auth/login-button.tsx`, `login-panel.tsx` | `dialog` (header/các trang) · `earn` (gắn được ví trình duyệt) | Gmail → (lần đầu) Gắn ví với Gmail: MetaMask (kết nối → ký) hoặc ví trình duyệt (tạo / mở khóa) | `Dialog`; lỗi `role="alert"` |
| `WalletGate` / `WalletStatus` | `features/auth/wallet-status.tsx` | `compact` | chưa đăng nhập · ví trình duyệt (hướng dẫn nâng cấp) · chưa kết nối · chọn nhầm tài khoản · sai mạng | cảnh báo `role="alert"` |
| `WalletBackupCard` + hộp thoại file ví | `features/earn/wallet-backup.tsx` | `backup` (tải file) · `upgrade` (tải file → nạp vào MetaMask → kết nối) | chưa sao lưu (tone `peach`) · đã sao lưu (thời điểm) · sai mật khẩu · MetaMask chọn sai tài khoản | trạng thái `role="status"`; lỗi kết nối `role="alert"`; dùng `Dialog` + `PasswordInput` |
| `CampaignDataPanel` (hàng chờ duyệt + phiên bản dataset) | `features/creator/campaign-data.tsx` | trong thẻ mỗi chiến dịch ở `/create` | hàng chờ trống · thẻ bản ghi vùng xám (nghe, chỉ số QC, giờ tự duyệt, **Duyệt** / **Loại…** → hộp thoại bắt buộc lý do) · phiên bản: chưa công bố / đang phát hành / có dữ liệu mới / **đã khóa** (warning) → hộp thoại bản tóm tắt + `TxSteps` (ký → nền tảng gửi) | mỗi khu là `section` có tiêu đề; lý do loại dùng `Field` + `Textarea` (nút tắt tới khi có lý do); hộp thoại `Dialog` khóa khi đang ký |
| `BrowserWalletNotice` | `features/earn/bound-email-notice.tsx` | — | Gmail gắn ví trình duyệt nhưng trang cần MetaMask ⇒ hướng dẫn nâng cấp | `role="alert"`, chữ `warning-ink` trên `warning-soft` |
| `SiteHeader`, `SiteFooter`, `PageHeader`, `PageTransition` | `components/layout/` | header trong suốt → mờ kính khi cuộn; menu di động | — | Liên kết "Bỏ qua tới nội dung chính", `aria-current="page"` |

### Do / Don't

| ✅ Nên | ❌ Không |
|---|---|
| Hiển thị tiền bằng `MoneyText` (VNĐ "≈" + USDC phụ) | Hiển thị số USDC làm dòng chính cho người đóng góp |
| Dùng `TxSteps` cho mọi thao tác ký/gửi | Báo "thành công" trước khi có receipt / phản hồi relayer |
| Dùng `Field` cho mọi ô nhập | Dùng placeholder thay cho nhãn |
| Dùng `ErrorState` có nút Thử lại cho lỗi tải dữ liệu | Để trang trắng khi API lỗi |
| Đặt `PageTransition` trong `page.tsx` | Đặt `ViewTransition` ở layout |

---

## 4. Patterns

- **Form nhiều bước:** `Stepper` + `AnimatePresence` trượt ngang; kiểm tra từng bước (nút "Tiếp tục" tắt + lý do);
  bước cuối là "Xem trước & ký" kèm `TxSteps` (wizard tạo chiến dịch, onboarding người đóng góp).
- **Thao tác relayer** (đồng thuận, rút tiền, thu hồi): Dialog → ký trên thiết bị → "Nền tảng gửi lên Avalanche" → mã giao dịch.
- **Thao tác của người tạo / người mua** (tạo chiến dịch, mua, rút doanh thu, rút quỹ mồi): cũng chỉ ký — nền tảng trả phí
  mạng (implementation-plan §3 #25). `hooks/useSponsored.ts` → `useSponsoredFlow().run(lấy báo giá, gửi chữ ký)`: báo giá →
  "Ký cho phép trừ … (miễn phí)" (permit, chỉ khi hạn mức chưa đủ) → "Ký … (miễn phí)" → "Nền tảng gửi giao dịch và trả phí
  mạng" (kèm mã giao dịch, ghi chú "Không cần ETH/AVAX trong ví"); `flow.steps(labels)` cho `TxSteps`. Web không gửi giao
  dịch nào từ ví người dùng.
- **Hóa đơn trước khi ký** (bước "Xem trước & ký", khung mua, thẻ rút doanh thu): mọi dòng bằng VNĐ — khoản tiền (giá, quỹ
  mồi), **"Phí xử lý" — "đã gồm phí mạng nền tảng trả hộ"** (lấy từ `GET /fees` qua `useFees()`), **tổng trừ từ ví** và **số
  dư ví hiện có**; thiếu tiền thì nút ký tắt và (local/Fuji) hiện nút "Nhận mUSDC thử nghiệm". Chú thích chung
  `SPONSORED_NOTE`. Không còn ước tính gas bằng ETH/AVAX.
- **Đăng nhập Gmail, ví đi theo Gmail (§3 #27):** header là nút **Đăng nhập** (không có nút kết nối ví riêng). Lần đầu,
  `LoginPanel` chuyển sang "Gắn ví với Gmail": MetaMask (kết nối → "Ký & gắn ví này", "Chọn tài khoản khác") hoặc, ở `/earn`,
  ví trình duyệt (tạo mới / mở khóa). Các lần sau chỉ báo đăng nhập thành công; người dùng chủ động kết nối ví khi cần ký.
  Khi kết nối, hiển thị đầy đủ địa chỉ ví đã gắn với tài khoản; chọn ví khác thì chặn ký. Trang cần ký bằng MetaMask bọc trong
  `WalletGate`; `useAccountWallet()` trả trạng thái `disconnected | wrong-account | wrong-chain | ready` so với ví đã gắn.
- **Hai cấp ví ở /earn:** onboarding 3 bước **Đăng nhập → Ví của bạn → Bắt đầu** (`Stepper align="center"`). Ví đã gắn là ví
  trình duyệt trên máy này ⇒ mở khóa bằng mật khẩu (có lối "Dùng MetaMask / Core" nếu đã nâng cấp); không có trên máy ⇒ kết
  nối MetaMask đúng ví đó. `useContributor()` trả một `signer` chung nên các hộp thoại đồng thuận / rút tiền / thu hồi không
  phân biệt loại ví. Header khu vực hiện "Ví trình duyệt 0x…" hoặc "MetaMask 0x…".
- **Lỗi có hướng dẫn:** tình huống người dùng tự gỡ được (Gmail gắn ví trình duyệt nhưng trang cần MetaMask; MetaMask chọn nhầm
  tài khoản) hiện khung hướng dẫn ngay trong thẻ, kèm nút hành động, không chỉ toast.
- **Lỗi ví luôn tiếng Việt:** mọi `catch` ở luồng ví/ký/giao dịch hiển thị qua `describeChainError()` (`lib/chainErrors.ts`),
  không in `e.message` của viem/wagmi (tiếng Anh, nhiều dòng). Hàm duyệt chuỗi `cause` và dịch theo mã ví EIP-1193
  (4001 từ chối, 4100 ví khóa / tài khoản chưa cấp quyền, 4900/4901/4902 mạng, -32002 yêu cầu đang chờ), theo tên lỗi
  wagmi/viem (chưa kết nối, sai mạng, thiếu phí gas, lệch nonce, RPC) và theo tên lỗi hợp đồng; lỗi lạ hiện câu chung
  tiếng Việt và ghi chi tiết vào `console.warn`. Lỗi máy chủ (`ApiError`) vốn đã tiếng Việt nên giữ nguyên.
- **Nhập từ file:** nút `outline` "Nhập từ file .txt" cạnh tiêu đề, `<input type="file" hidden>`; đọc file trên trình duyệt, toast
  báo số dòng đã nhập, nội dung vẫn sửa được trong ô.
- **Danh sách dữ liệu:** lọc bằng `Tabs` + `Select`, tìm kiếm `useDeferredValue`, đổi bố cục bằng `layout` animation;
  thẻ "Nổi bật" nằm ngang phá nhịp lưới; mỗi bộ dữ liệu có "chữ ký sóng âm" riêng (tất định theo id).
- **Hành động chính trên di động:** thanh cố định đáy (trang dataset: giá + "Mua license").

- **Mật khẩu ví (tạo ví):** `PasswordInput` + `PasswordRequirements` luôn hiển thị; quy tắc ở `lib/password.ts` (≥ 8 ký tự,
  chữ hoa, chữ thường, chữ số, ký tự đặc biệt — kiểm tra Unicode nên chữ có dấu như "Ấ", "ê" được tính đúng); dòng trạng thái
  `role="status"` nói còn thiếu gì; ô nhập lại báo "đã khớp/chưa khớp"; nút chính tắt tới khi hợp lệ. `lib/browserWallet.ts`
  chặn lại lần nữa khi tạo ví. Mở khóa ví và tải file sao lưu chỉ dùng `PasswordInput` (không áp quy tắc).
  File sao lưu = keystore V3 (`lib/keystore.ts`) mã hóa bằng chính mật khẩu ví, tên `vi-datasetmarketplace-0x….json`.

## 5. Responsive

Mobile-first, breakpoint Tailwind mặc định (`sm` 640, `md` 768, `lg` 1024). Đã kiểm 375 · 390 · 768 · 1280 · 1440px trên
8 trang chính: **0px tràn ngang**, 0 lỗi console. Điều hướng chính chuyển sang menu thả xuống dưới `xl` (1280px — tên "Dataset Marketplace" dài nên từ 1024px menu đầy đủ sẽ bị xuống dòng); panel mua
chuyển từ cột phải dính (sticky) sang cuối trang + thanh hành động cố định đáy; lưới thẻ 1 → 2 → 3 cột.

## 6. Kiểm chứng (tự động, chạy thật)

| Kiểm tra | Lệnh | Kết quả gần nhất |
|---|---|---|
| WCAG 2.2 AA (axe-core) — 7 trang công khai | `npm run test:a11y` | 0 vi phạm |
| WCAG 2.2 AA tại 9 trạng thái sau đăng nhập (wizard, hộp thoại đồng thuận, kết quả QC, hộp thoại sao lưu ví, hộp thoại nâng cấp MetaMask, hướng dẫn `email_bound`, hộp thoại rút tiền, hộp thoại người tạo công bố phiên bản, thư viện) | `npm run test:e2e` | 0 vi phạm |
| Reduced motion, bàn phím (skip link, focus) | `npm run test:a11y` | đạt |
| Luồng nghiệp vụ trên trình duyệt (9 bước, 4 vai trò; người đóng góp nâng cấp từ ví trình duyệt lên MetaMask giữa luồng) | `npm run test:e2e` | đạt |

## 7. Audit token (theo skill `design:design-system`)

| Hạng mục | Định nghĩa | Giá trị viết cứng còn lại |
|---|---|---|
| Màu | 30 token | ~49 mã hex ngoài `globals.css`: phần lớn là thuộc tính SVG/canvas (logo, đường giá, vòng tiến độ, sóng micro) không nhận class Tailwind; còn lại là màu viền nhạt của badge/state và vài điểm dừng gradient |
| Bóng | 3 token | 10 bóng tùy biến (nút chính, nút micro, toast) |
| Typography | 8 utility | — |

Ưu tiên tiếp theo: (1) thêm token viền cho trạng thái (`success-line`, `warning-line`, `danger-line`) thay cho mã hex trong `badge.tsx`/`states.tsx`;
(2) cho SVG/canvas đọc màu qua `getComputedStyle(--color-primary)`; (3) gom bóng tùy biến thành `--shadow-glow-primary`.

## 8. Skills đã áp dụng

| Skill | Áp dụng |
|---|---|
| `nextjs-app-router-patterns` (dự án) | Server Component mặc định, `'use client'` chỉ ở phần tương tác; React Query cho dữ liệu phía client; `loading`/`error`/`not-found` |
| `frontend/AGENTS.md` + tài liệu `node_modules/next/dist/docs` (Next.js 16) | `PageProps`/`LayoutProps`, Cache Components (params qua `use()` trong `<Suspense>`), `<ViewTransition>`, `transitionTypes` |
| `design:design-system` (plugin) | Cấu trúc tài liệu này: token → component (biến thể, trạng thái, a11y) → pattern → audit |
| `python-testing-patterns`, `web3-testing` | Không dùng trực tiếp cho frontend; nguyên tắc test thật (Anvil, không mock) được giữ trong Playwright |
