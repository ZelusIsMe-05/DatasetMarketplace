@echo off
rem Khoi chay chain local Anvil (chain id 31337) o cong %ANVIL_PORT% (8386, xem _env.bat).
rem Tham so "persist": luu trang thai chain ra contracts\.anvil\anvil-state.json (giu du lieu giua cac lan khoi dong).
rem Day la du lieu cua chain local (khong phai du lieu backend) nen nam canh contracts\, khong dua len cloud.
call "%~dp0_env.bat"
where anvil >nul 2>nul || (echo [LOI] Chua co anvil. Chay scripts\setup.bat & exit /b 1)
rem Cong da co node tra loi JSON-RPC? (khong dua vao chu LISTENING cua netstat: Windows co luc hien trang thai khac)
set "NODE="
for /f "delims=" %%v in ('cast client --rpc-url %ANVIL_RPC% 2^>nul') do set "NODE=%%v"
if defined NODE (
  echo [LOI] Cong %ANVIL_PORT% da co node dang chay: %NODE%
  echo       Neu la anvil/... thi Anvil cua du an da chay o cua so khac: dung tiep cua so do.
  echo       Xem tien trinh: netstat -ano ^| findstr ":%ANVIL_PORT%"
  exit /b 1
)
if /I "%~1"=="persist" (
  if not exist "%CONTRACTS%\.anvil" mkdir "%CONTRACTS%\.anvil"
  rem Chuyen file trang thai cu (truoc 09/11 nam o storage\) sang cho moi: giu nguyen chain dang co
  if exist "%ROOT%\storage\anvil-state.json" if not exist "%CONTRACTS%\.anvil\anvil-state.json" (
    move "%ROOT%\storage\anvil-state.json" "%CONTRACTS%\.anvil\anvil-state.json" >nul && echo Da chuyen storage\anvil-state.json sang contracts\.anvil\
  )
  anvil --port %ANVIL_PORT% --chain-id 31337 --state "%CONTRACTS%\.anvil\anvil-state.json"
) else (
  anvil --port %ANVIL_PORT% --chain-id 31337
)
