import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ẩn nút "N" (Next.js dev indicator) ở góc trái màn hình khi chạy `npm run dev`.
  // Lỗi biên dịch / runtime vẫn được Next.js hiển thị.
  devIndicators: false,
  // `npm run dev` mặc định chặn tài nguyên dev (HMR, chunk) khi mở bằng 127.0.0.1 ⇒ trang đứng ở khung xương.
  // Cho phép để web vẫn chạy; riêng nút Google sẽ nhắc chuyển sang localhost (Google không nhận origin là địa chỉ IP).
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
