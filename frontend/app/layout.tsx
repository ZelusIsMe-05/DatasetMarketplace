import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader, SiteHeaderFallback } from "@/components/layout/site-header";
import { BRAND } from "@/lib/brand";

// Be Vietnam Pro: thiết kế cho tiếng Việt, dấu thanh hiển thị chính xác ở mọi cỡ chữ.
const beVietnam = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — Kiếm tiền bằng giọng nói, dữ liệu có đồng thuận`, template: `%s · ${BRAND.name}` },
  description:
    "Chợ dữ liệu giọng nói tiếng Việt có đồng thuận. Người đóng góp được chia doanh thu mỗi lần dataset được bán, minh bạch trên Avalanche.",
};

export const viewport: Viewport = { themeColor: "#f8fafc", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnam.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* usePathname là dữ liệu URL: đặt trong Suspense để route động vẫn có static shell */}
          <Suspense fallback={<SiteHeaderFallback />}>
            <SiteHeader />
          </Suspense>
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
