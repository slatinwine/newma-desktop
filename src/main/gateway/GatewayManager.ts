import { spawn, ChildProcess } from 'child_process';
import kill from 'tree-kill';
import path from 'path';
import fs from 'fs';
import net from 'net';

export interface GatewayConfig {
  gatewayPath: string;
  port: number;
  backend: 'newma' | 'api' | 'mock';
  newmaPath?: string;
  workspaceDir?: string;
  authEnabled?: boolean;
  jwtSecret?: string;
  encryptionKey?: string;
  databaseEnabled?: boolean;
  databasePath?: string;
  explorationEnabled?: boolean;
  explorationLogDir?: string;
  useNewmaApiMode?: boolean; // 🔥 新增：是否使用Newma API模式
}

export type GatewayState = 'starting' | 'running' | 'error';

export interface GatewayStatus {
  running: boolean;
  state: GatewayState;
  port: number;
  pid?: number;
  uptime?: number;
  error?: string;
}

type GatewayStatusListener = (status: GatewayStatus) => void;

/**
 * Manages the Gateway server process lifecycle
 */
export class GatewayManager {
  private process: ChildProcess | null = null;
  private readonly config: GatewayConfig;
  private startTime: number = 0;
  private state: GatewayState = 'starting';
  private lastError?: string;
  private statusListeners = new Set<GatewayStatusListener>();
  private isStopping = false;

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  onStatusChange(listener: GatewayStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusListeners.forEach((listener) => listener(status));
  }

  /**
   * Start the Gateway server
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Gateway is already running');
    }

    const gatewayScript = path.join(this.config.gatewayPath, 'dist', 'index.js');

    if (!fs.existsSync(gatewayScript)) {
      const message = `未找到本地网关脚本：${gatewayScript}`;
      this.markError(message);
      throw new Error(message);
    }

    const nodePath = this.resolveNodePath();
    console.log(`Starting Gateway from: ${gatewayScript}`);

    const env: any = {
      ...process.env,
      PORT: this.config.port.toString(),
      AI_BACKEND: this.config.backend,
      PATH: [path.dirname(nodePath), process.env.PATH].filter(Boolean).join(path.delimiter),
    };

    // Add newma-specific environment variables
    if (this.config.backend === 'newma') {
      env.NEWMA_PATH = this.config.newmaPath || 'newma';
      env.WORKSPACE_DIR = this.config.workspaceDir || process.cwd();
    }

    // Add authentication configuration
    if (this.config.authEnabled) {
      if (this.config.jwtSecret) {
        env.JWT_SECRET = this.config.jwtSecret;
      }
      if (this.config.encryptionKey) {
        env.ENCRYPTION_KEY = this.config.encryptionKey;
      }
    }

    // Add database configuration
    if (this.config.databaseEnabled) {
      env.DATABASE_PATH = this.config.databasePath || './database/gateway.db';
    }

    // Add exploration configuration
    if (this.config.explorationEnabled) {
      env.EXPLORATION_ENABLED = 'true';
      if (this.config.explorationLogDir) {
        env.EXPLORATION_LOG_DIR = this.config.explorationLogDir;
      }
    }

    // 🔥 新增：Newma API模式配置
    if (this.config.useNewmaApiMode) {
      env.NEWMA_API_MODE = 'true';
    }

    this.state = 'starting';
    this.lastError = undefined;
    this.notifyStatusChange();

    const gatewayProcess = spawn(nodePath, [gatewayScript], {
      cwd: this.config.gatewayPath,
      env,
      stdio: 'pipe',
    });

    this.process = gatewayProcess;
    this.startTime = Date.now();
    this.isStopping = false;
    this.notifyStatusChange();

    gatewayProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[Gateway] ${output}`);
    });

    gatewayProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      console.error(`[Gateway Error] ${output}`);
    });

    const startupFailure = new Promise<never>((_resolve, reject) => {
      gatewayProcess.once('error', (error) => {
        console.error('Failed to start gateway:', error);
        if (this.process !== gatewayProcess) {
          return;
        }
        this.process = null;
        this.startTime = 0;
        this.markError(error);
        reject(error);
      });

      gatewayProcess.once('exit', (code, signal) => {
        console.log(`Gateway process exited with code ${code} and signal ${signal}`);
        if (this.process !== gatewayProcess) {
          return;
        }
        const wasStopping = this.isStopping;
        const wasRunning = this.state === 'running';
        this.process = null;
        this.startTime = 0;
        this.isStopping = false;

        if (wasStopping) {
          return;
        }

        const error = new Error(this.formatExitMessage(code, signal));
        this.markError(error);

        if (!wasRunning) {
          reject(error);
        }
      });
    });

    try {
      await Promise.race([
        this.waitForReady(15000, 200),
        startupFailure,
      ]);
      this.state = 'running';
      this.lastError = undefined;
      this.notifyStatusChange();
      console.log(`Gateway started successfully on port ${this.config.port}`);
    } catch (error) {
      if (this.process === gatewayProcess) {
        this.process = null;
        this.startTime = 0;
        gatewayProcess.kill();
      }
      this.markError(error);
      throw error;
    }
  }

  /**
   * Stop the Gateway server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    console.log('Stopping Gateway...');
    this.isStopping = true;

    return new Promise((resolve) => {
      if (this.process && this.process.pid) {
        kill(this.process.pid, 'SIGTERM', () => {
          this.process = null;
          this.startTime = 0;
          this.isStopping = false;
          console.log('Gateway stopped');
          resolve();
        });
      } else {
        this.process = null;
        this.startTime = 0;
        this.isStopping = false;
        resolve();
      }
    });
  }

  /**
   * Restart the Gateway server
   */
  async restart(): Promise<void> {
    await this.stop();
    // Wait a bit for port to be released
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.start();
  }

  /**
   * Check if Gateway is running
   */
  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * Get Gateway status
   */
  getStatus(): GatewayStatus {
    return {
      running: this.isRunning(),
      state: this.state,
      port: this.config.port,
      pid: this.process?.pid,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }

  /**
   * Check if Gateway is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isRunning()) {
      return false;
    }

    return this.canConnect(500);
  }

  private async waitForReady(timeoutMs: number, intervalMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (!this.process) {
        throw new Error('Gateway 进程已退出，未能完成启动');
      }

      if (await this.canConnect(500)) {
        return;
      }

      await this.delay(intervalMs);
    }

    throw new Error(`Gateway 在 ${Math.round(timeoutMs / 1000)} 秒内未监听 127.0.0.1:${this.config.port}`);
  }

  private canConnect(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect({
        host: '127.0.0.1',
        port: this.config.port,
      });
      let settled = false;

      const finish = (healthy: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        resolve(healthy);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
  }

  private resolveNodePath(): string {
    const executableNames = process.platform === 'win32'
      ? ['node.exe', 'node.cmd', 'node.bat', 'node']
      : ['node'];

    for (const directory of (process.env.PATH || '').split(path.delimiter)) {
      if (!directory) {
        continue;
      }

      for (const executableName of executableNames) {
        const candidate = path.join(directory, executableName);
        if (this.isExecutable(candidate)) {
          return candidate;
        }
      }
    }

    throw new Error('未找到 Node.js 可执行文件。请安装 Node.js，或确认 node 已加入 PATH。');
  }

  private isExecutable(filePath: string): boolean {
    try {
      fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private formatExitMessage(code: number | null, signal: NodeJS.Signals | null): string {
    if (code !== null) {
      return `Gateway 进程退出，退出码 ${code}`;
    }
    if (signal) {
      return `Gateway 进程收到信号 ${signal} 后退出`;
    }
    return 'Gateway 进程意外退出';
  }

  private markError(error: unknown): void {
    this.state = 'error';
    this.lastError = error instanceof Error ? error.message : String(error);
    this.notifyStatusChange();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
