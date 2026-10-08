import { contextBridge, ipcRenderer } from 'electron';

/**
 * 以受控方式向渲染进程暴露桌面能力。
 * 页面本体是纯 web 实现（newma-web），不依赖这些接口；仅窗口控制和状态查询会用到。
 */
contextBridge.exposeInMainWorld('desktopAPI', {
  platform: process.platform,
  electron: process.versions.electron,

  getStatus: () => ipcRenderer.invoke('get-status'),

  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
});
