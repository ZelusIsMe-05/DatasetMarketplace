// ABI xuất từ Foundry (backend/scripts/export_abi.py chép vào lib/abi). Người mua / người tạo gọi trực tiếp
// contract bằng Core/MetaMask qua wagmi (đề xuất §8.1): approve + buy, createCampaign, withdraw.
import type { Abi } from "viem";
import mockUsdcAbi from "./abi/MockUSDC.json";
import voiceCampaignsAbi from "./abi/VoiceCampaigns.json";

export const VOICE_CAMPAIGNS_ABI = voiceCampaignsAbi as Abi;
export const TOKEN_ABI = mockUsdcAbi as Abi; // phần ERC-20 dùng được cho cả USDC thật trên mainnet
