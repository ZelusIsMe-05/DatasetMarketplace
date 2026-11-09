// Quy đổi hiển thị VNĐ <-> đơn vị token on-chain (USDC, 6 số thập phân) — đề xuất §12.5.
// On-chain luôn lưu USDC; VNĐ chỉ là lớp hiển thị và nhập liệu.
import type { Money } from "@/types/api";

const DECIMALS = 6;

export function unitsToVnd(units: bigint, rate: number): number {
  return Math.round((Number(units) / 10 ** DECIMALS) * rate);
}

export function vndToUnits(vnd: number, rate: number): bigint {
  return BigInt(Math.round((vnd / rate) * 10 ** DECIMALS));
}

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function formatVnd(vnd: number): string {
  return vndFormatter.format(vnd); // 16900000 -> "16.900.000 ₫"
}

// Ví dụ hiển thị: "≈ 16.900.000 ₫" kèm dòng phụ "650 USDC trên Avalanche"
export function displayPrice(units: bigint, rate: number, symbol = "USDC"): { main: string; sub: string } {
  return {
    main: `≈ ${formatVnd(unitsToVnd(units, rate))}`,
    sub: `${(Number(units) / 10 ** DECIMALS).toLocaleString("vi-VN")} ${symbol} trên Avalanche`,
  };
}

/** Số tiền on-chain (bigint, đọc từ contract) -> cùng định dạng Money mà backend trả về. */
export function moneyFromUnits(units: bigint, rate: number, symbol = "USDC"): Money {
  const vnd = unitsToVnd(units, rate);
  return {
    units: Number(units),
    vnd,
    display: `≈ ${formatVnd(vnd)}`,
    token: `${formatTokenUnits(units)} ${symbol}`,
  };
}

/** bigint 6 decimals -> "650" / "0,1" (không mất chính xác). */
export function formatTokenUnits(units: bigint): string {
  const neg = units < BigInt(0);
  const abs = neg ? -units : units;
  const base = BigInt(10 ** DECIMALS);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toLocaleString("vi-VN")}${frac ? `,${frac}` : ""}`;
}

/** Backend đã trả sẵn cả hai dạng (đề xuất §11): dùng trực tiếp. */
export function displayMoney(m: Money): { main: string; sub: string } {
  return { main: m.display, sub: m.token };
}
