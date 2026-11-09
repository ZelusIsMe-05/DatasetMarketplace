"use client";

import { AnimatePresence, motion } from "motion/react";
import { useContributor } from "@/hooks/useSessions";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/misc";
import { LoginPanel } from "@/features/auth/login-panel";
import { WalletStatus } from "@/features/auth/wallet-status";
import { UnlockBrowserWalletForm } from "@/features/earn/wallet-forms";

const STEPS = [{ label: "Đăng nhập" }, { label: "Ví của bạn" }, { label: "Bắt đầu" }];

/**
 * Thiết lập người đóng góp: ĐĂNG NHẬP GMAIL trước, ví đi theo Gmail (implementation-plan §3 #27).
 * Lần đầu: gắn ví với Gmail — tạo ví trên trình duyệt (cơ bản) hoặc dùng MetaMask/Core. Các lần sau: chỉ cần mở khóa
 * ví trình duyệt hoặc chủ động kết nối MetaMask với đúng ví đã gắn khi bắt đầu sử dụng.
 */
export function Onboarding() {
  const c = useContributor();
  const step = c.stage === "signin" ? 0 : c.stage === "ready" ? 2 : 1;
  return (
    <div className="mx-auto w-full max-w-xl">
      <Stepper steps={STEPS} current={step} align="center" />
      <div className="surface-card mt-8 overflow-hidden p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div key={`${c.kind}-${c.stage}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            {c.stage === "signin" && <LoginPanel context="earn" />}
            {c.stage === "locked" && <UnlockWallet />}
            {c.stage === "connect" && <ConnectMetaMask />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Ví đã gắn với Gmail là ví trình duyệt trên máy này: mở khóa bằng mật khẩu (hoặc dùng MetaMask nếu đã nâng cấp). */
function UnlockWallet() {
  const { setEarnWallet } = useContributor();
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-h2">Mở khóa ví</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-muted">Nhập mật khẩu ví để tiếp tục.</p>
      </div>
      <UnlockBrowserWalletForm intro={null} />
      <div className="mt-2 flex flex-col items-center gap-3 border-t border-line pt-6 text-center">
        <Button variant="outline" onClick={() => setEarnWallet("metamask")}>
          Dùng MetaMask / Core
        </Button>
      </div>
    </div>
  );
}

/** Ví đã gắn không có trên trình duyệt này (hoặc người dùng chọn MetaMask): kết nối MetaMask vào đúng ví đó. */
function ConnectMetaMask() {
  const { isBrowserWallet, setEarnWallet } = useContributor();
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div>
        <h2 className="text-h2">Kết nối MetaMask / Core</h2>
      </div>
      <WalletStatus purpose="ghi âm và rút tiền" />
      {isBrowserWallet && (
        <button type="button" onClick={() => setEarnWallet("browser")} className="text-sm font-semibold text-primary hover:underline">
          Dùng ví trình duyệt
        </button>
      )}
    </div>
  );
}
