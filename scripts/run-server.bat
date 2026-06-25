@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 数字方舟 - 本地服务
echo 数字方舟本地服务运行中...
echo 浏览器访问: http://127.0.0.1:3000/apps/sanctuary.html
echo 关闭此窗口将停止服务
node server.js
pause
