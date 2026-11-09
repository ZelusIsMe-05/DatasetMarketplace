// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Giao dịch được nền tảng trả phí mạng: người dùng chỉ ký (EIP-712 + permit EIP-2612), relayer gửi.
import {Test, Vm} from "forge-std/Test.sol";
import {VoiceCampaigns} from "../src/VoiceCampaigns.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract SponsoredActionsTest is Test {
    VoiceCampaigns vc;
    MockUSDC usdc;

    address qc = makeAddr("qc");
    address relayer = makeAddr("relayer"); // feeCollector + người gửi giao dịch (trả gas)
    address org;
    uint256 orgPk;
    address buyer;
    uint256 buyerPk;
    address an = makeAddr("an");

    uint256 constant FEE = 500_000; // 0,5 mUSDC ≈ 13.000 ₫
    uint256 constant WFEE = 100_000; // 0,1 mUSDC ≈ 2.600 ₫

    bytes32 constant CREATE_TH = keccak256(
        "CreateCampaign(address creator,uint64 targetSec,uint128 fullPrice,uint16 contributorBps,uint16 creatorBps,"
        "uint64 campaignDeadline,bytes32 promptSetHash,bytes32 termsHash,string metadataURI,uint256 seedRatePerSec,"
        "uint256 seedAmount,uint256 fee,uint256 nonce,uint256 deadline)"
    );
    bytes32 constant BUY_TH =
        keccak256("Buy(uint256 campaignId,address buyer,uint256 maxPrice,uint256 fee,uint256 nonce,uint256 deadline)");
    bytes32 constant WITHDRAW_TH = keccak256("Withdraw(address account,uint256 fee,uint256 nonce,uint256 deadline)");
    bytes32 constant WITHDRAW_SEED_TH =
        keccak256("WithdrawSeed(uint256 campaignId,address creator,uint256 fee,uint256 nonce,uint256 deadline)");
    bytes32 constant PUBLISH_TH =
        keccak256("PublishSnapshot(uint256 campaignId,bytes32 merkleRoot,string uri,uint256 nonce,uint256 deadline)");
    bytes32 constant PERMIT_TH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function setUp() public {
        usdc = new MockUSDC();
        vc = new VoiceCampaigns(address(usdc), qc, address(this));
        vc.setClaimFee(WFEE, relayer);
        (org, orgPk) = makeAddrAndKey("org");
        (buyer, buyerPk) = makeAddrAndKey("buyer");
        usdc.mint(org, 100e6);
        usdc.mint(buyer, 2_000e6);
    }

    // ------------------------------------------------------------------ helpers

    function _params(uint256 seed) internal view returns (VoiceCampaigns.CampaignParams memory p) {
        p.targetSec = 360;
        p.fullPrice = 100e6;
        p.contributorBps = 8_000;
        p.creatorBps = 1_000;
        p.deadline = uint64(block.timestamp + 30 days);
        p.promptSetHash = keccak256("prompts");
        p.termsHash = keccak256("terms");
        p.metadataURI = "http://127.0.0.1:8000/metadata/abc";
        p.seedRatePerSec = seed == 0 ? 0 : 216;
        p.seedAmount = seed;
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        bytes32 ds = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("DatasetMarketplace"),
                keccak256("1"),
                block.chainid,
                address(vc)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", ds, structHash));
    }

    function _sign(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _createHash(VoiceCampaigns.CampaignParams memory p, address creator, uint256 fee, uint256 nonce, uint256 dl)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(bytes.concat(_createHead(p, creator), _createTail(p, fee, nonce, dl)));
    }

    function _createHead(VoiceCampaigns.CampaignParams memory p, address creator) internal pure returns (bytes memory) {
        return abi.encode(CREATE_TH, creator, p.targetSec, p.fullPrice, p.contributorBps, p.creatorBps, p.deadline);
    }

    function _createTail(VoiceCampaigns.CampaignParams memory p, uint256 fee, uint256 nonce, uint256 dl)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory part = abi.encode(p.promptSetHash, p.termsHash, keccak256(bytes(p.metadataURI)), p.seedRatePerSec);
        return bytes.concat(part, abi.encode(p.seedAmount, fee, nonce, dl));
    }

    function _permit(uint256 pk, address holder, uint256 value) internal view returns (VoiceCampaigns.PermitSig memory) {
        uint256 dl = block.timestamp + 1 hours;
        bytes32 h = keccak256(abi.encode(PERMIT_TH, holder, address(vc), value, usdc.nonces(holder), dl));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), h)));
        return VoiceCampaigns.PermitSig({value: value, deadline: dl, v: v, r: r, s: s});
    }

    function _buyDigest(uint256 id, uint256 maxPrice, uint256 nonce, uint256 dl) internal view returns (bytes32) {
        return keccak256(abi.encode(BUY_TH, id, buyer, maxPrice, FEE, nonce, dl));
    }

    function _noPermit() internal pure returns (VoiceCampaigns.PermitSig memory p) {}

    /// Người tạo ký chiến dịch có quỹ mồi; relayer gửi. Trả về id chiến dịch.
    function _createSigned(uint256 seed) internal returns (uint256 id) {
        VoiceCampaigns.CampaignParams memory p = _params(seed);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, vc.nonceOf(org), dl));
        VoiceCampaigns.PermitSig memory pm = _permit(orgPk, org, seed + FEE);
        vm.prank(relayer);
        id = vc.createCampaignWithSig(p, org, FEE, dl, sig, pm);
    }

    function _contribute(uint256 id, uint32 sec) internal {
        vm.prank(an);
        vc.giveConsent(id);
        vm.prank(qc);
        vc.registerContribution(id, an, keccak256(abi.encode("rec", id, sec)), sec);
    }

    function _buySigned(uint256 id, uint256 fee) internal {
        uint256 price = vc.currentPrice(id);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig =
            _sign(buyerPk, keccak256(abi.encode(BUY_TH, id, buyer, price, fee, vc.nonceOf(buyer), dl)));
        VoiceCampaigns.PermitSig memory pm = _permit(buyerPk, buyer, price + fee);
        vm.prank(relayer);
        vc.buyWithSig(id, buyer, price, fee, dl, sig, pm);
    }

    // ================================================================== tạo chiến dịch

    function test_CreateWithSigPullsSeedAndFeeRelayerPaysNothing() public {
        uint256 relayerEth = relayer.balance;
        vm.recordLogs();
        uint256 id = _createSigned(10e6);

        VoiceCampaigns.Campaign memory c = vc.getCampaign(id);
        assertEq(c.creator, org, unicode"creator = người ký, không phải relayer");
        assertEq(c.seedBalance, 10e6);
        assertEq(c.metadataURI, "http://127.0.0.1:8000/metadata/abc");
        assertEq(usdc.balanceOf(org), 100e6 - 10e6 - FEE);
        assertEq(usdc.balanceOf(address(vc)), 10e6 + FEE);
        assertEq(vc.withdrawable(relayer), FEE, unicode"phí xử lý về feeCollector");
        assertEq(usdc.allowance(org, address(vc)), 0, unicode"permit đúng số cần trừ");
        assertEq(usdc.balanceOf(relayer), 0);
        assertEq(relayer.balance, relayerEth);
        assertEq(vc.nonceOf(org), 1);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == VoiceCampaigns.RelayFeePaid.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), org);
                assertEq(bytes4(logs[i].topics[2]), VoiceCampaigns.createCampaignWithSig.selector);
                assertEq(abi.decode(logs[i].data, (uint256)), FEE);
                found = true;
            }
        }
        assertTrue(found, unicode"phát RelayFeePaid");
    }

    function test_CreateWithSigWithoutSeedChargesOnlyFee() public {
        _createSigned(0);
        assertEq(usdc.balanceOf(org), 100e6 - FEE);
        assertEq(vc.withdrawable(relayer), FEE);
    }

    function test_CreateWithSigRejectsTamperedFields() public {
        VoiceCampaigns.CampaignParams memory p = _params(10e6);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, 0, dl));
        VoiceCampaigns.PermitSig memory pm = _permit(orgPk, org, 10e6 + FEE);

        VoiceCampaigns.CampaignParams memory p2 = _params(10e6);
        p2.metadataURI = "http://evil/metadata";
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.createCampaignWithSig(p2, org, FEE, dl, sig, pm);

        vm.expectRevert(VoiceCampaigns.BadSignature.selector); // relayer tự tăng phí
        vc.createCampaignWithSig(p, org, FEE * 10, dl, sig, pm);

        vm.expectRevert(VoiceCampaigns.BadSignature.selector); // gán chiến dịch cho ví khác
        vc.createCampaignWithSig(p, buyer, FEE, dl, sig, pm);

        vc.createCampaignWithSig(p, org, FEE, dl, sig, pm); // đúng chữ ký thì chạy
        assertEq(vc.campaignCount(), 1);
    }

    function test_CreateWithSigCannotBeReplayed() public {
        VoiceCampaigns.CampaignParams memory p = _params(0);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, 0, dl));
        vm.prank(org);
        usdc.approve(address(vc), type(uint256).max);
        vc.createCampaignWithSig(p, org, FEE, dl, sig, _noPermit());
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.createCampaignWithSig(p, org, FEE, dl, sig, _noPermit());
    }

    function test_CreateWithSigExpired() public {
        VoiceCampaigns.CampaignParams memory p = _params(0);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, 0, dl));
        vm.warp(dl + 1);
        p.deadline = uint64(block.timestamp + 30 days);
        vm.expectRevert(VoiceCampaigns.Expired.selector);
        vc.createCampaignWithSig(p, org, FEE, dl, sig, _noPermit());
    }

    function test_PermitFrontRunDoesNotBlockAction() public {
        VoiceCampaigns.CampaignParams memory p = _params(10e6);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, 0, dl));
        VoiceCampaigns.PermitSig memory pm = _permit(orgPk, org, 10e6 + FEE);
        // Kẻ xấu thấy chữ ký permit trong mempool và gửi trước: permit dùng hết nonce token
        vm.prank(makeAddr("griefer"));
        usdc.permit(org, address(vc), pm.value, pm.deadline, pm.v, pm.r, pm.s);
        vm.prank(relayer);
        vc.createCampaignWithSig(p, org, FEE, dl, sig, pm); // không revert: allowance đã có
        assertEq(vc.getCampaign(0).seedBalance, 10e6);
    }

    function test_CreateWithSigWithoutAllowanceReverts() public {
        VoiceCampaigns.CampaignParams memory p = _params(10e6);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, 0, dl));
        vm.expectRevert(); // ERC20InsufficientAllowance
        vc.createCampaignWithSig(p, org, FEE, dl, sig, _noPermit());
        assertEq(vc.campaignCount(), 0);
    }

    function test_CreateWithSigWrongPermitSignerReverts() public {
        VoiceCampaigns.CampaignParams memory p = _params(10e6);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, 0, dl));
        VoiceCampaigns.PermitSig memory pm = _permit(buyerPk, org, 10e6 + FEE); // permit ký bằng ví khác
        vm.expectRevert(); // permit bị bỏ qua -> không có allowance -> transferFrom revert
        vc.createCampaignWithSig(p, org, FEE, dl, sig, pm);
    }

    function test_CreateWithSigValidatesParams() public {
        VoiceCampaigns.CampaignParams memory p = _params(0);
        p.contributorBps = 9_500;
        p.creatorBps = 1_000; // > 100%
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, FEE, 0, dl));
        VoiceCampaigns.PermitSig memory pm0 = _permit(orgPk, org, FEE);
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.createCampaignWithSig(p, org, FEE, dl, sig, pm0);
    }

    // ================================================================== mua

    function test_BuyWithSigPullsPriceAndFeeSplitUnchanged() public {
        uint256 id = _createSigned(0);
        _contribute(id, 36);
        uint256 price = vc.currentPrice(id);
        uint256 creatorBefore = vc.withdrawable(org);

        _buySigned(id, FEE);

        (uint64 at,, uint128 paid) = vc.licenses(id, buyer);
        assertGt(at, 0, unicode"license thuộc người ký");
        assertEq(paid, price, unicode"giá trên license không gồm phí");
        assertEq(usdc.balanceOf(buyer), 2_000e6 - price - FEE);
        assertEq(vc.withdrawable(org) - creatorBefore, price * 1_000 / 10_000, unicode"phần người tạo tính trên giá");
        assertEq(vc.withdrawable(relayer), FEE + FEE, unicode"phí tạo + phí mua");
        assertApproxEqAbs(vc.pendingReward(id, an), price * 8_000 / 10_000, 1);
        (uint64 relayerLicense,,) = vc.licenses(id, relayer);
        assertEq(relayerLicense, 0);
    }

    function test_BuyWithSigRejectsWrongSignerAndReplay() public {
        uint256 id = _createSigned(0);
        _contribute(id, 36);
        uint256 price = vc.currentPrice(id);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _buyDigest(id, price, uint256(0), dl)); // ví khác ký thay người mua
        VoiceCampaigns.PermitSig memory pm = _permit(buyerPk, buyer, price + FEE);
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.buyWithSig(id, buyer, price, FEE, dl, sig, pm);

        sig = _sign(buyerPk, _buyDigest(id, price, uint256(0), dl));
        vc.buyWithSig(id, buyer, price, FEE, dl, sig, pm); // giao dịch trước đã revert nên permit vẫn hợp lệ
        vm.expectRevert(VoiceCampaigns.BadSignature.selector); // nonce đã dùng
        vc.buyWithSig(id, buyer, price, FEE, dl, sig, _noPermit());
    }

    function test_BuyWithSigBusinessRulesStillApply() public {
        uint256 id = _createSigned(0);
        _expectBuyRevert(id, 100e6, VoiceCampaigns.NothingToSell.selector);
        _contribute(id, 36);
        uint256 price = vc.currentPrice(id);
        _expectBuyRevert(id, price - 1, VoiceCampaigns.PriceTooHigh.selector);
        _buySigned(id, FEE);
        _expectBuyRevert(id, price, VoiceCampaigns.AlreadyLicensed.selector);
    }

    function _expectBuyRevert(uint256 id, uint256 maxPrice, bytes4 err) internal {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig =
            _sign(buyerPk, _buyDigest(id, maxPrice, vc.nonceOf(buyer), dl));
        VoiceCampaigns.PermitSig memory pm = _permit(buyerPk, buyer, maxPrice + FEE);
        vm.expectRevert(err);
        vc.buyWithSig(id, buyer, maxPrice, FEE, dl, sig, pm);
    }

    // ================================================================== rút doanh thu / quỹ mồi

    function test_WithdrawWithSigChargesFee() public {
        uint256 id = _createSigned(0);
        _contribute(id, 36);
        _buySigned(id, FEE);
        uint256 owed = vc.withdrawable(org);
        assertGt(owed, WFEE);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, keccak256(abi.encode(WITHDRAW_TH, org, WFEE, vc.nonceOf(org), dl)));
        uint256 orgBefore = usdc.balanceOf(org);
        vm.prank(relayer);
        vc.withdrawWithSig(org, WFEE, dl, sig);
        assertEq(usdc.balanceOf(org) - orgBefore, owed - WFEE);
        assertEq(vc.withdrawable(org), 0);
        assertEq(vc.withdrawable(relayer), FEE + FEE + WFEE);
    }

    function test_WithdrawWithSigGuards() public {
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, keccak256(abi.encode(WITHDRAW_TH, org, WFEE, uint256(0), dl)));
        vm.expectRevert(VoiceCampaigns.NothingToClaim.selector); // chưa có doanh thu
        vc.withdrawWithSig(org, WFEE, dl, sig);

        bytes memory bad = _sign(buyerPk, keccak256(abi.encode(WITHDRAW_TH, org, WFEE, uint256(0), dl)));
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.withdrawWithSig(org, WFEE, dl, bad);
    }

    function test_WithdrawSeedWithSig() public {
        uint256 id = _createSigned(10e6);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, keccak256(abi.encode(WITHDRAW_SEED_TH, id, org, WFEE, uint256(1), dl)));
        vm.expectRevert(VoiceCampaigns.TooEarly.selector);
        vc.withdrawSeedWithSig(id, WFEE, dl, sig);

        vm.warp(block.timestamp + 31 days);
        dl = block.timestamp + 1 hours;
        bytes memory other = _sign(buyerPk, keccak256(abi.encode(WITHDRAW_SEED_TH, id, org, WFEE, uint256(1), dl)));
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.withdrawSeedWithSig(id, WFEE, dl, other);

        sig = _sign(orgPk, keccak256(abi.encode(WITHDRAW_SEED_TH, id, org, WFEE, uint256(1), dl)));
        uint256 before = usdc.balanceOf(org);
        vm.prank(relayer);
        vc.withdrawSeedWithSig(id, WFEE, dl, sig);
        assertEq(usdc.balanceOf(org) - before, 10e6 - WFEE);
        assertEq(vc.getCampaign(id).seedBalance, 0);

        vm.expectRevert(VoiceCampaigns.BadSignature.selector); // chiến dịch không tồn tại
        vc.withdrawSeedWithSig(99, WFEE, dl, sig);
    }

    // ================================================================== công bố phiên bản: chỉ chủ chiến dịch

    function _publishHash(uint256 id, bytes32 root, string memory uri, uint256 nonce, uint256 dl) internal pure returns (bytes32) {
        return keccak256(abi.encode(PUBLISH_TH, id, root, keccak256(bytes(uri)), nonce, dl));
    }

    function test_PublishSnapshotWithSigOnlyByCreator() public {
        uint256 id = _createSigned(0);
        bytes32 root = keccak256("root-v1");
        string memory uri = "http://127.0.0.1:8000/datasets/0/snapshots/1";
        uint256 dl = block.timestamp + 1 hours;
        uint256 nonce = vc.nonceOf(org);

        // ví nền tảng không tự công bố được, kể cả khi trả gas
        vm.prank(relayer);
        vm.expectRevert(VoiceCampaigns.NotCreator.selector);
        vc.publishSnapshot(id, root, uri);
        // người khác ký thay chủ chiến dịch
        bytes memory bad = _sign(buyerPk, _publishHash(id, root, uri, nonce, dl));
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.publishSnapshotWithSig(id, root, uri, dl, bad);
        // chữ ký đúng nhưng relayer sửa uri / root
        bytes memory sig = _sign(orgPk, _publishHash(id, root, uri, nonce, dl));
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.publishSnapshotWithSig(id, root, "http://evil/manifest", dl, sig);
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.publishSnapshotWithSig(id, keccak256("khac"), uri, dl, sig);

        vm.expectEmit(true, false, false, true);
        emit VoiceCampaigns.SnapshotPublished(id, root, uri);
        vm.prank(relayer);
        vc.publishSnapshotWithSig(id, root, uri, dl, sig);
        // không dùng lại được chữ ký
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.publishSnapshotWithSig(id, root, uri, dl, sig);
    }

    function test_PublishSnapshotWithSigGuards() public {
        uint256 id = _createSigned(0);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _publishHash(id, keccak256("r"), "u", vc.nonceOf(org), dl));
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.publishSnapshotWithSig(99, keccak256("r"), "u", dl, sig);
        vm.warp(dl + 1);
        vm.expectRevert(VoiceCampaigns.Expired.selector);
        vc.publishSnapshotWithSig(id, keccak256("r"), "u", dl, sig);
        // chủ chiến dịch tự gọi (tự trả gas) vẫn được
        vm.prank(org);
        vc.publishSnapshot(id, keccak256("r"), "u");
    }

    // ================================================================== bất biến: luôn đủ tiền

    /// Fuzz: tạo + mua + rút bằng chữ ký với phí tùy ý, số dư hợp đồng luôn >= tổng nghĩa vụ; rút hết không revert.
    function testFuzz_SponsoredSolvency(uint32 sec, uint32 seed, uint32 fee, uint8 buyers) public {
        uint256 f = bound(fee, 0, 2e6);
        _fuzzCreate(bound(seed, 0, 50e6), f);
        _contribute(0, uint32(bound(sec, 1, 300)));
        uint256 n = bound(buyers, 1, 5);
        for (uint256 k = 0; k < n; k++) {
            _fuzzBuy(k, f);
        }
        assertGe(usdc.balanceOf(address(vc)), _owed());

        vm.prank(an);
        vc.claim(0);
        if (vc.withdrawable(org) > WFEE) {
            uint256 dl = block.timestamp + 1 hours;
            bytes memory ws = _sign(orgPk, keccak256(abi.encode(WITHDRAW_TH, org, WFEE, vc.nonceOf(org), dl)));
            vc.withdrawWithSig(org, WFEE, dl, ws);
        }
        vm.prank(relayer);
        vc.withdraw();
        vc.withdraw(); // nền tảng
        // còn lại: doanh thu người tạo chưa rút (≤ phí rút) + quỹ mồi + bụi làm tròn (≤ 2 đơn vị mỗi lần bán)
        assertLe(usdc.balanceOf(address(vc)), vc.withdrawable(org) + vc.getCampaign(0).seedBalance + 2 * n + 2);
    }

    function _fuzzCreate(uint256 s, uint256 f) internal {
        usdc.mint(org, s);
        VoiceCampaigns.CampaignParams memory p = _params(s);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(orgPk, _createHash(p, org, f, 0, dl));
        vc.createCampaignWithSig(p, org, f, dl, sig, _permit(orgPk, org, s + f));
    }

    function _fuzzBuy(uint256 k, uint256 f) internal {
        (address b, uint256 bpk) = makeAddrAndKey(string(abi.encode("b", k)));
        usdc.mint(b, 1_000e6);
        _buyAs(b, bpk, f);
    }

    function _buyAs(address b, uint256 bpk, uint256 f) internal {
        uint256 price = vc.currentPrice(0);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory bs = _sign(bpk, _buyHash(b, price, f, dl));
        vc.buyWithSig(0, b, price, f, dl, bs, _permit(bpk, b, price + f));
    }

    function _buyHash(address b, uint256 price, uint256 f, uint256 dl) internal view returns (bytes32) {
        return keccak256(abi.encode(BUY_TH, uint256(0), b, price, f, vc.nonceOf(b), dl));
    }

    function _owed() internal view returns (uint256) {
        return vc.withdrawable(org) + vc.withdrawable(address(this)) + vc.withdrawable(relayer)
            + vc.pendingReward(0, an) + vc.getCampaign(0).seedBalance;
    }
}
