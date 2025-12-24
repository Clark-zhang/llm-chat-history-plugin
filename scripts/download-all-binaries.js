#!/usr/bin/env node
/**
 * Download all required SQLite3 binaries for different Electron versions
 * This ensures compatibility across VS Code and Cursor versions
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Downloading SQLite3 binaries for multiple Electron versions...');

// Target Electron versions for different IDEs
const targetVersions = [
    '37.0.0', // Cursor 2.x (Electron 37.x)
    '38.0.0', // VS Code intermediate
    '39.0.0', // VS Code 1.93+ (Electron 39.x)
    '40.0.0', // Future VS Code versions
    '41.0.0', // Future versions
];

const sqlitePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const binaryDir = path.join(sqlitePath, 'build', 'Release');

// Ensure binary directory exists
if (!fs.existsSync(binaryDir)) {
    fs.mkdirSync(binaryDir, { recursive: true });
}

console.log(`Binary directory: ${binaryDir}`);

for (const version of targetVersions) {
    try {
        console.log(`\n📦 Downloading binary for Electron ${version}...`);

        // Change to better-sqlite3 directory
        const originalCwd = process.cwd();
        process.chdir(sqlitePath);

        try {
            // Try to download using prebuild-install
            const prebuildCmd = process.platform === 'win32'
                ? `"${path.join('..', '..', 'node_modules', '.bin', 'prebuild-install.cmd')}" --runtime electron --target ${version}`
                : `"${path.join('..', '..', 'node_modules', '.bin', 'prebuild-install')}" --runtime electron --target ${version}`;

            execSync(prebuildCmd, { stdio: 'pipe' });

            // Check if binary was downloaded
            const binaryPath = path.join(binaryDir, `better_sqlite3-${version}.node`);
            if (fs.existsSync(path.join(binaryDir, 'better_sqlite3.node'))) {
                // Rename the downloaded binary to include version
                fs.renameSync(
                    path.join(binaryDir, 'better_sqlite3.node'),
                    binaryPath
                );
                console.log(`✅ Successfully downloaded binary for Electron ${version}`);
            } else {
                console.log(`⚠️  No binary downloaded for Electron ${version}`);
            }

        } catch (error) {
            console.log(`⚠️  Failed to download binary for Electron ${version}: ${error.message}`);
        } finally {
            process.chdir(originalCwd);
        }

    } catch (error) {
        console.log(`❌ Error processing Electron ${version}: ${error.message}`);
    }
}

// List all downloaded binaries
console.log('\n📋 Downloaded binaries:');
const binaries = fs.readdirSync(binaryDir).filter(file => file.endsWith('.node'));
binaries.forEach(binary => {
    const stats = fs.statSync(path.join(binaryDir, binary));
    console.log(`  ${binary}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
});

const totalSize = binaries.reduce((total, binary) => {
    const stats = fs.statSync(path.join(binaryDir, binary));
    return total + stats.size;
}, 0);

console.log(`\n📊 Total binary size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`📦 Plugin package will increase by approximately ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

// Create a default fallback
if (binaries.length > 0 && !fs.existsSync(path.join(binaryDir, 'better_sqlite3.node'))) {
    // Copy the first available binary as default fallback
    const defaultBinary = binaries[0];
    fs.copyFileSync(
        path.join(binaryDir, defaultBinary),
        path.join(binaryDir, 'better_sqlite3.node')
    );
    console.log(`\n📋 Created default fallback: ${defaultBinary} -> better_sqlite3.node`);
}
