@echo off

chcp 65001 >nul

cd /d "%~dp0"



echo.

echo ========================================

echo   数字方舟 · 桌面版

echo ========================================

echo.



where node >nul 2>&1

if errorlevel 1 (

  echo [错误] 未检测到 Node.js，请先安装 https://nodejs.org/

  pause

  exit /b 1

)



if not exist "node_modules\express" (

  echo [1/2] 正在安装依赖...

  call npm install --omit=dev

  if errorlevel 1 (

    echo [错误] 依赖安装失败

    pause

    exit /b 1

  )

)



if not exist "node_modules\electron\path.txt" (

  echo [提示] Electron 未安装，将使用浏览器模式。

  echo        如需真·桌面窗口，请先运行「安装桌面版.bat」

  echo.

  call "%~dp0启动.bat"

  exit /b 0

)



echo [2/2] 启动 Electron 桌面窗口...

call npm run desktop

if errorlevel 1 (

  echo.

  echo [失败] 桌面版启动失败，改用浏览器模式...

  call "%~dp0启动.bat"

)

pause

