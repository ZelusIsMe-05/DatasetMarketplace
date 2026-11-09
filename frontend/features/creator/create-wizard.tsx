"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { whenVisible } from "@/lib/visibility";
import type { Address } from "viem";
import type { CampaignDraftRequest } from "@/types/api";
import { describeChainError } from "@/lib/chainErrors";
import { network } from "@/lib/config";
import { formatDuration, formatNumber, parseViNumber } from "@/lib/format";
import { formatVnd, moneyFromUnits } from "@/lib/money";
import { qk, useFees, useFx } from "@/hooks/queries";
import { useTokenBalance } from "@/hooks/useChain";
import { useWalletSession } from "@/hooks/useSessions";
import { useSponsoredFlow } from "@/hooks/useSponsored";
import { publicApi } from "@/services/api";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Stepper } from "@/components/ui/misc";
import { TxSteps } from "@/components/tx/tx-steps";
import { ACCENT_OPTIONS } from "@/features/marketplace/labels";
import { TERMS_TEMPLATE } from "@/features/creator/terms-template";

const STEPS = [{ label: "Thông tin" }, { label: "Câu mẫu" }, { label: "Điều khoản" }, { label: "Mục tiêu & giá" }, { label: "Xem trước & ký" }];

interface Form {
  name: string;
  description: string;
  purpose: string;
  accent: string;
  license: string;
  prompts: string;
  terms: string;
  targetHours: string;
  priceVnd: string;
  contributorPct: string;
  creatorPct: string;
  days: string;
  seedVnd: string;
  seedPerMinVnd: string;
}

const INITIAL: Form = {
  name: "", description: "", purpose: "", accent: "mien-trung", license: "research-and-commercial", prompts: "", terms: TERMS_TEMPLATE,
  targetHours: "10", priceVnd: "26000000", contributorPct: "80", creatorPct: "10", days: "30", seedVnd: "0", seedPerMinVnd: "13000",
};

/** Kiểm tra câu mẫu phía client theo §10.2 (server kiểm tra thêm vocab của model). */
function checkPrompts(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const errors: string[] = [];
  lines.forEach((l, i) => {
    const n = l.split(/\s+/).length;
    if (/\d/.test(l)) errors.push(`Câu ${i + 1}: viết số bằng chữ`);
    if (n < 6 || n > 20) errors.push(`Câu ${i + 1}: cần 6–20 từ (đang ${n})`);
    const k = l.toLowerCase();
    if (seen.has(k)) errors.push(`Câu ${i + 1}: trùng câu trước`);
    seen.add(k);
  });
  return { lines, errors };
}

const PROMPT_FILE_MAX_BYTES = 512_000;

/**
 * Next.js 16 giữ trang vừa rời trong <Activity hidden> nên state của form KHÔNG mất khi điều hướng. Sau khi tạo chiến dịch
 * thành công, lúc trang bị ẩn (effect cleanup) ta đổi `key` ⇒ lần sau mở "Tạo chiến dịch mới" là form trống.
 * Đang điền dở mà rời trang thì vẫn giữ bản nháp.
 */
export function CreateWizard() {
  const [round, setRound] = useState(0);
  const created = useRef(false);
  useEffect(
    () => () => {
      if (!created.current) return;
      created.current = false;
      setRound((r) => r + 1);
    },
    [],
  );
  return <WizardForm key={round} onCreated={() => { created.current = true; }} />;
}

function WizardForm({ onCreated }: { onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(INITIAL);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const fx = useFx();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const rate = fx.data?.rate ?? 0;
  const prompts = useMemo(() => checkPrompts(f.prompts), [f.prompts]);
  const num = parseViNumber;

  /** Nhập bộ câu mẫu từ file .txt (UTF-8, mỗi dòng một câu) — đọc ngay trên trình duyệt, không tải file lên máy chủ. */
  const importPrompts = async (file: File) => {
    if (file.size > PROMPT_FILE_MAX_BYTES) {
      toast.error("File quá lớn", "Tối đa 500 KB, mỗi dòng một câu.");
      return;
    }
    const text = (await file.text()).replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
    const n = text.split("\n").filter((l) => l.trim()).length;
    if (n === 0) {
      toast.error("File không có câu nào", "Mỗi dòng trong file là một câu mẫu.");
      return;
    }
    setF((x) => ({ ...x, prompts: text }));
    toast.success("Đã nhập câu mẫu từ file", `${n} câu từ ${file.name}. Kiểm tra lỗi (nếu có) ngay dưới ô câu mẫu.`);
  };
  const contributor = num(f.contributorPct);
  const creator = num(f.creatorPct);
  const platform = 100 - contributor - creator;

  const stepErrors: (string | null)[] = [
    f.name.trim().length < 3 ? "Tên cần ít nhất 3 ký tự" : f.description.trim().length < 10 ? "Mô tả cần ít nhất 10 ký tự" : f.purpose.trim().length < 3 ? "Hãy nêu mục đích sử dụng" : null,
    prompts.lines.length === 0 ? "Cần ít nhất một câu mẫu" : prompts.errors[0] ?? null,
    f.terms.trim().length < 50 ? "Điều khoản cần ít nhất 50 ký tự" : null,
    !(num(f.targetHours) > 0) ? "Mục tiêu phải lớn hơn 0" : !(num(f.priceVnd) >= 100_000) ? "Giá tối thiểu 100.000 ₫" : platform < 0 || contributor < 0 || creator < 0 ? "Tổng tỷ lệ chia vượt 100%" : !(num(f.days) >= 1 && num(f.days) <= 365) ? "Hạn thu thập 1–365 ngày" : num(f.seedVnd) < 0 ? "Quỹ mồi không hợp lệ" : null,
    null,
  ];
  const canNext = !stepErrors[step];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Stepper steps={STEPS} current={step} />
      <Card padding="lg">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.24 }} className="flex flex-col gap-5">
            {step === 0 && (
              <>
                <h2 className="text-h3">Thông tin chiến dịch</h2>
                <Field label="Tên chiến dịch" hint="Ví dụ: Giọng miền Trung – hội thoại ngân hàng"><Input value={f.name} onChange={set("name")} maxLength={200} /></Field>
                <Field label="Mô tả cho người đóng góp và người mua"><Textarea value={f.description} onChange={set("description")} maxLength={5000} /></Field>
                <Field label="Mục đích sử dụng dữ liệu"><Input value={f.purpose} onChange={set("purpose")} maxLength={2000} /></Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Vùng giọng"><Select value={f.accent} onChange={set("accent")}>{ACCENT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                  <Field label="Loại license"><Select value={f.license} onChange={set("license")}><option value="research-and-commercial">Nghiên cứu & thương mại</option><option value="research-only">Chỉ nghiên cứu</option></Select></Field>
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-h3">Bộ câu mẫu</h2>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Nhập từ file .txt
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    name="prompts-file"
                    accept=".txt,text/plain"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importPrompts(file);
                      e.target.value = "";
                    }}
                  />
                </div>
                <p className="text-sm text-ink-muted">
                  Mỗi dòng một câu, 6–20 từ, viết số bằng chữ (“hai mươi lăm” thay vì “25”), tránh tên riêng hiếm. Câu chỉ hiện cho người đóng góp lúc họ bấm ghi âm.
                  Có thể nhập từ file .txt (UTF-8, mỗi dòng một câu) rồi sửa tiếp trong ô bên dưới.
                </p>
                <Field label={`Câu mẫu (${prompts.lines.length} câu)`} error={prompts.errors.length ? prompts.errors.slice(0, 3).join(" · ") : null}>
                  <Textarea value={f.prompts} onChange={set("prompts")} className="min-h-64 font-mono text-sm" placeholder={"tôi muốn mở một tài khoản tiết kiệm có kỳ hạn sáu tháng\ncho tôi hỏi lãi suất gửi tiết kiệm hiện nay là bao nhiêu"} />
                </Field>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="text-h3">Điều khoản đồng thuận</h2>
                <p className="text-sm text-ink-muted">Mã băm của đúng văn bản này được ghi lên hợp đồng; người đóng góp ký gắn với mã băm đó, nên không thể sửa lén sau khi tạo.</p>
                <Field label="Văn bản điều khoản"><Textarea value={f.terms} onChange={set("terms")} className="min-h-80 text-sm" /></Field>
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="text-h3">Mục tiêu, giá và chia doanh thu</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Mục tiêu (giờ giọng nói)" hint={`= ${formatNumber(Math.round(num(f.targetHours) * 3600) || 0)} giây`}><Input inputMode="decimal" value={f.targetHours} onChange={set("targetHours")} /></Field>
                  <Field label="Giá đầy đủ (VNĐ)" hint={rate ? `≈ ${formatNumber(Math.round(num(f.priceVnd) / rate))} USDC lưu trên chain` : undefined}><Input inputMode="numeric" value={f.priceVnd} onChange={set("priceVnd")} /></Field>
                  <Field label="Người đóng góp nhận (%)"><Input inputMode="numeric" value={f.contributorPct} onChange={set("contributorPct")} /></Field>
                  <Field label="Người tạo nhận (%)" hint={`Nền tảng nhận phần còn lại: ${platform}%`} error={platform < 0 ? "Tổng vượt 100%" : null}><Input inputMode="numeric" value={f.creatorPct} onChange={set("creatorPct")} /></Field>
                  <Field label="Hạn thu thập (ngày)"><Input inputMode="numeric" value={f.days} onChange={set("days")} /></Field>
                  <div />
                  <Field label="Quỹ mồi (VNĐ, tùy chọn)" hint="Trả ngay cho người đóng góp đầu tiên, trước khi có người mua"><Input inputMode="numeric" value={f.seedVnd} onChange={set("seedVnd")} /></Field>
                  <Field label="Tiền mồi mỗi phút hợp lệ (VNĐ)"><Input inputMode="numeric" value={f.seedPerMinVnd} onChange={set("seedPerMinVnd")} disabled={!(num(f.seedVnd) > 0)} /></Field>
                </div>
              </>
            )}
            {step === 4 && <Review f={f} prompts={prompts.lines} num={num} onCreated={onCreated} />}
          </motion.div>
        </AnimatePresence>
        {step < 4 && (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>← Quay lại</Button>
            <div className="flex items-center gap-3">
              {stepErrors[step] && <span className="hidden text-sm text-danger-ink sm:inline">{stepErrors[step]}</span>}
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Tiếp tục →</Button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="mt-6 border-t border-line pt-5">
            <Button variant="ghost" onClick={() => setStep(3)}>← Sửa cấu hình</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Review({ f, prompts, num, onCreated }: { f: Form; prompts: string[]; num: (s: string) => number; onCreated: () => void }) {
  const w = useWalletSession();
  const fees = useFees();
  const fx = useFx();
  const balance = useTokenBalance(w.address as Address | undefined);
  const flow = useSponsoredFlow();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [fauceting, setFauceting] = useState(false);

  const price = num(f.priceVnd);
  const rows = [0, 25, 50, 75, 100].map((p) => ({ p, v: price * (0.3 + 0.7 * (p / 100)) }));
  const seedVnd = num(f.seedVnd) > 0 ? num(f.seedVnd) : 0;
  const feeVnd = fees.data?.create.vnd;
  const totalVnd = feeVnd !== undefined ? seedVnd + feeVnd : undefined;
  const wallet = balance.data !== undefined && fx.data ? moneyFromUnits(balance.data as bigint, fx.data.rate, "mUSDC") : undefined;
  // So sánh gần đúng bằng VNĐ (máy chủ báo giá chính xác bằng USDC ở bước 1 của danh sách ký)
  const short = totalVnd !== undefined && wallet !== undefined && wallet.vnd + 1 < totalVnd;

  const submit = async () => {
    const api = w.api;
    if (!api || !w.address) return;
    const req: CampaignDraftRequest = {
      name: f.name.trim(), description: f.description.trim(), purpose: f.purpose.trim(), accent: f.accent, license: f.license,
      prompts, terms_text: f.terms, target_sec: Math.round(num(f.targetHours) * 3600), full_price_vnd: Math.round(price),
      contributor_bps: Math.round(num(f.contributorPct) * 100), creator_bps: Math.round(num(f.creatorPct) * 100),
      duration_days: Math.round(num(f.days)), seed_vnd: Math.round(num(f.seedVnd)), seed_vnd_per_minute: num(f.seedVnd) > 0 ? Math.round(num(f.seedPerMinVnd)) : 0,
    };
    let draftId = "";
    try {
      const res = await flow.run(
        async () => {
          try {
            draftId = (await api.createDraft(req)).draft_id;
          } catch (e) {
            const details = (e as { details?: { errors?: string[] } }).details?.errors;
            throw new Error(details?.length ? `${(e as Error).message}: ${details.slice(0, 2).join("; ")}` : (e as Error).message);
          }
          return api.createQuote(draftId);
        },
        (signed) => api.createCampaign(draftId, signed),
      );
      setDone(true);
      onCreated();
      await Promise.all([qc.invalidateQueries({ queryKey: qk.campaigns }), balance.refetch()]);
      toast.success("Đã tạo chiến dịch", `Chiến dịch #${res.campaign_id} đã sẵn sàng nhận bản ghi.`);
      if (res.campaign_id !== null) {
        await whenVisible(); // vừa ký trong cửa sổ ví: chuyển trang khi tab hiện lại
        router.push(`/datasets/${res.campaign_id}`);
      }
    } catch (e) {
      toast.error("Chưa tạo được chiến dịch", (e as Error).message);
    }
  };

  const faucet = async () => {
    if (!w.address) return;
    setFauceting(true);
    try {
      const r = await publicApi.faucet(w.address);
      await balance.refetch();
      toast.success("Đã nhận mUSDC thử nghiệm", r.minted.display);
    } catch (e) {
      toast.error("Không nhận được mUSDC", describeChainError(e));
    } finally {
      setFauceting(false);
    }
  };

  const steps = flow.steps({
    quote: "Máy chủ soạn nháp và báo giá (băm câu mẫu & điều khoản, quy đổi VNĐ → USDC)",
    permit: "Ký cho phép trừ quỹ mồi + phí xử lý (miễn phí)",
    sign: "Ký tạo chiến dịch (miễn phí)",
  });

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-h3">Xem trước trước khi ký</h2>
      <dl className="grid gap-4 rounded-2xl bg-canvas p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-caption">Tên</dt><dd className="font-semibold">{f.name}</dd></div>
        <div><dt className="text-caption">Số câu mẫu</dt><dd className="font-semibold">{prompts.length} câu</dd></div>
        <div><dt className="text-caption">Mục tiêu</dt><dd className="font-semibold">{formatDuration(Math.round(num(f.targetHours) * 3600))}</dd></div>
        <div><dt className="text-caption">Hạn thu thập</dt><dd className="font-semibold">{num(f.days)} ngày</dd></div>
        <div><dt className="text-caption">Chia mỗi lần bán</dt><dd className="font-semibold">{num(f.contributorPct)}% người đóng góp · {num(f.creatorPct)}% bạn · {100 - num(f.contributorPct) - num(f.creatorPct)}% nền tảng</dd></div>
        <div><dt className="text-caption">Quỹ mồi</dt><dd className="font-semibold">{num(f.seedVnd) > 0 ? `≈ ${formatVnd(num(f.seedVnd))} · ${formatVnd(num(f.seedPerMinVnd))}/phút` : "Không có"}</dd></div>
      </dl>
      <div>
        <p className="text-label">Giá bán theo tiến độ</p>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center">
          {rows.map((r) => (
            <div key={r.p} className="rounded-xl border border-line p-2">
              <p className="text-xs text-ink-muted">{r.p}%</p>
              <p className="text-sm font-semibold tabular">{(r.v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tr</p>
            </div>
          ))}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-4 text-sm" aria-label="Hóa đơn tạo chiến dịch">
        {seedVnd > 0 && (
          <>
            <dt className="text-ink-muted">Quỹ mồi chuyển vào hợp đồng</dt>
            <dd className="text-right font-semibold tabular">≈ {formatVnd(seedVnd)}</dd>
          </>
        )}
        <dt className="text-ink-muted">
          Phí xử lý
        </dt>
        <dd className="text-right font-semibold tabular">{fees.data?.create.display ?? "…"}</dd>
        <dt className="border-t border-line pt-3 font-semibold text-ink">Tổng trừ từ ví</dt>
        <dd className="border-t border-line pt-3 text-right font-bold tabular">{totalVnd !== undefined ? `≈ ${formatVnd(totalVnd)}` : "…"}</dd>
        <dt className="text-ink-muted">Số dư ví hiện có</dt>
        <dd className="text-right tabular">{wallet?.display ?? "…"}</dd>
      </dl>
      {short && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink sm:flex-row sm:items-center sm:justify-between">
          <span>Ví chưa đủ tiền cho quỹ mồi + phí xử lý.</span>
          {network.allowFaucet && (
            <Button size="sm" variant="secondary" loading={fauceting} onClick={faucet}>Nhận 2.000 mUSDC thử nghiệm</Button>
          )}
        </div>
      )}
      <TxSteps steps={steps} />
      <Button size="lg" onClick={submit} loading={flow.running} disabled={flow.running || done || short}>Ký & tạo chiến dịch</Button>
    </div>
  );
}
