#!/usr/bin/env node
/**
 * Setup script for better-sqlite3 Electron binaries
 * Run this after npm install if you get "Could not locate the bindings file" errors
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Setting up better-sqlite3 for Electron...');

try {
    // Get Electron version from package.json
    const electronPkg = require('./node_modules/electron/package.json');
    const electronVersion = electronPkg.version;
    
    console.log(`Detected Electron version: ${electronVersion}`);
    
    // Change to better-sqlite3 directory
    const sqliteDir = path.join(__dirname, 'node_modules', 'better-sqlite3');
    
    if (!fs.existsSync(sqliteDir)) {
        console.error('Error: better-sqlite3 not found in node_modules');
        console.log('Please run: npm install');
        process.exit(1);
    }
    
    process.chdir(sqliteDir);
    
    // Try multiple Electron versions (Cursor/VSCode might use different versions)
    const versionsToTry = [
        '37.0.0',        // Cursor common version (NODE_MODULE_VERSION 136)
        '38.0.0',        // Electron 38 (NODE_MODULE_VERSION 136)
        electronVersion, // From package.json (might be different)
        '36.0.0',        // Electron 36 (NODE_MODULE_VERSION 135)
        '33.0.0',        // Electron 33 (NODE_MODULE_VERSION 130)
    ];
    
    let success = false;
    
    for (const version of versionsToTry) {
        try {
            console.log(`Trying Electron ${version}...`);
            execSync(`npx prebuild-install --runtime electron --target ${version}`, {
                stdio: 'inherit'
            });
            success = true;
            console.log(`\n✅ Successfully installed binary for Electron ${version}`);
            break;
        } catch (err) {
            console.log(`  ⚠️  No prebuilt binary available for Electron ${version}`);
            continue;
        }
    }
    
    if (!success) {
        throw new Error('No compatible prebuilt binaries found');
    }
    
    console.log('\n✅ Setup complete! The extension should now work in Cursor/VSCode.');
    
} catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\nIf prebuilt binaries are not available, you need to:');
    console.log('1. Install Visual Studio Build Tools');
    console.log('   Download: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022');
    console.log('2. Select "Desktop development with C++" workload during installation');
    console.log('3. Run: npm install -g node-gyp');
    console.log('4. Run: npm rebuild better-sqlite3 --build-from-source');
    process.exit(1);
}

