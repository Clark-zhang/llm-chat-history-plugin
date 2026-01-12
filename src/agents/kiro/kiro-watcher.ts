/**
 * Kiro 文件监听器
 * 监听 Kiro 存储文件变化并自动同步
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import * as path from 'path';
import { KiroReader } from './kiro-reader';
import { KiroConversationBuilder } from './kiro-conversation-builder';
import { KiroMarkdownGenerator } from './kiro-markdown-generator';
import { HistorySaver } from '../../history-saver';
import { KiroWorkspaceFilter } from './kiro-workspace-filter';
import { createTranslator, LocaleSetting, Translator } from '../../i18n';
import { trackEvent, trackError, TelemetryEvents } from '../../telemetry/telemetry';
import { CloudSyncManager, SyncSession } from '../../cloud/cloud-sync';
import { Message } from '../../types';

// 缓存的会话数据，用于云端同步
interface CachedSession {
    title: string;
    session_id: string;
    workspace_path?: string;
    workspace_name?: string;
    messages: Message[];
}

export class KiroWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private storageDir: string;
    private lastLocalSync: number = 0;
    private lastCloudSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private cloudSyncTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: KiroWorkspaceFilter;
    private t: Translator;
    
    // 缓存会话数据，供云端同步使用
    private cachedSessions: CachedSession[] = [];
    
    constructor(storageDir: string, workspaceRoot: string, localeSetting?: LocaleSetting) {
        this.storageDir = storageDir;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new KiroWorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
    }
    
    /**
     * 启动监听
     */
    start(): void {
        // 上报 watcher 启动事件
        trackEvent(TelemetryEvents.WATCHER_STARTED, { source: 'kiro' });

        // 1. 立即执行一次同步
        this.syncNow();
        
        // 2. 监听存储目录变化
        // 监听 workspace-sessions 目录和 .chat 文件
        this.watcher = chokidar.watch(
            [
                path.join(this.storageDir, 'workspace-sessions/**/sessions.json'),
                path.join(this.storageDir, 'workspace-sessions/**/*.json'),
                path.join(this.storageDir, '**/*.chat')
            ],
            {
                persistent: true,
                ignoreInitial: true,
                depth: 5, // 监听深层目录
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 100
                },
                ignored: [
                    /node_modules/,
                    /\.git/,
                    /cache/,
                    /\.tmp/,
                    /ext-dev/,
                    /state\.vscdb/,
                    /dev_data/,
                    /index/,
                    /\.diffs/,
                    /\.utils/,
                    /\.migrations/,
                    /config\.json/
                ]
            }
        );
        
        this.watcher.on('add', (filePath) => {
            console.log('[Kiro] File added:', filePath);
            this.scheduleSync();
        });
        
        this.watcher.on('change', (filePath) => {
            console.log('[Kiro] File changed:', filePath);
            this.scheduleSync();
        });
        
        this.watcher.on('error', (error) => {
            console.error('[Kiro] Watcher error:', error);
            trackError('watcher_error', String(error), 'kiro');
        });
        
        // 3. 定时轮询本地保存（每 30 秒）
        setInterval(() => {
            this.syncNow();
        }, 30000); // 30 秒
        
        // 4. 定时云端同步（每 60 秒）
        setInterval(() => {
            this.cloudSyncNow();
        }, 60000); // 60 秒

        // 5. 启动时延迟 5 秒执行一次云端同步（给本地同步时间收集数据）
        setTimeout(() => {
            this.cloudSyncNow();
        }, 5000);
        
        console.log('[Kiro] Watcher started (local: 30s, cloud: 60s)');
    }
    
    /**
     * 停止监听
     */
    stop(): void {
        // 上报 watcher 停止事件
        trackEvent(TelemetryEvents.WATCHER_STOPPED, { source: 'kiro' });

        if (this.watcher) {
            this.watcher.close();
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        if (this.cloudSyncTimer) {
            clearTimeout(this.cloudSyncTimer);
        }
    }
    
    /**
     * 调度同步（防抖）
     */
    private scheduleSync(): void {
        // 防抖：2 秒内只执行一次
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this.syncNow();
        }, 2000);
    }
    
    /**
     * 立即执行本地同步
     */
    syncNow(): void {
        const now = Date.now();
        
        // 避免过于频繁的同步
        if (now - this.lastLocalSync < 1000) {
            return;
        }
        
        this.lastLocalSync = now;
        
        this.performLocalSync().catch(error => {
            console.error('[Kiro] Local sync failed:', error);
        });
    }

    /**
     * 立即执行云端同步
     */
    cloudSyncNow(): void {
        const now = Date.now();

        // 避免过于频繁的云端同步
        if (now - this.lastCloudSync < 5000) {
            return;
        }

        this.lastCloudSync = now;

        this.performCloudSync().catch(error => {
            console.error('[Kiro] Cloud sync failed:', error);
        });
    }
    
    /**
     * 执行本地同步 - 保存到本地 Markdown 文件
     */
    private async performLocalSync(): Promise<void> {
        const reader = new KiroReader(this.storageDir);

        if (!reader.exists()) {
            console.warn('[Kiro] Storage directory not found:', this.storageDir);
            return;
        }

        // 收集会话数据用于后续云端同步
        const sessionsToCache: CachedSession[] = [];

        try {
            const conversations = reader.getAllConversations();

            if (conversations.length === 0) {
                return;
            }
            
            let savedCount = 0;
            for (const conversation of conversations) {
                // 只处理属于当前工作区的对话
                if (!this.workspaceFilter.belongsToCurrentWorkspace(conversation)) {
                    continue;
                }

                // 构建对话（传递 reader 以便查找执行日志文件）
                const builder = new KiroConversationBuilder(this.t, reader);
                const messages = builder.buildConversation(conversation);

                if (messages.length === 0) {
                    continue;
                }

                // 生成 Markdown
                const generator = new KiroMarkdownGenerator(this.t);
                const markdown = generator.generate(conversation, messages);

                // 保存
                const config = vscode.workspace.getConfiguration('chatHistory');
                const outputDir = config.get<string>('outputDirectory', '.llm-chat-history');

                const saver = new HistorySaver(this.workspaceRoot, outputDir, 'kiro');

                const composerLike = {
                    composerId: conversation.id,
                    name: conversation.title || 'Untitled Conversation',
                    createdAt: new Date(conversation.createdAt || Date.now()).toISOString()
                };

                const savedPath = await saver.save(composerLike as any, markdown);
                console.log(`[Kiro] Saved conversation ${conversation.id} to: ${savedPath}`);
                savedCount++;

                // 缓存会话数据供云端同步使用
                // 转换 KiroChatMessage 为 Message 格式
                const convertedMessages: Message[] = messages.map(msg => ({
                    id: msg.id,
                    type: msg.type,
                    text: msg.text,
                    timestamp: msg.timestamp,
                }));

                sessionsToCache.push({
                    title: conversation.title || 'Untitled',
                    session_id: conversation.id,
                    workspace_path: conversation.workspacePath || this.workspaceRoot,
                    workspace_name: (conversation.workspacePath || this.workspaceRoot).split(/[/\\]/).pop() || 'Unknown',
                    messages: convertedMessages,
                });
            }

            // 更新缓存
            this.cachedSessions = sessionsToCache;

            // 更新侧边栏统计信息
            if (savedCount > 0) {
                const automationProvider = (global as any).__automationStatusProvider;
                if (automationProvider) {
                    const now = new Date();
                    const timeStr = now.toLocaleString();
                    automationProvider.updateStats(timeStr, savedCount);
                }
            }
            
        } catch (error) {
            console.error('[Kiro] Error during sync:', error);
            console.error('[Kiro] Stack trace:', (error as Error).stack);
            trackError('sync_error', String(error), 'kiro');
            throw error;
        }
    }

    /**
     * 执行云端同步 - 将缓存的会话数据同步到云端
     */
    private async performCloudSync(): Promise<void> {
        const cloudSync = (global as any).__cloudSyncManager as CloudSyncManager | undefined;
        const shouldCloudSync = cloudSync?.isLoggedIn() && cloudSync?.isEnabled() && cloudSync?.isAutoSyncEnabled();

        if (!shouldCloudSync || !cloudSync) {
            return;
        }

        if (this.cachedSessions.length === 0) {
            console.log('[Kiro] No sessions to sync to cloud');
            return;
        }

        // 上报云同步开始事件
        trackEvent(TelemetryEvents.CLOUD_SYNC_STARTED, {
            source: 'kiro',
            sessions_count: this.cachedSessions.length,
        });

        try {
            // 转换缓存的会话为云端同步格式
            const cloudSessions: SyncSession[] = this.cachedSessions.map(session => ({
                title: session.title,
                session_id: session.session_id,
                workspace_path: session.workspace_path,
                workspace_name: session.workspace_name,
                messages: cloudSync.convertMessages(session.messages),
            }));

            await cloudSync.syncSessions('kiro', cloudSessions);
            console.log(`[Kiro] Synced ${cloudSessions.length} sessions to cloud`);

            // 上报云同步成功事件
            trackEvent(TelemetryEvents.CLOUD_SYNC_COMPLETED, {
                source: 'kiro',
                sessions_count: cloudSessions.length,
            });
        } catch (error) {
            console.error('[Kiro] Cloud sync failed:', error);

            // 上报云同步失败事件
            const errorMessage = error instanceof Error ? error.message : String(error);
            trackEvent(TelemetryEvents.CLOUD_SYNC_FAILED, {
                source: 'kiro',
                error_message: errorMessage,
            });
            trackError('cloud_sync_error', errorMessage, 'kiro');
        }
    }
}
