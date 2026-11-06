"""Lập chỉ mục sự kiện on-chain vào database (đề xuất §8.1 "API đọc license, sự kiện").

- Đọc log theo từng đoạn block (RPC công khai của Fuji giới hạn phạm vi eth_getLogs).
- Idempotent: ràng buộc unique + kiểm tra tồn tại, chạy lại an toàn.
- Hook `on_revoked`: mọi thu hồi (qua relayer HAY người dùng tự gọi `revoke`) đều kích hoạt xóa audio + salt.
"""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker
from web3 import Web3
from web3._utils.events import get_event_data

from app.blockchain.client import ChainClient
from app.models import Campaign, Claim, Consent, KvState, OnchainContribution, Purchase

log = logging.getLogger("giongque.indexer")

STATE_KEY = "indexer.last_block"


def _hex(b: bytes) -> str:
    return "0x" + bytes(b).hex()


class EventIndexer:
    def __init__(
        self,
        chain: ChainClient,
        session_factory: sessionmaker[Session],
        start_block: int,
        chunk_blocks: int = 2000,
    ):
        self.chain = chain
        self.sf = session_factory
        self.start_block = start_block
        self.chunk = chunk_blocks
        self._lock = threading.Lock()
        self._last_run = 0.0
        self.on_campaign: list[Callable[[Session, int], None]] = []
        self.on_revoked: list[Callable[[int], None]] = []  # gọi SAU khi commit, ngoài transaction
        self._events = {}
        for e in chain.contract.abi:
            if e.get("type") == "event":
                sig = f"{e['name']}({','.join(i['type'] for i in e['inputs'])})"
                self._events["0x" + Web3.keccak(text=sig).hex().removeprefix("0x")] = e

    def last_block(self, s: Session) -> int:
        row = s.get(KvState, STATE_KEY)
        return int(row.value) if row else self.start_block - 1

    def sync_if_stale(self, max_age_sec: float = 2.0) -> int:
        if time.time() - self._last_run < max_age_sec:
            return 0
        return self.sync()

    def sync(self) -> int:
        """Xử lý mọi log mới. Trả về số sự kiện đã xử lý."""
        with self._lock:
            processed = 0
            revoked: list[int] = []
            head = self.chain.block_number()
            with self.sf() as s:
                frm = self.last_block(s) + 1
            while frm <= head:
                to = min(head, frm + self.chunk - 1)
                logs = self.chain.w3.eth.get_logs(
                    {"address": self.chain.address, "fromBlock": frm, "toBlock": to}
                )
                with self.sf() as s:
                    for raw in logs:
                        abi = self._events.get(_hex(raw["topics"][0]))
                        if abi is None:
                            continue
                        ev = get_event_data(self.chain.w3.codec, abi, raw)
                        rid = self._handle(s, ev)
                        if rid is not None:
                            revoked.append(rid)
                        processed += 1
                    row = s.get(KvState, STATE_KEY)
                    if row is None:
                        s.add(KvState(key=STATE_KEY, value=str(to)))
                    else:
                        row.value = str(to)
                    s.commit()
                frm = to + 1
            self._last_run = time.time()
        for rid in revoked:
            for hook in self.on_revoked:
                try:
                    hook(rid)
                except Exception:  # noqa: BLE001 - không làm hỏng vòng chỉ mục
                    log.exception("on_revoked hook lỗi cho contribution %s", rid)
        return processed

    # ------------------------------------------------------------------ xử lý từng sự kiện

    def _handle(self, s: Session, ev) -> int | None:  # noqa: ANN001, C901
        name, a = ev["event"], ev["args"]
        tx = _hex(ev["transactionHash"])
        block = int(ev["blockNumber"])
        if name == "CampaignCreated":
            cid = int(a["campaignId"])
            if s.get(Campaign, cid) is None:
                view = self.chain.campaign(cid)
                if view is None:
                    return None
                s.add(
                    Campaign(
                        id=cid,
                        creator=view.creator,
                        target_sec=view.target_sec,
                        full_price_units=str(view.full_price),
                        contributor_bps=view.contributor_bps,
                        creator_bps=view.creator_bps,
                        deadline=view.deadline,
                        prompt_set_hash=view.prompt_set_hash,
                        terms_hash=view.terms_hash,
                        metadata_uri=view.metadata_uri,
                        created_block=block,
                        tx_hash=tx,
                    )
                )
                s.flush()
                for hook in self.on_campaign:
                    hook(s, cid)
        elif name == "ConsentGiven":
            cid, who = int(a["campaignId"]), a["contributor"]
            row = s.scalar(select(Consent).where(Consent.campaign_id == cid, Consent.address == who))
            if row is None:
                s.add(Consent(campaign_id=cid, address=who, terms_hash=_hex(a["termsHash"]), tx_hash=tx, block=block))
            elif row.block is None:
                row.tx_hash, row.block = tx, block
        elif name == "ContributionRegistered":
            rid = int(a["contributionId"])
            if s.get(OnchainContribution, rid) is None:
                s.add(
                    OnchainContribution(
                        id=rid,
                        campaign_id=int(a["campaignId"]),
                        contributor=a["contributor"],
                        commitment=_hex(a["commitment"]),
                        duration_sec=int(a["durationSec"]),
                        seed_paid_units=str(int(a["seedPaid"])),
                        block=block,
                        tx_hash=tx,
                    )
                )
        elif name == "ConsentRevoked":
            rid = int(a["contributionId"])
            row = s.get(OnchainContribution, rid)
            if row is not None and row.revoked_at is None:
                row.revoked_at = int(a["revokedAt"])
            return rid
        elif name == "Purchased":
            if not s.scalar(select(Purchase).where(Purchase.tx_hash == tx, Purchase.log_index == ev["logIndex"])):
                s.add(
                    Purchase(
                        campaign_id=int(a["campaignId"]),
                        buyer=a["buyer"],
                        price_units=str(int(a["price"])),
                        progress_bps=int(a["progressBps"]),
                        block=block,
                        tx_hash=tx,
                        log_index=int(ev["logIndex"]),
                    )
                )
        elif name == "Claimed":
            if not s.scalar(select(Claim).where(Claim.tx_hash == tx, Claim.log_index == ev["logIndex"])):
                s.add(
                    Claim(
                        campaign_id=int(a["campaignId"]),
                        contributor=a["contributor"],
                        amount_units=str(int(a["amount"])),
                        fee_units=str(int(a["fee"])),
                        block=block,
                        tx_hash=tx,
                        log_index=int(ev["logIndex"]),
                    )
                )
        return None
