"""Chép ABI từ contracts/out (forge build) sang app/blockchain/abi/ để backend chạy độc lập."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "contracts" / "out"
DEST = Path(__file__).resolve().parents[1] / "app" / "blockchain" / "abi"
FRONTEND_DEST = ROOT / "frontend" / "lib" / "abi"


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for name, src in {"VoiceCampaigns": "VoiceCampaigns.sol", "MockUSDC": "MockUSDC.sol"}.items():
        art = json.loads((OUT / src / f"{name}.json").read_text(encoding="utf-8"))
        (DEST / f"{name}.json").write_text(json.dumps(art["abi"], indent=1), encoding="utf-8")
        if FRONTEND_DEST.parent.exists():
            FRONTEND_DEST.mkdir(parents=True, exist_ok=True)
            (FRONTEND_DEST / f"{name}.json").write_text(json.dumps(art["abi"], indent=1), encoding="utf-8")
        print("exported", name, len(art["abi"]), "entries")


if __name__ == "__main__":
    main()
