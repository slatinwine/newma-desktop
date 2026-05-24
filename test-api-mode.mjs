#!/usr/bin/env node
/**
 * 测试Newma CLI的API模式
 * 验证输出是否干净（无日志、无元数据）
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:18789';
const TEST_PROMPT = 'What is 2+2?';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║          Newma API Mode Test                          ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

console.log(`📡 Connecting to: ${WS_URL}`);
console.log(`📝 Test prompt: "${TEST_PROMPT}"\n`);

const ws = new WebSocket(WS_URL);

let receivedMessages = [];
let startTime = Date.now();

ws.on('open', () => {
  console.log('✅ Connected to Gateway\n');

  // 发送connect帧
  const connectFrame = {
    type: 'req',
    id: 'connect-1',
    method: 'connect',
    params: {
      client: {
        id: 'test-client',
        version: '1.0.0',
        platform: 'test'
      }
    }
  };

  console.log('📤 Sending connect frame...');
  ws.send(JSON.stringify(connectFrame));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  receivedMessages.push(message);

  if (message.type === 'event') {
    console.log(`📥 Event: ${message.event}`);

    if (message.event === 'connected') {
      // 连接成功，发送agent请求
      setTimeout(() => {
        const agentFrame = {
          type: 'req',
          id: 'agent-1',
          method: 'agent',
          params: {
            message: TEST_PROMPT
          }
        };

        console.log('📤 Sending agent request...');
        startTime = Date.now();
        ws.send(JSON.stringify(agentFrame));
      }, 500);
    }
  } else if (message.type === 'res') {
    const duration = Date.now() - startTime;
    console.log(`\n📥 Response received (${duration}ms)`);
    console.log('━'.repeat(60));

    if (message.ok) {
      console.log('✅ Status: OK');
      console.log(`\n🤖 AI Response:\n`);
      console.log(message.payload);
      console.log('\n' + '━'.repeat(60));

      // 分析响应
      analyzeResponse(message.payload);
    } else {
      console.log('❌ Status: Error');
      console.log(`Error: ${message.error}`);
    }

    // 关闭连接
    setTimeout(() => {
      ws.close();
    }, 100);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n✅ Connection closed');
  process.exit(0);
});

// 超时处理
setTimeout(() => {
  console.log('\n⏱️  Timeout: No response received');
  ws.close();
  process.exit(1);
}, 30000);

/**
 * 分析响应，检查是否符合API模式特征
 */
function analyzeResponse(response) {
  console.log('\n📊 Analysis:\n');

  const responseText = typeof response === 'string' ? response : JSON.stringify(response);
  const lines = responseText.split('\n');

  // 检查噪音模式
  const noisePatterns = [
    { name: 'Session Info', pattern: /Session:\s+\w+/i },
    { name: 'Project Info', pattern: /Project:\s+\w+/i },
    { name: 'Plugin Loading', pattern: /\[Plugin\].*Loading/i },
    { name: 'Gateway Startup', pattern: /NEWMA\s+AI\s+Assistant/i },
    { name: 'Banner', pattern: /╔═══.*╗/s },
  ];

  let foundNoise = [];
  for (const { name, pattern } of noisePatterns) {
    if (pattern.test(responseText)) {
      foundNoise.push(name);
    }
  }

  console.log(`Response Length: ${responseText.length} chars`);
  console.log(`Lines: ${lines.length}`);

  if (foundNoise.length > 0) {
    console.log(`⚠️  Found Noise: ${foundNoise.join(', ')}`);
    console.log('❌ API Mode may not be working correctly');
  } else {
    console.log('✅ No noise patterns detected');
    console.log('✅ API Mode appears to be working correctly');
  }

  // 检查是否是纯文本响应
  const hasMarkup = /```[\s\S]*?```/.test(responseText);
  console.log(`Contains Code Blocks: ${hasMarkup ? 'Yes' : 'No'}`);
}
