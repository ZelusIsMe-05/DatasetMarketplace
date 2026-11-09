"""Dataset: phiên bản + Merkle root (§6.6, §7.5), tải theo license, xóa dữ liệu khi thu hồi (§6.8).

- Zip được dựng lúc tải từ manifest của phiên bản; không lưu bản sao audio nào khác ngoài kho riêng tư,
  nên xóa audio khi thu hồi là xóa thật.
- Phiên bản dataset thuộc quyền CHỦ CHIẾN DỊCH (§3 #28): chỉ chủ chiến dịch công bố, bằng chữ ký PublishSnapshot
  (relayer gửi hộ). Nền tảng không tự công bố phiên bản nào.
- Thu hồi: audio + salt bị xóa ngay và mọi phiên bản chứa bản ghi đó bị đánh dấu `stale` (không phục vụ nữa) — đó là
  quyền của người đóng góp. Người mua tải lại được khi chủ chiến dịch ký công bố phiên bản mới.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import secrets
import time
import zipfile
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from web3 import Web3

from app.blockchain.client import CampaignView, ChainClient
from app.blockchain.eip712 import publish_snapshot_message, recover_text, recover_typed, typed_data
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer
from app.core.config import Settings
from app.core.errors import BadRequest, Conflict, Forbidden, Gone, NotFound, Unauthorized
from app.core.security import TokenError, sign_token, verify_token
from app.models import ContributionStatus, OnchainContribution, Prompt, Snapshot, UsedSignature, User
from app.repositories.queries import CampaignRepo, ContributionRepo, SnapshotRepo
from app.schemas.common import TypedDataResponse
from app.schemas.dataset import DownloadMessage, DownloadResponse, SnapshotResponse
from app.schemas.review import SnapshotPublishRequest, SnapshotQuote
from app.services import merkle
from app.services.campaign_service import SAMPLE_COUNT
from app.services.consent_service import MAX_DEADLINE_SEC, SIGNATURE_WINDOW_SEC
from app.services.fx_service import FxService
from app.services.storage import AudioStorage

log = logging.getLogger("datasetmarketplace.datasets")
DOWNLOAD_PURPOSE = "download"


def download_message(campaign_id: int, buyer: str, issued_at: int, nonce: str) -> str:
    return (
        "Dataset Marketplace – yêu cầu tải dataset\n"
        f"Chiến dịch: {campaign_id}\n"
        f"Ví: {buyer}\n"
        f"Thời điểm: {issued_at}\n"
        f"Nonce: {nonce}"
    )


def snapshot_response(snap: Snapshot) -> SnapshotResponse:
    return SnapshotResponse(
        campaign_id=snap.campaign_id, version=snap.version, merkle_root=snap.merkle_root, uri=snap.uri,
        leaf_count=snap.leaf_count, total_sec=snap.total_sec, tx_hash=snap.tx_hash, status=snap.status,
    )


class DatasetService:
    def __init__(
        self,
        settings: Settings,
        sf: sessionmaker[Session],
        chain: ChainClient,
        qc_signer: Relayer,
        indexer: EventIndexer,
        storage: AudioStorage,
        fx: FxService,
    ):
        self.settings, self.sf, self.chain, self.qc_signer = settings, sf, chain, qc_signer
        self.indexer, self.storage, self.fx = indexer, storage, fx
        indexer.on_revoked.append(self.purge_revoked)

    # ------------------------------------------------------------------ phiên bản

    def _owner_view(self, user: User, campaign_id: int) -> CampaignView:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        if view.creator.lower() != user.wallet_address.lower():
            raise Forbidden("Chỉ chủ chiến dịch được công bố phiên bản dữ liệu của chiến dịch này", code="not_creator")
        return view

    def _build(self, campaign_id: int) -> dict:
        """Đóng gói (chưa công bố) mọi bản ghi còn hiệu lực — tất định theo contributionId để báo giá và lúc gửi khớp nhau."""
        self.indexer.sync()
        with self.sf() as s:
            entries = []
            for c in ContributionRepo.active_registered(s, campaign_id):
                oc = s.get(OnchainContribution, c.onchain_id)
                if oc is None or oc.revoked_at is not None or not self.storage.exists(c.audio_path):
                    continue
                entries.append(
                    {
                        "contributionId": c.onchain_id,
                        "commitment": c.commitment,
                        "path": f"audio/{c.onchain_id}.wav",
                        "durationSec": oc.duration_sec,
                        "transcript": s.get(Prompt, c.prompt_id).text,
                        "sha256": c.audio_sha256,
                    }
                )
            if not entries:
                raise BadRequest("Chưa có bản ghi hợp lệ nào để đóng gói", code="no_contributions")
            latest = SnapshotRepo.latest(s, campaign_id)
            latest_info = (latest.version, latest.status, latest.merkle_root) if latest else None
        entries.sort(key=lambda e: e["contributionId"])
        version = (latest_info[0] if latest_info else 0) + 1
        leaves = [merkle.leaf_hash(e["contributionId"], e["commitment"], e["path"]) for e in entries]
        root = merkle.root(leaves)
        for e, leaf in zip(entries, leaves):
            e["leaf"] = "0x" + leaf.hex()
            e["proof"] = ["0x" + p.hex() for p in merkle.proof(leaves, leaf)]
        uri = f"{self.settings.api_public_url}/datasets/{campaign_id}/snapshots/{version}"
        return {"entries": entries, "root": root, "root_hex": "0x" + root.hex(), "version": version, "uri": uri,
                "latest": latest_info}

    @staticmethod
    def _changed(b: dict) -> bool:
        latest = b["latest"]
        return latest is None or latest[1] != "published" or latest[2] != b["root_hex"]

    def snapshot_quote(self, user: User, campaign_id: int) -> SnapshotQuote:
        """Bản tóm tắt phiên bản sắp công bố + dữ liệu PublishSnapshot để CHỦ CHIẾN DỊCH ký (§3 #28)."""
        view = self._owner_view(user, campaign_id)
        b = self._build(campaign_id)
        nonce = self.chain.nonce_of(view.creator)
        deadline = self.chain.block_timestamp() + SIGNATURE_WINDOW_SEC
        msg = publish_snapshot_message(campaign_id, b["root_hex"], b["uri"], nonce, deadline)
        latest = b["latest"]
        return SnapshotQuote(
            campaign_id=campaign_id,
            version=b["version"],
            leaf_count=len(b["entries"]),
            total_sec=sum(e["durationSec"] for e in b["entries"]),
            merkle_root=b["root_hex"],
            uri=b["uri"],
            latest_version=latest[0] if latest else None,
            latest_status=latest[1] if latest else None,
            changed=self._changed(b),
            sign=TypedDataResponse(
                typed_data=typed_data(self.chain.domain(), "PublishSnapshot", msg), nonce=nonce, deadline=deadline
            ),
        )

    def publish_signed(self, user: User, campaign_id: int, body: SnapshotPublishRequest) -> SnapshotResponse:
        """Chủ chiến dịch đã ký PublishSnapshot ⇒ relayer gọi publishSnapshotWithSig (nền tảng trả phí mạng)."""
        view = self._owner_view(user, campaign_id)
        now = self.chain.block_timestamp()
        if body.deadline <= now or body.deadline > now + MAX_DEADLINE_SEC:
            raise BadRequest("Chữ ký đã hết hạn hoặc hạn ký không hợp lệ — hãy ký lại", code="Expired")
        b = self._build(campaign_id)
        if body.merkle_root.lower() != b["root_hex"]:
            raise Conflict("Dữ liệu vừa thay đổi (có bản ghi mới hoặc bị thu hồi) — hãy xem lại bản tóm tắt rồi ký lại",
                           code="snapshot_changed")
        if not self._changed(b):
            raise Conflict("Phiên bản đang công bố đã đúng dữ liệu mới nhất", code="snapshot_unchanged")
        nonce = self.chain.nonce_of(view.creator)
        msg = publish_snapshot_message(campaign_id, b["root_hex"], b["uri"], nonce, body.deadline)
        try:
            signer = recover_typed(typed_data(self.chain.domain(), "PublishSnapshot", msg), body.signature)
        except Exception as e:  # noqa: BLE001
            raise Unauthorized("Chữ ký không đúng định dạng") from e
        if signer != view.creator:
            raise Unauthorized("Chữ ký công bố không phải của chủ chiến dịch")
        res = self.qc_signer.send(
            self.chain.contract.functions.publishSnapshotWithSig(
                campaign_id, b["root"], b["uri"], body.deadline, bytes.fromhex(body.signature.removeprefix("0x"))
            ),
            kind="snapshot",
            meta={"campaign_id": campaign_id, "version": b["version"], "creator": view.creator},
        )
        manifest = {
            "campaignId": campaign_id,
            "version": b["version"],
            "merkleRoot": b["root_hex"],
            "uri": b["uri"],
            "chainId": self.chain.chain_id,
            "contract": self.chain.address,
            "publishTx": res.tx_hash,
            "publishedBy": view.creator,
            "leafEncoding": "keccak256(keccak256(abi.encode(uint256 contributionId, bytes32 commitment, string path)))",
            "nodeHashing": "keccak256(sorted(a, b)) — tương thích OpenZeppelin MerkleProof.verify",
            "createdAt": int(time.time()),
            "entries": b["entries"],
        }
        with self.sf() as s:
            for old in SnapshotRepo.published(s, campaign_id):
                old.status = "superseded"
            snap = Snapshot(
                campaign_id=campaign_id, version=b["version"], merkle_root=b["root_hex"], uri=b["uri"],
                manifest_json=json.dumps(manifest, ensure_ascii=False), leaf_count=len(b["entries"]),
                total_sec=sum(e["durationSec"] for e in b["entries"]), status="published", tx_hash=res.tx_hash,
            )
            s.add(snap)
            s.commit()
            return snapshot_response(snap)

    def get_manifest(self, campaign_id: int, version: int) -> dict:
        with self.sf() as s:
            snap = s.query(Snapshot).filter_by(campaign_id=campaign_id, version=version).one_or_none()
            if snap is None:
                raise NotFound("Không có phiên bản này")
            m = json.loads(snap.manifest_json)
            m["status"] = snap.status
            # Manifest công khai: không kèm transcript/sha256 (chỉ người có license nhận trong zip)
            m["entries"] = [
                {k: e[k] for k in ("contributionId", "commitment", "path", "durationSec", "leaf")} for e in m["entries"]
            ]
            return m

    # ------------------------------------------------------------------ thu hồi -> xóa dữ liệu

    def purge_revoked(self, onchain_id: int) -> None:
        """Xóa audio + salt của bản ghi đã thu hồi và khóa (stale) mọi phiên bản chứa nó."""
        campaign_id = None
        stale_any = False
        with self.sf() as s:
            c = ContributionRepo.by_onchain_id(s, onchain_id)
            if c is not None and c.status != ContributionStatus.REVOKED:
                self.storage.delete(c.audio_path)
                c.audio_path, c.salt_hex, c.audio_sha256 = None, None, None
                c.status = ContributionStatus.REVOKED
                c.revoked_at = datetime.now(UTC)
                log.info("Đã xóa audio + salt của bản ghi on-chain #%s", onchain_id)
            oc = s.get(OnchainContribution, onchain_id)
            campaign_id = oc.campaign_id if oc else (c.campaign_id if c else None)
            if campaign_id is None:
                s.commit()
                return
            for snap in s.query(Snapshot).filter(
                Snapshot.campaign_id == campaign_id, Snapshot.status.in_(("published", "superseded"))
            ):
                ids = {e["contributionId"] for e in json.loads(snap.manifest_json)["entries"]}
                if onchain_id in ids:
                    snap.status = "stale"
                    snap.stale_reason = f"chứa bản ghi #{onchain_id} đã thu hồi"
                    stale_any = True
            s.commit()
        if stale_any:
            # Không tự công bố: phiên bản dataset thuộc quyền chủ chiến dịch (§3 #28).
            log.info("Chiến dịch %s cần chủ chiến dịch công bố phiên bản mới (bản ghi #%s đã thu hồi)", campaign_id, onchain_id)

    # ------------------------------------------------------------------ tải dataset theo license

    def download_message(self, campaign_id: int, buyer: str) -> DownloadMessage:
        if not Web3.is_address(buyer):
            raise BadRequest("Địa chỉ ví không hợp lệ")
        addr = Web3.to_checksum_address(buyer)
        ts = int(time.time())
        nonce = secrets.token_hex(8)  # chữ ký ECDSA tất định: cần nonce để hai yêu cầu cùng giây khác nhau
        return DownloadMessage(campaign_id=campaign_id, buyer=addr, issued_at=ts, nonce=nonce,
                               message=download_message(campaign_id, addr, ts, nonce))

    def request_download(
        self, campaign_id: int, buyer: str, issued_at: int, nonce: str, signature: str
    ) -> DownloadResponse:
        if not Web3.is_address(buyer):
            raise BadRequest("Địa chỉ ví không hợp lệ")
        addr = Web3.to_checksum_address(buyer)
        if abs(time.time() - issued_at) > self.settings.signature_max_age_sec:
            raise Unauthorized("Chữ ký đã quá hạn, hãy ký lại")
        try:
            signer = recover_text(download_message(campaign_id, addr, issued_at, nonce), signature)
        except Exception as e:  # noqa: BLE001
            raise Unauthorized("Chữ ký không đúng định dạng") from e
        if signer != addr:
            raise Unauthorized("Chữ ký không khớp ví người mua")
        lic = self.chain.license(campaign_id, addr)
        if not lic.active:
            raise Forbidden("Ví này chưa mua license của chiến dịch", code="no_license")
        with self.sf() as s:
            try:
                s.add(UsedSignature(sig_hash="0x" + hashlib.sha256(signature.lower().encode()).hexdigest(), purpose="download"))
                s.commit()
            except IntegrityError as e:
                raise Unauthorized("Chữ ký này đã được dùng") from e
            snap = SnapshotRepo.latest(s, campaign_id)
            if snap is None or snap.status != "published":
                raise Conflict("Chủ chiến dịch chưa công bố phiên bản dữ liệu hợp lệ (hoặc đang cập nhật sau khi có bản ghi bị thu hồi)", code="no_snapshot")
            tok = sign_token(
                self.settings.token_secret,
                DOWNLOAD_PURPOSE,
                {"cid": campaign_id, "buyer": addr, "v": snap.version},
                self.settings.download_token_ttl_sec,
            )
            return DownloadResponse(
                campaign_id=campaign_id,
                buyer=addr,
                download_url=f"{self.settings.api_public_url}/datasets/files/{tok.token}",
                expires_at=tok.expires_at,
                snapshot=snapshot_response(snap),
                license_price_paid=self.fx.money(lic.price_paid),
            )

    def build_zip(self, token: str) -> tuple[str, bytes]:
        try:
            body = verify_token(self.settings.token_secret, DOWNLOAD_PURPOSE, token)
        except TokenError as e:
            raise Forbidden(f"Link tải không hợp lệ: {e}") from e
        cid, buyer, version = body["cid"], body["buyer"], body["v"]
        if not self.chain.license(cid, buyer).active:
            raise Forbidden("License không còn hợp lệ")
        with self.sf() as s:
            snap = s.query(Snapshot).filter_by(campaign_id=cid, version=version).one_or_none()
            if snap is None or snap.status != "published":
                raise Gone("Phiên bản này đã cũ (có bản ghi bị thu hồi). Hãy yêu cầu link tải mới")
            manifest = json.loads(snap.manifest_json)
            draft = CampaignRepo.draft_for(s, cid)
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
                for e in manifest["entries"]:
                    c = ContributionRepo.by_onchain_id(s, e["contributionId"])
                    if c is None or c.status != ContributionStatus.REGISTERED or not self.storage.exists(c.audio_path):
                        raise Gone("Phiên bản không còn nhất quán, hãy yêu cầu link tải mới")
                    z.writestr(e["path"], self.storage.read(c.audio_path))
                manifest["licensee"] = buyer
                z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
                if draft:
                    z.writestr("LICENSE_TERMS.md", draft.terms_text)
        return f"dataset-campaign{cid}-v{version}.zip", buf.getvalue()

    # ------------------------------------------------------------------ mẫu nghe thử

    def sample_audio(self, campaign_id: int, onchain_id: int) -> bytes:
        with self.sf() as s:
            allowed = ContributionRepo.active_registered(s, campaign_id)[:SAMPLE_COUNT]
            for c in allowed:
                if c.onchain_id == onchain_id and self.storage.exists(c.audio_path):
                    return self.storage.read(c.audio_path)
        raise NotFound("Không có mẫu nghe thử này")
