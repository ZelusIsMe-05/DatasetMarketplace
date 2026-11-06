# Điều khoản đồng thuận

Văn bản điều khoản dùng cho chiến dịch mẫu nằm ở [`seed/demo-campaign/terms.md`](../seed/demo-campaign/terms.md).

- `termsHash` on-chain = `keccak256` của **đúng các byte UTF-8** của file đó (SeedDemo.s.sol đọc file bằng `vm.readFile`).
- Backend phục vụ văn bản qua `GET /campaigns/{id}/terms` và trả kèm `matches` (hash do server tính có khớp on-chain không).
- Backend **từ chối** chuẩn bị/chuyển tiếp chữ ký đồng thuận nếu điều khoản không khớp `termsHash` (người dùng không thể ký cho một văn bản mà server không phục vụ đúng).
- Người tạo chiến dịch qua `POST /campaigns/drafts` gửi văn bản điều khoản riêng; server tính hash và trả tham số `createCampaign`.
- `.gitattributes` đánh dấu `seed/** -text` để Git không đổi xuống dòng (LF) → hash ổn định trên mọi máy.

> Văn bản mẫu cho hackathon, không phải tư vấn pháp lý (đề xuất §7.9).
