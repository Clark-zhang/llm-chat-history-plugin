#!/usr/bin/env node
/**
 * Verification script to check if better-sqlite3 is properly installed
 * Run this to verify the setup before launching the extension
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying better-sqlite3 installation...\n');

// Display system information
console.log('📊 System Information:');
console.log(`   Node.js version: ${process.version}`);
console.log(`   Platform: ${process.platform} ${process.arch}`);
console.log(`   NODE_MODULE_VERSION: ${process.versions.modules}`);
console.log('');

const checks = [
    {
        name: 'Package installed',
        check: () => fs.existsSync(path.join(__dirname, 'node_modules', 'better-sqlite3')),
        success: '✅ better-sqlite3 package found',
        failure: '❌ better-sqlite3 package not found - run: npm install'
    },
    {
        name: 'Binary exists',
        check: () => {
            const binaryPath = path.join(__dirname, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
            const exists = fs.existsSync(binaryPath);
            if (exists) {
                const stats = fs.statSync(binaryPath);
                console.log(`   Binary path: ${binaryPath}`);
                console.log(`   Binary size: ${(stats.size / 1024).toFixed(2)} KB`);
                console.log(`   Last modified: ${stats.mtime.toISOString()}`);
            }
            return exists;
        },
        success: '✅ Native binary found',
        failure: '❌ Native binary not found - run: npm run setup'
    },
    {
        name: 'Package version',
        check: () => {
            try {
                const pkg = require('./node_modules/better-sqlite3/package.json');
                const version = pkg.version;
                console.log(`   Version: ${version}`);
                return version.startsWith('12.') || version.startsWith('13.');
            } catch (err) {
                return false;
            }
        },
        success: '✅ Using compatible version (12.x+)',
        failure: '⚠️  Old version detected - run: npm install better-sqlite3@latest'
    },
    {
        name: 'TypeScript compiled',
        check: () => fs.existsSync(path.join(__dirname, 'dist', 'extension.js')),
        success: '✅ Extension compiled',
        failure: '⚠️  Extension not compiled - run: npm run compile'
    }
];

let allPassed = true;

checks.forEach(({ name, check, success, failure }) => {
    try {
        if (check()) {
            console.log(success);
        } else {
            console.log(failure);
            allPassed = false;
        }
    } catch (err) {
        console.log(failure);
        console.log(`   Error: ${err.message}`);
        allPassed = false;
    }
});

console.log('\n' + '='.repeat(60));

if (allPassed) {
    console.log('✅ All checks passed! The extension is ready to use.');
    console.log('\nNext steps:');
    console.log('1. Press F5 in VSCode to launch the extension');
    console.log('2. Open a workspace in the development window');
    console.log('3. Have conversations in Cursor');
console.log('4. Check .llm-chat-history/ for saved conversations');
} else {
    console.log('❌ Some checks failed. Please fix the issues above.');
    console.log('\nQuick fixes:');
    console.log('- Run: npm install');
    console.log('- Run: npm run setup');
    console.log('- Run: npm run compile');
}

console.log('='.repeat(60));

process.exit(allPassed ? 0 : 1);

