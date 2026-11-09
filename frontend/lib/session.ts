// Phiên đăng nhập (JWT backend) lưu theo ĐỊA CHỈ ví (không theo loại ví): nạp ví trình duyệt vào MetaMask (cùng
// địa chỉ) thì dùng tiếp đúng phiên đó. Không lưu khóa riêng ở đây (khóa ví trình duyệt luôn được mã hóa).
import "@/lib/legacy-storage";
import type { Session } from "@/types/api";

const KEY = "datasetmarketplace.sessions.v1";

export interface StoredSession {
  token: string;
  expiresAt: number;
  email: string;
  address: `0x${string}`;
}

type Store = Record<string, StoredSession>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function getSession(address: string | null | undefined): StoredSession | null {
  if (!address) return null;
  const s = read()[address.toLowerCase()];
  if (!s || s.expiresAt * 1000 < Date.now() + 30_000) return null;
  return s;
}

export function saveSession(s: Session): StoredSession {
  const stored: StoredSession = { token: s.access_token, expiresAt: s.expires_at, email: s.email, address: s.wallet_address };
  write({ ...read(), [s.wallet_address.toLowerCase()]: stored });
  return stored;
}

export function clearSession(address: string): void {
  const store = read();
  delete store[address.toLowerCase()];
  write(store);
}

/** Mọi phiên còn hạn đang lưu (để kiểm tra lại với máy chủ lúc tải trang). */
export function allSessions(): StoredSession[] {
  return Object.values(read()).filter((s) => s.expiresAt * 1000 >= Date.now() + 30_000);
}

/** Xóa phiên theo token (máy chủ trả 401: database đã reset, phiên hết hạn...). Trả true nếu có phiên bị xóa. */
export function clearSessionByToken(token: string): boolean {
  const store = read();
  const keys = Object.keys(store).filter((k) => store[k].token === token);
  keys.forEach((k) => delete store[k]);
  if (keys.length) write(store);
  return keys.length > 0;
}

// Tài khoản đang đăng nhập = một phiên (Gmail ↔ ví đã gắn trong DB). Lưu địa chỉ ví của phiên đó.
const ACTIVE_KEY = "datasetmarketplace.activeAccount.v1";

export function getActiveAddress(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveAddress(address: string | null): void {
  try {
    if (address) localStorage.setItem(ACTIVE_KEY, address.toLowerCase());
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* bộ nhớ bị chặn: chỉ giữ tới khi tải lại trang */
  }
}

/** Sự kiện phát khi một lệnh gọi API có token bị 401 — AuthProvider nghe để xóa phiên và hiện lại bước đăng nhập. */
export const SESSION_EXPIRED_EVENT = "datasetmarketplace:session-expired";
