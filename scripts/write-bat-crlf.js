const fs = require('fs');
const path = require('path');

const diag = `@echo off
cd /d "%~dp0"
echo.
echo ============================================================
echo   Digital Ark System Check
echo ============================================================
echo.
echo Step 1 - Node.js
node --version
if errorlevel 1 echo FAIL Node.js not found
echo.
echo Step 2 - npm
npm --version
if errorlevel 1 echo FAIL npm not found
echo.
echo Step 3 - node_modules
if exist node_modules (echo OK) else (echo FAIL run npm install)
echo.
echo Step 4 - Ollama
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if errorlevel 1 (echo FAIL) else (echo OK)
echo.
echo Step 5 - data folder
if exist "%USERPROFILE%\\digital_ark_data" (echo OK) else (echo not yet)
echo.
echo Step 6 - server port 3000
curl -s http://127.0.0.1:3000/health >nul 2>&1
if errorlevel 1 (echo FAIL start server) else (echo OK)
echo.
echo Step 7 - Tailscale IP
set TS_IP=
where tailscale >nul 2>&1
if errorlevel 1 goto ts_skip
for /f "tokens=*" %%i in ('tailscale ip -4 2^>nul') do set TS_IP=%%i
if not defined TS_IP goto ts_skip
echo IP %TS_IP%
echo Phone open: http://%TS_IP%:3000/apps/sanctuary.html
goto ts_done
:ts_skip
echo FAIL Tailscale not connected
:ts_done
echo.
echo If phone cannot connect run as ADMIN:
echo E:\\数字方舟\\放行手机访问.bat
echo.
pause
`;

const fw = `@echo off
cd /d "%~dp0"
title Digital Ark - allow phone access
net session >nul 2>&1
if errorlevel 1 goto need_admin
echo Adding firewall rule for port 3000...
powershell -NoProfile -Command "New-NetFirewallRule -DisplayName 'Digital Ark 3000' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null; Write-Host Done"
echo.
echo Next steps:
echo 1. Keep Digital-Ark-Server window open on PC
echo 2. Connect Tailscale on phone
echo 3. Open this URL on phone:
for /f "tokens=*" %%i in ('tailscale ip -4 2^>nul') do echo    http://%%i:3000/apps/sanctuary.html
echo.
pause
exit /b 0
:need_admin
echo.
echo NEED ADMIN: right-click this file - Run as administrator
echo File: E:\\数字方舟\\放行手机访问.bat
echo.
pause
exit /b 1
`;

function writeCrlf(file, content) {
  const crlf = content.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(file, crlf, 'ascii');
  console.log('wrote', file);
}

const root = path.join(__dirname, '..');
writeCrlf(path.join(root, '诊断.bat'), diag);
writeCrlf(path.join(root, '..', '放行手机访问.bat'), fw);
writeCrlf(path.join(__dirname, 'allow-tailscale-access.bat'), fw);
