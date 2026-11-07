# Kế hoạch triển khai Dataset Marketplace (Backend + Smart Contract trước, Frontend sau)

Nguồn sự thật: [`DatasetMarketplace_Hackathon.md`](../DatasetMarketplace_Hackathon.md) (gọi tắt là **đề xuất**).
Tài liệu này ghi lại phân tích, thiết kế module, thứ tự phụ thuộc và **mọi chỗ lệch so với đề xuất kèm lý do**.

---

## 1. Vai trò và nghiệp vụ

| Vai trò | On-chain | Off-chain (backend) |
|---|---|---|
| Người tạo chiến dịch | `createCampaign` (tự ký ví, nạp quỹ mồi), `withdraw`, `withdrawSeed` | Soạn nháp chiến dịch: metadata, bộ câu mẫu, điều khoản → backend tính `promptSetHash`, `termsHash`, quy đổi VNĐ→USDC |
| Người đóng góp | Không tự gửi giao dịch (relayer gửi `giveConsentWithSig`, `claimWithSig`, `revokeWithSig`); vẫn có thể tự gọi `claim`/`revoke` | Đăng nhập Google, gắn 1 email ↔ 1 ví, ký EIP-712, nhận câu mẫu + prompt token, ghi âm, xem tiền chưa rút |
| Người mua | `approve` + `buy(campaignId, maxPrice)` bằng ví của mình | Ký thông điệp chứng minh ví → backend kiểm license on-chain → link tải có hạn |
| QC oracle | `registerContribution`, `publishSnapshot` | Pipeline QC, commitment có salt, đóng gói dataset, Merkle root |
| Nền tảng | Nhận phần còn lại + bụi làm tròn qua `withdraw`; owner đặt `setClaimFee`, `setQcOracle` | Relayer (ví nóng trả gas), hàng chờ duyệt tay |

### Dữ liệu nằm ở đâu

| Dữ liệu | Blockchain | Database (SQLite hoặc PostgreSQL/Neon) | Kho riêng tư (đĩa) |
|---|---|---|---|
| Tiền, giá, tỷ lệ chia, hạn, mục tiêu | ✓ | cache chỉ mục sự kiện | |
| `promptSetHash`, `termsHash`, `metadataURI` | ✓ | văn bản gốc | |
| Đồng thuận (thời điểm), thu hồi (`revokedAt`) | ✓ | bản ghi giao dịch relayer | |
| Commitment `keccak256(audio ‖ salt)`, số giây | ✓ | ✓ | |
| Salt 32 byte | ✗ | ✓ (xóa khi thu hồi) | |
| Audio | ✗ **không bao giờ** | đường dẫn | ✓ (xóa khi thu hồi / bị loại) |
| Email, user ↔ ví | ✗ | ✓ | |
| License | ✓ | cache sự kiện `Purchased` | |
| Phiên bản dataset | Merkle root (sự kiện `SnapshotPublished`) | manifest + proof | audio của phiên bản |

### Luồng gọi

```
CLI / Frontend ──HTTP──▶ FastAPI ──▶ services ──▶ repositories ──▶ SQLite / PostgreSQL (Neon)
                                   │            └▶ storage (audio riêng tư)
                                   ├▶ qc (Silero VAD + wav2vec2 CTC + forced_align + CER)
                                   ├▶ blockchain.client (đọc contract)
                                   ├▶ blockchain.relayer (ký + gửi tx, quản lý nonce/gas/receipt)
                                   └▶ blockchain.indexer (đọc sự kiện → DB, xử lý thu hồi tự gửi)
Người tạo / người mua ──ví của họ──▶ VoiceCampaigns (createCampaign, approve+buy, withdraw)
```

---

## 2. Thứ tự phụ thuộc giữa các module

1. `contracts/` (ABI là hợp đồng giao tiếp cho mọi thứ khác) → `forge build/test`, Deploy, SeedDemo.
2. `backend/app/core` (config theo `NETWORK`, money, bảo mật token, lỗi, logging).
3. `backend/app/models` + Alembic migration → `repositories`.
4. `backend/app/blockchain` (ABI, client, EIP-712, relayer, indexer).
5. `backend/app/qc` (độc lập, chạy được bằng `python -m app.qc`).
6. `backend/app/services` (auth → campaign → consent → prompt → contribution → rewards/revoke → marketplace → dataset/snapshot → admin).
7. `backend/app/api` (routers mỏng gọi services) → `main.py`.
8. `backend/cli` (gọi API + gọi contract trực tiếp cho thao tác của ví người tạo/người mua).
9. `scripts/*.bat` → demo end-to-end.
10. `frontend/` (khung Next.js, dùng lại các kiểu dữ liệu của API).

---

## 3. Đối chiếu code mẫu với nghiệp vụ — các lỗi/điểm không nhất quán đã phát hiện

| # | Vị trí trong đề xuất | Vấn đề | Cách xử lý (thay đổi nhỏ nhất) |
|---|---|---|---|
| 1 | §9.2 `buy()` | **Lỗi mất khả năng thanh toán do làm tròn.** `distributed = floor(accDelta·W/1e18)` được trừ mỗi lần bán, nhưng tiền mỗi người là `floor(w·Σacc/1e18)` cộng dồn → tổng nghĩa vụ có thể vượt số dư. Ví dụ: 1 người 3 giây, 2 lần bán với phần chia ≡ 2 (mod 3) → nợ 2S+1 trong khi chỉ giữ 2S; lần rút cuối bị revert. Fuzz test tìm ra trong 10 lần chạy. | Làm tròn **lên** phần giữ lại cho người đóng góp: `distributed = ceil(accDelta·W/1e18)`. Công thức chia và tỷ lệ không đổi; nền tảng vẫn nhận phần lẻ. Hệ quả: vài đơn vị 1e-6 USDC có thể nằm lại contract, **không bao giờ thiếu tiền**. Test `test_RoundingNeverInsolvent`, `testFuzz_Solvency`; assert cuối của kịch bản 6.11 đổi từ `== 0` sang `<= 2`. |
| 2 | §9.2 `progressBps` | Chia cho 0 (panic) khi đọc chiến dịch không tồn tại → backend gọi view bị lỗi khó hiểu. | Trả 0 khi `targetSec == 0`. |
| 3 | §9.2 `publishSnapshot` | Không kiểm tra `campaignId`. | Revert `InvalidParams` nếu không tồn tại. |
| 4 | §9.1 sự kiện | Không có sự kiện cho `withdraw`/`withdrawSeed` → backend không lập chỉ mục được doanh thu đã rút. | Thêm `Withdrawn`, `SeedWithdrawn` (chỉ thêm, không đổi hành vi). |
| 5 | §12.4 `SeedDemo` | `keccak256("prompt-set-v1")`, `keccak256("consent-terms-v1")` là hash giả → điều khoản mà backend phục vụ không khớp `termsHash` on-chain, chữ ký đồng thuận vô nghĩa. | Đọc file thật `seed/demo-campaign/prompts.txt`, `terms.md` (`vm.readFile`) để tính hash; backend dùng đúng các file đó. Mục tiêu/hạn cấu hình được qua env (mặc định giữ 36.000 giây, 30 ngày). |
| 6 | §12.4 `foundry.toml` | Không có `fs_permissions` → `vm.readFile`/`vm.writeJson` bị từ chối. | Thêm quyền đọc `../seed`, ghi `./deployments` (Deploy ghi địa chỉ ra `deployments/<chainId>.json` để backend tự đọc). |
| 7 | §10.3 `qc.py` | `torchaudio.load` trên Windows cần backend phụ; trình duyệt gửi webm/opus. | Giải mã bằng `soundfile` (wav/flac/ogg/mp3) và PyAV (webm/opus/m4a), resample bằng `torchaudio.functional.resample`. |
| 8 | §10.3 `qc.py` | `forced_align` ném lỗi khi số khung < số token + số ký tự lặp liên tiếp; chỉ kiểm tra `len(target_ids) > T`. | Kiểm tra đúng điều kiện CTC và bắt lỗi → `reject` có lý do. |
| 9 | §10.3 `qc.py` | Câu mẫu có ký tự ngoài vocab vẫn có thể `pass`. | Nếu có ký tự ngoài vocab: tối đa `gray` (duyệt tay). Khi tạo chiến dịch, backend kiểm tra vocab và từ chối câu mẫu lỗi (§10.2). |
| 10 | §6.4 "trọng số = số giây hợp lệ" | Không nói rõ dùng tổng thời lượng hay số giây có giọng nói. | Dùng `floor(số giây giọng nói theo VAD)` (khớp §1 "số giây giọng nói hợp lệ"); nếu < 1 giây → loại. Cấu hình `QC_WEIGHT_SOURCE=speech|duration`. |
| 11 | §6.4 "chỉ ghi âm trực tiếp" | API nào cũng nhận byte; không có kiểm tra phía server. | Prompt token HMAC 60 giây, dùng một lần, gắn user + câu; server kiểm tra **thời lượng audio ≤ thời gian từ lúc cấp câu** (không thể nộp file dài chuẩn bị sẵn); chọn câu cụ thể (`prompt_id`) chỉ được bật ở `NETWORK=local` + `DEV_AUTH_ENABLED`. |
| 12 | §11 | Thiếu endpoint để client lấy dữ liệu EIP-712 cần ký, duyệt/loại hàng chờ, đồng bộ sự kiện, tạo nháp chiến dịch. | Bổ sung: `GET /consent/typed-data`, `GET /revoke/typed-data`, `POST /campaigns/drafts`, `POST /campaigns/sync`, `POST /admin/review/{id}`, `GET /auth/challenge`, `GET /health`… (giữ nguyên toàn bộ endpoint của §11). |
| 13 | §6.8 thu hồi | Người dùng có thể tự gọi `revoke` on-chain (không qua `/revoke`) → server không biết để xóa audio. | Indexer nghe `ConsentRevoked` và xóa audio + salt cho mọi bản ghi bị thu hồi, dù gửi qua đường nào. |
| 14 | §6.6 tải dataset | "File luôn loại bỏ bản ghi đã thu hồi" nhưng snapshot cũ vẫn chứa bản ghi đó. | Khi thu hồi: snapshot chứa bản ghi bị đánh dấu `stale`, backend tự công bố phiên bản mới (`AUTO_SNAPSHOT_ON_REVOKE`). Tải về chỉ phục vụ phiên bản không stale; zip được dựng khi tải nên không tồn tại bản sao audio đã thu hồi. |
| 15 | §10.5 | `get_transaction_count(address)` không tính giao dịch pending → nonce trùng khi gửi liên tiếp. | Relayer giữ khóa + nonce cục bộ, đồng bộ với `pending`. |
| 16 | §12.5 `config.py` | Một DB dùng chung cho mọi lần redeploy Anvil → dữ liệu cũ lẫn chain mới. | Thư mục dữ liệu theo dấu vân tay deployment (`chainId + địa chỉ contract + hash block deploy`). Đã kiểm: redeploy cho cùng địa chỉ contract vẫn ra thư mục mới. Với PostgreSQL/Neon dùng chung: database được đóng dấu deployment, lệch thì backend từ chối khởi động; reset bằng `scripts\reset-db.bat` (xóa database + audio cùng lúc, không đụng chain). |
| 17 | §10.3 ghim `torch==2.5.1` | **Không tương thích:** transformers ≥ 4.50 từ chối `torch.load` trên torch < 2.6 (CVE-2025-32434), mà model `nguyenvulebinh/wav2vec2-base-vietnamese-250h` chỉ có `pytorch_model.bin`. | Dùng torch/torchaudio **2.6.0** CPU (bản vá; `forced_align`/`merge_tokens` vẫn có, chưa deprecated). Không hạ transformers xuống bản có lỗ hổng. |
| 18 | §6.6 "người mua ký thông điệp" | Chữ ký ECDSA tất định: hai yêu cầu tải trong cùng một giây cho ra cùng chữ ký và bị chặn chống phát lại. | Thông điệp tải có thêm `Nonce` ngẫu nhiên do server cấp (`GET /datasets/{id}/download-message`). |
| 19 | §10.1 bước 6 "chống trùng" | Phạm vi chưa nói rõ. | sha256 của audio chuẩn hóa không được trùng với bản ghi đang hiệu lực ở **mọi** chiến dịch (chặn dùng lại một bản ghi). Xóa khi thu hồi. |
| 20 | §11 rate limit | Một giới hạn cố định làm demo local lặp lại bị chặn. | Giới hạn theo nhóm thao tác; faucet cấu hình được (`RATE_LIMIT_FAUCET`, mặc định 5/giờ ngoài local, 200/giờ ở local). Lỗi 429 trả cùng định dạng lỗi chung. |
| 21 | Tên sản phẩm trong phần giới thiệu | Tên tạm còn xuất hiện trong Markdown. | Đổi tên trình bày thành `DatasetMarketplace` theo yêu cầu. Giữ các định danh kỹ thuật `GiongQue`/`giongque`, nội dung code mẫu, domain EIP-712 và byte của bộ seed đã được băm on-chain. |

Không thay đổi: công thức giá, tỷ lệ chia, cấu trúc chữ ký EIP-712 (domain `GiongQue`/`1`, ba typehash), cơ chế accumulator, quy tắc mỗi ví một license, commitment khóa vĩnh viễn, MockUSDC 6 decimals chỉ local/Fuji.

---

## 4. Thiết kế backend (tóm tắt)

- **`app/core`**: `config.py` (hồ sơ `local`/`fuji`/`mainnet` đúng §12.5 + đọc `contracts/deployments/<chainId>.json`), `money.py` (đúng §12.5), `security.py` (JWT phiên, token HMAC cho prompt/tải), `errors.py`, `logging.py` (lọc salt/khóa), `ratelimit.py`.
- **`app/models`** (SQLAlchemy 2.0) + **Alembic**: `users`, `auth_challenges`, `campaign_drafts`, `campaigns`, `prompts`, `consents`, `prompt_tokens`, `contributions`, `onchain_contributions`, `purchases`, `claims`, `relay_txs`, `snapshots`, `used_signatures`, `kv_state`.
- **`app/blockchain`**: `client.py` (đọc), `eip712.py` (typed data giống hệt contract), `relayer.py`, `errors.py` (giải mã custom error → tiếng Việt), `indexer.py`.
- **`app/qc`**: `text.py`, `audio.py`, `checker.py` (pipeline §10.1), `service.py` (nạp model một lần, khóa luồng), `__main__.py` (chạy bằng CMD).
- **`app/services`**: auth, campaign, consent, prompt, contribution, rewards (claim), revoke, marketplace, dataset (storage, Merkle, snapshot, tải), admin, fx, faucet.
- **`app/api`**: routers mỏng, `Annotated` dependencies, rate limit, CORS, health.

## 5. Kiểm thử

| Mức | Công cụ | Nội dung |
|---|---|---|
| Contract | `forge test` | 7 test gốc + test bổ sung (giá, thời hạn, quỹ mồi, chống phát lại, quyền, bất biến khả năng thanh toán – fuzz) |
| Unit | `pytest -m "not integration"` | chuẩn hóa văn bản, CER, độ dài, money, token, Merkle, cấu hình mainnet |
| QC thật | `pytest -m qc` | model wav2vec2 + Silero VAD thật trên audio tiếng Việt thật (fixture) |
| Tích hợp | `pytest -m integration` | Anvil thật + contract thật + API thật + QC thật: đồng thuận → đóng góp → mua → chia → rút → thu hồi → snapshot → tải |
| E2E | `scripts\demo-local.bat` | CLI chạy toàn bộ nghiệp vụ trên Anvil + backend đang chạy |
