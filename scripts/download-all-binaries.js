#!/usr/bin/env node
/**
 * Download all required SQLite3 binaries for different Electron versions,
 * platforms, and architectures.
 * This ensures compatibility across VS Code and Cursor on all supported systems.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Downloading SQLite3 binaries for multiple platforms and Electron versions...');

// Target Electron versions for different IDEs (minimal set for smaller package size)
const targetVersions = [
    '37.0.0', // Cursor 2.x (Electron 37.x)
    '39.0.0', // VS Code 1.93+ (Electron 39.x)
];

// All supported platforms and architectures (64-bit only)
const platforms = [
    { platform: 'win32', arch: 'x64' },
    { platform: 'darwin', arch: 'x64' },
    { platform: 'darwin', arch: 'arm64' },
    { platform: 'linux', arch: 'x64' },
    { platform: 'linux', arch: 'arm64' },
];

const sqlitePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const binaryDir = path.join(sqlitePath, 'build', 'Release');

// Ensure binary directory exists
if (!fs.existsSync(binaryDir)) {
    fs.mkdirSync(binaryDir, { recursive: true });
}

console.log(`Binary directory: ${binaryDir}`);

let successCount = 0;
let failCount = 0;

for (const { platform, arch } of platforms) {
    for (const version of targetVersions) {
        const binaryName = `better_sqlite3-electron-${version}-${platform}-${arch}.node`;
        const binaryPath = path.join(binaryDir, binaryName);

        // Skip if already downloaded
        if (fs.existsSync(binaryPath)) {
            console.log(`⏭️  Skipping ${binaryName} (already exists)`);
            successCount++;
            continue;
        }

        try {
            console.log(`\n📦 Downloading binary for Electron ${version} ${platform}-${arch}...`);

            // Change to better-sqlite3 directory
            const originalCwd = process.cwd();
            process.chdir(sqlitePath);

            try {
                // Use prebuild-install with platform and arch flags
                const prebuildBin = process.platform === 'win32'
                    ? path.join('..', '.bin', 'prebuild-install.cmd')
                    : path.join('..', '.bin', 'prebuild-install');

                const prebuildCmd = `"${prebuildBin}" --runtime electron --target ${version} --platform ${platform} --arch ${arch} --force`;

                execSync(prebuildCmd, { stdio: 'pipe', timeout: 60000 });

                // Check if binary was downloaded
                const downloadedPath = path.join(binaryDir, 'better_sqlite3.node');
                if (fs.existsSync(downloadedPath)) {
                    // Rename the downloaded binary to include version/platform/arch
                    fs.renameSync(downloadedPath, binaryPath);
                    console.log(`✅ Successfully downloaded: ${binaryName}`);
                    successCount++;
                } else {
                    console.log(`⚠️  No binary downloaded for Electron ${version} ${platform}-${arch}`);
                    failCount++;
                }

            } catch (error) {
                console.log(`⚠️  Failed to download for Electron ${version} ${platform}-${arch}: ${error.message}`);
                failCount++;
            } finally {
                process.chdir(originalCwd);
            }

        } catch (error) {
            console.log(`❌ Error processing Electron ${version} ${platform}-${arch}: ${error.message}`);
            failCount++;
        }
    }
}

// List all downloaded binaries
console.log('\n📋 Downloaded binaries:');
const binaries = fs.readdirSync(binaryDir).filter(file => file.endsWith('.node'));

// Group by platform
const byPlatform = {};
binaries.forEach(binary => {
    const stats = fs.statSync(path.join(binaryDir, binary));
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    // Extract platform from filename
    let platform = 'unknown';
    if (binary.includes('win32')) platform = 'Windows';
    else if (binary.includes('darwin')) platform = 'macOS';
    else if (binary.includes('linux')) platform = 'Linux';
    else platform = 'Default';

    if (!byPlatform[platform]) byPlatform[platform] = [];
    byPlatform[platform].push({ name: binary, size: sizeMB });
});

Object.entries(byPlatform).forEach(([platform, files]) => {
    console.log(`\n  ${platform}:`);
    files.forEach(({ name, size }) => {
        console.log(`    ${name}: ${size} MB`);
    });
});

const totalSize = binaries.reduce((total, binary) => {
    const stats = fs.statSync(path.join(binaryDir, binary));
    return total + stats.size;
}, 0);

console.log(`\n📊 Summary:`);
console.log(`  Total binaries: ${binaries.length}`);
console.log(`  Downloaded: ${successCount}, Failed: ${failCount}`);
console.log(`  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

// Create a platform-specific default fallback for current platform
const currentPlatform = process.platform;
const currentArch = process.arch;
const defaultBinaryPath = path.join(binaryDir, 'better_sqlite3.node');

// Find the best matching binary for the current platform
const matchingBinaries = binaries.filter(b =>
    b.includes(`-${currentPlatform}-${currentArch}.node`)
).sort().reverse(); // Sort descending to get newest version first

if (matchingBinaries.length > 0 && !fs.existsSync(defaultBinaryPath)) {
    const bestMatch = matchingBinaries[0];
    fs.copyFileSync(
        path.join(binaryDir, bestMatch),
        defaultBinaryPath
    );
    console.log(`\n📋 Created default fallback for current platform: ${bestMatch} -> better_sqlite3.node`);
} else if (binaries.length > 0 && !fs.existsSync(defaultBinaryPath)) {
    // If no matching binary for current platform, use the first available as fallback
    const firstBinary = binaries[0];
    fs.copyFileSync(
        path.join(binaryDir, firstBinary),
        defaultBinaryPath
    );
    console.log(`\n⚠️  Created fallback from non-matching binary: ${firstBinary} -> better_sqlite3.node`);
}

console.log('\n✅ Binary download complete!');
console.log('\n⚠️  Note: The extension package will be larger due to multiple platform binaries.');
console.log('   This is necessary to ensure cross-platform compatibility.');
