"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { BACKUP_EVENT, backedUpAt, exportKeystore, markBackedUp } from "@/lib/browserWallet";
import { describeChainError } from "@/lib/chainErrors";
import { formatDateTime, shortHex } from "@/lib/format";
import { keystoreFileName } from "@/lib/keystore";
import { useContributor, useWalletActions } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

const subscribe = (cb: () => void) => {
  window.addEventListener(BACKUP_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BACKUP_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/** Thời điểm đã tải file sao lưu cho ví này (ms) hoặc null. */
export function useBackedUpAt(address: string | null | undefined): number | null {
  return useSyncExternalStore(subscribe, () => backedUpAt(address), () => null);
}

/** Thẻ ở trang Tổng quan khi người đóng góp dùng ví trình duyệt: sao lưu + nâng cấp lên MetaMask (cùng địa chỉ ví). */
export function WalletBackupCard() {
  const c = useContributor();
  const backed = useBackedUpAt(c.address);
  const [mode, setMode] = useState<"backup" | "upgrade" | null>(null);
  if (c.kind !== "browser" || !c.address) return null;
  return (
    <Card tone={backed ? "default" : "peach"} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-2xl">
        <h2 className="text-h3">Sao lưu ví &amp; nâng cấp lên MetaMask</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Ví {shortHex(c.address)} đang nằm trong trình duyệt này. Xóa dữ liệu trình duyệt, đổi máy hoặc quên mật khẩu mà chưa có file sao lưu thì
          mất ví cùng tiền trong ví. Nạp file vào MetaMask/Core để dùng chính ví này tạo chiến dịch và mua dữ liệu.
        </p>
        <p role="status" className={backed ? "mt-2 text-sm font-medium text-success-ink" : "mt-2 text-sm font-semibold text-peach-ink"}>
          {backed ? `✓ Đã tải file sao lưu lúc ${formatDateTime(Math.floor(backed / 1000))}` : "Chưa sao lưu ví"}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-3">
        <Button variant={backed ? "outline" : "primary"} onClick={() => setMode("backup")}>
          Tải file sao lưu
        </Button>
        <Button variant={backed ? "primary" : "outline"} onClick={() => setMode("upgrade")}>
          Nâng cấp lên MetaMask
        </Button>
      </div>
      <WalletFileDialog mode={mode} onClose={() => setMode(null)} />
    </Card>
  );
}

function WalletFileDialog({ mode, onClose }: { mode: "backup" | "upgrade" | null; onClose: () => void }) {
  const c = useContributor();
  const toast = useToast();
  const actions = useWalletActions();
  const backed = useBackedUpAt(c.address);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "connect" | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setPw("");
    setError(null);
    setConnectError(null);
    onClose();
  };

  const download = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("export");
    setError(null);
    try {
      const { address, json } = await exportKeystore(pw);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = keystoreFileName(address);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      markBackedUp(address);
      setPw("");
      toast.success("Đã tải file ví", "Cất file cẩn thận và không gửi cho ai. Mở file cần đúng mật khẩu ví.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xuất được file");
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    if (!c.address) return;
    setBusy("connect");
    setConnectError(null);
    try {
      const addr = await actions.connect();
      if (!addr || addr.toLowerCase() !== c.address.toLowerCase()) {
        throw new Error(`MetaMask đang chọn ví ${addr ? shortHex(addr) : "khác"}, không phải ví ${shortHex(c.address)}. Hãy chọn đúng tài khoản vừa nạp trong MetaMask rồi bấm lại.`);
      }
      c.setEarnWallet("metamask");
      toast.success("Đã chuyển sang MetaMask", "Cùng ví, cùng Gmail: bạn có thể tạo chiến dịch và mua dữ liệu bằng ví này.");
      onClose();
    } catch (err) {
      setConnectError(describeChainError(err));
    } finally {
      setBusy(null);
    }
  };

  const upgrade = mode === "upgrade";
  return (
    <Dialog
      open={mode !== null}
      onClose={close}
      dismissible={!busy}
      size="md"
      title={upgrade ? "Nâng cấp lên MetaMask" : "Tải file sao lưu ví"}
      description={
        upgrade
          ? "Nạp chính ví này vào MetaMask/Core: cùng địa chỉ ví nên Gmail, tiền đã kiếm, tiền chia sau này và quyền thu hồi đều giữ nguyên."
          : "File được mã hóa bằng chính mật khẩu ví. Có file + mật khẩu là khôi phục được ví ở bất kỳ máy nào (nạp vào MetaMask/Core)."
      }
      footer={<Button variant="ghost" onClick={close} disabled={!!busy}>Đóng</Button>}
    >
      <ol className="flex flex-col gap-5">
        <li>
          <p className="font-semibold text-ink">{upgrade ? "1. Tải file ví" : "Tải file ví"}</p>
          <form onSubmit={download} className="mt-3 flex flex-col gap-3">
            <Field label="Mật khẩu ví" error={error} hint="Mật khẩu bạn đặt khi tạo ví. Mở file sau này cũng cần đúng mật khẩu này.">
              <PasswordInput autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </Field>
            <Button type="submit" loading={busy === "export"} disabled={!pw || !!busy}>
              Tải file ví
            </Button>
            {backed && <p className="text-sm font-medium text-success-ink">✓ Đã tải file lúc {formatDateTime(Math.floor(backed / 1000))}</p>}
          </form>
          <p className="mt-2 text-caption">File không chứa mật khẩu, Gmail hay dữ liệu cá nhân. Ai có file vẫn phải đoán mật khẩu, nên đừng gửi file cho người khác.</p>
        </li>
        {upgrade && (
          <>
            <li>
              <p className="font-semibold text-ink">2. Nạp file vào MetaMask</p>
              <p className="mt-1 text-sm text-ink-soft">
                Mở MetaMask → bấm tên tài khoản → <b>Add account or hardware wallet</b> → <b>Import account</b> → chọn kiểu <b>JSON File</b> → chọn file
                vừa tải → nhập mật khẩu ví. Với Core: nhập bằng khóa riêng hoặc file keystore nếu ví hỗ trợ.
              </p>
            </li>
            <li>
              <p className="font-semibold text-ink">3. Kết nối đúng ví {c.address ? shortHex(c.address) : ""}</p>
              <p className="mt-1 text-sm text-ink-soft">Trong MetaMask chọn tài khoản vừa nạp, rồi bấm nút dưới đây. Ví trình duyệt vẫn còn trên máy này làm bản dự phòng.</p>
              <Button className="mt-3" variant="outline" onClick={connect} loading={busy === "connect"} disabled={!!busy}>
                Kết nối MetaMask
              </Button>
              {connectError && <p role="alert" className="mt-2 text-sm text-danger-ink">{connectError}</p>}
            </li>
          </>
        )}
      </ol>
    </Dialog>
  );
}
