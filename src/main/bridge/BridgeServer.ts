import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { NewmaInstanceManager } from '../newma/NewmaInstanceManager';
import { BUILTIN_PLUGINS, listPlugins, listSkills } from '../newma/localContent';
import { freePort } from '../util/processUtils';

export interface BridgeServerOptions {
  /** 首选对外端口（被占用时自动换空闲端口） */
  preferredPort: number;
  /** 前端页面目录（需包含 index.html） */
  publicDir: string;
  /** 默认工作区目录（未绑定工作区的会话走这里的 newma 实例） */
  defaultWorkspace: string;
  /** 项目技能/插件目录，默认 <defaultWorkspace>/.kode/… */
  projectSkillsDir?: string;
  projectPluginsDir?: string;
  homeSkillsDir?: string;
  newma: NewmaInstanceManager;
}

/**
 * newma-web 桥接服务器（server.py 的 TS 移植版）：
 * 伺服前端页面、提供本地技能/插件/工作区接口，并把业务 API 反代到
 * 内部 `newma --web` 实例；POST body 的 workspace 字段或 GET ?ws=
 * 参数把请求路由到对应工作区的独立实例。
 */
export class BridgeServer {
  private server: http.Server | null = null;
  private port = 0;

  constructor(private readonly opts: BridgeServerOptions) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}/`;
  }

  get boundPort(): number {
    return this.port;
  }

  async start(): Promise<void> {
    const port = await this.pickPort();
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err: Error) => {
        console.error('[bridge] 请求处理出错:', err.message);
        if (!res.headersSent) this.json(res, 500, { error: err.message });
        else res.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });
    this.server = server;
    this.port = port;
    console.log(`[bridge] Newma Chat: ${this.url}（前端目录 ${this.opts.publicDir}）`);
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    // Chromium 的 keep-alive 连接会让 close() 一直等，先掐掉
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('[bridge] 已停止');
  }

  private async pickPort(): Promise<number> {
    if (await this.portAvailable(this.opts.preferredPort)) return this.opts.preferredPort;
    console.log(`[bridge] 端口 ${this.opts.preferredPort} 被占用，自动改用空闲端口`);
    return freePort();
  }

  private portAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    const p = u.pathname;
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Length': 0,
      });
      res.end();
      return;
    }

    if (method === 'GET') {
      if (p === '/api/local/skills') {
        this.json(res, 200, { skills: this.skills() });
        return;
      }
      if (p === '/api/local/plugins') {
        this.json(res, 200, { plugins: this.plugins(), builtin: BUILTIN_PLUGINS });
        return;
      }
      if (p === '/api/workspaces') {
        this.json(res, 200, { workspaces: this.opts.newma.list(), default: this.opts.defaultWorkspace });
        return;
      }
      if (p === '/health' || p === '/api/status') {
        // 与 server.py 一致：GET 带 ws 时只查找已运行实例（不触发启动）
        const ws = u.searchParams.get('ws')?.trim() || '';
        if (ws) {
          const inst = this.opts.newma.get(ws);
          if (!inst) {
            this.json(res, 503, { error: 'workspace not running' });
            return;
          }
          await this.forward(inst.port, req, res);
          return;
        }
        await this.proxy(req, res);
        return;
      }
      if (p === '/' || p === '/index.html') {
        this.serveIndex(res);
        return;
      }
      this.json(res, 404, { error: 'not found' });
      return;
    }

    if (method === 'POST') {
      const body = await readBody(req);
      if (p.startsWith('/api/workspace/ensure')) {
        await this.ensureWorkspace(res, body);
        return;
      }
      if (p.startsWith('/api/')) {
        await this.proxy(req, res, body);
        return;
      }
      this.json(res, 404, { error: 'not found' });
      return;
    }

    this.json(res, 404, { error: 'not found' });
  }

  private serveIndex(res: ServerResponse): void {
    const file = path.join(this.opts.publicDir, 'index.html');
    let html: Buffer;
    try {
      html = fs.readFileSync(file);
    } catch {
      this.json(res, 404, { error: `public/index.html not found（${file}）` });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length,
      'Cache-Control': 'no-cache',
    });
    res.end(html);
  }

  private skills() {
    return listSkills({
      project: this.opts.projectSkillsDir || path.join(this.opts.defaultWorkspace, '.kode', 'skills'),
      home: this.opts.homeSkillsDir || path.join(os.homedir(), '.kode', 'skills'),
    });
  }

  private plugins() {
    return listPlugins(this.opts.projectPluginsDir || path.join(this.opts.defaultWorkspace, '.kode', 'plugins'));
  }

  private async ensureWorkspace(res: ServerResponse, body: Buffer): Promise<void> {
    let obj: { workspace?: unknown } = {};
    try {
      obj = body.length ? JSON.parse(body.toString('utf8')) : {};
    } catch {
      obj = {};
    }
    const ws = String(obj.workspace || '').trim();
    if (!ws) {
      this.json(res, 400, { error: '缺少 workspace 字段' });
      return;
    }
    try {
      const inst = await this.opts.newma.ensure(ws);
      this.json(res, 200, { ok: true, port: inst.port, workspace: inst.workspace });
    } catch (err) {
      this.json(res, 502, { error: String((err as Error).message || err) });
    }
  }

  /** 反代到 newma：workspace 路由，未指定时走默认实例（不在运行则拉起，重启透明化）。 */
  private async proxy(req: IncomingMessage, res: ServerResponse, body?: Buffer): Promise<void> {
    let ws = '';
    let data = body;
    if (body && body.length) {
      try {
        const obj = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          ws = String(obj.workspace ?? '').trim();
          if ('workspace' in obj) delete obj.workspace;
          data = Buffer.from(JSON.stringify(obj), 'utf8');
        }
      } catch {
        /* 非 JSON，原样转发 */
      }
    }
    if (!ws) {
      ws = (new URL(req.url || '/', 'http://127.0.0.1')).searchParams.get('ws')?.trim() || '';
    }

    try {
      const inst = ws
        ? await this.opts.newma.ensure(ws)
        : await this.opts.newma.ensureDefault(this.opts.defaultWorkspace);
      await this.forward(inst.port, req, res, data);
    } catch (err) {
      const msg = String((err as Error).message || err);
      this.json(res, 502, { error: ws ? `工作区启动失败：${msg}` : msg });
    }
  }

  private forward(port: number, req: IncomingMessage, res: ServerResponse, body?: Buffer): Promise<void> {
    return new Promise<void>((resolve) => {
      const headers: Record<string, string> = {};
      const hasBody = !!body && body.length > 0;
      if (hasBody) {
        if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
        headers['Content-Length'] = String(body!.length);
      }
      const upstream = http.request(
        { host: '127.0.0.1', port, path: req.url, method: req.method, headers },
        (ur) => {
          const out: Record<string, string> = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': String(ur.headers['content-type'] || 'application/json'),
          };
          const len = ur.headers['content-length'];
          if (len) out['Content-Length'] = String(len);
          res.writeHead(ur.statusCode || 502, out);
          ur.pipe(res);
          ur.on('end', resolve);
          ur.on('close', resolve);
          ur.on('error', resolve);
        }
      );
      upstream.setTimeout(30000, () => upstream.destroy(new Error('上游请求超时（30s）')));
      upstream.on('error', (err) => {
        if (!res.headersSent) this.json(res, 502, { error: String(err.message || err) });
        else res.end();
        resolve();
      });
      if (hasBody) upstream.write(body);
      upstream.end();
    });
  }

  private json(res: ServerResponse, code: number, obj: unknown): void {
    if (res.headersSent) {
      res.end();
      return;
    }
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
