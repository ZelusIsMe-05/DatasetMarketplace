# IMPLEMENTATION_STATUS

Cập nhật: 07/11/2026. Máy kiểm chứng: Windows 11, Python 3.12.6, Node 26, Foundry 1.9.0 (bản Windows), CPU.

Chú thích: **implemented** = có code · **tested** = có test tự động đạt · **verified on local** = đã chạy thật trên
Anvil qua CMD · **pending Fuji** = chưa deploy lên Fuji.

## Kết quả kiểm chứng gần nhất (đã chạy thật)

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| Contract build + test | `forge test -vv` (qua `scripts\test-all.bat`) | **37/37 đạt** (7 test gốc + 30 bổ sung, fuzz 512 lần) |
| Lỗi làm tròn của bản gốc | đổi tạm về công thức gốc rồi chạy test | `test_RoundingNeverInsolvent` + `testFuzz_Solvency` **trượt** với bản gốc ⇒ lỗi có thật; bản sửa đạt |
| Unit + QC model thật | `pytest tests/unit` | **43/43 đạt** (8 bản đọc thật `pass`, CER 0.00, align ≥ 0.97; sai câu, im lặng, quá ngắn, đọc thiếu bị chặn; webm/opus) |
| Tích hợp | `pytest tests/integration` (tự chạy Anvil) | **11/11 đạt** |
| Chốt chặn mainnet | Deploy/SeedDemo trên Anvil chain id 43114 | `USDC_ADDRESS is not a contract`, `SeedDemo must never run on mainnet`; backend từ chối `mUSDC` |
| Script Windows | `setup.bat`, `start-anvil.bat`, `deploy-local.bat`, `start-backend.bat`, `test-all.bat`, `demo-local.bat`, `giongque.bat` chạy trong `cmd.exe` | đều exit 0 |
| Demo e2e | `scripts\demo-local.bat` (deployment sạch; 07/11 chạy trên Anvil/backend tạm ở cổng riêng và CLI home riêng) | **`demo e2e` 51/51**, **`demo scenario-611` 12/12**; đã dừng dịch vụ tạm và khôi phục file địa chỉ deployment ban đầu. Bộ đang chạy có email ví test từ e2e nên cần dữ liệu riêng cho demo CLI. |
| Swagger | `GET /docs` | HTTP 200, đủ 16 endpoint của §11 (kiểm bằng test) |
| Frontend: typecheck, lint, production build | `scripts\test-frontend.bat` | đạt (14 route tĩnh, 3 route partial prerender) |
| Frontend: luồng nghiệp vụ trên trình duyệt | `npm run test:e2e` (Playwright + Anvil + backend + QC thật) | **7/7 bước đạt** — wizard tạo chiến dịch có quỹ mồi, onboarding, đồng thuận, ghi âm qua micro (giả lập phát bản ghi thật) → QC đạt → on-chain, mua (approve + buy), rút tiền qua relayer, công bố phiên bản, tải zip, thu hồi |
| Frontend: accessibility | `npm run test:a11y` + axe trong luồng e2e | 0 vi phạm WCAG 2.2 AA trên 8 trang + 6 trạng thái sau đăng nhập; reduced motion + bàn phím đạt |
| Frontend: responsive | 8 trang × 375/390/768/1280/1440px | 0px tràn ngang, 0 lỗi console |
| Frontend: lỗi HTML sau đăng nhập (07/11) | Chromium trên `/earn` và `/earn/earnings`, đăng nhập dev thật, giữ phản hồi `/me/contributions` thật để quan sát loading rồi trả dữ liệu | Đổi 3 vùng số liệu từ `<p>` sang `<div>` để chứa `Skeleton`; cả loading và loaded không có lỗi lồng thẻ/hydration/runtime; axe sau đăng nhập 0 vi phạm. Typecheck + lint + build, Playwright 17/17, a11y riêng 10/10, Foundry 37/37, pytest unit/QC 43/43 và tích hợp 11/11 đạt. Chưa kiểm chứng OAuth Google thật. |
| Tài liệu + `.gitignore` (07/11) | Quét 48 file Markdown, kiểm tra liên kết nội bộ và `git check-ignore --no-index` bằng kho Git tạm | Tên cũ đã được thay bằng `DatasetMarketplace`; thêm `RUN_PROJECT.md` từ README. **86/86** trường hợp ignore đạt (55 cần bỏ qua, 31 cần giữ), 13 liên kết nội bộ hợp lệ; giữ nguyên byte bộ seed và định danh kỹ thuật. Chỉ sửa tài liệu/quy tắc Git; không chạy lại các bộ kiểm thử ứng dụng ở lần cập nhật này. Workspace chưa có `.git`, nên chưa kiểm tra được index/lịch sử commit hiện có. |

## Theo module

| Module | Implemented | Tested | Verified on local | Ghi chú |
|---|---|---|---|---|
| `VoiceCampaigns.sol` (đủ hàm + sự kiện §9) | ✅ | ✅ | ✅ | sửa nhỏ, xem `docs/implementation-plan.md` §3 |
| `MockUSDC.sol` | ✅ | ✅ | ✅ | chỉ local/Fuji |
| `Deploy.s.sol` / `SeedDemo.s.sol` | ✅ | ✅ (guard mainnet) | ✅ | SeedDemo băm file câu mẫu/điều khoản thật |
| Config `NETWORK=local/fuji/mainnet` | ✅ | ✅ | ✅ (local) | |
| Money VNĐ ↔ USDC, `/fx` | ✅ | ✅ | ✅ | tỷ giá HTTP (mainnet) chưa thử với nguồn thật |
| Database + Alembic (15 bảng) | ✅ | ✅ | ✅ | |
| Auth dev (local) + gắn 1 email ↔ 1 ví | ✅ | ✅ | ✅ | |
| Auth Google `POST /auth/google` | ✅ | ⚠️ chưa | ⚠️ chưa | cần `GOOGLE_CLIENT_ID` thật để thử |
| Campaign (nháp, hash, liên kết metadata, chi tiết, điều khoản) | ✅ | ✅ | ✅ | |
| Consent EIP-712 + relayer | ✅ | ✅ | ✅ | người dùng không tốn AVAX (đã kiểm số dư) |
| Prompt token HMAC 60 giây + chống audio chuẩn bị sẵn | ✅ | ✅ | ✅ | |
| QC pipeline (VAD, độ dài, tốc độ, CTC, CER, forced alignment, điểm từ) | ✅ | ✅ | ✅ | model thật, CPU |
| Contribution → registerContribution + tiền mồi | ✅ | ✅ | ✅ | |
| Vùng xám + duyệt tay | ✅ | ✅ | ✅ (API) | |
| Marketplace (giá, license, doanh thu) | ✅ | ✅ | ✅ | người mua tự ký `approve` + `buy` |
| Rewards (claim-quote, claimWithSig, claim tự rút, withdraw) | ✅ | ✅ | ✅ | |
| Revoke (relayer + tự gọi), xóa audio + salt | ✅ | ✅ | ✅ | đã kiểm file bị xóa trên đĩa |
| Dataset: snapshot Merkle, publishSnapshot, tải theo license, link có hạn, phiên bản cũ 410 | ✅ | ✅ | ✅ | |
| Indexer sự kiện | ✅ | ✅ | ✅ | |
| Rate limit, CORS, health, lỗi chuẩn, log che bí mật | ✅ | ✅ (rate limit, lỗi) | ✅ | |
| CLI `giongque` (wallet, status, login, campaign, consent, prompt, qc, contribution, market, rewards, dataset, admin, demo) | ✅ | qua e2e | ✅ | `contribution record` (micro) chưa thử vì môi trường không có micro |
| Frontend: landing, chợ dữ liệu, chi tiết + mua, thư viện + tải | ✅ | ✅ (e2e, axe) | ✅ (Chromium) | |
| Frontend: người đóng góp (onboarding ví + đăng nhập, đồng thuận, phòng ghi âm, QC, lịch sử + thu hồi, thu nhập + rút tiền) | ✅ | ✅ (e2e, axe) | ✅ (micro giả phát bản ghi thật) | chưa thử micro thật của người dùng |
| Frontend: người tạo (wizard 5 bước, bảng điều khiển, rút phần chia, rút quỹ mồi) | ✅ | ✅ wizard (e2e) | ✅ | rút quỹ mồi chưa có test tự động (cần chờ hết hạn chiến dịch) |
| Frontend: quản trị (hàng chờ, nghe, duyệt/loại, công bố phiên bản, relayer) | ✅ | ✅ công bố phiên bản | ✅ | duyệt/loại vùng xám đã test ở backend, chưa test qua UI |
| Mật khẩu ví mạnh (chữ hoa, chữ thường, số, ký tự đặc biệt, ≥ 8 ký tự) + nút con mắt hiện/ẩn + thông báo điều kiện trực tiếp | ✅ | ✅ (e2e: mật khẩu yếu bị chặn, con mắt, chưa khớp/đã khớp; axe) | ✅ | áp dụng khi tạo ví mới; ví cũ vẫn mở khóa bằng mật khẩu cũ |
| Tài liệu biến môi trường (`docs/environment-variables.md`) | ✅ | — | — | liệt kê từ code: 45 biến backend, 12 contracts, 4 frontend, 4 CLI |
| Đăng nhập Google trên web (Google Identity Services) | ✅ | ⚠️ chưa | ⚠️ chưa | cần OAuth Client ID |
| Skills + `CLAUDE.md` + `docs/skills.md` | ✅ | — | — | 5 skills cấp project |

## Pending / chưa hoàn thành

| Hạng mục | Trạng thái | Cần gì |
|---|---|---|
| Deploy Fuji + verify Snowtrace | **pending Fuji** | AVAX test từ Core faucet, ví đội, sự cho phép gửi giao dịch |
| Backend + frontend chạy `NETWORK=fuji` | **pending Fuji** | địa chỉ contract Fuji, `.env.fuji` với secret thật |
| Thử Google OAuth thật | chưa | OAuth Client ID |
| Hiệu chỉnh ngưỡng QC (§10.4) | chưa | 50 bản đúng + 50 bản sai do người thật ghi |
| Thử frontend trên Safari/Firefox, điện thoại thật, Core/MetaMask thật | chưa | thiết bị/ví thật |
| `setup.bat` trên máy Windows trắng | chưa thử trên máy trắng | đã chạy thành công trên máy hiện tại; nhánh tải Foundry đã thử riêng |
| Audit bảo mật contract | chưa | |
