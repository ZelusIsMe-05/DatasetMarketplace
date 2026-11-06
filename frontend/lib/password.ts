// Chính sách mật khẩu mạnh cho ví trong trình duyệt. Dùng chung cho giao diện (hiển thị từng điều kiện)
// và cho lib/browserWallet.ts (chặn lại lần nữa khi tạo ví).
export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  id: "length" | "upper" | "lower" | "digit" | "special";
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `Ít nhất ${PASSWORD_MIN_LENGTH} ký tự`, test: (pw) => [...pw].length >= PASSWORD_MIN_LENGTH },
  { id: "upper", label: "Có chữ viết hoa (A–Z)", test: (pw) => /\p{Lu}/u.test(pw) },
  { id: "lower", label: "Có chữ viết thường (a–z)", test: (pw) => /\p{Ll}/u.test(pw) },
  { id: "digit", label: "Có chữ số (0–9)", test: (pw) => /\p{Nd}/u.test(pw) },
  { id: "special", label: "Có ký tự đặc biệt (! @ # $ …)", test: (pw) => /[^\p{L}\p{N}\s]/u.test(pw) },
];

export interface PasswordCheck {
  results: { rule: PasswordRule; ok: boolean }[];
  passed: number;
  valid: boolean;
}

export function checkPassword(pw: string): PasswordCheck {
  const results = PASSWORD_RULES.map((rule) => ({ rule, ok: rule.test(pw) }));
  const passed = results.filter((r) => r.ok).length;
  return { results, passed, valid: passed === PASSWORD_RULES.length };
}

/** Thông báo lỗi đầu tiên (dùng khi chặn ở tầng ví). */
export function passwordError(pw: string): string | null {
  const miss = checkPassword(pw).results.find((r) => !r.ok);
  return miss ? `Mật khẩu chưa đủ mạnh: ${miss.rule.label.toLowerCase()}` : null;
}
