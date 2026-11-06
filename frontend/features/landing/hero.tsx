"use client";

import { motion } from "motion/react";
import { ButtonLink } from "@/components/ui/button";

const BARS = [18, 30, 44, 26, 52, 38, 60, 34, 48, 22, 40, 56, 30, 46, 24, 36, 50, 28, 42, 20];

export function Hero() {
  return (
    <section className="bg-hero relative -mt-16 overflow-hidden pt-16">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 size-[34rem] rounded-full bg-cyan/10 blur-3xl motion-safe:animate-drift" />
      <div className="container-page grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div className="flex flex-col items-start gap-6">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-primary-line bg-surface/80 px-3 py-1 text-sm font-semibold text-primary-active backdrop-blur"
          >
            <span className="size-2 rounded-full bg-cyan" aria-hidden />
            Dữ liệu giọng nói tiếng Việt có đồng thuận
          </motion.span>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="text-display">
            Giọng quê bạn,{" "}
            <span className="bg-gradient-to-r from-primary to-cyan bg-clip-text text-transparent">được trả công</span> mỗi lần được dùng
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="text-lead max-w-xl">
            Đọc vài câu mẫu bằng giọng địa phương để kiếm tiền. Mỗi lần bộ dữ liệu được bán, hợp đồng trên Avalanche tự chia lại
            doanh thu cho những người có giọng trong đó — và bạn rút lại đồng thuận lúc nào cũng được.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="/earn" size="lg" transitionTypes={["nav-forward"]} icon={<MicIcon />}>
              Kiếm tiền bằng giọng nói
            </ButtonLink>
            <ButtonLink href="/explore" size="lg" variant="outline" transitionTypes={["nav-forward"]}>
              Khám phá bộ dữ liệu
            </ButtonLink>
          </motion.div>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            {["Không cần AVAX hay ví crypto", "Đồng thuận ký số, thu hồi bất cứ lúc nào", "Mọi số tiền hiển thị bằng VNĐ"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" className="size-4 text-success" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                  <path d="M4 10.5l3.5 3.5L16 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </li>
            ))}
          </motion.ul>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

/** Minh họa: thẻ ghi âm với sóng âm + các thẻ nổi kể câu chuyện QC → on-chain → chia tiền (ví dụ minh họa §6.11). */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md sm:py-12 lg:max-w-none" aria-hidden>
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-[1.75rem] border border-line bg-surface p-6 shadow-[0_30px_80px_-30px_rgb(37_99_235/0.45)] sm:p-8"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-danger-ink">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full rounded-full bg-danger opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
            </span>
            Đang ghi âm
          </span>
          <span className="tabular text-sm font-semibold text-ink-muted">00:04</span>
        </div>
        <p className="mt-5 text-xl font-semibold leading-snug text-ink sm:text-2xl">“cho tôi hỏi lãi suất gửi tiết kiệm hiện nay là bao nhiêu”</p>
        <div className="mt-7 flex h-20 items-center gap-[5px]">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="w-full origin-center rounded-full bg-gradient-to-t from-primary to-cyan motion-safe:animate-wave"
              style={{ height: h, animationDelay: `${(i % 7) * 0.11}s`, opacity: 0.55 + (h / 60) * 0.45 }}
            />
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-canvas p-3">
          <span className="grid size-10 place-items-center rounded-full bg-danger text-white shadow-[0_8px_20px_-6px_rgb(220_38_38/0.6)]">
            <span className="size-3.5 rounded-sm bg-white" />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-ink">Giọng miền Trung · ngân hàng</p>
            <p className="text-ink-muted">Câu 7/30 · đọc tự nhiên là được</p>
          </div>
        </div>
      </motion.div>

      <div className="mt-4 flex flex-col gap-2 sm:mt-0">
      <FloatChip className="sm:left-0 sm:top-0 lg:-left-6" delay={0.55}>
        <span className="grid size-8 place-items-center rounded-full bg-success-soft text-success-ink">✓</span>
        <span>
          <b className="block text-ink">Đạt chất lượng</b>
          <span className="text-ink-muted">Khớp câu mẫu 98%</span>
        </span>
      </FloatChip>
      <FloatChip className="sm:-right-4 sm:top-[50%] lg:-right-8" delay={0.75}>
        <span className="grid size-8 place-items-center rounded-full bg-peach-soft text-peach-ink">₫</span>
        <span>
          <b className="block text-ink">+ ≈ 5.408.000 ₫</b>
          <span className="text-ink-muted">Chia cho An sau 1 lần bán</span>
        </span>
      </FloatChip>
      <FloatChip className="sm:bottom-0 sm:left-10" delay={0.95}>
        <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary">⛓</span>
        <span>
          <b className="block text-ink">Ghi nhận trên Avalanche</b>
          <span className="text-ink-muted">Xác nhận ~1 giây</span>
        </span>
      </FloatChip>
      </div>
    </div>
  );
}

function FloatChip({ children, className, delay }: { children: React.ReactNode; className: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`flex items-center gap-3 sm:absolute rounded-2xl border border-line bg-surface/95 px-3.5 py-2.5 text-sm shadow-lift backdrop-blur ${className}`}
    >
      {children}
    </motion.div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="7" y="2.5" width="6" height="10" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" strokeLinecap="round" />
    </svg>
  );
}
