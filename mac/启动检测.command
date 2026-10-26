#!/bin/zsh
APP_DIR="${0:A:h}"
if ! command -v node >/dev/null; then
  print '请先从 https://nodejs.org/ 安装 Node.js 22 或更新版本，再重新打开此文件。'
  read '?按回车退出'; exit 1
fi
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)" || { print '需要 Node.js 22 或更新版本。'; read '?按回车退出'; exit 1; }
export BILI_SLOP_DATA_DIR="$HOME/Library/Application Support/StopTheSlop"
cd "$APP_DIR/local-server" || exit 1
if [[ -f package.json && ! -d node_modules/jose ]]; then
  npm install --cache "$BILI_SLOP_DATA_DIR/npm-cache" --no-fund --no-audit || exit 1
fi
BILI_SLOP_OPEN=1 node server.mjs
read '?程序已停止，按回车关闭窗口'
