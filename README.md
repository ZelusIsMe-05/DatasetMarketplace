# DatasetMarketplace — Chợ dữ liệu giọng nói tiếng Việt có đồng thuận, chia doanh thu trên Avalanche

> Dự án cho **Team1 Vietnam UniHack 2026**. Đặc tả gốc: [`DatasetMarketplace_Hackathon.md`](DatasetMarketplace_Hackathon.md).
> Giai đoạn hiện tại: **Smart contract + Backend + CLI + Frontend web hoàn chỉnh, chạy được trên máy (Anvil)** và đã kiểm
> thử end-to-end trên trình duyệt; chưa deploy Fuji.
> Tiến độ chi tiết: [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).
> Hướng dẫn chỉ dành cho cài đặt và chạy dự án: [`RUN_PROJECT.md`](RUN_PROJECT.md).
>
> **Tên sản phẩm:** *DatasetMarketplace*. Tên hiển thị giao diện nằm ở một chỗ:
> `frontend/lib/brand.ts`. Các định danh kỹ thuật được **giữ nguyên** để không phá vỡ hệ thống: domain EIP-712 `DatasetMarketplace`
> (khắc trong contract, đổi sẽ làm mọi chữ ký mất hiệu lực), lệnh CLI `datasetmarketplace`, tên gói/thư mục `datasetmarketplace-*`,
> khóa `localStorage` `datasetmarketplace.*` (đổi sẽ làm mất ví đã tạo trong trình duyệt).

---

## 1. Giới thiệu

Bên cần dữ liệu (startup, lab) **đặt hàng** một dataset giọng nói; người bình thường **đọc câu mẫu để kiếm tiền**;
mỗi lần dataset được bán, contract **tự chia lại tiền** cho những người có giọng trong đó — minh bạch trên Avalanche.

- **Mua sớm, giá rẻ:** giá tăng theo tiến độ thu thập: `giá = giá_đầy_đủ × (0,3 + 0,7 × tiến_độ)`.
- **Chia doanh thu tự động:** theo số giây giọng nói hợp lệ, cơ chế tích lũy O(1) gas.
- **Đồng thuận và thu hồi on-chain:** ký EIP-712; thu hồi bất cứ lúc nào — giữ tiền đã kiếm, mất thu nhập tương lai,
  audio bị xóa, dataset phát hành sau không còn bản ghi.
- Người dùng **chỉ thấy VNĐ**; on-chain lưu USDC (local/Fuji: `MockUSDC`), AVAX chỉ để trả gas ở hậu trường.

## 2. Chức năng chính

| Vai trò | Chức năng (backend + contract) | Lệnh CLI tương ứng |
|---|---|---|
| Người tạo chiến dịch | Soạn nháp (câu mẫu, điều khoản, giá VNĐ → USDC), tạo chiến dịch chỉ bằng chữ ký (relayer gửi `createCampaignWithSig`, trừ quỹ mồi + phí xử lý), rút phần chia / quỹ mồi bằng chữ ký. **Chủ dữ liệu**: nghe và duyệt/loại bản ghi vùng xám (loại phải ghi lý do; quá 72 giờ tự duyệt), xem bản tóm tắt rồi **ký công bố phiên bản dataset** (`PublishSnapshot` → relayer gửi `publishSnapshotWithSig`) | `campaign create`, `rewards withdraw`, `rewards withdraw-seed`, `review list/approve/reject`, `dataset snapshot` |
| Người đóng góp | Đăng nhập (Google / dev local), ký đồng thuận (relayer trả gas), nhận câu mẫu + token 60 giây, ghi âm, QC, xem tiền, rút tiền (relayer hoặc tự rút), thu hồi | `login`, `consent give`, `prompt get`, `contribution submit/record/list/revoke`, `rewards balance/quote/claim` |
| Người mua | Xem giá theo tiến độ, mua chỉ bằng chữ ký (`Buy` + permit → relayer gửi `buyWithSig`; CLI vẫn `approve` + `buy`), tải dataset đã ký chứng minh ví + kiểm tra Merkle | `market price/buy/license/revenue`, `dataset download/verify` |
| QC oracle (server) | Silero VAD + wav2vec2 CTC + forced alignment + CER → `registerContribution`; tính Merkle root cho bản tóm tắt phiên bản (người tạo ký) | `qc check` |
| Nền tảng (tự động) | Không có vai trò quản trị (implementation-plan §3 #28). Vòng nền: đồng bộ sự kiện, tự duyệt vùng xám quá hạn, thử ghi lại bản ghi lỗi tạm thời; relayer trả phí mạng | `status` |
| Demo (local/Fuji) | Faucet mUSDC, kịch bản end-to-end | `demo faucet`, `demo e2e`, `demo scenario-611` |

## 3. Công nghệ

| Lớp | Công nghệ |
|---|---|
| Smart contract | Solidity 0.8.28, OpenZeppelin 5.1.0, Foundry 1.9.0 (bản Windows chính thức) |
| Chain | Anvil (31337) · Avalanche Fuji C-Chain (43113) · C-Chain mainnet (43114) |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 + Alembic, SQLite (mặc định) hoặc PostgreSQL/Neon (`DATABASE_URL`, driver psycopg 3), web3.py 7, slowapi, PyJWT, google-auth |
| QC | PyTorch 2.6 CPU, torchaudio 2.6 (`forced_align`), transformers 4.57, `nguyenvulebinh/wav2vec2-base-vietnamese-250h`, Silero VAD 5.1, jiwer, soundfile, PyAV |
| CLI | Typer + Rich + httpx + eth-account |
| Frontend (khung) | Next.js 16, React 19, TypeScript, Tailwind 4, viem 2, wagmi 3, TanStack Query |

## 4. Kiến trúc tổng thể

```
CLI / Frontend ──HTTP──▶ FastAPI (app/api) ──▶ services ──▶ repositories ──▶ SQLite / PostgreSQL (Neon)
                                               ├─▶ qc (VAD + wav2vec2 + forced alignment + CER)
                                               ├─▶ storage (audio riêng tư, xóa khi thu hồi)
                                               ├─▶ blockchain.relayer ──tx──▶ VoiceCampaigns.sol ──▶ (Mock)USDC
                                               └─▶ blockchain.indexer ◀─sự kiện─┘
Người tạo / người mua ──chữ ký EIP-712 + permit (Core/MetaMask)──▶ API ──relayer──▶ createCampaignWithSig · buyWithSig · withdrawWithSig
CLI demo ──ví dev của Anvil──▶ createCampaign · approve+buy · withdraw
```

Sơ đồ chi tiết, luồng đóng góp, thu hồi và bảng bảo mật: [`docs/architecture.md`](docs/architecture.md).
Phân tích nghiệp vụ và **các chỗ đã sửa so với đề xuất** (kèm lý do): [`docs/implementation-plan.md`](docs/implementation-plan.md).

## 5. Cấu trúc thư mục

```
├── DatasetMarketplace_Hackathon.md   # đặc tả gốc (nguồn sự thật)
├── CLAUDE.md · IMPLEMENTATION_STATUS.md · README.md
├── .claude/skills/                   # skills Claude Code cấp project (docs/skills.md)
├── contracts/                        # Foundry
│   ├── src/VoiceCampaigns.sol        # contract chính (mọi môi trường)
│   ├── src/mocks/MockUSDC.sol        # CHỈ local + Fuji
│   ├── test/VoiceCampaigns.t.sol     # 37 test (7 test gốc + 30 bổ sung, có fuzz)
│   ├── script/Deploy.s.sol           # rẽ nhánh theo chain id, ghi deployments/<chainId>.json
│   ├── script/SeedDemo.s.sol         # CHỈ local + Fuji, chặn mainnet
│   └── foundry.toml · package.json (OpenZeppelin) · .env.example
├── backend/
│   ├── app/core/          # config (NETWORK), money (VNĐ↔USDC), security (JWT, HMAC), errors, logging, ratelimit
│   ├── app/models/        # SQLAlchemy entities + session/migration
│   ├── app/repositories/  # truy vấn dùng chung
│   ├── app/blockchain/    # abi/, client (đọc), eip712, relayer (gửi tx), indexer (sự kiện), errors
│   ├── app/qc/            # text (chuẩn hóa, CER), audio (giải mã), checker (pipeline), service, __main__ (CMD)
│   ├── app/services/      # auth, campaign, consent, prompt, contribution, rewards, revoke, marketplace,
│   │                      # dataset (Merkle, snapshot người tạo ký, tải, khóa khi thu hồi), review (người tạo
│   │                      # duyệt vùng xám), storage (đĩa / Backblaze B2), sponsor, faucet, container
│   ├── app/api/           # routers FastAPI
│   ├── app/main.py        # create_app
│   ├── alembic/           # migration
│   ├── cli/               # lệnh datasetmarketplace (main, ops, demo, chain, api, state)
│   ├── scripts/           # export_abi.py, make_fixtures.py
│   ├── tests/unit · tests/integration · tests/fixtures/audio (audio tiếng Việt thật)
│   └── requirements*.txt · pyproject.toml · .env*.example
├── frontend/              # Next.js 16: app/ (routes), features/ (theo vai trò), components/ (design system),
│                          # services/api.ts, hooks/, lib/, providers/, types/, e2e/ (Playwright)
├── seed/demo-campaign/    # câu mẫu + điều khoản THẬT được băm lên chain bởi SeedDemo
├── scripts/               # *.bat cho Windows CMD
├── docs/                  # architecture, implementation-plan, requirements-checklist, skills, consent-terms
└── storage/               # (gitignore) DB, audio riêng tư, log — tách theo deployment
```

## 6. Yêu cầu môi trường (Windows)

| Công cụ | Phiên bản | Ghi chú |
|---|---|---|
| Windows 10/11 | | Chạy **trực tiếp trong CMD/PowerShell, không cần WSL2** (Foundry có bản Windows chính thức) |
| Python | 3.11+ (đã thử 3.12.6) | có trong PATH |
| Node.js | 20+ (đã thử 26) | cho OpenZeppelin (npm) và frontend |
| Git | bất kỳ | `forge install` cần git |
| Foundry | 1.9.0 | `scripts\setup.bat` tự tải bản Windows từ GitHub, **kiểm SHA256**, cài vào `%USERPROFILE%\.foundry\bin` (không sửa PATH hệ thống) |
| Dung lượng | ~3 GB | torch CPU + model QC (~380 MB, tải lần đầu từ Hugging Face) |
| Internet | lần đầu | tải package + model |

Không cần GPU (QC chạy CPU: nạp model ~11 giây một lần, chấm ~1,4 giây/bản ghi 4 giây).

## 7. Cài đặt từng bước

```cmd
cd D:\Hackathon
scripts\setup.bat
```

`setup.bat` sẽ: kiểm tra Python/Node/Git → cài Foundry nếu thiếu → `npm install` + `forge install forge-std` +
`forge build` → tạo `backend\.venv`, cài torch CPU 2.6 + `requirements-dev.txt` + CLI `datasetmarketplace` → xuất ABI →
tạo `backend\.env.local` từ mẫu → tải trước model QC → `npm install` cho frontend.

Cài tay (tương đương):

```cmd
cd contracts && npm install && forge install foundry-rs/forge-std --no-git && forge build && cd ..
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -r requirements-dev.txt --extra-index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -e .
copy .env.local.example .env.local
```

## 8. Smart contract

```cmd
cd contracts
forge build
forge test -vv                         :: 37 test, không cần mạng/AVAX
```

Chạy trên chain local — mở **3 cửa sổ CMD**:

```cmd
:: Cửa sổ 1
scripts\start-anvil.bat                :: Anvil chain 31337 (thêm "persist" để giữ trạng thái giữa các lần chạy)
:: Cửa sổ 2
scripts\deploy-local.bat               :: Deploy.s.sol (MockUSDC + VoiceCampaigns, CLAIM_FEE=100000) + SeedDemo.s.sol
```

`Deploy.s.sol` ghi địa chỉ ra `contracts\deployments\31337.json` — backend tự đọc, **không cần chép địa chỉ tay**.
SeedDemo tạo chiến dịch mẫu #0 (10 giờ, 1.000 mUSDC, 80/10/10, 30 ngày, giá khởi điểm 300 mUSDC ≈ 7.800.000 ₫),
cấp 2.000 mUSDC + 0,05 AVAX cho ví người mua demo (anvil #1).

> Khóa riêng anvil #0 dùng trong script là **khóa công khai của Anvil**, chỉ dùng cho local.

## 9. Backend

```cmd
:: Cửa sổ 3
scripts\start-backend.bat              :: = NETWORK=local, uvicorn app.main:app tại http://127.0.0.1:8000
scripts\start-backend.bat local reload :: chế độ tự nạp lại khi sửa code
```

- Swagger: **http://127.0.0.1:8000/docs** · OpenAPI: `/openapi.json` · Health: `/health`
- Backend tự nạp `backend\.env.<NETWORK>`. Audio luôn nằm ở `storage\<network>-<fingerprint>\audio\` (đĩa của máy backend).
  Database: SQLite trong cùng thư mục đó (mặc định), hoặc PostgreSQL/Neon nếu đặt `DATABASE_URL` (xem mục dưới).
  `GET /health` cho biết đang dùng `"database": "sqlite"` hay `"postgresql"`.
- Thử nhanh bằng curl:

```cmd
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/fx
curl http://127.0.0.1:8000/campaigns
curl http://127.0.0.1:8000/campaigns/0/terms
```

### Database trên Neon (PostgreSQL) và reset dữ liệu

1. Lấy chuỗi kết nối Neon theo [`docs/environment-variables.md` §1b](docs/environment-variables.md) (nên dùng nhánh `dev`
   cho local, nhánh `production` cho Fuji; **tắt Connection pooling**).
2. Thêm vào `backend\.env.local`: `DATABASE_URL=postgresql://...?sslmode=require` (dán nguyên chuỗi của Neon — backend tự
   chuyển sang driver psycopg). Tùy chọn `DATABASE_SCHEMA=<tên>` để dùng schema riêng thay vì `public`.
3. Khởi động backend: Alembic tự tạo bảng, nạp chiến dịch mẫu từ `seed\`, đọc lại sự kiện từ chain.

**Chốt an toàn:** database được đóng dấu deployment (chain id + contract + hash block deploy). Khi Anvil khởi động lại
(chain mới) mà database vẫn chứa dữ liệu cũ, backend **từ chối khởi động** và hướng dẫn reset — tránh trộn dữ liệu hai chain.

**Reset dữ liệu off-chain** (database + audio luôn xóa cùng nhau; không xóa tay trong Neon):

```cmd
scripts\reset-local.bat     :: local: xóa database (SQLite hoặc Neon) + audio + trạng thái Anvil đã lưu, rồi hướng dẫn chạy lại
scripts\reset-db.bat        :: chỉ database + audio của NETWORK hiện tại (hỏi gõ RESET; thêm --yes để không hỏi)
scripts\fund-wallet.bat 0xDIA_CHI_VI   :: local: nạp 2.000 mUSDC cho ví MetaMask/Core của bạn để tự test (không cần ETH)
```

Hướng dẫn tự test mua dữ liệu / tạo chiến dịch bằng ví thật: [RUN_PROJECT.md](RUN_PROJECT.md) mục 4.

Reset **không xóa được blockchain**. Muốn "chỉ còn dữ liệu mẫu" ở local thì làm đủ: tắt backend + Anvil →
`scripts\reset-local.bat` → `scripts\start-anvil.bat` → `scripts\deploy-local.bat` → `scripts\start-backend.bat`.
Mainnet: script luôn từ chối. Fuji: cần thêm `--allow-fuji` — **không reset khi contract trên Fuji còn đang dùng**
(chain không xóa được, dữ liệu off-chain sẽ mất vĩnh viễn); đổi contract thì dùng nhánh Neon / `DATABASE_SCHEMA` mới.

## 10. CLI `datasetmarketplace`

Lệnh có sẵn trong venv: `backend\.venv\Scripts\datasetmarketplace.exe`, hoặc dùng wrapper **`scripts\datasetmarketplace.bat`** (tự đặt UTF-8).
Mọi lệnh có `--help`. CLI gọi API thật và contract thật; ví test lấy từ mnemonic công khai của Anvil.

```cmd
scripts\datasetmarketplace.bat --help
scripts\datasetmarketplace.bat wallet init-local          :: deployer, buyer, creator, an, binh, labx, laby
scripts\datasetmarketplace.bat wallet list                :: số dư AVAX / mUSDC
scripts\datasetmarketplace.bat status

:: Người tạo
scripts\datasetmarketplace.bat demo faucet --as creator --amount 100
scripts\datasetmarketplace.bat campaign create --as creator --target-sec 30 --price-vnd 26000000 --seed-vnd 260000 --seed-vnd-per-min 13000
scripts\datasetmarketplace.bat campaign list
scripts\datasetmarketplace.bat campaign detail 1
scripts\datasetmarketplace.bat campaign terms 1

:: Người đóng góp (đăng nhập dev chỉ có khi NETWORK=local)
scripts\datasetmarketplace.bat login --as an
scripts\datasetmarketplace.bat consent sign 1 --as an --out an-consent.json
scripts\datasetmarketplace.bat consent submit 1 --as an --sig-file an-consent.json      :: (hoặc: consent give 1 --as an)
scripts\datasetmarketplace.bat prompt get 1 --as an
scripts\datasetmarketplace.bat contribution record 1 --as an --seconds 6               :: ghi âm TRỰC TIẾP từ micro
scripts\datasetmarketplace.bat contribution submit 1 --as an --audio tests\fixtures\audio\prompt00_hoaimy.wav --prompt-index 0
scripts\datasetmarketplace.bat contribution list --as an
scripts\datasetmarketplace.bat qc check tests\fixtures\audio\prompt00_hoaimy.wav "tôi muốn mở một tài khoản tiết kiệm có kỳ hạn sáu tháng"

:: Người mua
scripts\datasetmarketplace.bat demo faucet --as labx
scripts\datasetmarketplace.bat market price 1
scripts\datasetmarketplace.bat market buy 1 --as labx                                   :: approve + buy(maxPrice)
scripts\datasetmarketplace.bat market revenue 1

:: Tiền & thu hồi
scripts\datasetmarketplace.bat rewards balance --as an
scripts\datasetmarketplace.bat rewards quote 1 --as an
scripts\datasetmarketplace.bat rewards claim 1 --as an                                  :: qua relayer, phí ≈ 2.600 ₫
scripts\datasetmarketplace.bat rewards claim 1 --as binh --direct                       :: tự rút, không phí
scripts\datasetmarketplace.bat contribution revoke 0 --as an                            :: 0 = ID bản ghi on-chain
scripts\datasetmarketplace.bat rewards withdraw --as creator

:: Dataset — người tạo chiến dịch là chủ dữ liệu (không có lệnh quản trị)
scripts\datasetmarketplace.bat review list --as creator                                 :: bản ghi vùng xám chờ duyệt
scripts\datasetmarketplace.bat review approve 12 --as creator                           :: 12 = ID bản ghi trong hàng chờ
scripts\datasetmarketplace.bat review reject 13 --as creator --note "Đọc sai câu"       :: loại phải ghi lý do
scripts\datasetmarketplace.bat dataset snapshot 1 --as creator                          :: ký PublishSnapshot, relayer gửi
scripts\datasetmarketplace.bat dataset download 1 --as labx --out dataset.zip         :: kiểm proof Merkle + root on-chain
```

**Về nộp file audio:** `contribution submit --audio` **chỉ dành cho kiểm thử local**. Server vẫn áp dụng đầy đủ
chốt chặn "ghi âm trực tiếp": prompt token 60 giây dùng một lần, và **thời lượng audio không được dài hơn thời gian
từ lúc hiện câu** (CLI phải chờ đúng bằng thời lượng file như khi đọc thật). Tùy chọn `--prompt-index` (chọn câu khớp
file) chỉ có tác dụng khi `NETWORK=local` + `DEV_AUTH_ENABLED=true`; ở Fuji/mainnet câu luôn được chọn ngẫu nhiên.

## 11. Chạy test

```cmd
scripts\test-all.bat
```

| Bộ test | Lệnh riêng | Nội dung |
|---|---|---|
| Foundry (55) | `cd contracts && forge test -vv` | 7 test gốc của đề xuất + giá, thời hạn, quỹ mồi, chống phát lại, quyền (chỉ người tạo công bố phiên bản), hàm …WithSig, fuzz khả năng thanh toán |
| Unit + QC thật (66) | `cd backend && .venv\Scripts\python -m pytest tests/unit` | money, token, chuẩn hóa, CER, các bước QC, Merkle, EIP-712 (cả `PublishSnapshot`), cấu hình mạng, Backblaze B2 (giả lập HTTP: tải lên có SHA-1 + SSE, xóa mọi phiên bản, xác thực lại); model wav2vec2 + VAD thật trên audio thật, webm/opus |
| Tích hợp (14) | `.venv\Scripts\python -m pytest tests/integration` | **tự khởi chạy Anvil** ở cổng ngẫu nhiên, deploy contract thật, API thật, QC thật: toàn bộ luồng (người tạo ký công bố phiên bản, thu hồi khóa phiên bản cũ, người tạo công bố lại), thu hồi xóa file trên đĩa, người tạo duyệt/loại vùng xám, tự duyệt quá hạn, rate limit, chốt chặn mainnet (forge script trên chain id 43114) |
| PostgreSQL/Neon (5) | `set TEST_DATABASE_URL=<chuỗi Neon>` rồi `.venv\Scripts\python -m pytest tests/integration/test_postgres.py` | Toàn bộ luồng nghiệp vụ trên PostgreSQL thật trong một **schema tạm** (tự xóa sau test, không đụng dữ liệu dev); chốt chặn deployment; script reset xóa database + audio; khởi động lại chỉ còn seed. Bỏ qua nếu không đặt biến |

Lọc theo marker: `-m "not qc"` (bỏ test cần model), `-m integration`.

## 12. Demo end-to-end (không cần frontend)

Với Anvil + deploy + backend đang chạy (mục 8–9):

```cmd
scripts\demo-local.bat
```

1. **`demo e2e` — 52 kiểm tra** với audio tiếng Việt thật, QC thật, contract thật: faucet → người tạo soạn nháp +
   `createCampaign` (quỹ mồi) → An, Bình đồng thuận qua relayer (**số dư AVAX không đổi**) → chặn: chưa đồng thuận,
   file chuẩn bị sẵn, token dùng lại → QC loại bản ghi im lặng / đọc sai câu → An 2 bản ghi, Bình 3 bản ghi được ghi
   on-chain + tiền mồi → giá đúng công thức → Lab X mua, chia theo giây → người tạo ký công bố snapshot v1, tải + kiểm
   Merkle → An rút qua relayer (phí 0,1) rồi thu hồi → tiến độ, giá giảm, audio + salt bị xóa, phiên bản cũ bị khóa, link
   cũ trả 410 → người tạo ký công bố v2 → Lab Y mua rẻ hơn, An không được chia → Lab X tải lại chỉ còn bản ghi của Bình →
   Bình tự rút, người tạo rút.
2. **`demo scenario-611` — 12 kiểm tra** tái hiện đúng bảng §6.11 trên Anvil: 16.900.000 ₫ → An 5.408.000 ₫,
   Bình 8.112.000 ₫ → An rút + thu hồi → 13.260.000 ₫ → Bình tổng 18.720.000 ₫. (Kịch bản này cố ý bỏ qua QC: ví QC
   oracle local ghi trực tiếp 7.200/10.800 giây để có đúng con số.)

> Audio fixture chỉ nộp được **một lần mỗi deployment** (chống trùng toàn cục). Chạy lại `demo e2e`: dừng Anvil,
> `start-anvil.bat` → `deploy-local.bat` → khởi động lại `start-backend.bat`. `scenario-611` chạy lại lúc nào cũng được.

## 13. Cấu hình Local / Fuji / Mainnet

> **Danh sách đầy đủ mọi biến môi trường, biến nào bắt buộc ở mạng nào, và cách lấy từng giá trị** (tạo ví relayer, xin AVAX
> Fuji, lấy địa chỉ contract sau deploy, sinh `JWT_SECRET`/`TOKEN_SECRET`, tạo Google OAuth Client ID, tạo bucket Backblaze B2…):
> [`docs/environment-variables.md`](docs/environment-variables.md).

| | Local | Fuji | Mainnet |
|---|---|---|---|
| `NETWORK` | `local` | `fuji` | `mainnet` |
| File env backend | `backend\.env.local` | `backend\.env.fuji` | `backend\.env.mainnet` |
| Chain id | 31337 | 43113 | 43114 |
| Token | MockUSDC (tự mint) | MockUSDC | **USDC thật** (`TOKEN_ADDRESS` bắt buộc) |
| Tỷ giá | cố định `USDC_VND_RATE` (26.000) | cố định | HTTP `FX_URL`, cache 5 phút (bắt buộc) |
| `/demo/faucet` | có | có | **404** |
| Đăng nhập dev | có (`DEV_AUTH_ENABLED=true`) | **cấm** (bật ⇒ không khởi động) | **cấm** |
| SeedDemo | có | có | **script từ chối** |
| `JWT_SECRET`, `TOKEN_SECRET` | mặc định dev | **bắt buộc** (≥ 32 ký tự) | **bắt buộc** |
| Kho audio | đĩa (`storage\`) hoặc Backblaze B2 (`B2_*`) | khuyến nghị Backblaze B2 | Backblaze B2 |

Backend còn từ chối khởi động nếu: RPC trả chain id khác hồ sơ, không có contract tại địa chỉ, `TOKEN_DECIMALS` sai,
hoặc mainnet đang trỏ vào token `mUSDC`.

**Deploy Fuji (chưa thực hiện — cần AVAX test từ Core faucet và sự cho phép của đội):**

```cmd
cd contracts
set PRIVATE_KEY=<ví deploy của đội>
set QC_ORACLE=<ví relayer>
set CLAIM_FEE=100000
forge script script/Deploy.s.sol --rpc-url fuji --broadcast
set VOICE_CAMPAIGNS=<địa chỉ in ra>
set DEMO_BUYER=<ví người mua demo>
forge script script/SeedDemo.s.sol --rpc-url fuji --broadcast
:: verify trên Snowtrace theo hướng dẫn hiện hành; copy backend\.env.fuji.example -> .env.fuji, điền giá trị
scripts\start-backend.bat fuji
```

## 14. Danh sách API

Swagger đầy đủ: `http://127.0.0.1:8000/docs`. Mọi số tiền trả về có `units` (on-chain) và `vnd` + `display`.

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/auth/google` | Google ID token → JWT của ví đã gắn với email. Lần đầu kèm chữ ký ví để gắn (mỗi email một ví); thiếu ⇒ `409 wallet_required` |
| GET | `/auth/challenge` | Thông điệp để ví ký (EIP-191) |
| POST | `/auth/dev-login` | **Chỉ local**: đăng nhập không Google; quy tắc ví giống `/auth/google` |
| GET | `/fx` | Tỷ giá USDC/VND và nguồn |
| GET | `/campaigns` · `/campaigns/{id}` | Danh sách / chi tiết: tiến độ, giá VNĐ, số người, mẫu nghe thử, thống kê duyệt vùng xám |
| GET | `/campaigns/{id}/terms` | Điều khoản + đối chiếu `termsHash` |
| GET | `/campaigns/{id}/price` · `/revenue` · `/licenses/{addr}` | Báo giá, doanh thu, license |
| POST | `/campaigns/drafts` · `/campaigns/sync` | Soạn nháp (tham số `createCampaign`), đồng bộ sự kiện |
| GET/POST | `/consent/typed-data` · `/consent` | Dữ liệu EIP-712 · relayer gọi `giveConsentWithSig` |
| POST | `/campaigns/{id}/prompt` | Câu mẫu chưa đọc + prompt token (60 giây) |
| POST | `/contributions` | audio + token → QC → `registerContribution` |
| GET | `/me/contributions` · `/me/claim-quote` | Bản ghi, tiền chưa rút · báo giá rút hộ + dữ liệu ký |
| POST | `/claim` | relayer gọi `claimWithSig` |
| GET/POST | `/revoke/typed-data` · `/revoke` | relayer gọi `revokeWithSig`, xóa audio + salt |
| GET/POST | `/datasets/{id}/download-message` · `/datasets/{id}/download` | Ký chứng minh ví → kiểm license → link có hạn |
| GET | `/datasets/files/{token}` · `/datasets/{id}/snapshots/{v}` | Tải zip (audio + manifest + proof) · manifest công khai |
| POST | `/demo/faucet` | **Chỉ local/Fuji**: mint mUSDC |
| GET | `/creator/review` · `/creator/review/{id}/audio` | (chỉ người tạo) Hàng chờ vùng xám của chiến dịch mình · nghe bản ghi |
| POST | `/creator/review/{id}` | (chỉ người tạo) Duyệt ⇒ `registerContribution` · loại (bắt buộc `note`) ⇒ xóa audio |
| GET/POST | `/campaigns/{id}/snapshot-quote` · `/campaigns/{id}/snapshots` | (chỉ người tạo) Bản tóm tắt phiên bản + dữ liệu ký `PublishSnapshot` · relayer gọi `publishSnapshotWithSig` |
| GET | `/health` | RPC, DB, relayer, model QC, kho audio (`storage`: `local` hoặc `b2:…`) |
| GET | `/fees` | Bảng phí xử lý (VNĐ + USDC): tạo, mua, rút, rút hộ |
| GET/POST | `/campaigns/drafts/{id}/create-quote` · `/campaigns/drafts/{id}/create` | Hóa đơn + dữ liệu ký `CreateCampaign`/`Permit` · relayer gọi `createCampaignWithSig` |
| GET/POST | `/campaigns/{id}/buy-quote` · `/campaigns/{id}/buy` | Hóa đơn + dữ liệu ký `Buy`/`Permit` (không cần đăng nhập) · relayer gọi `buyWithSig` |
| GET/POST | `/creator/withdraw-quote` · `/creator/withdraw` | Doanh thu người tạo + dữ liệu ký `Withdraw` · relayer gọi `withdrawWithSig` |
| GET/POST | `/campaigns/{id}/seed-withdraw-quote` · `/campaigns/{id}/withdraw-seed` | Quỹ mồi còn dư + dữ liệu ký `WithdrawSeed` · relayer gọi `withdrawSeedWithSig` |

Không có endpoint quản trị: duyệt vùng xám và công bố phiên bản cần phiên đăng nhập của đúng ví người tạo chiến dịch
(implementation-plan §3 #28).

## 15. Frontend web

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript strict · Tailwind CSS 4 · viem + wagmi · motion ·
font Be Vietnam Pro. Hệ thống thiết kế: [`docs/frontend-design-system.md`](docs/frontend-design-system.md).

### Cài và chạy cùng backend + Anvil (4 cửa sổ CMD)

```cmd
scripts\start-anvil.bat          :: 1. chain local
scripts\deploy-local.bat         :: 2. deploy contract + chiến dịch mẫu (chạy một lần sau mỗi lần khởi động Anvil)
scripts\start-backend.bat        :: 3. API http://127.0.0.1:8000
scripts\start-frontend.bat       :: 4. web http://localhost:3000 (tự npm install + tạo .env.local lần đầu)
```

Frontend tự đọc địa chỉ contract/token từ `GET /health` của backend — không cần chép địa chỉ sau mỗi lần deploy.

### Dừng và chạy lại local

Nhấn `Ctrl+C` trong cửa sổ frontend, tiếp theo backend, cuối cùng Anvil. `deploy-local.bat` chạy xong tự kết thúc;
đóng tab trình duyệt không dừng ba dịch vụ trên.

Để giữ trạng thái blockchain, khởi chạy Anvil bằng `scripts\start-anvil.bat persist` và dừng bình thường bằng `Ctrl+C`.
Lần sau, nếu Anvil đã nạp lại trạng thái cũ và `contracts\deployments\31337.json` vẫn khớp contract trên chain thì
chỉ cần khởi động lại backend + frontend. Với Anvil không lưu trạng thái, cần deploy lại sau mỗi lần khởi động chain mới.
Audio nằm trong `storage\` (hoặc trên Backblaze B2 khi đặt `B2_*`); database nằm trong `storage\` (SQLite) hoặc trên Neon.
`scripts\reset-local.bat` là lệnh **xóa** dữ liệu local (database + audio, cả file trên B2), không phải lệnh dừng dịch vụ.

### Biến môi trường (`frontend/.env.local`, mẫu ở `frontend/.env.example`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | `local` | `local` · `fuji` · `mainnet` (chọn chain cho wagmi; mainnet ẩn faucet) |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Backend FastAPI (phải nằm trong `CORS_ORIGINS` của backend) |
| `NEXT_PUBLIC_RPC_URL` | RPC mặc định của mạng | RPC để đọc contract và chờ receipt |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | (trống) | Bật nút "Đăng nhập với Google" (Google Identity Services). Trống ⇒ chỉ có đăng nhập thử khi backend ở chế độ dev |

Không có bí mật nào trong frontend: khóa relayer/QC và khóa Backblaze B2 chỉ ở backend.
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` phải trùng `GOOGLE_CLIENT_ID` của backend — cách tạo: [`docs/environment-variables.md`](docs/environment-variables.md) mục 2.F.
Biến `NEXT_PUBLIC_*` được nhúng lúc build: đổi giá trị thì khởi động lại `npm run dev` / build lại.

`next.config.ts` đặt `devIndicators: false` nên nút "N" của Next.js không hiện ở góc màn hình khi chạy dev
(lỗi biên dịch/runtime vẫn được hiển thị).

### Cấu hình ví

**Hai cấp ví** (đề xuất §5 "Hai cấp ví"): ví trình duyệt là cấp cơ bản, chỉ dùng ở `/earn`; MetaMask/Core là cấp cao nhất,
dùng mọi vai trò. Contract chỉ biết địa chỉ ví, nên nạp ví trình duyệt vào MetaMask (cùng địa chỉ) là nâng cấp mà không mất gì.

- **Người đóng góp:** bước đầu `/earn` chọn **Tạo ví trên trình duyệt** hoặc **Dùng MetaMask / Core**.
  - Ví trình duyệt: tạo bằng viem, khóa riêng được **mã hóa bằng mật khẩu** (PBKDF2-SHA256 310.000 vòng + AES-GCM, WebCrypto)
    trong `localStorage`; khóa giải mã chỉ nằm trong bộ nhớ — tải lại trang phải nhập mật khẩu để mở khóa.
  - Cả hai loại đều chỉ **ký** EIP-712 (đồng thuận, rút tiền, thu hồi); relayer gửi giao dịch và trả gas.
  - **Sao lưu / nâng cấp:** thẻ "Sao lưu ví & nâng cấp lên MetaMask" ở trang Tổng quan → nhập mật khẩu → tải
    `vi-datasetmarketplace-0x….json` (keystore V3: PBKDF2-HMAC-SHA256 262.144 vòng + AES-128-CTR + MAC keccak256, `lib/keystore.ts`).
    MetaMask → Import account → **JSON File** → chọn file + mật khẩu ví → bấm **Kết nối MetaMask** trong hộp thoại (kiểm tra
    đúng địa chỉ). Cùng địa chỉ ⇒ cùng Gmail, cùng phiên đăng nhập, cùng tiền và quyền thu hồi. Hộp thoại rút tiền nhắc sao lưu
    nếu ví trình duyệt chưa có file.
  - **Đăng nhập Gmail, ví đi theo Gmail:** header là nút **Đăng nhập**. Lần đầu chọn ví để gắn với Gmail và ký xác nhận
    (lưu DB); các lần sau chỉ cần Gmail, web tự kết nối MetaMask vào đúng ví đó. MetaMask chọn nhầm tài khoản ⇒ cảnh báo +
    nút chọn tài khoản. Gmail gắn ví trình duyệt mà vào trang tạo chiến dịch / mua ⇒ hướng dẫn nâng cấp (implementation-plan §3 #27).
  - **Mật khẩu ví phải mạnh:** ít nhất 8 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt (ví dụ `MatKhau@2026`).
    Form hiển thị liên tục từng điều kiện (đạt/chưa đạt), thanh độ mạnh, thông báo "còn N điều kiện", và "hai mật khẩu đã
    khớp/chưa khớp"; nút "Tạo ví" chỉ bật khi đạt đủ. Quy tắc nằm ở `frontend/lib/password.ts` và được kiểm tra lại trong
    `lib/browserWallet.ts` khi tạo ví. Ô mật khẩu (tạo ví, mở khóa ví, tải file sao lưu) có nút **con mắt** để hiện/ẩn.
  - Ví tạo trước khi có quy tắc này vẫn mở khóa được bằng mật khẩu cũ (quy tắc chỉ áp dụng khi tạo ví mới).
- **Người mua / người tạo:** Core hoặc MetaMask. Với Anvil, thêm mạng thủ công trong ví: RPC `http://127.0.0.1:8386` (Anvil của dự án; 8545 chừa cho Hardhat),
  chain id `31337`, ký hiệu `ETH`; dùng ví của chính bạn và nạp mUSDC thử bằng `scripts\fund-wallet.bat 0xDIA_CHI_VI`
  (chỉ local) hoặc nút "Nhận mUSDC thử nghiệm" (faucet, local/Fuji).
  - **Không cần ETH/AVAX:** tạo chiến dịch, mua, rút doanh thu, rút quỹ mồi đều **chỉ ký** (permit EIP-2612 khi cần trừ tiền
    + chữ ký thao tác); nền tảng gửi giao dịch và trả phí mạng (implementation-plan §3 #25).
  - Hóa đơn bằng VNĐ: khoản tiền + **phí xử lý** (đã gồm phí mạng; mặc định tạo/mua ≈ 13.000 ₫, rút ≈ 2.600 ₫ —
    `RELAY_FEE_*_USDC`, `GET /fees`) + tổng + số dư ví; menu ví ở đầu trang hiện số dư VNĐ.
  - Wizard tạo chiến dịch nhập được **bộ câu mẫu từ file `.txt`** (UTF-8, mỗi dòng một câu, ≤ 500 KB). Ô số hiểu
    `26.000.000` là hàng nghìn, `0.5` và `0,5` là thập phân.

### Các route chính

| Route | Vai trò | Nội dung |
|---|---|---|
| `/` | mọi người | Landing: hero, số liệu trực tiếp, cách hoạt động, quyền lợi hai phía, máy tính chia doanh thu, đồng thuận & thu hồi, chiến dịch nổi bật, FAQ |
| `/explore` | người mua | Chợ dữ liệu: tìm kiếm, lọc trạng thái/vùng giọng, sắp xếp, thẻ nổi bật |
| `/datasets/[id]` | người mua | Chi tiết: tiến độ, đường giá, chia doanh thu, nghe thử, license, phiên bản Merkle, **mua** (chỉ ký: permit + Buy, nền tảng trả phí mạng) và **tải** |
| `/library` | người mua | Bộ dữ liệu ví đã mua + tải phiên bản mới nhất |
| `/earn` | người đóng góp | Onboarding (tạo/mở khóa ví trình duyệt **hoặc** kết nối MetaMask/Core → đăng nhập) rồi tổng quan thu nhập + thẻ sao lưu/nâng cấp ví |
| `/earn/campaigns`, `/earn/campaigns/[id]` | người đóng góp | Chọn chiến dịch, đọc & ký đồng thuận |
| `/earn/campaigns/[id]/record` | người đóng góp | Phòng ghi âm: câu mẫu, sóng âm theo micro, đồng hồ, hạn câu, kết quả QC dễ hiểu |
| `/earn/history`, `/earn/earnings` | người đóng góp | Bản ghi + **thu hồi**; thu nhập + **rút tiền** qua relayer |
| `/create`, `/create/new` | người tạo | "Chiến dịch của bạn": doanh thu, rút phần chia, quỹ mồi; mỗi chiến dịch có **hàng chờ duyệt** (nghe, duyệt / loại kèm lý do) và **phiên bản dataset** (xem bản tóm tắt → ký công bố). Wizard 5 bước tạo chiến dịch |

### Kiểm tra toàn bộ luồng nghiệp vụ trên trình duyệt

```cmd
cd frontend
npx playwright install chromium     :: lần đầu
npm run test:e2e                    :: 7 bước, 4 vai trò, chạy thật trên Anvil + backend + QC
npm run test:a11y                   :: axe WCAG 2.2 AA trên 7 trang + reduced motion + bàn phím
:: Test bản production ở cổng khác: npm run build, npx next start --port 3001, rồi
:: set E2E_BASE_URL=http://localhost:3001 và thêm cổng đó vào CORS_ORIGINS của backend
scripts\test-frontend.bat           :: typecheck + lint + build (thêm "e2e" để chạy Playwright)
```

Kịch bản e2e: người tạo đăng nhập Gmail (lần đầu gắn ví) → wizard tạo chiến dịch có quỹ mồi (ký permit + CreateCampaign, số dư ETH không đổi) → người
đóng góp tạo ví, đăng nhập, ký đồng thuận, **ghi âm qua micro** (Chromium phát một bản ghi tiếng Việt thật làm micro giả)
→ QC thật đạt, ghi on-chain + tiền mồi → người mua nhận mUSDC, ký permit + Buy → người tạo rút doanh thu bằng chữ ký → người đóng góp rút tiền qua relayer →
người tạo xem bản tóm tắt và ký công bố phiên bản (số dư ETH không đổi) → người mua tải zip từ thư viện → người đóng góp thu hồi. Ví người mua/người tạo trong test là
một EIP-1193 chuyển tiếp tới tài khoản dev của Anvil (`e2e/anvil-wallet.ts`, chỉ dùng trong test) — chữ ký và giao dịch thật.

Thử bằng tay: mở `http://localhost:3000/earn`, tạo ví, bấm **Tiếp tục bằng Google**, chọn chiến dịch mẫu #0, ký đồng thuận và đọc câu bằng micro của bạn.
Khung "Đăng nhập thử" (không cần Google) bị ẩn với người dùng, chỉ dành cho test tự động; muốn dùng tay ở local thì mở Console của
trình duyệt, chạy `localStorage.setItem("datasetmarketplace.devLogin", "1")` rồi tải lại trang (backend phải chạy `NETWORK=local`).

## 16. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `forge` / `anvil` không nhận | Chạy qua `scripts\*.bat` (tự thêm `%USERPROFILE%\.foundry\bin` vào PATH) hoặc chạy lại `scripts\setup.bat` |
| Chữ tiếng Việt bị lỗi trong CMD | Dùng `scripts\datasetmarketplace.bat` (đặt `chcp 65001` + UTF-8). Trong Git Bash: `python -X utf8 ...` |
| Backend: `Thiếu VOICE_CAMPAIGNS / TOKEN_ADDRESS` | Chưa deploy: chạy `scripts\deploy-local.bat` |
| Backend: `Không kết nối được RPC` | Anvil chưa chạy: `scripts\start-anvil.bat` |
| Sau khi khởi động lại Anvil, API báo lỗi lạ | Khởi động lại Anvil xóa chain ⇒ chạy lại `deploy-local.bat` **và** khởi động lại backend |
| CLI `401 Tài khoản không tồn tại` | Phiên cũ của deployment trước: `datasetmarketplace login --as <tên>` |
| Demo CLI báo `409 wallet_taken` | Ví test đã gắn email từ luồng khác, ví dụ Playwright. Chạy từng bộ trên deployment local sạch riêng; giữ nguyên liên kết email–ví của dữ liệu đang dùng. |
| `ValueError ... torch to at least v2.6` | Đang dùng torch < 2.6: cài lại theo `setup.bat` (torch 2.6.0 CPU) |
| `409 duplicate_audio` khi chạy lại `demo e2e` | Chống trùng hoạt động đúng; redeploy theo mục 12 |
| `400 not_live` khi nộp file | File dài hơn thời gian từ lúc hiện câu: dùng `contribution submit` (CLI tự chờ) hoặc `contribution record` |
| `429 rate_limited` | Vượt giới hạn; local faucet 200/giờ (`RATE_LIMIT_FAUCET`), có thể đặt `RATE_LIMIT_ENABLED=false` khi test |
| Tải model QC chậm / cảnh báo symlink trên Windows | Bình thường; model lưu ở `%USERPROFILE%\.cache\huggingface` |
| Cổng 8000/8386 bận | Đóng cửa sổ cũ, hoặc `netstat -ano \| findstr :8000` rồi `taskkill /PID <pid> /F`. Cổng 8545 thường là Hardhat/Scaffold-ETH của dự án khác — dự án này không dùng |
| Web báo "Không kết nối được máy chủ" | Backend chưa chạy, hoặc origin web không có trong `CORS_ORIGINS` (mặc định `http://localhost:3000,http://127.0.0.1:3000`) |
| Nút ví hiện "Chuyển sang Foundry/Anvil" | Ví đang ở mạng khác: bấm để chuyển, hoặc thêm mạng RPC `http://127.0.0.1:8386`, chain id 31337 |
| `/earn` hỏi lại mật khẩu sau khi tải lại trang | Đúng thiết kế: khóa ví chỉ được giải mã trong bộ nhớ |
| Nút "Tạo ví của tôi" không bấm được | Mật khẩu chưa đủ 5 điều kiện (xem danh sách dưới ô mật khẩu) hoặc hai lần nhập chưa khớp |
| Quên mật khẩu ví | Không khôi phục được (khóa chỉ mã hóa trên máy bạn). Rút hết tiền trước khi xóa dữ liệu trình duyệt |
| Backend báo "Database đang chứa dữ liệu của một deployment khác" | Đúng thiết kế: Anvil đã khởi động lại (chain mới) nhưng database (thường là Neon) còn dữ liệu chain cũ. Local: tắt backend → `scripts\reset-db.bat` → chạy lại backend. Fuji: không reset — dùng nhánh Neon / `DATABASE_SCHEMA` khác |
| Backend báo "Không kết nối/migrate được database" | Kiểm tra `DATABASE_URL` (đúng chuỗi Neon, có `sslmode=require`) và mạng; nhánh Neon có thể đang ngủ — thử lại sau vài giây |
| Bản ghi bị loại "chưa nghe rõ giọng" dù đã đọc | Bấm **Dừng** ngay khi đọc xong — khoảng lặng dài làm tỷ lệ giọng nói < 50% (quy tắc QC §10.1) |
| `npm run dev` báo `EADDRINUSE :::3000`, hoặc trang lỗi 500 "Jest worker encountered … child process exceptions" | Còn một tiến trình `next dev` cũ treo ở cổng 3000. Đóng cửa sổ CMD cũ, hoặc `netstat -ano \| findstr :3000` rồi `taskkill /PID <pid> /F`, sau đó chạy lại `scripts\start-frontend.bat` |
| Trình duyệt chặn micro | Bấm biểu tượng ổ khóa trên thanh địa chỉ → cho phép Micro; trang phải chạy trên `localhost` hoặc HTTPS |
| Google báo *"Access blocked … has not completed the Google verification process"* / `access_denied` | Ứng dụng OAuth còn ở **Testing** (chỉ Test users vào được). Google Auth Platform → Audience → **Publish app** → In production ([`docs/environment-variables.md`](docs/environment-variables.md) mục F, bước 7) |
| Nút Google báo *"The given origin is not allowed for the given client ID"* | Đang mở `http://127.0.0.1:3000` (Google không nhận địa chỉ IP) hoặc origin chưa có trong *Authorized JavaScript origins*. Mở `http://localhost:3000` |

## 17. Giới hạn hiện tại và công việc còn lại

- **Chưa deploy Fuji / verify Snowtrace** — cần AVAX từ Core faucet và sự cho phép; đã có script và `.env.fuji.example`.
- **`POST /auth/google` chưa thử với ID token Google thật** (cần người đăng nhập bằng tài khoản Google); luồng dev login
  dùng chung logic gắn ví.
- **Ngưỡng QC** đang theo đề xuất; chưa hiệu chỉnh bằng 50 bản đúng / 50 bản sai của người thật (§10.4). Fixture
  test là giọng đọc neural (edge-tts) tiếng Việt — audio thật nhưng không phải người thật, không có giọng vùng miền.
- **Chống TTS (anti-spoofing)** nằm trong lộ trình (§7.8); MVP chống bằng quy trình (token 60 giây, kiểm thời lượng).
- **QC oracle tập trung** (§9.5) — điểm tin cậy duy nhất.
- **Contract chưa audit.** Đã sửa một lỗi làm tròn của bản gốc có thể khiến contract thiếu tiền (xem
  `docs/implementation-plan.md` §3 mục 1).
- **Frontend:** đã hoàn thiện mọi màn hình theo đề xuất và kiểm thử trên Chromium (e2e + axe). Chưa thử trên Safari/Firefox
  thật và trên điện thoại thật (đã kiểm responsive 375–1440px bằng trình duyệt giả lập); chưa thử với micro thật của
  người dùng (e2e dùng micro giả phát bản ghi thật); chưa thử Core/MetaMask thật (e2e dùng ví EIP-1193 nối Anvil).
- **Đăng nhập Google trên web**: Client ID thật đã cấu hình; đã kiểm tra tự động rằng Google nhận origin
  `http://localhost:3000` (nút tải HTTP 200) và từ chối `127.0.0.1`. Chưa có ai đăng nhập hết luồng bằng tài khoản Google
  thật (cần người bấm). Ứng dụng OAuth phải được *Publish* (In production) thì mọi Gmail mới vào được.
- Khi gom nhiều thao tác: chưa có trang "Lịch sử rút tiền" riêng (backend chưa có endpoint liệt kê `Claimed` theo ví);
  thu nhập hiển thị tiền chưa rút + số dư on-chain của ví.
- `setup.bat` chưa được chạy lại trên một máy Windows trắng; các script khác đã chạy thật trong CMD.
