@echo off
setlocal
rem Reset SACH moi truong local: du lieu off-chain (database SQLite hoac Neon + audio) va trang thai Anvil da luu.
rem Truoc khi chay: TAT cua so backend va cua so Anvil.
call "%~dp0_env.bat"
set "NETWORK=local"
pushd "%BACKEND%"
"%VENV_PY%" -m scripts.reset_db %*
set RC=%ERRORLEVEL%
popd
if not "%RC%"=="0" exit /b %RC%
if exist "%CONTRACTS%\.anvil\anvil-state.json" del "%CONTRACTS%\.anvil\anvil-state.json"
if exist "%ROOT%\storage\anvil-state.json" del "%ROOT%\storage\anvil-state.json"
echo.
echo Tiep theo (moi lenh mot cua so CMD):
echo   1. scripts\start-anvil.bat      ^(chain moi^)
echo   2. scripts\deploy-local.bat     ^(contract moi + chien dich mau #0 tu seed^)
echo   3. scripts\start-backend.bat    ^(tu tao lai bang, nap seed, dong bo chain^)
endlocal
