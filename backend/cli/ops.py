"""Các thao tác nghiệp vụ của CLI. Mọi thao tác gọi API thật hoặc contract thật trên chain."""
from __future__ import annotations

from web3.logs import DISCARD

import hashlib
import io
import json
import os
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from app.blockchain.eip712 import sign_text, sign_typed
from app.services import merkle
from cli.api import Api, ApiError
from cli.chain import Chain
from cli.state import CliState, Wallet

BACKEND_DIR = Path(__file__).resolve().parents[1]


@dataclass
class Ctx:
    api_url: str = field(default_factory=lambda: os.environ.get("DATASETMARKETPLACE_API", "http://127.0.0.1:8000"))
    rpc_url: str = field(default_factory=lambda: os.environ.get("DATASETMARKETPLACE_RPC", "http://127.0.0.1:8386"))
    state: CliState = field(default_factory=CliState)
    _health: dict | None = None
    _chain: Chain | None = None

    # ------------------------------------------------------------------ kết nối

    def public(self) -> Api:
        return Api(self.api_url)

    def health(self) -> dict:
        if self._health is None:
            self._health = self.public().get("/health")
        return self._health

    def chain(self) -> Chain:
        if self._chain is None:
            h = self.health()
            self._chain = Chain(self.rpc_url, h["voice_campaigns"], h["token"])
        return self._chain

    def wallet(self, name: str) -> Wallet:
        try:
            return self.state.wallet(name)
        except KeyError:
            raise ApiError(0, "wallet", f"Chưa có ví '{name}'. Chạy: datasetmarketplace wallet init-local (local) hoặc wallet import") from None

    # ------------------------------------------------------------------ đăng nhập

    def _session_scope(self) -> str:
        """Phiên gắn với deployment (thư mục dữ liệu) — redeploy Anvil => DB mới => đăng nhập lại."""
        return f"{self.api_url}|{self.health()['data_dir']}"

    def login(self, name: str, email: str | None = None, force: bool = False) -> dict:
        w = self.wallet(name)
        if not force and self.state.session(name, self._session_scope()):
            return {"email": None, "wallet_address": w.address, "cached": True}
        api = self.public()
        ch = api.get("/auth/challenge", address=w.address)
        sig = sign_text(w.private_key, ch["message"])
        res = api.post(
            "/auth/dev-login",
            json={"email": email or f"{name}@datasetmarketplace.local", "address": w.address, "nonce": ch["nonce"], "signature": sig},
        )
        self.state.set_session(name, self._session_scope(), res["access_token"], res["expires_at"], res["email"])
        return res

    def user(self, name: str) -> Api:
        tok = self.state.session(name, self._session_scope())
        if tok is None:
            self.login(name)
            tok = self.state.session(name, self._session_scope())
        return Api(self.api_url, token=tok)

    # ------------------------------------------------------------------ người đóng góp

    def consent_sign(self, name: str, campaign_id: int) -> dict:
        td = self.user(name).get("/consent/typed-data", campaign_id=campaign_id)
        sig = sign_typed(self.wallet(name).private_key, td["typed_data"])
        return {"campaign_id": campaign_id, "deadline": td["deadline"], "signature": sig, "typed_data": td["typed_data"]}

    def consent_submit(self, name: str, signed: dict) -> dict:
        return self.user(name).post(
            "/consent",
            json={"campaign_id": signed["campaign_id"], "deadline": signed["deadline"], "signature": signed["signature"]},
        )

    def get_prompt(self, name: str, campaign_id: int, prompt_index: int | None = None) -> dict:
        body = {"prompt_index": prompt_index} if prompt_index is not None else None
        return self.user(name).post(f"/campaigns/{campaign_id}/prompt", json=body)

    def submit_audio(self, name: str, campaign_id: int, audio: Path, prompt_index: int | None = None) -> dict:
        """CHỈ KIỂM THỬ LOCAL: nộp file có sẵn (server vẫn áp dụng token 60 giây và kiểm tra thời lượng)."""
        p = self.get_prompt(name, campaign_id, prompt_index)
        data = audio.read_bytes()
        # Bản ghi không thể dài hơn thời gian kể từ lúc hiện câu: chờ đúng bằng thời lượng như khi đọc thật.
        dur = _wav_duration(data)
        wait = max(0.0, dur - (time.time() - p["issued_at"]))
        if wait:
            time.sleep(wait)
        res = self.user(name).post(
            "/contributions", data={"token": p["token"], "capture": "live"}, files={"audio": (audio.name, data, "audio/wav")}
        )
        res["prompt_text"] = p["text"]
        return res

    # ------------------------------------------------------------------ chủ chiến dịch (§3 #28: không có admin)

    def publish_snapshot(self, name: str, campaign_id: int) -> dict:
        """Chủ chiến dịch xem bản tóm tắt, ký PublishSnapshot bằng ví của mình; relayer gửi publishSnapshotWithSig."""
        api = self.user(name)
        q = api.get(f"/campaigns/{campaign_id}/snapshot-quote")
        sig = sign_typed(self.wallet(name).private_key, q["sign"]["typed_data"])
        res = api.post(
            f"/campaigns/{campaign_id}/snapshots",
            json={"merkle_root": q["merkle_root"], "deadline": q["sign"]["deadline"], "signature": sig},
        )
        return res | {"quote": q}

    def review_queue(self, name: str, campaign_id: int | None = None) -> list[dict]:
        params = {"campaign_id": campaign_id} if campaign_id is not None else {}
        return self.user(name).get("/creator/review", **params)

    def review_decide(self, name: str, contribution_id: int, decision: str, note: str | None = None) -> dict:
        return self.user(name).post(f"/creator/review/{contribution_id}", json={"decision": decision, "note": note})

    def claim_relayed(self, name: str, campaign_id: int) -> dict:
        api = self.user(name)
        q = api.get("/me/claim-quote", campaign_id=campaign_id)
        if not q["can_claim"]:
            raise ApiError(0, "NothingToClaim", q["reason"] or "Không có tiền để rút")
        td = q["sign"]["typed_data"]
        sig = sign_typed(self.wallet(name).private_key, td)
        return api.post(
            "/claim",
            json={"campaign_id": campaign_id, "max_fee": td["message"]["maxFee"], "deadline": q["sign"]["deadline"], "signature": sig},
        ) | {"quote": q}

    def revoke_relayed(self, name: str, onchain_id: int) -> dict:
        api = self.user(name)
        td = api.get("/revoke/typed-data", contribution_id=onchain_id)
        sig = sign_typed(self.wallet(name).private_key, td["typed_data"])
        return api.post("/revoke", json={"contribution_id": onchain_id, "deadline": td["deadline"], "signature": sig})

    # ------------------------------------------------------------------ người tạo / người mua (ví tự gửi giao dịch)

    def create_campaign(self, name: str, draft_req: dict) -> dict:
        w = self.wallet(name)
        draft = self.user(name).post("/campaigns/drafts", json=draft_req)
        a = draft["create_campaign_args"]
        ch = self.chain()
        approve_tx = ch.approve_if_needed(w.private_key, a["seedAmount"]) if a["seedAmount"] else None
        fn = ch.vc.functions.createCampaign(
            a["targetSec"], a["fullPrice"], a["contributorBps"], a["creatorBps"], a["deadline"],
            bytes.fromhex(a["promptSetHash"][2:]), bytes.fromhex(a["termsHash"][2:]), a["metadataURI"],
            a["seedRatePerSec"], a["seedAmount"],
        )
        out = ch.send(w.private_key, fn)
        ev = ch.vc.events.CampaignCreated().process_receipt(out.receipt, errors=DISCARD)[0]["args"]
        self.public().post("/campaigns/sync")
        return {"campaign_id": int(ev["campaignId"]), "tx_hash": out.tx_hash, "approve_tx": approve_tx, "draft": draft}

    def buy(self, name: str, campaign_id: int, max_price_units: int | None = None) -> dict:
        w = self.wallet(name)
        quote = self.public().get(f"/campaigns/{campaign_id}/price")
        if not quote["can_buy"]:
            raise ApiError(0, "NothingToSell", quote["reason"])
        max_price = max_price_units if max_price_units is not None else quote["price"]["units"]
        ch = self.chain()
        approve_tx = ch.approve_if_needed(w.private_key, max_price)
        out = ch.send(w.private_key, ch.vc.functions.buy(campaign_id, max_price))
        ev = ch.vc.events.Purchased().process_receipt(out.receipt, errors=DISCARD)[0]["args"]
        self.public().post("/campaigns/sync")
        return {"tx_hash": out.tx_hash, "approve_tx": approve_tx, "price_units": int(ev["price"]),
                "progress_bps": int(ev["progressBps"]), "quote": quote}

    def withdraw(self, name: str) -> dict:
        w = self.wallet(name)
        ch = self.chain()
        amount = int(ch.vc.functions.withdrawable(w.address).call())
        if amount == 0:
            return {"amount_units": 0, "tx_hash": None}
        out = ch.send(w.private_key, ch.vc.functions.withdraw())
        return {"amount_units": amount, "tx_hash": out.tx_hash}

    # ------------------------------------------------------------------ dataset

    def download(self, name: str, campaign_id: int, out_path: Path | None) -> dict:
        w = self.wallet(name)
        api = self.public()
        msg = api.get(f"/datasets/{campaign_id}/download-message", buyer=w.address)
        sig = sign_text(w.private_key, msg["message"])
        link = api.post(
            f"/datasets/{campaign_id}/download", json={"buyer": w.address, "issued_at": msg["issued_at"], "nonce": msg["nonce"], "signature": sig}
        )
        data = api.get_url(link["download_url"]).content
        if out_path:
            out_path.write_bytes(data)
        verify = self.verify_zip(data, campaign_id)
        return {"link": link, "bytes": len(data), "verify": verify, "zip": data}

    def verify_zip(self, data: bytes, campaign_id: int) -> dict:
        """Kiểm tra: mọi lá khớp audio + proof về đúng root; root khớp sự kiện SnapshotPublished on-chain."""
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            m = json.loads(z.read("manifest.json"))
            root = bytes.fromhex(m["merkleRoot"][2:])
            bad = []
            for e in m["entries"]:
                leaf = merkle.leaf_hash(e["contributionId"], e["commitment"], e["path"])
                if "0x" + leaf.hex() != e["leaf"] or not merkle.verify([bytes.fromhex(p[2:]) for p in e["proof"]], root, leaf):
                    bad.append(e["contributionId"])
                if hashlib.sha256(z.read(e["path"])).hexdigest() != e["sha256"]:
                    bad.append(e["contributionId"])
        events = self.chain().snapshot_events(campaign_id)
        onchain = any(ev["merkleRoot"] == m["merkleRoot"] and ev["uri"] == m["uri"] for ev in events)
        return {
            "version": m["version"],
            "merkle_root": m["merkleRoot"],
            "entries": [e["contributionId"] for e in m["entries"]],
            "total_sec": sum(e["durationSec"] for e in m["entries"]),
            "proofs_ok": not bad,
            "root_on_chain": onchain,
        }


def _wav_duration(data: bytes) -> float:
    try:
        import soundfile as sf

        info = sf.info(io.BytesIO(data))
        return float(info.frames) / float(info.samplerate)
    except Exception:  # noqa: BLE001 - định dạng khác wav: để server tự kiểm tra
        return 0.0
