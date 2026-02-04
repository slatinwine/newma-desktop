#!/bin/bash

echo "╔════════════════════════════════════════════════════════╗"
echo "║          Newma Desktop - 启动测试                      ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# 检查编译产物
echo "1️⃣  检查编译产物..."
if [ -f "dist/main/main/index.js" ]; then
    echo "   ✅ Main process compiled"
else
    echo "   ❌ Main process NOT found"
    exit 1
fi

if [ -f "dist/preload/preload/index.js" ]; then
    echo "   ✅ Preload script compiled"
else
    echo "   ❌ Preload script NOT found"
    exit 1
fi

if [ -f "src/renderer/build/index.html" ]; then
    echo "   ✅ Renderer page exists"
else
    echo "   ❌ Renderer page NOT found"
    exit 1
fi

echo ""
echo "2️⃣  检查 Electron..."
if [ -d "node_modules/electron/dist" ]; then
    echo "   ✅ Electron binary exists"
else
    echo "   ❌ Electron NOT found"
    exit 1
fi

echo ""
echo "3️⃣  启动应用..."
echo "   如果 Electron 窗口打开，说明成功！"
echo ""

# 启动 Electron
npx electron . &
ELECTRON_PID=$!

echo "   Electron PID: $ELECTRON_PID"
echo ""
echo "4️⃣  等待启动..."
sleep 8

# 检查进程是否还在运行
if ps -p $ELECTRON_PID > /dev/null; then
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║            ✅ Newma Desktop 已启动！                   ║"
    echo "╠════════════════════════════════════════════════════════╣"
    echo "║  你应该能看到一个紫色渐变的窗口                    ║"
    echo "║  显示 'Newma Desktop' 和系统信息                      ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    echo "应用正在运行中 (PID: $ELECTRON_PID)"
    echo ""
    echo "查看应用窗口，然后按 Ctrl+C 停止"
    echo ""

    # 等待用户中断
    wait $ELECTRON_PID
else
    echo "❌ 应用启动失败或已退出"
    exit 1
fi
