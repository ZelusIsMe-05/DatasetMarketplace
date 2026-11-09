// Client gọi backend FastAPI (Swagger: {API_URL}/docs). Mỗi phiên đăng nhập gắn với một ví nên token được
// truyền tường minh: createApi(token). Không có dữ liệu giả — mọi hàm gọi endpoint thật.
import { API_URL } from "@/lib/config";
import { SESSION_EXPIRED_EVENT } from "@/lib/session";
import type {
  AvatarKey, ApiErrorBody, CampaignDetail, CampaignDraftRequest, CampaignDraftResponse, CampaignSummary, Challenge, ClaimQuote,
  ClaimResponse, ConsentResponse, ConsentStatus, ContributionResult, DownloadMessage, DownloadResponse, FaucetResult,
  Fx, Health, LicenseInfo, Me, MyContributions, PriceQuote, PromptResponse, Revenue, ReviewItem,
  RevokeResponse, Session, SnapshotQuote, SnapshotResult, Terms, TypedDataResponse, FeeSchedule, SponsoredQuote, SponsoredResult,
  SponsoredBuyRequest, SponsoredCreateRequest, SponsoredSeedWithdrawRequest, SponsoredWithdrawRequest,
} from "@/types/api";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = RequestInit & { token?: string | null };

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (rest.body && !(rest.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...rest, headers });
  } catch {
    throw new ApiError(0, "network", "Không kết nối được máy chủ. Hãy kiểm tra backend đang chạy.");
  }
  if (!res.ok) {
    // Phiên không còn hợp lệ (vd. database đã reset): báo AuthProvider xóa phiên để giao diện hiện lại bước đăng nhập.
    if (res.status === 401 && token && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: token }));
    }
    const body = (await res.json().catch(() => null)) as (ApiErrorBody & { detail?: unknown }) | null;
    const message = body?.error?.message ?? (typeof body?.detail === "string" ? body.detail : res.statusText);
    throw new ApiError(res.status, body?.error?.code ?? "error", message, body?.error?.details);
  }
  const ctype = res.headers.get("content-type") ?? "";
  return (ctype.includes("application/json") ? await res.json() : await res.blob()) as T;
}

const json = (body: unknown) => (body === undefined ? undefined : JSON.stringify(body));

/** Chứng minh sở hữu ví (ký challenge EIP-191) — chỉ cần khi gắn ví với email ở lần đầu. */
export interface WalletProof {
  address: string;
  nonce: string;
  signature: string;
}

/** Endpoint công khai (không cần đăng nhập). */
export const publicApi = {
  health: () => request<Health>("/health"),
  fx: () => request<Fx>("/fx"),
  campaigns: () => request<CampaignSummary[]>("/campaigns"),
  campaign: (id: number) => request<CampaignDetail>(`/campaigns/${id}`),
  terms: (id: number) => request<Terms>(`/campaigns/${id}/terms`),
  price: (id: number) => request<PriceQuote>(`/campaigns/${id}/price`),
  revenue: (id: number) => request<Revenue>(`/campaigns/${id}/revenue`),
  license: (id: number, address: string) => request<LicenseInfo>(`/campaigns/${id}/licenses/${address}`),
  sync: () => request<{ processed_events: number; campaigns: number[] }>("/campaigns/sync", { method: "POST" }),
  challenge: (address: string) => request<Challenge>(`/auth/challenge?address=${address}`),
  /** Đăng nhập Google. `wallet` chỉ cần ở LẦN ĐẦU (gắn ví); email chưa gắn ví mà thiếu `wallet` ⇒ 409 wallet_required. */
  loginGoogle: (idToken: string, wallet?: WalletProof) =>
    request<Session>("/auth/google", { method: "POST", body: json({ id_token: idToken, ...wallet }) }),
  /** CHỈ có khi backend chạy NETWORK=local + DEV_AUTH_ENABLED (môi trường khác trả 404). Quy tắc ví giống loginGoogle. */
  loginDev: (email: string, wallet?: WalletProof) =>
    request<Session>("/auth/dev-login", { method: "POST", body: json({ email, ...wallet }) }),
  downloadMessage: (id: number, buyer: string) =>
    request<DownloadMessage>(`/datasets/${id}/download-message?buyer=${buyer}`),
  requestDownload: (id: number, buyer: string, issuedAt: number, nonce: string, signature: string) =>
    request<DownloadResponse>(`/datasets/${id}/download`, {
      method: "POST",
      body: json({ buyer, issued_at: issuedAt, nonce, signature }),
    }),
  /** CHỈ local/Fuji (mainnet: 404). */
  faucet: (address: string, amountUsdc = 2000) =>
    request<FaucetResult>("/demo/faucet", { method: "POST", body: json({ address, amount_usdc: amountUsdc }) }),
  // Nền tảng trả phí mạng hộ: báo giá (hóa đơn VNĐ + dữ liệu cần ký) → ký → gửi chữ ký cho relayer.
  fees: () => request<FeeSchedule>("/fees"),
  buyQuote: (id: number, buyer: string) => request<SponsoredQuote>(`/campaigns/${id}/buy-quote?buyer=${buyer}`),
  buy: (id: number, body: SponsoredBuyRequest) =>
    request<SponsoredResult>(`/campaigns/${id}/buy`, { method: "POST", body: json(body) }),
  withdrawQuote: (address: string) => request<SponsoredQuote>(`/creator/withdraw-quote?address=${address}`),
  withdraw: (body: SponsoredWithdrawRequest) =>
    request<SponsoredResult>("/creator/withdraw", { method: "POST", body: json(body) }),
  seedQuote: (id: number) => request<SponsoredQuote>(`/campaigns/${id}/seed-withdraw-quote`),
  withdrawSeed: (id: number, body: SponsoredSeedWithdrawRequest) =>
    request<SponsoredResult>(`/campaigns/${id}/withdraw-seed`, { method: "POST", body: json(body) }),
};

/** Endpoint cần phiên đăng nhập (JWT của đúng ví đang thao tác). */
export function createApi(token: string) {
  const r = <T,>(path: string, init: RequestInit = {}) => request<T>(path, { ...init, token });
  return {
    me: () => r<Me>("/auth/me"),
    updateMe: (body: { display_name?: string; avatar?: AvatarKey }) => r<Me>("/auth/me", { method: "PATCH", body: json(body) }),
    createDraft: (req: CampaignDraftRequest) =>
      r<CampaignDraftResponse>("/campaigns/drafts", { method: "POST", body: json(req) }),
    createQuote: (draftId: string) => r<SponsoredQuote>(`/campaigns/drafts/${draftId}/create-quote`),
    createCampaign: (draftId: string, body: SponsoredCreateRequest) =>
      r<SponsoredResult>(`/campaigns/drafts/${draftId}/create`, { method: "POST", body: json(body) }),
    consentStatus: (id: number) => r<ConsentStatus>(`/consent/status?campaign_id=${id}`),
    consentTypedData: (id: number) => r<TypedDataResponse>(`/consent/typed-data?campaign_id=${id}`),
    consent: (id: number, deadline: number, signature: string) =>
      r<ConsentResponse>("/consent", { method: "POST", body: json({ campaign_id: id, deadline, signature }) }),
    prompt: (id: number) => r<PromptResponse>(`/campaigns/${id}/prompt`, { method: "POST" }),
    submitRecording: (promptToken: string, wav: Blob) => {
      const form = new FormData();
      form.set("token", promptToken);
      form.set("capture", "live");
      form.set("audio", wav, "recording.wav");
      return r<ContributionResult>("/contributions", { method: "POST", body: form });
    },
    myContributions: () => r<MyContributions>("/me/contributions"),
    claimQuote: (id: number) => r<ClaimQuote>(`/me/claim-quote?campaign_id=${id}`),
    claim: (id: number, maxFee: number, deadline: number, signature: string) =>
      r<ClaimResponse>("/claim", {
        method: "POST",
        body: json({ campaign_id: id, max_fee: maxFee, deadline, signature }),
      }),
    revokeTypedData: (contributionId: number) =>
      r<TypedDataResponse>(`/revoke/typed-data?contribution_id=${contributionId}`),
    revoke: (contributionId: number, deadline: number, signature: string) =>
      r<RevokeResponse>("/revoke", {
        method: "POST",
        body: json({ contribution_id: contributionId, deadline, signature }),
      }),
    // Chủ chiến dịch sở hữu dữ liệu (implementation-plan §3 #28): duyệt vùng xám + ký công bố phiên bản.
    reviewQueue: (campaignId?: number) =>
      r<ReviewItem[]>(campaignId === undefined ? "/creator/review" : `/creator/review?campaign_id=${campaignId}`),
    reviewAudio: (id: number) => r<Blob>(`/creator/review/${id}/audio`),
    decideReview: (id: number, decision: "approve" | "reject", note?: string) =>
      r<ContributionResult>(`/creator/review/${id}`, { method: "POST", body: json({ decision, note }) }),
    snapshotQuote: (campaignId: number) => r<SnapshotQuote>(`/campaigns/${campaignId}/snapshot-quote`),
    publishSnapshot: (campaignId: number, merkleRoot: string, deadline: number, signature: string) =>
      r<SnapshotResult>(`/campaigns/${campaignId}/snapshots`, {
        method: "POST",
        body: json({ merkle_root: merkleRoot, deadline, signature }),
      }),
  };
}
export type UserApi = ReturnType<typeof createApi>;
