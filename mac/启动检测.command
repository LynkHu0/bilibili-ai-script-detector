#!/bin/zsh
cd "${0:A:h}/local-server" || exit 1
export BILI_SLOP_DATA_DIR="${PWD:h:h}/.local-data"
if ! command -v node >/dev/null; then
  print '需要 Node.js 22 或更新版本。'; read '?按回车退出'; exit 1
fi
if [[ ! -d node_modules/jose ]]; then
  npm install --cache "${BILI_SLOP_DATA_DIR}/npm-cache" --no-fund --no-audit || exit 1
fi
BILI_SLOP_OPEN=1 node server.mjs
read '?程序已停止，按回车关闭窗口'
