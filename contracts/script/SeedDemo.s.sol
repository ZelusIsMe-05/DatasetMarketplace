// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Script CHỈ CHO DEMO (local + Fuji): tạo chiến dịch mẫu, cấp mUSDC và một ít AVAX
// cho ví người mua demo. Từ chối chạy trên mainnet.
//
// Khác bản gốc (mục 12.4): promptSetHash / termsHash được tính từ file THẬT trong ../seed/demo-campaign
// (bộ câu mẫu và điều khoản mà backend phục vụ), thay vì keccak256("prompt-set-v1") giả định,
// để GET /campaigns/{id}/terms khớp hash on-chain và chữ ký đồng thuận EIP-712 hợp lệ.
import {Script, console2} from "forge-std/Script.sol";
import {VoiceCampaigns} from "../src/VoiceCampaigns.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract SeedDemo is Script {
    function run() external {
        require(block.chainid != 43114, "SeedDemo must never run on mainnet");

        uint256 pk = vm.envUint("PRIVATE_KEY");
        VoiceCampaigns vc = VoiceCampaigns(vm.envAddress("VOICE_CAMPAIGNS"));
        MockUSDC usdc = MockUSDC(address(vc.token()));
        address demoBuyer = vm.envAddress("DEMO_BUYER");
        uint256 gasGift = vm.envOr("DEMO_BUYER_GAS_WEI", uint256(0.05 ether)); // 0,05 AVAX

        string memory dir = vm.envOr("SEED_DIR", string("../seed/demo-campaign"));
        bytes32 promptSetHash = keccak256(bytes(vm.readFile(string.concat(dir, "/prompts.txt"))));
        bytes32 termsHash = keccak256(bytes(vm.readFile(string.concat(dir, "/terms.md"))));
        string memory metadataURI = vm.envOr("SEED_METADATA_URI", string("seed:demo-campaign"));
        uint64 targetSec = uint64(vm.envOr("SEED_TARGET_SEC", uint256(36_000)));
        uint64 durationDays = uint64(vm.envOr("SEED_DAYS", uint256(30)));

        vm.startBroadcast(pk);

        // 1) Tiền trong app cho người mua demo: tự mint, không xin ai
        usdc.mint(demoBuyer, 2_000e6);

        // 2) Gas cho người mua demo: chuyển từ ví đội (AVAX đã xin từ faucet nếu ở Fuji)
        (bool ok,) = demoBuyer.call{value: gasGift}("");
        require(ok, "gas transfer failed");

        // 3) Chiến dịch mẫu: 10 giờ, giá đầy đủ 1.000 USDC, chia 80/10/10, hạn 30 ngày
        uint256 id = vc.createCampaign(
            targetSec,
            1_000e6,
            8_000,
            1_000,
            uint64(block.timestamp + durationDays * 1 days),
            promptSetHash,
            termsHash,
            metadataURI,
            0,
            0
        );

        vm.stopBroadcast();
        console2.log("demo campaign id", id);
        console2.log("demo buyer      ", demoBuyer);
        console2.log("start price     ", vc.currentPrice(id));
        console2.logBytes32(promptSetHash);
        console2.logBytes32(termsHash);
    }
}
