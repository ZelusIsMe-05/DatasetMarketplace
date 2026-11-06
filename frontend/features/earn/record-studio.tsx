"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import type { ContributionResult, PromptResponse } from "@/types/api";
import { cn } from "@/lib/cn";
import { MicrophoneError, startLiveCapture, type LiveSession } from "@/lib/recorder";
import { qk, useCampaign } from "@/hooks/queries";
import { useContributor } from "@/hooks/useSessions";
import { ApiError } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { TxHash } from "@/components/tx/tx-steps";
import { LiveWaveform } from "@/components/audio/live-waveform";
import { campaignName } from "@/features/marketplace/labels";
import { friendlyQcReason } from "@/features/earn/use-earn";

const MAX_SEC = 15;
const MIN_SEC = 1.5;

type Phase =
  | { k: "ready" }
  | { k: "preparing" }
  | { k: "countdown"; prompt: PromptResponse; n: number }
  | { k: "recording"; prompt: PromptResponse; startedAt: number }
  | { k: "checking"; prompt: PromptResponse }
  | { k: "result"; prompt: PromptResponse; result: ContributionResult }
  | { k: "error"; title: string; message: string; retry: boolean };

type MicState = "unknown" | "prompt" | "granted" | "denied";

export function RecordStudio({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const c = useContributor();
  const campaign = useCampaign(id);
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>({ k: "ready" });
  const [mic, setMic] = useState<MicState>("unknown");
  const [now, setNow] = useState(() => Date.now());
  const session = useRef<LiveSession | null>(null);
  const studio = useRef<HTMLElement>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Trạng thái quyền micro (nếu trình duyệt hỗ trợ Permissions API)
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setMic(status.state as MicState);
    navigator.permissions?.query({ name: "microphone" as PermissionName }).then((s) => {
      status = s;
      update();
      s.addEventListener("change", update);
    }).catch(() => undefined);
    return () => status?.removeEventListener("change", update);
  }, []);

  // Luôn tắt micro khi rời trang
  useEffect(() => () => session.current?.abort(), []);

  // Đồng hồ cho timer + hạn prompt token; tự dừng ở 15 giây hoặc khi câu mẫu sắp hết hạn
  const autoStop = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (phase.k !== "recording" && phase.k !== "countdown") return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (phase.k === "recording" && ((n - phase.startedAt) / 1000 >= MAX_SEC || phase.prompt.expires_at - n / 1000 < 3)) autoStop.current();
    }, 100);
    return () => window.clearInterval(t);
  }, [phase]);

  const fail = useCallback((e: unknown) => {
    session.current?.abort();
    session.current = null;
    setAnalyser(null);
    if (e instanceof MicrophoneError) {
      setMic(e.kind === "denied" ? "denied" : mic);
      setPhase({ k: "error", title: e.kind === "denied" ? "Chưa có quyền dùng micro" : "Không dùng được micro", message: e.kind === "denied" ? "Hãy cho phép trình duyệt dùng micro (biểu tượng ổ khóa trên thanh địa chỉ) rồi thử lại." : e.message, retry: true });
      return;
    }
    if (e instanceof ApiError) {
      const map: Record<string, [string, string, boolean]> = {
        no_consent: ["Bạn chưa ký đồng thuận", "Hãy ký đồng thuận cho chiến dịch trước khi ghi âm.", false],
        not_collecting: ["Chiến dịch đã ngừng nhận bản ghi", "Chiến dịch đã đủ mục tiêu hoặc hết hạn thu thập.", false],
        no_prompts_left: ["Bạn đã đọc hết câu mẫu", "Cảm ơn bạn! Bạn đã đóng góp toàn bộ câu của chiến dịch này.", false],
        bad_prompt_token: ["Câu mẫu đã hết hạn", "Mỗi câu chỉ có hiệu lực khoảng 60 giây. Hãy nhận câu mới và đọc lại.", true],
        not_live: ["Chỉ nhận ghi âm trực tiếp", e.message, true],
        duplicate_audio: ["Bản ghi bị trùng", "Bản ghi này giống một bản đã nộp trước đó.", true],
      };
      const [title, message, retry] = map[e.code] ?? ["Chưa gửi được bản ghi", e.message, true];
      setPhase({ k: "error", title, message, retry });
      return;
    }
    setPhase({ k: "error", title: "Đã có lỗi", message: e instanceof Error ? e.message : "Lỗi không xác định", retry: true });
  }, [mic]);

  const start = useCallback(async () => {
    if (!c.api) return;
    setPhase({ k: "preparing" });
    studio.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    try {
      const [s, prompt] = await Promise.all([startLiveCapture(), c.api.prompt(id)]);
      session.current = s;
      setAnalyser(s.analyser);
      setMic("granted");
      const step = reduce ? 450 : 650;
      for (const n of [3, 2, 1]) {
        setPhase({ k: "countdown", prompt, n });
        await new Promise((r) => setTimeout(r, step));
      }
      s.reset(); // bản ghi bắt đầu đúng lúc này
      setPhase({ k: "recording", prompt, startedAt: Date.now() });
    } catch (e) {
      fail(e);
    }
  }, [c.api, id, reduce, fail]);

  const stop = useCallback(async () => {
    if (phase.k !== "recording" || !session.current || !c.api) return;
    const prompt = phase.prompt;
    const s = session.current;
    session.current = null;
    setPhase({ k: "checking", prompt });
    try {
      const { wav } = await s.stop();
      setAnalyser(null);
      const result = await c.api.submitRecording(prompt.token, wav);
      setPhase({ k: "result", prompt, result });
      void qc.invalidateQueries({ queryKey: qk.mine(c.address ?? undefined) });
      void qc.invalidateQueries({ queryKey: qk.campaign(id) });
    } catch (e) {
      fail(e);
    }
  }, [phase, c.api, c.address, qc, id, fail]);

  useEffect(() => {
    autoStop.current = () => void stop();
  }, [stop]);
  const elapsed = phase.k === "recording" ? (now - phase.startedAt) / 1000 : 0;
  const tokenLeft = phase.k === "recording" || phase.k === "countdown" ? phase.prompt.expires_at - now / 1000 : 60;

  const name = campaign.data ? campaignName(campaign.data) : "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/earn/campaigns/${id}`} className="text-sm font-semibold text-ink-muted hover:text-primary">← {name || "Chiến dịch"}</Link>
          <h1 className="mt-1 text-h2">Phòng ghi âm</h1>
        </div>
        <MicChip state={phase.k === "recording" ? "granted" : mic} live={phase.k === "recording"} />
      </div>

      <section ref={studio} aria-live="polite" className="relative scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={phase.k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.24 }} className="flex min-h-[22rem] flex-col items-center justify-center gap-6 text-center">
            {phase.k === "ready" && (
              <>
                <p className="max-w-md text-lead">Bấm nút micro để nhận câu mẫu. Câu chỉ hiện khi bạn bắt đầu và có hiệu lực khoảng 60 giây.</p>
                <MicButton onClick={start} label="Nhận câu và bắt đầu ghi âm" />
                <ul className="grid gap-2 text-left text-sm text-ink-muted sm:grid-cols-3 sm:gap-4">
                  <li>🔇 Ngồi nơi yên tĩnh</li>
                  <li>🗣️ Đọc tự nhiên, rõ ràng</li>
                  <li>⏱️ 2–15 giây mỗi câu</li>
                </ul>
              </>
            )}
            {phase.k === "preparing" && (
              <>
                <MicButton busy label="Đang chuẩn bị micro và câu mẫu" />
                <p className="text-ink-muted">Đang chuẩn bị micro và câu mẫu…</p>
              </>
            )}
            {phase.k === "countdown" && (
              <>
                <PromptText text={phase.prompt.text} />
                <motion.span key={phase.n} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-6xl font-bold text-primary tabular" aria-label={`Bắt đầu sau ${phase.n}`}>
                  {phase.n}
                </motion.span>
                <p className="text-ink-muted">Đọc lướt câu trước, ghi âm sẽ tự bắt đầu</p>
              </>
            )}
            {phase.k === "recording" && (
              <>
                <PromptText text={phase.prompt.text} />
                <LiveWaveform analyser={analyser} className="h-24 w-full max-w-xl" />
                <div className="flex items-center gap-6">
                  <Timer elapsed={elapsed} />
                  <TokenRing left={tokenLeft} />
                </div>
                <Button variant="danger" size="lg" onClick={() => void stop()} disabled={elapsed < MIN_SEC} className="min-w-52" icon={<span className="size-3 rounded-sm bg-white" aria-hidden />}>
                  {elapsed < MIN_SEC ? "Đang ghi…" : "Dừng & gửi"}
                </Button>
                <p className="text-sm text-ink-muted">Đọc xong câu thì bấm <b>Dừng</b> ngay — khoảng lặng dài làm bản ghi dễ bị loại.</p>
              </>
            )}
            {phase.k === "checking" && <Checking text={phase.prompt.text} />}
            {phase.k === "result" && <ResultView result={phase.result} prompt={phase.prompt} onNext={start} campaignId={id} />}
            {phase.k === "error" && (
              <>
                <span className="grid size-16 place-items-center rounded-full bg-warning-soft text-3xl" aria-hidden>!</span>
                <h2 className="text-h3">{phase.title}</h2>
                <p className="max-w-md text-ink-muted">{phase.message}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {phase.retry && <Button onClick={start}>Thử lại với câu mới</Button>}
                  <ButtonLink href={`/earn/campaigns/${id}`} variant="outline">Về trang chiến dịch</ButtonLink>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
      <p className="text-center text-caption">Bản ghi chỉ được gửi lên máy chủ riêng tư của nền tảng để kiểm tra; audio không bao giờ đưa lên blockchain.</p>
    </div>
  );
}

function PromptText({ text }: { text: string }) {
  return (
    <blockquote className="max-w-2xl text-balance text-2xl font-semibold leading-snug text-ink sm:text-3xl">
      “{text}”
    </blockquote>
  );
}

function MicButton({ onClick, busy, label }: { onClick?: () => void; busy?: boolean; label: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      whileHover={busy ? undefined : { scale: 1.04 }}
      whileTap={busy ? undefined : { scale: 0.96 }}
      className="relative grid size-32 place-items-center rounded-full bg-gradient-to-br from-primary to-cyan text-white shadow-[0_20px_50px_-15px_rgb(37_99_235/0.7)] focus-visible:shadow-[var(--shadow-ring)] sm:size-36"
    >
      <span aria-hidden className={cn("absolute inset-0 rounded-full bg-primary/30", busy ? "motion-safe:animate-ping" : "motion-safe:animate-[ping_2.4s_ease-out_3]")} />
      <svg viewBox="0 0 24 24" className="relative size-12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="currentColor" stroke="none" />
        <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" strokeLinecap="round" />
      </svg>
    </motion.button>
  );
}

function MicChip({ state, live }: { state: MicState; live: boolean }) {
  const map: Record<MicState, [string, "success" | "warning" | "danger" | "neutral"]> = {
    granted: [live ? "Micro đang ghi" : "Micro sẵn sàng", "success"],
    prompt: ["Sẽ hỏi quyền micro", "warning"],
    denied: ["Micro bị chặn", "danger"],
    unknown: ["Micro", "neutral"],
  };
  const [label, tone] = map[state];
  return <Badge tone={tone} dot>{label}</Badge>;
}

function Timer({ elapsed }: { elapsed: number }) {
  const s = Math.min(MAX_SEC, elapsed);
  return (
    <div className="flex items-center gap-2 font-semibold tabular text-ink" aria-label={`Đã ghi ${Math.floor(s)} giây trên tối đa ${MAX_SEC}`}>
      <span className="relative flex size-3"><span className="absolute inline-flex size-full rounded-full bg-danger opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex size-3 rounded-full bg-danger" /></span>
      0:{String(Math.floor(s)).padStart(2, "0")}<span className="text-ink-muted">/ 0:{MAX_SEC}</span>
    </div>
  );
}

function TokenRing({ left }: { left: number }) {
  const v = Math.max(0, Math.min(1, left / 60));
  const r = 14;
  const cc = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2 text-sm text-ink-muted" title="Thời gian hiệu lực còn lại của câu mẫu">
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={left < 15 ? "#d97706" : "#06b6d4"} strokeWidth="4" strokeLinecap="round" strokeDasharray={cc} strokeDashoffset={cc * (1 - v)} />
      </svg>
      <span className="tabular">câu còn {Math.max(0, Math.floor(left))}s</span>
    </div>
  );
}

function Checking({ text }: { text: string }) {
  return (
    <>
      <PromptText text={text} />
      <div className="flex w-full max-w-sm flex-col gap-3" role="status">
        <p className="font-semibold text-ink">Đang kiểm tra bản ghi…</p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
          <motion.div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-cyan" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }} />
        </div>
        <ul className="text-left text-sm text-ink-muted">
          <li>• Độ dài và giọng nói trong bản ghi</li>
          <li>• So khớp từng chữ với câu mẫu</li>
          <li>• Ghi nhận trên Avalanche nếu đạt</li>
        </ul>
      </div>
    </>
  );
}

function ResultView({ result, prompt, onNext, campaignId }: { result: ContributionResult; prompt: PromptResponse; onNext: () => void; campaignId: number }) {
  const ok = result.status === "registered";
  const gray = result.status === "gray" || result.status === "pending_chain";
  const qc = result.qc;
  const match = qc?.align_score != null ? Math.round(qc.align_score * 100) : null;
  const scores = new Map(qc?.word_scores.map((w) => [w.word, w.score]) ?? []);
  return (
    <>
      <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.35, duration: 0.5 }} className={cn("grid size-20 place-items-center rounded-full text-4xl text-white", ok ? "bg-success" : gray ? "bg-warning" : "bg-danger")} aria-hidden>
        {ok ? "✓" : gray ? "…" : "↺"}
      </motion.span>
      <div>
        <h2 className="text-h2">{ok ? "Tuyệt vời! Bản ghi đã được ghi nhận" : gray ? "Bản ghi đang chờ người duyệt" : "Bản ghi chưa đạt"}</h2>
        <p className="mt-2 text-ink-muted">
          {ok ? `+${result.weight_sec} giây hợp lệ của bạn đã lên Avalanche.` : gray ? "Máy chưa chắc chắn — một người duyệt sẽ nghe lại. Bạn không cần làm gì thêm." : friendlyQcReason(qc?.reasons ?? [result.message])}
        </p>
      </div>
      {qc && qc.word_scores.length > 0 && (
        <p className="max-w-2xl text-xl leading-relaxed" aria-label="Mức khớp từng chữ">
          {prompt.text.split(" ").map((w, i) => {
            const s = scores.get(w.toLowerCase());
            return <span key={i} className={cn("mx-0.5 rounded px-0.5", s === undefined ? "" : s >= 0.6 ? "text-success-ink" : s >= 0.3 ? "bg-warning-soft text-warning-ink" : "bg-danger-soft text-danger-ink underline decoration-wavy")}>{w}</span>;
          })}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {match !== null && <Badge tone={ok ? "success" : "neutral"}>Khớp câu mẫu {match}%</Badge>}
        {ok && result.seed_paid && result.seed_paid.units > 0 && <Badge tone="peach">Tiền mồi {result.seed_paid.display}</Badge>}
      </div>
      {result.tx_hash && <TxHash hash={result.tx_hash} />}
      {qc?.hypothesis && (
        <details className="text-sm text-ink-muted">
          <summary className="cursor-pointer font-semibold">Máy nghe được gì?</summary>
          <p className="mt-2 italic">“{qc.hypothesis}”</p>
        </details>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onNext}>{ok || gray ? "Đọc câu tiếp theo" : "Thử lại với câu mới"}</Button>
        <ButtonLink href="/earn/history" variant="outline" size="lg">Bản ghi của tôi</ButtonLink>
      </div>
      <span className="sr-only">Chiến dịch {campaignId}</span>
    </>
  );
}
