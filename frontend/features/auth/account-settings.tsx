"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AvatarKey } from "@/types/api";
import { cn } from "@/lib/cn";
import { shortHex } from "@/lib/format";
import { useAccountWallet } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/misc";
import { AVATARS, Avatar, profileKey, useProfile } from "@/features/auth/profile";

/** Cài đặt tài khoản: tên hiển thị, ảnh đại diện, ví liên kết (chỉ xem + sao chép — mỗi Gmail gắn đúng một ví). */
export function AccountSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const aw = useAccountWallet();
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarKey>("auto");
  const [saving, setSaving] = useState(false);

  // Mỗi lần mở: điền lại từ hồ sơ đã lưu
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(profile.query.data?.display_name ?? "");
    setAvatar(profile.avatar);
  }, [open, profile.query.data, profile.avatar]);

  const save = async () => {
    if (!aw.api) return;
    setSaving(true);
    try {
      const me = await aw.api.updateMe({ display_name: name.trim(), avatar });
      qc.setQueryData(profileKey(aw.address), me);
      toast.success("Đã lưu cài đặt");
      onClose();
    } catch (e) {
      toast.error("Chưa lưu được", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const preview = name.trim() || profile.email.split("@")[0] || "?";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title="Cài đặt"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Hủy</Button>
          <Button onClick={save} loading={saving}>Lưu</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar name={preview} avatar={avatar} address={aw.address} className="size-12 text-lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{preview}</p>
            <p className="truncate text-sm text-ink-muted">{profile.email}</p>
          </div>
        </div>

        <Field label="Tên hiển thị">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={profile.email.split("@")[0]} autoComplete="nickname" />
        </Field>

        <fieldset>
          <legend className="text-label">Ảnh đại diện</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <label key={a.key} className="cursor-pointer" title={a.label}>
                <input type="radio" name="avatar" value={a.key} checked={avatar === a.key} onChange={() => setAvatar(a.key)} className="peer sr-only" aria-label={a.label} />
                <span className={cn("block rounded-full p-0.5 ring-2 ring-transparent transition-shadow peer-checked:ring-primary peer-focus-visible:shadow-[var(--shadow-ring)]")}>
                  <Avatar name={preview} avatar={a.key} address={aw.address} className="size-10" />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="text-label">Ví liên kết</p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
            <span className="font-mono text-sm text-ink">{aw.address ? shortHex(aw.address, 8, 6) : "—"}</span>
            {aw.address && <CopyButton value={aw.address} label="Sao chép địa chỉ ví" />}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
