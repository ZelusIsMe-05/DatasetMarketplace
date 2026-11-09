# Biến môi trường Dataset Marketplace — cần lấy gì và lấy ở đâu

Danh sách này lấy trực tiếp từ code: `backend/app/core/config.py`, `contracts/script/*.s.sol`, `frontend/lib/config.ts`,
`backend/cli/`. **Không commit file `.env` thật** — chỉ các file `*.example` được commit (đã kiểm bằng `git check-ignore`).

| File | Ai đọc | Tạo từ |
|---|---|---|
| `backend/.env.local` · `.env.fuji` · `.env.mainnet` | Backend FastAPI (chọn theo `NETWORK`) | `backend/.env.local.example`, `.env.fuji.example`, `.env.mainnet.example` |
| `contracts/.env` *(tùy chọn)* | `forge script` (Deploy, SeedDemo) | `contracts/.env.example` — ở local, `scripts\deploy-local.bat` tự đặt biến, không cần file này |
| `frontend/.env.local` (hoặc biến trên Vercel) | Next.js (chỉ biến `NEXT_PUBLIC_*`) | `frontend/.env.example` |
| Biến hệ thống *(tùy chọn)* | CLI `datasetmarketplace` | — |

---

## 1. Chạy LOCAL (Anvil): gần như không phải điền gì

`scripts\setup.bat` đã tự copy `backend\.env.local` và `frontend\.env.local`. Địa chỉ contract được backend đọc từ
`contracts\deployments\31337.json` sau `scripts\deploy-local.bat`; frontend đọc lại từ `GET /health`.

| Biến | Giá trị sẵn có | Có cần đổi? |
|---|---|---|
| `NETWORK` | `local` | Không |
| `RELAYER_PRIVATE_KEY` | khóa anvil #0 (công khai) | Không — **chỉ dùng local** |
| `USDC_VND_RATE` | `26000` | Tùy ý |
| `DEV_AUTH_ENABLED` | `true` | Không — cho phép "Đăng nhập thử" ở local (CLI demo và test tự động dùng; trên web khung này ẩn, chỉ hiện khi trình duyệt có `localStorage["datasetmarketplace.devLogin"]="1"`) |
| `QC_PRELOAD` | `true` | Không |
| `JWT_SECRET`, `TOKEN_SECRET` | bỏ trống ⇒ khóa dev mặc định | Không ở local |
| `REVIEW_AUTO_APPROVE_HOURS` | bỏ trống ⇒ `72` | Tùy ý — chủ chiến dịch chưa duyệt bản ghi vùng xám sau số giờ này thì tự duyệt (`0` = chờ mãi) |
| `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET` | bỏ trống ⇒ audio lưu trên đĩa | Tùy chọn — lưu audio trên Backblaze B2 (mục 1c) |

**Chỉ cần làm thêm nếu muốn thử nút "Đăng nhập với Google" ở local:** lấy Google Client ID (mục 3.F) rồi đặt cùng một giá
trị vào `GOOGLE_CLIENT_ID` (backend) và `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend), thêm origin `http://localhost:3000`.

### 1b. (Tùy chọn) Database trên Neon thay cho SQLite

1. Đăng ký **neon.tech** (gói Free), tạo project, region **AWS Asia Pacific (Singapore)**.
2. Nhánh: giữ `production` cho Fuji; **Create child branch** → tên `dev`, **Auto-delete: Never** (nếu đặt hạn, nhánh và dữ
   liệu tự bị xóa), kiểu *Branch data and schema*.
3. Chọn nhánh `dev` → nút **Connect** (cột trái) → Database `neondb`, Role `neondb_owner`, **tắt Connection pooling** →
   *Connection string* → **Show password** → **Copy**.
4. Thêm vào `backend\.env.local` (file đã nằm trong `.gitignore`; không dán chuỗi này vào chat/issue):

```dotenv
DATABASE_URL=postgresql://neondb_owner:<mật-khẩu>@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

5. Khởi động backend: `GET /health` trả `"database": "postgresql"`. Lỡ để lộ mật khẩu: Neon → *Roles* → *Reset password*
   rồi cập nhật lại dòng trên.

Database Neon dùng chung qua các lần khởi động lại Anvil, nên khi chain mới mà database còn dữ liệu cũ, backend từ chối khởi
động — chạy `scripts\reset-db.bat` (xóa database + audio cùng lúc). Audio lưu trên đĩa máy backend (`storage\`), trừ khi
bật Backblaze B2 (mục 1c).

### 1c. (Tùy chọn) Lưu audio trên Backblaze B2 thay cho đĩa

Mặc định audio nằm trên đĩa máy chạy backend (`storage\`). Đặt đủ ba biến `B2_*` thì file `.wav` được lưu trên
**Backblaze B2** (implementation-plan §3 #29). Backend dùng API gốc của B2 nên **không cần endpoint S3**, chỉ cần keyID,
applicationKey và tên bucket.

1. Đăng ký **backblaze.com** → *B2 Cloud Storage* → **Buckets** → **Create a Bucket**: đặt tên (duy nhất toàn hệ thống,
   vd. `datasetmarketplace-audio`), **Files in Bucket are: Private**, Default Encryption **Enable** (SSE-B2), Object Lock
   **Disable**. Bucket bắt buộc **riêng tư**: audio chỉ được tải qua backend.
2. **Application Keys** → **Add a New Application Key**: đặt tên, *Allow access to Bucket(s)* chọn **đúng bucket vừa tạo**,
   *Type of Access* **Read and Write** → **Create New Key**. Copy ngay **keyID** và **applicationKey** (applicationKey chỉ
   hiện **một lần**). Không dùng *Master Application Key*.
3. Thêm vào `backend\.env.local` (hoặc `.env.fuji`) — các file này nằm trong `.gitignore`; không dán khóa vào chat/issue:

```dotenv
B2_KEY_ID=<keyID>
B2_APPLICATION_KEY=<applicationKey>
B2_BUCKET=<tên bucket>
```

4. Khởi động backend: dòng log `Container sẵn sàng: … audio=b2:<bucket>/<network>-<fingerprint>` và `GET /health` trả
   `"storage": "b2:..."`. Sai khóa, sai bucket hoặc bucket đang để **Public** ⇒ backend **dừng ngay** với thông báo rõ
   (không lặng lẽ lưu ra đĩa).
   Có `B2_BUCKET` mà thiếu khóa ⇒ lỗi cấu hình.

Ghi chú: mỗi deployment có tiền tố riêng `<network>-<fingerprint>/audio/<chiến dịch>/<uuid>.wav`, database chỉ lưu phần
`audio/...`. Thu hồi đồng thuận hoặc bị loại ⇒ xóa **mọi phiên bản** của file trên B2. `scripts\reset-db.bat` /
`reset-local.bat` xóa database và mọi file B2 có tiền tố `<network>-` cùng lúc. Lỡ lộ applicationKey: Backblaze →
*Application Keys* → **Delete** key đó, tạo key mới rồi cập nhật `.env`.

---

## 2. Danh sách việc cần làm cho FUJI (nộp bài)

| # | Việc | Ra được biến |
|---|---|---|
| A | Tạo 2 ví mới: ví deploy và ví relayer/QC oracle | `PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `QC_ORACLE` |
| B | Xin AVAX test cho 2 ví đó | (gas) |
| C | Deploy contract lên Fuji | `VOICE_CAMPAIGNS`, `TOKEN_ADDRESS`, `DEPLOY_BLOCK` |
| D | Tạo ví người mua demo + chạy SeedDemo | `DEMO_BUYER` |
| E | Sinh các khóa bí mật | `JWT_SECRET`, `TOKEN_SECRET` |
| F | Tạo Google OAuth Client ID | `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| G | Có địa chỉ public của backend và frontend | `API_PUBLIC_URL`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL` |
| H | (Khuyến nghị) Tạo bucket Backblaze B2 riêng tư + application key cho audio (mục 1c) | `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET` |

> Chỉ gửi giao dịch lên Fuji khi cả đội đã đồng ý; mọi lệnh dưới đây chạy trong CMD tại thư mục gốc dự án.

### A. Tạo ví (deploy, relayer)

```cmd
%USERPROFILE%\.foundry\bin\cast wallet new
%USERPROFILE%\.foundry\bin\cast wallet new
```

Mỗi lệnh in ra `Address` và `Private key`. Dùng ví thứ nhất làm **ví deploy** (`PRIVATE_KEY`), ví thứ hai làm
**relayer + QC oracle** (`RELAYER_PRIVATE_KEY` ở backend, địa chỉ của nó là `QC_ORACLE` khi deploy). Lưu khóa vào trình quản
lý mật khẩu; ví relayer chỉ nên chứa ít AVAX (đề xuất §15). Có thể tạo ví bằng Core/MetaMask rồi xuất private key cũng được.

### B. Xin AVAX test

Vào **Core faucet** (core.app → Tools → Testnet Faucet), chọn mạng **Avalanche Fuji C-Chain**, nhập địa chỉ ví deploy và ví
relayer (dùng coupon của ban tổ chức nếu faucet yêu cầu). Kiểm tra số dư:

```cmd
%USERPROFILE%\.foundry\bin\cast balance <ĐỊA_CHỈ> --ether --rpc-url https://api.avax-test.network/ext/bc/C/rpc
```

### C. Deploy contract lên Fuji

```cmd
cd contracts
set PRIVATE_KEY=<private key ví deploy>
set QC_ORACLE=<địa chỉ ví relayer>
set CLAIM_FEE=100000
forge script script/Deploy.s.sol --rpc-url fuji --broadcast
```

Script in ra và ghi file `contracts\deployments\43113.json`:

| Trường trong file | Biến backend |
|---|---|
| `voiceCampaigns` | `VOICE_CAMPAIGNS` |
| `token` | `TOKEN_ADDRESS` (MockUSDC trên Fuji) |
| `deployBlock` | `DEPLOY_BLOCK` |

Nếu file `43113.json` có trong repo, backend tự đọc 3 giá trị này — vẫn nên ghi rõ vào `backend\.env.fuji`.

### D. Ví người mua demo + dữ liệu demo

Tạo thêm một ví (`cast wallet new` hoặc MetaMask) cho giám khảo thử mua, rồi:

```cmd
set VOICE_CAMPAIGNS=<voiceCampaigns ở bước C>
set DEMO_BUYER=<địa chỉ ví người mua demo>
forge script script/SeedDemo.s.sol --rpc-url fuji --broadcast
```

SeedDemo mint 2.000 mUSDC và chuyển `DEMO_BUYER_GAS_WEI` (mặc định 0,05 AVAX) từ ví deploy sang ví người mua.

### E. Sinh khóa bí mật (mỗi biến một giá trị khác nhau, ≥ 32 ký tự)

```cmd
backend\.venv\Scripts\python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Chạy 2 lần, lấy 2 chuỗi cho `JWT_SECRET`, `TOKEN_SECRET`. Ngoài local, backend **từ chối khởi động** nếu
thiếu hoặc `JWT_SECRET`/`TOKEN_SECRET` ngắn hơn 32 ký tự.

### F. Google OAuth Client ID

1. Vào **Google Cloud Console** → tạo (hoặc chọn) một project.
2. Cấu hình màn hình đồng ý OAuth (*OAuth consent screen* / *Google Auth Platform*): loại **External**, tên ứng dụng
   "Dataset Marketplace", email hỗ trợ; khi còn ở chế độ thử nghiệm, thêm email của đội và giám khảo vào **Test users**.
3. *Credentials* → *Create credentials* → **OAuth client ID** → loại **Web application**.
4. **Authorized JavaScript origins**: thêm `http://localhost`, `http://localhost:3000` (local) và domain frontend public
   (ví dụ `https://datasetmarketplace.vercel.app`). Nút đăng nhập dạng popup không cần *redirect URI*.
5. Copy **Client ID** (dạng `xxxxxxxx.apps.googleusercontent.com`) — **không cần client secret** (backend chỉ xác minh ID token).
6. Đặt **cùng một giá trị** cho `GOOGLE_CLIENT_ID` (backend) và `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend).
7. **Cho mọi tài khoản Gmail đăng nhập** (không chỉ Test users): nút *Publish app* bị mờ cho tới khi trang **Branding** có đủ
   tên ứng dụng, email hỗ trợ, **trang chủ** và **chính sách quyền riêng tư** trên một tên miền thật (không nhận `localhost`)
   cùng **Authorized domains** tương ứng. Hai trang này nằm ở thư mục `site/` và được đăng bằng GitHub Pages (nhánh `gh-pages`,
   repo phải public): trang chủ `https://zelusisme-05.github.io/DatasetMarketplace/`, chính sách
   `https://zelusisme-05.github.io/DatasetMarketplace/privacy.html`, miền `zelusisme-05.github.io`. Sau đó *Google Auth
   Platform* → **Audience** → *Publishing status* **Testing** → bấm **Publish app** → xác nhận → trạng thái thành **In production**. Ứng dụng chỉ xin `openid`/`email`/`profile`
   (scope không nhạy cảm) nên **không cần** Google xác minh; đừng tải logo lên ở mục *Branding* (có logo ⇒ phải chờ xác minh
   thương hiệu). Ở *Testing*, tài khoản ngoài danh sách bị chặn với lỗi *"Access blocked … has not completed the Google
   verification process"* / `access_denied`.
8. Mở web bằng **`http://localhost:3000`**, không phải `http://127.0.0.1:3000` — Google không nhận địa chỉ IP làm origin
   (nút báo *"The given origin is not allowed for the given client ID"*; giao diện hiện nhắc chuyển sang localhost).
   Máy khác/điện thoại cần một domain HTTPS (deploy hoặc tunnel) và thêm domain đó vào bước 4.

Backend chấp nhận **mọi** email Google đã xác minh (`email_verified`), không giới hạn domain; mỗi email gắn đúng một ví.

### G. Địa chỉ public

- `API_PUBLIC_URL`: URL backend mà trình duyệt truy cập được (ví dụ `https://api.datasetmarketplace.example`) — dùng để tạo link tải
  dataset, metadataURI, mẫu nghe thử.
- `CORS_ORIGINS`: URL frontend (nhiều giá trị ngăn cách bằng dấu phẩy), ví dụ `https://datasetmarketplace.vercel.app`.
- `NEXT_PUBLIC_API_URL` (frontend) = `API_PUBLIC_URL`.

### Kết quả: `backend\.env.fuji`

```dotenv
NETWORK=fuji
VOICE_CAMPAIGNS=0x...            # bước C
TOKEN_ADDRESS=0x...              # bước C
DEPLOY_BLOCK=12345678            # bước C
RELAYER_PRIVATE_KEY=0x...        # bước A (ví relayer)
USDC_VND_RATE=26000
JWT_SECRET=...                   # bước E
TOKEN_SECRET=...                 # bước E
GOOGLE_CLIENT_ID=...apps.googleusercontent.com   # bước F
DEV_AUTH_ENABLED=false
API_PUBLIC_URL=https://...       # bước G
CORS_ORIGINS=https://...         # bước G
REVIEW_AUTO_APPROVE_HOURS=72
B2_KEY_ID=...                    # bước H (bỏ cả ba dòng B2_* nếu lưu audio trên đĩa)
B2_APPLICATION_KEY=...           # bước H — bí mật
B2_BUCKET=...                    # bước H
```

### Kết quả: frontend (Vercel → Project → Settings → Environment Variables, hoặc `frontend\.env.local`)

```dotenv
NEXT_PUBLIC_NETWORK=fuji
NEXT_PUBLIC_API_URL=https://...                 # = API_PUBLIC_URL
NEXT_PUBLIC_RPC_URL=                            # bỏ trống = RPC công khai của Fuji
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
```

Biến `NEXT_PUBLIC_*` được nhúng vào bundle lúc build ⇒ đổi giá trị thì phải build/deploy lại frontend.

---

## 3. Thêm cho MAINNET (sau hackathon)

| Biến | Lấy ở đâu |
|---|---|
| `USDC_ADDRESS` (contracts) và `TOKEN_ADDRESS` (backend) | Địa chỉ USDC chính thức của Circle trên Avalanche C-Chain — tra tại trang *USDC contract addresses* trên developers.circle.com và đối chiếu trên Snowtrace trước khi dùng. Deploy script từ chối nếu địa chỉ không phải contract |
| `FX_URL`, `FX_JSON_KEY` | Một endpoint HTTP trả JSON có trường số ở cấp ngoài cùng = số VNĐ cho 1 USDC (ví dụ `{"rate": 26150}`); `FX_JSON_KEY` là tên trường đó. Nếu nhà cung cấp trả JSON lồng nhau, cần một proxy nhỏ để làm phẳng. Bắt buộc ở mainnet |
| `VOICE_CAMPAIGNS`, `DEPLOY_BLOCK` | Từ lần deploy mainnet (`--rpc-url mainnet`) — mainnet **không** đọc file `deployments/` |
| AVAX thật | Mua trên sàn, chuyển vào ví deploy và ví relayer |

Không chạy SeedDemo, không có faucet, không có đăng nhập thử ở mainnet (đều bị chặn trong code).

---

## 4. Tra cứu đầy đủ

### Backend (`backend/.env.<network>`)

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `NETWORK` | — | `local` | `local` · `fuji` · `mainnet` |
| `RELAYER_PRIVATE_KEY` | **mọi mạng** | — | Ví trả gas cho đồng thuận, rút tiền hộ, thu hồi, faucet |
| `QC_ORACLE_PRIVATE_KEY` | không | = relayer | Ví gọi `registerContribution` (và gửi hộ `publishSnapshotWithSig` đã được chủ chiến dịch ký); phải đúng `qcOracle` on-chain |
| `VOICE_CAMPAIGNS`, `TOKEN_ADDRESS` | mainnet | đọc `contracts/deployments/<chainId>.json` | Địa chỉ contract và token |
| `DEPLOY_BLOCK` | không | từ file deployments, hoặc `0` | Block bắt đầu quét sự kiện |
| `RPC_URL` | không | RPC mặc định của mạng | Đổi khi dùng RPC riêng |
| `TOKEN_DECIMALS` | không | `6` | Phải khớp `decimals()` của token |
| `USDC_VND_RATE` | không | `26000` | Tỷ giá cố định (local/Fuji) |
| `FX_URL`, `FX_JSON_KEY` | mainnet | — / `rate` | Tỷ giá qua HTTP, cache 5 phút |
| `JWT_SECRET`, `TOKEN_SECRET` | fuji, mainnet | khóa dev (chỉ local) | Ký phiên đăng nhập / prompt token & link tải (≥ 32 ký tự) |
| `GOOGLE_CLIENT_ID` | để bật đăng nhập Google | — | Client ID OAuth (mục 2.F) |
| `DEV_AUTH_ENABLED` | — | `true` ở local | **Chỉ được bật ở local**, mạng khác bật ⇒ không khởi động |
| `API_PUBLIC_URL` | fuji, mainnet | `http://127.0.0.1:8000` | URL public của backend |
| `CORS_ORIGINS` | fuji, mainnet | `http://localhost:3000,http://127.0.0.1:3000` | Origin frontend được phép gọi API |
| `STORAGE_DIR` | không | `storage/` | Chỉ dùng khi còn dữ liệu cục bộ: audio khi không bật B2, file SQLite khi không có `DATABASE_URL`. Có cả Neon + B2 ⇒ backend không tạo thư mục này |
| `B2_KEY_ID` · `B2_APPLICATION_KEY` · `B2_BUCKET` | không | trống ⇒ lưu đĩa | Backblaze B2 (mục 1c): đặt đủ ba ⇒ audio lưu trên bucket riêng tư, mã hóa phía máy chủ; có bucket mà thiếu khóa ⇒ lỗi cấu hình; sai khóa/bucket ⇒ không khởi động (implementation-plan §3 #29). `B2_APPLICATION_KEY` là bí mật |
| `DATABASE_URL` | không | SQLite trong `STORAGE_DIR` | Chuỗi PostgreSQL, ví dụ Neon (mục 1b). Dán nguyên `postgresql://...?sslmode=require` |
| `DATABASE_SCHEMA` | không | schema mặc định (`public`) | Schema PostgreSQL riêng (chữ thường, số, `_`) — tách dữ liệu nhiều deployment trong một database |
| `TEST_DATABASE_URL` | không (chỉ test) | — | Bật `tests/integration/test_postgres.py`; test chạy trong schema tạm rồi tự xóa |
| `SESSION_TTL_SEC` · `PROMPT_TOKEN_TTL_SEC` · `DOWNLOAD_TOKEN_TTL_SEC` · `SIGNATURE_MAX_AGE_SEC` | không | 43200 · 60 · 600 · 300 | Thời hạn phiên, câu mẫu, link tải, chữ ký |
| `RATE_LIMIT_ENABLED` · `RATE_LIMIT_FAUCET` | không | `true` · 200/giờ (local), 5/giờ (khác) | Giới hạn tần suất |
| `FAUCET_MAX_USDC` · `MAX_UPLOAD_BYTES` | không | 2000 · 5 MB | Giới hạn faucet, kích thước audio |
| `RELAY_FEE_CREATE_USDC` · `RELAY_FEE_BUY_USDC` · `RELAY_FEE_WITHDRAW_USDC` | không | `0.5` · `0.5` · `0.1` (≈ 13.000 ₫ · 13.000 ₫ · 2.600 ₫ ở tỷ giá 26.000) | **Phí xử lý** (đã gồm phí mạng nền tảng trả hộ) khi tạo chiến dịch, mua, người tạo rút doanh thu / quỹ mồi — đơn vị USDC, nhận `0,5` hoặc `0.5`, tối đa 6 chữ số lẻ, `0` = miễn phí. Người dùng ký đúng số phí trên hóa đơn; đổi giá trị không cần deploy lại hợp đồng (implementation-plan §3 #25). Phí rút hộ của người đóng góp vẫn là `CLAIM_FEE` on-chain |
| `REVIEW_AUTO_APPROVE_HOURS` | không | `72` | Bản ghi vùng xám mà chủ chiến dịch chưa duyệt sau số giờ này ⇒ nền tảng tự duyệt; `0` = chờ mãi; phải ≥ 0 (implementation-plan §3 #28) |
| `INDEXER_INTERVAL_SEC` · `LOG_CHUNK_BLOCKS` | không | 5 · 2000 | Chu kỳ vòng nền (đồng bộ sự kiện, tự duyệt quá hạn, thử lại giao dịch lỗi) / độ rộng quét sự kiện |
| `QC_MODEL_ID` · `QC_NUM_THREADS` · `QC_PRELOAD` · `QC_WEIGHT_SOURCE` | không | wav2vec2 tiếng Việt · 2 · `false` · `speech` | Model và cách tính số giây |
| `QC_MIN_SEC` … `QC_MIN_WORD_SCORE` | không | theo đề xuất §10.3 | Ngưỡng QC (hiệu chỉnh theo §10.4) |

### Contracts (`forge script`)

| Biến | Script | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `PRIVATE_KEY` | Deploy, SeedDemo | có | Ví deploy (owner = nền tảng) |
| `QC_ORACLE` | Deploy | không (= ví deploy) | Địa chỉ ví relayer/QC oracle |
| `FEE_COLLECTOR` | Deploy | không (= `QC_ORACLE`) | Ví nhận phí rút hộ |
| `CLAIM_FEE` | Deploy | không (`0`) | Phí rút hộ, đơn vị token (`100000` = 0,1 USDC) |
| `USDC_ADDRESS` | Deploy | **mainnet** | USDC thật |
| `VOICE_CAMPAIGNS`, `DEMO_BUYER` | SeedDemo | có | Contract vừa deploy, ví người mua demo |
| `DEMO_BUYER_GAS_WEI`, `SEED_TARGET_SEC`, `SEED_DAYS`, `SEED_METADATA_URI`, `SEED_DIR` | SeedDemo | không | 0,05 AVAX · 36000 · 30 · `seed:demo-campaign` · `../seed/demo-campaign` |

### Frontend (`NEXT_PUBLIC_*`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NEXT_PUBLIC_NETWORK` | `local` | Chọn chain cho ví; mainnet ẩn faucet |
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | Backend |
| `NEXT_PUBLIC_RPC_URL` | RPC mặc định của mạng | Đọc contract, chờ receipt |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | (trống ⇒ ẩn nút Google) | Phải trùng `GOOGLE_CLIENT_ID` của backend |

Không đặt bất kỳ khóa riêng hay bí mật nào vào biến `NEXT_PUBLIC_*` — chúng hiển thị công khai trong trình duyệt.

### CLI `datasetmarketplace` (biến hệ thống, tùy chọn)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATASETMARKETPLACE_API` | `http://127.0.0.1:8000` | Backend CLI gọi tới |
| `DATASETMARKETPLACE_RPC` | `http://127.0.0.1:8386` | RPC cho thao tác ví người tạo/người mua (Anvil của dự án, cổng 8386) |
| `DATASETMARKETPLACE_CLI_HOME` | `backend/.datasetmarketplace-cli/` | Nơi lưu ví test + phiên đăng nhập của CLI |
