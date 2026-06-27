import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GatewayManager } from '../dist/main/main/gateway/GatewayManager.js';
import { loadWindowState, saveWindowState } from '../dist/main/main/windowState.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'newma-desktop-'));
}

function writeGatewayScript(gatewayPath) {
  const distPath = path.join(gatewayPath, 'dist');
  fs.mkdirSync(distPath, { recursive: true });
  fs.writeFileSync(
    path.join(distPath, 'index.js'),
    `
const net = require('net');
const port = Number(process.env.PORT);
const server = net.createServer((socket) => socket.end());
server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`,
  );
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.equal(typeof address, 'object');
  assert.notEqual(address, null);
  return address.port;
}

test('window state falls back when no state file exists', () => {
  const userDataPath = makeTempDir();

  assert.deepEqual(loadWindowState(userDataPath), {
    width: 1200,
    height: 800,
    isMaximized: false,
  });
});

test('window state saves and reloads persisted bounds', () => {
  const userDataPath = makeTempDir();

  saveWindowState(userDataPath, {
    x: 40,
    y: 50,
    width: 1024,
    height: 768,
    isMaximized: true,
  });

  assert.deepEqual(loadWindowState(userDataPath), {
    x: 40,
    y: 50,
    width: 1024,
    height: 768,
    isMaximized: true,
  });
});

test('gateway start waits for the TCP port and reports running status', async () => {
  const gatewayPath = makeTempDir();
  writeGatewayScript(gatewayPath);
  const port = await getFreePort();
  const gatewayManager = new GatewayManager({
    gatewayPath,
    port,
    backend: 'mock',
  });

  await gatewayManager.start();

  assert.equal(gatewayManager.isRunning(), true);
  assert.equal(gatewayManager.getStatus().state, 'running');
  assert.equal(await gatewayManager.healthCheck(), true);

  await gatewayManager.stop();
});

test('gateway start emits an error status when the script is missing', async () => {
  const gatewayManager = new GatewayManager({
    gatewayPath: makeTempDir(),
    port: await getFreePort(),
    backend: 'mock',
  });
  const statuses = [];
  gatewayManager.onStatusChange((status) => statuses.push(status));

  await assert.rejects(() => gatewayManager.start(), /未找到本地网关脚本/);

  const status = gatewayManager.getStatus();
  assert.equal(status.running, false);
  assert.equal(status.state, 'error');
  assert.match(status.error, /未找到本地网关脚本/);
  assert.equal(statuses.at(-1).state, 'error');
});
