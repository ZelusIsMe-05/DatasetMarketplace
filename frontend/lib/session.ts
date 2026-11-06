// Phiên đăng nhập (JWT backend) lưu theo địa chỉ ví: ví trình duyệt của người đóng góp và ví Core/MetaMask của
// người tạo/người mua có phiên riêng. Không lưu khóa riêng ở đây (khóa ví trình duyệt luôn được mã hóa).
import type { Session } from "@/types/api";

const KEY = "giongque.sessions.v1";

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
