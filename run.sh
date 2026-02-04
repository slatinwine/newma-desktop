#!/bin/bash

# Newma Desktop - 快速启动脚本
# 这个脚本会检查环境并启动应用

echo "╔════════════════════════════════════════════════════════╗"
echo "║           Newma Desktop - Quick Start                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# 检查 Node.js
echo "1️⃣  Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi
echo "✅ Node.js: $(node -v)"
echo ""

# 检查 npm
echo "2️⃣  Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found."
    exit 1
fi
echo "✅ npm: $(npm -v)"
echo ""

# 检查构建产物
echo "3️⃣  Checking build outputs..."
if [ ! -d "dist/main" ]; then
    echo "📦 Main process not built. Building..."
    npm run build:main
fi

if [ ! -d "dist/preload" ]; then
    echo "📦 Preload script not built. Building..."
    npm run build:preload
fi
echo "✅ Build outputs ready"
echo ""

# 检查 Electron
echo "4️⃣  Checking Electron..."
if [ ! -d "node_modules/electron/dist" ]; then
    echo "⚠️  Electron binary not found!"
    echo ""
    echo "Installing Electron... (this may take a while)"
    node node_modules/electron/install.js

    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Electron"
        echo ""
        echo "Try manually:"
        echo "  1. rm -rf node_modules/electron"
        echo "  2. npm install electron"
        exit 1
    fi
fi
echo "✅ Electron ready"
echo ""

# 检查 Gateway
echo "5️⃣  Checking Gateway..."
if [ ! -d "gateway-source/dist" ]; then
    echo "📦 Gateway not built. Building..."
    npm run build:gateway
fi
echo "✅ Gateway ready"
echo ""

# 启动应用
echo "╔════════════════════════════════════════════════════════╗"
echo "║              Starting Newma Desktop                   ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
npm run dev
