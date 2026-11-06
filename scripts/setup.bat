@echo off
setlocal
call "%~dp0_env.bat"
echo ==== Dataset Marketplace setup (Windows) ====

rem ---------- 1. Python >= 3.11, Node.js, Git
where python >nul 2>nul || (echo [LOI] Chua cai Python 3.11+ - https://www.python.org/downloads/ & exit /b 1)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" || (echo [LOI] Can Python 3.11 tro len & exit /b 1)
where npm >nul 2>nul || (echo [LOI] Chua cai Node.js 20+ - https://nodejs.org & exit /b 1)
where git >nul 2>nul || (echo [LOI] Chua cai Git - forge install can git & exit /b 1)

rem ---------- 2. Foundry (ban Windows chinh thuc, kiem tra SHA256)
where forge >nul 2>nul
if errorlevel 1 (
  echo Cai Foundry v1.9.0 vao %USERPROFILE%\.foundry\bin ...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-foundry.ps1"
  if errorlevel 1 (echo [LOI] Cai Foundry that bai & exit /b 1)
  set "PATH=%USERPROFILE%\.foundry\bin;%PATH%"
)
forge --version || exit /b 1

rem ---------- 3. Contracts
pushd "%CONTRACTS%"
call npm install --no-audit --no-fund || (popd & exit /b 1)
if not exist lib\forge-std\src\Test.sol (forge install foundry-rs/forge-std --no-git || (popd & exit /b 1))
forge build || (popd & exit /b 1)
popd

rem ---------- 4. Backend: venv + torch CPU + deps + CLI giongque
pushd "%BACKEND%"
if not exist .venv\Scripts\python.exe (python -m venv .venv || (popd & exit /b 1))
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu || (popd & exit /b 1)
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt --extra-index-url https://download.pytorch.org/whl/cpu || (popd & exit /b 1)
.venv\Scripts\python.exe -m pip install -e . || (popd & exit /b 1)
.venv\Scripts\python.exe -m scripts.export_abi || (popd & exit /b 1)
if not exist .env.local copy .env.local.example .env.local >nul
echo Tai truoc model QC (wav2vec2 + Silero VAD, khoang 400 MB, chi lan dau)...
.venv\Scripts\python.exe -c "from app.core.config import QcSettings; from app.qc.service import QcService; QcService(QcSettings()).get(); print('Model QC OK')"
popd

rem ---------- 5. Frontend (khung cho giai doan sau)
if exist "%FRONTEND%\package.json" (
  pushd "%FRONTEND%"
  call npm install --no-audit --no-fund
  if not exist .env.local copy .env.example .env.local >nul
  popd
)
echo.
echo ==== Xong. Tiep theo: scripts\start-anvil.bat, scripts\deploy-local.bat, scripts\start-backend.bat ====
endlocal
