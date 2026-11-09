# DatasetMarketplace — Hướng dẫn chạy dự án

Hướng dẫn chạy local trên Windows, trích từ [README](README.md#6-yêu-cầu-môi-trường-windows),
các mục 6–9, 12, 15–16 và đối chiếu với các script trong `scripts/`.
Chạy các khối lệnh dưới đây trong **Windows CMD**, từ thư mục gốc dự án.

## 1. Chuẩn bị máy

- Windows 10/11, Python 3.11 trở lên, Node.js 20 trở lên và Git có trong `PATH`.
- Internet để tải dependency và model QC lần đầu; dự trù khoảng 3 GB ổ đĩa.
- Không cần GPU. Model kiểm tra giọng nói chạy bằng CPU.
- Foundry được `setup.bat` cài nếu chưa có; các script tự thêm thư mục Foundry vào `PATH` của cửa sổ hiện tại.

Trong các ví dụ, dự án nằm ở `D:\Hackathon`; thay đường dẫn này nếu bạn đặt ở nơi khác.

## 2. Cài đặt lần đầu

```cmd
cd /d D:\Hackathon
scripts\setup.bat
```

Script cài dependency contract, backend, frontend; tạo Python venv; build contract; xuất ABI; tải model QC;
tạo các file env local từ mẫu nếu chưa có. Chờ script hoàn thành trước khi chạy các bước tiếp theo.

| Thành phần | File cấu hình chạy local | File mẫu |
|---|---|---|
| Backend | `backend/.env.local` | `backend/.env.local.example` |
| Frontend | `frontend/.env.local` | `frontend/.env.example` |

Giữ cấu hình mạng `local`. Mặc định API là `http://127.0.0.1:8000`, RPC là `http://127.0.0.1:8386` (Anvil của dự án; cổng 8545 để trống cho
Hardhat/Scaffold-ETH của dự án khác chạy song song).
Chi tiết các biến cấu hình: [docs/environment-variables.md](docs/environment-variables.md).

## 3. Khởi động dự án

Mở **4 cửa sổ CMD**. Ba dịch vụ Anvil, backend và frontend chạy liên tục; cửa sổ deploy có thể đóng sau khi xong.

### Cửa sổ 1 — Blockchain local

```cmd
cd /d D:\Hackathon
scripts\start-anvil.bat
```

Giữ cửa sổ này mở. Anvil chạy chain `31337` tại `http://127.0.0.1:8386`. `deploy-local`, `fund-wallet` và backend từ chối chạy nếu node ở
cổng đó không phải Anvil (Hardhat cũng là chain 31337).

Nếu muốn lưu trạng thái qua các lần khởi động, dùng lệnh sau thay cho lệnh trên ngay từ đầu:

```cmd
scripts\start-anvil.bat persist
```

Không chạy đồng thời cả hai lệnh Anvil vì chúng dùng cùng cổng.

### Cửa sổ 2 — Deploy contract và dữ liệu mẫu

Đợi Anvil sẵn sàng, sau đó chạy:

```cmd
cd /d D:\Hackathon
scripts\deploy-local.bat
```

Script deploy `MockUSDC` + `VoiceCampaigns`, tạo chiến dịch mẫu và xuất ABI. Lệnh chạy xong tự kết thúc.
Địa chỉ contract được ghi vào `contracts\deployments\31337.json`; backend tự đọc file này.

### Cửa sổ 3 — Backend API và QC

```cmd
cd /d D:\Hackathon
scripts\start-backend.bat
```

Đợi backend báo khởi động hoàn tất. Nếu đang nạp model QC thì chờ thêm; giữ cửa sổ mở khi sử dụng dự án.

Khi sửa code backend và cần tự nạp lại, dùng lệnh sau thay cho lệnh trên:

```cmd
scripts\start-backend.bat local reload
```

### Cửa sổ 4 — Website

```cmd
cd /d D:\Hackathon
scripts\start-frontend.bat
```

Giữ cửa sổ này mở và truy cập [http://localhost:3000](http://localhost:3000).
Frontend tự lấy địa chỉ contract từ backend.

## 4. Kiểm tra và dùng thử

| Địa chỉ | Mục đích |
|---|---|
| [Website](http://localhost:3000) | Giao diện chính |
| [Người đóng góp](http://localhost:3000/earn) | Tạo/mở khóa ví, đăng nhập, tham gia ghi âm |
| [Swagger](http://127.0.0.1:8000/docs) | Tài liệu và thử API |
| [Health](http://127.0.0.1:8000/health) | Kiểm tra backend, chain, database và model QC |

Thử nhanh API từ một cửa sổ CMD khác:

```cmd
cd /d D:\Hackathon
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/campaigns
scripts\datasetmarketplace.bat status
```

Để thử vai trò người đóng góp, mở `/earn` và bấm **Tiếp tục bằng Google** trước. Lần đầu (Gmail chưa gắn ví), chọn một
trong hai để gắn với Gmail:
- **Tạo ví trên trình duyệt** (đặt mật khẩu mạnh), hoặc
- **Kết nối MetaMask / Core** rồi **Ký & gắn ví này**.

Các lần sau chỉ cần đăng nhập Gmail: web dùng đúng ví đã gắn (ví trình duyệt thì mở khóa bằng mật khẩu). Khung **Đăng nhập thử** đã ẩn khỏi giao diện (chỉ test tự động dùng); muốn bật tay ở
local: Console trình duyệt → `localStorage.setItem("datasetmarketplace.devLogin", "1")` → tải lại trang.
Chọn chiến dịch mẫu, đọc/ký đồng thuận và cho phép micro để ghi âm trực tiếp. Với ví trình duyệt, tải lại trang sẽ yêu cầu
mở khóa bằng mật khẩu đã đặt; thẻ **Sao lưu ví & nâng cấp lên MetaMask** ở trang Tổng quan cho tải file ví (nạp vào MetaMask
để dùng chính ví đó tạo chiến dịch và mua dữ liệu).

Nếu dùng đăng nhập Google, `GOOGLE_CLIENT_ID` của backend phải trùng `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
của frontend. Cách tạo và cấu hình nằm ở [mục Google OAuth](docs/environment-variables.md#f-google-oauth-client-id).
Sau khi đổi env, khởi động lại backend và frontend; frontend production cần build lại.

Người tạo/người mua dùng Core hoặc MetaMask. Với local, thêm mạng RPC `http://127.0.0.1:8386`,
chain ID `31337`; xem [cấu hình ví trong README](README.md#cấu-hình-ví).

### Tự test mua dữ liệu và tạo chiến dịch bằng MetaMask/Core

Người tạo chiến dịch và người mua **chỉ ký** trong ví — nền tảng gửi giao dịch và trả phí mạng (implementation-plan §3 #25),
nên ví **không cần ETH/AVAX**, chỉ cần **mUSDC** (tiền thử) cho quỹ mồi / giá mua và phí xử lý. Dùng ví MetaMask/Core
**của chính bạn** (tạo bằng "Cụm từ khôi phục bí mật"), rồi nạp mUSDC thử cho đúng ví đó.

1. Trong MetaMask/Core: thêm mạng (RPC `http://127.0.0.1:8386`, Chain ID `31337`, ký hiệu `ETH`; Anvil phải đang chạy),
   rồi sao chép địa chỉ ví (bấm tên tài khoản → biểu tượng sao chép).
2. Sau khi chạy `deploy-local` và `start-backend`, nạp mUSDC cho ví đó (địa chỉ là bắt buộc):
   ```cmd
   scripts\fund-wallet.bat 0xDIA_CHI_VI                    :: +2.000 mUSDC (≈ 52 triệu ₫)
   scripts\fund-wallet.bat 0xDIA_CHI_VI --usdc 500
   ```
   mUSDC được mint qua faucet của backend (hoặc bấm **Nhận mUSDC thử nghiệm** ngay trên web). `--eth N` chỉ cần khi muốn
   tự gửi giao dịch bằng ví (cộng bằng `anvil_setBalance`). Script từ chối chạy nếu `NETWORK` không phải `local` hoặc RPC
   không phải chain 31337. Trong ví: **Import token** `0x5FbDB2315678afecb367f032d93F642f64180aa3` (6 số thập phân) để
   thấy số dư mUSDC; menu ví trên web cũng hiện số dư bằng VNĐ.
3. **Tạo chiến dịch:** bấm **Đăng nhập** (header hoặc giữa trang `/create`) → Google. Lần đầu: **Kết nối MetaMask / Core** →
   **Ký & gắn ví này** (gắn ví với Gmail, chỉ một lần). Các lần sau web tự kết nối MetaMask vào đúng ví đã gắn; MetaMask đang
   chọn tài khoản khác thì web cảnh báo và có nút chọn lại. Gmail đã gắn ví trình duyệt ở `/earn` ⇒ hướng dẫn nâng cấp ví đó
   lên MetaMask, hoặc dùng Gmail **khác** (đăng nhập thử: cờ `datasetmarketplace.devLogin` như trên). Điền wizard (câu mẫu gõ
   tay hoặc **Nhập từ file .txt**) → kiểm tra hóa đơn VNĐ (quỹ mồi + **phí xử lý ≈ 13.000 ₫** = tổng trừ từ ví, số dư ví)
   → **Ký & tạo chiến dịch**: ví hỏi **ký 2 lần, miễn phí** (cho phép trừ quỹ mồi + phí, rồi tạo chiến dịch); nền tảng gửi
   giao dịch.
   **Chiến dịch của bạn** (`/create`): mỗi chiến dịch có **Bản ghi chờ bạn duyệt** (bản ghi máy chấm chưa chắc chắn: nghe →
   **Duyệt**, hoặc **Loại…** kèm lý do; quá 72 giờ chưa duyệt thì tự duyệt) và **Phiên bản dataset** → **Công bố phiên bản
   mới** → xem bản tóm tắt (số bản ghi, tổng thời lượng, mã Merkle) → **Ký & công bố** (ký 1 lần, miễn phí). Không có trang
   quản trị: chưa công bố phiên bản thì người mua chưa tải được; sau khi có bản ghi bị thu hồi phải công bố lại.
4. **Mua dữ liệu:** `/explore` → mở bộ dữ liệu → **Đăng nhập** (Gmail; lần đầu gắn ví) → hóa đơn (giá + phí xử lý ≈ 13.000 ₫ = tổng thanh toán)
   → **Mua license** (ký 2 lần, miễn phí) → **Tải xuống** (ký một thông điệp, không tốn phí). Trên web người mua đăng nhập Gmail như mọi
   vai trò (API mua vẫn chỉ cần chữ ký). Muốn tách vai người mua, tạo thêm một tài khoản trong MetaMask ("Thêm tài khoản") và nạp mUSDC cho nó. Chỉ mua được
   bộ dữ liệu đã có ít nhất một bản ghi hợp lệ: ghi âm trước ở `/earn`, hoặc chạy `scripts\demo-local.bat` để có sẵn chiến
   dịch có bản ghi. Mỗi ví mua một bộ dữ liệu một lần; hết mUSDC thì bấm **Nhận mUSDC thử nghiệm** hoặc chạy lại
   `fund-wallet.bat`. Người tạo rút phần doanh thu ở `/create` → **Rút về ví** (ký 1 lần, phí xử lý ≈ 2.600 ₫ trừ vào số rút).
5. Sau khi **khởi động lại Anvil** (chain mới): MetaMask → Settings → Advanced → **Clear activity tab data** (xóa dữ liệu
   chain cũ), rồi chạy lại `scripts\fund-wallet.bat` vì số dư của chain cũ đã mất.

## 5. Chạy demo và kiểm thử

Demo CLI cần Anvil đã deploy và backend đang chạy:

```cmd
cd /d D:\Hackathon
scripts\demo-local.bat
```

Script chạy `demo e2e` (52 kiểm tra) và `demo scenario-611` (12 kiểm tra).
Các bộ demo cần deployment local sạch: audio fixture chống trùng toàn cục và ví test có thể đã gắn email
từ bộ Playwright. Dùng deployment riêng cho mỗi bộ khi cần chạy lại; không xóa dữ liệu đang sử dụng để thử demo.

Kiểm thử contract, Python unit/QC thật và tích hợp (tự tạo Anvil riêng):

```cmd
scripts\test-all.bat
```

Kiểm thử frontend khi đủ Anvil + backend + frontend đang chạy:

```cmd
scripts\test-frontend.bat e2e
```

Kiểm tra accessibility riêng:

```cmd
cd frontend
npm run test:a11y
cd ..
```

## 6. Dừng dự án và chạy lại

Nhấn `Ctrl+C` lần lượt trong cửa sổ **frontend → backend → Anvil** để dừng và giải phóng RAM/CPU.
Đóng tab trình duyệt chưa dừng các dịch vụ. Lệnh deploy đã kết thúc thì không có tiến trình cần dừng thêm.

- Nếu Anvil chạy không có `persist`, lần khởi động sau là chain mới: chạy lại deploy, backend và frontend.
- Nếu Anvil chạy với `persist`, dừng bình thường bằng `Ctrl+C` để lưu `contracts\.anvil\anvil-state.json` (trạng thái chain local, không phải dữ liệu backend; file cũ ở `storage\` được tự chuyển sang lần chạy `persist` kế tiếp).
  Lần sau dùng lại `persist`; khi trạng thái cũ được khôi phục và file deployment còn khớp, bỏ qua deploy.
- Audio vẫn nằm trong `storage\<network>-<fingerprint>\audio\` sau khi dừng backend (hoặc trên Backblaze B2 nếu
  `backend\.env.local` có đủ `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET` — docs/environment-variables.md §1c); database
  nằm cùng thư mục (SQLite) hoặc trên Neon nếu `backend\.env.local` có `DATABASE_URL`.
- Anvil khởi động lại (chain mới) mà dùng Neon: backend sẽ **từ chối khởi động** vì database còn dữ liệu chain cũ —
  chạy `scripts\reset-db.bat` (xóa database + audio) rồi khởi động lại backend.
- `scripts\reset-local.bat` **xóa** dữ liệu local (database + audio + trạng thái Anvil đã lưu), không dùng để dừng dịch vụ.
  Sau đó `start-anvil` → `deploy-local` → `start-backend` là trở về trạng thái chỉ có chiến dịch mẫu.

## 7. Lỗi thường gặp khi chạy

| Hiện tượng | Cách xử lý |
|---|---|
| Không tìm thấy `forge`/`anvil` | Chạy qua `scripts\*.bat` hoặc chạy lại `scripts\setup.bat`. |
| Backend thiếu địa chỉ contract | Chạy deploy sau khi Anvil sẵn sàng, rồi khởi động lại backend. |
| Backend không kết nối được RPC / báo node không phải Anvil | Kiểm tra cửa sổ Anvil và cổng `8386` (`scripts\start-anvil.bat`). Cổng 8545 là của dự án Hardhat khác. |
| Website không kết nối được máy chủ | Kiểm tra backend; `NEXT_PUBLIC_API_URL` và `CORS_ORIGINS` phải khớp cách truy cập web. |
| Backend báo "chain đã quay về trạng thái cũ" | Cửa sổ Anvil bị đóng mà không bấm `Ctrl+C`, nên bản lưu là bản cũ. Chạy `scripts\reset-local.bat` rồi làm lại từ `start-anvil persist`. |
| Trang tạo chiến dịch không hỏi đăng nhập rồi báo lỗi phiên | Phiên cũ (trước `reset-local`) được tự xóa khi tải trang / khi máy chủ trả 401; tải lại trang rồi đăng nhập lại. |
| Cổng `3000`/`8000`/`8386` đã được dùng | Kiểm tra cửa sổ đang chạy dịch vụ cũ, dừng đúng dịch vụ bằng `Ctrl+C` trước khi chạy lại. |
| CLI báo `401` sau khi redeploy | Đăng nhập lại: `scripts\datasetmarketplace.bat login --as an`. |
| Demo báo `409 duplicate_audio` hoặc `409 wallet_taken` | Chạy bộ demo trên deployment local sạch riêng; xem lưu ý ở mục 5. |
| Trình duyệt không cho dùng micro | Cho phép quyền micro; dùng `localhost` hoặc HTTPS. |
| Ví yêu cầu mật khẩu sau khi tải lại trang | Mở khóa bằng mật khẩu đã đặt; đây là cách hoạt động bình thường. |

Hướng dẫn này chạy trên Anvil local. Trạng thái Fuji và cấu hình mạng khác xem ở
[README mục 13](README.md#13-cấu-hình-local--fuji--mainnet).
