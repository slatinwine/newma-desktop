import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export enum ConnectionMode {
  LOCAL = 'local',
  CLOUD = 'cloud',
  HYBRID = 'hybrid',
}

export interface GatewayConfig {
  type: 'embedded' | 'remote';
  port: number;
  host: string;
  autoStart: boolean;
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
  };
}

export interface NewmaConfig {
  enabled: boolean;
  path: string;
  workspace: string;
  backend: 'newma' | 'api' | 'mock';
}

export interface CloudConfig {
  enabled: boolean;
  url: string;
  auth: {
    enabled: boolean;
    token?: string;
  };
}

export interface AppConfig {
  name: string;
  autoUpdate: boolean;
  minimizeToTray: boolean;
  startupOnBoot: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface AppConfigData {
  version: string;
  mode: ConnectionMode;
  gateway: GatewayConfig;
  newma: NewmaConfig;
  app: AppConfig;
  cloud: CloudConfig;
}

const DEFAULT_CONFIG: AppConfigData = {
  version: '1.0.0',
  mode: ConnectionMode.LOCAL,
  gateway: {
    type: 'embedded',
    port: 18789,
    host: '127.0.0.1',
    autoStart: true,
    healthCheck: {
      enabled: true,
      interval: 5000,
      timeout: 10000,
    },
  },
  newma: {
    enabled: true,
    path: 'newma',
    workspace: '{userHome}/NewmaWorkspace',
    backend: 'newma',
  },
  app: {
    name: 'Newma Desktop',
    autoUpdate: true,
    minimizeToTray: true,
    startupOnBoot: false,
    logLevel: 'info',
  },
  cloud: {
    enabled: false,
    url: 'wss://api.newma.com',
    auth: {
      enabled: false,
      token: '',
    },
  },
};

/**
 * Manages application configuration
 */
export class ConfigManager {
  private configPath: string;
  private config: AppConfigData;

  constructor() {
    // Determine config path based on platform
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'config.json');

    // Ensure directory exists
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load or create config
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): AppConfigData {
    if (fs.existsSync(this.configPath)) {
      try {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);
        // Merge with defaults to handle new fields
        return { ...DEFAULT_CONFIG, ...loaded };
      } catch (error) {
        console.error('Failed to load config, using defaults:', error);
        return { ...DEFAULT_CONFIG };
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * Get all configuration
   */
  getConfig(): AppConfigData {
    return { ...this.config };
  }

  /**
   * Get specific configuration section
   */
  getGatewayConfig(): GatewayConfig {
    return { ...this.config.gateway };
  }

  getNewmaConfig(): NewmaConfig {
    return { ...this.config.newma };
  }

  getAppConfig(): AppConfig {
    return { ...this.config.app };
  }

  getCloudConfig(): CloudConfig {
    return { ...this.config.cloud };
  }

  getConnectionMode(): ConnectionMode {
    return this.config.mode;
  }

  /**
   * Update specific configuration section
   */
  updateGatewayConfig(config: Partial<GatewayConfig>): void {
    this.config.gateway = { ...this.config.gateway, ...config };
    this.saveConfig();
  }

  updateNewmaConfig(config: Partial<NewmaConfig>): void {
    this.config.newma = { ...this.config.newma, ...config };
    this.saveConfig();
  }

  updateAppConfig(config: Partial<AppConfig>): void {
    this.config.app = { ...this.config.app, ...config };
    this.saveConfig();
  }

  updateCloudConfig(config: Partial<CloudConfig>): void {
    this.config.cloud = { ...this.config.cloud, ...config };
    this.saveConfig();
  }

  setConnectionMode(mode: ConnectionMode): void {
    this.config.mode = mode;
    this.saveConfig();
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
