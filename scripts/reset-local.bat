@echo off
rem Xoa du lieu local (DB + audio cua cac lan chay Anvil cu). KHONG dung toi fuji/mainnet.
call "%~dp0_env.bat"
for /d %%D in ("%ROOT%\storage\local-*") do rmdir /s /q "%%D"
if exist "%ROOT%\storage\anvil-state.json" del "%ROOT%\storage\anvil-state.json"
echo Da xoa du lieu local.
