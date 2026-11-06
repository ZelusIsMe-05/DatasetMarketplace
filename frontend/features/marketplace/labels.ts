const ACCENTS: Record<string, string> = {
  "mien-trung": "Giọng miền Trung",
  "mien-bac": "Giọng miền Bắc",
  "mien-nam": "Giọng miền Nam",
  "mien-tay": "Giọng miền Tây",
  "tay-nguyen": "Giọng Tây Nguyên",
};

export const accentLabel = (a: string | null | undefined) => (a ? (ACCENTS[a] ?? a) : "Chưa rõ vùng giọng");
export const campaignName = (c: { id: number; name: string | null }) => c.name ?? `Chiến dịch #${c.id}`;
export const ACCENT_OPTIONS = Object.entries(ACCENTS);

const LICENSES: Record<string, string> = {
  "research-and-commercial": "Nghiên cứu & thương mại",
  "research-only": "Chỉ nghiên cứu",
};
export const licenseLabel = (l: string | null | undefined) => (l ? (LICENSES[l] ?? l) : "—");
