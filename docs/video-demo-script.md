# Kịch bản video demo (2:50) — bản để quay tự động

Dựa trên đề xuất §14.1 (video 2–3 phút, **vấn đề xuất hiện trong 30 giây đầu**), viết sao cho quay được hoàn toàn bằng
script trên **bản thật đang chạy** — web https://dataset-marketplace-team1-2026.vercel.app, backend Azure, contract Fuji — không
dựng giao diện giả. Người duyệt: đội; người xem cuối: ban giám khảo Team1 Vietnam UniHack 2026.

## 1. Cách quay

| Thành phần | Cách làm |
|---|---|
| Hình | Playwright mở Chromium, thao tác trên web thật, giao dịch thật trên Fuji. Khung hình 1920×1080, 30 fps, MP4 H.264 |
| Con trỏ, phụ đề, khung tô sáng | Lớp phủ chèn vào trang lúc quay (Playwright không tự vẽ con trỏ): con trỏ + gợn sóng khi bấm, phụ đề dưới đáy, khung tô vùng đang nói tới |
| Thẻ tiêu đề (vấn đề, kiến trúc, kết) | Trang HTML tĩnh cùng font Be Vietnam Pro và màu của web, quay như một cảnh |
| Lời dẫn | Giọng đọc tiếng Việt tổng hợp (edge-tts, `vi-VN-HoaiMyNeural`), hoặc giọng thật của đội (mục 5) |
| Ví người tạo / người mua | Script ký thay ví bằng khóa ví thử — chữ ký thật, giao dịch thật; **không hiện cửa sổ MetaMask**, phụ đề ghi "Ký bằng ví" |
| Ví người đóng góp | Ví trên trình duyệt của web (tạo sẵn ngoài khung hình), trong video chỉ nhập mật khẩu mở khóa |
| Micro | Micro ảo phát file giọng đọc đúng câu mẫu đang hiện; QC chấm thật trên máy chủ |
| Đăng nhập Google | Google chặn trình duyệt tự động ⇒ hiện hộp "Tiếp tục với Google" 2 giây rồi cắt sang trạng thái đã đăng nhập |
| Chờ mạng / QC | Đoạn chờ > 2 giây được tua nhanh, góc màn hình hiện nhãn **⏩ ×4** |
| Ghép | ffmpeg: ghép cảnh + lời dẫn, xuất kèm phụ đề `.srt` và ảnh thumbnail |

Tập dượt trên Anvil local (quay lại thoải mái) trước, rồi quay **1 lần chính thức trên Fuji** (mỗi lần quay tạo 1 chiến dịch
mới trên chain, không xóa được).

## 2. Nhân vật và dữ liệu chuẩn bị (ngoài khung hình)

| Nhân vật | Vai | Chuẩn bị |
|---|---|---|
| **TổngĐài AI** | Người tạo chiến dịch | Tài khoản + ví thử, tên hiển thị "TổngĐài AI", nhận sẵn mUSDC thử |
| **An** | Người đóng góp (xuất hiện trên hình) | Tài khoản + ví trình duyệt tạo sẵn, tên hiển thị "An" |
| Bình, Chi, Dũng, Hà | Người đóng góp nền (không lên hình) | Mỗi người 3 bản ghi giọng tổng hợp, chạy qua QC thật sau cảnh tạo chiến dịch — để lần bán chia cho nhiều người như thật |
| **Lab X** | Người mua sớm | Tài khoản + ví thử, tên hiển thị "Lab X" |

Chiến dịch tạo trên hình: **"Giọng miền Trung – tổng đài ngân hàng"**, mục tiêu **10 giờ**, giá đầy đủ **26.000.000 ₫**, chia
80/10/10, hạn 30 ngày, bộ câu mẫu nhập từ file `.txt` (12 câu nghiệp vụ ngân hàng, có sẵn file giọng đọc cho từng câu).

## 3. Phân cảnh

| # | Thời gian | Hình (thao tác) | Lời dẫn | Chữ trên màn hình |
|---|---|---|---|---|
| 1 | 0:00–0:22 | Thẻ tiêu đề: sóng âm, câu nói tổng đài bị nhận sai chữ ("lãi suất" → "lại xuất") | Trợ lý ảo và tổng đài tự động vẫn nghe sai giọng miền Trung, miền Tây — vì thiếu dữ liệu giọng vùng miền. Còn người cho giọng thì không được trả công, và không lấy lại được dữ liệu của mình. | **Thiếu dữ liệu giọng vùng miền** · Người cho giọng: không được trả công, không rút lại được |
| 2 | 0:22–0:35 | Trang chủ web (nhãn góc trên hiện địa chỉ web — video chỉ quay nội dung trang, không có thanh địa chỉ), cuộn qua phần "Chia doanh thu minh bạch" (kéo thanh trượt mô phỏng chia tiền) | Dataset Marketplace là chợ dữ liệu giọng nói tiếng Việt trên Avalanche: doanh nghiệp đặt hàng dữ liệu, người dân đọc câu mẫu để kiếm tiền, và mỗi lần dữ liệu được bán, hợp đồng thông minh tự chia tiền. | Đặt hàng → Đóng góp → Bán → Tự chia tiền |
| 3 | 0:35–1:00 | TổngĐài AI: Tạo chiến dịch mới → điền tên, mô tả → **Nhập từ file .txt** (12 câu) → mục tiêu 10 giờ, giá 26.000.000 ₫ → hóa đơn (phí xử lý ≈ 13.000 ₫) → **Ký & tạo chiến dịch** → trang bộ dữ liệu → mở giao dịch trên Snowtrace | Startup TổngĐài AI cần mười giờ giọng miền Trung cho chatbot ngân hàng. Họ tạo chiến dịch: bộ câu mẫu, mục tiêu, giá đầy đủ hai mươi sáu triệu đồng. Họ chỉ ký một lần — nền tảng trả phí mạng — và chiến dịch được ghi lên Avalanche Fuji trong khoảng một giây. | Ký bằng ví · không cần AVAX · Giao dịch đã xác nhận trên Snowtrace |
| 4 | 1:00–1:38 | Hộp đăng nhập Google (2 giây) → An ở trang Kiếm tiền, mở khóa ví → chọn chiến dịch → **Đọc & ký đồng thuận** (điều khoản khớp mã băm) → **Nhận câu và bắt đầu ghi âm** → câu mẫu hiện, sóng âm chạy → **Dừng & gửi** → "Đang kiểm tra" (⏩) → **Tuyệt vời! Bản ghi đã được ghi nhận** ("Khớp câu mẫu …%", "+N giây hợp lệ") | An đăng nhập bằng Gmail; ví được tạo ngay trên trình duyệt, không cần cài MetaMask hay mua AVAX. An đọc điều khoản và ký đồng thuận — chữ ký được ghi on-chain. Câu mẫu chỉ hiện khi bấm ghi âm. Máy chấm bằng mô hình wav2vec2 tiếng Việt: đọc đúng câu, đủ rõ, thì bản ghi được ghi nhận lên chain kèm số giây hợp lệ — còn audio thì không bao giờ lên blockchain. | Đồng thuận EIP-712 · không tốn phí · QC: CER, forced alignment · Audio không lên chain, chỉ mã cam kết |
| 5 | 1:38–2:00 | Lab X: Khám phá dữ liệu (lướt qua 6 bộ dữ liệu nhiều vùng giọng) → chiến dịch demo → biểu đồ giá theo tiến độ, giá hiện tại ≈ 7,8 triệu so với 26 triệu → hóa đơn → **Mua license** → "Bạn đã có license" → Snowtrace | Phòng lab X mua sớm khi chiến dịch mới bắt đầu: giá tăng theo tiến độ, nên lúc này chỉ khoảng bảy phẩy tám triệu thay vì hai mươi sáu triệu. Tiền được chia ngay trong cùng giao dịch: tám mươi phần trăm cho người đóng góp, theo số giây hợp lệ. | Giá = 26 tr × (0,3 + 0,7 × tiến độ) · Chia 80% người đóng góp · 10% người tạo · 10% nền tảng |
| 6 | 2:00–2:25 | An: **Thu nhập** (số tiền vừa được chia) → **Rút tiền** (phí ≈ 2.600 ₫) → "Đã rút tiền về ví" → **Bản ghi của tôi** → **Thu hồi** → "Đã thu hồi" | An rút tiền về ví, chỉ mất khoảng hai nghìn sáu trăm đồng phí xử lý. Khi đổi ý, An thu hồi đồng thuận: tiền đã nhận vẫn giữ, audio bị xóa, phiên bản dữ liệu sau không còn bản ghi của An, và An không được chia ở các lần bán tiếp theo. | Giữ tiền đã nhận · Mất thu nhập tương lai · Audio bị xóa |
| 7 | 2:25–2:50 | Thẻ kiến trúc (Vercel → Backend + QC trên Azure → contract Fuji) → trang mã nguồn contract **đã xác minh** trên Snowtrace → thẻ kết: lộ trình + đường dẫn | Toàn bộ tiền, giá, đồng thuận và license nằm trong hợp đồng đã xác minh trên Avalanche Fuji. Chia doanh thu tốn gas cố định, chữ ký EIP-712 không tốn phí cho người dùng, kiểm tra chất lượng bằng forced alignment. Tiếp theo: mainnet với USDC thật, chống giọng giả, mở rộng nhiều vùng miền. Dataset Marketplace — giọng quê bạn, được trả công mỗi lần được dùng. | Lộ trình: mainnet USDC · chống giọng giả · nhiều vùng miền · dataset-marketplace-team1-2026.vercel.app |

Cảnh 3 → 4 có một đoạn chuyển "Vài ngày sau…" (1 giây): lúc này 4 người đóng góp nền đã có bản ghi, nên ở cảnh 5 tiền được
chia cho nhiều người như thật.

## 4. Bàn giao

- `demo.mp4` (≈ 2:50, 1920×1080), `demo.srt` (phụ đề tiếng Việt), `thumbnail.png`.
- Bạn tải lên YouTube (chế độ *Không công khai*) hoặc Google Drive (*Bất kỳ ai có đường liên kết*) rồi mở thử bằng cửa sổ ẩn
  danh trước khi dán vào bài nộp.

## 5. Đã chốt (20/11)

1. **Lời dẫn:** giọng tổng hợp để hoàn thiện video trước; nếu còn thời gian đội thay bằng giọng thật (mình giữ lời thoại +
   thời lượng từng cảnh để ghép lại).
2. **Giọng người đóng góp:** giọng tổng hợp, mỗi người một cao độ / tốc độ riêng để phân biệt (An, Bình, Chi, Dũng, Hà, Khoa,
   Lan). Lời dẫn không nói đó là giọng thật.
3. **Không** có thẻ tên thành viên đội.
4. Trang Khám phá: 3 chiến dịch "Kiểm thử hệ thống…" đã được người tạo **ẩn** (tính năng mới, implementation-plan §3 #35);
   thêm **5 bộ dữ liệu mẫu** ở 5 lĩnh vực / vùng giọng (miền Bắc – y tế, miền Nam – gọi xe & giao hàng, miền Tây – nông
   nghiệp, Tây Nguyên – du lịch, Nghệ Tĩnh – học tập), có bản ghi qua QC thật, vài lượt mua và phiên bản đã công bố. Cảnh 5
   lướt qua trang Khám phá để thấy sự đa dạng trước khi vào chiến dịch demo.
5. **Không** chèn cảnh MetaMask — chỉ quay các luồng chính của web.

## 6. Rủi ro và dự phòng

| Rủi ro | Dự phòng |
|---|---|
| Snowtrace chặn trình duyệt tự động | Chụp sẵn trang giao dịch bằng trình duyệt thường, chèn ảnh |
| RPC Fuji / QC chậm hơn dự kiến | Tua nhanh có nhãn; thời lượng lời dẫn quyết định nhịp cảnh |
| Lần quay chính thức lỗi giữa chừng | Quay lại từ cảnh lỗi (mỗi cảnh là một đoạn riêng), chỉ cảnh 3 tạo dữ liệu mới trên chain |
