@echo off
setlocal
rem Deploy backend len Hugging Face Spaces (Docker, NETWORK=fuji). MAC DINH CHAY THU (khong tai len).
rem   scripts\deploy-hf.bat                     chay thu: dung thu muc build, quet bi mat
rem   scripts\deploy-hf.bat --upload            tao/cap nhat Space, dat secrets + variables, tai ma, cho Space chay
rem Dang nhap HF mot lan truoc do: backend\.venv\Scripts\hf.exe auth login (token quyen Write).
rem Gia tri lay tu backend\.env.fuji. KHONG chay song song backend Fuji o may khac (chung vi relayer + database).
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%VENV_PY%" -m scripts.deploy_hf %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
