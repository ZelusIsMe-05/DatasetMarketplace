import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-h1">Không tìm thấy trang này</h1>
      <p className="text-lead max-w-md">Đường dẫn có thể đã thay đổi. Hãy quay lại trang chủ hoặc khám phá các bộ dữ liệu.</p>
      <div className="flex gap-3">
        <ButtonLink href="/">Về trang chủ</ButtonLink>
        <ButtonLink href="/explore" variant="outline">Khám phá dữ liệu</ButtonLink>
      </div>
    </div>
  );
}
