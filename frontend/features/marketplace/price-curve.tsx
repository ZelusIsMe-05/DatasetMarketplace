"use client";

import { motion } from "motion/react";

/** Đường giá theo tiến độ: giá = full × (0,3 + 0,7 × p). Đánh dấu vị trí hiện tại. */
export function PriceCurve({ progressBps, fullVnd }: { progressBps: number; fullVnd: number }) {
  const W = 320;
  const H = 140;
  const pad = 24;
  const x = (p: number) => pad + p * (W - pad * 2);
  const y = (frac: number) => H - pad - ((frac - 0.3) / 0.7) * (H - pad * 2);
  const p = progressBps / 10_000;
  const cur = 0.3 + 0.7 * p;
  const fmt = (v: number) => `${(v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Giá tăng từ 30% lên 100% giá đầy đủ theo tiến độ. Hiện tại ${Math.round(p * 100)}% tiến độ, ${Math.round(cur * 100)}% giá.`}>
        <defs>
          <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2563eb" stopOpacity="0.18" />
            <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.3, 0.65, 1].map((f) => (
          <g key={f}>
            <line x1={pad} x2={W - pad} y1={y(f)} y2={y(f)} stroke="#e2e8f0" strokeDasharray="3 4" />
            <text x={W - pad} y={y(f) - 4} textAnchor="end" className="fill-[#64748b] text-[11px]">{fmt(fullVnd * f)}</text>
          </g>
        ))}
        <path d={`M${x(0)} ${y(0.3)} L${x(1)} ${y(1)} L${x(1)} ${H - pad} L${x(0)} ${H - pad}Z`} fill="url(#pc-fill)" />
        <motion.path d={`M${x(0)} ${y(0.3)} L${x(1)} ${y(1)}`} stroke="#2563eb" strokeWidth="2.5" fill="none" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
        <motion.line x1={x(p)} x2={x(p)} y1={H - pad} y2={y(cur)} stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="2 3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} />
        <motion.circle cx={x(p)} cy={y(cur)} r="6" fill="#fff" stroke="#06b6d4" strokeWidth="3" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7, type: "spring", bounce: 0.3 }} />
        <text x={pad} y={H - 6} className="fill-[#64748b] text-[11px]">0%</text>
        <text x={W - pad} y={H - 6} textAnchor="end" className="fill-[#64748b] text-[11px]">100% tiến độ</text>
      </svg>
      <figcaption className="mt-2 text-caption">Mua càng sớm, giá càng thấp — bạn vẫn nhận mọi phiên bản cập nhật đến khi đủ mục tiêu.</figcaption>
    </figure>
  );
}
