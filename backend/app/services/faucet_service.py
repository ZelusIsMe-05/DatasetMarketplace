"""[CHỈ LOCAL + FUJI] Mint mUSDC cho ví người mua demo (§11 `POST /demo/faucet`).

Router của dịch vụ này không được mount khi NETWORK=mainnet (trả 404), và container từ chối khởi tạo
nó nếu hồ sơ mạng không cho phép token giả lập.
"""
from __future__ import annotations

from web3 import Web3

from app.blockchain.client import ChainClient
from app.blockchain.relayer import Relayer
from app.core.config import Settings
from app.core.errors import BadRequest
from app.schemas.dataset import FaucetResponse
from app.services.fx_service import FxService


class FaucetService:
    def __init__(self, settings: Settings, chain: ChainClient, relayer: Relayer, fx: FxService):
        if not settings.network.allow_mock_token:
            raise RuntimeError("Faucet bị cấm trên mạng này")
        self.settings, self.chain, self.relayer, self.fx = settings, chain, relayer, fx

    def mint(self, address: str, amount_usdc: int) -> FaucetResponse:
        if not Web3.is_address(address):
            raise BadRequest("Địa chỉ ví không hợp lệ")
        if amount_usdc > self.settings.faucet_max_usdc:
            raise BadRequest(f"Tối đa {self.settings.faucet_max_usdc} mUSDC mỗi lần")
        addr = Web3.to_checksum_address(address)
        units = amount_usdc * 10**self.settings.token_decimals
        res = self.relayer.send(self.chain.token.functions.mint(addr, units), kind="faucet", meta={"to": addr})
        rate = self.fx.rate()
        return FaucetResponse(
            address=addr,
            minted=self.fx.money(units, rate),
            balance=self.fx.money(self.chain.token_balance(addr), rate),
            tx_hash=res.tx_hash,
        )
