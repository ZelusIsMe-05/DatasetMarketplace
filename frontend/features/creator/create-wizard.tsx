"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { decodeEventLog, type Address } from "viem";
import type { CampaignDraftRequest } from "@/types/api";
import { TOKEN_ABI, VOICE_CAMPAIGNS_ABI } from "@/lib/contracts";
import { formatDuration, formatNumber } from "@/lib/format";
import { formatVnd } from "@/lib/money";
import { qk, useFx } from "@/hooks/queries";
import { useAddresses } from "@/hooks/useChain";
import { useContractTx } from "@/hooks/useContractTx";
import { useWalletSession } from "@/hooks/useSessions";
import { publicApi } from "@/services/api";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Stepper } from "@/components/ui/misc";
import { TxSteps, type TxStepView } from "@/components/tx/tx-steps";
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

export function CreateWizard() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(INITIAL);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const fx = useFx();
  const rate = fx.data?.rate ?? 0;
  const prompts = useMemo(() => checkPrompts(f.prompts), [f.prompts]);
  const num = (s: string) => Number(s.replace(/[.\s]/g, "").replace(",", "."));
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
                <h2 className="text-h3">Bộ câu mẫu</h2>
                <p className="text-sm text-ink-muted">Mỗi dòng một câu, 6–20 từ, viết số bằng chữ (“hai mươi lăm” thay vì “25”), tránh tên riêng hiếm. Câu chỉ hiện cho người đóng góp lúc họ bấm ghi âm.</p>
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
            {step === 4 && <Review f={f} prompts={prompts.lines} num={num} />}
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

function Review({ f, prompts, num }: { f: Form; prompts: string[]; num: (s: string) => number }) {
  const w = useWalletSession();
  const { vc, token } = useAddresses();
  const approveTx = useContractTx();
  const createTx = useContractTx();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [draftPhase, setDraftPhase] = useState<TxStepView["phase"]>("idle");
  const [draftError, setDraftError] = useState<string>();
  const [syncPhase, setSyncPhase] = useState<TxStepView["phase"]>("idle");
  const [hasSeed, setHasSeed] = useState(num(f.seedVnd) > 0);
  const [running, setRunning] = useState(false);

  const price = num(f.priceVnd);
  const rows = [0, 25, 50, 75, 100].map((p) => ({ p, v: price * (0.3 + 0.7 * (p / 100)) }));

  const submit = async () => {
    if (!w.api || !w.address || !vc || !token) return;
    setRunning(true);
    setDraftError(undefined);
    approveTx.reset();
    createTx.reset();
    try {
      setDraftPhase("pending");
      const req: CampaignDraftRequest = {
        name: f.name.trim(), description: f.description.trim(), purpose: f.purpose.trim(), accent: f.accent, license: f.license,
        prompts, terms_text: f.terms, target_sec: Math.round(num(f.targetHours) * 3600), full_price_vnd: Math.round(price),
        contributor_bps: Math.round(num(f.contributorPct) * 100), creator_bps: Math.round(num(f.creatorPct) * 100),
        duration_days: Math.round(num(f.days)), seed_vnd: Math.round(num(f.seedVnd)), seed_vnd_per_minute: num(f.seedVnd) > 0 ? Math.round(num(f.seedPerMinVnd)) : 0,
      };
      let draft;
      try {
        draft = await w.api.createDraft(req);
      } catch (e) {
        const details = (e as { details?: { errors?: string[] } }).details?.errors;
        throw new Error(details?.length ? `${(e as Error).message}: ${details.slice(0, 2).join("; ")}` : (e as Error).message);
      }
      setDraftPhase("success");
      const a = draft.create_campaign_args;
      setHasSeed(a.seedAmount > 0);
      if (a.seedAmount > 0) {
        await approveTx.run({ address: token, abi: TOKEN_ABI, functionName: "approve", args: [vc, BigInt(a.seedAmount)], account: w.address as Address });
      }
      const receipt = await createTx.run({
        address: vc,
        abi: VOICE_CAMPAIGNS_ABI,
        functionName: "createCampaign",
        args: [BigInt(a.targetSec), BigInt(a.fullPrice), a.contributorBps, a.creatorBps, BigInt(a.deadline), a.promptSetHash, a.termsHash, a.metadataURI, BigInt(a.seedRatePerSec), BigInt(a.seedAmount)],
        account: w.address as Address,
      });
      let id: number | null = null;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: VOICE_CAMPAIGNS_ABI, data: log.data, topics: log.topics });
          if (ev.eventName === "CampaignCreated") id = Number((ev.args as unknown as { campaignId: bigint }).campaignId);
        } catch {
          /* log của token */
        }
      }
      setSyncPhase("pending");
      await publicApi.sync();
      setSyncPhase("success");
      await qc.invalidateQueries({ queryKey: qk.campaigns });
      toast.success("Đã tạo chiến dịch", id !== null ? `Chiến dịch #${id} đã sẵn sàng nhận bản ghi.` : undefined);
      if (id !== null) router.push(`/datasets/${id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi";
      if (draftPhase !== "success") {
        setDraftPhase((p) => (p === "pending" ? "error" : p));
        setDraftError(msg);
      }
      toast.error("Chưa tạo được chiến dịch", msg);
    } finally {
      setRunning(false);
    }
  };

  const steps: TxStepView[] = [
    { label: "Máy chủ soạn nháp (băm câu mẫu & điều khoản, quy đổi VNĐ → USDC)", phase: draftPhase, error: draftError },
    ...(hasSeed ? [{ label: "Cho phép hợp đồng nhận quỹ mồi", phase: approveTx.state.phase, hash: approveTx.state.hash, error: approveTx.state.error }] : []),
    { label: "Ký giao dịch tạo chiến dịch", phase: createTx.state.phase, hash: createTx.state.hash, error: createTx.state.error },
    { label: "Đồng bộ metadata với chiến dịch on-chain", phase: syncPhase },
  ];

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
      <TxSteps steps={steps} />
      <Button size="lg" onClick={submit} loading={running} disabled={running || syncPhase === "success"}>Ký & tạo chiến dịch</Button>
      <p className="text-caption">Bạn tự trả phí mạng (AVAX) cho giao dịch tạo chiến dịch. Giá được lưu bằng USDC theo tỷ giá lúc tạo.</p>
    </div>
  );
}
