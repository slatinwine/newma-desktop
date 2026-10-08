@echo off
rem Newma Desktop（newma-web 嵌入版）一键启动（Windows）
cd /d "%~dp0"
if not exist node_modules (
  echo 首次运行，安装依赖...
  call npm install
)
call npm run dev
