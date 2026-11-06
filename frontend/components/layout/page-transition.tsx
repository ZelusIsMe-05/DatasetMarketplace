import { ViewTransition, type ReactNode } from "react";

/**
 * Chuyển trang mềm bằng React <ViewTransition> + View Transitions API (Next.js 16 tự kích hoạt khi điều hướng).
 * Đặt trong từng page (không đặt ở layout — layout không unmount nên không có enter/exit).
 * CSS ở app/globals.css (.page), có nhánh prefers-reduced-motion chỉ còn fade.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page" exit="page" default="none">
      <div className="flex flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
