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

Giữ cấu hình mạng `local`. Mặc định API là `http://127.0.0.1:8000`, RPC là `http://127.0.0.1:8545`.
Chi tiết các biến cấu hình: [docs/environment-variables.md](docs/environment-variables.md).

## 3. Khởi động dự án

Mở **4 cửa sổ CMD**. Ba dịch vụ Anvil, backend và frontend chạy liên tục; cửa sổ deploy có thể đóng sau khi xong.

### Cửa sổ 1 — Blockchain local

```cmd
cd /d D:\Hackathon
scripts\start-anvil.bat
```

Giữ cửa sổ này mở. Anvil chạy chain `31337` tại `http://127.0.0.1:8545`.

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
scripts\giongque.bat status
```

Để thử vai trò người đóng góp, mở `/earn`, tạo ví với mật khẩu mạnh và chọn **Đăng nhập thử** ở mạng local.
Sau đó chọn chiến dịch mẫu, đọc/ký đồng thuận và cho phép micro để ghi âm trực tiếp.
Tải lại trang sẽ yêu cầu mở khóa ví bằng mật khẩu đã đặt.

Nếu dùng đăng nhập Google, `GOOGLE_CLIENT_ID` của backend phải trùng `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
của frontend. Cách tạo và cấu hình nằm ở [mục Google OAuth](docs/environment-variables.md#f-google-oauth-client-id).
Sau khi đổi env, khởi động lại backend và frontend; frontend production cần build lại.

Người tạo/người mua dùng Core hoặc MetaMask. Với local, thêm mạng RPC `http://127.0.0.1:8545`,
chain ID `31337`; xem [cấu hình ví trong README](README.md#cấu-hình-ví).

## 5. Chạy demo và kiểm thử

Demo CLI cần Anvil đã deploy và backend đang chạy:

```cmd
cd /d D:\Hackathon
scripts\demo-local.bat
```

Script chạy `demo e2e` (51 kiểm tra) và `demo scenario-611` (12 kiểm tra).
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
- Nếu Anvil chạy với `persist`, dừng bình thường bằng `Ctrl+C` để lưu `storage\anvil-state.json`.
  Lần sau dùng lại `persist`; khi trạng thái cũ được khôi phục và file deployment còn khớp, bỏ qua deploy.
- Database và audio vẫn nằm trong `storage\<network>-<fingerprint>\` sau khi dừng backend.
- `scripts\reset-local.bat` xóa dữ liệu local, không dùng để dừng dịch vụ.

## 7. Lỗi thường gặp khi chạy

| Hiện tượng | Cách xử lý |
|---|---|
| Không tìm thấy `forge`/`anvil` | Chạy qua `scripts\*.bat` hoặc chạy lại `scripts\setup.bat`. |
| Backend thiếu địa chỉ contract | Chạy deploy sau khi Anvil sẵn sàng, rồi khởi động lại backend. |
| Backend không kết nối được RPC | Kiểm tra cửa sổ Anvil và cổng `8545`. |
| Website không kết nối được máy chủ | Kiểm tra backend; `NEXT_PUBLIC_API_URL` và `CORS_ORIGINS` phải khớp cách truy cập web. |
| Cổng `3000`/`8000`/`8545` đã được dùng | Kiểm tra cửa sổ đang chạy dịch vụ cũ, dừng đúng dịch vụ bằng `Ctrl+C` trước khi chạy lại. |
| CLI báo `401` sau khi redeploy | Đăng nhập lại: `scripts\giongque.bat login --as an`. |
| Demo báo `409 duplicate_audio` hoặc `409 wallet_taken` | Chạy bộ demo trên deployment local sạch riêng; xem lưu ý ở mục 5. |
| Trình duyệt không cho dùng micro | Cho phép quyền micro; dùng `localhost` hoặc HTTPS. |
| Ví yêu cầu mật khẩu sau khi tải lại trang | Mở khóa bằng mật khẩu đã đặt; đây là cách hoạt động bình thường. |

Hướng dẫn này chạy trên Anvil local. Trạng thái Fuji và cấu hình mạng khác xem ở
[README mục 13](README.md#13-cấu-hình-local--fuji--mainnet).
