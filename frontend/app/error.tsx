"use client";

import { Button } from "@/components/ui/button";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center" role="alert">
      <h1 className="text-h2">Đã có lỗi xảy ra</h1>
      <p className="max-w-md text-ink-muted">{error.message || "Trang gặp sự cố ngoài dự kiến."}</p>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
