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
| `AudioPlayer` | `components/audio/audio-player.tsx` | `src` công khai hoặc `load()` (header admin) | tải, phát, tua, lỗi | nút có nhãn "Phát/Tạm dừng …" |
| `LiveWaveform` | `components/audio/live-waveform.tsx` | — | reduced motion → thanh mức | `aria-hidden` (trạng thái do chữ/đồng hồ thể hiện) |
| `TxSteps`, `TxHash` | `components/tx/tx-steps.tsx` | — | idle · waiting · simulating · signing · pending · success · error | `aria-live="polite"` |
| `ConnectWallet` | `components/wallet/connect-wallet.tsx` | — | chưa kết nối · sai mạng (nút chuyển mạng) · đã kết nối (menu) | menu `aria-haspopup`, Esc/đóng khi bấm ngoài |
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
- **Thao tác ví người dùng** (mua, tạo chiến dịch, rút phần chia): `useContractTx` mô phỏng trước (lỗi giải mã tiếng Việt,
  không bật ví), ký, chờ receipt; mỗi giao dịch là một dòng `TxSteps`.
- **Danh sách dữ liệu:** lọc bằng `Tabs` + `Select`, tìm kiếm `useDeferredValue`, đổi bố cục bằng `layout` animation;
  thẻ "Nổi bật" nằm ngang phá nhịp lưới; mỗi bộ dữ liệu có "chữ ký sóng âm" riêng (tất định theo id).
- **Hành động chính trên di động:** thanh cố định đáy (trang dataset: giá + "Mua license").

- **Mật khẩu ví (tạo ví):** `PasswordInput` + `PasswordRequirements` luôn hiển thị; quy tắc ở `lib/password.ts` (≥ 8 ký tự,
  chữ hoa, chữ thường, chữ số, ký tự đặc biệt — kiểm tra Unicode nên chữ có dấu như "Ấ", "ê" được tính đúng); dòng trạng thái
  `role="status"` nói còn thiếu gì; ô nhập lại báo "đã khớp/chưa khớp"; nút chính tắt tới khi hợp lệ. `lib/browserWallet.ts`
  chặn lại lần nữa khi tạo ví. Mở khóa ví và admin key chỉ dùng `PasswordInput` (không áp quy tắc).

## 5. Responsive

Mobile-first, breakpoint Tailwind mặc định (`sm` 640, `md` 768, `lg` 1024). Đã kiểm 375 · 390 · 768 · 1280 · 1440px trên
8 trang chính: **0px tràn ngang**, 0 lỗi console. Điều hướng chính chuyển sang menu thả xuống dưới `xl` (1280px — tên "Dataset Marketplace" dài nên từ 1024px menu đầy đủ sẽ bị xuống dòng); panel mua
chuyển từ cột phải dính (sticky) sang cuối trang + thanh hành động cố định đáy; lưới thẻ 1 → 2 → 3 cột.

## 6. Kiểm chứng (tự động, chạy thật)

| Kiểm tra | Lệnh | Kết quả gần nhất |
|---|---|---|
| WCAG 2.2 AA (axe-core) — 8 trang công khai | `npm run test:a11y` | 0 vi phạm |
| WCAG 2.2 AA tại 6 trạng thái sau đăng nhập (wizard, hộp thoại đồng thuận, kết quả QC, hộp thoại rút tiền, admin, thư viện) | `npm run test:e2e` | 0 vi phạm |
| Reduced motion, bàn phím (skip link, focus) | `npm run test:a11y` | đạt |
| Luồng nghiệp vụ trên trình duyệt (7 bước, 4 vai trò) | `npm run test:e2e` | đạt |

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
