"""giongque — CLI cho Dataset Marketplace. Chạy `giongque --help` hoặc `python -m cli --help`.

Ví dụ nhanh (local):
    giongque wallet init-local
    giongque status
    giongque campaign list
    giongque consent give 0 --as an
    giongque contribution submit 0 --as an --audio tests\\fixtures\\audio\\prompt00_hoaimy.wav --prompt-index 0
    giongque market buy 0 --as labx
    giongque rewards claim 0 --as an
    giongque contribution revoke 0 --as an
    giongque demo e2e
"""
from __future__ import annotations

from web3.logs import DISCARD

import json
from functools import wraps
from pathlib import Path
from typing import Annotated

import typer

from cli import ui
from cli.api import ApiError
from cli.chain import TxError
from cli.ops import Ctx

app = typer.Typer(help="Dataset Marketplace CLI — chợ dữ liệu giọng nói trên Avalanche (backend + contract, không cần frontend).",
                  no_args_is_help=True, rich_markup_mode="rich")
wallet_app = typer.Typer(help="Ví test cục bộ (Anvil/Fuji).", no_args_is_help=True)
campaign_app = typer.Typer(help="Chiến dịch: xem, tạo, điều khoản.", no_args_is_help=True)
consent_app = typer.Typer(help="Đồng thuận EIP-712 (relayer trả gas).", no_args_is_help=True)
prompt_app = typer.Typer(help="Câu mẫu + prompt token.", no_args_is_help=True)
qc_app = typer.Typer(help="Kiểm tra chất lượng audio (chạy model tại máy).", no_args_is_help=True)
contrib_app = typer.Typer(help="Đóng góp: nộp bản ghi, danh sách, thu hồi.", no_args_is_help=True)
market_app = typer.Typer(help="Mua bán: giá, mua license, doanh thu.", no_args_is_help=True)
rewards_app = typer.Typer(help="Tiền: số dư, rút qua relayer / tự rút, rút phần chia.", no_args_is_help=True)
dataset_app = typer.Typer(help="Phiên bản dataset: snapshot, tải, kiểm tra Merkle.", no_args_is_help=True)
admin_app = typer.Typer(help="Quản trị: duyệt vùng xám, relayer, đồng bộ.", no_args_is_help=True)
demo_app = typer.Typer(help="Demo: faucet mUSDC, kịch bản end-to-end.", no_args_is_help=True)
for sub, name in [
    (wallet_app, "wallet"), (campaign_app, "campaign"), (consent_app, "consent"), (prompt_app, "prompt"),
    (qc_app, "qc"), (contrib_app, "contribution"), (market_app, "market"), (rewards_app, "rewards"),
    (dataset_app, "dataset"), (admin_app, "admin"), (demo_app, "demo"),
]:
    app.add_typer(sub, name=name)

CTX = Ctx()
As = Annotated[str, typer.Option("--as", help="Tên ví trong kho CLI (an, binh, labx, creator...)")]
CampaignArg = Annotated[int, typer.Argument(help="campaignId on-chain")]
JsonOpt = Annotated[bool, typer.Option("--json", help="In JSON thô")]


@app.callback()
def _root(
    api: Annotated[str | None, typer.Option(help="URL backend (mặc định GIONGQUE_API hoặc http://127.0.0.1:8000)")] = None,
    rpc: Annotated[str | None, typer.Option(help="RPC chain (mặc định GIONGQUE_RPC hoặc http://127.0.0.1:8545)")] = None,
) -> None:
    if api:
        CTX.api_url = api.rstrip("/")
    if rpc:
        CTX.rpc_url = rpc


def handle(fn):  # noqa: ANN001, ANN201
    @wraps(fn)
    def wrapper(*a, **k):  # noqa: ANN002, ANN003, ANN202
        try:
            return fn(*a, **k)
        except ApiError as e:
            ui.fail(f"{e.message}  [{e.status} {e.code}]")
            if e.details:
                ui.dump(e.details)
            raise typer.Exit(1) from None
        except TxError as e:
            ui.fail(str(e))
            raise typer.Exit(1) from None

    return wrapper


# ====================================================================== status


@app.command()
@handle
def status() -> None:
    """Trạng thái backend, chain, relayer, model QC và tỷ giá."""
    h = CTX.public().get("/health")
    fx = CTX.public().get("/fx")
    ui.kv("Dataset Marketplace", [
        ("Backend", CTX.api_url), ("Trạng thái", h["status"]), ("Mạng", f"{h['network']} (chain {h['chain_id']})"),
        ("Block", h["block"]), ("VoiceCampaigns", h["voice_campaigns"]), ("Token", h["token"]),
        ("Relayer", f"{h['relayer']} ({h['relayer_balance_avax']:.4f} AVAX)"), ("Database", "ok" if h["db_ok"] else "LỖI"),
        ("Model QC", "đã nạp" if h["qc_model_loaded"] else f"chưa nạp {h['qc_load_error'] or ''}"),
        ("Chế độ dev", h["dev_mode"]), ("Tỷ giá", f"{fx['rate']:,.0f} ₫/USDC ({fx['source']})"), ("Dữ liệu", h["data_dir"]),
    ])


@app.command()
@handle
def login(as_: As, email: Annotated[str | None, typer.Option(help="Email gắn với ví")] = None) -> None:
    """Đăng nhập dev (chỉ NETWORK=local): ký challenge bằng ví test, nhận JWT."""
    res = CTX.login(as_, email, force=True)
    ui.ok(f"Đã đăng nhập {res['email']} ↔ {res['wallet_address']}")


# ====================================================================== wallet


@wallet_app.command("init-local")
def wallet_init_local() -> None:
    """Tạo các ví vai trò từ mnemonic công khai của Anvil (deployer, buyer, creator, an, binh, labx, laby)."""
    for w in CTX.state.init_local():
        ui.info(f"  {w.name:9s} {w.address}")
    ui.warn("Các khóa này là khóa CÔNG KHAI của Anvil — chỉ dùng trên chain local.")


@wallet_app.command("list")
@handle
def wallet_list() -> None:
    """Danh sách ví + số dư AVAX/mUSDC."""
    rows = []
    ch = None
    try:
        ch = CTX.chain()
    except ApiError:
        pass
    for w in CTX.state.wallets():
        bal = f"{ch.native_balance(w.address) / 1e18:.3f} / {ch.token_balance(w.address) / 1e6:,.2f}" if ch else "-"
        rows.append([w.name, w.address, bal])
    ui.table("Ví", ["Tên", "Địa chỉ", "AVAX / mUSDC"], rows)


@wallet_app.command("new")
def wallet_new(name: str) -> None:
    """Tạo ví ngẫu nhiên mới."""
    import secrets

    w = CTX.state.add_wallet(name, "0x" + secrets.token_hex(32))
    ui.ok(f"{name}: {w.address}")


@wallet_app.command("import")
def wallet_import(name: str, private_key: Annotated[str, typer.Argument(help="0x...")]) -> None:
    """Nhập ví test bằng private key."""
    w = CTX.state.add_wallet(name, private_key)
    ui.ok(f"{name}: {w.address}")


# ====================================================================== campaign


@campaign_app.command("list")
@handle
def campaign_list(json_: JsonOpt = False) -> None:
    """Danh sách chiến dịch, giá hiện tại (VNĐ)."""
    items = CTX.public().get("/campaigns")
    if json_:
        return ui.dump(items)
    ui.table("Chiến dịch", ["ID", "Tên", "Tiến độ", "Giây", "Giá hiện tại", "Trạng thái"], [
        [c["id"], c["name"] or "(chưa xác minh metadata)", f"{c['progress_bps'] / 100:.2f}%",
         f"{c['total_sec']}/{c['target_sec']}", ui.money(c["price"]), c["status"]] for c in items
    ])


@campaign_app.command("detail")
@handle
def campaign_detail(campaign_id: CampaignArg, json_: JsonOpt = False) -> None:
    """Chi tiết: tiến độ, giá, số người đóng góp, người mua, doanh thu, snapshot."""
    d = CTX.public().get(f"/campaigns/{campaign_id}")
    if json_:
        return ui.dump(d)
    snap = d["latest_snapshot"]
    ui.kv(f"Chiến dịch #{d['id']}: {d['name']}", [
        ("Mô tả", d["description"]), ("Người tạo", d["creator"]),
        ("Tiến độ", f"{d['progress_bps'] / 100:.2f}% ({d['total_sec']}/{d['target_sec']} giây)"),
        ("Giá hiện tại", ui.money(d["price"])), ("Giá đầy đủ", ui.money(d["full_price"])),
        ("Chia", f"{d['split']['contributor_bps'] / 100:g}% người đóng góp / {d['split']['creator_bps'] / 100:g}% người tạo / "
                 f"{d['split']['platform_bps'] / 100:g}% nền tảng"),
        ("Trạng thái", d["status"]), ("Người đóng góp", d["contributors"]), ("Người mua", d["buyers"]),
        ("Doanh thu", ui.money(d["revenue_total"])), ("Quỹ mồi còn", ui.money(d["seed_balance"])),
        ("Số câu mẫu", d["prompt_count"]), ("termsHash", d["terms_hash"]),
        ("Snapshot", f"v{snap['version']} root={snap['merkle_root'][:18]}… ({snap['status']})" if snap else "-"),
        ("Mẫu nghe thử", ", ".join(d["samples"]) or "-"),
    ])


@campaign_app.command("terms")
@handle
def campaign_terms(campaign_id: CampaignArg) -> None:
    """Điều khoản đồng thuận + đối chiếu hash on-chain."""
    t = CTX.public().get(f"/campaigns/{campaign_id}/terms")
    ui.info(t["terms_text"])
    (ui.ok if t["matches"] else ui.fail)(f"keccak256(điều khoản) = {t['terms_hash']} | on-chain = {t['onchain_terms_hash']}")


@campaign_app.command("create")
@handle
def campaign_create(
    as_: As = "creator",
    name: Annotated[str, typer.Option(help="Tên chiến dịch")] = "Giọng miền Trung – ngân hàng (CLI)",
    description: Annotated[str, typer.Option()] = "Chiến dịch tạo từ CLI để kiểm thử luồng nghiệp vụ trên máy.",
    purpose: Annotated[str, typer.Option()] = "Huấn luyện ASR giọng miền Trung cho tổng đài ngân hàng",
    prompts_file: Annotated[Path, typer.Option(help="Mỗi dòng một câu mẫu")] = Path("../seed/demo-campaign/prompts.txt"),
    terms_file: Annotated[Path, typer.Option(help="Văn bản điều khoản đồng thuận")] = Path("../seed/demo-campaign/terms.md"),
    target_sec: Annotated[int, typer.Option(help="Mục tiêu (giây)")] = 36_000,
    price_vnd: Annotated[int, typer.Option(help="Giá đầy đủ (VNĐ)")] = 26_000_000,
    contributor_bps: Annotated[int, typer.Option()] = 8000,
    creator_bps: Annotated[int, typer.Option()] = 1000,
    days: Annotated[int, typer.Option(help="Hạn thu thập (ngày)")] = 30,
    seed_vnd: Annotated[int, typer.Option(help="Quỹ mồi (VNĐ)")] = 0,
    seed_vnd_per_min: Annotated[int, typer.Option(help="Tiền mồi mỗi phút hợp lệ (VNĐ)")] = 0,
    accent: Annotated[str, typer.Option()] = "mien-trung",
) -> None:
    """Soạn nháp qua API (server tính hash + quy đổi VNĐ→USDC), rồi ví người tạo tự gửi createCampaign."""
    req = {
        "name": name, "description": description, "purpose": purpose, "accent": accent,
        "prompts": [ln for ln in prompts_file.read_text(encoding="utf-8").splitlines() if ln.strip()],
        "terms_text": terms_file.read_text(encoding="utf-8"), "target_sec": target_sec, "full_price_vnd": price_vnd,
        "contributor_bps": contributor_bps, "creator_bps": creator_bps, "duration_days": days,
        "seed_vnd": seed_vnd, "seed_vnd_per_minute": seed_vnd_per_min,
    }
    res = CTX.create_campaign(as_, req)
    a = res["draft"]["create_campaign_args"]
    ui.ok(f"Đã tạo chiến dịch #{res['campaign_id']} — tx {res['tx_hash']}")
    ui.kv("createCampaign", [("Giá đầy đủ", ui.money(res["draft"]["full_price"])), ("Quỹ mồi", ui.money(res["draft"]["seed_amount"])),
                             ("promptSetHash", a["promptSetHash"]), ("termsHash", a["termsHash"]), ("metadataURI", a["metadataURI"])])


@campaign_app.command("sync")
@handle
def campaign_sync() -> None:
    """Đọc sự kiện mới từ chain vào backend."""
    ui.dump(CTX.public().post("/campaigns/sync"))


# ====================================================================== consent


@consent_app.command("sign")
@handle
def consent_sign(campaign_id: CampaignArg, as_: As, out: Annotated[Path | None, typer.Option(help="Lưu chữ ký ra file JSON")] = None) -> None:
    """Ký EIP-712 Consent(campaignId, contributor, termsHash, nonce, deadline) bằng ví test."""
    signed = CTX.consent_sign(as_, campaign_id)
    if out:
        out.write_text(json.dumps(signed, indent=2), encoding="utf-8")
        ui.ok(f"Đã lưu chữ ký vào {out}")
    else:
        ui.dump(signed)


@consent_app.command("submit")
@handle
def consent_submit(campaign_id: CampaignArg, as_: As, sig_file: Annotated[Path, typer.Option(help="File JSON từ `consent sign --out`")]) -> None:
    """Gửi chữ ký đã ký cho backend; relayer gọi giveConsentWithSig."""
    signed = json.loads(sig_file.read_text(encoding="utf-8"))
    if signed["campaign_id"] != campaign_id:
        raise typer.BadParameter("campaign_id trong file không khớp")
    res = CTX.consent_submit(as_, signed)
    ui.ok(f"Đồng thuận lúc {res['consented_at']} — tx {res['tx_hash'] or '(đã có từ trước)'}")


@consent_app.command("give")
@handle
def consent_give(campaign_id: CampaignArg, as_: As) -> None:
    """Ký + gửi trong một bước."""
    ui.info(CTX.public().get(f"/campaigns/{campaign_id}/terms")["terms_text"][:400] + "…")
    res = CTX.consent_submit(as_, CTX.consent_sign(as_, campaign_id))
    ui.ok(f"{as_} đã đồng thuận chiến dịch #{campaign_id} — tx {res['tx_hash'] or '(đã có từ trước)'} (không tốn AVAX)")


@consent_app.command("status")
@handle
def consent_status(campaign_id: CampaignArg, as_: As) -> None:
    ui.dump(CTX.user(as_).get("/consent/status", campaign_id=campaign_id))


# ====================================================================== prompt + qc


@prompt_app.command("get")
@handle
def prompt_get(
    campaign_id: CampaignArg, as_: As,
    prompt_index: Annotated[int | None, typer.Option(help="[chỉ local] chọn câu thứ N")] = None,
) -> None:
    """Xin câu mẫu chưa đọc + prompt token (hết hạn ~60 giây)."""
    p = CTX.get_prompt(as_, campaign_id, prompt_index)
    ui.kv("Câu mẫu", [("Câu", p["text"]), ("prompt_index", p["prompt_index"]), ("Hết hạn sau", f"{p['expires_at'] - p['issued_at']} giây"),
                       ("Token", p["token"])])


@qc_app.command("check")
def qc_check(audio: Path, prompt: str, json_: JsonOpt = False) -> None:
    """Chạy pipeline QC thật (Silero VAD + wav2vec2 + forced alignment + CER) trên một file, không cần backend."""
    from app.qc.__main__ import main as qc_main

    raise typer.Exit(qc_main([str(audio), prompt] + (["--json"] if json_ else [])))


# ====================================================================== contribution


def _print_contribution(r: dict) -> None:
    q = r.get("qc") or {}
    color = {"registered": "green", "gray": "yellow"}.get(r["status"], "red")
    ui.info(f"[{color}]{r['status'].upper()}[/] {r['message']}")
    rows = [("Câu mẫu", r.get("prompt_text", "")), ("QC", q.get("decision")), ("Lý do", "; ".join(q.get("reasons", [])) or "-"),
            ("CER / align", f"{q.get('cer')} / {q.get('align_score')}"), ("Máy nghe", q.get("hypothesis")),
            ("Trọng số", f"{r['weight_sec']} giây"), ("ID on-chain", r["onchain_id"]), ("tx", r["tx_hash"])]
    if r.get("seed_paid") and r["seed_paid"]["units"]:
        rows.append(("Tiền mồi", ui.money(r["seed_paid"])))
    ui.kv(f"Bản ghi #{r['id']}", rows)


@contrib_app.command("submit")
@handle
def contribution_submit(
    campaign_id: CampaignArg, as_: As,
    audio: Annotated[Path, typer.Option(help="[CHỈ KIỂM THỬ LOCAL] file audio đọc đúng câu mẫu")],
    prompt_index: Annotated[int | None, typer.Option(help="[chỉ local] câu thứ N khớp với file")] = None,
) -> None:
    """Xin câu mẫu rồi nộp file ngay (server vẫn kiểm tra token 60 giây + thời lượng ≤ thời gian từ lúc hiện câu)."""
    _print_contribution(CTX.submit_audio(as_, campaign_id, audio, prompt_index))


@contrib_app.command("record")
@handle
def contribution_record(
    campaign_id: CampaignArg, as_: As, seconds: Annotated[float, typer.Option(help="Thời lượng ghi")] = 8.0,
) -> None:
    """Ghi âm TRỰC TIẾP từ micro (cần gói sounddevice): hiện câu mẫu, đếm ngược, ghi rồi nộp."""
    import io
    import time

    import sounddevice as sd
    import soundfile as sf

    p = CTX.get_prompt(as_, campaign_id)
    ui.info(f"\n[bold]Hãy đọc:[/] [cyan]{p['text']}[/]\n")
    time.sleep(1)
    ui.info(f"Đang ghi {seconds:g} giây...")
    rec = sd.rec(int(seconds * 16000), samplerate=16000, channels=1, dtype="int16")
    sd.wait()
    buf = io.BytesIO()
    sf.write(buf, rec, 16000, format="WAV", subtype="PCM_16")
    r = CTX.user(as_).post("/contributions", data={"token": p["token"], "capture": "live"},
                           files={"audio": ("mic.wav", buf.getvalue(), "audio/wav")})
    r["prompt_text"] = p["text"]
    _print_contribution(r)


@contrib_app.command("list")
@handle
def contribution_list(as_: As, json_: JsonOpt = False) -> None:
    """Bản ghi của tôi, trạng thái, tiền chưa rút."""
    d = CTX.user(as_).get("/me/contributions")
    if json_:
        return ui.dump(d)
    ui.table(f"Bản ghi của {as_} ({d['address']})", ["#", "Chiến dịch", "Trạng thái", "Giây", "ID on-chain", "Câu"], [
        [c["id"], c["campaign_id"], c["status"], c["weight_sec"], c["onchain_id"] if c["onchain_id"] is not None else "-",
         c["prompt_text"][:50]] for c in d["contributions"]
    ])
    for e in d["earnings"]:
        ui.info(f"Chiến dịch #{e['campaign_id']}: {e['active_weight_sec']} giây còn hiệu lực, chưa rút {ui.money(e['pending'])}")


@contrib_app.command("revoke")
@handle
def contribution_revoke(
    onchain_id: Annotated[int, typer.Argument(help="ID bản ghi on-chain")], as_: As,
    direct: Annotated[bool, typer.Option(help="Tự gửi revoke() bằng AVAX của mình thay vì ký qua relayer")] = False,
) -> None:
    """Thu hồi đồng thuận một bản ghi: giữ tiền đã kiếm, xóa audio + salt, dataset sau không còn bản ghi."""
    if direct:
        ch = CTX.chain()
        out = ch.send(CTX.wallet(as_).private_key, ch.vc.functions.revoke(onchain_id))
        CTX.public().post("/campaigns/sync")  # indexer thấy ConsentRevoked -> xóa audio + salt
        return ui.ok(f"Đã tự thu hồi #{onchain_id} — tx {out.tx_hash}")
    r = CTX.revoke_relayed(as_, onchain_id)
    ui.ok(f"Đã thu hồi #{onchain_id} — tx {r['tx_hash']}")
    ui.kv("Sau thu hồi", [("Audio + salt đã xóa", r["audio_deleted"]), ("Tiến độ mới", f"{r['new_progress_bps'] / 100:.2f}%"),
                          ("Giá mới", ui.money(r["new_price"])), ("Phiên bản dataset mới", r["new_snapshot_version"] or "-")])


# ====================================================================== market


@market_app.command("price")
@handle
def market_price(campaign_id: CampaignArg) -> None:
    """Giá hiện tại theo tiến độ: giá = giá_đầy_đủ × (0,3 + 0,7 × tiến_độ)."""
    q = CTX.public().get(f"/campaigns/{campaign_id}/price")
    ui.kv(f"Giá chiến dịch #{campaign_id}", [("Tiến độ", f"{q['progress_bps'] / 100:.2f}%"), ("Giá", ui.money(q["price"])),
                                             ("Giá đầy đủ", ui.money(q["full_price"])), ("Mua được", q["can_buy"] or q["reason"])])


@market_app.command("buy")
@handle
def market_buy(
    campaign_id: CampaignArg, as_: As,
    max_price_vnd: Annotated[int | None, typer.Option(help="Giá tối đa chấp nhận (VNĐ); mặc định = giá hiện tại")] = None,
) -> None:
    """approve mUSDC + buy(campaignId, maxPrice) bằng ví người mua (ví tự trả gas)."""
    max_units = None
    if max_price_vnd is not None:
        rate = CTX.public().get("/fx")["rate"]
        max_units = int(max_price_vnd / rate * 10**6)
    r = CTX.buy(as_, campaign_id, max_units)
    fx = CTX.public().get("/fx")["rate"]
    ui.ok(f"{as_} đã mua license chiến dịch #{campaign_id} ở tiến độ {r['progress_bps'] / 100:.2f}% với giá "
          f"≈ {r['price_units'] / 1e6 * fx:,.0f} ₫ ({r['price_units'] / 1e6:g} mUSDC) — tx {r['tx_hash']}".replace(",", "."))


@market_app.command("license")
@handle
def market_license(campaign_id: CampaignArg, as_: As) -> None:
    ui.dump(CTX.public().get(f"/campaigns/{campaign_id}/licenses/{CTX.wallet(as_).address}"))


@market_app.command("revenue")
@handle
def market_revenue(campaign_id: CampaignArg) -> None:
    """Doanh thu đã bán và phần chia."""
    r = CTX.public().get(f"/campaigns/{campaign_id}/revenue")
    ui.kv(f"Doanh thu chiến dịch #{campaign_id}", [("Số lần bán", r["sales"]), ("Tổng", ui.money(r["total"])),
          ("Người đóng góp", ui.money(r["to_contributors"])), ("Người tạo", ui.money(r["to_creator"])),
          ("Nền tảng", ui.money(r["to_platform"])), ("Người tạo chưa rút (mọi chiến dịch)", ui.money(r["creator_withdrawable"]))])
    ui.table("Lượt mua", ["Người mua", "Giá", "Tiến độ", "tx"], [
        [p["buyer"], ui.money(p["price"]), f"{p['progress_bps'] / 100:.2f}%", p["tx_hash"][:18] + "…"] for p in r["purchases"]
    ])


# ====================================================================== rewards


@rewards_app.command("balance")
@handle
def rewards_balance(as_: As) -> None:
    """Tiền chưa rút theo từng chiến dịch (VNĐ)."""
    d = CTX.user(as_).get("/me/contributions")
    for e in d["earnings"]:
        ui.info(f"#{e['campaign_id']}: {ui.money(e['pending'])} ({e['active_weight_sec']} giây còn hiệu lực)")
    ui.ok(f"Tổng chưa rút: {ui.money(d['total_pending'])}")


@rewards_app.command("quote")
@handle
def rewards_quote(campaign_id: CampaignArg, as_: As) -> None:
    """Báo giá rút hộ: số tiền, phí, thực nhận."""
    q = CTX.user(as_).get("/me/claim-quote", campaign_id=campaign_id)
    ui.kv("Rút tiền qua relayer", [("Chưa rút", ui.money(q["pending"])), ("Phí rút hộ", ui.money(q["fee"])),
                                   ("Thực nhận", ui.money(q["net"])), ("Rút được", q["can_claim"] or q["reason"])])


@rewards_app.command("claim")
@handle
def rewards_claim(
    campaign_id: CampaignArg, as_: As,
    direct: Annotated[bool, typer.Option(help="Tự gọi claim() (miễn phí, tự trả gas AVAX)")] = False,
) -> None:
    """Rút tiền: mặc định ký Claim(maxFee) để relayer gửi claimWithSig; --direct để tự rút miễn phí."""
    if direct:
        ch = CTX.chain()
        out = ch.send(CTX.wallet(as_).private_key, ch.vc.functions.claim(campaign_id))
        ev = ch.vc.events.Claimed().process_receipt(out.receipt, errors=DISCARD)[0]["args"]
        return ui.ok(f"Đã tự rút {ev['amount'] / 1e6:g} mUSDC (phí 0) — tx {out.tx_hash}")
    r = CTX.claim_relayed(as_, campaign_id)
    ui.ok(f"Đã rút {ui.money(r['received'])}, phí {ui.money(r['fee'])} — tx {r['tx_hash']}")


@rewards_app.command("withdraw")
@handle
def rewards_withdraw(as_: As) -> None:
    """Người tạo / nền tảng / ví nhận phí rút phần chia (withdraw())."""
    r = CTX.withdraw(as_)
    if not r["amount_units"]:
        return ui.warn("Không có gì để rút")
    ui.ok(f"Đã rút {r['amount_units'] / 1e6:g} mUSDC — tx {r['tx_hash']}")


@rewards_app.command("withdraw-seed")
@handle
def rewards_withdraw_seed(campaign_id: CampaignArg, as_: As) -> None:
    """Người tạo lấy lại quỹ mồi còn dư sau hạn thu thập."""
    ch = CTX.chain()
    out = ch.send(CTX.wallet(as_).private_key, ch.vc.functions.withdrawSeed(campaign_id))
    ui.ok(f"Đã rút quỹ mồi — tx {out.tx_hash}")


# ====================================================================== dataset


@dataset_app.command("snapshot")
@handle
def dataset_snapshot(campaign_id: CampaignArg) -> None:
    """[admin] Đóng gói phiên bản, tính Merkle root, gọi publishSnapshot."""
    s = CTX.admin().post(f"/admin/snapshot/{campaign_id}")
    ui.ok(f"Phiên bản v{s['version']}: {s['leaf_count']} bản ghi, {s['total_sec']} giây, root {s['merkle_root']} — tx {s['tx_hash']}")


@dataset_app.command("download")
@handle
def dataset_download(
    campaign_id: CampaignArg, as_: As, out: Annotated[Path, typer.Option(help="File zip đầu ra")] = Path("dataset.zip"),
) -> None:
    """Ký thông điệp chứng minh ví → backend kiểm license on-chain → tải zip → kiểm tra Merkle với chain."""
    r = CTX.download(as_, campaign_id, out)
    v = r["verify"]
    ui.ok(f"Đã tải {out} ({r['bytes']:,} byte) — phiên bản v{v['version']}, {len(v['entries'])} bản ghi, {v['total_sec']} giây")
    (ui.ok if v["proofs_ok"] else ui.fail)(f"Proof Merkle + sha256 từng file: {'khớp' if v['proofs_ok'] else 'SAI'}")
    (ui.ok if v["root_on_chain"] else ui.fail)(f"Root {v['merkle_root'][:18]}… {'có' if v['root_on_chain'] else 'KHÔNG có'} trong sự kiện SnapshotPublished")


@dataset_app.command("verify")
@handle
def dataset_verify(zip_file: Path, campaign_id: CampaignArg) -> None:
    """Kiểm tra lại một file zip đã tải với Merkle root on-chain."""
    ui.dump(CTX.verify_zip(zip_file.read_bytes(), campaign_id))


# ====================================================================== admin


@admin_app.command("review")
@handle
def admin_review() -> None:
    """Hàng chờ vùng xám."""
    items = CTX.admin().get("/admin/review")
    ui.table("Chờ duyệt", ["#", "Chiến dịch", "Ví", "Trạng thái", "CER", "Align", "Câu"], [
        [i["id"], i["campaign_id"], i["address"][:10], i["status"], (i["qc"] or {}).get("cer"), (i["qc"] or {}).get("align_score"),
         i["prompt_text"][:40]] for i in items
    ])


@admin_app.command("approve")
@handle
def admin_approve(contribution_id: int, note: Annotated[str | None, typer.Option()] = None) -> None:
    r = CTX.admin().post(f"/admin/review/{contribution_id}", json={"decision": "approve", "note": note})
    _print_contribution(r)


@admin_app.command("reject")
@handle
def admin_reject(contribution_id: int, note: Annotated[str | None, typer.Option()] = None) -> None:
    r = CTX.admin().post(f"/admin/review/{contribution_id}", json={"decision": "reject", "note": note})
    ui.ok(r["message"])


@admin_app.command("relayer")
@handle
def admin_relayer() -> None:
    """Số dư relayer/QC oracle, phí, giao dịch gần đây."""
    ui.dump(CTX.admin().get("/admin/relayer"))


@admin_app.command("sync")
@handle
def admin_sync() -> None:
    ui.dump(CTX.admin().post("/admin/sync"))


# ====================================================================== demo


@demo_app.command("faucet")
@handle
def demo_faucet(as_: As, amount: Annotated[int, typer.Option(help="mUSDC")] = 2000) -> None:
    """[local/Fuji] mint mUSDC cho ví (POST /demo/faucet)."""
    r = CTX.public().post("/demo/faucet", json={"address": CTX.wallet(as_).address, "amount_usdc": amount})
    ui.ok(f"{as_}: +{ui.money(r['minted'])} → số dư {ui.money(r['balance'])}")


@demo_app.command("e2e")
@handle
def demo_e2e(
    target_sec: Annotated[int, typer.Option(help="Mục tiêu nhỏ để audio thật lấp đầy nhanh")] = 30,
) -> None:
    """Kịch bản end-to-end trên Anvil + backend thật + QC thật (mục 6.11 với audio thật)."""
    from cli.demo import run_e2e

    raise typer.Exit(run_e2e(CTX, target_sec))


@demo_app.command("scenario-611")
@handle
def demo_scenario_611() -> None:
    """Đối chiếu số liệu mục 6.11 (2h/3h, 650 → 510 USDC) trên chain local, hiển thị VNĐ.

    Bỏ qua QC có chủ đích: ví QC oracle local (deployer) ghi trực tiếp 7.200/10.800 giây để tái hiện đúng con số.
    """
    from cli.demo import run_scenario_611

    raise typer.Exit(run_scenario_611(CTX))


if __name__ == "__main__":
    app()
