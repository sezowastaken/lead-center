@echo off
rem Lead Center launcher (spec §36): start FastAPI, serve the built React app, wait for health, open browser.
rem Usage: LeadCenter.bat           -> start (builds the frontend only if it has never been built)
rem        LeadCenter.bat rebuild   -> force a frontend rebuild first
setlocal
cd /d "%~dp0"

where uv >nul 2>nul || (echo [Lead Center] 'uv' was not found. Install it from https://docs.astral.sh/uv/ & pause & exit /b 1)
where npm >nul 2>nul || (echo [Lead Center] 'npm' was not found. Install Node.js 20+ & pause & exit /b 1)

echo [Lead Center] Syncing backend dependencies...
pushd backend
call uv sync --quiet || (popd & pause & exit /b 1)
popd

if /i "%~1"=="rebuild" goto build
if exist "frontend\dist\index.html" goto start

:build
echo [Lead Center] Building frontend...
pushd frontend
if not exist node_modules call npm install --no-fund --no-audit || (popd & pause & exit /b 1)
call npm run build || (popd & pause & exit /b 1)
popd

:start
echo [Lead Center] Starting server on http://localhost:8000 ...
start "Lead Center server" /d "%~dp0backend" cmd /k uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

echo [Lead Center] Waiting for health check...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 60;$i++){ try { Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2 | Out-Null; $ok=$true; break } catch { Start-Sleep -Milliseconds 500 } }; if(-not $ok){ exit 1 }"
if errorlevel 1 (
  echo [Lead Center] Server did not become healthy. Check the "Lead Center server" window.
  pause
  exit /b 1
)

start "" http://localhost:8000
echo [Lead Center] Running. Close the "Lead Center server" window to stop.
endlocal
