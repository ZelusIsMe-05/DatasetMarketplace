@echo off
setlocal
rem Deploy len Avalanche Fuji (43113) + verify Snowtrace. MAC DINH CHAY THU (khong gui giao dich).
rem   scripts\deploy-fuji.bat               chay thu: kiem tra vi, so du, chain, mo phong Deploy.s.sol
rem   scripts\deploy-fuji.bat --broadcast   deploy THAT + SeedDemo + verify
rem   scripts\deploy-fuji.bat --verify-only verify lai contract da deploy
rem   scripts\deploy-fuji.bat --resume      da deploy nhung buoc sau loi: chay tiep SeedDemo (neu chua co chien dich) + verify
rem Khoa vi doc tu contracts\.env.fuji (mau: contracts\.env.fuji.example). Vi can AVAX test tu faucet.
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%VENV_PY%" -m scripts.deploy_fuji %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
