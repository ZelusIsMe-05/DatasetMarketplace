# AGENTS.md — quy trình làm việc cho dự án Dataset Marketplace

## Nguồn sự thật
- `DatasetMarketplace_Hackathon.md` là đặc tả bắt buộc. Không đổi nghiệp vụ, công thức giá/chia tiền, cấu trúc chữ ký
  EIP-712 (domain `GiongQue`/`1`, typehash Consent/Revoke/Claim), thiết kế contract hay quy tắc dữ liệu.
- Mọi chỗ lệch so với đề xuất phải là thay đổi nhỏ nhất và được ghi vào `docs/implementation-plan.md` §3 kèm lý do.
- Tên hiển thị "Dataset Marketplace" chỉ đặt ở `frontend/lib/brand.ts`; không đổi định danh kỹ thuật `GiongQue` / `giongque`
  (domain EIP-712, lệnh CLI, khóa localStorage).
- Tiến độ thật ghi ở `IMPLEMENTATION_STATUS.md` (phân biệt implemented / tested / verified on local / pending Fuji).

## Cấu trúc
- `contracts/` Foundry (Solidity 0.8.28, OpenZeppelin 5.1.0 qua npm, forge-std ở `lib/`).
- `backend/` FastAPI: `app/core` (config theo `NETWORK`, money, bảo mật), `app/models` (+ `alembic/`),
  `app/repositories`, `app/blockchain` (client, eip712, relayer, indexer), `app/qc`, `app/services`, `app/api`;
  `cli/` (lệnh `giongque`); `tests/unit`, `tests/integration`.
- `frontend/` Next.js 16 (Cache Components) — đọc `frontend/AGENTS.md` + `docs/frontend-design-system.md` trước khi sửa.
  `features/<vai-trò>` cho màn hình, `components/ui` cho design system; token màu/chữ/chuyển động chỉ đặt trong `app/globals.css`.
- `seed/demo-campaign/` câu mẫu + điều khoản thật mà SeedDemo băm lên chain (giữ LF, không sửa byte tùy tiện).
- `scripts/*.bat` chạy trên Windows CMD.
- Biến môi trường: mọi biến mới phải được thêm vào file `*.example` tương ứng **và** `docs/environment-variables.md`.

## Quy tắc code
- Business logic nằm trong `app/services`; router trong `app/api` chỉ mỏng. Mọi khác biệt môi trường chỉ ở
  `app/core/config.py`, `contracts/script/` (theo chain id) và file `.env.*` — code nghiệp vụ không tự kiểm tra mạng.
- Endpoint gọi web3/torch là `def` (chạy threadpool), không `async def`.
- Không log audio, salt, private key. Không commit `.env` thật. Không gửi giao dịch lên Fuji/mainnet khi chưa được
  người dùng cấu hình và cho phép.
- Không mock kết quả QC/chain trong code chạy thật; test dùng Anvil + model thật.
- Thay đổi ABI contract ⇒ `forge build` rồi `python -m scripts.export_abi` (chép ABI cho backend + frontend).

## Lệnh kiểm tra (bắt buộc chạy trước khi báo xong)
```cmd
scripts\test-all.bat                         :: forge test + pytest unit/QC thật + tích hợp (tự chạy anvil)
scripts\start-anvil.bat  &  scripts\deploy-local.bat  &  scripts\start-backend.bat
scripts\demo-local.bat                       :: e2e 51 kiểm tra + kịch bản 6.11 12 kiểm tra
scripts\test-frontend.bat e2e                :: typecheck + lint + build + Playwright (cần stack đang chạy)
cd frontend && npm run test:a11y             :: axe WCAG 2.2 AA
```
Frontend: route động đọc `params` qua `use()` bên trong `<Suspense>`; hook URL (`usePathname`) phải nằm trong `<Suspense>`;
`<dialog>` modal phải đóng trong effect cleanup (Next 16 giữ trang cũ trong `<Activity hidden>`).
Python trong bash/Git Bash: dùng `-X utf8` (console Windows mặc định cp1252).

## Skills dự án (`.Codex/skills/`, chi tiết ở `docs/skills.md`)
| Skill | Dùng khi |
|---|---|
| `fastapi` | Viết/sửa endpoint, dependency (`Annotated`), response model |
| `python-testing-patterns` | Viết pytest, fixture |
| `solidity-security` | Sửa `VoiceCampaigns.sol`: reentrancy, CEI, quyền, làm tròn |
| `web3-testing` | Foundry test, fuzz, invariant |
| `nextjs-app-router-patterns` | Giai đoạn frontend (kết hợp với `frontend/AGENTS.md`) |

Skills là hướng dẫn chung; khi mâu thuẫn với đề xuất thì đề xuất thắng. Ví dụ: skill `fastapi` khuyên SQLModel,
dự án dùng SQLAlchemy 2.0 + Alembic vì cần migration rõ ràng.
