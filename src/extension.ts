/**
 * 扩展主入口文件
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseWatcher } from './agents/cursor/cursor-database-watcher';
import { ClineWatcher } from './agents/cline/cline-watcher';
import { getClineStoragePath } from './agents/cline/cline-reader';
import { CodexWatcher } from './agents/codex/codex-watcher';
import { getCodexStoragePath } from './agents/codex/codex-reader';
import { BlackboxWatcher } from './agents/blackboxai/blackboxai-watcher';
import { getBlackboxStoragePath } from './agents/blackboxai/blackboxai-reader';
import { CodeGeeXWatcher } from './agents/codegeex/codegeex-watcher';
import { getCodeGeeXStoragePath } from './agents/codegeex/codegeex-reader';
import { KiloWatcher } from './agents/kilo/kilo-watcher';
import { getKiloStoragePath } from './agents/kilo/kilo-reader';
import { createTranslator } from './i18n';
import { SqliteLoader } from './sqlite-loader';
import { showSearchInterface } from './chat-search';
import { CloudSyncManager } from './cloud/cloud-sync';
import { AutomationStatusProvider, AccountStatusProvider } from './sidebar/status-view';

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
        const cursorWatcher = new DatabaseWatcher(cursorDbPath, workspaceRoot, localeSetting, context.extensionPath);
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

    // 注册命令：搜索聊天历史
    const searchCommand = vscode.commands.registerCommand(
        'chatHistory.search',
        () => {
            showSearchInterface(context);
        }
    );

    // 初始化云端同步管理器
    const cloudSync = new CloudSyncManager(context, localeSetting);

    // 初始化侧边栏视图
    const automationStatusProvider = new AutomationStatusProvider(cloudSync, t);
    const accountStatusProvider = new AccountStatusProvider(cloudSync, t);

    // 注册树视图
    const automationTreeView = vscode.window.createTreeView('chatHistoryStatus', {
        treeDataProvider: automationStatusProvider,
        showCollapseAll: false
    });

    const accountTreeView = vscode.window.createTreeView('chatHistoryAccount', {
        treeDataProvider: accountStatusProvider,
        showCollapseAll: false
    });

    context.subscriptions.push(automationTreeView, accountTreeView);

    // 导出到全局供其他模块使用
    (global as any).__automationStatusProvider = automationStatusProvider;
    (global as any).__accountStatusProvider = accountStatusProvider;

    // 注册命令：云端登录
    const cloudLoginCommand = vscode.commands.registerCommand(
        'chatHistory.cloudLogin',
        async () => {
            if (cloudSync.isLoggedIn()) {
                // 已登录，显示选项
                vscode.window.showQuickPick([
                    { label: t('cloud.logout'), action: 'logout' },
                    { label: 'Sync Now', action: 'sync' }
                ], {
                    placeHolder: t('cloud.loggedInAs', { username: cloudSync.getUser()?.username || '' })
                }).then(async (selected) => {
                    if (selected?.action === 'logout') {
                        await cloudSync.logout();
                    } else if (selected?.action === 'sync') {
                        vscode.commands.executeCommand('chatHistory.cloudSync');
                    }
                });
            } else {
                // 未登录，显示选择登录或注册
                const choice = await vscode.window.showQuickPick([
                    { label: '$(sign-in) Login', description: 'Login to your existing account', action: 'login' },
                    { label: '$(person-add) Register', description: 'Create a new account', action: 'register' }
                ], {
                    placeHolder: 'Login or register to enable cloud sync'
                });

                if (choice) {
                    await cloudSync.loginWithBrowser(choice.action as 'login' | 'register');
                }
            }
        }
    );

    // 注册命令：云端登出
    const cloudLogoutCommand = vscode.commands.registerCommand(
        'chatHistory.cloudLogout',
        async () => {
            if (cloudSync.isLoggedIn()) {
                await cloudSync.logout();
                // 刷新侧边栏
                automationStatusProvider.refresh();
                accountStatusProvider.refresh();
            }
        }
    );

    // 注册命令：查看云同步状态
    const showCloudStatusCommand = vscode.commands.registerCommand(
        'chatHistory.showCloudStatus',
        async () => {
            const statusInfo = cloudSync.getStatusInfo();
            
            const actions: string[] = [];
            if (!cloudSync.isLoggedIn()) {
                actions.push('Login', 'Enable Cloud Sync');
            } else if (!cloudSync.isEnabled()) {
                actions.push('Enable Cloud Sync', 'Logout');
            } else {
                actions.push('Sync Now', 'Check Connection', 'Logout');
            }

            const choice = await vscode.window.showInformationMessage(
                `${statusInfo.status}\n\n${statusInfo.message}\n\n${statusInfo.details}`,
                ...actions
            );

            if (choice === 'Login') {
                await cloudSync.loginWithBrowser('login');
            } else if (choice === 'Enable Cloud Sync') {
                await vscode.workspace.getConfiguration('chatHistory').update('cloudSync.enabled', true, true);
            } else if (choice === 'Sync Now') {
                vscode.commands.executeCommand('chatHistory.cloudSync');
            } else if (choice === 'Check Connection') {
                await cloudSync.validateToken(true);
            } else if (choice === 'Logout') {
                await cloudSync.logout();
            }
        }
    );

    // 注册命令：刷新侧边栏状态
    const refreshStatusCommand = vscode.commands.registerCommand(
        'chatHistory.refreshStatus',
        () => {
            automationStatusProvider.refresh();
            accountStatusProvider.refresh();
            vscode.window.showInformationMessage('Status refreshed');
        }
    );

    // 注册命令：打开设置
    const openSettingsCommand = vscode.commands.registerCommand(
        'chatHistory.openSettings',
        (settingKey?: string) => {
            if (settingKey) {
                vscode.commands.executeCommand('workbench.action.openSettings', settingKey);
            } else {
                vscode.commands.executeCommand('workbench.action.openSettings', 'chatHistory');
            }
        }
    );

    // 注册命令：立即同步到云端
    const cloudSyncCommand = vscode.commands.registerCommand(
        'chatHistory.cloudSync',
        async () => {
            if (!cloudSync.isLoggedIn()) {
                const choice = await vscode.window.showWarningMessage(
                    t('cloud.notLoggedIn'),
                    'Login Now',
                    'Cancel'
                );
                if (choice === 'Login Now') {
                    await cloudSync.loginWithBrowser('login');
                }
                return;
            }

            if (!cloudSync.isEnabled()) {
                const enable = await vscode.window.showWarningMessage(
                    'Cloud sync is not enabled. Enable it now?',
                    'Enable',
                    'Cancel'
                );
                if (enable === 'Enable') {
                    await vscode.workspace.getConfiguration('chatHistory').update('cloudSync.enabled', true, true);
                } else {
                    return;
                }
            }

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: t('cloud.syncing'),
                    cancellable: false,
                },
                async () => {
                    try {
                        // 触发所有 watcher 同步
                        for (const watcher of watchers) {
                            watcher.syncNow();
                        }
                        vscode.window.showInformationMessage(t('cloud.syncSuccess'));
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        vscode.window.showErrorMessage(t('cloud.syncFailed') + ': ' + errorMsg);
                    }
                }
            );
        }
    );

    // 导出 cloudSync 供 watcher 使用
    (global as any).__cloudSyncManager = cloudSync;

    context.subscriptions.push(
        saveCommand, 
        searchCommand, 
        cloudLoginCommand, 
        cloudLogoutCommand, 
        showCloudStatusCommand, 
        cloudSyncCommand,
        refreshStatusCommand,
        openSettingsCommand,
        {
            dispose: () => {
                for (const watcher of watchers) {
                    watcher.stop();
                }
            }
        }
    );
    
    console.log(`LLM Chat History Extension ready (${watchers.length} source(s))`);

    // 验证已存储的 token（启动时静默检查）
    if (cloudSync.isLoggedIn()) {
        cloudSync.validateToken(false).then((valid) => {
            if (!valid) {
                console.log('Stored token is invalid, cleared');
                // Token 失效，显示提示
                vscode.window.showWarningMessage(
                    '⚠️ Your cloud sync session has expired. Please login again.',
                    'Login Now',
                    'Later'
                ).then(selection => {
                    if (selection === 'Login Now') {
                        cloudSync.loginWithBrowser('login');
                    }
                });
            }
        });
    }

    // 定期检查 token 状态（每小时检查一次）
    const tokenCheckInterval = setInterval(async () => {
        if (cloudSync.isLoggedIn()) {
            const valid = await cloudSync.validateToken(false);
            if (!valid) {
                vscode.window.showWarningMessage(
                    '⚠️ Your cloud sync session has expired. Please login again.',
                    'Login Now',
                    'Later'
                ).then(selection => {
                    if (selection === 'Login Now') {
                        cloudSync.loginWithBrowser('login');
                    }
                });
            }
        }
    }, 60 * 60 * 1000); // 每小时检查一次

    context.subscriptions.push({ dispose: () => clearInterval(tokenCheckInterval) });

    // 检查云同步状态的函数
    const checkCloudSyncStatus = async () => {
        if (cloudSync.isEnabled() && !cloudSync.isLoggedIn()) {
            // 立即打开登录界面
            console.log('[CloudSync] Enabled but not logged in, opening login dialog...');
            
            // 显示模态提示，强制用户注意
            const config = vscode.workspace.getConfiguration('chatHistory');
            const debugMode = config.get<boolean>('cloudSync.debugMode', false);
            const message = debugMode 
                ? '⚠️ Cloud sync enabled (Debug Mode). You must login to sync your chat history.'
                : '⚠️ Cloud sync enabled. You must login to sync your chat history.';
            
            vscode.window.showWarningMessage(
                message,
                { modal: false }, // 不阻塞，但更醒目
                'Login Now',
                'Disable Cloud Sync'
            ).then(async selection => {
                if (selection === 'Login Now') {
                    // 使用浏览器OAuth流程
                    await cloudSync.loginWithBrowser('login');
                } else if (selection === 'Disable Cloud Sync') {
                    config.update('cloudSync.enabled', false, true);
                }
            });
            
            // 同时自动触发浏览器登录
            cloudSync.loginWithBrowser('login');
        }
    };

    // 启动时检查
    checkCloudSyncStatus();

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('chatHistory.cloudSync.enabled')) {
                checkCloudSyncStatus();
                automationStatusProvider.refresh();
            }
            if (e.affectsConfiguration('chatHistory.autoSave')) {
                automationStatusProvider.refresh();
            }
            if (e.affectsConfiguration('chatHistory.cloudSync')) {
                automationStatusProvider.refresh();
            }
        })
    );
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


