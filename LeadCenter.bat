@echo off
rem Lead Center launcher (spec §36): start FastAPI, serve the built React app, wait for health, open browser.
rem Usage: LeadCenter.bat           -> (re)start; builds the frontend only if it has never been built
rem        LeadCenter.bat rebuild   -> rebuild the frontend first (after updating the code)
rem A Lead Center that is already running is stopped first, so the new code is always what you get.
setlocal
cd /d "%~dp0"

where uv >nul 2>nul || (echo [Lead Center] 'uv' was not found. Install it from https://docs.astral.sh/uv/ & pause & exit /b 1)
where npm >nul 2>nul || (echo [Lead Center] 'npm' was not found. Install Node.js 20+ & pause & exit /b 1)

rem --- Stop an instance that is already running on port 8000 ---
rem exit 0 = nothing running or stopped, 2 = an old Lead Center without restart support, 3 = something else owns the port
powershell -NoProfile -Command "try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2 } catch { $h = $null }; if ($h -and $h.pid) { Write-Host ('[Lead Center] Stopping the running Lead Center, PID ' + $h.pid + ' ...'); Stop-Process -Id $h.pid -Force; for ($i = 0; $i -lt 20; $i++) { if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) { exit 0 }; Start-Sleep -Milliseconds 250 }; exit 3 } elseif ($h) { exit 2 } elseif (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) { exit 3 } else { exit 0 }"
if errorlevel 3 goto port_busy
if errorlevel 2 goto old_instance

echo [Lead Center] Syncing backend dependencies...
pushd backend
call uv sync --quiet || (popd & pause & exit /b 1)
popd

if /i "%~1"=="rebuild" goto build
if exist "frontend\dist\index.html" goto start

:build
echo [Lead Center] Building frontend...
pushd frontend
call npm install --no-fund --no-audit || (popd & pause & exit /b 1)
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
exit /b 0

:old_instance
echo [Lead Center] An older Lead Center is still running on port 8000.
echo [Lead Center] Close its "Lead Center server" window, then run LeadCenter.bat again.
pause
exit /b 1

:port_busy
echo [Lead Center] Port 8000 is in use by another program, so Lead Center cannot start.
echo [Lead Center] Close that program, then run LeadCenter.bat again.
pause
exit /b 1
