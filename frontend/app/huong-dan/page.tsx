import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Hướng dẫn bắt đầu",
  description: "Hướng dẫn đăng nhập bằng Google, liên kết ví và bắt đầu đóng góp hoặc mua dữ liệu giọng nói.",
};

const linkClass = "rounded text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-hover";

export default function GettingStartedPage() {
  return (
    <PageTransition>
      <article className="container-page pb-12 sm:pb-16">
        <div className="mx-auto max-w-3xl">
          <PageHeader
            eyebrow="Dành cho người mới"
            title="Hướng dẫn bắt đầu"
            description="Từ đăng nhập Google đến những thao tác đầu tiên trên nền tảng."
            back={{ href: "/", label: "Về trang chủ" }}
          />

          <p className="mb-6 rounded-2xl border border-primary-line bg-primary-soft p-4 text-sm leading-relaxed text-ink-soft">
            Bạn có thể đọc hướng dẫn ở tab này, rồi quay lại tab trước để tiếp tục đăng nhập.
          </p>

          <div className="flex flex-col gap-5">
            <section aria-labelledby="google-login">
              <Card className="space-y-3">
                <h2 id="google-login" className="text-h3">1. Đăng nhập bằng Google</h2>
                <ol className="list-decimal space-y-2 pl-5 leading-relaxed text-ink-soft">
                  <li>Bấm <strong>Đăng nhập</strong> ở góc trên của trang.</li>
                  <li>Chọn <strong>Tiếp tục với Google</strong> và chọn tài khoản Google bạn muốn sử dụng.</li>
                  <li>
                    Nếu tài khoản đã liên kết ví, bạn nhận thông báo <strong>Đăng nhập thành công</strong>.
                    Nếu đây là lần đầu, bạn sẽ được chuyển sang bước <strong>Liên kết ví</strong>.
                  </li>
                </ol>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Đăng nhập tài khoản đã liên kết ví không yêu cầu tự mở MetaMask hoặc ký lại.
                </p>
              </Card>
            </section>

            <section aria-labelledby="link-wallet">
              <Card className="space-y-4">
                <h2 id="link-wallet" className="text-h3">2. Liên kết ví trong lần đầu sử dụng</h2>
                <p className="leading-relaxed text-ink-soft">
                  Ví được gắn với tài khoản Google để nhận tiền và xác nhận các thao tác của bạn. Chọn cách phù hợp:
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 rounded-2xl bg-canvas p-4">
                    <h3 className="font-semibold text-ink">Dùng MetaMask / Core</h3>
                    <p className="text-sm leading-relaxed text-ink-soft">
                      Phù hợp nếu bạn muốn ghi âm, tạo chiến dịch hoặc mua dữ liệu. Bấm <strong>Kết nối MetaMask / Core</strong>,
                      chọn ví bạn muốn dùng, kiểm tra địa chỉ rồi bấm <strong>Ký &amp; gắn ví này</strong>.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-2xl bg-canvas p-4">
                    <h3 className="font-semibold text-ink">Tạo ví trên trình duyệt</h3>
                    <p className="text-sm leading-relaxed text-ink-soft">
                      Nếu mới bắt đầu ghi âm, vào trang <Link href="/earn" className={linkClass}>Kiếm tiền</Link>.
                      Ở bước liên kết ví, bạn có thể tạo ví với mật khẩu hoặc mở khóa ví đã có trên trình duyệt này.
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Mỗi email gắn với một ví và mỗi ví gắn với một email. Hãy kiểm tra đúng địa chỉ trước khi xác nhận;
                  những lần sau bạn sẽ sử dụng lại ví đã liên kết này.
                </p>
              </Card>
            </section>

            <section aria-labelledby="protect-wallet">
              <Card className="space-y-3">
                <h2 id="protect-wallet" className="text-h3">3. Sao lưu nếu dùng ví trình duyệt</h2>
                <p className="leading-relaxed text-ink-soft">
                  Sau khi tạo ví, dùng chức năng sao lưu ở trang Kiếm tiền để tải file ví và lưu riêng mật khẩu đã đặt.
                  File ví được mã hóa; bạn cần mật khẩu này để sử dụng lại file.
                </p>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Khi tải lại trang, bạn cần mở khóa ví. Nền tảng không giữ mật khẩu và không thể khôi phục ví nếu bạn mất
                  cả dữ liệu trình duyệt lẫn bản sao lưu. Khi muốn dùng ví này trong MetaMask, hãy nhập file sao lưu
                  để giữ nguyên địa chỉ đã liên kết.
                </p>
              </Card>
            </section>

            <section aria-labelledby="choose-role">
              <Card className="space-y-4">
                <h2 id="choose-role" className="text-h3">4. Bắt đầu việc bạn muốn làm</h2>
                <dl className="space-y-4 leading-relaxed text-ink-soft">
                  <div>
                    <dt className="font-semibold text-ink">Đóng góp giọng nói</dt>
                    <dd className="mt-1">
                      Vào <Link href="/earn" className={linkClass}>Kiếm tiền</Link>, chọn chiến dịch, đọc điều khoản và ký
                      đồng thuận. Cho phép micro, đọc đúng câu mẫu rồi gửi bản ghi để kiểm tra. Xem kết quả ở Bản ghi của tôi
                      và tiền có thể rút ở Thu nhập.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Tạo chiến dịch</dt>
                    <dd className="mt-1">
                      Vào <Link href="/create" className={linkClass}>Tạo chiến dịch</Link>, chuẩn bị bộ câu mẫu,
                      điều khoản và mục tiêu thu thập. Làm theo từng bước, xem lại hóa đơn trước khi ký xác nhận.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">Mua dữ liệu</dt>
                    <dd className="mt-1">
                      Vào <Link href="/explore" className={linkClass}>Khám phá dữ liệu</Link>, chọn bộ dữ liệu và xem thông
                      tin trước khi mua. Sau khi mua, vào <Link href="/library" className={linkClass}>Thư viện của tôi</Link>
                      {" "}để tải phiên bản được phép truy cập.
                    </dd>
                  </div>
                </dl>
              </Card>
            </section>

            <section aria-labelledby="next-login">
              <Card className="space-y-3">
                <h2 id="next-login" className="text-h3">5. Khi đăng nhập lại hoặc chọn nhầm ví</h2>
                <p className="leading-relaxed text-ink-soft">
                  Dùng lại tài khoản Google đã liên kết. Khi cần ký, bạn chủ động bấm kết nối ví; hãy đối chiếu địa chỉ
                  ví nền tảng hiển thị với ví trong MetaMask. Nếu đang chọn ví khác, bấm <strong>Chọn tài khoản trong MetaMask</strong>
                  {" "}và chọn đúng ví đã liên kết.
                </p>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Tên ví trong MetaMask có thể do bạn tự đặt. Địa chỉ ví mới là thông tin dùng để đối chiếu;
                  không cần tạo ví mới mỗi lần đăng nhập.
                </p>
              </Card>
            </section>
          </div>

          <p className="mt-8 text-center text-sm text-ink-muted">
            Đã sẵn sàng? Quay lại tab trước để tiếp tục đăng nhập.
          </p>
        </div>
      </article>
    </PageTransition>
  );
}
