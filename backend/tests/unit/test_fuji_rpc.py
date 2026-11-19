"""Đặc thù RPC công khai của Avalanche Fuji, gặp thật khi chạy backend NETWORK=fuji (19/11):

1. `eth_getLogs` tối đa 100 block/lần (lỗi -32602 "block range too large") ⇒ indexer tự giảm đoạn quét.
2. Block có `extraData` > 32 byte ⇒ web3 ném ExtraDataLengthError khi đọc block (relayer lấy baseFee) ⇒ cần middleware POA.
3. Cân bằng tải nhiều node: ngay sau receipt, `eth_blockNumber` có thể trả block trước đó ⇒ log của giao dịch vừa gửi
   phải được xử lý từ chính receipt (không đợi vòng quét).
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from eth_abi import encode
from hexbytes import HexBytes
from sqlalchemy import select
from web3 import Web3
from web3.exceptions import ExtraDataLengthError, Web3RPCError
from web3.providers.base import BaseProvider

from app.blockchain.abi import load_abi
from app.blockchain.client import ChainClient
from app.blockchain.indexer import EventIndexer, _range_limit
from app.models import Consent
from app.models.session import make_engine, make_session_factory, run_migrations, sqlite_url

FUJI_MSG = ("{'code': -32602, 'message': 'block range too large: total block range in this request exceeds the maximum "
            "of 100 blocks'}")
VC = Web3.to_checksum_address("0x" + "11" * 20)


class _Eth:
    def __init__(self, limit: int = 10**9, error: str = FUJI_MSG):
        self.limit, self.error, self.calls = limit, error, []

    def get_logs(self, f: dict) -> list:
        self.calls.append((f["fromBlock"], f["toBlock"]))
        if f["toBlock"] - f["fromBlock"] + 1 > self.limit:
            raise Web3RPCError(self.error)
        return []  # node "trễ": chưa thấy log nào


class _Chain:
    address = VC

    def __init__(self, head: int, eth: _Eth, abi: list | None = None):
        self.w3 = SimpleNamespace(eth=eth, codec=Web3().codec)
        self.contract = SimpleNamespace(abi=abi or [])
        self._head = head

    def block_number(self) -> int:
        return self._head


@pytest.fixture
def sf(tmp_path):
    url = sqlite_url(tmp_path / "idx.db")
    run_migrations(url)
    return make_session_factory(make_engine(url))


# ------------------------------------------------------------------ 1. giới hạn phạm vi eth_getLogs


def test_range_limit_parses_fuji_message():
    assert _range_limit(Exception(FUJI_MSG)) == 100
    assert _range_limit(Exception("query returned more than 10000 results")) is None
    assert _range_limit(Exception("execution reverted")) is None


def test_indexer_shrinks_chunk_to_rpc_limit_and_finishes(sf):
    eth = _Eth(limit=100)
    idx = EventIndexer(_Chain(head=1349, eth=eth), sf, start_block=1000, chunk_blocks=2000)
    assert idx.sync() == 0
    assert idx.chunk == 100
    # lần đầu (1000..1349) bị từ chối, sau đó đọc lại từ 1000 theo đoạn 100 block, không bỏ sót block nào
    assert eth.calls == [(1000, 1349), (1000, 1099), (1100, 1199), (1200, 1299), (1300, 1349)]
    with sf() as s:
        assert idx.last_block(s) == 1349


def test_indexer_reraises_other_rpc_errors(sf):
    eth = _Eth(limit=1, error="{'code': -32000, 'message': 'header not found'}")
    idx = EventIndexer(_Chain(head=1010, eth=eth), sf, start_block=1000, chunk_blocks=2000)
    with pytest.raises(Web3RPCError):
        idx.sync()
    assert idx.chunk == 2000


# ------------------------------------------------------------------ 2. extraData dài của block Avalanche


class _AvalancheBlockProvider(BaseProvider):
    def make_request(self, method, params):  # noqa: ANN001, ANN201
        if method == "eth_getBlockByNumber":
            return {"jsonrpc": "2.0", "id": 1, "result": {
                "number": "0x10", "hash": "0x" + "ab" * 32, "parentHash": "0x" + "cd" * 32, "extraData": "0x" + "00" * 80,
                "timestamp": "0x5", "baseFeePerGas": "0x1", "miner": "0x" + "00" * 20, "transactions": [], "gasLimit": "0x1",
                "gasUsed": "0x0"}}
        return {"jsonrpc": "2.0", "id": 1, "result": "0xa869"}

    def is_connected(self, show_traceback: bool = False) -> bool:
        return True


def test_chain_client_reads_avalanche_blocks_with_long_extradata():
    with pytest.raises(ExtraDataLengthError):  # web3 trần: lỗi đúng như đã gặp trên Fuji
        Web3(_AvalancheBlockProvider()).eth.get_block("latest")
    c = ChainClient("http://127.0.0.1:1", VC, "0x" + "22" * 20)
    c.w3.provider = _AvalancheBlockProvider()
    assert c.block_timestamp() == 5


# ------------------------------------------------------------------ 3. xử lý log từ receipt khi node RPC trễ


def _consent_receipt(block: int, campaign_id: int, who: str, terms: bytes) -> dict:
    topic0 = Web3.keccak(text="ConsentGiven(uint256,address,bytes32)")
    log = {"address": VC, "topics": [topic0, HexBytes(encode(["uint256"], [campaign_id])), HexBytes(encode(["address"], [who]))],
           "data": HexBytes(terms), "blockNumber": block, "transactionHash": HexBytes("0x" + "aa" * 32), "transactionIndex": 0,
           "blockHash": HexBytes("0x" + "bb" * 32), "logIndex": 1}
    token_transfer = dict(log, address="0x" + "22" * 20, logIndex=0)  # log của token trong cùng receipt: bỏ qua
    return {"transactionHash": HexBytes("0x" + "aa" * 32), "blockNumber": block, "logs": [token_transfer, log]}


def test_receipt_logs_indexed_even_when_rpc_head_lags(sf):
    who = Web3.to_checksum_address("0x" + "33" * 20)
    eth = _Eth()
    idx = EventIndexer(_Chain(head=999, eth=eth, abi=load_abi("VoiceCampaigns")), sf, start_block=990)
    receipt = _consent_receipt(1000, 7, who, b"\x42" * 32)  # node trả head 999 < block của receipt
    assert idx.sync(receipt) == 1
    assert idx.sync(receipt) == 1  # vòng sau gặp lại cùng log: idempotent
    with sf() as s:
        rows = s.scalars(select(Consent).where(Consent.campaign_id == 7)).all()
        assert [(r.address, r.block) for r in rows] == [(who, 1000)]
        assert idx.last_block(s) == 999  # con trỏ quét chỉ theo head của RPC, không nhảy qua block chưa quét
