"use client";

import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID } from "@/lib/config";

interface GoogleId {
  accounts: {
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleId;
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";

/** Nút "Đăng nhập với Google" (Google Identity Services) — trả ID token cho backend xác minh. */
export function GoogleSignIn({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    cb.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || disabled) return;
    const render = () => {
      if (!window.google || !box.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential) });
      window.google.accounts.id.renderButton(box.current, { theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: "vi", width: 320 });
    };
    if (window.google) return render();
    let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", render);
    const onError = () => setFailed(true);
    s.addEventListener("error", onError);
    return () => {
      s?.removeEventListener("load", render);
      s?.removeEventListener("error", onError);
    };
  }, [disabled]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong bg-surface-muted p-4 text-sm text-ink-muted">
        Đăng nhập Google chưa được cấu hình trên máy chủ này (thiếu <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>).
      </p>
    );
  }
  if (failed) return <p className="text-sm text-danger-ink">Không tải được Google Sign-In. Kiểm tra kết nối mạng.</p>;
  return <div ref={box} className="min-h-11" aria-label="Đăng nhập với Google" />;
}
