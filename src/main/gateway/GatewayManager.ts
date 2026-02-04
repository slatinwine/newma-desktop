import { spawn, ChildProcess } from 'child_process';
import kill from 'tree-kill';
import path from 'path';
import fs from 'fs';

export interface GatewayConfig {
  gatewayPath: string;
  port: number;
  backend: 'newma' | 'api' | 'mock';
  newmaPath?: string;
  workspaceDir?: string;
}

export interface GatewayStatus {
  running: boolean;
  port: number;
  pid?: number;
  uptime?: number;
}

/**
 * Manages the Gateway server process lifecycle
 */
export class GatewayManager {
  private process: ChildProcess | null = null;
  private readonly config: GatewayConfig;
  private startTime: number = 0;

  constructor(config: GatewayConfig) {
    this.config = config;
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
      throw new Error(`Gateway script not found at ${gatewayScript}`);
    }

    console.log(`Starting Gateway from: ${gatewayScript}`);

    return new Promise((resolve, reject) => {
      const env: any = {
        ...process.env,
        PORT: this.config.port.toString(),
        AI_BACKEND: this.config.backend,
      };

      // Add newma-specific environment variables
      if (this.config.backend === 'newma') {
        env.NEWMA_PATH = this.config.newmaPath || 'newma';
        env.WORKSPACE_DIR = this.config.workspaceDir || process.cwd();
      }

      this.process = spawn(process.execPath, [gatewayScript], {
        cwd: this.config.gatewayPath,
        env,
        stdio: 'pipe',
      });

      this.startTime = Date.now();

      this.process.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`[Gateway] ${output}`);
      });

      this.process.stderr?.on('data', (data) => {
        const output = data.toString().trim();
        console.error(`[Gateway Error] ${output}`);
      });

      this.process.on('error', (error) => {
        console.error('Failed to start gateway:', error);
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`Gateway process exited with code ${code} and signal ${signal}`);
        this.process = null;
        this.startTime = 0;
      });

      // Wait for Gateway to be ready (check for startup success)
      // Give it up to 10 seconds
      const startupTimeout = setTimeout(() => {
        if (this.process) {
          console.log(`Gateway started successfully on port ${this.config.port}`);
          resolve();
        } else {
          reject(new Error('Gateway process failed to start within timeout'));
        }
      }, 3000);

      // If process exits immediately, fail fast
      this.process.once('exit', (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(startupTimeout);
          reject(new Error(`Gateway exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Stop the Gateway server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    console.log('Stopping Gateway...');

    return new Promise((resolve) => {
      if (this.process && this.process.pid) {
        kill(this.process.pid, 'SIGTERM', () => {
          this.process = null;
          this.startTime = 0;
          console.log('Gateway stopped');
          resolve();
        });
      } else {
        this.process = null;
        this.startTime = 0;
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
      port: this.config.port,
      pid: this.process?.pid,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Check if Gateway is healthy
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isRunning()) {
      return false;
    }

    // Simple check: if process is still running, consider it healthy
    // More sophisticated checks could include HTTP/WebSocket ping
    return true;
  }
}
