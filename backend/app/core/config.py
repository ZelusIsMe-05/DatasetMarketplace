"""Cấu hình theo môi trường. Chọn bằng biến NETWORK = local | fuji | mainnet (đề xuất §12.5).

Mọi khác biệt giữa test và deploy nằm ở đây; code nghiệp vụ không tự kiểm tra môi trường.
File `backend/.env.<network>` được nạp tự động (biến môi trường của tiến trình luôn được ưu tiên).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
CONTRACTS_DIR = REPO_DIR / "contracts"
SEED_DIR = REPO_DIR / "seed"

# Khóa mặc định chỉ dùng cho local; fuji/mainnet bắt buộc đặt biến môi trường riêng.
_LOCAL_DEV_SECRET = "local-dev-secret-NOT-FOR-FUJI-OR-MAINNET"


@dataclass(frozen=True)
class NetworkProfile:
    name: str
    chain_id: int
    rpc_url: str
    explorer: str
    allow_mock_token: bool  # được phép dùng MockUSDC (mint tự do)
    allow_faucet_button: bool  # hiện nút "Nhận mUSDC thử" cho người mua demo
    fx_source: str  # "fixed" | "http"


PROFILES: dict[str, NetworkProfile] = {
    "local": NetworkProfile("local", 31337, "http://127.0.0.1:8545", "", True, True, "fixed"),
    "fuji": NetworkProfile(
        "fuji", 43113, "https://api.avax-test.network/ext/bc/C/rpc",
        "https://testnet.snowtrace.io", True, True, "fixed",
    ),
    "mainnet": NetworkProfile(
        "mainnet", 43114, "https://api.avax.network/ext/bc/C/rpc",
        "https://snowtrace.io", False, False, "http",
    ),
}


@dataclass(frozen=True)
class QcSettings:
    model_id: str = "nguyenvulebinh/wav2vec2-base-vietnamese-250h"
    num_threads: int = 2
    preload: bool = False
    weight_source: str = "speech"  # "speech" (giây giọng nói theo VAD) | "duration"
    min_sec: float = 1.5
    max_sec: float = 15.0
    min_speech_ratio: float = 0.5
    min_chars_per_sec: float = 5.0
    max_chars_per_sec: float = 30.0
    max_cer_pass: float = 0.15
    max_cer_gray: float = 0.30
    min_align_pass: float = 0.60
    min_align_gray: float = 0.40
    min_word_score: float = 0.20


@dataclass(frozen=True)
class Settings:
    network: NetworkProfile
    rpc_url: str
    voice_campaigns: str
    token: str
    token_decimals: int
    deploy_block: int
    relayer_key: str  # ví trả gas AVAX (relayer)
    qc_oracle_key: str  # ví QC oracle (mặc định dùng chung với relayer, §8.4)
    usdc_vnd_rate: float  # chỉ dùng khi fx_source = "fixed"
    fx_url: str | None  # chỉ dùng khi fx_source = "http"
    fx_json_key: str
    jwt_secret: str
    token_secret: str  # HMAC cho prompt token / link tải
    session_ttl_sec: int
    prompt_token_ttl_sec: int
    download_token_ttl_sec: int
    signature_max_age_sec: int
    google_client_id: str | None
    dev_auth_enabled: bool  # chỉ có hiệu lực khi NETWORK=local
    admin_api_key: str | None
    cors_origins: list[str]
    rate_limit_enabled: bool
    rate_limit_faucet: str
    storage_root: Path
    database_url: str | None  # None = SQLite trong thư mục dữ liệu của deployment
    auto_snapshot_on_revoke: bool
    indexer_interval_sec: float
    log_chunk_blocks: int
    faucet_max_usdc: int
    max_upload_bytes: int
    api_public_url: str
    qc: QcSettings = field(default_factory=QcSettings)

    @property
    def is_local(self) -> bool:
        return self.network.name == "local"

    @property
    def dev_mode(self) -> bool:
        """Cơ chế phát triển (đăng nhập dev, chọn câu mẫu cụ thể) — CHỈ local."""
        return self.is_local and self.dev_auth_enabled


def _env_bool(env: dict[str, str], key: str, default: bool) -> bool:
    v = env.get(key)
    if v is None or v == "":
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def _merged_env(network: str, env_file: Path | None) -> dict[str, str]:
    path = env_file or BACKEND_DIR / f".env.{network}"
    file_vals = {k: v for k, v in dotenv_values(path).items() if v is not None} if path.exists() else {}
    merged = dict(file_vals)
    merged.update({k: v for k, v in os.environ.items()})
    return merged


def read_deployment(chain_id: int) -> dict | None:
    p = CONTRACTS_DIR / "deployments" / f"{chain_id}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def load_settings(env_file: Path | None = None, overrides: dict[str, str] | None = None) -> Settings:
    base = dict(os.environ)
    if overrides:
        base.update(overrides)
    name = base.get("NETWORK", "local")
    if name not in PROFILES:
        raise ValueError(f"NETWORK phải là một trong {list(PROFILES)}")
    net = PROFILES[name]
    env = _merged_env(name, env_file)
    if overrides:
        env.update(overrides)

    deployment = read_deployment(net.chain_id) if name != "mainnet" else None
    voice_campaigns = env.get("VOICE_CAMPAIGNS") or (deployment or {}).get("voiceCampaigns")
    token = env.get("TOKEN_ADDRESS") or (deployment or {}).get("token")
    if not voice_campaigns or not token:
        raise ValueError(
            "Thiếu VOICE_CAMPAIGNS / TOKEN_ADDRESS. Chạy scripts\\deploy-local.bat (local) "
            "hoặc đặt trong backend/.env.<network>."
        )
    relayer_key = env.get("RELAYER_PRIVATE_KEY")
    if not relayer_key:
        raise ValueError("Thiếu RELAYER_PRIVATE_KEY")

    def secret(key: str) -> str:
        v = env.get(key)
        if v:
            if name != "local" and len(v) < 32:
                raise ValueError(f"{key} phải dài ít nhất 32 ký tự ngoài local")
            return v
        if name == "local":
            return _LOCAL_DEV_SECRET
        raise ValueError(f"Thiếu {key} (bắt buộc với NETWORK={name})")

    dev_auth = _env_bool(env, "DEV_AUTH_ENABLED", name == "local")
    if dev_auth and name != "local":
        raise ValueError("DEV_AUTH_ENABLED chỉ được bật khi NETWORK=local")

    deploy_block = int(env.get("DEPLOY_BLOCK") or (deployment or {}).get("deployBlock") or 0)

    qc_defaults = QcSettings()
    qc = QcSettings(
        model_id=env.get("QC_MODEL_ID", qc_defaults.model_id),
        num_threads=int(env.get("QC_NUM_THREADS", qc_defaults.num_threads)),
        preload=_env_bool(env, "QC_PRELOAD", qc_defaults.preload),
        weight_source=env.get("QC_WEIGHT_SOURCE", qc_defaults.weight_source),
        min_sec=float(env.get("QC_MIN_SEC", qc_defaults.min_sec)),
        max_sec=float(env.get("QC_MAX_SEC", qc_defaults.max_sec)),
        min_speech_ratio=float(env.get("QC_MIN_SPEECH_RATIO", qc_defaults.min_speech_ratio)),
        min_chars_per_sec=float(env.get("QC_MIN_CPS", qc_defaults.min_chars_per_sec)),
        max_chars_per_sec=float(env.get("QC_MAX_CPS", qc_defaults.max_chars_per_sec)),
        max_cer_pass=float(env.get("QC_MAX_CER_PASS", qc_defaults.max_cer_pass)),
        max_cer_gray=float(env.get("QC_MAX_CER_GRAY", qc_defaults.max_cer_gray)),
        min_align_pass=float(env.get("QC_MIN_ALIGN_PASS", qc_defaults.min_align_pass)),
        min_align_gray=float(env.get("QC_MIN_ALIGN_GRAY", qc_defaults.min_align_gray)),
        min_word_score=float(env.get("QC_MIN_WORD_SCORE", qc_defaults.min_word_score)),
    )
    if qc.weight_source not in {"speech", "duration"}:
        raise ValueError("QC_WEIGHT_SOURCE phải là speech hoặc duration")

    s = Settings(
        network=net,
        rpc_url=env.get("RPC_URL") or net.rpc_url,
        voice_campaigns=voice_campaigns,
        token=token,
        token_decimals=int(env.get("TOKEN_DECIMALS", "6")),
        deploy_block=deploy_block,
        relayer_key=relayer_key,
        qc_oracle_key=env.get("QC_ORACLE_PRIVATE_KEY") or relayer_key,
        usdc_vnd_rate=float(env.get("USDC_VND_RATE", "26000")),  # tỷ giá giả định cho demo
        fx_url=env.get("FX_URL"),
        fx_json_key=env.get("FX_JSON_KEY", "rate"),
        jwt_secret=secret("JWT_SECRET"),
        token_secret=secret("TOKEN_SECRET"),
        session_ttl_sec=int(env.get("SESSION_TTL_SEC", "43200")),
        prompt_token_ttl_sec=int(env.get("PROMPT_TOKEN_TTL_SEC", "60")),
        download_token_ttl_sec=int(env.get("DOWNLOAD_TOKEN_TTL_SEC", "600")),
        signature_max_age_sec=int(env.get("SIGNATURE_MAX_AGE_SEC", "300")),
        google_client_id=env.get("GOOGLE_CLIENT_ID") or None,
        dev_auth_enabled=dev_auth,
        admin_api_key=env.get("ADMIN_API_KEY") or None,
        cors_origins=[o.strip() for o in env.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()],
        rate_limit_enabled=_env_bool(env, "RATE_LIMIT_ENABLED", True),
        rate_limit_faucet=env.get("RATE_LIMIT_FAUCET") or ("200/hour" if name == "local" else "5/hour"),
        storage_root=Path(env.get("STORAGE_DIR") or REPO_DIR / "storage"),
        database_url=env.get("DATABASE_URL") or None,
        auto_snapshot_on_revoke=_env_bool(env, "AUTO_SNAPSHOT_ON_REVOKE", True),
        indexer_interval_sec=float(env.get("INDEXER_INTERVAL_SEC", "5")),
        log_chunk_blocks=int(env.get("LOG_CHUNK_BLOCKS", "2000")),
        faucet_max_usdc=int(env.get("FAUCET_MAX_USDC", "2000")),
        max_upload_bytes=int(env.get("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024))),
        api_public_url=env.get("API_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/"),
        qc=qc,
    )
    if net.fx_source == "http" and not s.fx_url:
        raise ValueError("Mainnet cần FX_URL để lấy tỷ giá USDC/VND thật")
    if name != "local" and not s.admin_api_key:
        raise ValueError(f"Thiếu ADMIN_API_KEY (bắt buộc với NETWORK={name})")
    return s


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
