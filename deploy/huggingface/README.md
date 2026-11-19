---
title: Dataset Marketplace API
emoji: 🎙️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
startup_duration_timeout: 1h
pinned: false
short_description: Backend API (Avalanche Fuji) – chợ dữ liệu giọng nói Việt
---

# Dataset Marketplace — Backend API (Avalanche Fuji)

Backend FastAPI của **Dataset Marketplace** (Team1 Vietnam UniHack 2026): chợ dữ liệu giọng nói tiếng Việt có đồng thuận,
chia doanh thu trên Avalanche. Space này chạy `NETWORK=fuji`, kiểm tra chất lượng bản ghi bằng wav2vec2 + Silero VAD trên CPU.

- Web: https://dataset-marketplace-team1-2026.vercel.app
- Mã nguồn: https://github.com/ZelusIsMe-05/DatasetMarketplace
- Contract `VoiceCampaigns` (Fuji): [0xFFC08fAF4dEa52fF797FF2c937b0f000De61BaAc](https://testnet.snowtrace.io/address/0xFFC08fAF4dEa52fF797FF2c937b0f000De61BaAc#code)
- Tài liệu API (Swagger): `/docs`

Mã trong Space này được dựng tự động từ repo bằng `scripts\deploy-hf.bat`; bí mật (khóa relayer, database, kho audio) chỉ nằm
trong *Space secrets*.
