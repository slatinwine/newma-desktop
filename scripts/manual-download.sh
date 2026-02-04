#!/bin/bash

# 手动下载 Electron 二进制文件的脚本

echo "╔════════════════════════════════════════════════════════╗"
echo "║       Electron Manual Download Script                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

ARCH=$(uname -m)
ELECTRON_VERSION="28.3.0"

echo "Detected architecture: $ARCH"
echo "Electron version: $ELECTRON_VERSION"
echo ""

# 确定下载 URL
if [ "$ARCH" = "arm64" ]; then
    FILENAME="electron-v${ELECTRON_VERSION}-darwin-arm64.zip"
    URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${FILENAME}"
elif [ "$ARCH" = "x86_64" ]; then
    FILENAME="electron-v${ELECTRON_VERSION}-darwin-x64.zip"
    URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${FILENAME}"
else
    echo "❌ Unknown architecture: $ARCH"
    exit 1
fi

echo "Download URL: $URL"
echo "Filename: $FILENAME"
echo ""

# 创建临时目录
TMP_DIR=$(mktemp -d)
echo "Temporary directory: $TMP_DIR"
cd "$TMP_DIR"

# 下载文件
echo "📥 Downloading Electron..."
echo ""

if command -v curl &> /dev/null; then
    curl -L -o "$FILENAME" "$URL" --progress-bar
elif command -v wget &> /dev/null; then
    wget -O "$FILENAME" "$URL"
else
    echo "❌ Neither curl nor wget found. Please install one of them."
    exit 1
fi

# 检查下载是否成功
if [ ! -f "$FILENAME" ]; then
    echo "❌ Download failed!"
    exit 1
fi

echo ""
echo "✅ Download completed!"
echo "File size: $(ls -lh "$FILENAME" | awk '{print $5}')"
echo ""

# 创建目标目录
DIST_DIR="$(pwd)/node_modules/electron/dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 解压文件
echo "📦 Extracting..."
unzip -q "$FILENAME" -d "$DIST_DIR"

# 清理
cd "$(dirname "$DIST_DIR")"
rm -rf "$TMP_DIR"

echo ""
echo "✅ Electron installed successfully!"
echo "Location: $DIST_DIR"
echo ""
echo "You can now run: npm run dev"
