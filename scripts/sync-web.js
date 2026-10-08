#!/usr/bin/env node
/**
 * 把 newma-web 仓库的前端页面同步进桌面应用资源目录。
 * 用法：node scripts/sync-web.js [newma-web/public/index.html 路径]
 * 默认找仓库同级目录 ../newma-web/public/index.html。
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const src = process.argv[2] || path.join(repoRoot, '..', 'newma-web', 'public', 'index.html');
const destDir = path.join(repoRoot, 'resources', 'newma-web');

if (!fs.existsSync(src)) {
  console.error(`找不到源页面：${src}\n用法：node scripts/sync-web.js <newma-web/public/index.html>`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'index.html'));
console.log(`已同步 ${src} -> resources/newma-web/index.html`);
