import type { ReactNode } from "react";

/**
 * Hiển thị văn bản điều khoản (Markdown đơn giản: #, ##, -, **đậm**) thành HTML có cấu trúc.
 * Chỉ đổi cách trình bày — byte văn bản (được băm thành termsHash on-chain) không bị thay đổi.
 */
export function TermsText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-5 list-disc space-y-1">
          {list.map((li, i) => <li key={i}>{inline(li)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) return void list.push(line.slice(2));
    flush();
    if (!line.trim()) return;
    if (line.startsWith("## ")) blocks.push(<h4 key={i} className="mt-2 font-semibold text-ink">{inline(line.slice(3))}</h4>);
    else if (line.startsWith("# ")) blocks.push(<h3 key={i} className="text-base font-bold text-ink">{inline(line.slice(2))}</h3>);
    else blocks.push(<p key={i}>{inline(line)}</p>);
  });
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
      : part.startsWith("`") ? <code key={i} className="rounded bg-surface-muted px-1 font-mono text-[0.85em]">{part.slice(1, -1)}</code>
        : part.startsWith("*") ? <em key={i}>{part.slice(1, -1)}</em>
          : part,
  );
}
