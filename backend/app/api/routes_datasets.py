"""Tải dataset theo license, faucet demo. (Không còn vai trò quản trị — §3 #28.)"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request
from fastapi.responses import Response

from app.api.deps import ContainerDep
from app.core import ratelimit
from app.core.ratelimit import limiter
from app.schemas.dataset import (
    DownloadMessage,
    DownloadRequest,
    DownloadResponse,
    FaucetRequest,
    FaucetResponse,
    SnapshotResponse,
)

router = APIRouter(tags=["datasets"])
CampaignId = Annotated[int, Path(ge=0)]


@router.get("/datasets/{campaign_id}/download-message")
def download_message(c: ContainerDep, campaign_id: CampaignId, buyer: Annotated[str, Query()]) -> DownloadMessage:
    """Thông điệp người mua cần ký (personal_sign) để chứng minh sở hữu ví."""
    return c.datasets.download_message(campaign_id, buyer)


@router.post("/datasets/{campaign_id}/download")
@limiter.limit(ratelimit.DOWNLOAD)
def request_download(request: Request, c: ContainerDep, campaign_id: CampaignId, body: DownloadRequest) -> DownloadResponse:
    """Người mua ký thông điệp chứng minh ví → kiểm tra license on-chain → trả link tải có hạn."""
    return c.datasets.request_download(campaign_id, body.buyer, body.issued_at, body.nonce, body.signature)


@router.get("/datasets/files/{token}", response_class=Response)
def download_file(c: ContainerDep, token: str) -> Response:
    name, data = c.datasets.build_zip(token)
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/datasets/{campaign_id}/snapshots/{version}")
def snapshot_manifest(c: ContainerDep, campaign_id: CampaignId, version: Annotated[int, Path(ge=1)]) -> dict:
    """Manifest công khai của một phiên bản (đối chiếu Merkle root với sự kiện SnapshotPublished)."""
    return c.datasets.get_manifest(campaign_id, version)


demo_router = APIRouter(tags=["demo (chỉ local + Fuji)"])


@demo_router.post("/demo/faucet")
@limiter.limit(ratelimit.FAUCET)
def demo_faucet(request: Request, c: ContainerDep, body: FaucetRequest) -> FaucetResponse:
    """[CHỈ LOCAL + FUJI] mint mUSDC cho ví người mua demo; không tồn tại (404) khi NETWORK=mainnet."""
    assert c.faucet is not None
    return c.faucet.mint(body.address, body.amount_usdc)
