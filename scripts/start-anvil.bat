@echo off
rem Khoi chay chain local Anvil (chain id 31337).
rem Tham so "persist": luu trang thai ra storage\anvil-state.json (giu du lieu giua cac lan khoi dong)
call "%~dp0_env.bat"
where anvil >nul 2>nul || (echo [LOI] Chua co anvil. Chay scripts\setup.bat & exit /b 1)
if /I "%~1"=="persist" (
  if not exist "%ROOT%\storage" mkdir "%ROOT%\storage"
  anvil --port 8545 --chain-id 31337 --state "%ROOT%\storage\anvil-state.json"
) else (
  anvil --port 8545 --chain-id 31337
)
