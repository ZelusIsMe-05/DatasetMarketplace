@echo off
rem Khoi chay frontend Next.js (http://localhost:3000). Can backend dang chay (scripts\start-backend.bat).
call "%~dp0_env.bat"
pushd "%FRONTEND%"
if not exist node_modules call npm install --no-audit --no-fund
if not exist .env.local copy .env.example .env.local >nul
call npm run dev
popd
