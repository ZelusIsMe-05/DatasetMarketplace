"""Khởi tạo và nối các thành phần (composition root). Mọi kiểm tra môi trường tập trung ở đây + config.py."""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import ChainClient
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer, SignerPool
from app.core.config import SEED_DIR, Settings
from app.models import KvState
from app.models.session import make_engine, make_session_factory, run_migrations, sqlite_url
from app.qc.service import QcService
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
from app.services.review_service import ReviewService
from app.services.rewards_service import RewardsService
from app.services.sponsor_service import SponsorService
from app.services.storage import AudioStorage, B2Storage, PrivateStorage, StorageError

log = logging.getLogger("datasetmarketplace.container")


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
    storage: AudioStorage
    auth: AuthService
    campaigns: CampaignService
    consent: ConsentService
    prompts: PromptService
    contributions: ContributionService
    rewards: RewardsService
    revoke: RevokeService
    market: MarketplaceService
    datasets: DatasetService
    review: ReviewService
    sponsor: SponsorService
    faucet: FaucetService | None


def deployment_fingerprint(chain: ChainClient, deploy_block: int) -> str:
    """chainId + địa chỉ contract + hash block deploy: Anvil khởi động lại => thư mục dữ liệu mới."""
    raw = f"{chain.chain_id}:{chain.address}:{chain.block_hash(deploy_block)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


DEPLOYMENT_KEY = "deployment.fingerprint"


def check_deployment_stamp(sf: sessionmaker[Session], fingerprint: str, chain_id: int, contract: str) -> None:
    """Một database chỉ phục vụ một deployment (chain + contract).

    Với SQLite mỗi deployment có file riêng nên luôn khớp. Với PostgreSQL dùng chung (Neon), khởi động lại Anvil
    rồi deploy lại mà không reset database sẽ trộn dữ liệu chain cũ với chain mới (trùng campaignId, sai block
    của indexer...) — chặn ngay và hướng dẫn cách xử lý.
    """
    with sf() as s:
        row = s.get(KvState, DEPLOYMENT_KEY)
        if row is None:
            s.add(KvState(key=DEPLOYMENT_KEY, value=json.dumps({"fingerprint": fingerprint, "chainId": chain_id, "contract": contract})))
            s.commit()
            return
        old = json.loads(row.value)
        if old.get("fingerprint") != fingerprint:
            same_address = str(old.get("contract", "")).lower() == contract.lower()
            what = (
                f"cùng địa chỉ contract {contract} nhưng là chain MỚI (Anvil đã khởi động lại)"
                if same_address
                else f"chain {old.get('chainId')}, contract {old.get('contract')}; hiện tại: chain {chain_id}, contract {contract}"
            )
            raise StartupError(
                f"Database đang chứa dữ liệu của một deployment khác ({what}). "
                "Local: chạy scripts\\reset-db.bat để xóa dữ liệu cũ (database + audio) rồi khởi động lại backend. "
                "Fuji/mainnet: KHÔNG reset — dùng DATABASE_SCHEMA hoặc branch Neon khác cho contract mới."
            )


def check_chain_not_rewound(last_indexed_block: int, head: int) -> None:
    """Chain lùi về trạng thái cũ (Anvil tắt không bằng Ctrl+C nên chỉ còn bản lưu trước đó) nhưng database đã đọc
    sự kiện tới block cao hơn ⇒ indexer sẽ BỎ QUA sự kiện mới trong khoảng block đó. Dấu deployment không phát hiện
    được vì block deploy vẫn giống nhau — chặn ngay."""
    if last_indexed_block > head:
        raise StartupError(
            f"Chain đang ở block {head} nhưng database đã đọc sự kiện tới block {last_indexed_block}: chain đã quay về "
            "trạng thái cũ (thường do cửa sổ Anvil bị đóng mà không bấm Ctrl+C, nên lần lưu gần nhất là bản cũ). "
            "Local: chạy scripts\\reset-local.bat rồi start-anvil persist → deploy-local → start-backend. "
            "Fuji/mainnet: kiểm tra RPC_URL có trỏ đúng chain không."
        )


def build_storage(settings: Settings, data_dir: Path, fingerprint: str) -> AudioStorage:
    """Kho audio riêng tư: Backblaze B2 khi đủ cấu hình (B2_BUCKET + khóa), ngược lại thư mục trên đĩa (§3 #29).

    Trên B2 mỗi deployment có tiền tố riêng `<network>-<fingerprint>` — giống tên thư mục dữ liệu ở đĩa.
    """
    if settings.b2_bucket:
        storage = B2Storage(
            settings.b2_key_id or "", settings.b2_application_key or "", settings.b2_bucket,
            prefix=f"{settings.network.name}-{fingerprint}",
        )
        try:
            storage.check()
        except StorageError as e:
            raise StartupError(str(e)) from e
        return storage
    if settings.b2_key_id or settings.b2_application_key:
        log.warning("Backblaze B2 chưa đủ cấu hình (thiếu B2_BUCKET) — audio đang lưu trên đĩa của máy chủ")
    return PrivateStorage(data_dir)


def build_container(settings: Settings, qc_service: QcService | None = None) -> Container:
    chain = ChainClient(settings.rpc_url, settings.voice_campaigns, settings.token)
    try:
        chain_id = chain.chain_id
    except Exception as e:  # noqa: BLE001
        raise StartupError(f"Không kết nối được RPC {settings.rpc_url}: {type(e).__name__}") from e
    if chain_id != settings.network.chain_id:
        raise StartupError(f"RPC trả chain id {chain_id}, cấu hình NETWORK={settings.network.name} cần {settings.network.chain_id}")
    if settings.is_local:
        # Hardhat/Scaffold-ETH của dự án khác cũng là chain 31337 (thường ở cổng 8545): không được nhận nhầm.
        client = str(chain.w3.client_version)
        if not client.lower().startswith("anvil"):
            raise StartupError(
                f"Node ở {settings.rpc_url} là \"{client}\", không phải Anvil của dự án. "
                "Chạy scripts\\start-anvil.bat (cổng 8386) hoặc sửa RPC_URL."
            )
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
    # Thư mục trên đĩa chỉ cần khi còn dữ liệu cục bộ: SQLite (không có DATABASE_URL). Audio trên đĩa (không có B2) thì
    # PrivateStorage tự tạo. Neon + Backblaze B2 ⇒ backend không ghi gì vào storage/.
    if not settings.database_url:
        data_dir.mkdir(parents=True, exist_ok=True)
    db_url = settings.database_url or sqlite_url(data_dir / "datasetmarketplace.db")
    try:
        run_migrations(db_url, settings.database_schema)
    except Exception as e:  # noqa: BLE001
        raise StartupError(f"Không kết nối/migrate được database: {type(e).__name__}: {str(e).splitlines()[0][:200]}") from e
    engine = make_engine(db_url, settings.database_schema)
    sf = make_session_factory(engine)
    check_deployment_stamp(sf, fingerprint, chain_id, chain.address)

    pool = SignerPool(lambda key: Relayer(chain.w3, key, sf))
    relayer = pool.get(settings.relayer_key)
    qc_signer = pool.get(settings.qc_oracle_key)
    indexer = EventIndexer(chain, sf, start_block=settings.deploy_block, chunk_blocks=settings.log_chunk_blocks)
    with sf() as s:
        check_chain_not_rewound(indexer.last_block(s), chain.block_number())
    qc = qc_service or QcService(settings.qc)
    fx = FxService(settings, symbol="USDC" if symbol == "USDC" else symbol)
    storage = build_storage(settings, data_dir, fingerprint)

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
        review=ReviewService(settings, sf, contributions, storage),
        sponsor=SponsorService(settings, sf, chain, relayer, indexer, fx, campaigns),
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
    log.info(
        "Container sẵn sàng: %s chain=%s database=%s%s audio=%s",
        settings.network.name, chain_id, engine.dialect.name,
        f" (schema {settings.database_schema})" if settings.database_schema else "", storage.describe(),
    )
    return c
