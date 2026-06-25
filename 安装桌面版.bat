@echo off
cd /d "%~dp0"
echo Installing Electron (~100MB, needs network)...
call npm install electron@28.3.3 --save-dev
if exist "node_modules\electron\path.txt" (
  echo Electron installed OK.
) else (
  echo Electron install incomplete. Use browser mode: double-click startup bat.
)
pause
