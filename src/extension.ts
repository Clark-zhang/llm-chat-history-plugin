/**
 * 扩展主入口文件
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseWatcher } from './database-watcher';
import { createTranslator } from './i18n';

/**
 * 扩展激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('LLM Chat History Extension activated');
    
    // 获取配置
    const config = vscode.workspace.getConfiguration('chatHistory');
    const autoSave = config.get<boolean>('autoSave', true);
    const localeSetting = config.get<string>('locale', 'auto') as any;
    const t = createTranslator(localeSetting);
    
    if (!autoSave) {
        console.log('Auto-save disabled');
        return;
    }
    
    // 获取数据库路径
    const dbPath = getCursorDatabasePath();
    
    // 检查数据库是否存在
    if (!fs.existsSync(dbPath)) {
        console.warn('Cursor database not found:', dbPath);
        vscode.window.showWarningMessage(
            t('warning.dbNotFound')
        );
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

    // 启动监听
    const watcher = new DatabaseWatcher(dbPath, workspaceRoot, localeSetting);
    watcher.start();
    
    // 注册命令：手动保存
    const saveCommand = vscode.commands.registerCommand(
        'chatHistory.saveNow',
        () => {
            watcher.syncNow();
            vscode.window.showInformationMessage(t('info.saved'));
        }
    );
    
    context.subscriptions.push(saveCommand, {
        dispose: () => watcher.stop()
    });
    
    console.log('LLM Chat History Extension ready');
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


