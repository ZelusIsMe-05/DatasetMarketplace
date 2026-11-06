"""Luồng người đóng góp: đồng thuận, nộp bản ghi, tiền, rút tiền, thu hồi."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Request, UploadFile

from app.api.deps import ContainerDep, CurrentUser
from app.core import ratelimit
from app.core.errors import BadRequest, PayloadTooLarge
from app.core.ratelimit import limiter
from app.schemas.common import TypedDataResponse
from app.schemas.contribution import (
    ClaimQuote,
    ClaimRequest,
    ClaimResponse,
    ConsentRequest,
    ConsentResponse,
    ConsentStatus,
    ContributionResult,
    MyContributions,
    RevokeRequest,
    RevokeResponse,
)

router = APIRouter()


@router.get("/consent/typed-data", tags=["consent"])
def consent_typed_data(c: ContainerDep, user: CurrentUser, campaign_id: Annotated[int, Query(ge=0)]) -> TypedDataResponse:
    """Dữ liệu EIP-712 `Consent` để ví ký (termsHash, nonce lấy từ chain)."""
    return c.consent.typed_data(user, campaign_id)


@router.get("/consent/status", tags=["consent"])
def consent_status(c: ContainerDep, user: CurrentUser, campaign_id: Annotated[int, Query(ge=0)]) -> ConsentStatus:
    return c.consent.status(user, campaign_id)


@router.post("/consent", tags=["consent"])
@limiter.limit(ratelimit.RELAY)
def consent(request: Request, c: ContainerDep, user: CurrentUser, body: ConsentRequest) -> ConsentResponse:
    """Nhận chữ ký EIP-712, relayer gọi giveConsentWithSig (relayer trả gas)."""
    return c.consent.submit(user, body.campaign_id, body.deadline, body.signature)


@router.post("/contributions", tags=["contributions"])
@limiter.limit(ratelimit.UPLOAD)
def submit_contribution(
    request: Request,
    c: ContainerDep,
    user: CurrentUser,
    token: Annotated[str, Form(description="prompt token nhận từ POST /campaigns/{id}/prompt")],
    audio: Annotated[UploadFile, File(description="bản ghi trực tiếp (wav/webm/ogg), tối đa 15 giây")],
    capture: Annotated[str, Form(description='phải là "live" (ghi âm trực tiếp)')] = "live",
) -> ContributionResult:
    """Nhận audio + prompt token → QC → nếu đạt thì registerContribution, trả tx hash."""
    if capture != "live":
        raise BadRequest("Chỉ chấp nhận bản ghi âm trực tiếp", code="not_live")
    data = audio.file.read(c.settings.max_upload_bytes + 1)
    if len(data) > c.settings.max_upload_bytes:
        raise PayloadTooLarge("File audio quá lớn")
    return c.contributions.submit(user, token, data)


@router.get("/me/contributions", tags=["contributions"])
def my_contributions(c: ContainerDep, user: CurrentUser) -> MyContributions:
    """Bản ghi của tôi, trạng thái, tiền chưa rút (VNĐ)."""
    return c.rewards.my_contributions(user)


@router.get("/me/claim-quote", tags=["rewards"])
def claim_quote(c: ContainerDep, user: CurrentUser, campaign_id: Annotated[int, Query(ge=0)]) -> ClaimQuote:
    """Số tiền sẽ nhận và phí rút hộ (VNĐ) trước khi ký; kèm dữ liệu EIP-712 `Claim`."""
    return c.rewards.claim_quote(user, campaign_id)


@router.post("/claim", tags=["rewards"])
@limiter.limit(ratelimit.RELAY)
def claim(request: Request, c: ContainerDep, user: CurrentUser, body: ClaimRequest) -> ClaimResponse:
    """Nhận chữ ký Claim, relayer gọi claimWithSig."""
    return c.rewards.claim(user, body.campaign_id, body.max_fee, body.deadline, body.signature)


@router.get("/revoke/typed-data", tags=["revoke"])
def revoke_typed_data(
    c: ContainerDep, user: CurrentUser, contribution_id: Annotated[int, Query(ge=0)]
) -> TypedDataResponse:
    return c.revoke.typed_data(user, contribution_id)


@router.post("/revoke", tags=["revoke"])
@limiter.limit(ratelimit.RELAY)
def revoke(request: Request, c: ContainerDep, user: CurrentUser, body: RevokeRequest) -> RevokeResponse:
    """Nhận chữ ký thu hồi, relayer gọi revokeWithSig, xóa audio + salt."""
    return c.revoke.revoke(user, body.contribution_id, body.deadline, body.signature)
