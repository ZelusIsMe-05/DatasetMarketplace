/**
 * Chờ tới khi tab đang hiển thị. Ký trong cửa sổ MetaMask/Core có thể che kín trình duyệt — Chrome trên Windows coi trang
 * bị che là "hidden", và chuyển trang lúc đó làm View Transitions API báo `InvalidStateError: Document hidden`.
 * Gọi trước `router.push` sau một bước ký ví.
 */
export function whenVisible(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}
