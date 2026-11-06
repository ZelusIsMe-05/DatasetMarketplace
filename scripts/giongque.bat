@echo off
rem Wrapper CLI: scripts\giongque.bat campaign list   (tuong duong backend\.venv\Scripts\giongque.exe)
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%GIONGQUE%" %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
