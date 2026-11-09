// Ví trong trình duyệt cho người đóng góp (đề xuất §8.2): khóa sinh bằng viem, mã hóa bằng mật khẩu
// (PBKDF2-SHA256 + AES-GCM, WebCrypto) rồi lưu localStorage. Người đóng góp không cần AVAX — chỉ ký.
// Ví này chỉ dùng ở khu vực ghi âm (/earn). Sao lưu / nâng cấp: xuất keystore V3 (lib/keystore.ts) rồi nạp vào
// MetaMask/Core — cùng địa chỉ ví, nên Gmail, tiền và quyền thu hồi giữ nguyên.
import "@/lib/legacy-storage";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { TypedDataResponse } from "@/types/api";
import { encryptKeystoreV3 } from "@/lib/keystore";
import { passwordError } from "@/lib/password";

const STORAGE_KEY = "datasetmarketplace.wallet.v1";
const BACKUP_KEY = "datasetmarketplace.walletBackup.v1"; // { địa chỉ chữ thường: thời điểm tải file sao lưu (ms) }
export const BACKUP_EVENT = "datasetmarketplace:wallet-backup";
const PBKDF2_ITERATIONS = 310_000;

interface EncryptedWallet {
  address: `0x${string}`;
  salt: string;
  iv: string;
  ciphertext: string;
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function storedWalletAddress(): `0x${string}` | null {
  const raw = typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as EncryptedWallet).address : null;
}

export async function createWallet(password: string): Promise<PrivateKeyAccount> {
  const weak = passwordError(password); // cùng chính sách với giao diện (lib/password.ts)
  if (weak) throw new Error(weak);
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pk));
  const enc: EncryptedWallet = { address: account.address, salt: b64(salt), iv: b64(iv), ciphertext: b64(ciphertext) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(enc));
  return account;
}

async function decryptPrivateKey(password: string): Promise<{ address: `0x${string}`; pk: `0x${string}` }> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("Chưa có ví trong trình duyệt");
  const enc = JSON.parse(raw) as EncryptedWallet;
  const key = await deriveKey(password, unb64(enc.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(enc.iv) }, key, unb64(enc.ciphertext));
    return { address: enc.address, pk: new TextDecoder().decode(plain) as `0x${string}` };
  } catch {
    throw new Error("Sai mật khẩu ví");
  }
}

export async function unlockWallet(password: string): Promise<PrivateKeyAccount> {
  return privateKeyToAccount((await decryptPrivateKey(password)).pk);
}

/** File sao lưu: keystore V3 mã hóa bằng CHÍNH mật khẩu ví (sai mật khẩu thì không xuất). */
export async function exportKeystore(password: string): Promise<{ address: `0x${string}`; json: string }> {
  const { address, pk } = await decryptPrivateKey(password);
  const ks = await encryptKeystoreV3(pk, address, password);
  return { address, json: JSON.stringify(ks) };
}

function readBackups(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** Thời điểm người dùng tải file sao lưu của ví này trên trình duyệt này (null = chưa sao lưu). */
export function backedUpAt(address: string | null | undefined): number | null {
  if (!address || typeof window === "undefined") return null;
  return readBackups()[address.toLowerCase()] ?? null;
}

export function markBackedUp(address: string): void {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ ...readBackups(), [address.toLowerCase()]: Date.now() }));
  } catch {
    /* bộ nhớ trình duyệt bị chặn: chỉ mất lời nhắc, file vẫn đã tải */
  }
  window.dispatchEvent(new Event(BACKUP_EVENT));
}

/** Tách dữ liệu EIP-712 backend trả về thành tham số ký của viem (bỏ EIP712Domain — viem tự dựng từ domain). */
export function typedDataArgs(td: TypedDataResponse) {
  const { EIP712Domain: _domain, ...types } = td.typed_data.types;
  void _domain;
  return { domain: td.typed_data.domain, types, primaryType: td.typed_data.primaryType, message: td.typed_data.message };
}

/** Ký dữ liệu EIP-712 mà backend trả về (Consent / Claim / Revoke) bằng ví trình duyệt. */
export async function signTyped(account: PrivateKeyAccount, td: TypedDataResponse): Promise<`0x${string}`> {
  return account.signTypedData(typedDataArgs(td));
}
