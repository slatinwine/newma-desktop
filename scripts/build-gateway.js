#!/usr/bin/env node

/**
 * Build script for Gateway
 * Compiles TypeScript and ensures dependencies are installed
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const gatewaySourcePath = path.resolve(__dirname, '../../gateway-source');
const gatewayDistPath = path.join(gatewaySourcePath, 'dist');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║              Gateway Build Script                      ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log();

// Check if gateway-source exists
if (!fs.existsSync(gatewaySourcePath)) {
  console.error('❌ Gateway source not found!');
  console.error(`   Expected location: ${gatewaySourcePath}`);
  console.error();
  console.error('Please ensure the Gateway source is available:');
  console.error('  1. Copy from: /Users/mac/mobilenewma/gateway');
  console.error('  2. Or create symlink: ln -s /Users/mac/mobilenewma/gateway ./gateway-source');
  process.exit(1);
}

console.log(`✓ Gateway source found at: ${gatewaySourcePath}`);
console.log();

// Check if package.json exists
const packageJsonPath = path.join(gatewaySourcePath, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found in gateway-source!');
  process.exit(1);
}

console.log('📦 Installing Gateway dependencies...');

// Install dependencies if node_modules doesn't exist
const nodeModulesPath = path.join(gatewaySourcePath, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  await runCommand('npm', ['install'], gatewaySourcePath);
  console.log('✓ Dependencies installed');
} else {
  console.log('✓ Dependencies already installed');
}

console.log();
console.log('🔨 Building Gateway...');

try {
  // Build the Gateway
  await runCommand('npm', ['run', 'build'], gatewaySourcePath);

  // Check if build was successful
  if (fs.existsSync(gatewayDistPath)) {
    const files = fs.readdirSync(gatewayDistPath);
    if (files.length > 0) {
      console.log();
      console.log('✓ Gateway built successfully!');
      console.log(`  Output: ${gatewayDistPath}`);
      console.log(`  Files: ${files.length} file(s)`);
    } else {
      console.error('❌ Build output is empty!');
      process.exit(1);
    }
  } else {
    console.error('❌ Build directory not created!');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Failed to build Gateway:', error.message);
  process.exit(1);
}

console.log();
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║            Gateway Build Complete ✓                    ║');
console.log('╚════════════════════════════════════════════════════════╝');

/**
 * Run a command using spawn (safer than exec)
 */
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}
