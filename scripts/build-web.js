#!/usr/bin/env node

/**
 * Build script for Expo Web application
 * Builds the React Native/Expo app for web platform
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const mobileProjectPath = path.resolve(__dirname, '../../../mobilenewma/mobile');
const webBuildPath = path.join(mobileProjectPath, 'web-build');
const targetPath = path.resolve(__dirname, '../src/renderer/build');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║              Expo Web Build Script                    ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log();

// Check if mobile project exists
if (!fs.existsSync(mobileProjectPath)) {
  console.error('❌ Mobile project not found!');
  console.error(`   Expected location: ${mobileProjectPath}`);
  console.error();
  console.error('Please ensure the mobile project is available at:');
  console.error('  /Users/mac/mobilenewma/mobile');
  process.exit(1);
}

console.log(`✓ Mobile project found at: ${mobileProjectPath}`);
console.log();

// Check if package.json exists
const packageJsonPath = path.join(mobileProjectPath, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found in mobile project!');
  process.exit(1);
}

console.log('📦 Installing dependencies...');

// Install dependencies if needed
const nodeModulesPath = path.join(mobileProjectPath, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  try {
    await runCommand('npm', ['install'], mobileProjectPath);
    console.log('✓ Dependencies installed');
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error.message);
    process.exit(1);
  }
} else {
  console.log('✓ Dependencies already installed');
}

console.log();
console.log('🔨 Building Expo Web app...');

try {
  // Build the web app using npx expo export:web
  await runCommand('npx', ['expo', 'export:web'], mobileProjectPath);

  // Check if build was successful
  // Expo export:web outputs to 'dist' folder
  const expoDistPath = path.join(mobileProjectPath, 'dist');

  if (fs.existsSync(expoDistPath)) {
    const files = fs.readdirSync(expoDistPath);
    if (files.length > 0) {
      console.log();
      console.log('✓ Expo web build completed!');
      console.log(`  Output: ${expoDistPath}`);
      console.log(`  Files: ${files.length} file(s)`);
    } else {
      console.error('❌ Build output is empty!');
      process.exit(1);
    }
  } else {
    // Try web-build folder (fallback for older expo versions)
    if (fs.existsSync(webBuildPath)) {
      const files = fs.readdirSync(webBuildPath);
      if (files.length > 0) {
        console.log();
        console.log('✓ Expo web build completed!');
        console.log(`  Output: ${webBuildPath}`);
        console.log(`  Files: ${files.length} file(s)`);

        // Use web-build as the source
        copyBuildToRenderer(webBuildPath);
        process.exit(0);
      }
    }
    console.error('❌ Build directory not created!');
    process.exit(1);
  }

  // Copy build to renderer directory
  copyBuildToRenderer(expoDistPath);
} catch (error) {
  console.error('❌ Failed to build Expo web app:', error.message);
  console.error();
  console.error('Troubleshooting:');
  console.error('  1. Make sure Expo CLI is installed: npm install -g expo-cli');
  console.error('  2. Try running manually: cd /Users/mac/mobilenewma/mobile && npx expo export:web');
  process.exit(1);
}

function copyBuildToRenderer(sourcePath) {
  console.log();
  console.log('📁 Copying build to renderer directory...');

  // Remove old build
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  // Create target directory
  fs.mkdirSync(targetPath, { recursive: true });

  // Copy files
  copyFolderSync(sourcePath, targetPath);

  console.log('✓ Build copied successfully!');
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Target: ${targetPath}`);

  const files = fs.readdirSync(targetPath);
  console.log(`  Files: ${files.length} file(s)`);
}

function copyFolderSync(from, to) {
  fs.mkdirSync(to, { recursive: true });

  const files = fs.readdirSync(from);

  files.forEach((file) => {
    const fromPath = path.join(from, file);
    const toPath = path.join(to, file);

    const stat = fs.statSync(fromPath);

    if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

/**
 * Run a command using spawn (safer than exec)
 */
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
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

console.log();
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║            Expo Web Build Complete ✓                  ║');
console.log('╚════════════════════════════════════════════════════════╝');
