#!/usr/bin/env node
/**
 * Quick fix script for NODE_MODULE_VERSION mismatch errors
 * This script provides multiple solutions and guides users through the fix
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🔧 Native Module Fix Tool\n');
console.log('This tool will help you fix NODE_MODULE_VERSION mismatch errors.\n');

// Display current system info
console.log('📊 Current Environment:');
console.log(`   Node.js: ${process.version}`);
console.log(`   Platform: ${process.platform} ${process.arch}`);
console.log(`   NODE_MODULE_VERSION: ${process.versions.modules}`);
console.log('');

// Check if better-sqlite3 exists
const sqliteDir = path.join(__dirname, 'node_modules', 'better-sqlite3');
if (!fs.existsSync(sqliteDir)) {
    console.error('❌ better-sqlite3 not found in node_modules');
    console.log('Please run: npm install');
    process.exit(1);
}

// Check current binary
const binaryPath = path.join(sqliteDir, 'build', 'Release', 'better_sqlite3.node');
if (fs.existsSync(binaryPath)) {
    const stats = fs.statSync(binaryPath);
    console.log('📦 Current Binary:');
    console.log(`   Path: ${binaryPath}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
    console.log('');
}

console.log('🎯 Available Solutions:\n');
console.log('1. Download prebuilt binaries (Recommended - Fast, no build tools needed)');
console.log('2. Use @electron/rebuild (Requires Electron in project)');
console.log('3. Build from source (Requires C++ build tools)');
console.log('4. Show diagnostic information only');
console.log('');

rl.question('Select a solution (1-4): ', (answer) => {
    console.log('');
    
    try {
        switch (answer.trim()) {
            case '1':
                downloadPrebuilt();
                break;
            case '2':
                useElectronRebuild();
                break;
            case '3':
                buildFromSource();
                break;
            case '4':
                showDiagnostics();
                break;
            default:
                console.log('❌ Invalid selection');
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
});

function downloadPrebuilt() {
    console.log('📥 Downloading prebuilt binaries...\n');
    
    const versions = [
        { version: '39.0.0', node: '23.x', moduleVersion: 136 },
        { version: '38.0.0', node: '22.x', moduleVersion: 127 },
        { version: '37.0.0', node: '22.x', moduleVersion: 127 },
        { version: '31.0.0', node: '20.x', moduleVersion: 136 },
    ];
    
    console.log('Trying Electron versions (most recent first):\n');
    
    process.chdir(sqliteDir);
    
    for (const { version, node, moduleVersion } of versions) {
        try {
            console.log(`Trying Electron ${version} (Node.js ${node}, MODULE_VERSION ${moduleVersion})...`);
            execSync(`npx prebuild-install --runtime electron --target ${version}`, {
                stdio: 'inherit'
            });
            console.log(`\n✅ Successfully installed binary for Electron ${version}`);
            console.log('\n🎉 Fix complete! Please restart Cursor/VS Code.');
            return;
        } catch (err) {
            console.log(`   ⚠️  No prebuilt binary available\n`);
        }
    }
    
    console.error('❌ No compatible prebuilt binaries found.');
    console.log('\nPlease try solution 2 or 3.');
}

function useElectronRebuild() {
    console.log('🔨 Using @electron/rebuild...\n');
    
    // Check if @electron/rebuild is installed
    const rebuildPath = path.join(__dirname, 'node_modules', '@electron', 'rebuild');
    if (!fs.existsSync(rebuildPath)) {
        console.log('Installing @electron/rebuild...');
        execSync('npm install --save-dev @electron/rebuild', { stdio: 'inherit' });
    }
    
    console.log('Rebuilding native modules...');
    execSync('npx @electron/rebuild', { stdio: 'inherit' });
    
    console.log('\n✅ Rebuild complete! Please restart Cursor/VS Code.');
}

function buildFromSource() {
    console.log('🏗️  Building from source...\n');
    
    if (process.platform === 'win32') {
        console.log('⚠️  Building on Windows requires:');
        console.log('   1. Visual Studio Build Tools 2022');
        console.log('   2. "Desktop development with C++" workload');
        console.log('   Download: https://visualstudio.microsoft.com/downloads/\n');
        console.log('If you have these installed, continuing...\n');
    }
    
    console.log('Rebuilding better-sqlite3 from source...');
    execSync('npm rebuild better-sqlite3 --build-from-source', { stdio: 'inherit' });
    
    console.log('\n✅ Build complete! Please restart Cursor/VS Code.');
}

function showDiagnostics() {
    console.log('🔍 Diagnostic Information:\n');
    
    console.log('System Node.js:');
    console.log(`   Version: ${process.version}`);
    console.log(`   MODULE_VERSION: ${process.versions.modules}`);
    console.log('');
    
    // Check Electron version in package.json
    try {
        const pkg = require('./package.json');
        if (pkg.devDependencies && pkg.devDependencies.electron) {
            console.log('Electron in package.json:');
            console.log(`   Version: ${pkg.devDependencies.electron}`);
            
            const electronPkg = require('./node_modules/electron/package.json');
            console.log(`   Installed: ${electronPkg.version}`);
            console.log('');
        }
    } catch (err) {
        // Ignore
    }
    
    // Check better-sqlite3
    try {
        const sqlitePkg = require('./node_modules/better-sqlite3/package.json');
        console.log('better-sqlite3:');
        console.log(`   Version: ${sqlitePkg.version}`);
        console.log('');
    } catch (err) {
        console.log('better-sqlite3: Not installed\n');
    }
    
    // Check binary
    if (fs.existsSync(binaryPath)) {
        const stats = fs.statSync(binaryPath);
        console.log('Native Binary:');
        console.log(`   Exists: Yes`);
        console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
        console.log('');
    } else {
        console.log('Native Binary: Not found\n');
    }
    
    console.log('Common Electron MODULE_VERSION mappings:');
    console.log('   Electron 39 → Node.js 23.x → MODULE_VERSION 136');
    console.log('   Electron 38 → Node.js 22.x → MODULE_VERSION 127');
    console.log('   Electron 37 → Node.js 22.x → MODULE_VERSION 127');
    console.log('   Electron 31 → Node.js 20.x → MODULE_VERSION 136');
    console.log('');
    
    console.log('To check your Cursor/VS Code version:');
    console.log('   1. Open Cursor/VS Code');
    console.log('   2. Help → About');
    console.log('   3. Look for "Electron" version');
    console.log('');
    
    console.log('Recommended next steps:');
    console.log('   1. Run this script again and choose solution 1');
    console.log('   2. Or run: npm run setup');
    console.log('   3. Then run: npm run verify');
}

