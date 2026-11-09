@echo off
rem Demo end-to-end bang CLI (can: start-anvil.bat + deploy-local.bat + start-backend.bat dang chay)
call "%~dp0_env.bat"
pushd "%BACKEND%"
"%DATASETMARKETPLACE%" wallet init-local || (popd & exit /b 1)
"%DATASETMARKETPLACE%" status || (popd & exit /b 1)
"%DATASETMARKETPLACE%" demo e2e || (popd & exit /b 1)
"%DATASETMARKETPLACE%" demo scenario-611 || (popd & exit /b 1)
popd
