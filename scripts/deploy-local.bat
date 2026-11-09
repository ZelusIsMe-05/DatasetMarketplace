@echo off
setlocal
rem Deploy MockUSDC + VoiceCampaigns + SeedDemo len Anvil (can scripts\start-anvil.bat dang chay o cua so khac)
call "%~dp0_env.bat"
pushd "%CONTRACTS%"
cast block-number --rpc-url %ANVIL_RPC% >nul 2>nul || (echo [LOI] Anvil chua chay o %ANVIL_RPC%: mo cua so khac va chay scripts\start-anvil.bat & popd & exit /b 1)
rem Chan deploy nham: node o cong nay phai la Anvil (Hardhat/Scaffold-ETH cung chain id 31337 nhung tra "HardhatNetwork/...")
set "NODE="
for /f "delims=" %%v in ('cast client --rpc-url %ANVIL_RPC% 2^>nul') do set "NODE=%%v"
echo %NODE%| findstr /b /i "anvil" >nul || (echo [LOI] Node o %ANVIL_RPC% la "%NODE%", khong phai Anvil cua du an - KHONG deploy. & popd & exit /b 1)
set "PRIVATE_KEY=%ANVIL_KEY0%"
set "CLAIM_FEE=100000"
forge build || (popd & exit /b 1)
forge script script/Deploy.s.sol --rpc-url %ANVIL_RPC% --broadcast || (popd & exit /b 1)
"%VENV_PY%" -c "import json;print(json.load(open('deployments/31337.json'))['voiceCampaigns'])" > "%TEMP%\gq_vc.txt" || (popd & exit /b 1)
set /p VOICE_CAMPAIGNS=<"%TEMP%\gq_vc.txt"
set "DEMO_BUYER=%ANVIL_ADDR1%"
forge script script/SeedDemo.s.sol --rpc-url %ANVIL_RPC% --broadcast || (popd & exit /b 1)
popd
pushd "%BACKEND%"
"%VENV_PY%" -m scripts.export_abi
popd
echo.
echo Da deploy. Dia chi o contracts\deployments\31337.json (backend tu doc). Khoi dong lai backend neu dang chay.
endlocal
