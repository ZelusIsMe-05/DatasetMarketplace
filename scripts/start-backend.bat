@echo off
rem Khoi chay FastAPI. Tham so: [local^|fuji^|mainnet] [reload]. Swagger: http://127.0.0.1:8000/docs
call "%~dp0_env.bat"
set "NETWORK=%~1"
if "%NETWORK%"=="" set "NETWORK=local"
if /I "%NETWORK%"=="fuji" (
  echo [CANH BAO] Backend Fuji dang chay tren may ao Azure ^(scripts\deploy-azure.bat^). Chay them o day se dung chung vi
  echo            relayer va database ^=^> trung nonce giao dich. Chi chay khi da dung may ao: az vm deallocate -g datasetmarketplace-rg -n dm-api
)
pushd "%BACKEND%"
if /I "%~2"=="reload" (
  "%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app
) else (
  "%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
)
popd
