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
  useApiMode?: boolean; // 🔥 新增：是否使用API模式（--api标志）
}

export interface CloudConfig {
  enabled: boolean;
  url: string;
  auth: {
    enabled: boolean;
    token?: string;
  };
}

export interface GatewayAuthConfig {
  enabled: boolean;
  jwtSecret: string;
  encryptionKey: string;
  accessTokenExpiry: string;
  refreshTokenExpiryDays: number;
}

export interface GatewayDatabaseConfig {
  enabled: boolean;
  path: string;
}

export interface GatewayExplorationConfig {
  enabled: boolean;
  logDir: string;
  schedule: string;
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
  gatewayAuth: GatewayAuthConfig;
  gatewayDatabase: GatewayDatabaseConfig;
  gatewayExploration: GatewayExplorationConfig;
}

const DEFAULT_CONFIG: AppConfigData = {
  version: '1.0.0',
  mode: ConnectionMode.LOCAL,
  gateway: {
    type: 'embedded',
    port: 18790,
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
    path: 'node /opt/homebrew/bin/newma',
    workspace: '{userHome}/NewmaWorkspace',
    backend: 'newma',
    useApiMode: true, // 🔥 新增：默认启用API模式
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
  gatewayAuth: {
    enabled: true,
    jwtSecret: '',
    encryptionKey: '',
    accessTokenExpiry: '7d',
    refreshTokenExpiryDays: 30,
  },
  gatewayDatabase: {
    enabled: true,
    path: './database/gateway.db',
  },
  gatewayExploration: {
    enabled: false,
    logDir: './.memo/logs',
    schedule: '*/1 * * * *',
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

  getGatewayAuthConfig(): GatewayAuthConfig {
    return { ...this.config.gatewayAuth };
  }

  getGatewayDatabaseConfig(): GatewayDatabaseConfig {
    return { ...this.config.gatewayDatabase };
  }

  getGatewayExplorationConfig(): GatewayExplorationConfig {
    return { ...this.config.gatewayExploration };
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

  /**
   * Check if Newma API mode is enabled
   */
  isNewmaApiModeEnabled(): boolean {
    return this.config.newma.useApiMode || false;
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

  updateGatewayAuthConfig(config: Partial<GatewayAuthConfig>): void {
    this.config.gatewayAuth = { ...this.config.gatewayAuth, ...config };
    this.saveConfig();
  }

  updateGatewayDatabaseConfig(config: Partial<GatewayDatabaseConfig>): void {
    this.config.gatewayDatabase = { ...this.config.gatewayDatabase, ...config };
    this.saveConfig();
  }

  updateGatewayExplorationConfig(config: Partial<GatewayExplorationConfig>): void {
    this.config.gatewayExploration = { ...this.config.gatewayExploration, ...config };
    this.saveConfig();
  }

  /**
   * Generate environment variables for Gateway
   */
  getGatewayEnv(): Record<string, string> {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
    };

    // Add auth configuration if enabled
    if (this.config.gatewayAuth.enabled) {
      if (this.config.gatewayAuth.jwtSecret) {
        env.JWT_SECRET = this.config.gatewayAuth.jwtSecret;
      }
      if (this.config.gatewayAuth.encryptionKey) {
        env.ENCRYPTION_KEY = this.config.gatewayAuth.encryptionKey;
      }
      env.ACCESS_TOKEN_EXPIRY = this.config.gatewayAuth.accessTokenExpiry;
      env.REFRESH_TOKEN_EXPIRY_DAYS = this.config.gatewayAuth.refreshTokenExpiryDays.toString();
    }

    // Add database configuration if enabled
    if (this.config.gatewayDatabase.enabled) {
      env.DATABASE_PATH = this.config.gatewayDatabase.path;
    }

    // Add exploration configuration
    env.EXPLORATION_ENABLED = this.config.gatewayExploration.enabled.toString();
    env.EXPLORATION_LOG_DIR = this.config.gatewayExploration.logDir;
    env.EXPLORATION_SCHEDULE = this.config.gatewayExploration.schedule;

    return env;
  }

  /**
   * Generate or retrieve JWT secret
   */
  getOrCreateJWTSecret(): string {
    if (!this.config.gatewayAuth.jwtSecret) {
      const crypto = require('crypto');
      this.config.gatewayAuth.jwtSecret = crypto.randomBytes(32).toString('hex');
      this.saveConfig();
    }
    return this.config.gatewayAuth.jwtSecret;
  }

  /**
   * Generate or retrieve encryption key
   */
  getOrCreateEncryptionKey(): string {
    if (!this.config.gatewayAuth.encryptionKey) {
      const crypto = require('crypto');
      this.config.gatewayAuth.encryptionKey = crypto.randomBytes(32).toString('hex');
      this.saveConfig();
    }
    return this.config.gatewayAuth.encryptionKey;
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
