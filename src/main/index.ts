import { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { BridgeServer } from './bridge/BridgeServer';
import { ConfigManager } from './config/ConfigManager';
import { NewmaInstanceManager } from './newma/NewmaInstanceManager';

let mainWindow: BrowserWindow | null = null;
let configManager: ConfigManager | null = null;
let newma: NewmaInstanceManager | null = null;
let bridge: BridgeServer | null = null;
let reapTimer: NodeJS.Timeout | null = null;
let cleaningUp = false;

/** 前端页面目录：优先配置覆盖，其次打包资源 resources/newma-web。 */
function resolvePublicDir(configured: string): string {
  if (configured) return configured;
  const candidates = [
    path.join(__dirname, '../../resources/newma-web'), // 开发：dist/main → 仓库 resources
    path.join(process.resourcesPath || '', 'newma-web'), // 打包：resources
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return candidates[0];
}

/** 应用图标：开发与打包两种布局下定位 resources/icons/icon.ico。 */
function resolveIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../../resources/icons/icon.ico'),
    path.join(process.resourcesPath || '', 'icons/icon.ico'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

async function initialize(): Promise<string> {
  configManager = new ConfigManager();
  const cfg = configManager.get();

  fs.mkdirSync(cfg.workspace.defaultDir, { recursive: true });

  newma = new NewmaInstanceManager({
    bin: cfg.newma.bin,
    openaiEndpoint: cfg.newma.openaiEndpoint,
  });
  bridge = new BridgeServer({
    preferredPort: cfg.bridge.preferredPort,
    publicDir: resolvePublicDir(cfg.web.publicDir),
    defaultWorkspace: cfg.workspace.defaultDir,
    newma,
  });
  await bridge.start();

  // 预热默认实例：通常 1~3s 就绪；超过 4s 也先开窗（页面有离线状态点，实例好了自动恢复）
  await Promise.race([
    newma.ensureDefault(cfg.workspace.defaultDir).catch((err: Error) => {
      console.error(`[newma] 默认实例启动失败：${err.message}`);
    }),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);

  // 工作区实例空闲 30 分钟回收
  reapTimer = setInterval(() => newma?.reap(30 * 60 * 1000), 60 * 1000);
  reapTimer.unref();

  return bridge.url;
}

function setupIpcHandlers() {
  ipcMain.handle('get-status', () => ({
    bridgeUrl: bridge?.url || '',
    bridgePort: bridge?.boundPort || 0,
    defaultWorkspace: configManager?.get().workspace.defaultDir || '',
    workspaces: newma?.list() || [],
  }));
  ipcMain.on('minimize-window', () => mainWindow?.minimize());
  ipcMain.on('maximize-window', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('close-window', () => mainWindow?.close());
}

function createWindow(url: string) {
  const winCfg = configManager?.get().window;
  const bounds: Electron.BrowserWindowConstructorOptions = {
    width: winCfg?.width || 1280,
    height: winCfg?.height || 860,
    minWidth: 800,
    minHeight: 600,
  };
  // 恢复上次位置（须确保落在任一显示器可见范围内，否则交给系统默认）
  if (
    typeof winCfg?.x === 'number' &&
    typeof winCfg?.y === 'number' &&
    screen.getAllDisplays().some((d) => {
      const { x, y, width, height } = d.workArea;
      return (
        winCfg.x! >= x - 20 && winCfg.y! >= y - 20 && winCfg.x! < x + width && winCfg.y! < y + height
      );
    })
  ) {
    bounds.x = winCfg.x;
    bounds.y = winCfg.y;
  }

  mainWindow = new BrowserWindow({
    ...bounds,
    autoHideMenuBar: true,
    title: 'Newma Desktop',
    backgroundColor: '#33322f',
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (winCfg?.maximized) mainWindow.maximize();

  Menu.setApplicationMenu(null);
  mainWindow.loadURL(url);

  // 页面里的外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http:') || target.startsWith('https:')) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (process.env.NEWMA_DESKTOP_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 记录窗口位置/尺寸，下次启动恢复（close 兜底：move/resized 在部分场景不触发）
  const saveBounds = () => {
    if (!mainWindow || !configManager || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    configManager.update({
      window: { width: b.width, height: b.height, x: b.x, y: b.y, maximized: mainWindow.isMaximized() },
    });
  };
  mainWindow.on('resized', saveBounds);
  mainWindow.on('moved', saveBounds);
  mainWindow.on('maximize', saveBounds);
  mainWindow.on('unmaximize', saveBounds);
  mainWindow.on('close', saveBounds);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function cleanup(): Promise<void> {
  if (cleaningUp) return;
  cleaningUp = true;
  if (reapTimer) {
    clearInterval(reapTimer);
    reapTimer = null;
  }
  try {
    await bridge?.stop();
  } catch (err) {
    console.error('[app] 停止桥接失败:', err);
  }
  try {
    await newma?.stopAll();
  } catch (err) {
    console.error('[app] 停止 newma 实例失败:', err);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      setupIpcHandlers();
      const url = await initialize();
      createWindow(url);
      console.log(`✓ Newma Desktop 已启动：${url}`);
    } catch (err) {
      console.error('启动失败:', err);
      dialog.showErrorBox('Newma Desktop 启动失败', String((err as Error).message || err));
      app.exit(1);
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', (event) => {
    if (!cleaningUp) {
      event.preventDefault();
      cleanup().finally(() => app.exit(0));
    }
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
