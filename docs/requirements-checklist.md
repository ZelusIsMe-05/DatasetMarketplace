# Checklist yêu cầu (đối chiếu đề xuất §5–§13)

Trạng thái: **I** = đã triển khai · **T** = có test tự động · **L** = đã kiểm chứng chạy thật trên local (Anvil) · **F** = chờ deploy Fuji.

## Chức năng — Smart contract (§9)
| # | Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|---|
| C1 | `createCampaign` mục tiêu, giá, tỷ lệ, hạn, hash câu mẫu/điều khoản, metadataURI, quỹ mồi | I T L | `test_CreateCampaignValidation`, `test_SeedFund…`, demo e2e |
| C2 | Đồng thuận `giveConsent` / `giveConsentWithSig` EIP-712 | I T L | `test_ConsentWithSigAndRevokeWithSig`, `test_ConsentSignatureBoundToTermsHash`, `…CannotBeReplayed` |
| C3 | `registerContribution` chỉ QC oracle, cần đồng thuận, chống trùng commitment | I T L | `test_OnlyQcCanRegisterAndPublish`, `test_RevertWithoutConsent`, `test_RevertDuplicateCommitment` |
| C4 | Giá = full × (0,3 + 0,7 × tiến độ), tiến độ theo bản ghi còn hiệu lực | I T L | `test_PriceTableMatchesSpec` (0/25/50/75/100%) |
| C5 | `buy(maxPrice)`, một license/ví, không bán khi tiến độ 0 | I T L | `test_RevertPriceTooHigh`, `test_OneLicensePerWallet`, `test_NothingToSell…` |
| C6 | Chia doanh thu accumulator O(1), bụi cho nền tảng, luôn đủ tiền | I T L | `test_ScenarioRevenueShareAndRevoke`, `test_RoundingNeverInsolvent`, `testFuzz_Solvency` (512 lần) |
| C7 | `claim` (miễn phí) và `claimWithSig` (phí ≤ maxFee) | I T L | `test_ClaimWithSigChargesFeeInAppToken`, `…RevertsIfFeeRaised`, `…ReplayReverts` |
| C8 | `revoke` / `revokeWithSig`: giữ tiền đã kiếm, giảm trọng số, ghi revokedAt | I T L | `test_ClaimAfterRevokeStillPaysEarned`, `test_RevokeAuthorization` |
| C9 | `withdraw` (người tạo, nền tảng, ví nhận phí), `withdrawSeed` sau hạn | I T L | `test_SeedFundPaysEarlyContributorsAndRefundsCreator` |
| C10 | `publishSnapshot` Merkle root | I T L | `test_PublishSnapshotEmitsEvent`, tải + kiểm proof trong e2e |
| C11 | Ngừng thu thập khi đủ mục tiêu / quá hạn; thu thập lại khi thu hồi tụt dưới mục tiêu | I T | `test_StopsCollecting…`, `test_ResumesCollectingAfterRevokeBelowTarget` |
| C12 | Kịch bản §6.11: An 2h, Bình 3h → 650 → An rút + thu hồi → 510 → Bình 720 | I T L | Foundry test + `giongque demo scenario-611` (12/12 trên Anvil) |
| C13 | MockUSDC 6 decimals chỉ local/Fuji; Deploy/SeedDemo chặn mainnet | I T L | `tests/integration/test_mainnet_guards.py` (forge script thật trên chain id 43114) |

## Chức năng — Backend API (§11) — đủ 16 endpoint, kiểm bằng `test_swagger_has_all_spec_endpoints`
| Endpoint | Trạng thái | Ghi chú |
|---|---|---|
| `POST /auth/google` | I | Xác minh Google ID token (`google-auth`) + chữ ký ví; **chưa thử với Google thật** (cần `GOOGLE_CLIENT_ID`) |
| `GET /fx` | I T L | cố định (local/Fuji), HTTP + cache 5 phút (mainnet) |
| `GET /campaigns`, `GET /campaigns/{id}` | I T L | tiến độ, giá VNĐ+units, số người, người mua, doanh thu, mẫu nghe thử, snapshot |
| `GET /campaigns/{id}/terms` | I T L | trả `matches` với `termsHash` on-chain |
| `POST /consent` | I T L | recover trước khi relayer gửi |
| `POST /campaigns/{id}/prompt` | I T L | câu chưa đọc + token HMAC 60 giây |
| `POST /contributions` | I T L | QC thật → registerContribution → tx hash |
| `GET /me/contributions`, `GET /me/claim-quote`, `POST /claim` | I T L | |
| `POST /revoke` | I T L | xóa audio + salt (kiểm trên đĩa trong test) |
| `POST /datasets/{id}/download` | I T L | license on-chain + link có hạn; zip kèm proof Merkle |
| `POST /demo/faucet` | I T L | 404 khi mainnet (`test_mainnet_profile_hides_mock_and_dev_routes`) |
| `POST /admin/snapshot/{id}`, `GET /admin/review` | I T L | `X-Admin-Key` |
| Bổ sung: `/health`, `/auth/challenge`, `/auth/dev-login` (chỉ local), `/auth/me`, `/consent/typed-data`, `/consent/status`, `/revoke/typed-data`, `/campaigns/drafts`, `/campaigns/sync`, `/campaigns/{id}/price`, `/revenue`, `/licenses/{addr}`, `/samples/{id}`, `/metadata/{id}`, `/datasets/{id}/download-message`, `/datasets/files/{token}`, `/datasets/{id}/snapshots/{v}`, `/admin/review/{id}` (+`/audio`), `/admin/relayer`, `/admin/sync` | I T L | xem Swagger |

## Chức năng — QC (§10)
| # | Bước | Trạng thái | Bằng chứng |
|---|---|---|---|
| Q1 | Độ dài 1,5–15 giây | I T L | unit + `test_too_short_rejected` |
| Q2 | Silero VAD, ≥ 50% giọng nói | I T L | `test_silence_rejected_by_vad` |
| Q3 | Tốc độ 5–30 ký tự/giây | I T | unit |
| Q4 | wav2vec2 tiếng Việt CTC (`nguyenvulebinh/wav2vec2-base-vietnamese-250h`), CPU | I T L | 8 bản đọc thật đều `pass`, CER 0.00 |
| Q5 | CER (jiwer) trên văn bản chuẩn hóa NFC | I T L | unit + `test_wrong_sentence_rejected` |
| Q6 | Forced alignment `torchaudio.functional.forced_align` + điểm từng từ | I T L | đọc thiếu nửa câu không `pass` |
| Q7 | pass / gray / reject; gray → hàng chờ duyệt tay | I T L | `test_gray_queue_admin_approve` |
| Q8 | Chống trùng: câu đã đọc, audio trùng, commitment | I T L | demo e2e |
| Q9 | Model nạp một lần, dùng lại; chạy độc lập bằng CMD | I L | `QcService`, `python -m app.qc`, `scripts\qc-check.bat` |
| Q10 | Định dạng trình duyệt (webm/opus) | I T | `test_browser_webm_opus_decodes_and_passes` |
| Q11 | Chọn ngưỡng bằng 50 bản đúng/50 bản sai của đội (§10.4) | **Chưa** | Ngưỡng đang theo đề xuất; fixture hiện là giọng TTS neural, cần ghi âm người thật |

## Phi chức năng
| # | Yêu cầu | Trạng thái |
|---|---|---|
| N1 | Người đóng góp không cần AVAX (relayer trả gas) | I T L (kiểm số dư AVAX không đổi) |
| N2 | Audio/PII không lên chain; commitment có salt; xóa audio + salt khi thu hồi | I T L |
| N3 | Hiển thị VNĐ kèm số USDC, dấu "≈" | I T L |
| N4 | `NETWORK=local/fuji/mainnet`, khác biệt chỉ ở config/script/.env | I T |
| N5 | Bí mật trong biến môi trường, `.env.example`, không commit `.env` | I (đã kiểm `git check-ignore`); hướng dẫn lấy từng biến: `docs/environment-variables.md` |
| N6 | Rate limit, CORS, health check, xử lý lỗi, log an toàn | I T L |
| N7 | Chạy bằng Windows CMD | I L (`setup` chưa chạy lại từ máy trắng; các script còn lại đã chạy thật) |
| N8 | CLI cho mọi nghiệp vụ chính | I L |
| N9 | Frontend đầy đủ hai trải nghiệm (Kiếm tiền / Đặt hàng–Mua) + quản trị, hiển thị VNĐ | I T L (Playwright e2e 7/7, axe 0 vi phạm, xem `docs/frontend-design-system.md`) |
| N10 | Deploy Fuji + verify Snowtrace | **F** — chưa làm, cần AVAX faucet và sự cho phép |
