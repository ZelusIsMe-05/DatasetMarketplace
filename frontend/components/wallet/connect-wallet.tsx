// Nút "Kết nối ví" riêng đã được thay bằng đăng nhập Gmail (ví đi theo Gmail — features/auth, implementation-plan §3 #27).
// File này chỉ còn màu avatar "Tự động" theo địa chỉ ví (features/auth/profile.tsx).

export function avatarGradient(address: string): string {
  const h = parseInt(address.slice(2, 8), 16) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 42%), hsl(${(h + 70) % 360} 75% 34%))`; // đủ tối cho chữ cái đầu màu trắng
}
