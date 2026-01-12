/**
 * 扩展主入口文件
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseWatcher } from './agents/cursor/cursor-database-watcher';
import { ClineWatcher } from './agents/cline/cline-watcher';
import { getClineStoragePath } from './agents/cline/cline-reader';
import { BlackboxWatcher } from './agents/blackboxai/blackboxai-watcher';
import { getBlackboxStoragePath } from './agents/blackboxai/blackboxai-reader';
import { KiloWatcher } from './agents/kilo/kilo-watcher';
import { getKiloStoragePath } from './agents/kilo/kilo-reader';
import { CopilotWatcher } from './agents/copilot/copilot-watcher';
import { getCopilotStoragePath } from './agents/copilot/copilot-reader';
import { createTranslator } from './i18n';
import { SqliteLoader } from './sqlite-loader';
import { showSearchInterface } from './chat-search';
import { CloudSyncManager } from './cloud/cloud-sync';
import { AutomationStatusProvider, AccountStatusProvider } from './sidebar/status-view';
import { TelemetryManager, TelemetryEvents } from './telemetry/telemetry';
import { parseMarkdown, ParsedSession } from './markdown-parser';

/**
 * 扩展激活时调用
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('LLM Chat History Extension activated');

    // 初始化遥测管理器
    const telemetry = TelemetryManager.getInstance(context);
    await telemetry.initialize();

    // 检查是否首次安装
    const isFirstInstall = await telemetry.checkFirstInstall();
    if (isFirstInstall) {
        telemetry.trackEvent(TelemetryEvents.EXTENSION_INSTALLED);
    }
    
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
    
    // ✅ 先注册不依赖特定条件的命令，确保即使扩展提前返回也能使用
    // 注册命令：刷新侧边栏状态
    const refreshStatusCommand = vscode.commands.registerCommand(
        'chatHistory.refreshStatus',
        async () => {
            // 检查 provider 是否存在（容错处理）
            const automationProvider = (global as any).__automationStatusProvider;
            const accountProvider = (global as any).__accountStatusProvider;
            
            if (automationProvider) {
                automationProvider.refresh();
            }
            if (accountProvider) {
                accountProvider.refresh();
            }
            
            if (automationProvider || accountProvider) {
                vscode.window.showInformationMessage('Status refreshed');
            } else {
                // 扩展未完全激活，提供友好的诊断信息和操作建议
                const config = vscode.workspace.getConfiguration('chatHistory');
                const autoSave = config.get<boolean>('autoSave', true);
                const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
                
                let message = 'LLM Chat History extension is not fully activated.\n\n';
                const actions: string[] = [];
                
                if (!hasWorkspace) {
                    message += '⚠️ No workspace folder is open.\n';
                    message += 'Please open a workspace folder to enable chat history saving.\n\n';
                    actions.push('Open Folder', 'Open Workspace');
                }
                
                if (!autoSave) {
                    message += '⚠️ Auto-save is disabled.\n';
                    message += 'Please enable "chatHistory.autoSave" in settings to activate the extension.\n\n';
                    actions.push('Enable Auto-Save');
                }
                
                if (hasWorkspace && autoSave) {
                    message += '⚠️ No supported AI plugins found.\n';
                    message += 'Please install and use Cursor, Cline, Blackbox AI, or Kilo to generate chat history.\n\n';
                }
                
                message += 'Click "Open Settings" to configure the extension.';
                actions.push('Open Settings');
                
                const choice = await vscode.window.showWarningMessage(message, ...actions);
                
                if (choice === 'Open Folder') {
                    await vscode.commands.executeCommand('workbench.action.files.openFolder');
                } else if (choice === 'Open Workspace') {
                    await vscode.commands.executeCommand('workbench.action.openWorkspace');
                } else if (choice === 'Enable Auto-Save') {
                    await config.update('autoSave', true, true);
                    vscode.window.showInformationMessage('Auto-save enabled. Please reload the window for changes to take effect.', 'Reload Window')
                        .then(selection => {
                            if (selection === 'Reload Window') {
                                vscode.commands.executeCommand('workbench.action.reloadWindow');
                            }
                        });
                } else if (choice === 'Open Settings') {
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'chatHistory');
                }
            }
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

    // 将命令添加到 subscriptions，确保在扩展停用时正确清理
    context.subscriptions.push(refreshStatusCommand, openSettingsCommand);
    
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
    
    // 检测 IDE 类型
    const ideType = detectIDEType();
    console.log(`[Extension] Detected IDE type: ${ideType}`);
    
    let cursorDbPath: string | undefined;
    let cursorFound = false;
    let clineStoragePath: string | undefined;
    let blackboxStoragePath: string | undefined;
    let kiloStoragePath: string | undefined;
    let copilotStoragePath: string | undefined;
    
    if (ideType === 'cursor') {
        // Cursor IDE: 只监听 Cursor 数据库
        cursorDbPath = getCursorDatabasePath();
        cursorFound = fs.existsSync(cursorDbPath);
        if (cursorFound) {
            console.log('Cursor database found, starting Cursor watcher');
            const cursorWatcher = new DatabaseWatcher(cursorDbPath, workspaceRoot, localeSetting, context.extensionPath);
            cursorWatcher.start();
            watchers.push(cursorWatcher);
        } else {
            console.log('Cursor database not found:', cursorDbPath);
        }
    } else {
        // VS Code: 监听其他 VSCode 插件（Cline, Blackbox AI, Kilo, Copilot）
        console.log('Running in VS Code, starting VSCode plugin watchers (Cline, Blackbox AI, Kilo, Copilot)');
        
        // 尝试启动 Cline 监听
        clineStoragePath = getClineStoragePath();
        if (fs.existsSync(clineStoragePath)) {
            console.log('[Cline] Storage found, starting watcher');
            const clineWatcher = new ClineWatcher(clineStoragePath, workspaceRoot, localeSetting);
            clineWatcher.start();
            watchers.push(clineWatcher);
        } else {
            console.log('[Cline] Storage not found');
        }

        // 尝试启动 Blackbox AI 监听
        blackboxStoragePath = getBlackboxStoragePath();
        if (fs.existsSync(blackboxStoragePath)) {
            console.log('Blackbox AI storage found, starting Blackbox AI watcher');
            const blackboxWatcher = new BlackboxWatcher(blackboxStoragePath, workspaceRoot, localeSetting);
            blackboxWatcher.start();
            watchers.push(blackboxWatcher);
        } else {
            console.log('Blackbox AI storage not found:', blackboxStoragePath);
        }

        // 尝试启动 Kilo 监听
        kiloStoragePath = getKiloStoragePath();
        if (fs.existsSync(kiloStoragePath)) {
            console.log('Kilo storage found, starting Kilo watcher');
            const kiloWatcher = new KiloWatcher(kiloStoragePath, workspaceRoot, localeSetting);
            kiloWatcher.start();
            watchers.push(kiloWatcher);
        } else {
            console.log('Kilo storage not found:', kiloStoragePath);
        }

        // 尝试启动 Copilot Chat 监听
        copilotStoragePath = getCopilotStoragePath();
        if (fs.existsSync(copilotStoragePath)) {
            console.log('[Copilot] Storage found, starting watcher');
            const copilotWatcher = new CopilotWatcher(copilotStoragePath, workspaceRoot, localeSetting);
            copilotWatcher.start();
            watchers.push(copilotWatcher);
        } else {
            console.log('[Copilot] Storage not found:', copilotStoragePath);
        }
    }
    
    // 如果没有找到任何聊天历史
    if (watchers.length === 0) {
        console.warn('No chat history sources found (Cursor, Cline, Blackbox AI, Kilo, or Copilot)');
        vscode.window.showWarningMessage(
            'LLM Chat History: No supported AI plugins found. Please install and use Cursor, Cline, Blackbox AI, Kilo, or GitHub Copilot Chat.'
        );
        return;
    }

    // 上报插件激活事件
    telemetry.trackEvent(TelemetryEvents.EXTENSION_ACTIVATED, {
        watchers_count: watchers.length,
        cursor_found: cursorFound,
        cline_found: clineStoragePath ? fs.existsSync(clineStoragePath) : false,
        blackbox_found: blackboxStoragePath ? fs.existsSync(blackboxStoragePath) : false,
        kilo_found: kiloStoragePath ? fs.existsSync(kiloStoragePath) : false,
        copilot_found: copilotStoragePath ? fs.existsSync(copilotStoragePath) : false,
        cloud_sync_enabled: config.get<boolean>('cloudSync.enabled', false),
        auto_save_enabled: autoSave,
        ide_type: ideType,
    });
    
    // 注册命令：手动保存
    const saveCommand = vscode.commands.registerCommand(
        'chatHistory.saveNow',
        () => {
            // 上报手动保存事件
            telemetry.trackEvent(TelemetryEvents.MANUAL_SAVE_TRIGGERED);
            
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

    // 注意：refreshStatusCommand 和 openSettingsCommand 已在函数开头注册

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

            // 上报手动同步事件
            telemetry.trackEvent(TelemetryEvents.MANUAL_SYNC_TRIGGERED);

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

    // 注册命令：手动选择文件同步到云端
    const syncFilesCommand = vscode.commands.registerCommand(
        'chatHistory.syncFiles',
        async () => {
            await handleSyncFilesCommand(cloudSync, t, telemetry);
        }
    );

    context.subscriptions.push(
        saveCommand, 
        searchCommand, 
        cloudLoginCommand, 
        cloudLogoutCommand, 
        showCloudStatusCommand, 
        cloudSyncCommand,
        syncFilesCommand,
        {
            dispose: () => {
                for (const watcher of watchers) {
                    watcher.stop();
                }
            }
        }
    );
    // 注意：refreshStatusCommand 和 openSettingsCommand 已在函数开头添加到 subscriptions
    
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
                // 上报云同步启用/禁用事件
                const newConfig = vscode.workspace.getConfiguration('chatHistory');
                const enabled = newConfig.get<boolean>('cloudSync.enabled', false);
                telemetry.trackEvent(
                    enabled ? TelemetryEvents.CLOUD_SYNC_ENABLED : TelemetryEvents.CLOUD_SYNC_DISABLED
                );
            }
            if (e.affectsConfiguration('chatHistory.autoSave')) {
                automationStatusProvider.refresh();
            }
            if (e.affectsConfiguration('chatHistory.cloudSync')) {
                automationStatusProvider.refresh();
            }
        })
    );

    // 导出 telemetry 供其他模块使用
    (global as any).__telemetryManager = telemetry;
}

/**
 * 扩展停用时调用
 */
export async function deactivate() {
    console.log('LLM Chat History Extension deactivated');

    // 上报插件停用事件并刷新队列
    try {
        const telemetry = (global as any).__telemetryManager as TelemetryManager | undefined;
        if (telemetry) {
            await telemetry.trackEventImmediately(TelemetryEvents.EXTENSION_DEACTIVATED);
            await telemetry.dispose();
        }
    } catch (error) {
        console.error('[Telemetry] Failed to send deactivation event:', error);
    }
}

/**
 * 处理手动选择文件同步命令
 */
async function handleSyncFilesCommand(
    cloudSync: CloudSyncManager,
    t: ReturnType<typeof createTranslator>,
    telemetry: TelemetryManager
): Promise<void> {
    // 检查登录状态
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

    // Step 1: 收集所有工作区中的 .llm-chat-history 目录
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage(t('sync.noWorkspace'));
        return;
    }

    interface WorkspaceOption {
        label: string;
        description: string;
        path: string;
        isBrowse?: boolean;
    }

    const historyDirs: WorkspaceOption[] = [];

    // 查找每个工作区中的 .llm-chat-history 目录
    for (const folder of workspaceFolders) {
        const historyPath = path.join(folder.uri.fsPath, '.llm-chat-history');
        if (fs.existsSync(historyPath)) {
            historyDirs.push({
                label: `📁 ${folder.name}`,
                description: historyPath,
                path: historyPath,
            });
        }
    }

    // 添加"浏览其他文件夹"选项
    historyDirs.push({
        label: `📂 ${t('sync.browseFolder')}`,
        description: '',
        path: '',
        isBrowse: true,
    });

    if (historyDirs.length === 1 && historyDirs[0].isBrowse) {
        // 没有找到任何历史记录目录，直接打开浏览器
        const selectedFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: t('sync.selectWorkspace'),
            title: t('sync.selectWorkspace'),
        });

        if (!selectedFolder || selectedFolder.length === 0) {
            return;
        }

        historyDirs.unshift({
            label: `📁 ${path.basename(selectedFolder[0].fsPath)}`,
            description: selectedFolder[0].fsPath,
            path: selectedFolder[0].fsPath,
        });
    }

    // Step 2: 让用户选择工作区
    const selectedWorkspace = await vscode.window.showQuickPick(historyDirs, {
        placeHolder: t('sync.selectWorkspace'),
        ignoreFocusOut: true,
    });

    if (!selectedWorkspace) {
        return;
    }

    let targetDir = selectedWorkspace.path;

    // 如果选择了浏览，打开文件夹选择器
    if (selectedWorkspace.isBrowse) {
        const selectedFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: t('sync.selectWorkspace'),
            title: t('sync.selectWorkspace'),
        });

        if (!selectedFolder || selectedFolder.length === 0) {
            return;
        }

        targetDir = selectedFolder[0].fsPath;
    }

    // Step 3: 列出目录中的 .md 文件
    const mdFiles: vscode.QuickPickItem[] = [];

    const scanDir = (dir: string) => {
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat.isFile() && file.endsWith('.md')) {
                    mdFiles.push({
                        label: file,
                        description: filePath,
                        picked: false,
                    });
                } else if (stat.isDirectory() && !file.startsWith('.')) {
                    // 递归扫描子目录
                    scanDir(filePath);
                }
            }
        } catch (error) {
            console.error('[SyncFiles] Error scanning directory:', error);
        }
    };

    scanDir(targetDir);

    if (mdFiles.length === 0) {
        vscode.window.showWarningMessage(t('sync.noFilesSelected'));
        return;
    }

    // Step 4: 让用户多选文件
    const selectedFiles = await vscode.window.showQuickPick(mdFiles, {
        placeHolder: t('sync.selectFiles'),
        canPickMany: true,
        ignoreFocusOut: true,
    });

    if (!selectedFiles || selectedFiles.length === 0) {
        vscode.window.showInformationMessage(t('sync.noFilesSelected'));
        return;
    }

    // Step 5: 选择同步模式
    const syncModes: Array<{ label: string; description: string; mode: 'incremental' | 'full' }> = [
        {
            label: `🔄 ${t('sync.modeIncremental')}`,
            description: '',
            mode: 'incremental',
        },
        {
            label: `⚠️ ${t('sync.modeFull')}`,
            description: '',
            mode: 'full',
        },
    ];

    const selectedMode = await vscode.window.showQuickPick(syncModes, {
        placeHolder: t('sync.selectMode'),
        ignoreFocusOut: true,
    });

    if (!selectedMode) {
        return;
    }

    // Step 6: 如果是全量同步，二次确认
    if (selectedMode.mode === 'full') {
        const confirm = await vscode.window.showWarningMessage(
            t('sync.fullSyncWarningMessage'),
            { modal: true, detail: t('sync.fullSyncWarningTitle') },
            t('sync.confirmOverwrite')
        );

        if (confirm !== t('sync.confirmOverwrite')) {
            return;
        }
    }

    // Step 7: 解析文件并同步
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: t('sync.parsingFiles'),
            cancellable: false,
        },
        async (progress) => {
            // 解析文件
            const sessions: ParsedSession[] = [];
            let parsed = 0;

            for (const file of selectedFiles) {
                try {
                    const filePath = file.description!;
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const session = parseMarkdown(content, filePath);
                    if (session) {
                        sessions.push(session);
                    }
                } catch (error) {
                    console.error(`[SyncFiles] Failed to parse file ${file.label}:`, error);
                }
                parsed++;
                progress.report({ 
                    message: `${parsed}/${selectedFiles.length}`,
                    increment: (100 / selectedFiles.length) 
                });
            }

            if (sessions.length === 0) {
                vscode.window.showWarningMessage(t('sync.noFilesSelected'));
                return;
            }

            // 同步到云端
            progress.report({ message: t('sync.syncing') });

            try {
                const result = await cloudSync.syncFromFiles(sessions, selectedMode.mode);

                // 上报事件
                telemetry.trackEvent(TelemetryEvents.MANUAL_SYNC_TRIGGERED, {
                    mode: selectedMode.mode,
                    files_count: selectedFiles.length,
                    success_count: result.success,
                    failed_count: result.failed,
                });

                if (result.failed === 0) {
                    vscode.window.showInformationMessage(
                        t('sync.success', { count: result.success })
                    );
                } else if (result.success > 0) {
                    vscode.window.showWarningMessage(
                        t('sync.partialSuccess', { success: result.success, failed: result.failed })
                    );
                } else {
                    vscode.window.showErrorMessage(
                        t('sync.failed', { error: 'All files failed to sync' })
                    );
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(t('sync.failed', { error: errorMsg }));
            }
        }
    );
}

/**
 * 检测当前 IDE 类型
 * 返回 'cursor' 或 'vscode'
 */
function detectIDEType(): 'cursor' | 'vscode' {
    // 方法1：检查 Cursor 特有的环境变量（最可靠）
    if (process.env.CURSOR_PID || process.env.CURSOR_DATA_FOLDER) {
        return 'cursor';
    }
    
    // 方法2：检查可执行路径
    const execPath = process.execPath?.toLowerCase() || '';
    if (execPath.includes('cursor')) {
        return 'cursor';
    }
    
    // 方法3：检查 VS Code 特有的环境变量
    if (process.env.VSCODE_CWD || process.env.VSCODE_PID) {
        // 如果明确是 VS Code，返回 vscode
        // 注意：Cursor 也可能设置这些变量，所以优先检查 Cursor
        return 'vscode';
    }
    
    // 默认：如果无法确定，假设是 VS Code（更安全，避免误读 Cursor 数据）
    return 'vscode';
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


