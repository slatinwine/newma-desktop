import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

/** 找一个当前空闲的本机回环端口。 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('无法获取可用端口'))));
    });
  });
}

export interface ResolvedCommand {
  file: string;
  args: string[];
}

/**
 * 解析 newma 可执行文件。裸名称时在 PATH 中查找；
 * Windows 下 npm 全局包是 .cmd 包装脚本，必须经 cmd /c 启动。
 * 同名多个候选时优先 .exe，其次 .cmd/.bat（裸脚本通常是 sh 版本，Windows 跑不了）。
 */
export function resolveNewmaCommand(bin: string): ResolvedCommand {
  const candidates: string[] = [];
  if (/[\\/]/.test(bin) || path.isAbsolute(bin)) {
    candidates.push(bin);
  } else {
    const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
    for (const dir of (process.env.PATH || '').split(path.delimiter)) {
      if (!dir) continue;
      for (const ext of exts) candidates.push(path.join(dir, bin + ext));
    }
  }
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return wrap(c);
    } catch {
      /* continue */
    }
  }
  return wrap(bin); // 兜底交给系统解析，失败时 spawn 会报错
}

function wrap(file: string): ResolvedCommand {
  const lower = file.toLowerCase();
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return { file: process.platform === 'win32' ? 'cmd' : file, args: process.platform === 'win32' ? ['/c', file] : [] };
  }
  return { file, args: [] };
}

/** 结束进程树（fire-and-forget）：Windows 用 taskkill /T /F，其他平台 SIGTERM → SIGKILL。 */
export function killTree(child: ChildProcess): void {
  killTreeAsync(child).catch(() => child.kill());
}

/**
 * 结束进程树并等待完成。
 * 必须真正等待：调用方随即退出时（如应用退出、测试结束），未完成的 taskkill
 * 子进程会随父进程一起被终止，留下孤立的 newma 进程。
 */
export function killTreeAsync(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.pid || child.exitCode !== null) {
      resolve();
      return;
    }
    if (process.platform === 'win32') {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      try {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.on('exit', done);
        killer.on('error', () => {
          child.kill();
          done();
        });
        setTimeout(() => {
          if (child.exitCode === null) child.kill();
          done();
        }, 5000).unref();
      } catch {
        child.kill();
        done();
      }
    } else {
      child.kill('SIGTERM');
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    }
  });
}
