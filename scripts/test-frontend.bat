@echo off
setlocal
rem Kiem tra frontend: typecheck + lint + production build. Them tham so "e2e" de chay Playwright
rem (can Anvil + deploy + backend + "npm run dev" dang chay; lan dau: npx playwright install chromium).
call "%~dp0_env.bat"
pushd "%FRONTEND%"
call npm run typecheck || (popd & exit /b 1)
call npm run lint || (popd & exit /b 1)
call npm run build || (popd & exit /b 1)
if /I "%~1"=="e2e" (
  call npx playwright test || (popd & exit /b 1)
)
popd
echo ==== FRONTEND DAT ====
endlocal
