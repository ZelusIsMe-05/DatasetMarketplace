// Client gọi backend FastAPI (Swagger: {API_URL}/docs). Mỗi phiên đăng nhập gắn với một ví nên token được
// truyền tường minh: createApi(token). Không có dữ liệu giả — mọi hàm gọi endpoint thật.
import { API_URL } from "@/lib/config";
import type {
  ApiErrorBody, CampaignDetail, CampaignDraftRequest, CampaignDraftResponse, CampaignSummary, Challenge, ClaimQuote,
  ClaimResponse, ConsentResponse, ConsentStatus, ContributionResult, DownloadMessage, DownloadResponse, FaucetResult,
  Fx, Health, LicenseInfo, Me, MyContributions, PriceQuote, PromptResponse, RelayerStatus, Revenue, ReviewItem,
  RevokeResponse, Session, SnapshotResult, Terms, TypedDataResponse,
} from "@/types/api";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = RequestInit & { token?: string | null; adminKey?: string };

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { token, adminKey, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (adminKey) headers.set("X-Admin-Key", adminKey);
  if (rest.body && !(rest.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...rest, headers });
  } catch {
    throw new ApiError(0, "network", "Không kết nối được máy chủ. Hãy kiểm tra backend đang chạy.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as (ApiErrorBody & { detail?: unknown }) | null;
    const message = body?.error?.message ?? (typeof body?.detail === "string" ? body.detail : res.statusText);
    throw new ApiError(res.status, body?.error?.code ?? "error", message, body?.error?.details);
  }
  const ctype = res.headers.get("content-type") ?? "";
  return (ctype.includes("application/json") ? await res.json() : await res.blob()) as T;
}

const json = (body: unknown) => (body === undefined ? undefined : JSON.stringify(body));

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
  loginGoogle: (idToken: string, address: string, nonce: string, signature: string) =>
    request<Session>("/auth/google", { method: "POST", body: json({ id_token: idToken, address, nonce, signature }) }),
  /** CHỈ có khi backend chạy NETWORK=local + DEV_AUTH_ENABLED (môi trường khác trả 404). */
  loginDev: (email: string, address: string, nonce: string, signature: string) =>
    request<Session>("/auth/dev-login", { method: "POST", body: json({ email, address, nonce, signature }) }),
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
};

/** Endpoint cần phiên đăng nhập (JWT của đúng ví đang thao tác). */
export function createApi(token: string) {
  const r = <T,>(path: string, init: RequestInit = {}) => request<T>(path, { ...init, token });
  return {
    me: () => r<Me>("/auth/me"),
    createDraft: (req: CampaignDraftRequest) =>
      r<CampaignDraftResponse>("/campaigns/drafts", { method: "POST", body: json(req) }),
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
  };
}
export type UserApi = ReturnType<typeof createApi>;

/** Endpoint quản trị (header X-Admin-Key do người vận hành nhập; không nhúng vào bundle). */
export function createAdminApi(adminKey: string) {
  const r = <T,>(path: string, init: RequestInit = {}) => request<T>(path, { ...init, adminKey });
  return {
    review: () => r<ReviewItem[]>("/admin/review"),
    reviewAudio: (id: number) => r<Blob>(`/admin/review/${id}/audio`),
    decide: (id: number, decision: "approve" | "reject", note?: string) =>
      r<ContributionResult>(`/admin/review/${id}`, { method: "POST", body: json({ decision, note }) }),
    snapshot: (campaignId: number) => r<SnapshotResult>(`/admin/snapshot/${campaignId}`, { method: "POST" }),
    relayer: () => r<RelayerStatus>("/admin/relayer"),
    sync: () => r<{ processed_events: number; last_block: number }>("/admin/sync", { method: "POST" }),
  };
}
export type AdminApi = ReturnType<typeof createAdminApi>;
