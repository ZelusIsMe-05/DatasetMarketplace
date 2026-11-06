// Mẫu điều khoản đồng thuận (người tạo có thể sửa). Nội dung khớp tinh thần seed/demo-campaign/terms.md (đề xuất §6.3, §6.8).
export const TERMS_TEMPLATE = `# Điều khoản đồng thuận đóng góp giọng nói

Bằng việc ký thông điệp đồng thuận (EIP-712) cho chiến dịch này, bạn xác nhận đã đọc và đồng ý với các điều sau.

## 1. Mục đích sử dụng
Bản ghi giọng nói của bạn được dùng để huấn luyện và đánh giá mô hình nhận dạng tiếng nói tiếng Việt theo mô tả của chiến dịch. Người mua không được dùng giọng của bạn để giả mạo danh tính.

## 2. Dữ liệu và lưu trữ
Chỉ lưu bản ghi câu mẫu, câu mẫu tương ứng và địa chỉ ví. Audio lưu trên máy chủ riêng tư, không bao giờ đưa lên blockchain; trên chain chỉ có mã cam kết có salt và số giây hợp lệ.

## 3. Thu nhập
Bạn được chia doanh thu mỗi lần dataset được bán, theo số giây giọng nói còn hiệu lực tại thời điểm bán.

## 4. Quyền thu hồi
Bạn có thể thu hồi đồng thuận bất cứ lúc nào: giữ nguyên tiền đã kiếm, không được chia các lần bán sau từ bản ghi đó; audio và salt bị xóa; phiên bản dataset phát hành sau không còn bản ghi này. Thu hồi không hồi tố với mô hình đã huấn luyện trước đó.
`;
