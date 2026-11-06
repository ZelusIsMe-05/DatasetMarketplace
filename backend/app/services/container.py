"""Khởi tạo và nối các thành phần (composition root). Mọi kiểm tra môi trường tập trung ở đây + config.py."""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import ChainClient
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer, SignerPool
from app.core.config import SEED_DIR, Settings
from app.models.session import make_engine, make_session_factory, run_migrations, sqlite_url
from app.qc.service import QcService
from app.services.admin_service import AdminService
from app.services.auth_service import AuthService
from app.services.campaign_service import CampaignService
from app.services.consent_service import ConsentService
from app.services.contribution_service import ContributionService
from app.services.dataset_service import DatasetService
from app.services.faucet_service import FaucetService
from app.services.fx_service import FxService
from app.services.marketplace_service import MarketplaceService
from app.services.prompt_service import PromptService
from app.services.revoke_service import RevokeService
from app.services.rewards_service import RewardsService
from app.services.storage import PrivateStorage

log = logging.getLogger("giongque.container")


class StartupError(RuntimeError):
    pass


@dataclass
class Container:
    settings: Settings
    chain: ChainClient
    engine: Engine
    sf: sessionmaker[Session]
    data_dir: Path
    fingerprint: str
    relayer: Relayer
    qc_signer: Relayer
    indexer: EventIndexer
    qc: QcService
    fx: FxService
    storage: PrivateStorage
    auth: AuthService
    campaigns: CampaignService
    consent: ConsentService
    prompts: PromptService
    contributions: ContributionService
    rewards: RewardsService
    revoke: RevokeService
    market: MarketplaceService
    datasets: DatasetService
    admin: AdminService
    faucet: FaucetService | None


def deployment_fingerprint(chain: ChainClient, deploy_block: int) -> str:
    """chainId + địa chỉ contract + hash block deploy: Anvil khởi động lại => thư mục dữ liệu mới."""
    raw = f"{chain.chain_id}:{chain.address}:{chain.block_hash(deploy_block)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


def build_container(settings: Settings, qc_service: QcService | None = None) -> Container:
    chain = ChainClient(settings.rpc_url, settings.voice_campaigns, settings.token)
    try:
        chain_id = chain.chain_id
    except Exception as e:  # noqa: BLE001
        raise StartupError(f"Không kết nối được RPC {settings.rpc_url}: {type(e).__name__}") from e
    if chain_id != settings.network.chain_id:
        raise StartupError(f"RPC trả chain id {chain_id}, cấu hình NETWORK={settings.network.name} cần {settings.network.chain_id}")
    if not chain.has_code(chain.address):
        raise StartupError(f"Không có contract VoiceCampaigns tại {chain.address} (đã deploy chưa?)")
    if not chain.has_code(chain.token_address):
        raise StartupError(f"Không có token tại {chain.token_address}")
    symbol = chain.token_symbol()
    if not settings.network.allow_mock_token and symbol == "mUSDC":
        raise StartupError("Mainnet không được dùng MockUSDC")
    if settings.token_decimals != chain.token_decimals():
        raise StartupError("TOKEN_DECIMALS không khớp decimals() của token")

    fingerprint = deployment_fingerprint(chain, settings.deploy_block)
    data_dir = settings.storage_root / f"{settings.network.name}-{fingerprint}"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_url = settings.database_url or sqlite_url(data_dir / "giongque.db")
    run_migrations(db_url)
    engine = make_engine(db_url)
    sf = make_session_factory(engine)

    pool = SignerPool(lambda key: Relayer(chain.w3, key, sf))
    relayer = pool.get(settings.relayer_key)
    qc_signer = pool.get(settings.qc_oracle_key)
    indexer = EventIndexer(chain, sf, start_block=settings.deploy_block, chunk_blocks=settings.log_chunk_blocks)
    qc = qc_service or QcService(settings.qc)
    fx = FxService(settings, symbol="USDC" if symbol == "USDC" else symbol)
    storage = PrivateStorage(data_dir)

    campaigns = CampaignService(settings, sf, chain, indexer, fx, qc)
    contributions = ContributionService(settings, sf, chain, qc_signer, indexer, qc, storage, fx)
    datasets = DatasetService(settings, sf, chain, qc_signer, indexer, storage, fx)
    c = Container(
        settings=settings,
        chain=chain,
        engine=engine,
        sf=sf,
        data_dir=data_dir,
        fingerprint=fingerprint,
        relayer=relayer,
        qc_signer=qc_signer,
        indexer=indexer,
        qc=qc,
        fx=fx,
        storage=storage,
        auth=AuthService(settings, sf),
        campaigns=campaigns,
        consent=ConsentService(sf, chain, relayer, indexer),
        prompts=PromptService(settings, sf, chain),
        contributions=contributions,
        rewards=RewardsService(sf, chain, relayer, indexer, fx),
        revoke=RevokeService(sf, chain, relayer, indexer, storage, fx),
        market=MarketplaceService(sf, chain, indexer, fx),
        datasets=datasets,
        admin=AdminService(settings, sf, chain, relayer, qc_signer, indexer, contributions, storage, fx),
        faucet=FaucetService(settings, chain, relayer, fx) if settings.network.allow_mock_token else None,
    )
    # Metadata chiến dịch mẫu của SeedDemo (chỉ local/Fuji) rồi đồng bộ sự kiện để liên kết
    if settings.network.allow_mock_token:
        for d in sorted(SEED_DIR.glob("*")) if SEED_DIR.exists() else []:
            if d.is_dir():
                campaigns.import_seed(d)
    indexer.sync()
    campaigns.relink_unverified()
    if qc_signer.address != chain.qc_oracle():
        log.warning("Ví QC oracle của backend (%s) KHÁC qcOracle on-chain (%s)", qc_signer.address, chain.qc_oracle())
    log.info("Container sẵn sàng: %s chain=%s data=%s", settings.network.name, chain_id, data_dir)
    return c
