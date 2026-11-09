// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test chạy trên EVM giả lập của Foundry: KHÔNG cần mạng, KHÔNG cần AVAX.
import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VoiceCampaigns} from "../src/VoiceCampaigns.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract VoiceCampaignsTest is Test {
    VoiceCampaigns vc;
    MockUSDC usdc;

    address qc = makeAddr("qc");
    address creator = makeAddr("creator");
    address an = makeAddr("an");
    address binh = makeAddr("binh");
    address labX = makeAddr("labX");
    address labY = makeAddr("labY");

    bytes32 constant CONSENT_TH =
        keccak256("Consent(uint256 campaignId,address contributor,bytes32 termsHash,uint256 nonce,uint256 deadline)");
    bytes32 constant REVOKE_TH = keccak256("Revoke(uint256 contributionId,uint256 nonce,uint256 deadline)");
    bytes32 constant CLAIM_TH =
        keccak256("Claim(uint256 campaignId,address contributor,uint256 maxFee,uint256 nonce,uint256 deadline)");

    function setUp() public {
        usdc = new MockUSDC();
        vc = new VoiceCampaigns(address(usdc), qc, address(this));
        usdc.mint(labX, 1_000e6);
        usdc.mint(labY, 1_000e6);
        vm.prank(creator);
        vc.createCampaign(
            36_000,
            1_000e6,
            8_000,
            1_000,
            uint64(block.timestamp + 30 days),
            keccak256("prompts"),
            keccak256("terms"),
            "ipfs://meta",
            0,
            0
        );
    }

    // ------------------------------------------------------------------ helpers

    function _buy(address buyer, uint256 maxPrice) internal {
        _buyOn(0, buyer, maxPrice);
    }

    function _buyOn(uint256 id, address buyer, uint256 maxPrice) internal {
        vm.startPrank(buyer);
        usdc.approve(address(vc), type(uint256).max);
        vc.buy(id, maxPrice);
        vm.stopPrank();
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("DatasetMarketplace"),
                keccak256("1"),
                block.chainid,
                address(vc)
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _sign(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(structHash));
        return abi.encodePacked(r, s, v);
    }

    function _consentAndRegister(address who, bytes32 commitment, uint32 sec) internal returns (uint256) {
        if (vc.consentAt(0, who) == 0) {
            vm.prank(who);
            vc.giveConsent(0);
        }
        vm.prank(qc);
        return vc.registerContribution(0, who, commitment, sec);
    }

    // ================================================================== 7 test gốc của tài liệu (mục 9.4)

    /// Kịch bản mục 6.11: An 2h, Bình 3h -> Lab X mua 650 -> An thu hồi -> Lab Y mua 510
    function test_ScenarioRevenueShareAndRevoke() public {
        vm.prank(an);
        vc.giveConsent(0);
        vm.prank(binh);
        vc.giveConsent(0);

        vm.startPrank(qc);
        uint256 idAn = vc.registerContribution(0, an, keccak256("an-1"), 7_200);
        vc.registerContribution(0, binh, keccak256("binh-1"), 10_800);
        vm.stopPrank();

        assertEq(vc.progressBps(0), 5_000);
        assertEq(vc.currentPrice(0), 650e6);
        _buy(labX, 650e6);

        assertApproxEqAbs(vc.pendingReward(0, an), 208e6, 1);
        assertApproxEqAbs(vc.pendingReward(0, binh), 312e6, 1);
        assertEq(vc.withdrawable(creator), 65e6);
        assertApproxEqAbs(vc.withdrawable(address(this)), 65e6, 1); // nền tảng

        vm.prank(an);
        vc.claim(0); // tự rút, không mất phí
        assertApproxEqAbs(usdc.balanceOf(an), 208e6, 1);

        vm.prank(an);
        vc.revoke(idAn);
        assertEq(vc.progressBps(0), 3_000);
        assertEq(vc.currentPrice(0), 510e6);
        assertApproxEqAbs(usdc.balanceOf(an), 208e6, 1); // thu hồi không lấy lại tiền đã kiếm

        _buy(labY, 510e6);
        assertEq(vc.pendingReward(0, an), 0); // không được chia lần bán sau
        assertApproxEqAbs(vc.pendingReward(0, binh), 720e6, 2); // 312 + 408 (toàn bộ về Bình)
        assertEq(vc.withdrawable(creator), 65e6 + 51e6);

        // Tổng tiền trong contract khớp với nghĩa vụ phải trả
        vm.prank(binh);
        vc.claim(0);
        vm.prank(creator);
        vc.withdraw();
        vc.withdraw(); // nền tảng (owner = test contract)
        // Thay đổi so với bản gốc: phần làm tròn lên dành cho người đóng góp có thể để lại
        // tối đa vài đơn vị (1e-6 USDC) không ai rút; KHÔNG BAO GIỜ thiếu tiền.
        assertLe(usdc.balanceOf(address(vc)), 2);
        assertEq(
            usdc.balanceOf(an) + usdc.balanceOf(binh) + usdc.balanceOf(creator) + usdc.balanceOf(address(this))
                + usdc.balanceOf(address(vc)),
            650e6 + 510e6
        );
    }

    /// Rút qua relayer: người dùng chỉ ký, relayer trả gas, phí trừ bằng token của app
    function test_ClaimWithSigChargesFeeInAppToken() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        address relayer = makeAddr("relayer");
        vc.setClaimFee(100_000, relayer); // 0,1 mUSDC

        vm.prank(alice);
        vc.giveConsent(0);
        vm.prank(qc);
        vc.registerContribution(0, alice, keccak256("alice-1"), 18_000);
        _buy(labX, 650e6); // alice là người đóng góp duy nhất -> nhận 520

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 h = keccak256(abi.encode(CLAIM_TH, uint256(0), alice, uint256(100_000), uint256(0), deadline));
        bytes memory sig = _sign(pk, h);

        vm.prank(relayer); // relayer gửi giao dịch, trả gas AVAX
        vc.claimWithSig(0, alice, 100_000, deadline, sig);

        assertApproxEqAbs(usdc.balanceOf(alice), 520e6 - 100_000, 1);
        assertEq(vc.withdrawable(relayer), 100_000);
    }

    function test_ClaimWithSigRevertsIfFeeRaised() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        vm.prank(alice);
        vc.giveConsent(0);
        vm.prank(qc);
        vc.registerContribution(0, alice, keccak256("alice-1"), 18_000);
        _buy(labX, 650e6);

        vc.setClaimFee(500_000, address(this)); // phí tăng sau khi user đã ký maxFee = 0,1
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 h = keccak256(abi.encode(CLAIM_TH, uint256(0), alice, uint256(100_000), uint256(0), deadline));
        bytes memory sig = _sign(pk, h);
        vm.expectRevert(VoiceCampaigns.FeeTooHigh.selector);
        vc.claimWithSig(0, alice, 100_000, deadline, sig);
    }

    function test_ConsentWithSigAndRevokeWithSig() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 consentHash =
            keccak256(abi.encode(CONSENT_TH, uint256(0), alice, keccak256("terms"), uint256(0), deadline));
        vc.giveConsentWithSig(0, alice, deadline, _sign(pk, consentHash)); // relayer gửi
        assertGt(vc.consentAt(0, alice), 0);

        vm.prank(qc);
        uint256 id = vc.registerContribution(0, alice, keccak256("alice-1"), 600);

        bytes32 revokeHash = keccak256(abi.encode(REVOKE_TH, id, uint256(1), deadline));
        vc.revokeWithSig(id, deadline, _sign(pk, revokeHash));
        (,,,,, uint64 revokedAt) = vc.contributions(id);
        assertGt(revokedAt, 0);
    }

    function test_RevertWithoutConsent() public {
        vm.prank(qc);
        vm.expectRevert(VoiceCampaigns.NoConsent.selector);
        vc.registerContribution(0, an, keccak256("x"), 10);
    }

    function test_RevertDuplicateCommitment() public {
        vm.prank(an);
        vc.giveConsent(0);
        vm.startPrank(qc);
        vc.registerContribution(0, an, keccak256("same"), 10);
        vm.expectRevert(VoiceCampaigns.DuplicateCommitment.selector);
        vc.registerContribution(0, an, keccak256("same"), 10);
        vm.stopPrank();
    }

    function test_RevertPriceTooHigh() public {
        vm.prank(an);
        vc.giveConsent(0);
        vm.prank(qc);
        vc.registerContribution(0, an, keccak256("a"), 18_000);
        vm.startPrank(labX);
        usdc.approve(address(vc), type(uint256).max);
        vm.expectRevert(VoiceCampaigns.PriceTooHigh.selector);
        vc.buy(0, 600e6); // giá thực 650
        vm.stopPrank();
    }

    // ================================================================== bổ sung: giá và tiến độ (mục 6.5)

    function test_PriceTableMatchesSpec() public {
        assertEq(vc.currentPrice(0), 300e6); // 0%
        _consentAndRegister(an, keccak256("p1"), 9_000);
        assertEq(vc.currentPrice(0), 475e6); // 25%
        _consentAndRegister(an, keccak256("p2"), 9_000);
        assertEq(vc.currentPrice(0), 650e6); // 50%
        _consentAndRegister(an, keccak256("p3"), 9_000);
        assertEq(vc.currentPrice(0), 825e6); // 75%
        _consentAndRegister(an, keccak256("p4"), 9_000);
        assertEq(vc.currentPrice(0), 1_000e6); // 100%
        assertEq(vc.progressBps(0), 10_000);
    }

    function test_ViewsOnUnknownCampaignDoNotRevert() public view {
        assertEq(vc.progressBps(99), 0);
        assertEq(vc.currentPrice(99), 0);
        assertFalse(vc.isCollecting(99));
    }

    function test_NothingToSellWithoutContributions() public {
        vm.startPrank(labX);
        usdc.approve(address(vc), type(uint256).max);
        vm.expectRevert(VoiceCampaigns.NothingToSell.selector);
        vc.buy(0, 1_000e6);
        vm.stopPrank();
    }

    function test_OneLicensePerWallet() public {
        _consentAndRegister(an, keccak256("a"), 100);
        _buy(labX, type(uint256).max);
        (uint64 purchasedAt, uint16 p, uint128 paid) = vc.licenses(0, labX);
        assertGt(purchasedAt, 0);
        assertEq(p, vc.progressBps(0));
        assertEq(paid, vc.currentPrice(0));
        vm.prank(labX);
        vm.expectRevert(VoiceCampaigns.AlreadyLicensed.selector);
        vc.buy(0, type(uint256).max);
    }

    // ================================================================== bổ sung: thời hạn thu thập (mục 5, 6.9, 6.10)

    function test_StopsCollectingWhenTargetReached() public {
        _consentAndRegister(an, keccak256("a"), 36_000);
        assertFalse(vc.isCollecting(0));
        vm.prank(binh);
        vc.giveConsent(0);
        vm.prank(qc);
        vm.expectRevert(VoiceCampaigns.NotCollecting.selector);
        vc.registerContribution(0, binh, keccak256("b"), 10);
        // vẫn bán được sau khi ngừng thu thập
        _buy(labX, 1_000e6);
    }

    function test_ResumesCollectingAfterRevokeBelowTarget() public {
        uint256 id = _consentAndRegister(an, keccak256("a"), 36_000);
        assertFalse(vc.isCollecting(0));
        vm.prank(an);
        vc.revoke(id);
        assertTrue(vc.isCollecting(0)); // NgungThuThap -> DangThuThap
    }

    function test_StopsCollectingAfterDeadline() public {
        _consentAndRegister(an, keccak256("a"), 100);
        vm.warp(block.timestamp + 30 days);
        assertFalse(vc.isCollecting(0));
        vm.prank(qc);
        vm.expectRevert(VoiceCampaigns.NotCollecting.selector);
        vc.registerContribution(0, an, keccak256("b"), 10);
        _buy(labX, type(uint256).max); // vẫn bán theo tiến độ
    }

    function test_CreateCampaignValidation() public {
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.createCampaign(0, 1, 8_000, 1_000, uint64(block.timestamp + 1), 0, 0, "", 0, 0);
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.createCampaign(1, 0, 8_000, 1_000, uint64(block.timestamp + 1), 0, 0, "", 0, 0);
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.createCampaign(1, 1, 8_000, 1_000, uint64(block.timestamp), 0, 0, "", 0, 0);
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.createCampaign(1, 1, 9_000, 1_001, uint64(block.timestamp + 1), 0, 0, "", 0, 0);
    }

    // ================================================================== bổ sung: quỹ mồi (mục 6.2, 6.9)

    function test_SeedFundPaysEarlyContributorsAndRefundsCreator() public {
        usdc.mint(creator, 200e6);
        vm.startPrank(creator);
        usdc.approve(address(vc), 200e6);
        // 200 USDC, 0,5 USDC/phút = 8333 đơn vị/giây (làm tròn xuống)
        uint256 rate = uint256(500_000) / 60;
        uint256 id = vc.createCampaign(
            36_000, 1_000e6, 8_000, 1_000, uint64(block.timestamp + 30 days), 0, 0, "", rate, 200e6
        );
        vm.stopPrank();

        vm.prank(an);
        vc.giveConsent(id);
        vm.prank(qc);
        vc.registerContribution(id, an, keccak256("seed-1"), 600); // 10 phút
        assertEq(vc.pendingReward(id, an), 600 * rate); // ~5 USDC trả ngay

        vm.prank(creator);
        vm.expectRevert(VoiceCampaigns.TooEarly.selector);
        vc.withdrawSeed(id);

        vm.prank(an);
        vm.expectRevert(VoiceCampaigns.NotCreator.selector);
        vc.withdrawSeed(id);

        vm.warp(block.timestamp + 30 days);
        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        vc.withdrawSeed(id);
        assertEq(usdc.balanceOf(creator) - before, 200e6 - 600 * rate);

        vm.prank(an);
        vc.claim(id);
        assertEq(usdc.balanceOf(an), 600 * rate);
    }

    function test_SeedPaymentCappedAtBalance() public {
        usdc.mint(creator, 10);
        vm.startPrank(creator);
        usdc.approve(address(vc), 10);
        uint256 id = vc.createCampaign(1_000, 1e6, 8_000, 1_000, uint64(block.timestamp + 1 days), 0, 0, "", 1, 10);
        vm.stopPrank();
        vm.prank(an);
        vc.giveConsent(id);
        vm.prank(qc);
        vc.registerContribution(id, an, keccak256("cap"), 50);
        assertEq(vc.pendingReward(id, an), 10);
        assertEq(vc.getCampaign(id).seedBalance, 0);
    }

    // ================================================================== bổ sung: chia doanh thu

    function test_LateContributorDoesNotShareEarlierSale() public {
        _consentAndRegister(an, keccak256("a"), 1_000);
        _buy(labX, type(uint256).max);
        uint256 anBefore = vc.pendingReward(0, an);
        _consentAndRegister(binh, keccak256("b"), 1_000);
        assertEq(vc.pendingReward(0, binh), 0);
        assertEq(vc.pendingReward(0, an), anBefore);
    }

    function test_ClaimTwiceReverts() public {
        _consentAndRegister(an, keccak256("a"), 1_000);
        _buy(labX, type(uint256).max);
        vm.startPrank(an);
        vc.claim(0);
        vm.expectRevert(VoiceCampaigns.NothingToClaim.selector);
        vc.claim(0);
        vm.stopPrank();
    }

    function test_ClaimAfterRevokeStillPaysEarned() public {
        uint256 id = _consentAndRegister(an, keccak256("a"), 18_000);
        _buy(labX, 650e6);
        vm.prank(an);
        vc.revoke(id); // thu hồi trước khi rút
        assertApproxEqAbs(vc.pendingReward(0, an), 520e6, 1);
        vm.prank(an);
        vc.claim(0);
        assertApproxEqAbs(usdc.balanceOf(an), 520e6, 1);
    }

    /// Hồi quy cho lỗi làm tròn của bản gốc: 1 người 3 giây, 2 lần bán với phần chia ≡ 1 (mod 3).
    /// Bản gốc (làm tròn xuống) nợ nhiều hơn số dư 1 đơn vị => lần rút cuối bị revert.
    function test_RoundingNeverInsolvent() public {
        // 100% cho người đóng góp; tiến độ ~0 nên giá = 30% * 3_333_338 = 1_000_001 ≡ 2 (mod 3)
        vm.prank(creator);
        uint256 id = vc.createCampaign(1_000_000, 3_333_338, 10_000, 0, uint64(block.timestamp + 1 days), 0, 0, "", 0, 0);
        vm.prank(an);
        vc.giveConsent(id);
        vm.prank(qc);
        vc.registerContribution(id, an, keccak256("r"), 3);
        uint256 price = vc.currentPrice(id);
        assertEq(price, 1_000_001);

        _buyOn(id, labX, price);
        _buyOn(id, labY, price);
        // An được floor(3 * 2 * floor(S*1e18/3) / 1e18) = 2S - 1.
        // Bản gốc chỉ giữ lại 2 * (S - 1) = 2S - 2 cho người đóng góp và giao 2 đơn vị cho nền tảng
        // => tổng nghĩa vụ 2S + 1 > số dư 2S.
        assertEq(vc.pendingReward(id, an), 2 * price - 1);
        uint256 owed = vc.pendingReward(id, an) + vc.withdrawable(address(this)) + vc.withdrawable(creator);
        assertLe(owed, usdc.balanceOf(address(vc)));

        vm.prank(an);
        vc.claim(id);
        vc.withdraw(); // nền tảng: không được revert vì thiếu tiền
        assertEq(usdc.balanceOf(an), 2 * price - 1);
        assertEq(usdc.balanceOf(an) + usdc.balanceOf(address(this)) + usdc.balanceOf(address(vc)), 2 * price);
    }

    /// Fuzz: sau nhiều lần đóng góp / bán / thu hồi, số dư contract luôn >= tổng nghĩa vụ.
    function testFuzz_Solvency(uint32[4] memory secs, uint8 revokeMask, uint8 sales) public {
        address[4] memory people = [an, binh, makeAddr("c3"), makeAddr("c4")];
        uint256[4] memory ids;
        for (uint256 i = 0; i < 4; i++) {
            uint32 s = uint32(bound(secs[i], 1, 8_000));
            ids[i] = _consentAndRegister(people[i], keccak256(abi.encode("f", i)), s);
        }
        uint256 n = bound(sales, 1, 6);
        for (uint256 k = 0; k < n; k++) {
            address buyer = makeAddr(string(abi.encode("buyer", k)));
            usdc.mint(buyer, 1_000e6);
            _buy(buyer, type(uint256).max);
            if (k < 4 && (revokeMask >> k) & 1 == 1) {
                vm.prank(people[k]);
                vc.revoke(ids[k]);
            }
            if (vc.getCampaign(0).totalWeight == 0) break;
        }
        uint256 owed = vc.withdrawable(creator) + vc.withdrawable(address(this)) + vc.withdrawable(vc.feeCollector());
        if (vc.feeCollector() == address(this)) owed -= vc.withdrawable(address(this));
        for (uint256 i = 0; i < 4; i++) {
            owed += vc.pendingReward(0, people[i]);
        }
        assertGe(usdc.balanceOf(address(vc)), owed);
        // rút hết thì không ai bị revert
        for (uint256 i = 0; i < 4; i++) {
            if (vc.pendingReward(0, people[i]) > 0) {
                vm.prank(people[i]);
                vc.claim(0);
            }
        }
        vm.prank(creator);
        vc.withdraw();
        vc.withdraw();
        assertLe(usdc.balanceOf(address(vc)), 4 + 2 * n);
    }

    // ================================================================== bổ sung: chữ ký, chống phát lại, quyền

    function test_ConsentSignatureCannotBeReplayed() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        vm.prank(creator);
        vc.createCampaign(100, 1e6, 8_000, 1_000, uint64(block.timestamp + 1 days), 0, keccak256("terms"), "", 0, 0);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig =
            _sign(pk, keccak256(abi.encode(CONSENT_TH, uint256(0), alice, keccak256("terms"), uint256(0), deadline)));
        vc.giveConsentWithSig(0, alice, deadline, sig);
        // dùng lại chữ ký cho chiến dịch khác: nonce đã tăng & campaignId khác => sai chữ ký
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.giveConsentWithSig(1, alice, deadline, sig);
    }

    function test_ConsentSignatureBoundToTermsHash() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        uint256 deadline = block.timestamp + 1 hours;
        // ký với termsHash sai (không phải bản đã công bố on-chain)
        bytes memory sig =
            _sign(pk, keccak256(abi.encode(CONSENT_TH, uint256(0), alice, keccak256("other"), uint256(0), deadline)));
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.giveConsentWithSig(0, alice, deadline, sig);
    }

    function test_ExpiredSignaturesRevert() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig =
            _sign(pk, keccak256(abi.encode(CONSENT_TH, uint256(0), alice, keccak256("terms"), uint256(0), deadline)));
        vm.warp(deadline + 1);
        vm.expectRevert(VoiceCampaigns.Expired.selector);
        vc.giveConsentWithSig(0, alice, deadline, sig);
        vm.expectRevert(VoiceCampaigns.Expired.selector);
        vc.revokeWithSig(0, deadline, sig);
        vm.expectRevert(VoiceCampaigns.Expired.selector);
        vc.claimWithSig(0, alice, 0, deadline, sig);
    }

    function test_AlreadyConsented() public {
        vm.startPrank(an);
        vc.giveConsent(0);
        vm.expectRevert(VoiceCampaigns.AlreadyConsented.selector);
        vc.giveConsent(0);
        vm.stopPrank();
    }

    function test_ConsentUnknownCampaign() public {
        vm.prank(an);
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.giveConsent(7);
    }

    function test_ClaimWithSigWrongSignerReverts() public {
        (address alice,) = makeAddrAndKey("alice");
        (, uint256 evePk) = makeAddrAndKey("eve");
        _consentAndRegister(alice, keccak256("a"), 1_000);
        _buy(labX, type(uint256).max);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(evePk, keccak256(abi.encode(CLAIM_TH, uint256(0), alice, uint256(0), uint256(0), deadline)));
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.claimWithSig(0, alice, 0, deadline, sig);
    }

    function test_ClaimWithSigReplayReverts() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        _consentAndRegister(alice, keccak256("a"), 1_000);
        _buy(labX, type(uint256).max);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(pk, keccak256(abi.encode(CLAIM_TH, uint256(0), alice, uint256(0), uint256(0), deadline)));
        vc.claimWithSig(0, alice, 0, deadline, sig);
        _buy(labY, type(uint256).max); // có tiền mới
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.claimWithSig(0, alice, 0, deadline, sig);
    }

    function test_RevokeAuthorization() public {
        uint256 id = _consentAndRegister(an, keccak256("a"), 100);
        vm.prank(binh);
        vm.expectRevert(VoiceCampaigns.NotContributor.selector);
        vc.revoke(id);
        vm.startPrank(an);
        vc.revoke(id);
        vm.expectRevert(VoiceCampaigns.AlreadyRevoked.selector);
        vc.revoke(id);
        vm.stopPrank();
    }

    function test_RevokeWithSigUnknownContributionReverts() public {
        (, uint256 pk) = makeAddrAndKey("alice");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(pk, keccak256(abi.encode(REVOKE_TH, uint256(42), uint256(0), deadline)));
        vm.expectRevert(VoiceCampaigns.BadSignature.selector);
        vc.revokeWithSig(42, deadline, sig);
    }

    function test_CommitmentLockedForeverEvenAfterRevoke() public {
        uint256 id = _consentAndRegister(an, keccak256("same"), 100);
        vm.prank(an);
        vc.revoke(id);
        vm.prank(qc);
        vm.expectRevert(VoiceCampaigns.DuplicateCommitment.selector);
        vc.registerContribution(0, an, keccak256("same"), 100);
    }

    function test_OnlyQcCanRegister_OnlyCreatorCanPublish() public {
        vm.prank(an);
        vc.giveConsent(0);
        vm.expectRevert(VoiceCampaigns.NotQcOracle.selector);
        vc.registerContribution(0, an, keccak256("x"), 10);
        // Phiên bản dataset thuộc quyền chủ chiến dịch: ví nền tảng (QC oracle) không công bố được
        vm.prank(qc);
        vm.expectRevert(VoiceCampaigns.NotCreator.selector);
        vc.publishSnapshot(0, keccak256("root"), "uri");
        vm.prank(an);
        vm.expectRevert(VoiceCampaigns.NotCreator.selector);
        vc.publishSnapshot(0, keccak256("root"), "uri");
    }

    function test_ZeroDurationRejected() public {
        vm.prank(an);
        vc.giveConsent(0);
        vm.prank(qc);
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.registerContribution(0, an, keccak256("x"), 0);
    }

    function test_PublishSnapshotEmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit VoiceCampaigns.SnapshotPublished(0, keccak256("root"), "datasetmarketplace://snapshot/0/1");
        vm.prank(creator);
        vc.publishSnapshot(0, keccak256("root"), "datasetmarketplace://snapshot/0/1");
        vm.prank(creator);
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.publishSnapshot(5, keccak256("root"), "x");
    }

    function test_PlatformConfigOnlyOwner() public {
        vm.startPrank(an);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, an));
        vc.setQcOracle(an);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, an));
        vc.setClaimFee(1, an);
        vm.stopPrank();
        vm.expectRevert(VoiceCampaigns.InvalidParams.selector);
        vc.setClaimFee(1, address(0));
        vc.setQcOracle(an);
        assertEq(vc.qcOracle(), an);
    }

    function test_ClaimFeeMustBeBelowAmount() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        vc.setClaimFee(1_000e6, address(this)); // phí lớn hơn số tiền
        _consentAndRegister(alice, keccak256("a"), 1_000);
        _buy(labX, type(uint256).max);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig =
            _sign(pk, keccak256(abi.encode(CLAIM_TH, uint256(0), alice, uint256(1_000e6), uint256(0), deadline)));
        vm.expectRevert(VoiceCampaigns.NothingToClaim.selector);
        vc.claimWithSig(0, alice, 1_000e6, deadline, sig);
    }
}
