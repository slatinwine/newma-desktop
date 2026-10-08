#!/usr/bin/env node
/**
 * 桥接服务器 + newma 实例管理器的纯 Node 集成测试（不启动 Electron）。
 * 覆盖：页面伺服、技能/插件枚举、默认实例反代、工作区懒启动与路由、空闲回收、关闭清理。
 *
 * 用法：node scripts/test-bridge.mjs
 * 依赖：newma 已全局安装且可运行（真实拉起 newma --web 实例）。
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { BridgeServer } = require('../dist/main/bridge/BridgeServer.js');
const { NewmaInstanceManager } = require('../dist/main/newma/NewmaInstanceManager.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(repoRoot, 'resources', 'newma-web');

function makeTempWs(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `newma-bridge-${tag}-`));
}

async function get(base, p) {
  const res = await fetch(base.replace(/\/$/, '') + p);
  return { status: res.status, body: await res.text(), type: res.headers.get('content-type') || '' };
}

async function post(base, p, obj) {
  const res = await fetch(base.replace(/\/$/, '') + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const defaultWs = makeTempWs('default');
  const otherWs = makeTempWs('other');
  const manager = new NewmaInstanceManager({ spawnTimeoutMs: 60000 });
  const bridge = new BridgeServer({
    preferredPort: 3010,
    publicDir: PUBLIC_DIR,
    defaultWorkspace: defaultWs,
    newma: manager,
  });
  await bridge.start();
  const base = bridge.url;
  console.log('bridge at', base);

  try {
    // 1. 页面伺服
    const page = await get(base, '/');
    assert.strictEqual(page.status, 200);
    assert.ok(page.type.includes('text/html'));
    assert.ok(page.body.includes('Newma Chat'), '页面应包含 Newma Chat 标识');
    console.log('✓ GET / 伺服前端页面');

    // 2. 本地技能/插件枚举
    const skills = JSON.parse((await get(base, '/api/local/skills')).body);
    assert.ok(Array.isArray(skills.skills));
    const plugins = JSON.parse((await get(base, '/api/local/plugins')).body);
    assert.ok(Array.isArray(plugins.plugins) && Array.isArray(plugins.builtin));
    assert.strictEqual(plugins.builtin.length, 7, '内置插件清单应为 7 项');
    console.log(`✓ /api/local/skills（${skills.skills.length} 项）、/api/local/plugins（内置 ${plugins.builtin.length} 项）`);

    // 3. 默认实例：首次 /health 触发拉起并反代
    const health = JSON.parse((await get(base, '/health')).body);
    assert.strictEqual(health.status, 'ok');
    console.log('✓ /health 反代默认实例');

    const status = JSON.parse((await get(base, '/api/status')).body);
    assert.strictEqual(status.status, 'running');
    assert.ok(Array.isArray(status.outputBuffer));
    console.log('✓ /api/status 反代默认实例');

    // 4. 工作区路由：未启动的实例先报 503
    const notRunning = await get(base, `/health?ws=${encodeURIComponent(otherWs)}`);
    assert.strictEqual(notRunning.status, 503);
    console.log('✓ 未启动的工作区 /health?ws= 返回 503');

    // 5. ensure 懒启动 + 路由到专属实例
    const ensured = JSON.parse((await post(base, '/api/workspace/ensure', { workspace: otherWs })).body);
    assert.strictEqual(ensured.ok, true);
    assert.strictEqual(path.resolve(ensured.workspace), path.resolve(otherWs));
    const wsHealth = JSON.parse((await get(base, `/health?ws=${encodeURIComponent(otherWs)}`)).body);
    assert.strictEqual(wsHealth.status, 'ok');
    console.log(`✓ /api/workspace/ensure 懒启动（端口 ${ensured.port}）并按 ?ws= 路由`);

    // 6. POST body 的 workspace 字段路由（用无副作用的 /api/clear 验证转发）
    const cleared = JSON.parse((await post(base, '/api/clear', { workspace: otherWs })).body);
    assert.strictEqual(cleared.status, 'cleared');
    console.log('✓ POST body workspace 字段路由（/api/clear）');

    // 7. 默认实例常驻：不在回收范围
    manager.reap(0); // 立即回收所有非持久实例
    const afterReap = await get(base, `/health?ws=${encodeURIComponent(otherWs)}`);
    assert.strictEqual(afterReap.status, 503, '空闲工作区实例应被回收');
    const defaultHealth = JSON.parse((await get(base, '/health')).body);
    assert.strictEqual(defaultHealth.status, 'ok', '默认实例不应被回收');
    console.log('✓ 空闲回收只作用于工作区实例，默认实例常驻');

    // 8. 不存在的工作区报错
    const bad = await post(base, '/api/workspace/ensure', { workspace: 'Z:\\ surely-not-exist-dir' });
    assert.strictEqual(bad.status, 502);
    console.log('✓ 不存在的工作区返回 502');

    // 9. 收尾：全部实例停止，且 OS 进程被真正清理
    const dirTags = [path.basename(defaultWs), path.basename(otherWs)];
    await manager.stopAll();
    await bridge.stop();
    let stopped = false;
    try {
      await get(base, '/health');
    } catch {
      stopped = true; // 连接被拒 = 服务器已关闭
    }
    assert.ok(stopped, '桥接停止后端口应不可达');
    await new Promise((r) => setTimeout(r, 1500));
    const { execSync } = await import('child_process');
    for (const tag of dirTags) {
      // 先按进程名过滤再匹配目录，避免把查询进程自身算进去
      const count = Number(
        execSync(
          `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object CommandLine -match '${tag}' | Measure-Object).Count"`,
          { encoding: 'utf8' }
        ).trim() || '0'
      );
      assert.strictEqual(count, 0, `实例进程未被清理（${tag}，残留 ${count} 个）`);
    }
    console.log('✓ stopAll / 桥接停止，进程树清理完成');

    console.log('\n全部通过 ✅');
  } finally {
    await manager.stopAll().catch(() => {});
    await bridge.stop().catch(() => {});
  }
}

main().catch((err) => {
  console.error('测试失败 ❌:', err);
  process.exit(1);
});
