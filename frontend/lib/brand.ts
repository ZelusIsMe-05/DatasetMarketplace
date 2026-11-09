// Tên thương hiệu hiển thị — đổi tên sản phẩm chỉ cần sửa ở đây.
// Định danh kỹ thuật (đổi tên từ "giongque" ngày 09/11, implementation-plan §3 #30): domain EIP-712 "DatasetMarketplace"
// (khắc trong contract), khóa localStorage "datasetmarketplace.*" (lib/legacy-storage.ts chuyển khóa cũ), lệnh CLI `datasetmarketplace`.
export const BRAND = {
  name: "Dataset Marketplace",
  /** Logo hai màu: phần đầu màu chữ, phần sau màu thương hiệu */
  wordmark: ["Dataset", "Marketplace"] as const,
  tagline: "Chợ dữ liệu giọng nói tiếng Việt có đồng thuận",
} as const;
