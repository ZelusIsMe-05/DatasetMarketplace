import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ẩn nút "N" (Next.js dev indicator) ở góc trái màn hình khi chạy `npm run dev`.
  // Lỗi biên dịch / runtime vẫn được Next.js hiển thị.
  devIndicators: false,
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
