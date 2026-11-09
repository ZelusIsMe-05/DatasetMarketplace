"""Unit test: tiền tệ, token, chuẩn hóa văn bản, CER, các bước QC thuần, Merkle, EIP-712, cấu hình môi trường."""
from __future__ import annotations

import hashlib
import json
import time
from urllib.parse import unquote

import httpx
import pytest
from eth_account import Account

from app.blockchain.eip712 import (
    Domain,
    TokenDomain,
    buy_message,
    claim_message,
    consent_message,
    create_message,
    permit_message,
    publish_snapshot_message,
    recover_text,
    recover_typed,
    revoke_message,
    sign_text,
    sign_typed,
    split_signature,
    typed_data,
    withdraw_message,
    withdraw_seed_message,
)
from app.blockchain.errors import decode_revert
from app.core.config import load_settings
from app.core.money import format_vnd, units_to_vnd, vnd_to_units
from app.core.security import TokenError, sign_token, verify_token
from app.qc.checker import (
    QCResult,
    Thresholds,
    check_duration,
    check_reading_rate,
    check_speech_ratio,
    ctc_feasible,
    decide,
    reading_rate,
    weight_seconds,
)
from app.qc.text import canonical_prompt_set, cer, normalize_text, parse_prompt_set
from app.services import merkle
from app.services.marketplace_service import split_of_sale
from app.services.storage import B2Storage, PrivateStorage, StorageError

PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"


# ------------------------------------------------------------------ money (§12.6)


def test_money_matches_spec_examples():
    assert units_to_vnd(650_000_000, 26_000) == 16_900_000
    assert format_vnd(16_900_000) == "16.900.000 ₫"
    assert vnd_to_units(26_000_000, 26_000) == 1_000_000_000
    assert units_to_vnd(100_000, 26_000) == 2_600  # phí rút hộ ≈ 2.600 ₫


@pytest.mark.parametrize(("bps", "usdc"), [(0, 300), (2500, 475), (5000, 650), (7500, 825), (10000, 1000)])
def test_price_table(bps, usdc):
    full = 1_000 * 10**6
    assert full * (3000 + 7000 * bps // 10_000) // 10_000 == usdc * 10**6


def test_split_of_sale_scenario_611():
    contrib, creator, platform = split_of_sale(650 * 10**6, 18_000, 8000, 1000)
    assert creator == 65 * 10**6
    assert contrib == 520 * 10**6  # làm tròn lên => đúng 520
    assert contrib + creator + platform == 650 * 10**6


# ------------------------------------------------------------------ token HMAC


def test_token_roundtrip_and_tamper():
    t = sign_token("s" * 32, "prompt", {"uid": 1}, 60)
    assert verify_token("s" * 32, "prompt", t.token)["uid"] == 1
    with pytest.raises(TokenError):
        verify_token("s" * 32, "download", t.token)  # sai mục đích
    with pytest.raises(TokenError):
        verify_token("x" * 32, "prompt", t.token)  # sai khóa
    raw, mac = t.token.split(".")
    with pytest.raises(TokenError):
        verify_token("s" * 32, "prompt", raw[:-2] + "AA." + mac)


def test_token_expiry():
    t = sign_token("s" * 32, "prompt", {}, 60)
    with pytest.raises(TokenError, match="hết hạn"):
        verify_token("s" * 32, "prompt", t.token, now=time.time() + 61)


# ------------------------------------------------------------------ văn bản + CER (§7.7)


def test_normalize_text():
    assert normalize_text("  Tôi muốn, MỞ tài-khoản!! ") == "tôi muốn mở tài khoản"
    decomposed = "tôi"  # "tôi" dạng NFD
    assert normalize_text(decomposed) == "tôi"


def test_cer_values():
    assert cer("tôi muốn mở", "Tôi muốn mở.") == 0.0
    assert cer("abc", "") == 1.0
    assert 0 < cer("tôi muốn mở tài khoản", "tôi muốn mở tài khoảng") < 0.1
    with pytest.raises(ValueError):
        cer("", "abc")


def test_canonical_prompt_set_roundtrip():
    canon = canonical_prompt_set(["  câu một  ", "câu hai"])
    assert canon == "câu một\ncâu hai\n"
    assert parse_prompt_set(canon) == ["câu một", "câu hai"]
    with pytest.raises(ValueError):
        canonical_prompt_set(["", "x"])


# ------------------------------------------------------------------ các bước QC thuần (§10.1)


@pytest.mark.parametrize(("dur", "ok"), [(1.4, False), (1.5, True), (8, True), (15, True), (15.1, False)])
def test_duration_rule(dur, ok):
    assert (check_duration(dur, Thresholds()) is None) == ok


def test_speech_ratio_and_rate():
    th = Thresholds()
    assert check_speech_ratio(1.0, 4.0, th) is not None
    assert check_speech_ratio(2.5, 4.0, th) is None
    cps = reading_rate("tôi muốn mở", 1.0)  # 9 ký tự / 1 giây
    assert cps == 9 and check_reading_rate(cps, th) is None
    assert check_reading_rate(40, th) is not None and check_reading_rate(2, th) is not None


def test_ctc_feasibility_accounts_for_repeats():
    assert ctc_feasible([1, 2, 3], 3)
    assert not ctc_feasible([1, 1, 2], 3)  # cần blank giữa hai token lặp
    assert ctc_feasible([1, 1, 2], 4)
    assert not ctc_feasible([], 10)


def _res(cer_, align, words=(("a", 0.9),), oov=()):
    return QCResult(decision="reject", cer=cer_, align_score=align, word_scores=list(words), oov_chars=list(oov))


def test_decision_thresholds():
    th = Thresholds()
    assert decide(_res(0.05, 0.9), th).decision == "pass"
    assert decide(_res(0.2, 0.5), th).decision == "gray"
    assert decide(_res(0.05, 0.9, words=(("a", 0.1),)), th).decision == "gray"  # bỏ từ
    assert decide(_res(0.05, 0.9, oov=("x",)), th).decision == "gray"  # ký tự ngoài vocab: tối đa xám
    assert decide(_res(0.5, 0.3), th).decision == "reject"


def test_weight_floor():
    r = QCResult(decision="pass", duration_sec=4.9, speech_sec=2.97)
    assert weight_seconds(r, "speech") == 2
    assert weight_seconds(r, "duration") == 4


# ------------------------------------------------------------------ Merkle (§7.5)


def test_merkle_proofs_all_sizes():
    for n in range(1, 9):
        leaves = [merkle.leaf_hash(i, "0x" + f"{i:064x}", f"audio/{i}.wav") for i in range(n)]
        root = merkle.root(leaves)
        for leaf in leaves:
            assert merkle.verify(merkle.proof(leaves, leaf), root, leaf)
        assert not merkle.verify(merkle.proof(leaves, leaves[0]), root, merkle.leaf_hash(99, "0x" + "0" * 64, "x"))


# ------------------------------------------------------------------ EIP-712 / EIP-191


def test_eip712_sign_recover_all_types():
    addr = Account.from_key(PK).address
    d = Domain(31337, "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0")
    for primary, msg in [
        ("Consent", consent_message(0, addr, "0x" + "ab" * 32, 0, 123)),
        ("Revoke", revoke_message(5, 1, 123)),
        ("Claim", claim_message(0, addr, 100_000, 2, 123)),
        # nền tảng trả phí mạng hộ (implementation-plan §3 #25)
        ("CreateCampaign", create_message(addr, {
            "targetSec": 360, "fullPrice": 100_000_000, "contributorBps": 8000, "creatorBps": 1000, "deadline": 999,
            "promptSetHash": "0x" + "cd" * 32, "termsHash": "0x" + "ef" * 32, "metadataURI": "http://x/metadata/1",
            "seedRatePerSec": 216, "seedAmount": 10_000_000}, 500_000, 3, 123)),
        ("Buy", buy_message(0, addr, 30_000_000, 500_000, 4, 123)),
        ("Withdraw", withdraw_message(addr, 100_000, 5, 123)),
        ("WithdrawSeed", withdraw_seed_message(0, addr, 100_000, 6, 123)),
        # chủ chiến dịch ký công bố phiên bản dataset (§3 #28)
        ("PublishSnapshot", publish_snapshot_message(0, "0x" + "12" * 32, "http://x/datasets/0/snapshots/1", 7, 123)),
    ]:
        td = typed_data(d, primary, msg)
        assert recover_typed(td, sign_typed(PK, td)) == addr
    token = TokenDomain("Mock USDC", "1", 31337, "0x5FbDB2315678afecb367f032d93F642f64180aa3")
    td = typed_data(token, "Permit", permit_message(addr, d.verifying_contract, 10_500_000, 0, 123))
    sig = sign_typed(PK, td)
    assert recover_typed(td, sig) == addr and td["domain"]["name"] == "Mock USDC"
    v, r, s_ = split_signature(sig)
    assert v in (27, 28) and len(r) == len(s_) == 32
    with pytest.raises(ValueError):
        split_signature("0x1234")
    assert recover_text("hello", sign_text(PK, "hello")) == addr


def test_decode_revert_selector():
    from eth_utils import keccak

    assert decode_revert("0x" + keccak(text="BadSignature()")[:4].hex()) == "BadSignature"
    assert decode_revert("0xdeadbeef") is None


# ------------------------------------------------------------------ cấu hình môi trường (§12)


BASE = {"VOICE_CAMPAIGNS": "0x" + "1" * 40, "TOKEN_ADDRESS": "0x" + "2" * 40, "RELAYER_PRIVATE_KEY": PK}
SECRETS = {"JWT_SECRET": "j" * 40, "TOKEN_SECRET": "t" * 40}


def _load(tmp_path, **env):
    return load_settings(env_file=tmp_path / "none.env", overrides={**BASE, **env})


def test_local_defaults(tmp_path):
    s = _load(tmp_path, NETWORK="local")
    assert s.network.chain_id == 31337 and s.network.allow_faucet_button and s.dev_mode
    # phí xử lý mặc định: 0,5 USDC (≈ 13.000 ₫) tạo/mua, 0,1 USDC (≈ 2.600 ₫) rút
    assert (s.relay_fee_create, s.relay_fee_buy, s.relay_fee_withdraw) == (500_000, 500_000, 100_000)
    assert s.network.token_permit_version == "1"


def test_relay_fee_parsing(tmp_path):
    s = _load(tmp_path, NETWORK="local", RELAY_FEE_CREATE_USDC="1,25", RELAY_FEE_BUY_USDC="0", RELAY_FEE_WITHDRAW_USDC="0.000001")
    assert (s.relay_fee_create, s.relay_fee_buy, s.relay_fee_withdraw) == (1_250_000, 0, 1)
    for bad in ("-1", "0.0000001", "abc"):
        with pytest.raises(ValueError, match="RELAY_FEE_CREATE_USDC"):
            _load(tmp_path, NETWORK="local", RELAY_FEE_CREATE_USDC=bad)


def test_dev_auth_refused_outside_local(tmp_path):
    with pytest.raises(ValueError, match="DEV_AUTH_ENABLED"):
        _load(tmp_path, NETWORK="fuji", DEV_AUTH_ENABLED="true", **SECRETS)


def test_fuji_requires_secrets(tmp_path):
    with pytest.raises(ValueError, match="JWT_SECRET"):
        _load(tmp_path, NETWORK="fuji", DEV_AUTH_ENABLED="false")
    s = _load(tmp_path, NETWORK="fuji", DEV_AUTH_ENABLED="false", **SECRETS)
    assert s.network.allow_mock_token and not s.dev_mode


def test_mainnet_profile_blocks_mocks(tmp_path):
    with pytest.raises(ValueError, match="FX_URL"):
        _load(tmp_path, NETWORK="mainnet", DEV_AUTH_ENABLED="false", **SECRETS)
    s = _load(tmp_path, NETWORK="mainnet", DEV_AUTH_ENABLED="false", FX_URL="https://fx.example/rate", **SECRETS)
    assert not s.network.allow_mock_token and not s.network.allow_faucet_button and s.network.fx_source == "http"
    assert s.network.token_permit_version == "2"  # USDC của Circle


def test_review_auto_approve_hours(tmp_path):
    assert _load(tmp_path, NETWORK="local").review_auto_approve_hours == 72
    assert _load(tmp_path, NETWORK="local", REVIEW_AUTO_APPROVE_HOURS="0").review_auto_approve_hours == 0  # chờ mãi
    with pytest.raises(ValueError, match="REVIEW_AUTO_APPROVE_HOURS"):
        _load(tmp_path, NETWORK="local", REVIEW_AUTO_APPROVE_HOURS="-1")


def test_b2_config(tmp_path):
    s = _load(tmp_path, NETWORK="local")
    assert s.b2_bucket is None  # mặc định lưu đĩa
    s = _load(tmp_path, NETWORK="local", B2_KEY_ID="kid", B2_APPLICATION_KEY="secret", B2_BUCKET="voice")
    assert (s.b2_key_id, s.b2_bucket) == ("kid", "voice") and "secret" not in repr(s)
    with pytest.raises(ValueError, match="B2_KEY_ID"):
        _load(tmp_path, NETWORK="local", B2_APPLICATION_KEY="secret", B2_BUCKET="voice")


def test_unknown_network(tmp_path):
    with pytest.raises(ValueError, match="NETWORK"):
        _load(tmp_path, NETWORK="devnet")


# ------------------------------------------------------------------ kho riêng tư


def test_storage_save_delete_and_traversal(tmp_path):
    st = PrivateStorage(tmp_path)
    rel = st.save_audio(1, b"RIFF")
    assert st.exists(rel) and st.read(rel) == b"RIFF"
    assert st.delete(rel) and not st.exists(rel)
    with pytest.raises(ValueError):
        st.read("../../etc/passwd")


# ------------------------------------------------------------------ Backblaze B2 (API gốc, giả lập bằng httpx.MockTransport)


class FakeB2:
    """Bucket B2 giả trong bộ nhớ: đủ các lệnh API gốc mà B2Storage dùng, kiểm cả header bắt buộc."""

    def __init__(self, allowed_bucket: str | None = "voice", bucket_type: str = "allPrivate"):
        self.bucket_type = bucket_type
        self.network_failures = 0  # số lần tới giả lập mạng chập chờn (ConnectTimeout)
        self.files: dict[str, list[tuple[str, bytes]]] = {}  # tên file -> các phiên bản (fileId, nội dung)
        self.tokens, self.auth_calls, self.expire_next = 0, 0, False
        self.allowed_bucket = allowed_bucket
        self.uploads = 0

    def handler(self, req: httpx.Request) -> httpx.Response:
        if self.network_failures:
            self.network_failures -= 1
            raise httpx.ConnectTimeout("timed out", request=req)
        url, path = str(req.url), req.url.path
        if path.endswith("/b2_authorize_account"):
            self.auth_calls += 1
            self.tokens += 1
            assert req.headers["authorization"].startswith("Basic ")
            allowed = {"bucketName": self.allowed_bucket, "bucketId": "bkt1"} if self.allowed_bucket else {"bucketName": None}
            return httpx.Response(200, json={"accountId": "acc", "authorizationToken": f"tok{self.tokens}",
                                             "apiUrl": "https://api.b2", "downloadUrl": "https://dl.b2", "allowed": allowed})
        current = f"tok{self.tokens}"
        if self.expire_next:
            self.expire_next = False
            return httpx.Response(401, json={"code": "expired_auth_token"})
        if path.endswith("/b2_list_buckets"):
            return httpx.Response(200, json={"buckets": [{"bucketId": "bkt1", "bucketName": "voice", "bucketType": self.bucket_type}]})
        if path.endswith("/b2_get_upload_url"):
            assert req.headers["authorization"] == current and json.loads(req.content)["bucketId"] == "bkt1"
            return httpx.Response(200, json={"uploadUrl": "https://up.b2/upload", "authorizationToken": "uptok"})
        if url == "https://up.b2/upload":
            h = req.headers
            assert h["authorization"] == "uptok" and h["x-bz-server-side-encryption"] == "AES256"
            assert h["x-bz-content-sha1"] == hashlib.sha1(req.content).hexdigest()  # noqa: S324
            name = unquote(h["x-bz-file-name"])
            self.uploads += 1
            self.files.setdefault(name, []).append((f"id{self.uploads}", req.content))
            return httpx.Response(200, json={"fileName": name})
        if url.startswith("https://dl.b2/file/voice/"):
            assert req.headers["authorization"] == current
            versions = self.files.get(unquote(url.removeprefix("https://dl.b2/file/voice/")))
            if not versions:
                return httpx.Response(404)
            return httpx.Response(200, content=b"" if req.method == "HEAD" else versions[-1][1])
        if path.endswith("/b2_list_file_versions"):
            body = json.loads(req.content)
            files = [{"fileName": n, "fileId": fid} for n in sorted(self.files) if n.startswith(body["prefix"])
                     for fid, _ in self.files[n]]
            return httpx.Response(200, json={"files": files, "nextFileName": None, "nextFileId": None})
        if path.endswith("/b2_delete_file_version"):
            body = json.loads(req.content)
            self.files[body["fileName"]] = [v for v in self.files[body["fileName"]] if v[0] != body["fileId"]]
            if not self.files[body["fileName"]]:
                del self.files[body["fileName"]]
            return httpx.Response(200, json=body)
        return httpx.Response(400, json={"code": "unexpected", "url": url})


def _b2(fake: FakeB2, prefix: str = "local-abc") -> B2Storage:
    return B2Storage("kid", "secret-app-key", "voice", prefix, client=httpx.Client(transport=httpx.MockTransport(fake.handler)))


def test_b2_save_read_delete_all_versions():
    fake = FakeB2()
    st = _b2(fake)
    st.check()
    rel = st.save_audio(3, b"RIFF....WAVE")
    assert rel.startswith("audio/3/") and rel.endswith(".wav")
    assert list(fake.files) == [f"local-abc/{rel}"]
    assert st.exists(rel) and st.read(rel) == b"RIFF....WAVE"
    fake.files[f"local-abc/{rel}"].append(("old", b"x"))  # B2 giữ phiên bản cũ ⇒ xóa phải xóa hết
    assert st.delete(rel) and not st.exists(rel) and fake.files == {}
    assert not st.delete(rel) and not st.delete(None) and not st.exists(None)
    with pytest.raises(FileNotFoundError):
        st.read(rel)
    with pytest.raises(ValueError):
        st.read("../x.wav")
    assert st.describe() == "b2:voice/local-abc" and "secret" not in repr(st)


def test_b2_reauthorizes_on_expired_token():
    fake = FakeB2()
    st = _b2(fake)
    rel = st.save_audio(1, b"RIFF")
    fake.expire_next = True  # token 24 giờ hết hạn ⇒ xác thực lại một lần rồi làm tiếp
    assert st.read(rel) == b"RIFF" and fake.auth_calls == 2


def test_b2_bucket_lookup_and_wrong_bucket():
    st = _b2(FakeB2(allowed_bucket=None))  # key toàn tài khoản ⇒ tìm bucket bằng b2_list_buckets
    st.check()
    assert st.save_audio(2, b"RIFF")
    with pytest.raises(StorageError, match="chỉ được dùng cho bucket"):
        _b2(FakeB2(allowed_bucket="other")).check()
    with pytest.raises(StorageError, match="Public"):  # audio cá nhân không được nằm trong bucket công khai
        _b2(FakeB2(bucket_type="allPublic")).check()


def test_b2_delete_prefix_only_touches_that_network():
    fake = FakeB2()
    a, b = _b2(fake, "local-aaa"), _b2(fake, "fuji-bbb")
    a.save_audio(1, b"1")
    a.save_audio(1, b"2")
    keep = b.save_audio(1, b"3")
    assert a.delete_prefix("local-") == 2
    assert list(fake.files) == [f"fuji-bbb/{keep}"]


def test_b2_retries_flaky_network_then_reports_503(monkeypatch):
    import app.services.storage as storage_mod

    monkeypatch.setattr(storage_mod.time, "sleep", lambda _s: None)
    fake = FakeB2()
    st = _b2(fake)
    fake.network_failures = 2  # hai lần timeout rồi mạng ổn lại ⇒ vẫn lưu được
    rel = st.save_audio(1, b"RIFF")
    assert st.read(rel) == b"RIFF"
    fake.network_failures = 99  # mất mạng hẳn ⇒ lỗi 503 tiếng Việt, không phải 500
    with pytest.raises(StorageError) as e:
        st.read(rel)
    assert e.value.status_code == 503 and e.value.code == "storage_unavailable" and "thử lại" in e.value.message
