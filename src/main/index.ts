import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItemConstructorOptions } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import path from 'path';
import { GatewayManager, GatewayStatus } from './gateway/GatewayManager';
import { ConfigManager, ConnectionMode } from './config/ConfigManager';
import { loadWindowState, trackWindowState } from './windowState';

let mainWindow: BrowserWindow | null = null;
let gatewayManager: GatewayManager | null = null;
let configManager: ConfigManager | null = null;
let lastGatewayStatus: GatewayStatus | null = null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createGatewayErrorStatus(error: unknown): GatewayStatus {
  return {
    running: false,
    state: 'error',
    port: configManager?.getGatewayConfig().port ?? 0,
    error: getErrorMessage(error),
  };
}

function emitGatewayStatus(status?: GatewayStatus) {
  const nextStatus = status ?? gatewayManager?.getStatus() ?? lastGatewayStatus ?? createGatewayErrorStatus('本地网关未启动');
  lastGatewayStatus = nextStatus;

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('gateway-status-changed', nextStatus);
}

function focusMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

/**
 * Create the main application window
 */
function createWindow() {
  const appConfig = configManager?.getAppConfig();
  const userDataPath = app.getPath('userData');
  const savedWindowState = loadWindowState(userDataPath);

  const windowOptions: BrowserWindowConstructorOptions = {
    width: savedWindowState.width,
    height: savedWindowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
    title: appConfig?.name || 'Newma Desktop',
    backgroundColor: '#07C160',
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset',
      vibrancy: 'under-window',
      visualEffectState: 'active',
      trafficLightPosition: { x: 16, y: 18 },
    } : {}),
  };

  if (typeof savedWindowState.x === 'number' && typeof savedWindowState.y === 'number') {
    windowOptions.x = savedWindowState.x;
    windowOptions.y = savedWindowState.y;
  }

  mainWindow = new BrowserWindow(windowOptions);
  const window = mainWindow;
  trackWindowState(window, userDataPath);

  if (savedWindowState.isMaximized) {
    window.maximize();
  }

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });

  // Load Expo Web build
  const indexPath = path.join(__dirname, '../../../src/renderer/build/index.html');
  const buildDir = path.join(__dirname, '../../../src/renderer/build');

  // Intercept requests for static assets
  window.webContents.session.protocol.interceptFileProtocol('file', (request, callback) => {
    // Only intercept requests starting with /static/ or other root-relative paths
    if (request.url.startsWith('file:///static/') ||
        request.url.startsWith('file:///fonts/') ||
        request.url.startsWith('file:///manifest.json') ||
        request.url.startsWith('file:///favicon') ||
        request.url.startsWith('file:///pwa/')) {

      // Remove file:/// prefix
      const urlPath = request.url.substring(8); // Remove 'file:///'

      // Build the full path to the renderer build directory
      const filePath = path.join(buildDir, urlPath);
      callback({ path: filePath });
    } else {
      // Default handling for other files
      const url = request.url.substring(7); // Remove 'file://'
      callback({ path: url });
    }
  });

  window.loadFile(indexPath);

  window.webContents.once('did-finish-load', () => {
    emitGatewayStatus();
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    window.webContents.openDevTools();
  }

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  // Handle window title updates from renderer
  window.on('page-title-updated', (event) => {
    event.preventDefault();
  });
}

/**
 * Start the Gateway server
 */
async function startGateway() {
  if (!configManager) {
    throw new Error('Config manager not initialized');
  }

  const config = configManager.getConfig();

  // Only start embedded Gateway in local or hybrid mode
  if (config.mode === ConnectionMode.CLOUD) {
    console.log('Cloud mode: skipping local Gateway startup');
    emitGatewayStatus({
      running: false,
      state: 'running',
      port: config.gateway.port,
    });
    return;
  }

  const gatewayPath = path.join(__dirname, '../../../gateway-source');
  const gatewayConfig = configManager.getGatewayConfig();
  const newmaConfig = configManager.getNewmaConfig();
  const gatewayAuthConfig = configManager.getGatewayAuthConfig();
  const gatewayDatabaseConfig = configManager.getGatewayDatabaseConfig();
  const gatewayExplorationConfig = configManager.getGatewayExplorationConfig();

  try {
    gatewayManager = new GatewayManager({
      gatewayPath,
      port: gatewayConfig.port,
      backend: newmaConfig.backend,
      newmaPath: newmaConfig.path,
      workspaceDir: newmaConfig.workspace.replace('{userHome}', app.getPath('home')),
      authEnabled: gatewayAuthConfig.enabled,
      jwtSecret: gatewayAuthConfig.enabled ? configManager.getOrCreateJWTSecret() : undefined,
      encryptionKey: gatewayAuthConfig.enabled ? configManager.getOrCreateEncryptionKey() : undefined,
      databaseEnabled: gatewayDatabaseConfig.enabled,
      databasePath: gatewayDatabaseConfig.path,
      explorationEnabled: gatewayExplorationConfig.enabled,
      explorationLogDir: gatewayExplorationConfig.logDir,
      useNewmaApiMode: configManager.isNewmaApiModeEnabled(), // 🔥 新增：传递API模式配置
    });
    gatewayManager.onStatusChange(emitGatewayStatus);
    emitGatewayStatus(gatewayManager.getStatus());

    await gatewayManager.start();
    emitGatewayStatus(gatewayManager.getStatus());
    console.log('✓ Gateway started successfully');

    // Setup health check if enabled
    if (gatewayConfig.healthCheck.enabled) {
      setupHealthCheck(gatewayConfig.healthCheck.interval);
    }
  } catch (error) {
    console.error('✗ Failed to start Gateway:', error);
    emitGatewayStatus(createGatewayErrorStatus(error));
    throw error;
  }
}

/**
 * Stop the Gateway server
 */
async function stopGateway() {
  if (gatewayManager) {
    try {
      await gatewayManager.stop();
      console.log('✓ Gateway stopped');
    } catch (error) {
      console.error('✗ Failed to stop Gateway:', error);
    }
    gatewayManager = null;
  }
}

/**
 * Setup periodic health checks for Gateway
 */
function setupHealthCheck(interval: number) {
  setInterval(async () => {
    if (gatewayManager && gatewayManager.isRunning()) {
      const healthy = await gatewayManager.healthCheck();
      if (!healthy) {
        console.warn('Gateway health check failed, attempting restart...');
        emitGatewayStatus({
          ...gatewayManager.getStatus(),
          state: 'error',
          error: '本地网关健康检查失败，正在重启',
        });
        try {
          await gatewayManager.restart();
          emitGatewayStatus(gatewayManager.getStatus());
          console.log('✓ Gateway restarted successfully');
        } catch (error) {
          console.error('✗ Failed to restart Gateway:', error);
          emitGatewayStatus(createGatewayErrorStatus(error));
        }
      }
    }
  }, interval);
}

/**
 * Initialize the application
 */
function setupIpcHandlers() {
  // Handle get-config
  ipcMain.handle('get-config', async () => {
    if (!configManager) {
      throw new Error('Config manager not initialized');
    }
    return configManager.getConfig();
  });

  // Handle update-config
  ipcMain.handle('update-config', async (_event, config) => {
    if (!configManager) {
      throw new Error('Config manager not initialized');
    }
    // Update specific sections based on the config object
    if (config.gateway) {
      configManager.updateGatewayConfig(config.gateway);
    }
    if (config.newma) {
      configManager.updateNewmaConfig(config.newma);
    }
    if (config.app) {
      configManager.updateAppConfig(config.app);
    }
    if (config.cloud) {
      configManager.updateCloudConfig(config.cloud);
    }
  });

  // Handle reset-config
  ipcMain.handle('reset-config', async () => {
    if (!configManager) {
      throw new Error('Config manager not initialized');
    }
    configManager.resetToDefaults();
    return configManager.getConfig();
  });

  // Handle get-gateway-status
  ipcMain.handle('get-gateway-status', async () => {
    if (!gatewayManager) {
      return lastGatewayStatus ?? createGatewayErrorStatus('本地网关未启动');
    }
    return gatewayManager.getStatus();
  });

  // Handle minimize-window
  ipcMain.on('minimize-window', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  // Handle maximize-window
  ipcMain.on('maximize-window', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  // Handle close-window
  ipcMain.on('close-window', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // Handle show-notification
  ipcMain.on('show-notification', (_event, options) => {
    const { Notification } = require('electron');
    new Notification(options).show();
  });
}

/**
 * Application menu — minimal, Apple-style.
 * Only App (About/Quit) + Edit (standard edit roles) + Window (minimize/fullscreen).
 * View menu is dropped; Cmd+R / Cmd+Option+I are kept as hidden dev shortcuts.
 */
function setupApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const appMenu: MenuItemConstructorOptions = isMac
    ? {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }
    : {
        label: '文件',
        submenu: [{ role: 'quit' }],
      };

  const editMenu: MenuItemConstructorOptions = {
    label: '编辑',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? [
            { role: 'pasteAndMatchStyle' } as MenuItemConstructorOptions,
            { role: 'delete' } as MenuItemConstructorOptions,
            { role: 'selectAll' } as MenuItemConstructorOptions,
          ]
        : [{ role: 'selectAll' } as MenuItemConstructorOptions]),
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: '窗口',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
      ...(isMac ? [{ role: 'togglefullscreen' } as MenuItemConstructorOptions] : []),
    ],
  };

  // Hidden dev shortcuts — no visible View menu, but Cmd+R / Cmd+Option+I still work.
  const devShortcuts: MenuItemConstructorOptions = {
    label: '开发者',
    visible: false,
    submenu: [
      { role: 'reload' },
      { role: 'toggleDevTools' },
    ],
  };

  Menu.setApplicationMenu(Menu.buildFromTemplate([appMenu, editMenu, windowMenu, devShortcuts]));
}

async function initialize() {
  // Initialize config manager
  configManager = new ConfigManager();
  const config = configManager.getConfig();
  lastGatewayStatus = {
    running: false,
    state: 'starting',
    port: config.gateway.port,
  };

  // Setup IPC handlers
  setupIpcHandlers();

  // Minimal Apple-style application menu
  setupApplicationMenu();

  console.log('═══════════════════════════════════════════════════════');
  console.log(`          ${config.app.name} v${config.version}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Mode: ${config.mode.toUpperCase()}`);
  console.log(`Gateway: ${config.gateway.type}:${config.gateway.port}`);
  console.log(`Newma Backend: ${config.newma.backend}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  // Create window
  createWindow();

  // Start Gateway after the shell is visible; readiness is pushed by IPC.
  await startGateway();
}

/**
 * Handle app ready event
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  app.whenReady().then(async () => {
    try {
      await initialize();

      app.on('activate', () => {
        // On macOS, re-create window when dock icon is clicked
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    } catch (error) {
      console.error('Failed to initialize app:', error);
      dialog.showErrorBox(
        'Newma 启动失败',
        `本地网关无法启动，请检查 Node.js 是否已安装。\n\n原因：${getErrorMessage(error)}`,
      );
      app.quit();
    }
  });
}

/**
 * Handle all windows closed
 */
app.on('window-all-closed', async () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    await stopGateway();
    app.quit();
  }
});

/**
 * Handle app quit
 */
app.on('before-quit', async () => {
  await stopGateway();
});

/**
 * Handle app will quit
 */
app.on('will-quit', async (event) => {
  // Prevent default quit behavior to ensure cleanup
  event.preventDefault();
  await stopGateway();
  app.exit(0);
});

/**
 * Handle unhandled exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

/**
 * Handle SIGTERM (graceful shutdown)
 */
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await stopGateway();
  app.exit(0);
});

/**
 * Handle SIGINT (Ctrl+C)
 */
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await stopGateway();
  app.exit(0);
});
