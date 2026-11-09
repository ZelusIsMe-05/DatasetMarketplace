"use client";

// Hồ sơ hiển thị của tài khoản đang đăng nhập (implementation-plan §3 #31): tên hiển thị + mẫu ảnh đại diện,
// lưu ở backend (PATCH /auth/me). Ảnh đại diện là mẫu màu có sẵn + chữ cái đầu — không tải ảnh lên máy chủ.
import { useQuery } from "@tanstack/react-query";
import type { AvatarKey } from "@/types/api";
import { cn } from "@/lib/cn";
import { useAccountWallet } from "@/hooks/useSessions";
import { avatarGradient } from "@/components/wallet/connect-wallet";

export const AVATARS: { key: AvatarKey; label: string }[] = [
  { key: "auto", label: "Tự động" },
  { key: "ocean", label: "Biển" },
  { key: "sunset", label: "Hoàng hôn" },
  { key: "forest", label: "Rừng" },
  { key: "berry", label: "Tím" },
  { key: "amber", label: "Hổ phách" },
  { key: "rose", label: "Hồng" },
  { key: "slate", label: "Xám" },
];

export const profileKey = (address?: string | null) => ["me", "profile", address?.toLowerCase()] as const;

/** Tên + ảnh đại diện của tài khoản đang đăng nhập; chưa tải xong thì dùng email. */
export function useProfile() {
  const aw = useAccountWallet();
  const q = useQuery({ queryKey: profileKey(aw.address), queryFn: () => aw.api!.me(), enabled: Boolean(aw.api), staleTime: 60_000 });
  const email = aw.email ?? "";
  return {
    query: q,
    email,
    address: aw.address,
    name: q.data?.display_name || email.split("@")[0] || "Tài khoản",
    avatar: (q.data?.avatar ?? "auto") as AvatarKey,
  };
}

export function avatarBackground(avatar: AvatarKey, address?: string | null): string {
  if (avatar === "auto") return address ? avatarGradient(address) : "var(--avatar-slate)";
  return `var(--avatar-${avatar})`;
}

export function Avatar({ name, avatar, address, className }: { name: string; avatar: AvatarKey; address?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase text-white", className)}
      style={{ background: avatarBackground(avatar, address), textShadow: "0 1px 2px rgb(15 23 42 / 0.35)" }}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
