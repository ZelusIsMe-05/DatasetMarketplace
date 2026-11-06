@echo off
rem Khoi chay FastAPI. Tham so: [local^|fuji^|mainnet] [reload]. Swagger: http://127.0.0.1:8000/docs
call "%~dp0_env.bat"
set "NETWORK=%~1"
if "%NETWORK%"=="" set "NETWORK=local"
pushd "%BACKEND%"
if /I "%~2"=="reload" (
  "%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app
) else (
  "%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
)
popd
