// Ví trong trình duyệt cho người đóng góp (đề xuất §8.2): khóa sinh bằng viem, mã hóa bằng mật khẩu
// (PBKDF2-SHA256 + AES-GCM, WebCrypto) rồi lưu localStorage. Người đóng góp không cần AVAX — chỉ ký.
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { TypedDataResponse } from "@/types/api";
import { passwordError } from "@/lib/password";

const STORAGE_KEY = "giongque.wallet.v1";
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

export async function unlockWallet(password: string): Promise<PrivateKeyAccount> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error("Chưa có ví trong trình duyệt");
  const enc = JSON.parse(raw) as EncryptedWallet;
  const key = await deriveKey(password, unb64(enc.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(enc.iv) }, key, unb64(enc.ciphertext));
    return privateKeyToAccount(new TextDecoder().decode(plain) as `0x${string}`);
  } catch {
    throw new Error("Sai mật khẩu ví");
  }
}

/** Ký dữ liệu EIP-712 mà backend trả về (Consent / Claim / Revoke). */
export async function signTyped(account: PrivateKeyAccount, td: TypedDataResponse): Promise<`0x${string}`> {
  const { EIP712Domain: _domain, ...types } = td.typed_data.types;
  void _domain;
  return account.signTypedData({
    domain: td.typed_data.domain,
    types,
    primaryType: td.typed_data.primaryType,
    message: td.typed_data.message,
  });
}
