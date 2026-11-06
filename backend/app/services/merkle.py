"""Cây Merkle cho phiên bản dataset (đề xuất §7.5).

Lá = keccak256(keccak256(abi.encode(uint256 contributionId, bytes32 commitment, string path)))
(băm kép giống OpenZeppelin StandardMerkleTree). Nút cha = keccak256(sort(a, b)) nên proof
kiểm được bằng `MerkleProof.verify` của OpenZeppelin. Nút lẻ được đưa thẳng lên tầng trên.
"""
from __future__ import annotations

from eth_abi import encode
from eth_utils import keccak


def leaf_hash(contribution_id: int, commitment: str, path: str) -> bytes:
    inner = keccak(encode(["uint256", "bytes32", "string"], [contribution_id, bytes.fromhex(commitment[2:]), path]))
    return keccak(inner)


def _pair(a: bytes, b: bytes) -> bytes:
    return keccak(a + b) if a < b else keccak(b + a)


def build_levels(leaves: list[bytes]) -> list[list[bytes]]:
    if not leaves:
        raise ValueError("cần ít nhất một lá")
    levels = [sorted(leaves)]
    while len(levels[-1]) > 1:
        cur = levels[-1]
        nxt = [_pair(cur[i], cur[i + 1]) if i + 1 < len(cur) else cur[i] for i in range(0, len(cur), 2)]
        levels.append(nxt)
    return levels


def root(leaves: list[bytes]) -> bytes:
    return build_levels(leaves)[-1][0]


def proof(leaves: list[bytes], leaf: bytes) -> list[bytes]:
    levels = build_levels(leaves)
    idx = levels[0].index(leaf)
    out: list[bytes] = []
    for level in levels[:-1]:
        sib = idx ^ 1
        if sib < len(level):
            out.append(level[sib])
        idx //= 2
    return out


def verify(proof_: list[bytes], root_: bytes, leaf: bytes) -> bool:
    h = leaf
    for p in proof_:
        h = _pair(h, p)
    return h == root_
