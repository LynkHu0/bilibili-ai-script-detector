#!/bin/zsh
APP_DIR="${0:A:h}"
NODE_BIN="$APP_DIR/runtime/node"
if [[ ! -x "$NODE_BIN" ]]; then
  print '内置运行环境缺失或不可执行，请重新下载完整的 mac 安装包并解压。'
  read '?按回车退出'; exit 1
fi
expected_arch="$(/bin/cat "$APP_DIR/runtime/ARCH" 2>/dev/null)"
if [[ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" == "1" ]]; then
  host_arch=arm64
else
  host_arch=x64
fi
if [[ "$expected_arch" != "$host_arch" ]]; then
  print "下载包与处理器不匹配：请下载 mac-$host_arch 版。"
  read '?按回车退出'; exit 1
fi
export BILI_SLOP_DATA_DIR="$HOME/Library/Application Support/StopTheSlop"
cd "$APP_DIR/local-server" || exit 1
BILI_SLOP_OPEN=1 "$NODE_BIN" server.mjs
read '?程序已停止，按回车关闭窗口'
