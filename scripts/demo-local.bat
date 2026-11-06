@echo off
rem Demo end-to-end bang CLI (can: start-anvil.bat + deploy-local.bat + start-backend.bat dang chay)
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%GIONGQUE%" wallet init-local || (popd & exit /b 1)
"%GIONGQUE%" status || (popd & exit /b 1)
"%GIONGQUE%" demo e2e || (popd & exit /b 1)
"%GIONGQUE%" demo scenario-611 || (popd & exit /b 1)
popd
