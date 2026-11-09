"""Tích hợp: nền tảng trả phí mạng hộ người tạo + người mua (implementation-plan §3 #25).

API thật + Anvil thật + contract thật + QC thật. Người dùng chỉ ký (EIP-712 + permit EIP-2612), số dư ETH không đổi;
phí xử lý (0,5 mUSDC ≈ 13.000 ₫ tạo/mua; 0,1 mUSDC ≈ 2.600 ₫ rút) vào feeCollector trong cùng giao dịch.
File này chạy SAU test_api_flow (thứ tự tên file) vì bước cuối tua thời gian chain qua hạn chiến dịch.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.blockchain.eip712 import sign_typed
from tests.integration.conftest import ADDR, KEYS, send
from tests.integration.test_api_flow import MAN, consent, login, ok, submit

pytestmark = [pytest.mark.integration, pytest.mark.qc]
SEED = Path(__file__).resolve().parents[3] / "seed" / "demo-campaign"
CREATE_FEE, WITHDRAW_FEE = 500_000, 100_000


def _draft(client, seed_vnd: int) -> dict:  # noqa: ANN001
    req = {"name": "Chiến dịch trả phí hộ", "description": "Người tạo chỉ ký, nền tảng trả phí mạng.", "purpose": "kiểm thử",
           "prompts": (SEED / "prompts.txt").read_text(encoding="utf-8").splitlines(),
           "terms_text": (SEED / "terms.md").read_text(encoding="utf-8"), "target_sec": 30,
           "full_price_vnd": 2_600_000, "seed_vnd": seed_vnd, "seed_vnd_per_minute": 13_000 if seed_vnd else 0}
    return ok(client.post("/campaigns/drafts", json=req, headers=login(client, "creator")))


def _signed(who: str, q: dict, **extra) -> dict:  # noqa: ANN003
    body = {"fee": q["fee"]["units"], "deadline": q["sign"]["deadline"], "signature": sign_typed(KEYS[who], q["sign"]["typed_data"]), **extra}
    if q.get("permit"):
        p = q["permit"]
        body["permit"] = {"value": p["value"], "deadline": p["deadline"], "signature": sign_typed(KEYS[who], p["typed_data"])}
    return body


def test_sponsored_create_buy_withdraw_seed(app_client, chain):  # noqa: PLR0915
    c, w3, tok, vc = app_client, chain["w3"], chain["token_c"], chain["vc_c"]
    fee_collector = vc.functions.feeCollector().call()
    creator, buyer = ADDR["creator"], ADDR["buyer"]

    fees = ok(c.get("/fees"))
    assert fees["mode"] == "fixed" and fees["create"]["vnd"] == fees["buy"]["vnd"] == 13_000
    assert fees["withdraw"]["vnd"] == fees["claim"]["vnd"] == 2_600

    # ---------------------------------------------------------------- tạo chiến dịch: chỉ ký, không tốn ETH
    d = _draft(c, seed_vnd=260_000)
    h = login(c, "creator")
    url = f"/campaigns/drafts/{d['draft_id']}"
    q = ok(c.get(f"{url}/create-quote", headers=h))
    assert q["fee"]["units"] == CREATE_FEE and q["fee"]["vnd"] == 13_000
    assert q["amount"]["units"] == 10_000_000 and q["total"]["vnd"] == 273_000
    if not q["can_submit"]:  # ví chưa đủ mUSDC cho quỹ mồi + phí
        assert q["sign"] is None and "Số dư" in q["reason"]
        send(w3, KEYS["deployer"], tok.functions.mint(creator, 50_000_000 - tok.functions.balanceOf(creator).call()))
        q = ok(c.get(f"{url}/create-quote", headers=h))
    assert q["can_submit"] and q["permit"]["value"] == 10_500_000
    assert q["sign"]["typed_data"]["primaryType"] == "CreateCampaign"
    assert q["permit"]["typed_data"]["domain"]["name"] == "Mock USDC"

    other = c.post(f"{url}/create", headers=h, json=dict(_signed("creator", q), signature=sign_typed(KEYS["eve"], q["sign"]["typed_data"])))
    assert other.status_code == 401
    low = c.post(f"{url}/create", headers=h, json=dict(_signed("creator", q), fee=0))
    assert low.json()["error"]["code"] == "fee_changed"
    assert c.post(f"{url}/create", headers=login(c, "an"), json=_signed("creator", q)).status_code == 403

    eth0, tok0, fc0 = w3.eth.get_balance(creator), tok.functions.balanceOf(creator).call(), vc.functions.withdrawable(fee_collector).call()
    body = _signed("creator", q)
    res = ok(c.post(f"{url}/create", headers=h, json=body))
    cid = res["campaign_id"]
    assert res["fee"]["units"] == CREATE_FEE and res["amount"]["units"] == 10_000_000
    assert w3.eth.get_balance(creator) == eth0, "người tạo không tốn gas"
    assert tok0 - tok.functions.balanceOf(creator).call() == 10_500_000
    assert vc.functions.withdrawable(fee_collector).call() - fc0 == CREATE_FEE
    det = ok(c.get(f"/campaigns/{cid}"))
    assert det["metadata_verified"] and det["creator"] == creator and det["seed_balance"]["units"] == 10_000_000
    assert c.post(f"{url}/create", headers=h, json=body).status_code == 409  # nháp đã dùng

    # ---------------------------------------------------------------- có bản ghi (QC thật) rồi mới bán được
    bq = ok(c.get(f"/campaigns/{cid}/buy-quote", params={"buyer": buyer}))
    assert not bq["can_submit"] and "tiến độ 0" in bq["reason"]
    consent(c, "an", cid)
    f = "prompt00_hoaimy.wav"
    assert ok(submit(c, "an", cid, f, MAN[f]["prompt_index"])[0])["status"] == "registered"

    # ---------------------------------------------------------------- mua: không cần đăng nhập, không tốn ETH
    tb = tok.functions.balanceOf(buyer).call()
    if tb:
        send(w3, KEYS["buyer"], tok.functions.transfer(ADDR["deployer"], tb))
    bq = ok(c.get(f"/campaigns/{cid}/buy-quote", params={"buyer": buyer}))
    assert not bq["can_submit"] and "Số dư" in bq["reason"]
    ok(c.post("/demo/faucet", json={"address": buyer, "amount_usdc": 2000}))
    bq = ok(c.get(f"/campaigns/{cid}/buy-quote", params={"buyer": buyer}))
    price = bq["amount"]["units"]
    assert bq["can_submit"] and bq["total"]["units"] == price + CREATE_FEE and bq["permit"]["value"] == price + CREATE_FEE
    eth_b, cw0, fc1 = w3.eth.get_balance(buyer), vc.functions.withdrawable(creator).call(), vc.functions.withdrawable(fee_collector).call()
    br = ok(c.post(f"/campaigns/{cid}/buy", json=_signed("buyer", bq, buyer=buyer, max_price=price)))
    assert br["amount"]["units"] == price and br["fee"]["units"] == CREATE_FEE
    assert w3.eth.get_balance(buyer) == eth_b, "người mua không tốn gas"
    assert tok.functions.balanceOf(buyer).call() == 2_000_000_000 - price - CREATE_FEE
    assert ok(c.get(f"/campaigns/{cid}/licenses/{buyer}"))["licensed"]
    assert vc.functions.withdrawable(creator).call() - cw0 == price * 1_000 // 10_000, "phí không tính vào doanh thu"
    assert vc.functions.withdrawable(fee_collector).call() - fc1 >= CREATE_FEE
    again = ok(c.get(f"/campaigns/{cid}/buy-quote", params={"buyer": buyer}))
    assert not again["can_submit"] and "license" in again["reason"]

    # ---------------------------------------------------------------- người tạo rút doanh thu: chỉ ký
    wq = ok(c.get("/creator/withdraw-quote", params={"address": creator}))
    assert wq["can_submit"] and wq["fee"]["units"] == WITHDRAW_FEE and wq["total"]["units"] == wq["amount"]["units"] - WITHDRAW_FEE
    t0 = tok.functions.balanceOf(creator).call()
    wr = ok(c.post("/creator/withdraw", json=_signed("creator", wq, account=creator)))
    assert tok.functions.balanceOf(creator).call() - t0 == wq["total"]["units"] == wr["amount"]["units"]
    assert vc.functions.withdrawable(creator).call() == 0 and w3.eth.get_balance(creator) == eth0
    empty = ok(c.get("/creator/withdraw-quote", params={"address": creator}))
    assert not empty["can_submit"] and empty["sign"] is None

    # ---------------------------------------------------------------- rút quỹ mồi còn dư: chỉ sau hạn chiến dịch
    sq = ok(c.get(f"/campaigns/{cid}/seed-withdraw-quote"))
    assert not sq["can_submit"] and "hết hạn" in sq["reason"]
    w3.provider.make_request("evm_increaseTime", [31 * 86_400])
    w3.provider.make_request("evm_mine", [])
    sq = ok(c.get(f"/campaigns/{cid}/seed-withdraw-quote"))
    assert sq["can_submit"] and sq["payer"] == creator
    seed_left, t1 = sq["amount"]["units"], tok.functions.balanceOf(creator).call()
    bad = c.post(f"/campaigns/{cid}/withdraw-seed", json=dict(_signed("creator", sq), signature=sign_typed(KEYS["an"], sq["sign"]["typed_data"])))
    assert bad.status_code == 401
    ok(c.post(f"/campaigns/{cid}/withdraw-seed", json=_signed("creator", sq)))
    assert tok.functions.balanceOf(creator).call() - t1 == seed_left - WITHDRAW_FEE
    assert vc.functions.getCampaign(cid).call()[12] == 0
    assert w3.eth.get_balance(creator) == eth0
