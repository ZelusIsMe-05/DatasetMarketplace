@echo off
setlocal
rem Chay toan bo test: Foundry + pytest (unit, QC model that, tich hop voi Anvil tu khoi chay).
rem KHONG can backend/anvil dang chay (test tu dung anvil rieng o cong ngau nhien).
call "%~dp0_env.bat"
set FAILED=0
echo ==== 1/3 Foundry: forge test -vv ====
pushd "%CONTRACTS%"
forge test -vv || set FAILED=1
popd
pushd "%BACKEND%"
echo ==== 2/3 pytest: unit + QC model that ====
"%VENV_PY%" -m pytest tests/unit -q -p no:cacheprovider || set FAILED=1
echo ==== 3/3 pytest: tich hop (Anvil + contract + API + QC) ====
"%VENV_PY%" -m pytest tests/integration -q -p no:cacheprovider || set FAILED=1
popd
if "%FAILED%"=="1" (echo [LOI] Co test that bai & exit /b 1)
echo ==== TAT CA TEST DAT ====
endlocal
