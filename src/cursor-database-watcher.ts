/**
 * 数据库监听器
 * 监听 Cursor 数据库变化并自动同步
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import { CursorDatabaseReader } from './cursor-database-reader';
import { ConversationBuilder } from './cursor-conversation-builder';
import { MarkdownGenerator } from './cursor-markdown-generator';
import { HistorySaver } from './history-saver';
import { WorkspaceFilter } from './cursor-workspace-filter';
import { createTranslator, LocaleSetting, Translator } from './i18n';
import { SqliteLoader } from './sqlite-loader';

export class DatabaseWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private dbPath: string;
    private lastSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: WorkspaceFilter;
    private t: Translator;
    private extensionPath: string;

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
        // 1. 立即执行一次同步
        this.syncNow();

        // 2. 监听数据库文件变化
        this.watcher = chokidar.watch(this.dbPath, {
            persistent: true,
            ignoreInitial: true
        });

        this.watcher.on('change', () => {
            this.scheduleSync();
        });

        // 3. 定时轮询（兜底，每 30 秒）
        setInterval(() => {
            this.syncNow();
        }, 30000); // 30 秒

        console.log('Database watcher started');
    }

    /**
     * 停止监听
     */
    stop(): void {
        if (this.watcher) {
            this.watcher.close();
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
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
     * 立即同步
     */
    syncNow(): void {
        const now = Date.now();

        // 避免过于频繁的同步
        if (now - this.lastSync < 1000) {
            return;
        }

        this.lastSync = now;

        this.performSync().catch(error => {
            console.error('Sync failed:', error);
        });
    }

    /**
     * 执行同步
     */
    private async performSync(): Promise<void> {
        let reader: CursorDatabaseReader;

        try {
            // 首先尝试创建数据库读取器
            reader = new CursorDatabaseReader(this.dbPath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // 检查是否是 SQLite3 兼容性问题
            if (errorMessage.includes('NODE_MODULE_VERSION') ||
                errorMessage.includes('SQLITE_COMPATIBILITY_ERROR') ||
                errorMessage.includes('compiled against a different Node.js version')) {

                console.log('Detected SQLite3 compatibility issue, attempting to fix...');

                // 尝试重新加载 SQLite3
                const sqliteLoader = new SqliteLoader(this.extensionPath);
                const sqliteReady = await sqliteLoader.ensureLoaded();

                if (!sqliteReady) {
                    throw new Error('Failed to load compatible SQLite3 binary. Please check the extension logs for more details.');
                }

                // 重新尝试创建数据库读取器
                reader = new CursorDatabaseReader(this.dbPath);
            } else {
                throw error;
            }
        }

        try {
            // 获取所有 composer
            const composers = reader.getAllComposers();

            console.log(`Found ${composers.length} composers`);

            for (const composer of composers) {
                // 只处理属于当前工作区的对话
                const belongsToWorkspace = this.workspaceFilter.belongsToCurrentWorkspace(
                    composer,
                    reader
                );
                if (!belongsToWorkspace) {
                    continue;
                }

                // 获取 bubble IDs
                const bubbleIds = (composer.fullConversationHeadersOnly || [])
                    .map(h => h.bubbleId);

                if (bubbleIds.length === 0) continue;

                // 获取 bubbles
                const bubbles = reader.getComposerBubbles(composer.composerId, bubbleIds);

                // 构建对话
                const builder = new ConversationBuilder(this.t);
                const messages = builder.buildConversation(composer, bubbles);

                if (messages.length === 0) continue;

                // 生成 Markdown
                const generator = new MarkdownGenerator(this.t);
                const markdown = generator.generate(composer, messages);

                // 保存
                const config = vscode.workspace.getConfiguration('chatHistory');
                const outputDir = config.get<string>('outputDirectory', '.llm-chat-history');

                const saver = new HistorySaver(this.workspaceRoot, outputDir);
                await saver.save(composer, markdown);
            }
        } finally {
            reader.close();
        }
    }
}
