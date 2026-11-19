@echo off
rem Khoi chay frontend Next.js (http://localhost:3000). Can backend dang chay (scripts\start-backend.bat).
rem Tham so: [local^|fuji]. "fuji" = chay frontend tren may nhung tro vao Avalanche Fuji (backend: start-backend.bat fuji).
rem Bien dat o day ghi de frontend\.env.local cho rieng cua so nay (Next khong ghi de bien da co san trong moi truong).
call "%~dp0_env.bat"
pushd "%FRONTEND%"
if not exist node_modules call npm install --no-audit --no-fund
if not exist .env.local copy .env.example .env.local >nul
if /I "%~1"=="fuji" (
  set "NEXT_PUBLIC_NETWORK=fuji"
  set "NEXT_PUBLIC_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc"
  rem Backend Fuji chay tren may ao Azure (scripts\deploy-azure.bat) - xem docs\environment-variables.md muc G2
  set "NEXT_PUBLIC_API_URL=https://datasetmarketplace-df1d46.eastasia.cloudapp.azure.com"
  echo Frontend tro vao Avalanche Fuji 43113 + backend tren Azure
)
call npm run dev
popd
