#!/bin/zsh
cd "${0:A:h}" || exit 1
NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then
 print '请先从 https://nodejs.org/ 安装 Node.js 22 或更新版本。'; read '?按回车退出'; exit 1
fi
"$NODE_BIN" native/install.mjs "$NODE_BIN"
read '?安装步骤结束，可以关闭窗口。按回车退出'
