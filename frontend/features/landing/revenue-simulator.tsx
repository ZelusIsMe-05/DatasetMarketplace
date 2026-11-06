"use client";

import { motion } from "motion/react";
import { useId, useState } from "react";
import { AnimatedNumber, Reveal, SectionHeading } from "@/components/ui/misc";
import { formatVnd } from "@/lib/money";

// Công thức đúng như contract (đề xuất §6.5, §6.7): giá = full × (0,3 + 0,7 × tiến độ); 80/10/10.
const FULL_VND = 26_000_000;
const TARGET_H = 10;

export function RevenueSimulator() {
  const [an, setAn] = useState(2);
  const [binh, setBinh] = useState(3);
  const progress = Math.min(1, (an + binh) / TARGET_H);
  const price = FULL_VND * (0.3 + 0.7 * progress);
  const pool = price * 0.8;
  const total = an + binh;
  const anGets = total ? (pool * an) / total : 0;
  const binhGets = total ? (pool * binh) / total : 0;
  const share = (x: number) => (price ? x / price : 0);

  return (
    <section className="py-20 sm:py-28" aria-labelledby="revshare">
      <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <SectionHeading
            eyebrow="Chia doanh thu minh bạch"
            title={<span id="revshare">Thử tính: một lần bán được chia thế nào?</span>}
            description="Chiến dịch mẫu: mục tiêu 10 giờ giọng, giá đầy đủ 26 triệu đồng, chia 80% người đóng góp / 10% người tạo / 10% nền tảng. Kéo thanh trượt để thay đổi số giờ mỗi người đóng góp."
          />
          <p className="mt-4 text-caption">Đây là máy tính minh họa dùng đúng công thức của hợp đồng; số tiền thật luôn do contract tính tại thời điểm mua.</p>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="surface-card p-6 sm:p-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <HoursSlider label="An đóng góp" value={an} onChange={setAn} color="accent-[#2563eb]" />
              <HoursSlider label="Bình đóng góp" value={binh} onChange={setBinh} color="accent-[#06b6d4]" />
            </div>
            <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
              <div>
                <p className="text-label">Tiến độ {Math.round(progress * 100)}% → giá bán</p>
                <p className="mt-1 text-3xl font-bold tracking-tight">
                  ≈ <AnimatedNumber value={price} format={(n) => formatVnd(Math.round(n))} />
                </p>
              </div>
              <p className="text-sm text-ink-muted">= {Math.round((0.3 + 0.7 * progress) * 100)}% giá đầy đủ</p>
            </div>
            <div className="mt-6 flex h-4 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`An ${Math.round(share(anGets) * 100)}%, Bình ${Math.round(share(binhGets) * 100)}%, người tạo 10%, nền tảng 10%`}>
              <motion.span className="h-full bg-primary" animate={{ width: `${share(anGets) * 100}%` }} />
              <motion.span className="h-full bg-cyan" animate={{ width: `${share(binhGets) * 100}%` }} />
              <span className="h-full w-[10%] bg-peach" />
              <span className="h-full w-[10%] bg-line-strong" />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Split dot="bg-primary" label="An nhận" value={anGets} />
              <Split dot="bg-cyan" label="Bình nhận" value={binhGets} />
              <Split dot="bg-peach" label="Người tạo" value={price * 0.1} />
              <Split dot="bg-line-strong" label="Nền tảng" value={price * 0.1} />
            </dl>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HoursSlider({ label, value, onChange, color }: { label: string; value: number; onChange: (n: number) => void; color: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-label">{label}</label>
        <span className="tabular text-lg font-bold">{value} giờ</span>
      </div>
      <input id={id} type="range" min={0} max={10} step={0.5} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`h-2 w-full cursor-pointer ${color}`} aria-valuetext={`${value} giờ`} />
    </div>
  );
}

function Split({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-caption">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-ink">
        ≈ <AnimatedNumber value={value} format={(n) => formatVnd(Math.round(n))} />
      </dd>
    </div>
  );
}
