@echo off
rem Wrapper CLI: scripts\datasetmarketplace.bat campaign list   (tuong duong backend\.venv\Scripts\datasetmarketplace.exe)
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%DATASETMARKETPLACE%" %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
