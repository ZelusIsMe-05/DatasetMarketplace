"use client";

import Link from "next/link";

/**
 * Gmail đang đăng nhập gắn với VÍ TRÌNH DUYỆT (cấp cơ bản — chỉ ghi âm / rút tiền / thu hồi), mà trang này cần
 * MetaMask/Core (tạo chiến dịch, mua dữ liệu). Mỗi Gmail chỉ một ví, nên cách đúng là NÂNG CẤP: nạp chính ví đó vào
 * MetaMask/Core (cùng địa chỉ) — tiền, bản ghi và Gmail giữ nguyên.
 */
export function BrowserWalletNotice({ purpose }: { purpose: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-[#fde68a] bg-warning-soft p-4 text-left text-sm text-warning-ink">
      <p className="font-semibold">Cần MetaMask để {purpose}</p>
      <p className="mt-1">
        Tài khoản này đang dùng ví trình duyệt. Vào{" "}
        <Link href="/earn" className="font-semibold underline">
          Kiếm tiền
        </Link>{" "}
        → <b>Nâng cấp lên MetaMask</b>.
      </p>
    </div>
  );
}
