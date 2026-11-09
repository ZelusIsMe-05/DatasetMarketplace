"""Kịch bản demo chạy bằng terminal. Mọi bước gọi backend thật / contract thật; mỗi bước có kiểm tra (check)."""
from __future__ import annotations

from web3.logs import DISCARD

import json
import os
import time
from pathlib import Path

from cli import ui
from cli.api import ApiError
from cli.chain import TxError
from cli.ops import Ctx

FIXTURES = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "audio"
SEED = Path(__file__).resolve().parents[2] / "seed" / "demo-campaign"
BPS = 10_000


class Checks:
    def __init__(self) -> None:
        self.results: list[tuple[str, bool, str]] = []

    def check(self, name: str, cond: bool, detail: str = "") -> bool:
        self.results.append((name, bool(cond), detail))
        (ui.ok if cond else ui.fail)(f"{name}{(' — ' + detail) if detail else ''}")
        return bool(cond)

    def summary(self) -> int:
        failed = [r for r in self.results if not r[1]]
        ui.table("Kết quả kiểm tra", ["#", "Kiểm tra", "Kết quả"], [
            [i + 1, n, "[green]ĐẠT[/]" if okk else "[red]TRƯỢT[/]"] for i, (n, okk, _) in enumerate(self.results)
        ])
        (ui.ok if not failed else ui.fail)(f"{len(self.results) - len(failed)}/{len(self.results)} kiểm tra đạt")
        return 0 if not failed else 1


def _vnd(units: int, rate: float) -> str:
    return f"≈ {round(units / 1e6 * rate):,} ₫".replace(",", ".")


def _expect_error(fn, code: str | None = None, status: int | None = None) -> Exception | None:  # noqa: ANN001
    """Chạy fn và trả lỗi nếu đúng loại mong đợi (ApiError từ backend hoặc TxError từ contract)."""
    try:
        fn()
    except ApiError as e:
        if (code is None or e.code == code) and (status is None or e.status == status):
            return e
        raise
    except TxError as e:
        if code is None or code in str(e):
            return e
        raise
    return None


def _price(full: int, progress_bps: int) -> int:
    return full * (3000 + (BPS - 3000) * progress_bps // BPS) // BPS


def run_e2e(ctx: Ctx, target_sec: int = 30) -> int:  # noqa: C901, PLR0915
    ck = Checks()
    h = ctx.health()
    ui.info(f"[bold]Demo end-to-end[/] — {h['network']} chain {h['chain_id']}, contract {h['voice_campaigns']}")
    if not ck.check("Backend chạy ở NETWORK=local với chế độ dev", h["network"] == "local" and h["dev_mode"]):
        return ck.summary()
    ctx.state.init_local()
    rate = ctx.public().get("/fx")["rate"]
    manifest = {m["file"]: m for m in json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))}
    ch = ctx.chain()

    # 1) Tiền demo cho người tạo và hai lab (faucet chỉ có ở local/Fuji)
    for who, amt in (("creator", 100), ("labx", 2000), ("laby", 2000)):
        ctx.public().post("/demo/faucet", json={"address": ctx.wallet(who).address, "amount_usdc": amt})
    ck.check("Faucet mUSDC cho người tạo + 2 người mua", ch.token_balance(ctx.wallet("labx").address) >= 2000e6)

    # 2) Người tạo soạn nháp + tự gửi createCampaign (kèm quỹ mồi 260.000 ₫, 13.000 ₫/phút)
    req = {
        "name": "TổngĐài AI – giọng miền Trung (demo e2e)",
        "description": "Chiến dịch demo end-to-end: audio thật, QC thật, contract thật trên Anvil.",
        "purpose": "Huấn luyện ASR giọng miền Trung cho tổng đài ngân hàng",
        "accent": "mien-trung",
        "prompts": (SEED / "prompts.txt").read_text(encoding="utf-8").splitlines(),
        "terms_text": (SEED / "terms.md").read_text(encoding="utf-8"),
        "target_sec": target_sec,
        "full_price_vnd": 26_000_000,
        "contributor_bps": 8000,
        "creator_bps": 1000,
        "duration_days": 30,
        "seed_vnd": 260_000,
        "seed_vnd_per_minute": 13_000,
    }
    created = ctx.create_campaign("creator", req)
    cid = created["campaign_id"]
    d = ctx.public().get(f"/campaigns/{cid}")
    ck.check(f"Tạo chiến dịch #{cid} on-chain, metadata khớp hash", d["metadata_verified"], created["tx_hash"])
    ck.check("Giá đầy đủ 26.000.000 ₫ = 1.000 mUSDC", d["full_price"]["units"] == 1_000_000_000, ui.money(d["full_price"]))
    ck.check("Giá khởi điểm 30% (chưa có bản ghi)", d["price"]["units"] == 300_000_000, ui.money(d["price"]))
    terms = ctx.public().get(f"/campaigns/{cid}/terms")
    ck.check("Điều khoản phục vụ khớp termsHash on-chain", terms["matches"])
    ck.check("Không bán khi chưa có bản ghi", not ctx.public().get(f"/campaigns/{cid}/price")["can_buy"])

    # 3) Đồng thuận EIP-712 qua relayer — người đóng góp không tốn AVAX
    for who in ("an", "binh"):
        ctx.login(who, force=True)
        before = ch.native_balance(ctx.wallet(who).address)
        r = ctx.consent_submit(who, ctx.consent_sign(who, cid))
        after = ch.native_balance(ctx.wallet(who).address)
        ck.check(f"{who}: đồng thuận on-chain qua relayer, không tốn AVAX", r["consented_at"] > 0 and before == after, r["tx_hash"] or "")
    replay = ctx.consent_sign("an", cid)
    res = ctx.consent_submit("an", replay)
    ck.check("Đồng thuận lại → không gửi giao dịch trùng", res["already"])

    # 4) Chống gian lận: chưa đồng thuận không xin được câu; file chuẩn bị sẵn bị chặn; token dùng một lần
    ctx.login("laby", force=True)
    e = _expect_error(lambda: ctx.get_prompt("laby", cid), code="no_consent")
    ck.check("Chưa ký đồng thuận → không được cấp câu mẫu", e is not None)
    p = ctx.get_prompt("an", cid, 0)
    data = (FIXTURES / "prompt00_hoaimy.wav").read_bytes()
    e = _expect_error(lambda: ctx.user("an").post("/contributions", data={"token": p["token"]},
                                                  files={"audio": ("x.wav", data, "audio/wav")}), code="not_live")
    ck.check("Nộp ngay file dài hơn thời gian từ lúc hiện câu → bị chặn (chỉ ghi trực tiếp)", e is not None)
    e = _expect_error(lambda: ctx.user("an").post("/contributions", data={"token": p["token"]},
                                                  files={"audio": ("x.wav", data, "audio/wav")}), code="bad_prompt_token")
    ck.check("Prompt token chỉ dùng được một lần", e is not None)

    # 5) QC thật: bản ghi im lặng bị loại, đọc sai câu bị loại
    r = ctx.submit_audio("an", cid, FIXTURES / "silence_4s.wav", 4)
    ck.check("QC loại bản ghi im lặng (Silero VAD)", r["status"] == "rejected", "; ".join(r["qc"]["reasons"]))
    r = ctx.submit_audio("an", cid, FIXTURES / "prompt02_hoaimy.wav", 6)  # đọc câu 2 nhưng được giao câu 6
    ck.check("QC loại bản ghi đọc sai câu (CER + forced alignment)", r["status"] == "rejected",
             f"CER={r['qc']['cer']}, align={r['qc']['align_score']}")

    # 6) Đóng góp thật: An 2 bản ghi, Bình 3 bản ghi
    plan = [("an", "prompt00_hoaimy.wav"), ("an", "prompt02_hoaimy.wav"),
            ("binh", "prompt01_namminh.wav"), ("binh", "prompt03_namminh.wav"), ("binh", "prompt05_namminh.wav")]
    reg: dict[str, list[dict]] = {"an": [], "binh": []}
    seed_rate = ch.vc.functions.getCampaign(cid).call()[11]
    for who, f in plan:
        try:
            r = ctx.submit_audio(who, cid, FIXTURES / f, manifest[f]["prompt_index"])
        except ApiError as e:
            if e.code != "duplicate_audio":
                raise
            ck.check("Chống trùng audio", True, "file fixture đã được nộp ở lần chạy trước trên deployment này")
            ui.warn("Audio fixture chỉ dùng được một lần mỗi deployment (chống trùng toàn cục). Để chạy lại demo e2e: "
                    "khởi động lại scripts\start-anvil.bat, chạy scripts\deploy-local.bat rồi khởi động lại "
                    "scripts\start-backend.bat. (demo scenario-611 chạy lại được bất cứ lúc nào.)")
            return 2
        okk = r["status"] == "registered"
        ck.check(f"{who}: '{manifest[f]['text'][:32]}…' → QC đạt, ghi on-chain", okk,
                 f"{r['weight_sec']}s, CER={r['qc']['cer']}, tx {str(r['tx_hash'])[:12]}…")
        if okk:
            reg[who].append(r)
            ck.check(f"{who}: nhận tiền mồi ngay = {r['weight_sec']}s × tỷ lệ mồi",
                     r["seed_paid"]["units"] == r["weight_sec"] * seed_rate, ui.money(r["seed_paid"]))
    w_an = sum(r["weight_sec"] for r in reg["an"])
    w_binh = sum(r["weight_sec"] for r in reg["binh"])
    total = w_an + w_binh
    q = ctx.public().get(f"/campaigns/{cid}/price")
    exp_prog = min(BPS, total * BPS // target_sec)
    ck.check(f"Tiến độ = {total}/{target_sec} giây", q["progress_bps"] == exp_prog, f"{q['progress_bps'] / 100:.2f}%")
    ck.check("Giá = giá đầy đủ × (0,3 + 0,7 × tiến độ)", q["price"]["units"] == _price(10**9, exp_prog), ui.money(q["price"]))
    e = _expect_error(lambda: ctx.submit_audio("an", cid, FIXTURES / "prompt00_hoaimy.wav", 0), status=409)
    ck.check("Không đọc lại câu đã đọc", e is not None, getattr(e, "message", ""))

    # 7) Lab X mua sớm
    seed_an = sum(r["seed_paid"]["units"] for r in reg["an"])
    seed_binh = sum(r["seed_paid"]["units"] for r in reg["binh"])
    buy1 = ctx.buy("labx", cid)
    price1 = buy1["price_units"]
    contrib1 = price1 * 8000 // BPS
    pa = ch.vc.functions.pendingReward(cid, ctx.wallet("an").address).call()
    pb = ch.vc.functions.pendingReward(cid, ctx.wallet("binh").address).call()
    ck.check(f"Lab X mua ở {buy1['progress_bps'] / 100:.2f}% với giá {_vnd(price1, rate)}", price1 == q["price"]["units"], buy1["tx_hash"])
    ck.check("An được chia theo số giây (w_An / W × 80%)", abs(pa - seed_an - contrib1 * w_an // total) <= 1, _vnd(pa - seed_an, rate))
    ck.check("Bình được chia theo số giây (w_Bình / W × 80%)", abs(pb - seed_binh - contrib1 * w_binh // total) <= 1, _vnd(pb - seed_binh, rate))
    ck.check("Người tạo nhận 10%", ch.vc.functions.withdrawable(ctx.wallet("creator").address).call() == price1 * 1000 // BPS)
    e = _expect_error(lambda: ctx.buy("labx", cid), code="AlreadyLicensed")
    ck.check("Mỗi ví chỉ mua một license", e is not None, str(e or ""))

    # 8) Phiên bản dataset v1 + tải theo license
    snap1 = ctx.publish_snapshot("creator", cid)  # chủ chiến dịch ký PublishSnapshot (§3 #28)
    ck.check(f"Chủ chiến dịch ký công bố snapshot v{snap1['version']} (Merkle root on-chain)", snap1["leaf_count"] == len(plan),
             snap1["merkle_root"][:18])
    dl = ctx.download("labx", cid, None)
    ck.check("Lab X tải dataset: proof Merkle + sha256 khớp, root có trên chain",
             dl["verify"]["proofs_ok"] and dl["verify"]["root_on_chain"], f"{len(dl['verify']['entries'])} bản ghi")
    e = _expect_error(lambda: ctx.download("laby", cid, None), code="no_license")
    ck.check("Ví chưa mua license không tải được", e is not None)
    old_link = ctx.download("labx", cid, None)["link"]["download_url"]

    # 9) An rút tiền qua relayer (phí nhỏ bằng tiền trong app), rồi thu hồi toàn bộ
    an_addr = ctx.wallet("an").address
    bal0 = ch.token_balance(an_addr)
    cl = ctx.claim_relayed("an", cid)
    ck.check(f"An rút {ui.money(cl['received'])}, phí {ui.money(cl['fee'])}", ch.token_balance(an_addr) - bal0 == pa - cl["fee"]["units"])
    snap_before = ctx.public().get(f"/campaigns/{cid}")["latest_snapshot"]["version"]
    for r in reg["an"]:
        rv = ctx.revoke_relayed("an", r["onchain_id"])
        ck.check(f"An thu hồi bản ghi #{r['onchain_id']}: audio + salt đã xóa", rv["audio_deleted"], rv["tx_hash"][:14] + "…")
    q2 = ctx.public().get(f"/campaigns/{cid}/price")
    exp_prog2 = min(BPS, w_binh * BPS // target_sec)
    ck.check("Thu hồi làm tiến độ giảm", q2["progress_bps"] == exp_prog2, f"{q['progress_bps'] / 100:.2f}% → {q2['progress_bps'] / 100:.2f}%")
    ck.check("Thu hồi làm giá giảm", q2["price"]["units"] == _price(10**9, exp_prog2) < q["price"]["units"], ui.money(q2["price"]))
    ck.check("An giữ tiền đã rút", ch.token_balance(an_addr) - bal0 == pa - cl["fee"]["units"])
    det = ctx.public().get(f"/campaigns/{cid}")
    ck.check("Phiên bản cũ bị khóa (stale) sau thu hồi, chờ chủ chiến dịch công bố", det["latest_snapshot"]["status"] == "stale",
             f"v{det['latest_snapshot']['version']} {det['latest_snapshot']['status']}")
    try:
        ctx.public().get_url(old_link)
        ck.check("Link tải phiên bản cũ (chứa bản ghi đã thu hồi) bị vô hiệu", False)
    except ApiError as e:
        ck.check("Link tải phiên bản cũ (chứa bản ghi đã thu hồi) bị vô hiệu", e.status == 410, f"HTTP {e.status}")

    snap2 = ctx.publish_snapshot("creator", cid)
    ck.check(f"Chủ chiến dịch ký công bố phiên bản mới v{snap2['version']} (không còn bản ghi đã thu hồi)",
             snap2["version"] > snap_before and snap2["leaf_count"] == len(reg["binh"]), snap2["merkle_root"][:18])

    # 10) Lab Y mua sau với giá thấp hơn — toàn bộ phần người đóng góp về Bình
    pb_before = ch.vc.functions.pendingReward(cid, ctx.wallet("binh").address).call()
    buy2 = ctx.buy("laby", cid)
    pa2 = ch.vc.functions.pendingReward(cid, an_addr).call()
    pb2 = ch.vc.functions.pendingReward(cid, ctx.wallet("binh").address).call()
    ck.check(f"Lab Y mua ở {buy2['progress_bps'] / 100:.2f}% với giá {_vnd(buy2['price_units'], rate)}", buy2["price_units"] == q2["price"]["units"])
    ck.check("An không được chia lần bán sau thu hồi", pa2 == 0)
    ck.check("Toàn bộ 80% lần bán sau về Bình", abs((pb2 - pb_before) - buy2["price_units"] * 8000 // BPS) <= 1, _vnd(pb2 - pb_before, rate))

    # 11) Lab X tải lại: bản mới chỉ còn bản ghi của Bình
    dl2 = ctx.download("labx", cid, None)
    an_ids = {r["onchain_id"] for r in reg["an"]}
    ck.check("Lab X tải lại: phiên bản mới không còn bản ghi của An", not (set(dl2["verify"]["entries"]) & an_ids)
             and len(dl2["verify"]["entries"]) == len(reg["binh"]) and dl2["verify"]["root_on_chain"],
             f"v{dl2['verify']['version']}: {dl2['verify']['entries']}")

    # 12) Bình tự rút (miễn phí), người tạo + nền tảng rút phần chia
    bb0 = ch.token_balance(ctx.wallet("binh").address)
    out = ch.send(ctx.wallet("binh").private_key, ch.vc.functions.claim(cid))
    ck.check(f"Bình tự rút {_vnd(pb2, rate)} (không phí)", ch.token_balance(ctx.wallet("binh").address) - bb0 == pb2, out.tx_hash[:14] + "…")
    wc = ctx.withdraw("creator")
    ck.check("Người tạo rút 10% của hai lần bán", wc["amount_units"] == (price1 + buy2["price_units"]) * 1000 // BPS, _vnd(wc["amount_units"], rate))
    rev = ctx.public().get(f"/campaigns/{cid}/revenue")
    ck.check("API doanh thu ghi nhận 2 lần bán", rev["sales"] == 2, ui.money(rev["total"]))

    ui.table(f"Tóm tắt chiến dịch #{cid} (tỷ giá {rate:,.0f} ₫/USDC)", ["Bước", "Kết quả"], [
        ["An góp", f"{w_an} giây ({len(reg['an'])} bản ghi)"], ["Bình góp", f"{w_binh} giây ({len(reg['binh'])} bản ghi)"],
        ["Lab X mua", _vnd(price1, rate)], ["An rút", ui.money(cl["received"])],
        ["An thu hồi", f"tiến độ còn {q2['progress_bps'] / 100:.2f}%"], ["Lab Y mua", _vnd(buy2["price_units"], rate)],
        ["Bình tổng nhận", _vnd(pb2, rate)], ["Người tạo nhận", _vnd(wc["amount_units"], rate)],
    ])
    return ck.summary()


def run_scenario_611(ctx: Ctx) -> int:
    """Tái hiện đúng bảng 6.11 trên chain local (bỏ qua QC có chủ đích, dùng ví QC oracle local)."""
    ck = Checks()
    h = ctx.health()
    if not ck.check("Chỉ chạy trên local", h["network"] == "local"):
        return ck.summary()
    ctx.state.init_local()
    ch = ctx.chain()
    rate = ctx.public().get("/fx")["rate"]
    dep, cre = ctx.wallet("deployer"), ctx.wallet("creator")
    an, binh, labx, laby = (ctx.wallet(n) for n in ("an", "binh", "labx", "laby"))
    if ch.vc.functions.qcOracle().call() != dep.address:
        ck.check("Ví deployer là QC oracle", False)
        return ck.summary()
    for who in (labx, laby):
        ch.send(dep.private_key, ch.token.functions.mint(who.address, 1_000 * 10**6))
    deadline = ch.w3.eth.get_block("latest")["timestamp"] + 30 * 86400
    out = ch.send(cre.private_key, ch.vc.functions.createCampaign(
        36_000, 1_000 * 10**6, 8000, 1000, deadline, b"\x01" * 32, b"\x02" * 32, f"scenario:6.11:{int(time.time())}", 0, 0))
    cid = int(ch.vc.events.CampaignCreated().process_receipt(out.receipt, errors=DISCARD)[0]["args"]["campaignId"])
    ui.info(f"Chiến dịch kịch bản #{cid}: 10 giờ, 1.000 mUSDC, 80/10/10")
    for who in (an, binh):
        ch.send(who.private_key, ch.vc.functions.giveConsent(cid))
    ids = []
    for who, sec in ((an, 7200), (binh, 10800)):
        o = ch.send(dep.private_key, ch.vc.functions.registerContribution(cid, who.address, os.urandom(32), sec))
        ids.append(int(ch.vc.events.ContributionRegistered().process_receipt(o.receipt, errors=DISCARD)[0]["args"]["contributionId"]))
    f = ch.vc.functions
    ck.check("An 2 giờ + Bình 3 giờ → tiến độ 50%", f.progressBps(cid).call() == 5000)
    ck.check("Giá = 65% = 16.900.000 ₫ (650 USDC)", f.currentPrice(cid).call() == 650 * 10**6, _vnd(f.currentPrice(cid).call(), rate))
    for who in (labx,):
        ch.send(who.private_key, ch.token.functions.approve(ch.vc.address, 2**256 - 1))
        ch.send(who.private_key, f.buy(cid, 650 * 10**6))
    pa, pb = f.pendingReward(cid, an.address).call(), f.pendingReward(cid, binh.address).call()
    ck.check("An nhận 5.408.000 ₫ (208 USDC)", abs(pa - 208 * 10**6) <= 1, _vnd(pa, rate))
    ck.check("Bình nhận 8.112.000 ₫ (312 USDC)", abs(pb - 312 * 10**6) <= 1, _vnd(pb, rate))
    ck.check("Người tạo nhận 1.690.000 ₫ (65 USDC)", f.withdrawable(cre.address).call() >= 65 * 10**6)
    b0 = ch.token_balance(an.address)
    ch.send(an.private_key, f.claim(cid))
    ck.check("An rút 5.408.000 ₫ về ví", abs(ch.token_balance(an.address) - b0 - 208 * 10**6) <= 1)
    ch.send(an.private_key, f.revoke(ids[0]))
    ck.check("An thu hồi → còn 3 giờ, tiến độ 30%", f.progressBps(cid).call() == 3000)
    ck.check("Giá = 51% = 13.260.000 ₫ (510 USDC)", f.currentPrice(cid).call() == 510 * 10**6, _vnd(f.currentPrice(cid).call(), rate))
    ch.send(laby.private_key, ch.token.functions.approve(ch.vc.address, 2**256 - 1))
    ch.send(laby.private_key, f.buy(cid, 510 * 10**6))
    pa2, pb2 = f.pendingReward(cid, an.address).call(), f.pendingReward(cid, binh.address).call()
    ck.check("An không được chia lần bán sau", pa2 == 0)
    ck.check("Bình tổng 18.720.000 ₫ (720 USDC)", abs(pb2 - 720 * 10**6) <= 2, _vnd(pb2, rate))
    ck.check("An vẫn giữ 5.408.000 ₫ đã rút", abs(ch.token_balance(an.address) - b0 - 208 * 10**6) <= 1)
    return ck.summary()
