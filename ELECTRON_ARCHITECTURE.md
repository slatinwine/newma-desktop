# Newma Desktop - Electron 架构设计文档

## 📋 项目概述

**项目名称**: Newma Desktop
**版本**: v1.0.0
**目标**: 创建一个跨平台桌面应用，封装 Newma 移动端网页应用，支持本地和云端两种运行模式

**核心特性**:
- ✅ 跨平台支持 (macOS/Windows/Linux)
- ✅ 完全离线运行（本地模式）
- ✅ 云端切换能力（为未来准备）
- ✅ 打包 Gateway + newma CLI
- ✅ 封装 Expo Web 前端

---

## 🏗️ 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      Newma Desktop (Electron)                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 Main Process (Node.js)                     │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │         Gateway Manager (新增模块)                    │  │ │
│  │  │  - 启动/停止 Gateway 进程                             │  │ │
│  │  │  - 监控 Gateway 健康状态                              │  │ │
│  │  │  - 管理 Gateway 端口                                  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                           ↓                                 │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │         Local Gateway (集成打包)                      │  │ │
│  │  │  - WebSocket Server (端口 18789)                     │  │ │
│  │  │  - newma-cli 集成                                     │  │ │
│  │  │  - 会话管理                                           │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                           ↓                                 │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │         newma CLI (打包为 npm 依赖)                   │  │ │
│  │  │  - 执行 AI 命令                                       │  │ │
│  │  │  - 文件系统操作                                       │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │         Configuration Manager                         │  │ │
│  │  │  - 本地/云端模式切换                                  │  │ │
│  │  │  - Gateway URL 管理                                   │  │ │
│  │  │  - 用户偏好设置                                       │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Renderer Process (Web 前端)                   │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │         Expo Web Application                         │  │ │
│  │  │  - React Native Web                                  │  │ │
│  │  │  - Chat Screen                                       │  │ │
│  │  │  - WebSocket Client                                  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │         Desktop Features (Electron APIs)             │  │ │
│  │  │  - 系统托盘                                           │  │ │
│  │  │  - 原生通知                                           │  │ │
│  │  │  - 窗口管理                                           │  │ │
│  │  │  - 自动更新                                           │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 │ WebSocket (ws://localhost:18789)
                                 ↓ (本地模式)
                    ┌──────────────────────┐
                    │   Local Gateway      │
                    │   + newma CLI        │
                    └──────────────────────┘

                                 │ (云端模式 - 未来)
                                 │ WebSocket (wss://api.newma.com)
                                 ↓
                    ┌──────────────────────────┐
                    │   Cloud Gateway          │
                    │   (部署在云端服务器)      │
                    └──────────────────────────┘
```

---

## 🎯 运行模式详解

### 模式 1: 本地模式（当前实现）

**适用场景**: 离线使用、隐私保护、开发测试

**工作流程**:
1. Electron 启动时，在主进程中启动本地 Gateway
2. Gateway 加载 newma CLI（作为 npm 包）
3. Renderer 进程（Web 前端）连接到 `ws://localhost:18789`
4. 所有 AI 请求在本地处理

**优势**:
- ✅ 完全离线，无需网络连接
- ✅ 数据不离开本地机器，隐私保护最好
- ✅ 响应速度快，无网络延迟
- ✅ 无云端服务器成本

**配置示例**:
```json
{
  "mode": "local",
  "gateway": {
    "type": "embedded",
    "port": 18789,
    "autoStart": true
  },
  "newma": {
    "enabled": true,
    "workspace": "/Users/[user]/NewmaWorkspace"
  }
}
```

---

### 模式 2: 云端模式（未来实现）

**适用场景**: 多设备同步、协作、减少本地资源占用

**工作流程**:
1. Electron 启动时，不启动本地 Gateway
2. Renderer 进程连接到云端 Gateway `wss://api.newma.com`
3. 所有 AI 请求在云端服务器处理
4. （可选）本地数据与云端同步

**优势**:
- ✅ 多设备数据同步
- ✅ 减少本地 CPU/内存占用
- ✅ 统一的版本管理和更新
- ✅ 便于协作和分享

**配置示例**:
```json
{
  "mode": "cloud",
  "gateway": {
    "type": "remote",
    "url": "wss://api.newma.com",
    "auth": {
      "enabled": true,
      "token": "user-auth-token"
    }
  },
  "sync": {
    "enabled": true,
    "interval": 300000
  }
}
```

---

### 模式 3: 混合模式（未来实现）

**适用场景**: 最佳用户体验，结合本地和云端优势

**工作流程**:
1. 默认使用本地 Gateway（速度快）
2. 后台自动同步重要数据到云端
3. 当本地不可用时，自动切换到云端
4. 支持云端会话恢复

**配置示例**:
```json
{
  "mode": "hybrid",
  "gateway": {
    "type": "embedded",
    "port": 18789,
    "fallback": "cloud",
    "cloudUrl": "wss://api.newma.com"
  },
  "sync": {
    "enabled": true,
    "mode": "background",
    "dataTypes": ["chats", "history", "settings"]
  }
}
```

---

## 📦 项目结构

```
desktopnewma/
├── package.json                 # Electron 项目配置
├── tsconfig.json               # TypeScript 配置
├── ELECTRON_ARCHITECTURE.md    # 本文档
├── README.md                   # 项目说明
│
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── index.ts            # 主进程入口
│   │   ├── window.ts           # 窗口管理
│   │   ├── gateway/            # Gateway 集成
│   │   │   ├── GatewayManager.ts    # Gateway 进程管理
│   │   │   ├── GatewayConfig.ts     # Gateway 配置
│   │   │   └── HealthCheck.ts       # 健康检查
│   │   ├── config/             # 配置管理
│   │   │   ├── ConfigManager.ts     # 配置管理器
│   │   │   └── default.config.ts    # 默认配置
│   │   ├── tray/               # 系统托盘
│   │   │   └── TrayManager.ts
│   │   ├── updater/            # 自动更新
│   │   │   └── UpdateManager.ts
│   │   └── services/           # 其他服务
│   │       ├── NotificationService.ts
│   │       └── LogService.ts
│   │
│   ├── renderer/               # Renderer 进程（Web 前端）
│   │   └── build/              # Expo Web 打包产物
│   │       ├── index.html
│   │       ├── assets/
│   │       └── *.js
│   │
│   └── preload/                # Preload 脚本
│       └── index.ts
│
├── resources/                  # 资源文件
│   ├── icons/                  # 应用图标
│   │   ├── icon.icns          # macOS
│   │   ├── icon.ico           # Windows
│   │   └── icon.png           # Linux
│   └── config/                 # 配置文件模板
│       └── app-config.json
│
├── scripts/                    # 构建脚本
│   ├── build-web.js           # 构建 Expo Web
│   ├── build-gateway.js       # 构建 Gateway
│   └── package.sh             # 打包脚本
│
└── gateway-source/            # Gateway 源码（符号链接或副本）
    └── (指向 /Users/mac/mobilenewma/gateway)
```

---

## 🔧 技术栈

### 主进程 (Main Process)
- **运行时**: Node.js 18+
- **框架**: Electron 28+
- **语言**: TypeScript
- **关键依赖**:
  - `electron` - 框架
  - `electron-builder` - 打包工具
  - `portfinder` - 端口查找
  - `tree-kill` - 进程管理

### Gateway 集成
- **源码**: 来自 `/Users/mac/mobilenewma/gateway`
- **打包方式**: 作为子模块集成到 Electron
- **依赖管理**: 独立的 node_modules
- **通信方式**: IPC (进程间通信)

### newma CLI
- **安装方式**: npm 包 (`newma-cli`)
- **版本**: 与系统安装版本一致
- **集成方式**: Gateway 通过子进程调用

### Renderer 进程
- **源码**: 来自 `/Users/mac/mobilenewma/mobile`
- **构建方式**: Expo Web Build (`expo build:web`)
- **技术**: React Native Web + Expo

### 打包工具
- **工具**: electron-builder
- **支持平台**: macOS, Windows, Linux
- **输出格式**:
  - macOS: `.dmg` (Intel + Apple Silicon)
  - Windows: `.exe` (NSIS installer)
  - Linux: `.AppImage` (universal)

---

## 📝 配置文件设计

### 用户配置文件位置

**macOS**: `~/Library/Application Support/Newma Desktop/config.json`
**Windows**: `%APPDATA%/Newma Desktop/config.json`
**Linux**: `~/.config/Newma Desktop/config.json`

### 配置文件结构

```json
{
  "version": "1.0.0",
  "mode": "local",
  "gateway": {
    "type": "embedded",
    "port": 18789,
    "host": "127.0.0.1",
    "autoStart": true,
    "healthCheck": {
      "enabled": true,
      "interval": 5000,
      "timeout": 10000
    }
  },
  "newma": {
    "enabled": true,
    "path": "node_modules/.bin/newma",
    "workspace": "{userHome}/NewmaWorkspace",
    "backend": "newma"
  },
  "app": {
    "name": "Newma Desktop",
    "autoUpdate": true,
    "minimizeToTray": true,
    "startupOnBoot": false,
    "logLevel": "info"
  },
  "cloud": {
    "enabled": false,
    "url": "wss://api.newma.com",
    "auth": {
      "enabled": false,
      "token": ""
    }
  }
}
```

---

## 🚀 实施计划

### 阶段 1: 基础架构搭建 ✅ (当前阶段)

**目标**: 创建可运行的本地模式 Electron 应用

**任务清单**:
- [ ] 1.1 初始化 Electron 项目
  - [ ] 创建项目结构
  - [ ] 配置 TypeScript
  - [ ] 安装依赖包
- [ ] 1.2 集成 Gateway
  - [ ] 复制 Gateway 源码到项目
  - [ ] 实现 GatewayManager 类
  - [ ] 配置 Gateway 启动逻辑
- [ ] 1.3 打包 Expo Web 前端
  - [ ] 配置 Expo web build
  - [ ] 实现构建脚本
  - [ ] 集成到 Electron Renderer
- [ ] 1.4 实现基础窗口管理
  - [ ] 创建主窗口
  - [ ] 配置窗口大小、图标
  - [ ] 实现基本的启动流程
- [ ] 1.5 配置管理系统
  - [ ] 实现 ConfigManager
  - [ ] 创建默认配置
  - [ ] 实现配置读写
- [ ] 1.6 本地模式测试
  - [ ] 测试 Gateway 启动
  - [ ] 测试 WebSocket 连接
  - [ ] 测试基本聊天功能

**预期产出**:
- 可运行的 Electron 应用
- 本地 Gateway 正常启动
- Web 前端正常加载和通信

---

### 阶段 2: 桌面功能增强

**目标**: 添加桌面应用特有的功能

**任务清单**:
- [ ] 2.1 系统托盘
  - [ ] 创建托盘图标
  - [ ] 实现托盘菜单
  - [ ] 显示/隐藏窗口
  - [ ] 退出应用
- [ ] 2.2 原生通知
  - [ ] 实现消息通知
  - [ ] 配置通知权限
  - [ ] 通知点击处理
- [ ] 2.3 窗口管理
  - [ ] 最小化到托盘
  - [ ] 窗口状态记忆
  - [ ] 多显示器支持
- [ ] 2.4 自动更新
  - [ ] 配置 electron-updater
  - [ ] 实现更新检查
  - [ ] 实现更新下载和安装
- [ ] 2.5 日志系统
  - [ ] 实现日志收集
  - [ ] 配置日志级别
  - [ ] 日志文件管理

---

### 阶段 3: 跨平台打包和优化

**目标**: 实现真正的跨平台支持

**任务清单**:
- [ ] 3.1 打包配置
  - [ ] 配置 electron-builder
  - [ ] macOS 打包配置
  - [ ] Windows 打包配置
  - [ ] Linux 打包配置
- [ ] 3.2 图标和资源
  - [ ] 设计应用图标
  - [ ] 生成各平台图标
  - [ ] 准备启动画面
- [ ] 3.3 性能优化
  - [ ] 减小应用体积
  - [ ] 优化启动时间
  - [ ] 内存优化
- [ ] 3.4 测试
  - [ ] macOS 测试 (Intel + Apple Silicon)
  - [ ] Windows 测试
  - [ ] Linux 测试

---

### 阶段 4: 云端模式支持 (未来)

**目标**: 实现云端 Gateway 切换

**任务清单**:
- [ ] 4.1 配置界面
  - [ ] 创建设置页面
  - [ ] 实现模式切换
  - [ ] 配置云端连接参数
- [ ] 4.2 云端连接
  - [ ] 实现云端 WebSocket 连接
  - [ ] 添加认证逻辑
  - [ ] 错误处理和重连
- [ ] 4.3 数据同步（可选）
  - [ ] 本地数据上传
  - [ ] 云端数据下载
  - [ ] 冲突解决
- [ ] 4.4 混合模式
  - [ ] 实现自动切换逻辑
  - [ ] 网络状态检测
  - [ ] 优雅降级

**详细迁移步骤见下方 "云端迁移指南"**

---

## 🌤️ 云端迁移指南

### 何时迁移到云端？

**建议场景**:
1. 需要多设备数据同步
2. 用户需要协作功能
3. 希望减少本地资源占用
4. 需要集中管理和监控

### 迁移步骤

#### 步骤 1: 准备云端 Gateway

**服务器部署**:
```bash
# 在云端服务器上
1. 部署 Gateway 服务
2. 配置 SSL 证书 (wss://)
3. 设置域名 (如 api.newma.com)
4. 配置防火墙和负载均衡
```

**Gateway 配置示例**:
```env
PORT=443
HOST=0.0.0.0
AI_BACKEND=newma
NEWMA_PATH=/usr/local/bin/newma
WORKSPACE_DIR=/var/www/newma

# SSL 配置
SSL_ENABLED=true
SSL_CERT_PATH=/etc/ssl/certs/newma.crt
SSL_KEY_PATH=/etc/ssl/private/newma.key
```

#### 步骤 2: 实现认证系统

**选项 A: Token 认证**
```json
{
  "gateway": {
    "url": "wss://api.newma.com",
    "auth": {
      "type": "token",
      "token": "user-specific-token"
    }
  }
}
```

**选项 B: OAuth 2.0**
```json
{
  "gateway": {
    "url": "wss://api.newma.com",
    "auth": {
      "type": "oauth2",
      "provider": "github",
      "clientId": "xxx",
      "redirectUri": "newma-desktop://auth/callback"
    }
  }
}
```

#### 步骤 3: 修改 Electron 配置

**配置界面更新**:
- 添加"连接模式"选择器
- 本地模式 / 云端模式 / 混合模式
- 云端服务器地址输入
- 认证信息输入

**代码改动**:
```typescript
// src/main/config/ConfigManager.ts
export enum ConnectionMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
  HYBRID = 'hybrid'
}

export interface GatewayConfig {
  mode: ConnectionMode;
  local: {
    enabled: boolean;
    port: number;
  };
  cloud: {
    enabled: boolean;
    url: string;
    auth?: AuthConfig;
  };
  hybrid?: {
    fallbackEnabled: boolean;
    syncEnabled: boolean;
  };
}
```

#### 步骤 4: 实现智能切换逻辑

```typescript
// src/main/gateway/GatewayManager.ts
export class GatewayManager {
  async connect() {
    const config = await this.configManager.getConfig();

    switch (config.mode) {
      case ConnectionMode.LOCAL:
        await this.startLocalGateway();
        break;
      case ConnectionMode.CLOUD:
        await this.connectToCloudGateway();
        break;
      case ConnectionMode.HYBRID:
        // 优先本地，失败则云端
        const localSuccess = await this.tryStartLocal();
        if (!localSuccess) {
          await this.connectToCloudGateway();
        }
        break;
    }
  }

  private async tryStartLocal(): Promise<boolean> {
    try {
      await this.startLocalGateway();
      return true;
    } catch (error) {
      console.log('Local gateway failed, trying cloud...');
      return false;
    }
  }
}
```

#### 步骤 5: 数据同步策略

**同步内容**:
- 聊天历史
- 用户设置
- 收藏和标签
- （可选）工作区文件

**同步策略**:
```typescript
// src/main/sync/SyncManager.ts
export class SyncManager {
  async syncToCloud() {
    const localData = await this.getLocalData();
    await this.uploadToCloud(localData);
  }

  async syncFromCloud() {
    const cloudData = await this.downloadFromCloud();
    await this.mergeToLocal(cloudData);
  }

  private async mergeToLocal(cloudData: any) {
    // 解决冲突逻辑
    // 时间戳比较
    // 用户选择
  }
}
```

#### 步骤 6: 渐进式迁移

**Week 1-2: 云端部署**
- 部署 Gateway 到云端
- 配置域名和 SSL
- 压力测试

**Week 3-4: 双模式支持**
- 在 Electron 中添加云端连接逻辑
- 本地模式保持不变
- 云端模式为可选功能

**Week 5-6: 数据同步**
- 实现基本的数据同步
- 用户可以手动触发同步

**Week 7-8: 混合模式**
- 实现自动切换
- 智能路由决策
- 监控和日志

**Week 9+: 优化和监控**
- 性能优化
- 错误处理
- 用户反馈收集

---

## 🔐 安全考虑

### 本地模式安全
- ✅ Gateway 仅监听 127.0.0.1（不暴露到外网）
- ✅ 进程隔离（主进程 vs Gateway 进程）
- ✅ 工作目录隔离（限制 newma 访问范围）

### 云端模式安全
- ✅ WSS 加密连接
- ✅ Token 认证
- ✅ 速率限制
- ✅ 输入验证和清理

### 数据安全
- ✅ 本地数据加密（可选）
- ✅ 敏感信息不记录日志
- ✅ 安全的配置文件存储

---

## 📊 监控和日志

### 本地监控
```typescript
// Gateway 健康检查
{
  "status": "healthy",
  "uptime": 12345,
  "memory": {
    "used": "100MB",
    "total": "500MB"
  },
  "connections": 1
}
```

### 云端监控
- 请求速率
- 错误率
- 响应时间
- 用户活跃度

---

## 🎨 UI/UX 考虑

### 设置界面
```
┌─────────────────────────────────────┐
│  Newma Desktop Settings             │
├─────────────────────────────────────┤
│                                     │
│  Connection Mode                    │
│  ○ Local (Offline)                  │
│  ○ Cloud                            │
│  ○ Hybrid                          │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Local Gateway Settings     │   │
│  │  Port: [18789        ]      │   │
│  │  Status: ● Running          │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Cloud Gateway Settings     │   │
│  │  URL: [api.newma.com    ]   │   │
│  │  Auth Token: [********* ]   │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Save]  [Cancel]                  │
└─────────────────────────────────────┘
```

### 状态栏指示器
- 🔵 本地模式运行中
- 🟢 云端模式连接中
- 🟡 混合模式（本地优先）
- 🔴 连接失败

---

## 📚 相关文档

- [Gateway README](../mobilenewma/gateway/README.md)
- [Mobile App README](../mobilenewma/mobile/README.md)
- [Electron 官方文档](https://www.electronjs.org/docs)
- [electron-builder 文档](https://www.electron.build/)

---

## 🤝 贡献指南

在提交代码前，请确保：

1. ✅ 遵循现有代码风格
2. ✅ 添加必要的类型注解
3. ✅ 编写测试用例
4. ✅ 更新相关文档
5. ✅ 测试跨平台兼容性

---

## 📝 变更日志

### v1.0.0 (2025-03-02)
- ✅ 初始架构设计
- ✅ 本地模式实现计划
- ✅ 云端迁移指南
- ✅ 跨平台支持计划

---

**文档版本**: 1.0.0
**最后更新**: 2025-03-02
**维护者**: Newma Desktop Team
