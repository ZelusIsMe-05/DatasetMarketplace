// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VoiceCampaigns - chiến dịch thu thập giọng nói, giá theo tiến độ, chia doanh thu, đồng thuận/thu hồi
/// @notice Bám sát mục 9.2 của tài liệu đề xuất. Các thay đổi nhỏ so với bản gốc (xem docs/implementation-plan.md):
///         (1) progressBps trả 0 cho chiến dịch không tồn tại thay vì panic chia cho 0;
///         (2) publishSnapshot kiểm tra campaignId hợp lệ;
///         (3) thêm sự kiện Withdrawn / SeedWithdrawn để backend lập chỉ mục doanh thu;
///         (4) nền tảng trả phí mạng cho MỌI vai trò: tạo chiến dịch, mua, rút doanh thu, rút quỹ mồi có bản "WithSig"
///             (người dùng chỉ ký, relayer gửi). Phí xử lý do backend báo giá, người dùng ký ĐÚNG số phí đó, hợp đồng
///             trừ trong cùng giao dịch cho feeCollector. Token được cấp quyền bằng chữ ký EIP-2612 (permit);
///         (5) phiên bản dataset thuộc quyền CHỦ CHIẾN DỊCH: chỉ người tạo được công bố (tự gọi hoặc ký PublishSnapshot
///             để relayer gửi hộ); ví nền tảng (QC oracle) chỉ ghi nhận bản ghi, không công bố dữ liệu.
contract VoiceCampaigns is Ownable, EIP712, Nonces, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    uint256 private constant ACC = 1e18;
    uint256 public constant FLOOR_BPS = 3_000; // giá sàn 30%

    bytes32 private constant CONSENT_TYPEHASH = keccak256(
        "Consent(uint256 campaignId,address contributor,bytes32 termsHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant REVOKE_TYPEHASH =
        keccak256("Revoke(uint256 contributionId,uint256 nonce,uint256 deadline)");
    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "Claim(uint256 campaignId,address contributor,uint256 maxFee,uint256 nonce,uint256 deadline)"
    );
    // Giao dịch được nền tảng trả phí mạng (người dùng ký đúng số phí xử lý `fee`).
    bytes32 private constant CREATE_TYPEHASH = keccak256(
        "CreateCampaign(address creator,uint64 targetSec,uint128 fullPrice,uint16 contributorBps,uint16 creatorBps,"
        "uint64 campaignDeadline,bytes32 promptSetHash,bytes32 termsHash,string metadataURI,uint256 seedRatePerSec,"
        "uint256 seedAmount,uint256 fee,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant BUY_TYPEHASH = keccak256(
        "Buy(uint256 campaignId,address buyer,uint256 maxPrice,uint256 fee,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(address account,uint256 fee,uint256 nonce,uint256 deadline)");
    bytes32 private constant WITHDRAW_SEED_TYPEHASH = keccak256(
        "WithdrawSeed(uint256 campaignId,address creator,uint256 fee,uint256 nonce,uint256 deadline)"
    );
    // Chủ chiến dịch đồng ý công bố đúng phiên bản này (mã Merkle + đường dẫn manifest).
    bytes32 private constant PUBLISH_TYPEHASH = keccak256(
        "PublishSnapshot(uint256 campaignId,bytes32 merkleRoot,string uri,uint256 nonce,uint256 deadline)"
    );

    /// @notice Tham số chiến dịch, gom thành struct cho bản có chữ ký (tránh "stack too deep").
    struct CampaignParams {
        uint64 targetSec;
        uint128 fullPrice;
        uint16 contributorBps;
        uint16 creatorBps;
        uint64 deadline; // hạn thu thập của chiến dịch
        bytes32 promptSetHash;
        bytes32 termsHash;
        string metadataURI;
        uint256 seedRatePerSec;
        uint256 seedAmount;
    }

    /// @notice Chữ ký EIP-2612 cho phép hợp đồng trừ token. value = 0: bỏ qua, dùng allowance sẵn có.
    struct PermitSig {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Campaign {
        address creator;
        uint64 deadline;
        uint64 targetSec;
        uint128 fullPrice;
        uint16 contributorBps;
        uint16 creatorBps; // nền tảng nhận phần còn lại
        bytes32 promptSetHash;
        bytes32 termsHash;
        string metadataURI;
        uint256 totalWeight; // tổng số giây hợp lệ
        uint256 accPerWeight; // tích lũy doanh thu / giây, nhân 1e18
        uint256 seedRatePerSec; // tiền mồi trả cho mỗi giây hợp lệ
        uint256 seedBalance;
    }

    struct Contribution {
        uint256 campaignId;
        address contributor;
        bytes32 commitment; // keccak256(audio || salt), salt lưu off-chain
        uint32 durationSec;
        uint64 createdAt;
        uint64 revokedAt; // 0 = còn hiệu lực
    }

    struct Account {
        uint256 weight;
        uint256 rewardDebt;
        uint256 pending;
    }

    struct License {
        uint64 purchasedAt;
        uint16 progressBpsAtPurchase;
        uint128 pricePaid;
    }

    IERC20 public immutable token;
    address public qcOracle;
    uint256 public claimFee; // phí rút hộ qua relayer, tính bằng chính token của app
    address public feeCollector; // ví nhận phí (thường là relayer), dùng để bù tiền gas AVAX

    uint256 public campaignCount;
    uint256 public contributionCount;
    mapping(uint256 => Campaign) internal campaigns;
    mapping(uint256 => Contribution) public contributions;
    mapping(uint256 => mapping(address => Account)) public accounts;
    mapping(uint256 => mapping(address => uint64)) public consentAt;
    mapping(uint256 => mapping(address => License)) public licenses;
    mapping(address => uint256) public withdrawable; // người tạo và nền tảng
    mapping(bytes32 => bool) public usedCommitment;

    event CampaignCreated(
        uint256 indexed campaignId, address indexed creator, uint64 targetSec, uint128 fullPrice, uint64 deadline
    );
    event ConsentGiven(uint256 indexed campaignId, address indexed contributor, bytes32 termsHash);
    event ContributionRegistered(
        uint256 indexed contributionId,
        uint256 indexed campaignId,
        address indexed contributor,
        bytes32 commitment,
        uint32 durationSec,
        uint256 seedPaid
    );
    event ConsentRevoked(
        uint256 indexed contributionId, uint256 indexed campaignId, address indexed contributor, uint64 revokedAt
    );
    event Purchased(uint256 indexed campaignId, address indexed buyer, uint256 price, uint16 progressBps);
    event Claimed(uint256 indexed campaignId, address indexed contributor, uint256 amount, uint256 fee);
    event ClaimFeeUpdated(uint256 claimFee, address feeCollector);
    event SnapshotPublished(uint256 indexed campaignId, bytes32 merkleRoot, string uri);
    event QcOracleUpdated(address qcOracle);
    event Withdrawn(address indexed account, uint256 amount);
    event SeedWithdrawn(uint256 indexed campaignId, address indexed creator, uint256 amount);
    /// @notice Phí xử lý của giao dịch được nền tảng trả phí mạng; action = selector hàm WithSig.
    event RelayFeePaid(address indexed payer, bytes4 indexed action, uint256 fee);

    error NotQcOracle();
    error InvalidParams();
    error NotCollecting();
    error NoConsent();
    error AlreadyConsented();
    error DuplicateCommitment();
    error AlreadyRevoked();
    error NotContributor();
    error BadSignature();
    error Expired();
    error AlreadyLicensed();
    error NothingToSell();
    error PriceTooHigh();
    error NotCreator();
    error TooEarly();
    error NothingToClaim();
    error FeeTooHigh();

    modifier onlyQc() {
        if (msg.sender != qcOracle) revert NotQcOracle();
        _;
    }

    constructor(address token_, address qcOracle_, address owner_) Ownable(owner_) EIP712("DatasetMarketplace", "1") {
        token = IERC20(token_);
        qcOracle = qcOracle_;
        feeCollector = owner_;
    }

    // ------------------------------------------------------------------ chiến dịch

    function createCampaign(
        uint64 targetSec,
        uint128 fullPrice,
        uint16 contributorBps,
        uint16 creatorBps,
        uint64 deadline,
        bytes32 promptSetHash,
        bytes32 termsHash,
        string calldata metadataURI,
        uint256 seedRatePerSec,
        uint256 seedAmount
    ) external returns (uint256 id) {
        id = _createCampaign(
            msg.sender,
            CampaignParams({
                targetSec: targetSec,
                fullPrice: fullPrice,
                contributorBps: contributorBps,
                creatorBps: creatorBps,
                deadline: deadline,
                promptSetHash: promptSetHash,
                termsHash: termsHash,
                metadataURI: metadataURI,
                seedRatePerSec: seedRatePerSec,
                seedAmount: seedAmount
            }),
            0
        );
    }

    /// @notice Người tạo chỉ ký (chiến dịch + phí xử lý, và permit nếu cần); relayer gửi và trả phí mạng.
    ///         Hợp đồng trừ quỹ mồi + phí từ ví người tạo trong cùng giao dịch.
    function createCampaignWithSig(
        CampaignParams calldata p,
        address creator,
        uint256 fee,
        uint256 deadline,
        bytes calldata sig,
        PermitSig calldata permit
    ) external nonReentrant returns (uint256 id) {
        if (block.timestamp > deadline) revert Expired();
        bytes32 structHash = _createStructHash(p, creator, fee, _useNonce(creator), deadline);
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != creator) revert BadSignature();
        _permit(creator, permit);
        id = _createCampaign(creator, p, fee);
    }

    function _createCampaign(address creator, CampaignParams memory p, uint256 fee) internal returns (uint256 id) {
        if (p.targetSec == 0 || p.fullPrice == 0 || p.deadline <= block.timestamp) revert InvalidParams();
        if (uint256(p.contributorBps) + p.creatorBps > BPS) revert InvalidParams();

        id = campaignCount++;
        Campaign storage c = campaigns[id];
        c.creator = creator;
        c.deadline = p.deadline;
        c.targetSec = p.targetSec;
        c.fullPrice = p.fullPrice;
        c.contributorBps = p.contributorBps;
        c.creatorBps = p.creatorBps;
        c.promptSetHash = p.promptSetHash;
        c.termsHash = p.termsHash;
        c.metadataURI = p.metadataURI;
        c.seedRatePerSec = p.seedRatePerSec;
        c.seedBalance = p.seedAmount;
        _chargeFee(creator, fee);
        uint256 pull = p.seedAmount + fee;
        if (pull > 0) token.safeTransferFrom(creator, address(this), pull);
        emit CampaignCreated(id, creator, p.targetSec, p.fullPrice, p.deadline);
    }

    /// @dev Mã hóa EIP-712 tách hai nửa: abi.encode các giá trị tĩnh chỉ là nối các word 32 byte,
    ///      nên bytes.concat(abi.encode(a..g), abi.encode(h..n)) == abi.encode(a..n) mà không "stack too deep".
    function _createStructHash(
        CampaignParams calldata p,
        address creator,
        uint256 fee,
        uint256 nonce,
        uint256 deadline
    ) private pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                abi.encode(
                    CREATE_TYPEHASH, creator, p.targetSec, p.fullPrice, p.contributorBps, p.creatorBps, p.deadline
                ),
                abi.encode(
                    p.promptSetHash,
                    p.termsHash,
                    keccak256(bytes(p.metadataURI)),
                    p.seedRatePerSec,
                    p.seedAmount,
                    fee,
                    nonce,
                    deadline
                )
            )
        );
    }

    function isCollecting(uint256 campaignId) public view returns (bool) {
        Campaign storage c = campaigns[campaignId];
        return block.timestamp < c.deadline && c.totalWeight < c.targetSec;
    }

    function progressBps(uint256 campaignId) public view returns (uint16) {
        Campaign storage c = campaigns[campaignId];
        if (c.targetSec == 0) return 0; // chiến dịch không tồn tại
        uint256 p = c.totalWeight * BPS / c.targetSec;
        return uint16(p > BPS ? BPS : p);
    }

    function currentPrice(uint256 campaignId) public view returns (uint256) {
        Campaign storage c = campaigns[campaignId];
        uint256 p = progressBps(campaignId);
        return uint256(c.fullPrice) * (FLOOR_BPS + (BPS - FLOOR_BPS) * p / BPS) / BPS;
    }

    // ------------------------------------------------------------------ đồng thuận

    function giveConsent(uint256 campaignId) external {
        _consent(campaignId, msg.sender);
    }

    function giveConsentWithSig(uint256 campaignId, address contributor, uint256 deadline, bytes calldata sig)
        external
    {
        if (block.timestamp > deadline) revert Expired();
        bytes32 structHash = keccak256(
            abi.encode(
                CONSENT_TYPEHASH,
                campaignId,
                contributor,
                campaigns[campaignId].termsHash,
                _useNonce(contributor),
                deadline
            )
        );
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != contributor) revert BadSignature();
        _consent(campaignId, contributor);
    }

    function _consent(uint256 campaignId, address contributor) internal {
        if (campaignId >= campaignCount) revert InvalidParams();
        if (consentAt[campaignId][contributor] != 0) revert AlreadyConsented();
        consentAt[campaignId][contributor] = uint64(block.timestamp);
        emit ConsentGiven(campaignId, contributor, campaigns[campaignId].termsHash);
    }

    // ------------------------------------------------------------------ đóng góp (chỉ QC oracle)

    function registerContribution(uint256 campaignId, address contributor, bytes32 commitment, uint32 durationSec)
        external
        onlyQc
        returns (uint256 id)
    {
        if (durationSec == 0) revert InvalidParams();
        if (!isCollecting(campaignId)) revert NotCollecting();
        if (consentAt[campaignId][contributor] == 0) revert NoConsent();
        if (usedCommitment[commitment]) revert DuplicateCommitment();
        usedCommitment[commitment] = true;

        Campaign storage c = campaigns[campaignId];
        Account storage a = accounts[campaignId][contributor];
        _settle(c, a);
        a.weight += durationSec;
        c.totalWeight += durationSec;
        a.rewardDebt = a.weight * c.accPerWeight / ACC;

        uint256 seedPaid = uint256(durationSec) * c.seedRatePerSec;
        if (seedPaid > c.seedBalance) seedPaid = c.seedBalance;
        if (seedPaid > 0) {
            c.seedBalance -= seedPaid;
            a.pending += seedPaid;
        }

        id = contributionCount++;
        contributions[id] = Contribution({
            campaignId: campaignId,
            contributor: contributor,
            commitment: commitment,
            durationSec: durationSec,
            createdAt: uint64(block.timestamp),
            revokedAt: 0
        });
        emit ContributionRegistered(id, campaignId, contributor, commitment, durationSec, seedPaid);
    }

    // ------------------------------------------------------------------ thu hồi

    function revoke(uint256 contributionId) external {
        if (contributions[contributionId].contributor != msg.sender) revert NotContributor();
        _revoke(contributionId);
    }

    function revokeWithSig(uint256 contributionId, uint256 deadline, bytes calldata sig) external {
        if (block.timestamp > deadline) revert Expired();
        address contributor = contributions[contributionId].contributor;
        bytes32 structHash = keccak256(abi.encode(REVOKE_TYPEHASH, contributionId, _useNonce(contributor), deadline));
        if (contributor == address(0) || ECDSA.recover(_hashTypedDataV4(structHash), sig) != contributor) {
            revert BadSignature();
        }
        _revoke(contributionId);
    }

    function _revoke(uint256 contributionId) internal {
        Contribution storage r = contributions[contributionId];
        if (r.revokedAt != 0) revert AlreadyRevoked();
        Campaign storage c = campaigns[r.campaignId];
        Account storage a = accounts[r.campaignId][r.contributor];
        _settle(c, a); // tiền đã kiếm được giữ nguyên
        a.weight -= r.durationSec;
        c.totalWeight -= r.durationSec;
        a.rewardDebt = a.weight * c.accPerWeight / ACC;
        r.revokedAt = uint64(block.timestamp);
        emit ConsentRevoked(contributionId, r.campaignId, r.contributor, r.revokedAt);
    }

    // ------------------------------------------------------------------ mua và chia doanh thu

    function buy(uint256 campaignId, uint256 maxPrice) external nonReentrant {
        _buy(campaignId, msg.sender, maxPrice, 0);
    }

    /// @notice Người mua chỉ ký (Buy + permit nếu cần); relayer gửi và trả phí mạng.
    ///         Hợp đồng trừ giá + phí xử lý từ ví người mua; phí KHÔNG tính vào doanh thu chia cho các bên.
    function buyWithSig(
        uint256 campaignId,
        address buyer,
        uint256 maxPrice,
        uint256 fee,
        uint256 deadline,
        bytes calldata sig,
        PermitSig calldata permit
    ) external nonReentrant {
        if (block.timestamp > deadline) revert Expired();
        bytes32 structHash =
            keccak256(abi.encode(BUY_TYPEHASH, campaignId, buyer, maxPrice, fee, _useNonce(buyer), deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != buyer) revert BadSignature();
        _permit(buyer, permit);
        _buy(campaignId, buyer, maxPrice, fee);
    }

    function _buy(uint256 campaignId, address buyer, uint256 maxPrice, uint256 fee) internal {
        Campaign storage c = campaigns[campaignId];
        if (c.totalWeight == 0) revert NothingToSell();
        if (licenses[campaignId][buyer].purchasedAt != 0) revert AlreadyLicensed();
        uint256 price = currentPrice(campaignId);
        if (price > maxPrice) revert PriceTooHigh();
        uint16 p = progressBps(campaignId);

        uint256 contributorShare = price * c.contributorBps / BPS;
        uint256 creatorShare = price * c.creatorBps / BPS;
        uint256 accDelta = contributorShare * ACC / c.totalWeight;
        // Giữ lại cho người đóng góp phần đã phân bổ, LÀM TRÒN LÊN. Tiền mỗi người là
        // floor(w_i * acc / 1e18) cộng dồn qua nhiều lần bán, nên nếu làm tròn xuống ở đây
        // (như bản gốc mục 9.2) tổng nghĩa vụ có thể vượt số dư 1 đơn vị sau vài lần bán.
        // Làm tròn lên bảo đảm contract luôn đủ tiền; phần dư (vài đơn vị 1e-6 USDC) nằm lại contract.
        uint256 distributed = (accDelta * c.totalWeight + ACC - 1) / ACC;
        c.accPerWeight += accDelta;

        // phần lẻ do làm tròn được cộng cho nền tảng (distributed <= contributorShare)
        uint256 platformShare = price - creatorShare - distributed;
        withdrawable[c.creator] += creatorShare;
        withdrawable[owner()] += platformShare;
        _chargeFee(buyer, fee);

        licenses[campaignId][buyer] =
            License({purchasedAt: uint64(block.timestamp), progressBpsAtPurchase: p, pricePaid: uint128(price)});
        token.safeTransferFrom(buyer, address(this), price + fee);
        emit Purchased(campaignId, buyer, price, p);
    }

    function pendingReward(uint256 campaignId, address contributor) external view returns (uint256) {
        Campaign storage c = campaigns[campaignId];
        Account storage a = accounts[campaignId][contributor];
        return a.pending + a.weight * c.accPerWeight / ACC - a.rewardDebt;
    }

    /// @notice Người đóng góp tự rút (tự trả gas bằng AVAX), không mất phí.
    function claim(uint256 campaignId) external nonReentrant {
        _claim(campaignId, msg.sender, 0);
    }

    /// @notice Rút qua relayer: người đóng góp chỉ ký, relayer trả gas AVAX và thu lại
    ///         một khoản phí nhỏ bằng token của app. maxFee bảo vệ người dùng nếu phí bị đổi.
    function claimWithSig(uint256 campaignId, address contributor, uint256 maxFee, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        if (block.timestamp > deadline) revert Expired();
        uint256 fee = claimFee;
        if (fee > maxFee) revert FeeTooHigh();
        bytes32 structHash =
            keccak256(abi.encode(CLAIM_TYPEHASH, campaignId, contributor, maxFee, _useNonce(contributor), deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != contributor) revert BadSignature();
        _claim(campaignId, contributor, fee);
    }

    function _claim(uint256 campaignId, address contributor, uint256 fee) internal {
        Campaign storage c = campaigns[campaignId];
        Account storage a = accounts[campaignId][contributor];
        _settle(c, a);
        uint256 amount = a.pending;
        if (amount == 0 || amount <= fee) revert NothingToClaim();
        a.pending = 0;
        if (fee > 0) withdrawable[feeCollector] += fee;
        token.safeTransfer(contributor, amount - fee);
        emit Claimed(campaignId, contributor, amount - fee, fee);
    }

    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        withdrawable[msg.sender] = 0;
        if (amount > 0) {
            token.safeTransfer(msg.sender, amount);
            emit Withdrawn(msg.sender, amount);
        }
    }

    /// @notice Người tạo / nền tảng rút phần doanh thu qua relayer: chỉ ký, phí xử lý trừ vào số tiền rút.
    function withdrawWithSig(address account, uint256 fee, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        if (block.timestamp > deadline) revert Expired();
        bytes32 structHash = keccak256(abi.encode(WITHDRAW_TYPEHASH, account, fee, _useNonce(account), deadline));
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != account) revert BadSignature();
        uint256 amount = withdrawable[account];
        if (amount == 0 || amount <= fee) revert NothingToClaim();
        withdrawable[account] = 0;
        _chargeFee(account, fee);
        token.safeTransfer(account, amount - fee);
        emit Withdrawn(account, amount - fee);
    }

    function withdrawSeed(uint256 campaignId) external nonReentrant {
        Campaign storage c = campaigns[campaignId];
        if (msg.sender != c.creator) revert NotCreator();
        if (block.timestamp < c.deadline) revert TooEarly();
        uint256 amount = c.seedBalance;
        c.seedBalance = 0;
        if (amount > 0) {
            token.safeTransfer(msg.sender, amount);
            emit SeedWithdrawn(campaignId, msg.sender, amount);
        }
    }

    /// @notice Người tạo rút quỹ mồi còn dư (sau hạn) qua relayer: chỉ ký, phí xử lý trừ vào số tiền rút.
    function withdrawSeedWithSig(uint256 campaignId, uint256 fee, uint256 deadline, bytes calldata sig)
        external
        nonReentrant
    {
        if (block.timestamp > deadline) revert Expired();
        Campaign storage c = campaigns[campaignId];
        address creator = c.creator;
        bytes32 structHash =
            keccak256(abi.encode(WITHDRAW_SEED_TYPEHASH, campaignId, creator, fee, _useNonce(creator), deadline));
        if (creator == address(0) || ECDSA.recover(_hashTypedDataV4(structHash), sig) != creator) {
            revert BadSignature();
        }
        if (block.timestamp < c.deadline) revert TooEarly();
        uint256 amount = c.seedBalance;
        if (amount == 0 || amount <= fee) revert NothingToClaim();
        c.seedBalance = 0;
        _chargeFee(creator, fee);
        token.safeTransfer(creator, amount - fee);
        emit SeedWithdrawn(campaignId, creator, amount - fee);
    }

    // ------------------------------------------------------------------ phiên bản dataset, quản trị

    /// @notice Chủ chiến dịch tự công bố một phiên bản dataset (tự trả gas).
    function publishSnapshot(uint256 campaignId, bytes32 merkleRoot, string calldata uri) external {
        if (campaignId >= campaignCount) revert InvalidParams();
        if (msg.sender != campaigns[campaignId].creator) revert NotCreator();
        emit SnapshotPublished(campaignId, merkleRoot, uri);
    }

    /// @notice Chủ chiến dịch chỉ ký PublishSnapshot(campaignId, merkleRoot, uri); relayer gửi và trả phí mạng.
    ///         Không có chữ ký của chủ chiến dịch thì không ai công bố được phiên bản của chiến dịch đó.
    function publishSnapshotWithSig(
        uint256 campaignId,
        bytes32 merkleRoot,
        string calldata uri,
        uint256 deadline,
        bytes calldata sig
    ) external {
        if (block.timestamp > deadline) revert Expired();
        if (campaignId >= campaignCount) revert InvalidParams();
        address creator = campaigns[campaignId].creator;
        bytes32 structHash = keccak256(
            abi.encode(PUBLISH_TYPEHASH, campaignId, merkleRoot, keccak256(bytes(uri)), _useNonce(creator), deadline)
        );
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != creator) revert BadSignature();
        emit SnapshotPublished(campaignId, merkleRoot, uri);
    }

    function setQcOracle(address qcOracle_) external onlyOwner {
        qcOracle = qcOracle_;
        emit QcOracleUpdated(qcOracle_);
    }

    function setClaimFee(uint256 claimFee_, address feeCollector_) external onlyOwner {
        if (feeCollector_ == address(0)) revert InvalidParams();
        claimFee = claimFee_;
        feeCollector = feeCollector_;
        emit ClaimFeeUpdated(claimFee_, feeCollector_);
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function nonceOf(address user) external view returns (uint256) {
        return nonces(user);
    }

    // ------------------------------------------------------------------ nội bộ

    function _settle(Campaign storage c, Account storage a) internal {
        uint256 accrued = a.weight * c.accPerWeight / ACC;
        a.pending += accrued - a.rewardDebt;
        a.rewardDebt = accrued;
    }

    /// @dev Ghi phí xử lý cho feeCollector (relayer dùng nó bù phí mạng AVAX). Gọi TRƯỚC khi chuyển token (CEI).
    function _chargeFee(address payer, uint256 fee) private {
        if (fee == 0) return;
        withdrawable[feeCollector] += fee;
        emit RelayFeePaid(payer, msg.sig, fee);
    }

    /// @dev permit trong try/catch: nếu ai đó đã gửi trước đúng chữ ký permit này (front-run), allowance đã được
    ///      cấp nên giao dịch vẫn chạy; nếu permit sai thật, safeTransferFrom phía sau sẽ revert.
    function _permit(address holder, PermitSig calldata p) private {
        if (p.value == 0) return;
        try IERC20Permit(address(token)).permit(holder, address(this), p.value, p.deadline, p.v, p.r, p.s) {} catch {}
    }
}
