/** Ghép class Tailwind có điều kiện (không cần thư viện ngoài). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
