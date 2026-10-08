import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { freePort, killTree, killTreeAsync, resolveNewmaCommand } from '../util/processUtils';

export interface NewmaInstanceManagerOptions {
  /** newma 可执行文件（裸名称走 PATH，可用 NEWMA_BIN / 配置覆盖） */
  bin?: string;
  /** 传给 newma 的 OPENAI_ENDPOINT（修复 baseUrl 误拼 /v1/chat/completions 的 404），环境变量已设置时不覆盖 */
  openaiEndpoint?: string;
  /** 等 /health 就绪的上限，默认 60s */
  spawnTimeoutMs?: number;
}

export interface NewmaInstance {
  workspace: string;
  port: number;
  persistent: boolean;
}

interface Entry {
  port: number;
  child: ChildProcess;
  lastUsed: number;
  persistent: boolean;
}

const HEALTH_INTERVAL_MS = 600;

/**
 * 按目录懒启动 / 复用 / 回收独立的 `newma --web` 实例。
 * 会话绑定工作区后，请求路由到在该目录下启动的专属实例；空闲实例定期回收。
 * 默认工作区实例是 persistent：掉线自动重启，不参与空闲回收。
 */
export class NewmaInstanceManager {
  private instances = new Map<string, Entry>();
  private pending = new Map<string, Promise<NewmaInstance>>();
  private restartFailures = new Map<string, number>();
  private stopping = false;
  private readonly bin: string;
  private readonly openaiEndpoint?: string;
  private readonly spawnTimeoutMs: number;

  constructor(opts: NewmaInstanceManagerOptions = {}) {
    this.bin = opts.bin || 'newma';
    this.openaiEndpoint = opts.openaiEndpoint;
    this.spawnTimeoutMs = opts.spawnTimeoutMs || 60000;
  }

  /** 返回该目录的存活实例，没有则启动（同目录并发调用共享同一次启动）。 */
  async ensure(ws: string, opts: { persistent?: boolean } = {}): Promise<NewmaInstance> {
    const dir = path.resolve(ws);
    if (!isDir(dir)) throw new Error(`工作区目录不存在：${dir}`);

    const existing = this.instances.get(dir);
    if (existing && this.isAlive(existing)) {
      existing.lastUsed = Date.now();
      existing.persistent = existing.persistent || !!opts.persistent;
      return toInfo(dir, existing);
    }
    if (existing) this.instances.delete(dir);

    const inflight = this.pending.get(dir);
    if (inflight) return inflight;

    const p = this.spawnInstance(dir, !!opts.persistent).finally(() => this.pending.delete(dir));
    this.pending.set(dir, p);
    return p;
  }

  /** 默认工作区：常驻实例（自动重启、不回收）。 */
  ensureDefault(dir: string): Promise<NewmaInstance> {
    return this.ensure(dir, { persistent: true });
  }

  /** 只查找已运行的实例，不启动。 */
  get(ws: string): NewmaInstance | null {
    const dir = path.resolve(ws);
    const e = this.instances.get(dir);
    if (e && this.isAlive(e)) {
      e.lastUsed = Date.now();
      return toInfo(dir, e);
    }
    return null;
  }

  list(): Array<{ workspace: string; port: number }> {
    const out: Array<{ workspace: string; port: number }> = [];
    for (const [dir, e] of this.instances) {
      if (this.isAlive(e)) out.push({ workspace: dir, port: e.port });
    }
    return out;
  }

  /** 回收空闲超过 idleMs 的非持久实例。 */
  reap(idleMs: number): void {
    const now = Date.now();
    for (const [dir, e] of [...this.instances]) {
      if (e.persistent) continue;
      if (now - e.lastUsed > idleMs) {
        console.log(`[newma] 工作区空闲回收：${dir}`);
        this.instances.delete(dir);
        killTree(e.child);
      }
    }
  }

  async stopAll(): Promise<void> {
    this.stopping = true;
    const children = [...this.instances.values()].map((e) => e.child);
    this.instances.clear();
    this.pending.clear();
    await Promise.allSettled(children.map((c) => killTreeAsync(c)));
  }

  private isAlive(e: Entry): boolean {
    return e.child.exitCode === null && e.child.signalCode === null;
  }

  private async spawnInstance(dir: string, persistent: boolean): Promise<NewmaInstance> {
    const port = await freePort();
    const cmd = resolveNewmaCommand(this.bin);
    const label = path.basename(dir);
    const prefix = `[newma:${label}]`;

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.openaiEndpoint && !env.OPENAI_ENDPOINT) env.OPENAI_ENDPOINT = this.openaiEndpoint;

    console.log(`${prefix} 启动 newma --web（端口 ${port}，目录 ${dir}）`);
    const child = spawn(cmd.file, [...cmd.args, '--web', '--web-port', String(port), '--web-host', '127.0.0.1', '-d', dir], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.on('data', (d) => logLines(prefix, d));
    child.stderr?.on('data', (d) => logLines(prefix, d));

    const entry: Entry = { port, child, lastUsed: Date.now(), persistent };
    child.on('exit', (code, signal) => {
      if (this.instances.get(dir) === entry) this.instances.delete(dir);
      if (entry.persistent && !this.stopping) {
        const failures = this.restartFailures.get(dir) || 0;
        const delay = Math.min(60000, 1500 * 2 ** failures);
        console.log(`${prefix} 已退出（code=${code}, signal=${signal}），${delay}ms 后自动重启`);
        setTimeout(() => {
          if (this.stopping) return;
          this.ensureDefault(dir)
            .then(() => this.restartFailures.delete(dir))
            .catch((err: Error) => {
              this.restartFailures.set(dir, failures + 1);
              console.error(`${prefix} 重启失败：${err.message}`);
            });
        }, delay).unref();
      }
    });

    // 轮询 /health 等实例就绪
    const deadline = Date.now() + this.spawnTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`newma 进程启动后立即退出（code ${child.exitCode}），请检查 newma 是否可用`);
      }
      if (this.stopping) {
        killTree(child);
        throw new Error('应用正在关闭');
      }
      if (await healthOk(port)) {
        if (this.stopping) {
          killTree(child);
          throw new Error('应用正在关闭');
        }
        this.instances.set(dir, entry);
        this.restartFailures.delete(dir);
        return toInfo(dir, entry);
      }
      await sleep(HEALTH_INTERVAL_MS);
    }
    killTree(child);
    throw new Error(`newma 启动超时（${Math.round(this.spawnTimeoutMs / 1000)}s 内未就绪）`);
  }
}

function toInfo(dir: string, e: Entry): NewmaInstance {
  return { workspace: dir, port: e.port, persistent: e.persistent };
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthOk(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function logLines(prefix: string, chunk: Buffer): void {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.trim()) console.log(`${prefix} ${line}`);
  }
}
