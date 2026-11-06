@echo off
rem QC mot file audio: scripts\qc-check.bat duong\dan\file.wav "cau mau"
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%VENV_PY%" -m app.qc %*
set RC=%ERRORLEVEL%
popd
exit /b %RC%
