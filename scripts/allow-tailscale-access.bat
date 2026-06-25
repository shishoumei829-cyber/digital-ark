@echo off
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
echo File: E:\pW�\>LK:��.bat
echo.
pause
exit /b 1
