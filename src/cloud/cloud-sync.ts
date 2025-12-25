/**
 * Cloud Sync Module
 * Handles authentication and syncing chat history to cloud server
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { Message } from '../types';
import { createTranslator, LocaleSetting, Translator } from '../i18n';
import * as crypto from 'crypto';

export interface CloudUser {
    id: string;
    username: string;
    email: string;
}

export interface AuthResponse {
    message: string;
    token: string;
    user: CloudUser;
}

export interface SyncSession {
    title: string;
    session_id: string;
    messages: SyncMessage[];
}

export interface SyncMessage {
    type: string;
    content: string;
    thinking?: string;
    timestamp: string;
    model_name?: string;
    mode?: string;
    context?: string;
    tool_results?: string;
    tool_uses?: string;
    images?: string;
}

export interface SyncRequest {
    source: string;
    sessions: SyncSession[];
}

export class CloudSyncManager implements vscode.UriHandler {
    private context: vscode.ExtensionContext;
    private t: Translator;
    private statusBarItem: vscode.StatusBarItem;
    private pendingAuth: ((token: string) => void) | null = null;

    private static readonly TOKEN_KEY = 'cloudSync.token';
    private static readonly USER_KEY = 'cloudSync.user';
    private static readonly STATE_KEY = 'cloudSync.authState';
    private static readonly OFFICIAL_SERVER_URL = 'https://api.llmchathistory.com'; // 官方服务器地址

    constructor(context: vscode.ExtensionContext, localeSetting?: LocaleSetting) {
        this.context = context;
        this.t = createTranslator(localeSetting);
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'chatHistory.cloudLogin';
        this.updateStatusBar();
        this.statusBarItem.show();
        context.subscriptions.push(this.statusBarItem);
        
        // 注册 URI Handler 用于接收浏览器回调
        context.subscriptions.push(vscode.window.registerUriHandler(this));
    }

    /**
     * Handle URI callback from browser
     */
    async handleUri(uri: vscode.Uri): Promise<void> {
        console.log('[CloudSync] Received callback URI:', uri.toString());
        
        // 解析查询参数
        const query = new URLSearchParams(uri.query);
        const token = query.get('token');
        const state = query.get('state');
        const error = query.get('error');

        if (error) {
            vscode.window.showErrorMessage(`Authentication failed: ${error}`);
            return;
        }

        // 验证 state 防止 CSRF
        const savedState = this.context.globalState.get<string>(CloudSyncManager.STATE_KEY);
        if (state !== savedState) {
            vscode.window.showErrorMessage('Authentication failed: Invalid state');
            return;
        }

        if (token) {
            // 验证 token 并获取用户信息
            try {
                const user = await this.request<{ user: CloudUser }>('GET', '/api/user/profile', undefined, token);
                await this.storeAuth(token, user.user);
                
                // 显示成功提示（更醒目）
                vscode.window.showInformationMessage(
                    `✅ Login successful! Welcome back, ${user.user.username}!`,
                    'Sync Now',
                    'View Status'
                ).then(selection => {
                    if (selection === 'Sync Now') {
                        vscode.commands.executeCommand('chatHistory.cloudSync');
                    } else if (selection === 'View Status') {
                        vscode.commands.executeCommand('chatHistory.showCloudStatus');
                    }
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Login failed: ${errorMsg}`);
            }
        }

        // 清理 state
        await this.context.globalState.update(CloudSyncManager.STATE_KEY, undefined);
    }

    /**
     * Get server URL from configuration
     * Uses official server by default, or custom URL in debug mode
     */
    private getServerUrl(): string {
        const config = vscode.workspace.getConfiguration('chatHistory');
        const debugMode = config.get<boolean>('cloudSync.debugMode', false);
        
        if (debugMode) {
            const debugUrl = config.get<string>('cloudSync.debugServerUrl', '');
            if (debugUrl) {
                console.log('[CloudSync] Debug mode enabled, using custom server:', debugUrl);
                return debugUrl;
            }
        }
        
        return CloudSyncManager.OFFICIAL_SERVER_URL;
    }

    /**
     * Check if cloud sync is enabled
     */
    isEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('chatHistory');
        return config.get<boolean>('cloudSync.enabled', false);
    }

    /**
     * Check if auto sync is enabled
     */
    isAutoSyncEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('chatHistory');
        return config.get<boolean>('cloudSync.autoSync', true);
    }

    /**
     * Update status bar based on login state
     */
    updateStatusBar(): void {
        const user = this.getUser();
        if (user) {
            this.statusBarItem.text = `LLM Chat: $(cloud) ${user.username}`;
            this.statusBarItem.tooltip = this.t('cloud.statusBarLoggedIn', { username: user.username });
            this.statusBarItem.command = 'chatHistory.cloudLogin';
        } else {
            this.statusBarItem.text = 'LLM Chat: $(cloud-offline)';
            this.statusBarItem.tooltip = this.t('cloud.statusBarNotLoggedIn');
            this.statusBarItem.command = 'chatHistory.cloudLogin';
        }
    }

    /**
     * Get stored token
     */
    getToken(): string | undefined {
        return this.context.globalState.get<string>(CloudSyncManager.TOKEN_KEY);
    }

    /**
     * Get stored user
     */
    getUser(): CloudUser | undefined {
        return this.context.globalState.get<CloudUser>(CloudSyncManager.USER_KEY);
    }

    /**
     * Store auth data
     */
    private async storeAuth(token: string, user: CloudUser): Promise<void> {
        await this.context.globalState.update(CloudSyncManager.TOKEN_KEY, token);
        await this.context.globalState.update(CloudSyncManager.USER_KEY, user);
        this.updateStatusBar();
        // 刷新侧边栏
        this.refreshSidebarViews();
    }

    /**
     * Clear auth data
     */
    async clearAuth(): Promise<void> {
        await this.context.globalState.update(CloudSyncManager.TOKEN_KEY, undefined);
        await this.context.globalState.update(CloudSyncManager.USER_KEY, undefined);
        this.updateStatusBar();
        // 刷新侧边栏
        this.refreshSidebarViews();
    }

    /**
     * Refresh sidebar views
     */
    private refreshSidebarViews(): void {
        const automationProvider = (global as any).__automationStatusProvider;
        const accountProvider = (global as any).__accountStatusProvider;
        
        if (automationProvider) {
            automationProvider.refresh();
        }
        if (accountProvider) {
            accountProvider.refresh();
        }
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn(): boolean {
        return !!this.getToken() && !!this.getUser();
    }

    /**
     * Make HTTP request
     */
    private async request<T>(
        method: string,
        path: string,
        body?: any,
        token?: string
    ): Promise<T> {
        const serverUrl = this.getServerUrl();

        const url = new URL(path, serverUrl);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const requestBody = body ? JSON.stringify(body) : undefined;

        return new Promise<T>((resolve, reject) => {
            const req = httpModule.request(
                {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + url.search,
                    method,
                    headers,
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(json as T);
                            } else {
                                reject(new Error(json.error || `Request failed with status ${res.statusCode}`));
                            }
                        } catch (e) {
                            reject(new Error('Failed to parse response'));
                        }
                    });
                }
            );

            req.on('error', reject);

            if (requestBody) {
                req.write(requestBody);
            }
            req.end();
        });
    }

    /**
     * Login via browser (OAuth flow)
     */
    async loginWithBrowser(mode: 'login' | 'register' = 'login'): Promise<void> {
        const serverUrl = this.getServerUrl();
        
        // 生成随机 state 防止 CSRF
        const state = crypto.randomBytes(32).toString('hex');
        await this.context.globalState.update(CloudSyncManager.STATE_KEY, state);

        // 构建回调 URI
        const callbackUri = vscode.Uri.parse(`${vscode.env.uriScheme}://ClarkZhang.llm-chat-history/auth-callback`);
        
        // 构建登录/注册 URL
        const authUrl = `${serverUrl}/auth/${mode}?state=${state}&redirect_uri=${encodeURIComponent(callbackUri.toString())}`;
        
        console.log('[CloudSync] Opening browser for authentication...');
        console.log('[CloudSync] Auth URL:', authUrl);
        console.log('[CloudSync] Callback URI:', callbackUri.toString());
        
        // 在浏览器中打开
        await vscode.env.openExternal(vscode.Uri.parse(authUrl));
        
        // 显示等待提示
        vscode.window.showInformationMessage(
            'Please complete the authentication in your browser.',
            'Cancel'
        );
    }


    /**
     * Logout from cloud
     */
    async logout(): Promise<void> {
        const token = this.getToken();
        if (token) {
            try {
                await this.request('POST', '/api/auth/logout', undefined, token);
            } catch (e) {
                // Ignore logout errors
            }
        }
        await this.clearAuth();
        vscode.window.showInformationMessage(this.t('cloud.logoutSuccess'));
    }

    /**
     * Sync sessions to cloud
     */
    async syncSessions(source: string, sessions: SyncSession[]): Promise<void> {
        const token = this.getToken();
        if (!token) {
            throw new Error('Not logged in');
        }

        if (sessions.length === 0) {
            return;
        }

        const syncRequest: SyncRequest = {
            source,
            sessions,
        };

        await this.request<{ message: string }>('POST', '/api/chat/sync', syncRequest, token);
    }

    /**
     * Convert Message array to SyncMessage array
     */
    convertMessages(messages: Message[]): SyncMessage[] {
        return messages.map((msg) => ({
            type: msg.type,
            content: msg.text,
            thinking: msg.thinking,
            timestamp: msg.timestamp,
            model_name: msg.modelName,
            mode: msg.mode,
            context: msg.context ? JSON.stringify(msg.context) : undefined,
            tool_results: msg.toolResults ? JSON.stringify(msg.toolResults) : undefined,
            tool_uses: msg.toolUses ? JSON.stringify(msg.toolUses) : undefined,
            images: msg.images ? JSON.stringify(msg.images) : undefined,
        }));
    }

    /**
     * Validate token with server
     */
    async validateToken(showNotification: boolean = false): Promise<boolean> {
        const token = this.getToken();
        if (!token) {
            return false;
        }

        try {
            await this.request<{ user: CloudUser }>('GET', '/api/user/profile', undefined, token);
            if (showNotification) {
                vscode.window.showInformationMessage('✅ Cloud sync is active and working');
            }
            return true;
        } catch (e) {
            // Token invalid, clear it
            await this.clearAuth();
            if (showNotification) {
                vscode.window.showWarningMessage(
                    '⚠️ Your login session has expired. Please login again.',
                    'Login Now'
                ).then(selection => {
                    if (selection === 'Login Now') {
                        this.loginWithBrowser('login');
                    }
                });
            }
            return false;
        }
    }

    /**
     * Get cloud sync status information
     */
    getStatusInfo(): { status: string; message: string; details: string } {
        const user = this.getUser();
        const isEnabled = this.isEnabled();
        const isLoggedIn = this.isLoggedIn();
        const config = vscode.workspace.getConfiguration('chatHistory');
        const debugMode = config.get<boolean>('cloudSync.debugMode', false);
        const serverUrl = this.getServerUrl();

        if (isLoggedIn && isEnabled) {
            return {
                status: '✅ Active',
                message: `Logged in as ${user?.username}`,
                details: `Cloud sync is enabled and active.\nServer: ${serverUrl}${debugMode ? ' (Debug Mode)' : ''}\nAuto sync: ${this.isAutoSyncEnabled() ? 'On' : 'Off'}`
            };
        } else if (isLoggedIn && !isEnabled) {
            return {
                status: '⏸️ Paused',
                message: `Logged in as ${user?.username}`,
                details: 'Cloud sync is disabled. Enable it in settings to start syncing.'
            };
        } else if (!isLoggedIn && isEnabled) {
            return {
                status: '⚠️ Not Logged In',
                message: 'Cloud sync enabled but not logged in',
                details: 'Please login to start syncing your chat history.'
            };
        } else {
            return {
                status: '⭕ Disabled',
                message: 'Cloud sync is not enabled',
                details: 'Enable cloud sync in settings and login to start syncing.'
            };
        }
    }

    /**
     * Get translator
     */
    getTranslator(): Translator {
        return this.t;
    }
}

