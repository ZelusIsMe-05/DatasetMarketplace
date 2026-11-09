@echo off
setlocal
rem Nap tien thu cho MOT vi cu the tren Anvil local (tu test bang MetaMask/Core): mUSDC qua faucet backend.
rem Web KHONG can ETH: nen tang tra phi mang ho. --eth chi dung khi tu gui giao dich (vd. CLI).
rem Can Anvil + deploy-local + backend dang chay. Chi chay o mang local.
rem Cach dung:  scripts\fund-wallet.bat 0xDIA_CHI_VI                    (+2.000 mUSDC)
rem             scripts\fund-wallet.bat 0xDIA_CHI_VI --usdc 500 --eth 1
if "%~1"=="" (
  echo Cach dung: scripts\fund-wallet.bat 0xDIA_CHI_VI [--usdc 2000] [--eth 0]
  echo Lay dia chi trong MetaMask: bam ten tai khoan ^> bieu tuong sao chep.
  exit /b 2
)
call "%~dp0_env.bat"
if "%NETWORK%"=="" set "NETWORK=local"
pushd "%BACKEND%"
"%VENV_PY%" -m scripts.fund_wallet %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
