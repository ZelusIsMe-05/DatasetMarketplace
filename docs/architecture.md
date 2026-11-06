# Kiến trúc Dataset Marketplace

> Nguyên tắc (đề xuất §4): **chain giữ tiền, quyền và bằng chứng; server giữ dữ liệu.** Audio và thông tin cá nhân
> không bao giờ lên chain.

```mermaid
flowchart TB
    subgraph Client["Client"]
        CLI["CLI giongque<br/>(hiện tại)"]
        FE1["Màn Kiếm tiền<br/>(ví trong trình duyệt)"]
        FE2["Màn Đặt hàng / Mua<br/>(Core / MetaMask)"]
    end
    subgraph Backend["backend/ (FastAPI, CPU)"]
        API["app/api — routers mỏng<br/>rate limit, CORS, lỗi chuẩn"]
        SVC["app/services<br/>auth · campaign · consent · prompt · contribution<br/>rewards · revoke · marketplace · dataset · admin · faucet"]
        QC["app/qc<br/>Silero VAD + wav2vec2 CTC<br/>+ forced_align + CER"]
        REL["app/blockchain/relayer<br/>(ví nóng, nonce lock, gas, receipt)"]
        IDX["app/blockchain/indexer<br/>(sự kiện → DB, hook thu hồi)"]
        DB[("SQLite + Alembic<br/>storage/&lt;network&gt;-&lt;fingerprint&gt;/")]
        ST[("Kho audio riêng tư<br/>WAV 16 kHz")]
    end
    subgraph Chain["Avalanche C-Chain (Anvil / Fuji / mainnet)"]
        SC["VoiceCampaigns.sol"]
        TK["MockUSDC (local/Fuji) · USDC (mainnet)"]
    end
    CLI --> API
    FE1 --> API
    FE2 -- approve/buy/createCampaign/withdraw --> SC
    CLI -- ví người tạo/người mua --> SC
    API --> SVC
    SVC --> QC
    SVC --> DB
    SVC --> ST
    SVC --> REL
    REL -- giveConsentWithSig · registerContribution<br/>claimWithSig · revokeWithSig · publishSnapshot --> SC
    IDX -- eth_getLogs --> SC
    IDX --> DB
    SC --> TK
```

## Luồng đóng góp (đề xuất §6.4)

```mermaid
sequenceDiagram
    participant U as Người đóng góp
    participant API
    participant QC
    participant R as Relayer (QC oracle)
    participant SC as VoiceCampaigns
    U->>API: GET /consent/typed-data → ký EIP-712 Consent
    U->>API: POST /consent
    API->>API: recover chữ ký (nonce, deadline, termsHash on-chain)
    API->>R: giveConsentWithSig (mô phỏng eth_call trước)
    R->>SC: tx (relayer trả gas)
    U->>API: POST /campaigns/{id}/prompt
    API-->>U: câu chưa đọc + prompt token HMAC 60 giây, dùng 1 lần
    U->>API: POST /contributions (audio + token)
    API->>API: token hợp lệ? thời lượng ≤ thời gian từ lúc hiện câu? chưa đọc câu này? audio trùng?
    API->>QC: độ dài → VAD → tốc độ → CTC → CER → forced alignment → điểm từ
    alt pass
        API->>API: salt 32 byte, commitment = keccak256(wav ‖ salt)
        API->>R: registerContribution(campaign, ví, commitment, floor(giây giọng nói))
        R->>SC: tx → ContributionRegistered (+ tiền mồi)
    else gray
        API->>API: giữ audio riêng tư, vào /admin/review
    else reject
        API->>API: không lưu audio, trả lý do
    end
```

## Thu hồi (đề xuất §6.8)
`POST /revoke` (chữ ký `Revoke`) **hoặc** người dùng tự gọi `revoke()` → sự kiện `ConsentRevoked` → indexer gọi
`DatasetService.purge_revoked`: xóa file audio, xóa salt + sha256, đánh dấu mọi phiên bản dataset chứa bản ghi là
`stale` (link tải cũ trả 410), tự công bố phiên bản mới (Merkle root mới on-chain).

## Dữ liệu theo deployment
Thư mục dữ liệu = `storage/<network>-<fingerprint>`, fingerprint = sha256(chainId, địa chỉ contract, hash block
deploy). Khởi động lại Anvil (chain mới, có thể trùng địa chỉ contract) ⇒ DB mới, không lẫn dữ liệu cũ.

## Bảo mật
| Mối đe dọa | Biện pháp |
|---|---|
| Phát lại chữ ký | Nonce on-chain (OZ `Nonces`) + deadline ≤ 1 ngày; chữ ký đăng nhập dùng challenge một lần; chữ ký tải dataset có nonce + lưu hash đã dùng |
| Chữ ký sai | Backend recover trước khi gửi; relayer mô phỏng `eth_call` (không tốn gas nếu revert) |
| Audio chuẩn bị sẵn / TTS | Câu chỉ hiện khi xin; prompt token 60 giây, 1 lần; audio không được dài hơn thời gian từ lúc hiện câu; chọn câu cụ thể chỉ có ở local+dev |
| Trùng bản ghi | Một người không đọc lại câu; sha256 audio chuẩn hóa không trùng; commitment khóa vĩnh viễn on-chain |
| Tải trái phép | Chữ ký EIP-191 chứng minh ví + `licenses()` on-chain; link HMAC 10 phút; kiểm tra lại license khi tải |
| Nhầm môi trường | `DEV_AUTH_ENABLED` ngoài local ⇒ không khởi động; mainnet: không mount faucet/dev login, từ chối token `mUSDC`, bắt buộc `FX_URL`; Deploy/SeedDemo chặn theo chain id |
| Lộ bí mật | Khóa trong biến môi trường; `RedactFilter` che salt/khóa trong log; `.env` thật bị gitignore |
| Spam | Rate limit theo user (JWT đã xác minh) hoặc IP |
