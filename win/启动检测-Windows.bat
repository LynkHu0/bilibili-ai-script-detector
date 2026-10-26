@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo 请先从 https://nodejs.org/ 安装 Node.js 22 或更新版本。 & pause & exit /b 1)
node native\install.mjs
pause
