@echo off
setlocal
rem Deploy backend (NETWORK=fuji) len may ao Azure: Ubuntu + Docker Compose (API + Caddy HTTPS). MAC DINH CHI KIEM TRA.
rem   scripts\deploy-azure.bat            kiem tra: az da dang nhap, co may dung duoc, dung + quet thu muc build
rem   scripts\deploy-azure.bat --create   tao resource group + may ao (mot lan) roi deploy
rem   scripts\deploy-azure.bat --deploy   cap nhat ma + bien moi truong len may ao da co, build lai, cho /health
rem Dang nhap mot lan truoc do: az login (Azure for Students). Gia tri lay tu backend\.env.fuji.
rem KHONG chay song song backend Fuji o noi khac (chung vi relayer + database).
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%VENV_PY%" -m scripts.deploy_azure %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
