@echo off
rem Thiet lap moi truong chung cho cac script (goi bang: call "%~dp0_env.bat")
chcp 65001 >nul
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "BACKEND=%ROOT%\backend"
set "CONTRACTS=%ROOT%\contracts"
set "FRONTEND=%ROOT%\frontend"
set "VENV_PY=%BACKEND%\.venv\Scripts\python.exe"
set "DATASETMARKETPLACE=%BACKEND%\.venv\Scripts\datasetmarketplace.exe"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"
rem Foundry cai o %USERPROFILE%\.foundry\bin (setup.bat) - chi them vao PATH cua cua so nay
if exist "%USERPROFILE%\.foundry\bin\forge.exe" set "PATH=%USERPROFILE%\.foundry\bin;%PATH%"
rem Anvil cua du an chay cong 8386: chua cong 8545 cho Hardhat/Scaffold-ETH cua du an khac chay song song
rem (cung chain id 31337). Backend/frontend/CLI mac dinh cung dung 8386.
set "ANVIL_PORT=8386"
set "ANVIL_RPC=http://127.0.0.1:8386"
rem Khoa anvil #0: CONG KHAI, CHI dung cho chain local
set "ANVIL_KEY0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
set "ANVIL_ADDR1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
exit /b 0
