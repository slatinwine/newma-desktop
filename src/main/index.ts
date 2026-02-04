import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { GatewayManager } from './gateway/GatewayManager';
import { ConfigManager, ConnectionMode } from './config/ConfigManager';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let gatewayManager: GatewayManager | null = null;
let configManager: ConfigManager | null = null;

/**
 * Create the main application window
 */
function createWindow() {
  const appConfig = configManager?.getAppConfig();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
    title: appConfig?.name || 'Newma Desktop',
    backgroundColor: '#ffffff',
  });

  // Load Expo Web build
  const indexPath = path.join(__dirname, '../../renderer/build/index.html');

  if (mainWindow) {
    mainWindow.loadFile(indexPath);

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Handle window title updates from renderer
    mainWindow.on('page-title-updated', (event) => {
      event.preventDefault();
    });
  }
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
    return;
  }

  const gatewayPath = path.join(__dirname, '../../gateway-source');
  const gatewayConfig = configManager.getGatewayConfig();
  const newmaConfig = configManager.getNewmaConfig();

  try {
    gatewayManager = new GatewayManager({
      gatewayPath,
      port: gatewayConfig.port,
      backend: newmaConfig.backend,
      newmaPath: newmaConfig.path,
      workspaceDir: newmaConfig.workspace.replace('{userHome}', app.getPath('home')),
    });

    await gatewayManager.start();
    console.log('✓ Gateway started successfully');

    // Setup health check if enabled
    if (gatewayConfig.healthCheck.enabled) {
      setupHealthCheck(gatewayConfig.healthCheck.interval);
    }
  } catch (error) {
    console.error('✗ Failed to start Gateway:', error);
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
        try {
          await gatewayManager.restart();
          console.log('✓ Gateway restarted successfully');
        } catch (error) {
          console.error('✗ Failed to restart Gateway:', error);
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
      return { running: false };
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

async function initialize() {
  // Initialize config manager
  configManager = new ConfigManager();
  const config = configManager.getConfig();

  // Setup IPC handlers
  setupIpcHandlers();

  console.log('═══════════════════════════════════════════════════════');
  console.log(`          ${config.app.name} v${config.version}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Mode: ${config.mode.toUpperCase()}`);
  console.log(`Gateway: ${config.gateway.type}:${config.gateway.port}`);
  console.log(`Newma Backend: ${config.newma.backend}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  // Start Gateway
  await startGateway();

  // Create window
  createWindow();
}

/**
 * Handle app ready event
 */
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
    app.quit();
  }
});

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
