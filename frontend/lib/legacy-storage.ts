// Chuyển dữ liệu trình duyệt từ tên cũ "giongque.*" sang "datasetmarketplace.*" (đổi tên dự án 09/11, implementation-plan
// §3 #30). Chạy một lần khi module được nạp ở trình duyệt, TRƯỚC mọi lần đọc khóa — giữ nguyên ví trình duyệt đã mã hóa,
// file sao lưu đã tải, phiên đăng nhập. Khóa mới đã có thì không ghi đè.
const OLD = "giongque.";
const NEW = "datasetmarketplace.";

function migrate() {
  if (typeof window === "undefined") return;
  try {
    const old = Object.keys(window.localStorage).filter((k) => k.startsWith(OLD));
    for (const k of old) {
      const next = NEW + k.slice(OLD.length);
      const v = window.localStorage.getItem(k);
      if (v !== null && window.localStorage.getItem(next) === null) window.localStorage.setItem(next, v);
      window.localStorage.removeItem(k);
    }
  } catch {
    // localStorage bị chặn (chế độ riêng tư…): bỏ qua, các module tự xử lý khi đọc lỗi
  }
}

migrate();
export {};
