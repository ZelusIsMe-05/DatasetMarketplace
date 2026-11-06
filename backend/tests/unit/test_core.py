"""Unit test: tiền tệ, token, chuẩn hóa văn bản, CER, các bước QC thuần, Merkle, EIP-712, cấu hình môi trường."""
from __future__ import annotations

import time

import pytest
from eth_account import Account

from app.blockchain.eip712 import (
    Domain,
    claim_message,
    consent_message,
    recover_text,
    recover_typed,
    revoke_message,
    sign_text,
    sign_typed,
    typed_data,
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
from app.services.storage import PrivateStorage

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
    ]:
        td = typed_data(d, primary, msg)
        assert recover_typed(td, sign_typed(PK, td)) == addr
    assert recover_text("hello", sign_text(PK, "hello")) == addr


def test_decode_revert_selector():
    from eth_utils import keccak

    assert decode_revert("0x" + keccak(text="BadSignature()")[:4].hex()) == "BadSignature"
    assert decode_revert("0xdeadbeef") is None


# ------------------------------------------------------------------ cấu hình môi trường (§12)


BASE = {"VOICE_CAMPAIGNS": "0x" + "1" * 40, "TOKEN_ADDRESS": "0x" + "2" * 40, "RELAYER_PRIVATE_KEY": PK}
SECRETS = {"JWT_SECRET": "j" * 40, "TOKEN_SECRET": "t" * 40, "ADMIN_API_KEY": "admin"}


def _load(tmp_path, **env):
    return load_settings(env_file=tmp_path / "none.env", overrides={**BASE, **env})


def test_local_defaults(tmp_path):
    s = _load(tmp_path, NETWORK="local")
    assert s.network.chain_id == 31337 and s.network.allow_faucet_button and s.dev_mode


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
