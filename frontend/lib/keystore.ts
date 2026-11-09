// File ví chuẩn "keystore V3" (định dạng chung của ví Ethereum/Avalanche): MetaMask/Core nhập được bằng
// "Import account → JSON File". Dùng để SAO LƯU ví trình duyệt và NÂNG CẤP lên MetaMask (cùng địa chỉ ví).
// KDF PBKDF2-HMAC-SHA256 + AES-128-CTR + MAC keccak256 — có sẵn trong WebCrypto và viem, không thêm thư viện.
// File chỉ chứa khóa ĐÃ MÃ HÓA bằng mật khẩu ví; không chứa mật khẩu, email hay dữ liệu cá nhân.
import { bytesToHex, concat, hexToBytes, keccak256, type Hex } from "viem";

export const KEYSTORE_PBKDF2_ITERATIONS = 262_144; // cùng mức geth dùng cho keystore PBKDF2

export interface KeystoreV3 {
  version: 3;
  id: string;
  address: string; // chữ thường, không có 0x (theo chuẩn)
  crypto: {
    ciphertext: string;
    cipherparams: { iv: string };
    cipher: "aes-128-ctr";
    kdf: "pbkdf2";
    kdfparams: { c: number; dklen: 32; prf: "hmac-sha256"; salt: string };
    mac: string;
  };
}

const hex = (b: Uint8Array) => bytesToHex(b).slice(2);

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, base, 256);
  return new Uint8Array(bits);
}

/** Mã hóa khóa riêng thành keystore V3 bằng mật khẩu (giống `geth account` / `eth_account.Account.encrypt`). */
export async function encryptKeystoreV3(privateKey: Hex, address: string, password: string, iterations = KEYSTORE_PBKDF2_ITERATIONS): Promise<KeystoreV3> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const dk = await deriveKey(password, salt, iterations);
  const aesKey = await crypto.subtle.importKey("raw", dk.slice(0, 16) as BufferSource, { name: "AES-CTR" }, false, ["encrypt"]);
  // length 128: cả khối 16 byte là bộ đếm, khớp aes-128-ctr của OpenSSL/Node
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CTR", counter: iv as BufferSource, length: 128 }, aesKey, hexToBytes(privateKey) as BufferSource));
  const mac = keccak256(concat([dk.slice(16, 32), ciphertext]));
  return {
    version: 3,
    id: crypto.randomUUID(),
    address: address.toLowerCase().replace(/^0x/, ""),
    crypto: {
      ciphertext: hex(ciphertext),
      cipherparams: { iv: hex(iv) },
      cipher: "aes-128-ctr",
      kdf: "pbkdf2",
      kdfparams: { c: iterations, dklen: 32, prf: "hmac-sha256", salt: hex(salt) },
      mac: mac.slice(2),
    },
  };
}

/** Tên file gợi ý khi tải về: vi-datasetmarketplace-0xABC….json (giữ định danh kỹ thuật "datasetmarketplace"). */
export const keystoreFileName = (address: string) => `vi-datasetmarketplace-${address}.json`;
