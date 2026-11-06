// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Script DEPLOY: dùng cho cả 3 môi trường, tự rẽ nhánh theo chain id.
//   31337 = Anvil (local, tiền gas có sẵn)
//   43113 = Avalanche Fuji (testnet, AVAX test xin từ Core faucet)
//   43114 = Avalanche C-Chain mainnet (AVAX thật, USDC thật)
import {Script, console2} from "forge-std/Script.sol";
import {VoiceCampaigns} from "../src/VoiceCampaigns.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract Deploy is Script {
    uint256 constant LOCAL = 31337;
    uint256 constant FUJI = 43113;
    uint256 constant MAINNET = 43114;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address qcOracle = vm.envOr("QC_ORACLE", deployer);
        address feeCollector = vm.envOr("FEE_COLLECTOR", qcOracle);
        uint256 claimFee = vm.envOr("CLAIM_FEE", uint256(0));

        require(
            block.chainid == LOCAL || block.chainid == FUJI || block.chainid == MAINNET, "Unsupported chain"
        );

        vm.startBroadcast(pk);

        address token;
        if (block.chainid == MAINNET) {
            // Mainnet: BẮT BUỘC dùng USDC thật, không bao giờ deploy token giả lập
            token = vm.envAddress("USDC_ADDRESS");
            require(token.code.length > 0, "USDC_ADDRESS is not a contract");
        } else {
            // Local và Fuji: tự deploy token giả lập, tự mint
            MockUSDC mock = new MockUSDC();
            mock.mint(deployer, 1_000_000e6);
            token = address(mock);
        }

        VoiceCampaigns vc = new VoiceCampaigns(token, qcOracle, deployer);
        if (claimFee > 0 || feeCollector != deployer) {
            vc.setClaimFee(claimFee, feeCollector);
        }

        vm.stopBroadcast();

        console2.log("chainId       ", block.chainid);
        console2.log("token         ", token);
        console2.log("VoiceCampaigns", address(vc));
        console2.log("qcOracle      ", qcOracle);
        console2.log("feeCollector  ", feeCollector);

        // Ghi địa chỉ ra deployments/<chainId>.json để backend/CLI tự đọc (không cần chép tay).
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "token", token);
        vm.serializeAddress(key, "qcOracle", qcOracle);
        vm.serializeAddress(key, "feeCollector", feeCollector);
        vm.serializeAddress(key, "owner", deployer);
        vm.serializeUint(key, "claimFee", claimFee);
        vm.serializeUint(key, "deployBlock", block.number);
        string memory json = vm.serializeAddress(key, "voiceCampaigns", address(vc));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
