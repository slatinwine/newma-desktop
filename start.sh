#!/usr/bin/env bash
# Newma Desktop（newma-web 嵌入版）一键启动（macOS / Linux）
set -e
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "首次运行，安装依赖..."
  npm install
fi
npm run dev
