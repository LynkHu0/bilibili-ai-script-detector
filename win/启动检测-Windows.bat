@echo off
chcp 65001 >nul
setlocal
set "BILI_SLOP_DATA_DIR=%LOCALAPPDATA%\BiliSlopData"
cd /d "%~dp0local-server" || (echo 无法打开本地服务文件夹。 & pause & exit /b 1)
where node >nul 2>nul || (echo 未安装 Node.js 22 或更新版本。请从 https://nodejs.org/ 安装后重新打开此文件。 & pause & exit /b 1)
node -e "const v=process.versions.node.split('.')[0];process.exit(Number(v)>=22?0:1)"
if errorlevel 1 (echo 当前 Node.js 版本过旧，请安装 Node.js 22 或更新版本。 & pause & exit /b 1)
if exist package.json if not exist node_modules\jose\package.json (
  echo 首次运行，正在准备本地依赖…
  call npm install --cache "%BILI_SLOP_DATA_DIR%\npm-cache" --no-fund --no-audit
  if errorlevel 1 (echo 依赖准备失败。请检查网络后重试。 & pause & exit /b 1)
)
start "" http://127.0.0.1:17653
echo 保持此窗口打开以使用检测功能。
node server.mjs
echo 本地检测程序已停止。
pause
