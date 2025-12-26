/**
 * 遥测数据上报模块
 * 负责收集和上报用户行为事件
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as os from 'os';
import * as crypto from 'crypto';
import { URL } from 'url';

/**
 * 事件名称常量
 */
export const TelemetryEvents = {
    // ===== 插件生命周期 =====
    EXTENSION_INSTALLED: 'extension_installed',
    EXTENSION_ACTIVATED: 'extension_activated',
    EXTENSION_DEACTIVATED: 'extension_deactivated',
    
    // ===== 云同步设置 =====
    CLOUD_SYNC_ENABLED: 'cloud_sync_enabled',
    CLOUD_SYNC_DISABLED: 'cloud_sync_disabled',
    
    // ===== 用户认证 =====
    USER_LOGGED_IN: 'user_logged_in',
    USER_LOGGED_OUT: 'user_logged_out',
    
    // ===== 本地保存 =====
    FILE_SAVED_LOCALLY: 'file_saved_locally',
    
    // ===== 云端同步操作 =====
    CLOUD_SYNC_STARTED: 'cloud_sync_started',
    CLOUD_SYNC_COMPLETED: 'cloud_sync_completed',
    CLOUD_SYNC_FAILED: 'cloud_sync_failed',
    
    // ===== Watcher 生命周期 =====
    WATCHER_STARTED: 'watcher_started',
    WATCHER_STOPPED: 'watcher_stopped',
    
    // ===== 搜索功能 =====
    SEARCH_PERFORMED: 'search_performed',
    
    // ===== 手动操作 =====
    MANUAL_SAVE_TRIGGERED: 'manual_save_triggered',
    MANUAL_SYNC_TRIGGERED: 'manual_sync_triggered',
    
    // ===== 错误追踪 =====
    ERROR_OCCURRED: 'error_occurred',
} as const;

export type TelemetryEventName = typeof TelemetryEvents[keyof typeof TelemetryEvents];

/**
 * 单个事件数据
 */
export interface TelemetryEvent {
    event_name: TelemetryEventName;
    event_data?: Record<string, any>;
    client_timestamp: string;
}

/**
 * 遥测上下文（设备和环境信息）
 */
export interface TelemetryContext {
    anonymous_id: string;
    user_id?: string;
    extension_version: string;
    vscode_version: string;
    os_platform: string;
    os_version: string;
    machine_id: string;
}

/**
 * 遥测管理器
 * 单例模式，负责事件收集和上报
 */
export class TelemetryManager {
    private static instance: TelemetryManager | null = null;
    private context: vscode.ExtensionContext;
    private telemetryContext: TelemetryContext | null = null;
    private eventQueue: TelemetryEvent[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private isInitialized: boolean = false;

    // 存储 key 常量
    private static readonly ANONYMOUS_ID_KEY = 'telemetry.anonymousId';
    private static readonly FIRST_INSTALL_KEY = 'telemetry.firstInstallTime';
    private static readonly OFFICIAL_SERVER_URL = 'https://llm-chat-history.com';

    // 配置
    private static readonly FLUSH_INTERVAL = 30000; // 30秒自动刷新
    private static readonly MAX_QUEUE_SIZE = 50; // 最大队列大小

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * 获取单例实例
     */
    static getInstance(context?: vscode.ExtensionContext): TelemetryManager {
        if (!TelemetryManager.instance) {
            if (!context) {
                throw new Error('TelemetryManager must be initialized with context first');
            }
            TelemetryManager.instance = new TelemetryManager(context);
        }
        return TelemetryManager.instance;
    }

    /**
     * 初始化遥测管理器
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // 获取或生成匿名 ID
            let anonymousId = this.context.globalState.get<string>(TelemetryManager.ANONYMOUS_ID_KEY);
            if (!anonymousId) {
                anonymousId = this.generateAnonymousId();
                await this.context.globalState.update(TelemetryManager.ANONYMOUS_ID_KEY, anonymousId);
                console.log('[Telemetry] Generated new anonymous ID');
            }

            // 获取插件版本
            const packageJson = require('../../package.json');

            // 构建遥测上下文
            this.telemetryContext = {
                anonymous_id: anonymousId,
                extension_version: packageJson.version || 'unknown',
                vscode_version: vscode.version,
                os_platform: process.platform,
                os_version: os.release(),
                machine_id: vscode.env.machineId,
            };

            // 启动定时刷新
            this.startFlushTimer();

            this.isInitialized = true;
            console.log('[Telemetry] Initialized successfully');
        } catch (error) {
            console.error('[Telemetry] Failed to initialize:', error);
        }
    }

    /**
     * 生成匿名 ID
     */
    private generateAnonymousId(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * 检查是否是首次安装
     */
    async checkFirstInstall(): Promise<boolean> {
        const firstInstallTime = this.context.globalState.get<number>(TelemetryManager.FIRST_INSTALL_KEY);
        if (!firstInstallTime) {
            await this.context.globalState.update(TelemetryManager.FIRST_INSTALL_KEY, Date.now());
            return true;
        }
        return false;
    }

    /**
     * 设置用户 ID（登录后调用）
     */
    setUserId(userId: string | undefined): void {
        if (this.telemetryContext) {
            this.telemetryContext.user_id = userId;
            console.log('[Telemetry] User ID set:', userId ? 'logged in' : 'logged out');
        }
    }

    /**
     * 从已有的 CloudSyncManager 获取用户 ID
     */
    getUserIdFromCloudSync(): string | undefined {
        const user = this.context.globalState.get<{ id: string }>('cloudSync.user');
        return user?.id;
    }

    /**
     * 上报事件
     */
    async trackEvent(eventName: TelemetryEventName, eventData?: Record<string, any>): Promise<void> {
        if (!this.isInitialized || !this.telemetryContext) {
            console.warn('[Telemetry] Not initialized, event queued:', eventName);
            return;
        }

        // 检查是否启用遥测
        if (!this.isEnabled()) {
            return;
        }

        const event: TelemetryEvent = {
            event_name: eventName,
            event_data: eventData,
            client_timestamp: new Date().toISOString(),
        };

        // 添加到队列
        this.eventQueue.push(event);
        console.log('[Telemetry] Event queued:', eventName);

        // 如果队列满了，立即发送
        if (this.eventQueue.length >= TelemetryManager.MAX_QUEUE_SIZE) {
            await this.flush();
        }
    }

    /**
     * 立即上报事件（不进入队列）
     */
    async trackEventImmediately(eventName: TelemetryEventName, eventData?: Record<string, any>): Promise<void> {
        if (!this.isInitialized || !this.telemetryContext) {
            return;
        }

        if (!this.isEnabled()) {
            return;
        }

        // 更新用户 ID
        this.telemetryContext.user_id = this.getUserIdFromCloudSync();

        const payload = {
            ...this.telemetryContext,
            event_name: eventName,
            event_data: eventData,
            client_timestamp: new Date().toISOString(),
        };

        try {
            await this.request('POST', '/api/telemetry/event', payload);
            console.log('[Telemetry] Event sent immediately:', eventName);
        } catch (error) {
            console.error('[Telemetry] Failed to send event:', eventName, error);
        }
    }

    /**
     * 刷新队列，发送所有待发送事件
     */
    async flush(): Promise<void> {
        if (this.eventQueue.length === 0 || !this.telemetryContext) {
            return;
        }

        // 更新用户 ID
        this.telemetryContext.user_id = this.getUserIdFromCloudSync();

        const events = [...this.eventQueue];
        this.eventQueue = [];

        const payload = {
            ...this.telemetryContext,
            events: events.map(e => ({
                event_name: e.event_name,
                event_data: e.event_data,
                client_timestamp: e.client_timestamp,
            })),
        };

        try {
            await this.request('POST', '/api/telemetry/events', payload);
            console.log('[Telemetry] Batch sent:', events.length, 'events');
        } catch (error) {
            // 发送失败，重新加入队列
            this.eventQueue = [...events, ...this.eventQueue].slice(0, TelemetryManager.MAX_QUEUE_SIZE);
            console.error('[Telemetry] Batch send failed, events re-queued');
        }
    }

    /**
     * 启动定时刷新
     */
    private startFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        this.flushTimer = setInterval(() => {
            this.flush();
        }, TelemetryManager.FLUSH_INTERVAL);
    }

    /**
     * 停止定时刷新
     */
    private stopFlushTimer(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /**
     * 检查遥测是否启用
     */
    private isEnabled(): boolean {
        // 检查 VS Code 全局遥测设置
        const vscodeTelemetry = vscode.env.isTelemetryEnabled;
        if (!vscodeTelemetry) {
            return false;
        }

        // 检查插件自己的遥测设置（可选，暂未添加配置项）
        // const config = vscode.workspace.getConfiguration('chatHistory');
        // return config.get<boolean>('telemetry.enabled', true);

        return true;
    }

    /**
     * 获取服务器 URL
     */
    private getServerUrl(): string {
        const config = vscode.workspace.getConfiguration('chatHistory');
        const debugMode = config.get<boolean>('cloudSync.debugMode', false);

        if (debugMode) {
            const debugUrl = config.get<string>('cloudSync.debugServerUrl', '');
            if (debugUrl) {
                return debugUrl;
            }
        }

        return TelemetryManager.OFFICIAL_SERVER_URL;
    }

    /**
     * 发送 HTTP 请求
     */
    private async request<T>(method: string, path: string, body?: any): Promise<T> {
        const serverUrl = this.getServerUrl();
        const url = new URL(path, serverUrl);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        const requestBody = body ? JSON.stringify(body) : undefined;

        return new Promise<T>((resolve, reject) => {
            const req = httpModule.request(
                {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + url.search,
                    method,
                    headers,
                    timeout: 10000, // 10秒超时
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
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (requestBody) {
                req.write(requestBody);
            }
            req.end();
        });
    }

    /**
     * 销毁管理器
     */
    async dispose(): Promise<void> {
        this.stopFlushTimer();
        // 发送剩余事件
        await this.flush();
        TelemetryManager.instance = null;
    }
}

/**
 * 便捷方法：获取遥测管理器实例
 */
export function getTelemetry(): TelemetryManager | null {
    try {
        return TelemetryManager.getInstance();
    } catch {
        return null;
    }
}

/**
 * 便捷方法：上报事件
 */
export function trackEvent(eventName: TelemetryEventName, eventData?: Record<string, any>): void {
    const telemetry = getTelemetry();
    if (telemetry) {
        telemetry.trackEvent(eventName, eventData);
    }
}

/**
 * 便捷方法：上报事件（仅登录用户）
 */
export function trackEventIfLoggedIn(eventName: TelemetryEventName, eventData?: Record<string, any>): void {
    const telemetry = getTelemetry();
    if (telemetry && telemetry.getUserIdFromCloudSync()) {
        telemetry.trackEvent(eventName, eventData);
    }
}

/**
 * 便捷方法：上报错误
 */
export function trackError(errorType: string, errorMessage: string, source?: string): void {
    const telemetry = getTelemetry();
    if (telemetry) {
        telemetry.trackEvent(TelemetryEvents.ERROR_OCCURRED, {
            error_type: errorType,
            error_message: errorMessage.substring(0, 500), // 限制错误消息长度
            source: source,
        });
    }
}

