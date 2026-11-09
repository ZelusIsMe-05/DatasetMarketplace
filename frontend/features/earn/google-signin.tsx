"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GOOGLE_CLIENT_ID } from "@/lib/config";

interface GoogleId {
  accounts: {
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; button_auto_select?: boolean }) => void;
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

/** Google không cho phép địa chỉ IP làm "Authorized JavaScript origin" ⇒ ở 127.0.0.1 nút luôn báo lỗi origin. */
const noSubscribe = () => () => {};
const isLoopbackIp = () => window.location.hostname === "127.0.0.1";

// Google Identity Services chỉ giữ MỘT callback cho cả trang (initialize là toàn cục). Có thể có hai nút cùng lúc
// (hộp "Đăng nhập" ở header + nút trên trang): nút gắn sau nhận kết quả; khi nó bị gỡ, nút gắn trước nhận lại.
const mounted: (() => void)[] = [];

/** Nút "Tiếp tục với Google" (Google Identity Services) — trả ID token cho backend xác minh. */
export function GoogleSignIn({ onCredential, disabled }: { onCredential: (idToken: string) => void; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  const [failed, setFailed] = useState(false);
  const onIp = useSyncExternalStore(noSubscribe, isLoopbackIp, () => false);

  useEffect(() => {
    cb.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || disabled || onIp) return;
    let renderedWidth = 0;
    const draw = () => {
      if (!window.google || !box.current) return;
      const width = Math.floor(Math.min(360, box.current.clientWidth));
      if (width <= 0 || width === renderedWidth) return;
      renderedWidth = width;
      // GIS không hiển thị tên/email trên nút cỡ medium (personalized-button trong tài liệu Google).
      window.google.accounts.id.renderButton(box.current, { type: "standard", theme: "outline", size: "medium", text: "continue_with", shape: "pill", locale: "vi", width });
    };
    const render = () => {
      if (!window.google || !box.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential), button_auto_select: false });
      draw();
    };
    // Hộp thoại được mở sau effect: vẽ khi khung có chiều rộng, rồi cập nhật khi đổi kích thước màn hình.
    const observer = new ResizeObserver(draw);
    if (box.current) observer.observe(box.current);
    mounted.push(render);
    const release = () => {
      observer.disconnect();
      const i = mounted.indexOf(render);
      if (i >= 0) mounted.splice(i, 1);
      mounted.at(-1)?.(); // trả quyền nhận kết quả cho nút còn lại gần nhất
    };
    if (window.google) {
      render();
      return release;
    }
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
      release();
    };
  }, [disabled, onIp]);

  if (GOOGLE_CLIENT_ID && onIp) {
    const localhostUrl = window.location.href.replace("//127.0.0.1", "//localhost");
    return (
      <p role="note" className="rounded-2xl border border-[#fde68a] bg-warning-soft/60 p-4 text-sm text-warning-ink">
        Google chỉ chấp nhận đăng nhập từ địa chỉ <code className="font-mono">localhost</code>, không chấp nhận{" "}
        <code className="font-mono">127.0.0.1</code>.{" "}
        <a href={localhostUrl} className="font-semibold underline underline-offset-2">
          Mở lại trang bằng localhost
        </a>{" "}
        (ví trên trình duyệt được lưu theo từng địa chỉ — ở localhost bạn sẽ tạo một ví mới).
      </p>
    );
  }

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong bg-surface-muted p-4 text-sm text-ink-muted">
        Đăng nhập Google chưa được cấu hình trên máy chủ này (thiếu <code className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>).
      </p>
    );
  }
  if (failed) return <p className="text-sm text-danger-ink">Không tải được Google Sign-In. Kiểm tra kết nối mạng.</p>;
  // data-google-button: nội dung bên trong do Google tự vẽ (iframe hoặc div) — e2e loại vùng này khỏi lượt quét axe
  return <div ref={box} className="flex min-h-12 w-full items-center justify-center" aria-label="Tiếp tục với Google" data-google-button />;
}
