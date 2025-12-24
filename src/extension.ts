/**
 * 扩展主入口文件
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseWatcher } from './cursor-database-watcher';
import { ClineWatcher } from './cline-watcher';
import { getClineStoragePath } from './cline-reader';
import { CodexWatcher } from './codex-watcher';
import { getCodexStoragePath } from './codex-reader';
import { BlackboxWatcher } from './blackboxai-watcher';
import { getBlackboxStoragePath } from './blackboxai-reader';
import { CodeGeeXWatcher } from './codegeex-watcher';
import { getCodeGeeXStoragePath } from './codegeex-reader';
import { KiloWatcher } from './kilo-watcher';
import { getKiloStoragePath } from './kilo-reader';
import { createTranslator } from './i18n';
import { SqliteLoader } from './sqlite-loader';

/**
 * 扩展激活时调用
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('LLM Chat History Extension activated');
    
    // 首先确保 better-sqlite3 已正确加载
    const sqliteLoader = new SqliteLoader(context.extensionPath);
    const sqliteReady = await sqliteLoader.ensureLoaded();
    
    if (!sqliteReady) {
        console.error('Failed to load better-sqlite3, extension will not function properly');
        vscode.window.showErrorMessage(
            'LLM Chat History: Failed to initialize database module. Please check logs.',
            'View Logs'
        ).then(selection => {
            if (selection === 'View Logs') {
                vscode.commands.executeCommand('workbench.action.toggleDevTools');
            }
        });
        // Continue activation but without database functionality
    }
    
    // 获取配置
    const config = vscode.workspace.getConfiguration('chatHistory');
    const autoSave = config.get<boolean>('autoSave', true);
    const localeSetting = config.get<string>('locale', 'auto') as any;
    const t = createTranslator(localeSetting);
    
    if (!autoSave) {
        console.log('Auto-save disabled');
        return;
    }
    
    // 检查是否有打开的工作区
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        console.warn('No workspace folder open');
        return;
    }
    
    // 工作区路径（使用第一个工作区）
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        console.warn('No workspace folder path resolved');
        return;
    }

    // 存储启动的监听器
    const watchers: Array<{ stop: () => void; syncNow: () => void }> = [];
    
    // 尝试启动 Cursor 监听
    const cursorDbPath = getCursorDatabasePath();
    if (fs.existsSync(cursorDbPath)) {
        console.log('Cursor database found, starting Cursor watcher');
        const cursorWatcher = new DatabaseWatcher(cursorDbPath, workspaceRoot, localeSetting);
        cursorWatcher.start();
        watchers.push(cursorWatcher);
    } else {
        console.log('Cursor database not found:', cursorDbPath);
    }
    
    // 尝试启动 Cline 监听
    const clineStoragePath = getClineStoragePath();
    if (fs.existsSync(clineStoragePath)) {
        console.log('[Cline] Storage found, starting watcher');
        const clineWatcher = new ClineWatcher(clineStoragePath, workspaceRoot, localeSetting);
        clineWatcher.start();
        watchers.push(clineWatcher);
    } else {
        console.log('[Cline] Storage not found');
    }

    // 尝试启动 Codex (GitHub Copilot Chat) 监听
    const codexStoragePath = getCodexStoragePath();
    if (fs.existsSync(codexStoragePath)) {
        console.log('Codex storage found, starting Codex watcher');
        const codexWatcher = new CodexWatcher(codexStoragePath, workspaceRoot, localeSetting);
        codexWatcher.start();
        watchers.push(codexWatcher);
    } else {
        console.log('Codex storage not found:', codexStoragePath);
    }

    // 尝试启动 Blackbox AI 监听
    const blackboxStoragePath = getBlackboxStoragePath();
    if (fs.existsSync(blackboxStoragePath)) {
        console.log('Blackbox AI storage found, starting Blackbox AI watcher');
        const blackboxWatcher = new BlackboxWatcher(blackboxStoragePath, workspaceRoot, localeSetting);
        blackboxWatcher.start();
        watchers.push(blackboxWatcher);
    } else {
        console.log('Blackbox AI storage not found:', blackboxStoragePath);
    }

    // 尝试启动 CodeGeeX 监听
    const codegeexStoragePath = getCodeGeeXStoragePath();
    if (fs.existsSync(codegeexStoragePath)) {
        console.log('CodeGeeX storage found, starting CodeGeeX watcher');
        const codegeexWatcher = new CodeGeeXWatcher(codegeexStoragePath, workspaceRoot, localeSetting);
        codegeexWatcher.start();
        watchers.push(codegeexWatcher);
    } else {
        console.log('CodeGeeX storage not found:', codegeexStoragePath);
    }

    // 尝试启动 Kilo 监听
    const kiloStoragePath = getKiloStoragePath();
    if (fs.existsSync(kiloStoragePath)) {
        console.log('Kilo storage found, starting Kilo watcher');
        const kiloWatcher = new KiloWatcher(kiloStoragePath, workspaceRoot, localeSetting);
        kiloWatcher.start();
        watchers.push(kiloWatcher);
    } else {
        console.log('Kilo storage not found:', kiloStoragePath);
    }
    
    // 如果没有找到任何聊天历史
    if (watchers.length === 0) {
        console.warn('No chat history sources found (Cursor, Cline, Codex, Blackbox AI, CodeGeeX, or Kilo)');
        vscode.window.showWarningMessage(
            'LLM Chat History: No supported AI plugins found. Please install and use Cursor, Cline, GitHub Copilot Chat, Blackbox AI, CodeGeeX, or Kilo.'
        );
        return;
    }
    
    // 注册命令：手动保存
    const saveCommand = vscode.commands.registerCommand(
        'chatHistory.saveNow',
        () => {
            for (const watcher of watchers) {
                watcher.syncNow();
            }
            vscode.window.showInformationMessage(t('info.saved'));
        }
    );
    
    context.subscriptions.push(saveCommand, {
        dispose: () => {
            for (const watcher of watchers) {
                watcher.stop();
            }
        }
    });
    
    console.log(`LLM Chat History Extension ready (${watchers.length} source(s))`);
}

/**
 * 扩展停用时调用
 */
export function deactivate() {
    console.log('LLM Chat History Extension deactivated');
}

/**
 * 获取 Cursor 数据库路径
 */
function getCursorDatabasePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    
    if (platform === 'win32') {
        return path.join(
            homeDir,
            'AppData/Roaming/Cursor/User/globalStorage/state.vscdb'
        );
    } else if (platform === 'darwin') {
        return path.join(
            homeDir,
            'Library/Application Support/Cursor/User/globalStorage/state.vscdb'
        );
    } else {
        // Linux
        return path.join(
            homeDir,
            '.config/Cursor/User/globalStorage/state.vscdb'
        );
    }
}


