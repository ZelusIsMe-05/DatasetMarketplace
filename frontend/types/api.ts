// Kiểu dữ liệu khớp với schema Pydantic của backend (backend/app/schemas/*). Swagger: {API}/docs

export interface Money {
  units: number;
  vnd: number;
  display: string;
  token: string;
}

export interface Health {
  status: string;
  network: "local" | "fuji" | "mainnet";
  chain_id: number;
  rpc_ok: boolean;
  block: number | null;
  voice_campaigns: `0x${string}`;
  token: `0x${string}`;
  relayer: string;
  relayer_balance_avax: number | null;
  db_ok: boolean;
  database: "postgresql" | "sqlite";
  qc_model_loaded: boolean;
  dev_mode: boolean;
  /** "local" (đĩa máy chủ) hoặc "b2:<bucket>/<tiền tố>" (Backblaze B2, implementation-plan §3 #29) */
  storage: string;
}

export interface Fx {
  rate: number;
  source: "fixed" | "http";
  pair: string;
  network: string;
}

export interface Challenge {
  address: string;
  nonce: string;
  message: string;
  expires_at: number;
}

export interface Session {
  access_token: string;
  expires_at: number;
  user_id: number;
  email: string;
  wallet_address: `0x${string}`;
}

export interface CampaignSummary {
  id: number;
  name: string | null;
  accent: string | null;
  metadata_verified: boolean;
  creator: string;
  progress_bps: number;
  total_sec: number;
  target_sec: number;
  price: Money;
  full_price: Money;
  is_collecting: boolean;
  status: "collecting" | "stopped_target" | "stopped_deadline" | "stopped";
  deadline: number;
}

export interface SnapshotRef {
  version: number;
  merkle_root: string;
  uri: string;
  leaf_count: number;
  total_sec: number;
  status: string;
  tx_hash: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  description: string | null;
  purpose: string | null;
  license: string | null;
  language: string | null;
  split: { contributor_bps: number; creator_bps: number; platform_bps: number };
  contributors: number;
  buyers: number;
  revenue_total: Money;
  seed_rate_per_sec: Money;
  seed_balance: Money;
  prompt_count: number;
  prompt_set_hash: string;
  terms_hash: string;
  metadata_uri: string;
  samples: string[];
  /** Chủ chiến dịch duyệt bản ghi vùng xám — công khai để người ghi âm biết (implementation-plan §3 #28). */
  review: ReviewStats;
  latest_snapshot: SnapshotRef | null;
  explorer_url: string | null;
}

export interface Terms {
  campaign_id: number;
  terms_text: string;
  terms_hash: string;
  onchain_terms_hash: string;
  matches: boolean;
}

/** Dữ liệu EIP-712 dạng eth_signTypedData_v4, ký trực tiếp bằng viem. */
export interface TypedDataPayload {
  types: Record<string, { name: string; type: string }[]>;
  primaryType:
    | "Consent" | "Revoke" | "Claim" | "CreateCampaign" | "Buy" | "Withdraw" | "WithdrawSeed" | "PublishSnapshot" | "Permit";
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  message: Record<string, string | number>;
}

export interface TypedDataResponse {
  typed_data: TypedDataPayload;
  nonce: number;
  deadline: number;
}

// ------------------------------------------------------------ nền tảng trả phí mạng hộ (sponsored)

/** Bảng phí xử lý hiện hành (đã gồm phí mạng) — GET /fees. */
export interface FeeSchedule {
  mode: string;
  create: Money;
  buy: Money;
  withdraw: Money;
  claim: Money;
}

/** Chữ ký EIP-2612 cho phép hợp đồng trừ đúng `value` (domain của token). */
export interface PermitSign {
  typed_data: TypedDataPayload;
  value: number;
  nonce: number;
  deadline: number;
}

/** Hóa đơn trước khi ký: số tiền chính, phí xử lý, tổng; kèm dữ liệu cần ký nếu làm được. */
export interface SponsoredQuote {
  action: "create" | "buy" | "withdraw" | "withdraw_seed";
  payer: string;
  amount: Money;
  fee: Money;
  total: Money;
  balance: Money | null;
  can_submit: boolean;
  reason: string | null;
  sign: TypedDataResponse | null;
  permit: PermitSign | null;
}

export interface PermitSubmit {
  value: number;
  deadline: number;
  signature: string;
}

export interface SponsoredCreateRequest {
  fee: number;
  deadline: number;
  signature: string;
  permit: PermitSubmit | null;
}

export interface SponsoredBuyRequest extends SponsoredCreateRequest {
  buyer: string;
  max_price: number;
}

export interface SponsoredWithdrawRequest {
  account: string;
  fee: number;
  deadline: number;
  signature: string;
}

export interface SponsoredSeedWithdrawRequest {
  fee: number;
  deadline: number;
  signature: string;
}

export interface SponsoredResult {
  action: string;
  tx_hash: string;
  amount: Money;
  fee: Money;
  campaign_id: number | null;
}

export interface ConsentResponse {
  campaign_id: number;
  contributor: string;
  consented_at: number;
  terms_hash: string;
  tx_hash: string | null;
  already: boolean;
}

export interface PromptResponse {
  campaign_id: number;
  prompt_id: number;
  prompt_index: number;
  text: string;
  token: string;
  issued_at: number;
  expires_at: number;
  remaining_prompts: number;
}

export interface QcReport {
  decision: "pass" | "gray" | "reject";
  reasons: string[];
  duration_sec: number;
  speech_sec: number;
  chars_per_sec: number | null;
  cer: number | null;
  align_score: number | null;
  word_scores: { word: string; score: number }[];
  hypothesis: string;
}

export interface ContributionResult {
  id: number;
  campaign_id: number;
  prompt_id: number;
  status: "submitted" | "rejected" | "gray" | "pending_chain" | "registered" | "revoked" | "failed";
  qc: QcReport | null;
  weight_sec: number;
  onchain_id: number | null;
  commitment: string | null;
  tx_hash: string | null;
  seed_paid: Money | null;
  message: string;
}

export interface MyContributions {
  address: string;
  contributions: {
    id: number;
    campaign_id: number;
    prompt_text: string;
    status: ContributionResult["status"];
    duration_sec: number;
    weight_sec: number;
    onchain_id: number | null;
    tx_hash: string | null;
    revoke_tx_hash: string | null;
    reasons: string[];
    created_at: number;
  }[];
  earnings: { campaign_id: number; active_weight_sec: number; pending: Money }[];
  total_pending: Money;
}

export interface ClaimQuote {
  campaign_id: number;
  contributor: string;
  pending: Money;
  fee: Money;
  net: Money;
  can_claim: boolean;
  reason: string | null;
  sign: TypedDataResponse | null;
}

export interface ClaimResponse {
  campaign_id: number;
  contributor: string;
  received: Money;
  fee: Money;
  tx_hash: string;
}

export interface RevokeResponse {
  contribution_id: number;
  campaign_id: number;
  revoked_at: number;
  tx_hash: string;
  audio_deleted: boolean;
  new_progress_bps: number;
  new_price: Money;
  new_snapshot_version: number | null;
}

export interface PriceQuote {
  campaign_id: number;
  progress_bps: number;
  price: Money;
  full_price: Money;
  can_buy: boolean;
  reason: string | null;
  contract: `0x${string}`;
  token: `0x${string}`;
}

export interface CreateCampaignArgs {
  targetSec: number;
  fullPrice: number;
  contributorBps: number;
  creatorBps: number;
  deadline: number;
  promptSetHash: `0x${string}`;
  termsHash: `0x${string}`;
  metadataURI: string;
  seedRatePerSec: number;
  seedAmount: number;
}

export interface CampaignDraftRequest {
  name: string;
  description: string;
  purpose: string;
  license?: string;
  language?: string;
  accent?: string | null;
  prompts: string[];
  terms_text: string;
  target_sec: number;
  full_price_vnd: number;
  contributor_bps?: number;
  creator_bps?: number;
  duration_days?: number;
  seed_vnd?: number;
  seed_vnd_per_minute?: number;
}

export interface CampaignDraftResponse {
  draft_id: string;
  metadata_uri: string;
  prompt_count: number;
  fx_rate: number;
  full_price: Money;
  seed_amount: Money;
  contract: `0x${string}`;
  token: `0x${string}`;
  create_campaign_args: CreateCampaignArgs;
  note: string;
}

export interface DownloadMessage {
  campaign_id: number;
  buyer: string;
  issued_at: number;
  nonce: string;
  message: string;
}

export interface DownloadResponse {
  campaign_id: number;
  buyer: string;
  download_url: string;
  expires_at: number;
  snapshot: SnapshotRef & { campaign_id: number };
  license_price_paid: Money;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> };
}

export interface LicenseInfo {
  campaign_id: number;
  buyer: string;
  licensed: boolean;
  purchased_at: number;
  progress_bps_at_purchase: number;
  price_paid: Money;
}

export interface Revenue {
  campaign_id: number;
  sales: number;
  total: Money;
  to_contributors: Money;
  to_creator: Money;
  to_platform: Money;
  purchases: { buyer: string; price: Money; progress_bps: number; block: number; tx_hash: string }[];
  creator_withdrawable: Money;
  note: string;
}

export interface ConsentStatus {
  campaign_id: number;
  contributor: string;
  consented: boolean;
  consented_at: number;
}

export interface Me {
  user_id: number;
  email: string;
  wallet_address: `0x${string}`;
  auth_provider: "google" | "dev";
  /** Cài đặt tài khoản (implementation-plan §3 #31); null ⇒ hiển thị email */
  display_name: string | null;
  avatar: AvatarKey;
}

export type AvatarKey = "auto" | "sunset" | "ocean" | "forest" | "berry" | "amber" | "slate" | "rose";

export interface FaucetResult {
  address: string;
  minted: Money;
  balance: Money;
  tx_hash: string;
}

export interface SnapshotResult {
  campaign_id: number;
  version: number;
  merkle_root: string;
  uri: string;
  leaf_count: number;
  total_sec: number;
  tx_hash: string | null;
  status: string;
}

// ------------------------------------------------------------ chủ chiến dịch sở hữu dữ liệu (§3 #28, không có admin)

/** Bản ghi vùng xám chờ CHỦ CHIẾN DỊCH duyệt — GET /creator/review. */
export interface ReviewItem {
  id: number;
  campaign_id: number;
  address: string;
  prompt_text: string;
  status: "gray";
  duration_sec: number;
  weight_sec: number;
  qc: QcReport | null;
  /** Đường dẫn API để nghe (cần phiên đăng nhập của chủ chiến dịch) */
  audio_path: string;
  created_at: number;
  /** Quá thời điểm này chưa duyệt thì nền tảng tự duyệt; null = chờ mãi */
  auto_approve_at: number | null;
}

export interface ReviewStats {
  pending: number;
  approved: number;
  auto_approved: number;
  rejected: number;
}

/** Bản tóm tắt phiên bản dataset sắp công bố + dữ liệu PublishSnapshot để chủ chiến dịch ký. */
export interface SnapshotQuote {
  campaign_id: number;
  version: number;
  leaf_count: number;
  total_sec: number;
  merkle_root: string;
  uri: string;
  latest_version: number | null;
  /** published | stale (chứa bản ghi đã thu hồi) | null (chưa công bố lần nào) */
  latest_status: string | null;
  changed: boolean;
  sign: TypedDataResponse;
}
