import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1200,
  height: 800,
  isMaximized: false,
};

const WINDOW_STATE_FILE = 'window-state.json';
const SAVE_DELAY_MS = 250;

function getWindowStatePath(userDataPath: string): string {
  return path.join(userDataPath, WINDOW_STATE_FILE);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeWindowState(value: unknown): WindowState {
  if (!value || typeof value !== 'object') {
    return DEFAULT_WINDOW_STATE;
  }

  const candidate = value as Partial<WindowState>;
  const width = isFiniteNumber(candidate.width) ? Math.max(candidate.width, 800) : DEFAULT_WINDOW_STATE.width;
  const height = isFiniteNumber(candidate.height) ? Math.max(candidate.height, 600) : DEFAULT_WINDOW_STATE.height;

  return {
    ...(isFiniteNumber(candidate.x) ? { x: candidate.x } : {}),
    ...(isFiniteNumber(candidate.y) ? { y: candidate.y } : {}),
    width,
    height,
    isMaximized: candidate.isMaximized === true,
  };
}

export function loadWindowState(userDataPath: string): WindowState {
  try {
    const raw = fs.readFileSync(getWindowStatePath(userDataPath), 'utf8');
    return normalizeWindowState(JSON.parse(raw));
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

export function saveWindowState(userDataPath: string, state: WindowState): void {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(getWindowStatePath(userDataPath), JSON.stringify(state, null, 2));
}

export function trackWindowState(window: BrowserWindow, userDataPath: string): void {
  let saveTimer: NodeJS.Timeout | null = null;

  const getCurrentState = (): WindowState => {
    const bounds = window.getNormalBounds();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: window.isMaximized(),
    };
  };

  const save = () => {
    if (window.isDestroyed()) {
      return;
    }
    try {
      saveWindowState(userDataPath, getCurrentState());
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  };

  const scheduleSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
  };

  window.on('resize', scheduleSave);
  window.on('move', scheduleSave);
  window.on('maximize', scheduleSave);
  window.on('unmaximize', scheduleSave);
  window.on('close', save);
}
