@echo off
setlocal
rem Xoa TOAN BO du lieu off-chain cua mot mang: bang database (SQLite hoac Neon/PostgreSQL theo DATABASE_URL)
rem + audio rieng tu trong storage\<mang>-*. Database va audio luon duoc xoa CUNG NHAU.
rem Khong dung toi blockchain. Mainnet: luon tu choi. Fuji: can them --allow-fuji.
rem Cach dung:  scripts\reset-db.bat            (NETWORK mac dinh local, hoi xac nhan)
rem             scripts\reset-db.bat --yes      (khong hoi)
call "%~dp0_env.bat"
if "%NETWORK%"=="" set "NETWORK=local"
pushd "%BACKEND%"
"%VENV_PY%" -m scripts.reset_db %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
