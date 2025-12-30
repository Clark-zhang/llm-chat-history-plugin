/**
 * 数据库监听器
 * 监听 Cursor 数据库变化并自动同步
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import { CursorDatabaseReader } from './cursor-database-reader';
import { ConversationBuilder } from './cursor-conversation-builder';
import { MarkdownGenerator } from './cursor-markdown-generator';
import { HistorySaver } from '../../history-saver';
import { WorkspaceFilter } from './cursor-workspace-filter';
import { createTranslator, LocaleSetting, Translator } from '../../i18n';
import { SqliteLoader } from '../../sqlite-loader';
import { CloudSyncManager, SyncSession } from '../../cloud/cloud-sync';
import { Message } from '../../types';
import { trackEvent, trackError, TelemetryEvents } from '../../telemetry/telemetry';

// 缓存的会话数据，用于云端同步
interface CachedSession {
    title: string;
    session_id: string;
    workspace_path?: string;
    workspace_name?: string;
    messages: Message[];
}

export class DatabaseWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private dbPath: string;
    private lastLocalSync: number = 0;
    private lastCloudSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private cloudSyncTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: WorkspaceFilter;
    private t: Translator;
    private extensionPath: string;
    
    // 缓存会话数据，供云端同步使用
    private cachedSessions: CachedSession[] = [];

    constructor(dbPath: string, workspaceRoot: string, localeSetting?: LocaleSetting, extensionPath?: string) {
        this.dbPath = dbPath;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new WorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
        this.extensionPath = extensionPath || '';
    }

    /**
     * 启动监听
     */
    start(): void {
        // 上报 watcher 启动事件
        trackEvent(TelemetryEvents.WATCHER_STARTED, { source: 'cursor' });

        // 1. 立即执行一次本地同步
        this.syncNow();

        // 2. 监听数据库文件变化
        this.watcher = chokidar.watch(this.dbPath, {
            persistent: true,
            ignoreInitial: true
        });

        this.watcher.on('change', () => {
            this.scheduleSync();
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

        console.log('Database watcher started (local: 30s, cloud: 60s)');
    }

    /**
     * 停止监听
     */
    stop(): void {
        // 上报 watcher 停止事件
        trackEvent(TelemetryEvents.WATCHER_STOPPED, { source: 'cursor' });

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
     * 调度同步（防抖）- 仅本地保存
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
        console.log('[Cursor:syncNow] ========== Starting sync ==========');
        console.log(`[Cursor:syncNow] Database path: ${this.dbPath}`);
        console.log(`[Cursor:syncNow] Workspace root: ${this.workspaceRoot}`);
        
        const now = Date.now();

        // 避免过于频繁的同步
        if (now - this.lastLocalSync < 1000) {
            console.log('[Cursor:syncNow] Skipped: Too frequent (< 1s since last sync)');
            return;
        }

        this.lastLocalSync = now;

        this.performLocalSync().catch(error => {
            console.error('[Cursor:syncNow] Local sync failed:', error);
            console.error('[Cursor:syncNow] Error stack:', error instanceof Error ? error.stack : 'N/A');
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
            console.error('Cloud sync failed:', error);
        });
    }

    /**
     * 执行本地同步 - 保存到本地 Markdown 文件
     */
    private async performLocalSync(): Promise<void> {
        console.log('[Cursor:performLocalSync] ========== Starting local sync ==========');
        let reader: CursorDatabaseReader;

        try {
            // 首先尝试创建数据库读取器
            console.log('[Cursor:performLocalSync] Creating database reader...');
            reader = new CursorDatabaseReader(this.dbPath);
            console.log('[Cursor:performLocalSync] Database reader created successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[Cursor:performLocalSync] Failed to create database reader:', errorMessage);

            // 检查是否是 SQLite3 兼容性问题
            if (errorMessage.includes('NODE_MODULE_VERSION') ||
                errorMessage.includes('SQLITE_COMPATIBILITY_ERROR') ||
                errorMessage.includes('compiled against a different Node.js version')) {

                console.log('[Cursor:performLocalSync] Detected SQLite3 compatibility issue, attempting to fix...');

                // 尝试重新加载 SQLite3
                const sqliteLoader = new SqliteLoader(this.extensionPath);
                const sqliteReady = await sqliteLoader.ensureLoaded();

                if (!sqliteReady) {
                    console.error('[Cursor:performLocalSync] Failed to load compatible SQLite3 binary');
                    throw new Error('Failed to load compatible SQLite3 binary. Please check the extension logs for more details.');
                }

                // 重新尝试创建数据库读取器
                console.log('[Cursor:performLocalSync] Retrying database reader creation...');
                reader = new CursorDatabaseReader(this.dbPath);
            } else {
                throw error;
            }
        }

        // 收集会话数据用于后续云端同步
        const sessionsToCache: CachedSession[] = [];

        try {
            // 获取所有 composer
            console.log('[Cursor:performLocalSync] Fetching all composers from database...');
            const composers = reader.getAllComposers();

            console.log(`[Cursor:performLocalSync] Found ${composers.length} composers`);
            console.log(`[Cursor:performLocalSync] Current workspace: ${this.workspaceRoot}`);

            if (composers.length === 0) {
                console.log('[Cursor:performLocalSync] No composers found in database. Check if Cursor has chat history.');
            }

            let skippedCount = 0;
            let processedCount = 0;
            for (const composer of composers) {
                console.log(`[Cursor:performLocalSync] Processing composer: ${composer.name || composer.composerId}`);
                
                // 只处理属于当前工作区的对话
                const belongsToWorkspace = this.workspaceFilter.belongsToCurrentWorkspace(
                    composer,
                    reader
                );
                if (!belongsToWorkspace) {
                    console.log(`[Cursor:performLocalSync] Skipped (not in workspace): ${composer.name || composer.composerId}`);
                    skippedCount++;
                    continue;
                }
                console.log(`[Cursor:performLocalSync] ✓ Matched composer: ${composer.name || composer.composerId}`);

                // 获取 bubble IDs
                const bubbleIds = (composer.fullConversationHeadersOnly || [])
                    .map(h => h.bubbleId);

                console.log(`[Cursor:performLocalSync] Bubble IDs count: ${bubbleIds.length}`);
                if (bubbleIds.length === 0) {
                    console.log('[Cursor:performLocalSync] Skipped: No bubble IDs');
                    continue;
                }

                // 获取 bubbles
                const bubbles = reader.getComposerBubbles(composer.composerId, bubbleIds);
                console.log(`[Cursor:performLocalSync] Bubbles retrieved: ${bubbles.length}`);

                // 构建对话
                const builder = new ConversationBuilder(this.t);
                const messages = builder.buildConversation(composer, bubbles);
                console.log(`[Cursor:performLocalSync] Messages built: ${messages.length}`);

                if (messages.length === 0) {
                    console.log('[Cursor:performLocalSync] Skipped: No messages');
                    continue;
                }

                // 生成 Markdown
                const generator = new MarkdownGenerator(this.t);
                const markdown = generator.generate(composer, messages);
                console.log(`[Cursor:performLocalSync] Markdown generated: ${markdown.length} chars`);

                // 保存到本地
                const config = vscode.workspace.getConfiguration('chatHistory');
                const outputDir = config.get<string>('outputDirectory', '.llm-chat-history');
                console.log(`[Cursor:performLocalSync] Output directory: ${outputDir}`);

                const saver = new HistorySaver(this.workspaceRoot, outputDir, 'cursor');
                console.log(`[Cursor:performLocalSync] Saving to: ${this.workspaceRoot}/${outputDir}`);
                await saver.save(composer, markdown);
                processedCount++;

                // 缓存会话数据供云端同步使用
                sessionsToCache.push({
                    title: composer.name || 'Untitled',
                    session_id: composer.composerId,
                    workspace_path: this.workspaceRoot,
                    workspace_name: this.workspaceRoot.split(/[/\\]/).pop() || 'Unknown',
                    messages: messages,
                });
            }

            // 更新缓存
            this.cachedSessions = sessionsToCache;
            
            console.log('[Cursor:performLocalSync] ========== Summary ==========');
            console.log(`[Cursor:performLocalSync] Total composers: ${composers.length}`);
            console.log(`[Cursor:performLocalSync] Skipped (not in workspace): ${skippedCount}`);
            console.log(`[Cursor:performLocalSync] Processed and saved: ${processedCount}`);
            console.log(`[Cursor:performLocalSync] Cached for cloud: ${sessionsToCache.length}`);

            // 更新侧边栏统计信息
            const automationProvider = (global as any).__automationStatusProvider;
            if (automationProvider && composers.length > 0) {
                const now = new Date();
                const timeStr = now.toLocaleString();
                automationProvider.updateStats(timeStr, composers.length);
            }
            
            console.log('[Cursor:performLocalSync] ========== Local sync completed ==========');
        } finally {
            reader.close();
            console.log('[Cursor:performLocalSync] Database connection closed');
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
            console.log('[CloudSync] No sessions to sync');
            return;
        }

        // 上报云同步开始事件
        trackEvent(TelemetryEvents.CLOUD_SYNC_STARTED, {
            source: 'cursor',
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

            await cloudSync.syncSessions('cursor', cloudSessions);
            console.log(`[CloudSync] Synced ${cloudSessions.length} sessions to cloud`);

            // 上报云同步成功事件
            trackEvent(TelemetryEvents.CLOUD_SYNC_COMPLETED, {
                source: 'cursor',
                sessions_count: cloudSessions.length,
            });
        } catch (error) {
            console.error('[CloudSync] Cloud sync failed:', error);

            // 上报云同步失败事件
            const errorMessage = error instanceof Error ? error.message : String(error);
            trackEvent(TelemetryEvents.CLOUD_SYNC_FAILED, {
                source: 'cursor',
                error_message: errorMessage,
            });
            trackError('cloud_sync_error', errorMessage, 'cursor');
        }
    }
}
