/**
 * Blackbox AI 文件监听器
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import * as path from 'path';
import { BlackboxReader } from './blackboxai-reader';
import { BlackboxConversationBuilder } from './blackboxai-conversation-builder';
import { BlackboxMarkdownGenerator } from './blackboxai-markdown-generator';
import { HistorySaver } from '../../history-saver';
import { BlackboxWorkspaceFilter } from './blackboxai-workspace-filter';
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

export class BlackboxWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private storageDir: string;
    private lastLocalSync: number = 0;
    private lastCloudSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private cloudSyncTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: BlackboxWorkspaceFilter;
    private t: Translator;

    // 缓存会话数据，供云端同步使用
    private cachedSessions: CachedSession[] = [];

    constructor(storageDir: string, workspaceRoot: string, localeSetting?: LocaleSetting) {
        this.storageDir = storageDir;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new BlackboxWorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
    }

    start(): void {
        // 上报 watcher 启动事件
        trackEvent(TelemetryEvents.WATCHER_STARTED, { source: 'blackboxai' });

        console.log('[BlackboxAI] Starting watcher for:', this.storageDir);
        this.syncNow();

        const conversationsDir = path.join(this.storageDir, 'conversations');

        if (!conversationsDir) {
            console.warn('[BlackboxAI] Conversations directory not found:', conversationsDir);
            return;
        }

        this.watcher = chokidar.watch(conversationsDir, {
            persistent: true,
            ignoreInitial: true,
            depth: 1,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
        });

        this.watcher.on('add', (filePath) => {
            console.log('[BlackboxAI] File added:', filePath);
            this.scheduleSync();
        });

        this.watcher.on('change', (filePath) => {
            console.log('[BlackboxAI] File changed:', filePath);
            this.scheduleSync();
        });

        this.watcher.on('error', (error) => {
            console.error('[BlackboxAI] Watcher error:', error);
            trackError('watcher_error', String(error), 'blackboxai');
        });

        // 定时轮询本地保存（每 30 秒）
        setInterval(() => {
            this.syncNow();
        }, 30000);

        // 定时云端同步（每 60 秒）
        setInterval(() => {
            this.cloudSyncNow();
        }, 60000);

        // 启动时延迟 5 秒执行一次云端同步（给本地同步时间收集数据）
        setTimeout(() => {
            this.cloudSyncNow();
        }, 5000);

        console.log('[BlackboxAI] Watcher started (local: 30s, cloud: 60s)');
    }

    stop(): void {
        // 上报 watcher 停止事件
        trackEvent(TelemetryEvents.WATCHER_STOPPED, { source: 'blackboxai' });

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

    private scheduleSync(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.syncNow();
        }, 2000);
    }

    syncNow(): void {
        const now = Date.now();
        if (now - this.lastLocalSync < 1000) {
            return;
        }

        this.lastLocalSync = now;

        this.performLocalSync().catch(error => {
            console.error('[BlackboxAI] Local sync failed:', error);
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
            console.error('[BlackboxAI] Cloud sync failed:', error);
        });
    }

    private async performLocalSync(): Promise<void> {
        console.log('[BlackboxAI] Starting local sync');
        const reader = new BlackboxReader(this.storageDir);

        if (!reader.exists()) {
            console.warn('[BlackboxAI] Storage directory not found:', this.storageDir);
            return;
        }

        // 收集会话数据用于后续云端同步
        const sessionsToCache: CachedSession[] = [];

        try {
            const conversations = reader.getAllConversations();
            console.log(`[BlackboxAI] Found ${conversations.length} conversations`);

            if (conversations.length === 0) {
                return;
            }

            let savedCount = 0;
            for (const conversation of conversations) {
                if (!this.workspaceFilter.belongsToCurrentWorkspace(conversation)) {
                    continue;
                }

                const builder = new BlackboxConversationBuilder(this.t);
                const messages = builder.buildConversation(conversation);

                if (messages.length === 0) {
                    continue;
                }

                const generator = new BlackboxMarkdownGenerator(this.t);
                const markdown = generator.generate(conversation, conversation.messages);

                const config = vscode.workspace.getConfiguration('chatHistory');
                const outputDir = config.get<string>('outputDirectory', '.llm-chat-history');

                const saver = new HistorySaver(this.workspaceRoot, outputDir, 'blackboxai');

                const composerLike = {
                    composerId: conversation.id,
                    name: conversation.title,
                    createdAt: conversation.createdAt
                };

                const savedPath = await saver.save(composerLike as any, markdown);
                console.log(`[BlackboxAI] Saved conversation ${conversation.id} to: ${savedPath}`);
                savedCount++;

                // 缓存会话数据供云端同步使用
                // 确保 toolResults 和 toolUses 格式正确
                const normalizedMessages: Message[] = messages.map(msg => ({
                    ...msg,
                    toolUses: msg.toolUses?.map((tu: any) => ({
                        name: tu.name,
                        markdown: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input),
                    })),
                    toolResults: msg.toolResults?.map((tr: any) => ({
                        name: tr.toolUseId || tr.name || 'unknown',
                        result: tr.content || tr.result,
                    })),
                }));

                sessionsToCache.push({
                    title: conversation.title || 'Untitled',
                    session_id: conversation.id,
                    workspace_path: this.workspaceRoot,
                    workspace_name: this.workspaceRoot.split(/[/\\]/).pop() || 'Unknown',
                    messages: normalizedMessages,
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

            console.log('[BlackboxAI] Local sync completed');
        } catch (error) {
            console.error('[BlackboxAI] Error during sync:', error);
            trackError('sync_error', String(error), 'blackboxai');
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
            console.log('[BlackboxAI] No sessions to sync to cloud');
            return;
        }

        // 上报云同步开始事件
        trackEvent(TelemetryEvents.CLOUD_SYNC_STARTED, {
            source: 'blackboxai',
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

            await cloudSync.syncSessions('blackboxai', cloudSessions);
            console.log(`[BlackboxAI] Synced ${cloudSessions.length} sessions to cloud`);

            // 上报云同步成功事件
            trackEvent(TelemetryEvents.CLOUD_SYNC_COMPLETED, {
                source: 'blackboxai',
                sessions_count: cloudSessions.length,
            });
        } catch (error) {
            console.error('[BlackboxAI] Cloud sync failed:', error);

            // 上报云同步失败事件
            const errorMessage = error instanceof Error ? error.message : String(error);
            trackEvent(TelemetryEvents.CLOUD_SYNC_FAILED, {
                source: 'blackboxai',
                error_message: errorMessage,
            });
            trackError('cloud_sync_error', errorMessage, 'blackboxai');
        }
    }
}
