import { ButtonLink } from "@/components/ui/button";
import { Reveal, SectionHeading } from "@/components/ui/misc";
import { BRAND } from "@/lib/brand";

const STEPS = [
  { n: "01", title: "Bên cần dữ liệu đặt hàng", body: "Startup, lab tạo chiến dịch: giọng vùng nào, bao nhiêu giờ, giá đầy đủ, hạn thu thập. Có thể nạp quỹ mồi để trả ngay người đóng góp đầu tiên." },
  { n: "02", title: "Bạn đọc câu mẫu", body: "Câu mẫu chỉ hiện khi bạn bấm ghi âm. Máy kiểm tra bản ghi có đọc đúng câu không; đạt thì số giây hợp lệ được ghi lên chain." },
  { n: "03", title: "Mua sớm, giá rẻ", body: "Dataset bán được ngay khi đang thu thập. Giá tăng theo tiến độ: 30% giá đầy đủ lúc bắt đầu, 100% khi đủ mục tiêu." },
  { n: "04", title: "Tiền tự chia lại", body: "Mỗi lần bán, hợp đồng chia 80% cho người đóng góp theo số giây còn hiệu lực, phần còn lại cho người tạo và nền tảng." },
];

export function HowItWorks() {
  return (
    <section className="container-page py-20 sm:py-28" aria-labelledby="how">
      <Reveal>
        <SectionHeading eyebrow={`Cách ${BRAND.name} hoạt động`} title={<span id="how">Hai phía của một chợ dữ liệu công bằng</span>} description="Chain giữ tiền, quyền và bằng chứng. Server giữ dữ liệu. Audio và thông tin cá nhân không bao giờ lên blockchain." />
      </Reveal>
      <div className="relative mt-14">
        <div aria-hidden className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent lg:block" />
        <ol className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.n}>
              <Reveal delay={i * 0.08} className="flex h-full flex-col gap-3">
                <span className="relative grid size-14 place-items-center rounded-2xl border border-line bg-surface text-lg font-bold text-primary shadow-[var(--shadow-soft)]">{s.n}</span>
                <h3 className="text-h3">{s.title}</h3>
                <p className="text-ink-muted">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Audiences() {
  return (
    <section className="container-page grid gap-6 lg:grid-cols-[1.1fr_0.9fr]" aria-label="Quyền lợi">
      <Reveal className="h-full">
        <div className="relative h-full overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-primary to-[#1e3a8a] p-8 text-white sm:p-10">
          <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full bg-cyan/30 blur-3xl" />
          <span className="relative text-sm font-semibold text-[#bae6fd]">Cho người đóng góp</span>
          <h2 className="relative mt-3 text-h2 !text-white">Giọng của bạn là tài sản, không phải món quà một lần</h2>
          <ul className="relative mt-8 grid gap-5 sm:grid-cols-2">
            {[
              ["Thu nhập lặp lại", "Mỗi lần dataset được bán bạn lại được chia, không chỉ trả một lần."],
              ["Không cần biết blockchain", "Đăng nhập Google, ví tạo sẵn trong trình duyệt, phí mạng do nền tảng trả."],
              ["Nhận tiền mồi ngay", "Chiến dịch có quỹ mồi trả cho từng giây hợp lệ, trước cả khi có người mua."],
              ["Quyền rút lại", "Thu hồi bất cứ lúc nào: giữ tiền đã kiếm, bản ghi bị xóa khỏi bản phát hành sau."],
            ].map(([t, b]) => (
              <li key={t}>
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-sm text-[#dbeafe]">{b}</p>
              </li>
            ))}
          </ul>
          <ButtonLink href="/earn" variant="secondary" className="relative mt-8 !bg-white !text-primary-active hover:!bg-primary-soft">
            Bắt đầu đóng góp
          </ButtonLink>
        </div>
      </Reveal>
      <Reveal delay={0.08} className="h-full">
        <div className="flex h-full flex-col rounded-[1.75rem] border border-line bg-surface p-8 sm:p-10">
          <span className="text-sm font-semibold text-cyan-ink">Cho người mua dataset</span>
          <h2 className="mt-3 text-h2">Dữ liệu có bằng chứng đồng thuận</h2>
          <dl className="mt-8 flex flex-1 flex-col gap-5">
            {[
              ["Giá theo tiến độ", "Mua khi mới 40% với giá thấp hơn, nhận mọi bản cập nhật tới khi đủ mục tiêu."],
              ["License on-chain", "Thời điểm mua, tiến độ lúc mua, giá đã trả — ai cũng kiểm tra được."],
              ["Phiên bản có Merkle root", "Đối chiếu file nhận về với root đã công bố; bản mới tự loại bản ghi đã thu hồi."],
            ].map(([t, b]) => (
              <div key={t} className="relative pl-6">
                <dt className="font-semibold text-ink before:absolute before:left-0 before:top-2 before:size-2.5 before:rounded-full before:bg-cyan">{t}</dt>
                <dd className="mt-1 text-sm text-ink-muted">{b}</dd>
              </div>
            ))}
          </dl>
          <ButtonLink href="/explore" variant="outline" className="mt-8 w-fit">
            Xem các bộ dữ liệu
          </ButtonLink>
        </div>
      </Reveal>
    </section>
  );
}

export function ConsentStory() {
  const events = [
    { t: "Ký đồng thuận", d: "Bạn ký đúng bản điều khoản đã công bố (mã băm ghi trên chain). Không tốn phí.", tone: "bg-primary" },
    { t: "Được chia doanh thu", d: "Mỗi lần dataset được bán, tiền vào phần chưa rút của bạn theo số giây hợp lệ.", tone: "bg-cyan" },
    { t: "Thu hồi bất cứ lúc nào", d: "Một giao dịch mới đổi trạng thái — block cũ vẫn còn làm bằng chứng kiểm toán.", tone: "bg-peach" },
    { t: "Dữ liệu bị xóa thật", d: "Server xóa audio và salt; mã cam kết trên chain không còn liên kết được với giọng nói nào.", tone: "bg-success" },
  ];
  return (
    <section className="container-page grid gap-12 py-20 sm:py-28 lg:grid-cols-2 lg:items-center" aria-labelledby="consent">
      <Reveal>
        <SectionHeading
          eyebrow="Quyền đồng thuận và thu hồi"
          title={<span id="consent">Rút tiền rồi thu hồi? Bạn vẫn giữ tiền đã nhận.</span>}
          description="Thu hồi chỉ dừng thu nhập tương lai từ bản ghi đó. Không có cơ chế đòi lại tiền, và các phiên bản dataset phát hành sau sẽ không còn giọng của bạn."
        />
      </Reveal>
      <ol className="relative flex flex-col gap-6 border-l-2 border-dashed border-line-strong pl-8">
        {events.map((e, i) => (
          <li key={e.t} className="relative">
            <span className={`absolute -left-[2.6rem] top-1 size-4 rounded-full ring-4 ring-canvas ${e.tone}`} aria-hidden />
            <Reveal delay={i * 0.07}>
              <h3 className="font-semibold text-ink">{e.t}</h3>
              <p className="mt-1 text-ink-muted">{e.d}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FAQ = [
  ["Tôi có cần AVAX hay ví crypto không?", "Không. Ví được tạo sẵn trong trình duyệt và mã hóa bằng mật khẩu của bạn. Nền tảng trả phí mạng khi ghi nhận đồng thuận, bản ghi và thu hồi; khi rút tiền hộ, một khoản phí nhỏ (≈ 2.600 ₫) được trừ bằng chính tiền trong app."],
  ["Tiền hiển thị VNĐ nhưng trên chain lưu gì?", "USDC (trên môi trường thử là mUSDC giả lập). VNĐ là lớp hiển thị theo tỷ giá, nên luôn có dấu “≈” kèm số USDC gốc để minh bạch."],
  ["Thu hồi có xóa block không?", "Không. Blockchain chỉ ghi thêm: thu hồi là một giao dịch mới. Audio và salt bị xóa ở server nên mã cam kết trên chain trở nên vô nghĩa."],
  ["Lỡ có người dùng giọng máy (TTS) đọc thì sao?", "Câu mẫu chỉ hiện khi bấm ghi âm, mã câu hết hạn sau khoảng 60 giây và chỉ nhận ghi âm trực tiếp. Chống giọng giả bằng AI nằm trong lộ trình."],
  ["Người mua phát tán dataset thì sao?", "Blockchain không ngăn được việc sao chép; nó ghi license và bằng chứng để xử lý theo điều khoản."],
];

export function Faq() {
  return (
    <section id="faq" className="container-page py-20 sm:py-24" aria-labelledby="faq-title">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <SectionHeading eyebrow="Câu hỏi thường gặp" title={<span id="faq-title">Những điều mọi người hay hỏi</span>} />
        </Reveal>
        <div className="flex flex-col gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-line bg-surface px-5 py-4 transition-[border-color,box-shadow] duration-[var(--duration-hover)] open:border-primary-line open:shadow-[var(--shadow-soft)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-ink-muted transition-transform duration-[var(--duration-hover)] group-open:rotate-45" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                </svg>
              </summary>
              <p className="mt-3 text-ink-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="container-page">
      <Reveal>
        <div className="relative overflow-hidden rounded-[1.75rem] border border-primary-line bg-gradient-to-br from-primary-soft via-surface to-cyan-soft px-6 py-12 text-center sm:px-12">
          <h2 className="text-h2">Sẵn sàng góp giọng cho tiếng Việt?</h2>
          <p className="text-lead mx-auto mt-3 max-w-xl">Mất khoảng một phút để thiết lập. Mỗi câu chỉ vài giây.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/earn" size="lg">Kiếm tiền bằng giọng nói</ButtonLink>
            <ButtonLink href="/create" size="lg" variant="outline">Đặt hàng một bộ dữ liệu</ButtonLink>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
