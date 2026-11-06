// Tên thương hiệu hiển thị — đổi tên sản phẩm chỉ cần sửa ở đây (đặc tả ghi "GiọngQuê" là tên tạm).
// KHÔNG đổi các định danh kỹ thuật: domain EIP-712 "GiongQue" (khắc trong contract), khóa localStorage "giongque.*"
// (đổi sẽ làm mất ví đã tạo trong trình duyệt), lệnh CLI `giongque`.
export const BRAND = {
  name: "Dataset Marketplace",
  /** Logo hai màu: phần đầu màu chữ, phần sau màu thương hiệu */
  wordmark: ["Dataset", "Marketplace"] as const,
  tagline: "Chợ dữ liệu giọng nói tiếng Việt có đồng thuận",
} as const;
