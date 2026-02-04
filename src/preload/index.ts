import { contextBridge, ipcRenderer, NotificationConstructorOptions } from 'electron';

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  arch: process.arch,

  // App version
  version: process.versions.electron,

  // Gateway status (read-only)
  getGatewayStatus: () => ipcRenderer.invoke('get-gateway-status'),

  // Config management
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: any) => ipcRenderer.invoke('update-config', config),
  resetConfig: () => ipcRenderer.invoke('reset-config'),

  // App control
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // Notifications
  showNotification: (options: NotificationConstructorOptions) =>
    ipcRenderer.send('show-notification', options),

  // Event listeners
  onGatewayStatusChange: (callback: (status: any) => void) => {
    const listener = (_event: any, status: any) => callback(status);
    ipcRenderer.on('gateway-status-changed', listener);
    return () => ipcRenderer.removeListener('gateway-status-changed', listener);
  },

  onConfigChange: (callback: (config: any) => void) => {
    const listener = (_event: any, config: any) => callback(config);
    ipcRenderer.on('config-changed', listener);
    return () => ipcRenderer.removeListener('config-changed', listener);
  },
});

// TypeScript type definitions for the exposed API
export interface ElectronAPI {
  platform: string;
  arch: string;
  version: string;
  getGatewayStatus: () => Promise<any>;
  getConfig: () => Promise<any>;
  updateConfig: (config: any) => Promise<void>;
  resetConfig: () => Promise<void>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  showNotification: (options: NotificationConstructorOptions) => void;
  onGatewayStatusChange: (callback: (status: any) => void) => () => void;
  onConfigChange: (callback: (config: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
