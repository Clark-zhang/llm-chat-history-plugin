/**
 * SQLite loader with automatic version detection and download
 * Ensures better-sqlite3 works across different Electron versions
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export class SqliteLoader {
    private extensionPath: string;
    private sqlitePath: string;
    private binaryPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.sqlitePath = path.join(extensionPath, 'node_modules', 'better-sqlite3');
        this.binaryPath = path.join(this.sqlitePath, 'build', 'Release', 'better_sqlite3.node');
    }

    /**
     * Ensure better-sqlite3 is properly loaded
     * Downloads correct binary if needed
     */
    async ensureLoaded(): Promise<boolean> {
        // Check if binary exists and is loadable
        if (await this.testBinary()) {
            console.log('✅ better-sqlite3 binary is already compatible');
            return true;
        }

        // Binary doesn't exist or is incompatible, download correct version
        console.log('⚠️  better-sqlite3 binary needs to be downloaded/updated');
        
        // Show progress to user
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Setting up database module...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Detecting environment...' });
                const electronVersion = this.detectElectronVersion();
                console.log(`Detected Electron version: ${electronVersion}`);

                progress.report({ message: 'Downloading compatible binary...' });
                await this.downloadBinary(electronVersion);

                progress.report({ message: 'Verifying installation...' });
                const success = await this.testBinary();

                if (success) {
                    vscode.window.showInformationMessage('✅ Database module setup complete!');
                    return true;
                } else {
                    throw new Error('Binary verification failed');
                }
            } catch (error) {
                console.error('Failed to setup better-sqlite3:', error);
                vscode.window.showErrorMessage(
                    'Failed to setup database module. The extension may not work correctly.',
                    'View Logs'
                ).then(selection => {
                    if (selection === 'View Logs') {
                        vscode.commands.executeCommand('workbench.action.toggleDevTools');
                    }
                });
                return false;
            }
        });
    }

    /**
     * Test if current binary is loadable
     */
    private async testBinary(): Promise<boolean> {
        if (!fs.existsSync(this.binaryPath)) {
            console.log('Binary does not exist:', this.binaryPath);
            return false;
        }

        try {
            // Try to load the module
            const Database = require('better-sqlite3');
            // Try to create an in-memory database
            const db = new Database(':memory:');
            db.close();
            return true;
        } catch (error) {
            console.log('Binary exists but is not compatible:', error);
            return false;
        }
    }

    /**
     * Detect VS Code/Cursor Electron version
     */
    private detectElectronVersion(): string {
        // Get Electron version from process.versions
        const electronVersion = process.versions.electron;
        
        if (!electronVersion) {
            console.warn('Could not detect Electron version, using fallback');
            return '37.0.0'; // Fallback to common version
        }

        // Extract major version (e.g., "37.7.0" -> "37")
        const majorVersion = electronVersion.split('.')[0];
        return `${majorVersion}.0.0`;
    }

    /**
     * Download compatible binary for the current Electron version
     */
    private async downloadBinary(electronVersion: string): Promise<void> {
        // List of Electron versions to try (降序排列，优先尝试较新版本)
        const versionsToTry = [
            electronVersion,  // Detected version
            '36.0.0',        // Electron 36
            '35.0.0',        // Electron 35
            '34.0.0',        // Electron 34
            '33.0.0',        // Electron 33
            '32.0.0',        // Electron 32
            '31.0.0',        // Electron 31
            '30.0.0',        // Electron 30
        ];

        // Change to better-sqlite3 directory
        const originalCwd = process.cwd();
        process.chdir(this.sqlitePath);

        try {
            // 首先尝试预编译的二进制文件
            for (const version of versionsToTry) {
                try {
                    console.log(`Trying prebuilt binary for Electron ${version}...`);
                    execSync(
                        `npx prebuild-install --runtime electron --target ${version}`,
                        { stdio: 'pipe' }
                    );
                    console.log(`✅ Successfully downloaded binary for Electron ${version}`);
                    return;
                } catch (err) {
                    console.log(`  ⚠️  No prebuilt binary for Electron ${version}`);
                    continue;
                }
            }

            // 如果没有找到预编译的二进制文件，尝试从源代码编译
            console.log('No prebuilt binaries available, attempting to compile from source...');
            console.log('This may take a few minutes and requires build tools to be installed.');
            
            try {
                execSync(
                    'npm rebuild better-sqlite3 --build-from-source',
                    { stdio: 'inherit' }
                );
                console.log('✅ Successfully compiled better-sqlite3 from source');
                return;
            } catch (compileError) {
                console.error('Failed to compile from source:', compileError);
                throw new Error(
                    'No compatible prebuilt binaries found and compilation from source failed. ' +
                    'Please ensure you have the required build tools installed:\n' +
                    '  - Windows: npm install --global windows-build-tools\n' +
                    '  - macOS: Xcode Command Line Tools\n' +
                    '  - Linux: build-essential'
                );
            }
        } finally {
            process.chdir(originalCwd);
        }
    }

    /**
     * Get better-sqlite3 module
     * Only call after ensureLoaded() succeeds
     */
    getDatabase(): any {
        return require('better-sqlite3');
    }
}

