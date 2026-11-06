# Dataset Marketplace – Frontend

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript strict · Tailwind CSS 4 · viem + wagmi · TanStack
Query · motion · Be Vietnam Pro. Hướng dẫn đầy đủ: [README gốc §15](../README.md#15-frontend-web). Hệ thống thiết kế:
[`docs/frontend-design-system.md`](../docs/frontend-design-system.md).

```cmd
copy .env.example .env.local
npm install
npm run dev          :: http://localhost:3000 (cần backend http://127.0.0.1:8000)
npm run typecheck && npm run lint && npm run build
npm run test:e2e     :: Playwright: luồng nghiệp vụ thật (cần Anvil + backend + dev server)
npm run test:a11y    :: axe WCAG 2.2 AA + reduced motion + bàn phím
:: E2E_BASE_URL=http://localhost:3001 để chạy test với bản production (next start)
```

| Thư mục | Nội dung |
|---|---|
| `app/` | Route: `/`, `/explore`, `/datasets/[id]`, `/library`, `/earn/*`, `/create`, `/create/new`, `/admin` |
| `features/landing` · `marketplace` · `earn` · `creator` · `admin` | Màn hình theo vai trò (đặc tả §5) |
| `components/ui` | Design system: Button, Field/Input/Select/Textarea, PasswordInput + PasswordRequirements, Card, Badge, Dialog/Confirm, Tabs, Progress, Skeleton, Empty/Error state, AnimatedNumber, Reveal, Stepper, CopyButton |
| `components/audio` · `tx` · `wallet` · `layout` | AudioPlayer, LiveWaveform, TxSteps, ConnectWallet, header/footer/PageTransition |
| `services/api.ts` | Client cho mọi endpoint backend (khớp Swagger `/docs`) |
| `hooks/` | React Query (`queries.ts`), phiên theo ví (`useSessions.ts`), đọc contract (`useChain.ts`), giao dịch ví (`useContractTx.ts`) |
| `lib/` | `password` (chính sách mật khẩu mạnh), `browserWallet` (ví mã hóa mật khẩu + EIP-712), `recorder` (AudioWorklet → WAV 16 kHz), `money`, `config`, `wagmi`, `contracts` (ABI), `chainErrors` |
| `providers/` | Auth (ví trình duyệt + phiên theo ví), Toast |
| `e2e/` | Playwright: `flows.spec.ts`, `a11y.spec.ts`, `anvil-wallet.ts` (ví test nối Anvil — chỉ dùng trong test) |

Biến môi trường và cách lấy: [`docs/environment-variables.md`](../docs/environment-variables.md). `next.config.ts` tắt nút
"N" của Next.js (`devIndicators: false`).

> Next.js 16 có thay đổi lớn — đọc `AGENTS.md` và `node_modules/next/dist/docs/` trước khi sửa code.
