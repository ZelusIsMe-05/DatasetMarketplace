"""Tích hợp: API thật + Anvil thật + contract thật + QC thật. Bao phủ toàn bộ nghiệp vụ §6 và endpoint §11."""
from __future__ import annotations

import io
import json
import time
import zipfile
from pathlib import Path

import pytest
import soundfile as sf

from app.blockchain.eip712 import sign_text, sign_typed
from app.services import merkle
from tests.integration.conftest import ADDR, KEYS, send

pytestmark = [pytest.mark.integration, pytest.mark.qc]
FIX = Path(__file__).resolve().parents[1] / "fixtures" / "audio"
SEED = Path(__file__).resolve().parents[3] / "seed" / "demo-campaign"
MAN = {m["file"]: m for m in json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))}
SPEC_ENDPOINTS = [
    ("post", "/auth/google"), ("get", "/fx"), ("get", "/campaigns"), ("get", "/campaigns/{campaign_id}"),
    ("get", "/campaigns/{campaign_id}/terms"), ("post", "/consent"), ("post", "/campaigns/{campaign_id}/prompt"),
    ("post", "/contributions"), ("get", "/me/contributions"), ("get", "/me/claim-quote"), ("post", "/claim"),
    ("post", "/revoke"), ("post", "/datasets/{campaign_id}/download"), ("post", "/demo/faucet"),
    ("post", "/admin/snapshot/{campaign_id}"), ("get", "/admin/review"),
]
ADMIN = {"X-Admin-Key": "test-admin"}
_tokens: dict[str, str] = {}


def ok(r):  # noqa: ANN001, ANN201
    assert r.status_code < 400, r.text
    return r.json()


def login(client, who: str) -> dict:  # noqa: ANN001
    if who not in _tokens:
        ch = ok(client.get("/auth/challenge", params={"address": ADDR[who]}))
        res = ok(client.post("/auth/dev-login", json={"email": f"{who}@test.vn", "address": ADDR[who],
                                                      "nonce": ch["nonce"], "signature": sign_text(KEYS[who], ch["message"])}))
        _tokens[who] = res["access_token"]
    return {"Authorization": f"Bearer {_tokens[who]}"}


def create_campaign(client, chain, target_sec: int = 30, seed_vnd: int = 0) -> int:  # noqa: ANN001
    req = {"name": "Chiến dịch test", "description": "Chiến dịch dùng cho test tích hợp.", "purpose": "kiểm thử",
           "prompts": (SEED / "prompts.txt").read_text(encoding="utf-8").splitlines(),
           "terms_text": (SEED / "terms.md").read_text(encoding="utf-8"), "target_sec": target_sec,
           "full_price_vnd": 26_000_000, "seed_vnd": seed_vnd, "seed_vnd_per_minute": 13_000 if seed_vnd else 0}
    d = ok(client.post("/campaigns/drafts", json=req, headers=login(client, "creator")))
    a = d["create_campaign_args"]
    w3, vc, tok = chain["w3"], chain["vc_c"], chain["token_c"]
    if a["seedAmount"]:
        send(w3, KEYS["deployer"], tok.functions.mint(ADDR["creator"], a["seedAmount"]))
        send(w3, KEYS["creator"], tok.functions.approve(vc.address, a["seedAmount"]))
    r = send(w3, KEYS["creator"], vc.functions.createCampaign(
        a["targetSec"], a["fullPrice"], a["contributorBps"], a["creatorBps"], a["deadline"],
        bytes.fromhex(a["promptSetHash"][2:]), bytes.fromhex(a["termsHash"][2:]), a["metadataURI"],
        a["seedRatePerSec"], a["seedAmount"]))
    cid = vc.events.CampaignCreated().process_receipt(r)[0]["args"]["campaignId"]
    ok(client.post("/campaigns/sync"))
    return int(cid)


def consent(client, who: str, cid: int) -> dict:  # noqa: ANN001
    h = login(client, who)
    td = ok(client.get("/consent/typed-data", params={"campaign_id": cid}, headers=h))
    return ok(client.post("/consent", headers=h, json={"campaign_id": cid, "deadline": td["deadline"],
                                                       "signature": sign_typed(KEYS[who], td["typed_data"])}))


def submit(client, who: str, cid: int, fname: str, prompt_index: int, wait: bool = True):  # noqa: ANN001, ANN201
    h = login(client, who)
    p = ok(client.post(f"/campaigns/{cid}/prompt", json={"prompt_index": prompt_index}, headers=h))
    data = (FIX / fname).read_bytes()
    if wait:  # mô phỏng thời gian đọc thật (server từ chối audio dài hơn thời gian từ lúc hiện câu)
        time.sleep(max(0.0, sf.info(io.BytesIO(data)).duration - (time.time() - p["issued_at"])))
    return client.post("/contributions", headers=h, data={"token": p["token"]},
                       files={"audio": (fname, data, "audio/wav")}), p


def buy(chain, who: str, cid: int) -> int:  # noqa: ANN001
    w3, vc, tok = chain["w3"], chain["vc_c"], chain["token_c"]
    price = vc.functions.currentPrice(cid).call()
    send(w3, KEYS["deployer"], tok.functions.mint(ADDR[who], price))
    send(w3, KEYS[who], tok.functions.approve(vc.address, price))
    send(w3, KEYS[who], vc.functions.buy(cid, price))
    return price


def download(client, who: str, cid: int):  # noqa: ANN001, ANN201
    m = ok(client.get(f"/datasets/{cid}/download-message", params={"buyer": ADDR[who]}))
    return client.post(f"/datasets/{cid}/download", json={"buyer": ADDR[who], "issued_at": m["issued_at"], "nonce": m["nonce"],
                                                          "signature": sign_text(KEYS[who], m["message"])})


# ====================================================================== tests


def test_swagger_has_all_spec_endpoints(app_client):
    paths = ok(app_client.get("/openapi.json"))["paths"]
    missing = [(m, p) for m, p in SPEC_ENDPOINTS if m not in paths.get(p, {})]
    assert not missing
    assert ok(app_client.get("/health"))["status"] == "ok"
    assert ok(app_client.get("/fx"))["rate"] == 26000


def test_one_email_one_wallet(app_client):
    def dev(email, who):  # noqa: ANN001, ANN202
        ch = ok(app_client.get("/auth/challenge", params={"address": ADDR[who]}))
        return app_client.post("/auth/dev-login", json={"email": email, "address": ADDR[who], "nonce": ch["nonce"],
                                                        "signature": sign_text(KEYS[who], ch["message"])})
    assert dev("one@test.vn", "eve").status_code == 200
    assert dev("one@test.vn", "laby").json()["error"]["code"] == "email_bound"
    assert dev("two@test.vn", "eve").json()["error"]["code"] == "wallet_taken"
    # chữ ký challenge của ví khác bị từ chối
    ch = ok(app_client.get("/auth/challenge", params={"address": ADDR["laby"]}))
    r = app_client.post("/auth/dev-login", json={"email": "x@test.vn", "address": ADDR["laby"], "nonce": ch["nonce"],
                                                 "signature": sign_text(KEYS["eve"], ch["message"])})
    assert r.status_code == 401
    assert app_client.get("/me/contributions").status_code == 401


def test_full_business_flow(app_client, chain):  # noqa: PLR0915
    c, vc = app_client, chain["vc_c"]
    cid = create_campaign(c, chain, target_sec=30, seed_vnd=260_000)
    det = ok(c.get(f"/campaigns/{cid}"))
    assert det["metadata_verified"] and det["price"]["units"] == 300_000_000
    assert ok(c.get(f"/campaigns/{cid}/terms"))["matches"]

    # đồng thuận: chữ ký sai người ký bị từ chối, đúng thì relayer gửi; người dùng không tốn gas
    h = login(c, "an")
    td = ok(c.get("/consent/typed-data", params={"campaign_id": cid}, headers=h))
    bad = c.post("/consent", headers=h, json={"campaign_id": cid, "deadline": td["deadline"],
                                              "signature": sign_typed(KEYS["eve"], td["typed_data"])})
    assert bad.status_code == 401
    bal = chain["w3"].eth.get_balance(ADDR["an"])
    assert consent(c, "an", cid)["tx_hash"]
    assert chain["w3"].eth.get_balance(ADDR["an"]) == bal
    consent(c, "binh", cid)

    # chống audio chuẩn bị trước + token dùng một lần
    r, p = submit(c, "an", cid, "prompt00_hoaimy.wav", 0, wait=False)
    assert r.json()["error"]["code"] == "not_live"
    r2 = c.post("/contributions", headers=h, data={"token": p["token"]},
                files={"audio": ("a.wav", (FIX / "prompt00_hoaimy.wav").read_bytes(), "audio/wav")})
    assert r2.json()["error"]["code"] == "bad_prompt_token"

    # QC thật: đạt -> ghi on-chain; sai câu -> loại (không giữ audio)
    regs = {}
    for who, f in (("an", "prompt00_hoaimy.wav"), ("binh", "prompt01_namminh.wav"), ("binh", "prompt03_namminh.wav")):
        res = ok(submit(c, who, cid, f, MAN[f]["prompt_index"])[0])
        assert res["status"] == "registered", res
        assert res["seed_paid"]["units"] == res["weight_sec"] * vc.functions.getCampaign(cid).call()[11]
        regs.setdefault(who, []).append(res)
    wrong = ok(submit(c, "an", cid, "prompt02_hoaimy.wav", 9)[0])
    assert wrong["status"] == "rejected"
    total = sum(x["weight_sec"] for v in regs.values() for x in v)
    assert vc.functions.getCampaign(cid).call()[9] == total
    assert ok(c.get(f"/campaigns/{cid}/price"))["progress_bps"] == total * 10_000 // 30

    # mua -> chia doanh thu theo giây
    price = buy(chain, "labx", cid)
    ok(c.post("/campaigns/sync"))
    lic = ok(c.get(f"/campaigns/{cid}/licenses/{ADDR['labx']}"))
    assert lic["licensed"] and lic["price_paid"]["units"] == price
    mine = ok(c.get("/me/contributions", headers=login(c, "binh")))
    w_b = sum(x["weight_sec"] for x in regs["binh"])
    seed_b = sum(x["seed_paid"]["units"] for x in regs["binh"])
    pend_b = next(e for e in mine["earnings"] if e["campaign_id"] == cid)["pending"]["units"]
    assert abs(pend_b - seed_b - (price * 8000 // 10_000) * w_b // total) <= 1

    # rút qua relayer: phí 0,1 mUSDC; maxFee thấp hơn phí bị từ chối
    q = ok(c.get("/me/claim-quote", params={"campaign_id": cid}, headers=h))
    assert q["can_claim"] and q["fee"]["units"] == 100_000 and q["fee"]["vnd"] == 2600
    td = q["sign"]["typed_data"]
    low = dict(td, message=dict(td["message"], maxFee=0))
    r = c.post("/claim", headers=h, json={"campaign_id": cid, "max_fee": 0, "deadline": q["sign"]["deadline"],
                                          "signature": sign_typed(KEYS["an"], low)})
    assert r.status_code == 400
    b0 = chain["token_c"].functions.balanceOf(ADDR["an"]).call()
    cl = ok(c.post("/claim", headers=h, json={"campaign_id": cid, "max_fee": 100_000, "deadline": q["sign"]["deadline"],
                                             "signature": sign_typed(KEYS["an"], td)}))
    assert chain["token_c"].functions.balanceOf(ADDR["an"]).call() - b0 == q["pending"]["units"] - 100_000 == cl["received"]["units"]

    # snapshot + tải theo license; không có license thì 403; chữ ký dùng lại bị từ chối
    snap = ok(c.post(f"/admin/snapshot/{cid}", headers=ADMIN))
    assert c.post(f"/admin/snapshot/{cid}").status_code == 403
    assert download(c, "laby", cid).status_code == 403
    m = ok(c.get(f"/datasets/{cid}/download-message", params={"buyer": ADDR["labx"]}))
    body = {"buyer": ADDR["labx"], "issued_at": m["issued_at"], "nonce": m["nonce"], "signature": sign_text(KEYS["labx"], m["message"])}
    link = ok(c.post(f"/datasets/{cid}/download", json=body))
    assert c.post(f"/datasets/{cid}/download", json=body).status_code == 401  # chống phát lại
    z = zipfile.ZipFile(io.BytesIO(c.get(link["download_url"].replace("http://testserver", "")).content))
    man = json.loads(z.read("manifest.json"))
    root = bytes.fromhex(man["merkleRoot"][2:])
    assert man["merkleRoot"] == snap["merkle_root"] and len(man["entries"]) == 3
    for e in man["entries"]:
        leaf = merkle.leaf_hash(e["contributionId"], e["commitment"], e["path"])
        assert merkle.verify([bytes.fromhex(x[2:]) for x in e["proof"]], root, leaf)
    ev = vc.events.SnapshotPublished().get_logs(from_block=0, argument_filters={"campaignId": cid})
    assert "0x" + ev[-1]["args"]["merkleRoot"].hex() == snap["merkle_root"]

    # thu hồi qua relayer: tiền đã rút giữ nguyên, audio + salt bị xóa, phiên bản mới loại bản ghi
    an_reg = regs["an"][0]
    cont = c.container
    with cont.sf() as s:
        from app.repositories.queries import ContributionRepo

        path = ContributionRepo.by_onchain_id(s, an_reg["onchain_id"]).audio_path
    assert cont.storage.exists(path)
    tdr = ok(c.get("/revoke/typed-data", params={"contribution_id": an_reg["onchain_id"]}, headers=h))
    assert c.get("/revoke/typed-data", params={"contribution_id": an_reg["onchain_id"]},
                 headers=login(c, "binh")).status_code == 403  # không phải chủ bản ghi
    rv = ok(c.post("/revoke", headers=h, json={"contribution_id": an_reg["onchain_id"], "deadline": tdr["deadline"],
                                               "signature": sign_typed(KEYS["an"], tdr["typed_data"])}))
    assert rv["audio_deleted"] and not cont.storage.exists(path)
    with cont.sf() as s:
        row = ContributionRepo.by_onchain_id(s, an_reg["onchain_id"])
        assert row.salt_hex is None and row.audio_sha256 is None and row.status == "revoked"
    assert rv["new_progress_bps"] < ok(c.get(f"/campaigns/{cid}/licenses/{ADDR['labx']}"))["progress_bps_at_purchase"]
    assert chain["token_c"].functions.balanceOf(ADDR["an"]).call() - b0 == cl["received"]["units"]
    assert rv["new_snapshot_version"] == snap["version"] + 1
    assert c.get(link["download_url"].replace("http://testserver", "")).status_code == 410
    link2 = ok(download(c, "labx", cid))
    z2 = zipfile.ZipFile(io.BytesIO(c.get(link2["download_url"].replace("http://testserver", "")).content))
    ids2 = [e["contributionId"] for e in json.loads(z2.read("manifest.json"))["entries"]]
    assert an_reg["onchain_id"] not in ids2 and len(ids2) == 2

    # lần bán sau: An không được chia
    buy(chain, "laby", cid)
    assert vc.functions.pendingReward(cid, ADDR["an"]).call() == 0
    rev = ok(c.get(f"/campaigns/{cid}/revenue"))
    assert rev["sales"] == 2


def test_direct_onchain_revoke_also_purges(app_client, chain):
    """Người dùng tự gọi revoke() (tự trả gas) — indexer vẫn xóa audio + salt."""
    c = app_client
    cid = create_campaign(c, chain, target_sec=100)
    consent(c, "binh", cid)
    res = ok(submit(c, "binh", cid, "prompt05_namminh.wav", 5)[0])
    assert res["status"] == "registered"
    with c.container.sf() as s:
        from app.repositories.queries import ContributionRepo

        path = ContributionRepo.by_onchain_id(s, res["onchain_id"]).audio_path
    send(chain["w3"], KEYS["binh"], chain["vc_c"].functions.revoke(res["onchain_id"]))
    ok(c.post("/campaigns/sync"))
    assert not c.container.storage.exists(path)


def test_gray_queue_admin_approve(app_client, chain):
    """Vùng xám -> hàng chờ -> admin duyệt -> ghi on-chain. (Nâng ngưỡng 'đạt' để buộc kết quả xám; inference vẫn thật.)"""
    c = app_client
    cid = create_campaign(c, chain, target_sec=100)
    consent(c, "an", cid)
    th = c.container.qc.get().th
    old = th.min_align_pass
    th.min_align_pass = 1.01
    try:
        res = ok(submit(c, "an", cid, "prompt06_hoaimy.wav", 6)[0])
    finally:
        th.min_align_pass = old
    assert res["status"] == "gray" and res["onchain_id"] is None
    queue = ok(c.get("/admin/review", headers=ADMIN))
    assert any(i["id"] == res["id"] for i in queue)
    assert c.get(f"/admin/review/{res['id']}/audio", headers=ADMIN).content[:4] == b"RIFF"
    approved = ok(c.post(f"/admin/review/{res['id']}", headers=ADMIN, json={"decision": "approve"}))
    assert approved["status"] == "registered" and approved["onchain_id"] is not None


def test_faucet_and_relayer_status(app_client):
    r = ok(app_client.post("/demo/faucet", json={"address": ADDR["eve"], "amount_usdc": 10}))
    assert r["minted"]["units"] == 10 * 10**6
    assert app_client.post("/demo/faucet", json={"address": ADDR["eve"], "amount_usdc": 10**9}).status_code == 400
    st = ok(app_client.get("/admin/relayer", headers=ADMIN))
    assert st["qc_oracle_matches"] and not st["low_balance"]


def test_mainnet_profile_hides_mock_and_dev_routes(app_client):
    """Cùng container, hồ sơ mainnet: /demo/faucet và /auth/dev-login không tồn tại (404)."""
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from app.core.config import PROFILES
    from app.main import create_app

    s = replace(app_client.container.settings, network=PROFILES["mainnet"], dev_auth_enabled=False, indexer_interval_sec=0)
    with TestClient(create_app(s, container=app_client.container)) as mc:
        assert mc.post("/demo/faucet", json={"address": ADDR["eve"]}).status_code == 404
        assert mc.post("/auth/dev-login", json={}).status_code == 404
        assert mc.get("/fx").status_code == 200


def test_rate_limit_returns_consistent_429(app_client):
    """Rate limit theo tài khoản/IP (§11): vượt giới hạn => 429 với định dạng lỗi chung."""
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from app.core import ratelimit
    from app.main import create_app

    s = replace(app_client.container.settings, rate_limit_enabled=True, rate_limit_faucet="2/minute", indexer_interval_sec=0)
    try:
        with TestClient(create_app(s, container=app_client.container)) as rc:
            codes = [rc.post("/demo/faucet", json={"address": ADDR["eve"], "amount_usdc": 1}).status_code for _ in range(3)]
            assert codes[:2] == [200, 200] and codes[2] == 429
            assert rc.post("/demo/faucet", json={"address": ADDR["eve"], "amount_usdc": 1}).json()["error"]["code"] == "rate_limited"
    finally:
        ratelimit.limiter.enabled = False
        ratelimit.LIMITS["faucet"] = "200/hour"
        ratelimit.limiter.reset()
