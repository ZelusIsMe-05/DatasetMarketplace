# Điều khoản đồng thuận đóng góp giọng nói – Dataset Marketplace (phiên bản 1)

Bằng việc ký thông điệp đồng thuận (EIP-712) cho chiến dịch này, bạn xác nhận đã đọc và đồng ý với các điều sau.

## 1. Mục đích sử dụng
Bản ghi giọng nói của bạn được dùng để huấn luyện và đánh giá mô hình nhận dạng tiếng nói tiếng Việt theo mô tả của chiến dịch. Người mua dataset nhận license sử dụng cho mục đích nghiên cứu và thương mại, không được dùng giọng của bạn để giả mạo danh tính hay tạo giọng nói tổng hợp mang danh bạn.

## 2. Dữ liệu được thu thập và cách lưu trữ
- Chỉ lưu bản ghi âm câu mẫu bạn đọc, câu mẫu tương ứng và địa chỉ ví của bạn. Email đăng nhập chỉ dùng để chống tạo nhiều tài khoản, không chia sẻ cho người mua.
- Audio được lưu trên máy chủ riêng tư của nền tảng, **không bao giờ đưa lên blockchain**. Trên blockchain chỉ có một mã cam kết `keccak256(audio ‖ salt)` với salt ngẫu nhiên giữ bí mật, và số giây hợp lệ.
- Tối đa ba bản ghi đạt chất lượng có thể được dùng làm mẫu nghe thử ngắn cho người mua tiềm năng.

## 3. Thu nhập
- Bạn được chia doanh thu mỗi lần dataset được bán, theo số giây giọng nói còn hiệu lực của bạn tại thời điểm bán và theo tỷ lệ ghi trong contract.
- Bạn có thể rút tiền bất cứ lúc nào: tự rút (tự trả phí mạng) hoặc rút hộ qua nền tảng với một khoản phí nhỏ mà bạn ký chấp nhận mức tối đa.

## 4. Quyền thu hồi
- Bạn có thể thu hồi đồng thuận cho từng bản ghi bất cứ lúc nào, không giới hạn thời gian.
- Khi thu hồi: bạn **giữ nguyên tiền đã kiếm**, nhưng không được chia các lần bán sau từ bản ghi đó; nền tảng xóa audio và salt; các phiên bản dataset phát hành sau không còn bản ghi này.
- Người mua không được dùng bản ghi đã thu hồi cho lần huấn luyện mới sau thời điểm thu hồi. Thu hồi không có hiệu lực hồi tố với mô hình đã huấn luyện trước đó.

## 5. Bằng chứng
Thời điểm đồng thuận và thu hồi được ghi trên blockchain Avalanche làm bằng chứng kiểm toán cho cả hai phía. Mã băm của văn bản điều khoản này được ghi vào contract khi tạo chiến dịch; chữ ký của bạn gắn với đúng mã băm đó.

*Đây là văn bản mẫu cho bản demo hackathon, không phải tư vấn pháp lý.*
