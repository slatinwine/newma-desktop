# Newma Desktop（newma-web 嵌入版）

把 [newma-web](../newma-web)（Newma Chat 清水混凝土风格聊天页）嵌入 Electron 壳的桌面版。
窗口加载应用内桥接服务器伺服的页面，由主进程直接管理本地 `newma --web` 实例——
**不再依赖 Python 桥（server.py）和 bash 启动脚本**，只需 Node/Electron 和全局安装的
[newma CLI](https://www.npmjs.com/package/newma-cli)。

## ✨ 功能

- **嵌入 newma-web 前端**：与浏览器版完全相同的界面（会话、技能库、插件市场、智能选项、工作区绑定）
- **实例管理**：按需懒启动 `newma --web`，同一工作区复用实例，空闲 30 分钟自动回收
- **默认实例常驻**：未绑定工作区的会话走默认实例（`~/NewmaWorkspace`），掉线自动重启
- **OPENAI_ENDPOINT 修复**：自动传入完整端点，规避 newma baseUrl 误拼导致的 404
- **跨平台**：Windows / macOS / Linux（Windows 下自动处理 `.cmd` 包装脚本与进程树清理）

## 🚀 快速开始

```bash
npm install        # 首次运行
npm run dev        # 编译并启动
# Windows 也可直接双击 start.cmd；macOS/Linux 用 ./start.sh
```

前置条件：Node.js 18+、全局安装 `newma`（`npm i -g newma-cli`）、可用的模型服务配置（`~/.kode/settings.json`）。

## 📁 结构

```
├── src/main/
│   ├── index.ts                  # 应用入口：窗口、生命周期、IPC
│   ├── bridge/BridgeServer.ts    # HTTP 桥（server.py 的 TS 移植）：页面伺服 + API 反代 + 工作区路由
│   ├── newma/NewmaInstanceManager.ts  # newma --web 实例懒启动/复用/回收/自愈
│   ├── newma/localContent.ts     # 技能库/插件市场枚举（front-matter 解析）
│   ├── config/ConfigManager.ts   # 配置（userData/config.json）
│   └── util/processUtils.ts      # 端口分配、newma 可执行文件解析、进程树清理
├── src/preload/index.ts          # 受控暴露窗口控制/状态查询
├── resources/newma-web/index.html # 嵌入的前端页面（来自 newma-web/public）
└── scripts/sync-web.js           # 从 newma-web 仓库同步最新前端页面
```

## 🌉 桥接接口（与 server.py 一致）

| 端点 | 用途 |
|---|---|
| `GET /` | 伺服 `resources/newma-web/index.html` |
| `GET /health`、`GET /api/status` | 反代到 newma 实例（`?ws=` 路由工作区） |
| `POST /api/execute` | 提交消息（body `workspace` 字段路由工作区） |
| `POST /api/clear`、`POST /api/stop` | 反代 |
| `POST /api/workspace/ensure` | 懒启动某工作区的实例 |
| `GET /api/workspaces` | 列出运行中的实例 |
| `GET /api/local/skills`、`GET /api/local/plugins` | 本地技能/插件枚举 |

桥接服务器只绑定 127.0.0.1。首选端口 3010，被占用时自动换空闲端口。

## 🔧 配置（`%APPDATA%/Newma Desktop/config.json` 等平台标准位置）

```json
{
  "bridge": { "preferredPort": 3010 },
  "newma": {
    "bin": "newma",
    "openaiEndpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions"
  },
  "workspace": { "defaultDir": "~/NewmaWorkspace" },
  "web": { "publicDir": "" },
  "window": { "width": 1280, "height": 860 }
}
```

- `newma.bin`：newma 可执行文件（也可用环境变量 `NEWMA_BIN` 覆盖）
- `newma.openaiEndpoint`：留空则不注入 `OPENAI_ENDPOINT`
- `web.publicDir`：前端页面目录覆盖；留空用打包内置的 `resources/newma-web`
- 环境变量 `NEWMA_DESKTOP_DEVTOOLS=1` 可打开 DevTools

## 🔄 同步 newma-web 前端更新

前端页面是 newma-web 仓库的拷贝，那边有更新后执行：

```bash
npm run sync-web   # 默认取 ../newma-web/public/index.html
npm run dev
```

## 📦 打包

```bash
npm run dist       # 当前平台
npm run dist:win   # Windows NSIS
npm run dist:mac   # macOS
npm run dist:linux # Linux
```

## 📝 License

MIT
