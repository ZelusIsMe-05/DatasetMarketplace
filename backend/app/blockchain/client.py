"""Đọc contract VoiceCampaigns + token qua web3.py (Anvil / Fuji / mainnet)."""
from __future__ import annotations

from dataclasses import dataclass

from web3 import Web3
from web3.contract import Contract
from web3.exceptions import ContractCustomError, ContractLogicError

from app.blockchain.abi import load_abi
from app.blockchain.eip712 import Domain
from app.blockchain.errors import decode_revert, message_for
from app.core.errors import ChainError


@dataclass(frozen=True)
class CampaignView:
    id: int
    creator: str
    deadline: int
    target_sec: int
    full_price: int
    contributor_bps: int
    creator_bps: int
    prompt_set_hash: str
    terms_hash: str
    metadata_uri: str
    total_weight: int
    acc_per_weight: int
    seed_rate_per_sec: int
    seed_balance: int
    progress_bps: int
    current_price: int
    is_collecting: bool

    @property
    def platform_bps(self) -> int:
        return 10_000 - self.contributor_bps - self.creator_bps


@dataclass(frozen=True)
class ContributionView:
    id: int
    campaign_id: int
    contributor: str
    commitment: str
    duration_sec: int
    created_at: int
    revoked_at: int


@dataclass(frozen=True)
class LicenseView:
    purchased_at: int
    progress_bps_at_purchase: int
    price_paid: int

    @property
    def active(self) -> bool:
        return self.purchased_at != 0


def _hex(b: bytes) -> str:
    return "0x" + bytes(b).hex()


class ChainClient:
    def __init__(self, rpc_url: str, voice_campaigns: str, token: str, timeout: int = 30):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
        self.address = Web3.to_checksum_address(voice_campaigns)
        self.contract: Contract = self.w3.eth.contract(address=self.address, abi=load_abi("VoiceCampaigns"))
        self.token_address = Web3.to_checksum_address(token)
        self.token: Contract = self.w3.eth.contract(address=self.token_address, abi=load_abi("MockUSDC"))
        self._chain_id: int | None = None

    # ------------------------------------------------------------------ cơ bản

    @property
    def chain_id(self) -> int:
        if self._chain_id is None:
            self._chain_id = int(self.w3.eth.chain_id)
        return self._chain_id

    def domain(self) -> Domain:
        return Domain(chain_id=self.chain_id, verifying_contract=self.address)

    def block_number(self) -> int:
        return int(self.w3.eth.block_number)

    def block_timestamp(self) -> int:
        return int(self.w3.eth.get_block("latest")["timestamp"])

    def block_hash(self, number: int) -> str:
        return _hex(self.w3.eth.get_block(number)["hash"])

    def has_code(self, address: str) -> bool:
        return len(self.w3.eth.get_code(Web3.to_checksum_address(address))) > 0

    def native_balance(self, address: str) -> int:
        return int(self.w3.eth.get_balance(Web3.to_checksum_address(address)))

    def _call(self, fn):  # noqa: ANN001
        try:
            return fn.call()
        except (ContractCustomError, ContractLogicError) as e:
            name = decode_revert(getattr(e, "data", None))
            raise ChainError(message_for(name, "Đọc contract thất bại"), code=name or "chain_error") from e

    # ------------------------------------------------------------------ VoiceCampaigns

    def campaign_count(self) -> int:
        return int(self._call(self.contract.functions.campaignCount()))

    def contribution_count(self) -> int:
        return int(self._call(self.contract.functions.contributionCount()))

    def campaign(self, campaign_id: int) -> CampaignView | None:
        if campaign_id < 0 or campaign_id >= self.campaign_count():
            return None
        f = self.contract.functions
        c = self._call(f.getCampaign(campaign_id))
        return CampaignView(
            id=campaign_id,
            creator=c[0],
            deadline=int(c[1]),
            target_sec=int(c[2]),
            full_price=int(c[3]),
            contributor_bps=int(c[4]),
            creator_bps=int(c[5]),
            prompt_set_hash=_hex(c[6]),
            terms_hash=_hex(c[7]),
            metadata_uri=c[8],
            total_weight=int(c[9]),
            acc_per_weight=int(c[10]),
            seed_rate_per_sec=int(c[11]),
            seed_balance=int(c[12]),
            progress_bps=int(self._call(f.progressBps(campaign_id))),
            current_price=int(self._call(f.currentPrice(campaign_id))),
            is_collecting=bool(self._call(f.isCollecting(campaign_id))),
        )

    def contribution(self, contribution_id: int) -> ContributionView | None:
        r = self._call(self.contract.functions.contributions(contribution_id))
        if r[1] == "0x0000000000000000000000000000000000000000":
            return None
        return ContributionView(contribution_id, int(r[0]), r[1], _hex(r[2]), int(r[3]), int(r[4]), int(r[5]))

    def consent_at(self, campaign_id: int, address: str) -> int:
        return int(self._call(self.contract.functions.consentAt(campaign_id, Web3.to_checksum_address(address))))

    def nonce_of(self, address: str) -> int:
        return int(self._call(self.contract.functions.nonceOf(Web3.to_checksum_address(address))))

    def pending_reward(self, campaign_id: int, address: str) -> int:
        return int(self._call(self.contract.functions.pendingReward(campaign_id, Web3.to_checksum_address(address))))

    def account(self, campaign_id: int, address: str) -> tuple[int, int, int]:
        """(weight, rewardDebt, pending)"""
        r = self._call(self.contract.functions.accounts(campaign_id, Web3.to_checksum_address(address)))
        return int(r[0]), int(r[1]), int(r[2])

    def license(self, campaign_id: int, address: str) -> LicenseView:
        r = self._call(self.contract.functions.licenses(campaign_id, Web3.to_checksum_address(address)))
        return LicenseView(int(r[0]), int(r[1]), int(r[2]))

    def claim_fee(self) -> int:
        return int(self._call(self.contract.functions.claimFee()))

    def fee_collector(self) -> str:
        return self._call(self.contract.functions.feeCollector())

    def qc_oracle(self) -> str:
        return self._call(self.contract.functions.qcOracle())

    def owner(self) -> str:
        return self._call(self.contract.functions.owner())

    def withdrawable(self, address: str) -> int:
        return int(self._call(self.contract.functions.withdrawable(Web3.to_checksum_address(address))))

    def used_commitment(self, commitment: str) -> bool:
        return bool(self._call(self.contract.functions.usedCommitment(commitment)))

    # ------------------------------------------------------------------ token

    def token_symbol(self) -> str:
        return self._call(self.token.functions.symbol())

    def token_decimals(self) -> int:
        return int(self._call(self.token.functions.decimals()))

    def token_balance(self, address: str) -> int:
        return int(self._call(self.token.functions.balanceOf(Web3.to_checksum_address(address))))
