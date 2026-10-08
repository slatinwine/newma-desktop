#!/usr/bin/env node
/**
 * Windows NSIS 打包包装：electron-builder 构建完安装包后会运行它提取卸载程序，
 * Defender 对刚生成的 exe 首次扫描偶发拦截导致 spawn UNKNOWN（实测 3 次里挂 2 次）。
 * 这里对包含该错误的失败做重试，重试后一般可过。
 *
 * 用法：node scripts/dist-win.mjs [额外的 electron-builder 参数…]
 * 镜像变量请在环境里设置：
 *   ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
 *   ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
 */
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
const MAX_TRIES = 3;

for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
  const r = spawnSync('npx', ['electron-builder', '--win', ...args], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
      ELECTRON_BUILDER_BINARIES_MIRROR:
        process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
    },
  });
  if (r.status === 0) {
    console.log(`\n✅ 打包成功（第 ${attempt} 次尝试）`);
    process.exit(0);
  }
  console.warn(`\n⚠️ 第 ${attempt}/${MAX_TRIES} 次打包失败`);
  if (attempt < MAX_TRIES) {
    console.warn('3 秒后重试…');
    await new Promise((r2) => setTimeout(r2, 3000));
  }
}
console.error('❌ 连续失败，请查看上方日志');
process.exit(1);
