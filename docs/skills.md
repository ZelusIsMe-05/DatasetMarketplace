# Skills Claude Code của dự án

Cài ở cấp project (`.claude/skills/`), không cài global. Khóa phiên bản trong `skills-lock.json`
(khôi phục: `npx skills experimental_install`). Đã đọc toàn bộ `SKILL.md` trước khi dùng; tất cả chỉ là
Markdown hướng dẫn, **không có script thực thi**.

| Skill | Nguồn | Lệnh cài | Công dụng trong dự án |
|---|---|---|---|
| `fastapi` | [fastapi/fastapi](https://github.com/fastapi/fastapi) (repo chính thức của FastAPI) | `npx skills add fastapi/fastapi --skill fastapi -a claude-code` | Quy ước `Annotated` cho dependency, return type làm response model, endpoint blocking dùng `def`, router-level prefix/tags |
| `solidity-security` | [wshobson/agents](https://github.com/wshobson/agents) | `npx skills add wshobson/agents --skill solidity-security -a claude-code` | Checklist reentrancy, CEI, access control khi rà soát `VoiceCampaigns.sol` |
| `web3-testing` | wshobson/agents | `npx skills add wshobson/agents --skill web3-testing -a claude-code` | Mẫu Foundry test, fuzz test (dùng cho `testFuzz_Solvency`) |
| `python-testing-patterns` | wshobson/agents | `npx skills add wshobson/agents --skill python-testing-patterns -a claude-code` | Tổ chức fixture pytest (session-scoped Anvil, model QC) |
| `nextjs-app-router-patterns` | wshobson/agents | `npx skills add wshobson/agents --skill nextjs-app-router-patterns -a claude-code` | Giai đoạn frontend (App Router, Server/Client Components) |

## Đã tìm nhưng không cài
| Kết quả tìm kiếm | Lý do không cài |
|---|---|
| Các skill "avalanche" (`trampoline-ai/avalanche`, `den-labs/...erc8004-avalanche`…) | 1–10 lượt cài, chưa rõ người duy trì; nội dung Avalanche cần dùng (C-Chain = EVM, Fuji, faucet) đã có trong đề xuất |
| Skill audio/ASR (`speech-recognition` cho iOS, `ffmpeg-audio-processing`) | Không khớp stack (wav2vec2 CTC + torchaudio forced alignment + Silero VAD) |
| `foundry-testing` (nhiều repo, 1 lượt cài) | Quá ít người dùng; `web3-testing` đã đủ |
| Skill "clean architecture python" | Ít người dùng; cấu trúc lớp đã quy định trong `CLAUDE.md` |
| `anthropics/skills` | Không có skill riêng cho FastAPI/Solidity/Web3; các skill tài liệu (docx/pdf…) không cần cho repo này |

## Mức ưu tiên khi mâu thuẫn
Đề xuất `DatasetMarketplace_Hackathon.md` > `CLAUDE.md` > skill. Ví dụ skill `fastapi` khuyên SQLModel; dự án
giữ SQLAlchemy 2.0 + Alembic (migration tường minh, đúng yêu cầu "schema và migrations").

## Áp dụng trong giai đoạn frontend
| Skill | Áp dụng |
|---|---|
| `nextjs-app-router-patterns` | Server Component mặc định, `'use client'` chỉ cho phần tương tác, React Query cho dữ liệu client, `loading`/`error`/`not-found` |
| `design:design-system` (plugin có sẵn, không cài thêm) | Cấu trúc và audit token trong `docs/frontend-design-system.md` |
| `frontend/AGENTS.md` + tài liệu Next.js 16 trong `node_modules/next/dist/docs` | Cache Components, `PageProps`/`LayoutProps`, `<ViewTransition>` |

Không cài skill animation/accessibility mới: chuyển động dùng React `<ViewTransition>` (có sẵn) + `motion`; accessibility
được đo tự động bằng axe-core (`@axe-core/playwright`) thay vì chỉ dựa vào checklist.
