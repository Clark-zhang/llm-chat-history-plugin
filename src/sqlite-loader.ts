/**
 * SQLite loader with automatic version detection and download
 * Ensures better-sqlite3 works across different Electron versions
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { createTranslator, resolveLocale } from './i18n';

export class SqliteLoader {
    private extensionPath: string;
    private sqlitePath: string;
    private binaryPath: string;
    private translator: ReturnType<typeof createTranslator>;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.sqlitePath = path.join(extensionPath, 'node_modules', 'better-sqlite3');
        this.binaryPath = path.join(this.sqlitePath, 'build', 'Release', 'better_sqlite3.node');
        this.translator = createTranslator(vscode.workspace.getConfiguration('chatHistory').get('locale'));
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
                progress.report({ message: this.translator('info.sqliteDetectingIDE') });
                const ideType = this.detectIDEType();
                const electronVersion = this.detectElectronVersion();

                const ideName = ideType === 'cursor' ? 'Cursor' : ideType === 'vscode' ? 'VS Code' : 'Unknown IDE';
                console.log(this.translator('info.sqliteDetected', { ide: ideName, version: electronVersion }));

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
            // If binary exists but is incompatible, we need to download a new one
            // Return false so ensureLoaded will call downloadBinary
            return false;
        }
    }

    /**
     * Detect current IDE type (VS Code or Cursor)
     */
    private detectIDEType(): 'vscode' | 'cursor' | 'unknown' {
        // Check environment variables
        if (process.env.CURSOR_PID || process.env.CURSOR_DATA_FOLDER) {
            return 'cursor';
        }

        // Check process arguments and working directory
        const cwd = process.cwd();
        const execPath = process.execPath;

        if (execPath && execPath.toLowerCase().includes('cursor')) {
            return 'cursor';
        }

        if (cwd && cwd.toLowerCase().includes('cursor')) {
            return 'cursor';
        }

        // Check VS Code specific variables
        if (process.env.VSCODE_CWD || process.env.VSCODE_PID) {
            return 'vscode';
        }

        // Default to VS Code if uncertain
        return 'vscode';
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
     * Get recommended Electron versions for current IDE
     */
    private getRecommendedVersions(electronVersion: string): string[] {
        const ideType = this.detectIDEType();
        const majorVersion = parseInt(electronVersion.split('.')[0]);

        console.log(`Detected IDE: ${ideType}, Electron version: ${electronVersion}`);

        // IDE-specific version preferences (minimal set: only 37 and 39)
        if (ideType === 'cursor') {
            // Cursor 2.x typically uses Electron 37.x
            return [
                '37.0.0',        // Electron 37 (Cursor 2.x stable)
                '39.0.0',        // Electron 39 (fallback)
            ];
        } else {
            // VS Code versions (typically newer)
            return [
                '39.0.0',        // Electron 39 (VS Code 1.93+)
                '37.0.0',        // Electron 37 (fallback)
            ];
        }
    }

    /**
     * Try to use pre-packaged binary for the current Electron version and platform
     */
    private async downloadBinary(electronVersion: string): Promise<void> {
        // Get IDE-specific recommended versions
        const versionsToTry = this.getRecommendedVersions(electronVersion);
        const platform = process.platform; // 'win32', 'darwin', 'linux'
        const arch = process.arch; // 'x64', 'arm64', 'ia32'

        const binaryDir = path.join(this.sqlitePath, 'build', 'Release');
        const targetPath = path.join(binaryDir, 'better_sqlite3.node');

        console.log(`Looking for binary: platform=${platform}, arch=${arch}`);

        // Try to find a matching binary for current platform/arch and electron version
        for (const version of versionsToTry) {
            // New naming convention: better_sqlite3-electron-{version}-{platform}-{arch}.node
            const binaryName = `better_sqlite3-electron-${version}-${platform}-${arch}.node`;
            const binaryPath = path.join(binaryDir, binaryName);

            if (fs.existsSync(binaryPath)) {
                console.log(`✅ Using pre-packaged binary: ${binaryName}`);
                fs.copyFileSync(binaryPath, targetPath);
                return;
            }
        }

        // Fallback: try old naming convention (backwards compatibility)
        for (const version of versionsToTry) {
            const oldBinaryName = `better_sqlite3-${version}.node`;
            const oldBinaryPath = path.join(binaryDir, oldBinaryName);

            if (fs.existsSync(oldBinaryPath)) {
                console.log(`✅ Using legacy pre-packaged binary: ${oldBinaryName}`);
                fs.copyFileSync(oldBinaryPath, targetPath);
                return;
            }
        }

        // Try to find ANY binary for the current platform/arch
        if (fs.existsSync(binaryDir)) {
            const files = fs.readdirSync(binaryDir);
            const platformBinaries = files.filter(f =>
                f.endsWith('.node') &&
                f.includes(`-${platform}-${arch}.node`)
            ).sort().reverse(); // Prefer newer versions

            if (platformBinaries.length > 0) {
                const bestMatch = platformBinaries[0];
                console.log(`✅ Using best available platform binary: ${bestMatch}`);
                fs.copyFileSync(path.join(binaryDir, bestMatch), targetPath);
                return;
            }
        }

        console.log('No pre-packaged binaries found for current platform/architecture');

        // If the default binary exists, check if it's compatible
        if (fs.existsSync(targetPath)) {
            console.log('Using existing default binary as fallback');
            return;
        }

        throw new Error(
            `No compatible SQLite3 binary found for ${platform}-${arch}. ` +
            `Please reinstall the extension or report this issue.`
        );
    }

    /**
     * Create a user-friendly error message using i18n
     */
    private createUserFriendlyError(electronVersion: string): Error {
        const platform = process.platform;
        const ideType = this.detectIDEType();
        const ideName = ideType === 'cursor' ? 'Cursor' : 'VS Code';

        let instructions = '';

        if (platform === 'win32') {
            instructions = this.translator('error.sqliteWindowsInstructions');
        } else if (platform === 'darwin') {
            instructions = this.translator('error.sqliteMacInstructions');
        } else {
            instructions = this.translator('error.sqliteLinuxInstructions');
        }

        // 自定义错误消息，根据 IDE 类型调整
        const binaryIncompatibleMsg = ideType === 'cursor'
            ? `这是因为您的 ${ideName} 版本 (${electronVersion}) 需要较新的 SQLite 二进制文件，但扩展包中包含的是旧版本。`
            : this.translator('error.sqliteBinaryIncompatible', { version: electronVersion });

        const message = [
            this.translator('error.sqliteInitFailed'),
            '',
            binaryIncompatibleMsg,
            '',
            this.translator('error.sqliteCompilationFailed'),
            this.translator('error.sqliteBuildToolsRequired'),
            '',
            this.translator('error.sqliteSolutionTitle'),
            instructions,
            '',
            this.translator('error.sqliteAlternative')
        ].join('\n');

        return new Error(message);
    }

    /**
     * Get better-sqlite3 module
     * Only call after ensureLoaded() succeeds
     */
    getDatabase(): any {
        return require('better-sqlite3');
    }
}

