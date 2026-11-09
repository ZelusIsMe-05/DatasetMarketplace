import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-ink-muted">
            Chợ dữ liệu giọng nói tiếng Việt có đồng thuận. Chia doanh thu minh bạch trên Avalanche.
          </p>
        </div>
        <FooterCol title="Người đóng góp" links={[["/earn", "Kiếm tiền bằng giọng nói"], ["/earn/history", "Bản ghi của tôi"], ["/earn/earnings", "Thu nhập & rút tiền"]]} />
        <FooterCol title="Người mua & người tạo" links={[["/explore", "Khám phá bộ dữ liệu"], ["/library", "Thư viện đã mua"], ["/create", "Tạo chiến dịch"]]} />
        <FooterCol title="Hỗ trợ" links={[["/#faq", "Câu hỏi thường gặp"], ["/create", "Duyệt & công bố dữ liệu của bạn"]]} />
      </div>
      <div className="border-t border-line">
        <p className="container-page py-5 text-caption">
          Team1 Vietnam UniHack 2026 · Audio không bao giờ lên blockchain — chỉ mã cam kết có salt và số giây hợp lệ.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-sm text-ink-muted transition-colors hover:text-primary">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
