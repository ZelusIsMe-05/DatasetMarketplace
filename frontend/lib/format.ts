// Định dạng hiển thị tiếng Việt.
const nf = new Intl.NumberFormat("vi-VN");

export const formatNumber = (n: number) => nf.format(n);

export function formatPercentBps(bps: number, digits = 1): string {
  return `${(bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`;
}

/** 36000 -> "10 giờ"; 5400 -> "1 giờ 30 phút"; 42 -> "42 giây" */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} giây`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m} phút${sec % 60 ? ` ${sec % 60} giây` : ""}`;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

export function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function daysLeft(deadline: number, now = Date.now() / 1000): number {
  return Math.max(0, Math.ceil((deadline - now) / 86_400));
}

export const shortHex = (h: string, head = 6, tail = 4) => (h.length > head + tail + 2 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h);
