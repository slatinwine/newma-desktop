# Newma Desktop - 快速实施指南

## 🎯 当前进度

**阶段**: 阶段 1 - 基础架构搭建
**状态**: 准备开始实施

---

## 📋 实施检查清单

### 1. 项目初始化
- [ ] 创建 `package.json`
- [ ] 创建 TypeScript 配置
- [ ] 创建项目目录结构
- [ ] 安装核心依赖

### 2. Gateway 集成
- [ ] 复制 Gateway 源码
- [ ] 安装 Gateway 依赖
- [ ] 实现 GatewayManager
- [ ] 测试 Gateway 启动

### 3. Web 前端打包
- [ ] 配置 Expo web build
- [ ] 构建 mobile 项目
- [ ] 复制构建产物
- [ ] 集成到 Electron

### 4. Electron 主进程
- [ ] 实现主入口
- [ ] 窗口管理
- [ ] 配置管理
- [ ] 预加载脚本

### 5. 打包和测试
- [ ] 配置 electron-builder
- [ ] 测试本地运行
- [ ] 跨平台打包
- [ ] 功能测试

---

## 🚀 快速开始

### Step 1: 安装依赖

```bash
cd /Users/mac/desktopnewma
npm init -y
npm install --save-dev electron typescript @types/node
npm install --save-dev electron-builder
npm install portfinder tree-kill
```

### Step 2: 创建项目结构

```bash
mkdir -p src/{main,renderer,preload}
mkdir -p src/main/{gateway,config,tray,updater,services}
mkdir -p resources/icons
mkdir -p scripts
```

### Step 3: 复制 Gateway 源码

```bash
# 方案 A: 复制整个 Gateway 目录
cp -r /Users/mac/mobilenewma/gateway ./gateway-source

# 方案 B: 创建符号链接（节省空间，开发时推荐）
ln -s /Users/mac/mobilenewma/gateway ./gateway-source
```

### Step 4: 构建 Expo Web

```bash
cd /Users/mac/mobilenewma/mobile
npm run web
# 在另一个终端
npx expo build:web
# 构建产物在 mobile/web-build/
```

### Step 5: 复制 Web 构建产物

```bash
cp -r /Users/mac/mobilenewma/mobile/web-build ./src/renderer/build
```

### Step 6: 启动开发

```bash
cd /Users/mac/desktopnewma
npm run dev
```

---

## 📝 关键代码模板

### package.json

```json
{
  "name": "newma-desktop",
  "version": "1.0.0",
  "description": "Newma Desktop - Cross-platform AI chat application",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "concurrently \"npm run build:main -- --watch\" \"npm run build:renderer -- --watch\" \"wait-on dist && electron .\"",
    "build": "npm run build:main && npm run build:renderer",
    "build:main": "tsc -p tsconfig.main.json",
    "build:renderer": "tsc -p tsconfig.renderer.json",
    "build:web": "node scripts/build-web.js",
    "build:gateway": "node scripts/build-gateway.js",
    "pack": "electron-builder --dir",
    "dist": "electron-builder",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win",
    "dist:linux": "electron-builder --linux"
  },
  "build": {
    "appId": "com.newma.desktop",
    "productName": "Newma Desktop",
    "directories": {
      "output": "dist",
      "buildResources": "resources"
    },
    "files": [
      "dist/**/*",
      "gateway-source/dist/**/*",
      "gateway-source/node_modules/**/*",
      "resources/**/*"
    ],
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.productivity",
      "icon": "resources/icons/icon.icns"
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "resources/icons/icon.ico"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "resources/icons/icon.png",
      "category": "Chat"
    }
  }
}
```

### TypeScript 配置

#### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### tsconfig.main.json
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist/main"
  },
  "include": ["src/main/**/*", "src/preload/**/*"]
}
```

#### tsconfig.renderer.json
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist/renderer"
  },
  "include": ["src/renderer/**/*"]
}
```

---

## 🔧 核心模块设计

### GatewayManager (src/main/gateway/GatewayManager.ts)

```typescript
import { spawn, ChildProcess } from 'child_process';
import { kill } from 'tree-kill';
import path from 'path';
import fs from 'fs';

export class GatewayManager {
  private process: ChildProcess | null = null;
  private readonly gatewayPath: string;
  private readonly port: number;

  constructor(gatewayPath: string, port: number = 18789) {
    this.gatewayPath = gatewayPath;
    this.port = port;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Gateway is already running');
    }

    const gatewayScript = path.join(this.gatewayPath, 'dist', 'index.js');

    if (!fs.existsSync(gatewayScript)) {
      throw new Error(`Gateway script not found at ${gatewayScript}`);
    }

    return new Promise((resolve, reject) => {
      this.process = spawn('node', [gatewayScript], {
        cwd: this.gatewayPath,
        env: {
          ...process.env,
          PORT: this.port.toString(),
          AI_BACKEND: 'newma',
          NEWMA_PATH: path.join(this.gatewayPath, 'node_modules', '.bin', 'newma')
        },
        stdio: 'pipe'
      });

      this.process.stdout?.on('data', (data) => {
        console.log(`[Gateway] ${data}`);
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[Gateway Error] ${data}`);
      });

      this.process.on('error', (error) => {
        console.error('Failed to start gateway:', error);
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`Gateway process exited with code ${code} and signal ${signal}`);
        this.process = null;
      });

      // 等待 Gateway 启动（简单实现：等待2秒）
      setTimeout(() => {
        if (this.process) {
          console.log(`Gateway started on port ${this.port}`);
          resolve();
        } else {
          reject(new Error('Gateway process failed to start'));
        }
      }, 2000);
    });
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    return new Promise((resolve) => {
      if (this.process.pid) {
        kill(this.process.pid, 'SIGTERM', () => {
          this.process = null;
          resolve();
        });
      } else {
        this.process = null;
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.process !== null;
  }
}
```

### 主入口 (src/main/index.ts)

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { GatewayManager } from './gateway/GatewayManager';

let mainWindow: BrowserWindow | null = null;
let gatewayManager: GatewayManager | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png')
  });

  // 加载 Expo Web 构建产物
  mainWindow.loadFile(path.join(__dirname, '../renderer/build/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startGateway() {
  const gatewayPath = path.join(__dirname, '../../gateway-source');

  try {
    gatewayManager = new GatewayManager(gatewayPath, 18789);
    await gatewayManager.start();
    console.log('Gateway started successfully');
  } catch (error) {
    console.error('Failed to start gateway:', error);
  }
}

async function stopGateway() {
  if (gatewayManager) {
    await gatewayManager.stop();
    gatewayManager = null;
  }
}

app.whenReady().then(async () => {
  await startGateway();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await stopGateway();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await stopGateway();
});
```

---

## 🎨 下一步行动

**当前可以立即开始的任务**:

1. ✅ **项目初始化** - 执行上面的安装命令
2. ✅ **创建项目结构** - 执行 mkdir 命令
3. ✅ **复制 Gateway** - 选择方案 A 或 B
4. ✅ **构建 Web** - 在 mobile 目录执行 Expo 构建

**准备好开始实施了吗？** 我会按照上述步骤逐步创建所有必要的文件和配置。

---

**需要我现在开始实施吗？** 还是你想先审查一下这个实施计划？
