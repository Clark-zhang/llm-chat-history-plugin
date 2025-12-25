/**
 * Codex 文件监听器
 * 监听 GitHub Copilot Chat 文件变化并自动同步
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import * as path from 'path';
import { CodexReader } from './codex-reader';
import { CodexConversationBuilder } from './codex-conversation-builder';
import { CodexMarkdownGenerator } from './codex-markdown-generator';
import { HistorySaver } from '../../history-saver';
import { CodexWorkspaceFilter } from './codex-workspace-filter';
import { createTranslator, LocaleSetting, Translator } from '../../i18n';

export class CodexWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private storageDir: string;
    private lastSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: CodexWorkspaceFilter;
    private t: Translator;

    constructor(storageDir: string, workspaceRoot: string, localeSetting?: LocaleSetting) {
        this.storageDir = storageDir;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new CodexWorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
    }

    /**
     * 启动监听
     */
    start(): void {
        console.log('[Codex] Starting watcher for:', this.storageDir);

        // 1. 立即执行一次同步
        this.syncNow();

        // 2. 监听对话目录变化
        const conversationsDir = path.join(this.storageDir, 'conversations');

        if (!conversationsDir) {
            console.warn('[Codex] Conversations directory not found:', conversationsDir);
            return;
        }

        this.watcher = chokidar.watch(
            conversationsDir,
            {
                persistent: true,
                ignoreInitial: true,
                depth: 1,
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 100
                }
            }
        );

        this.watcher.on('add', (filePath) => {
            console.log('[Codex] File added:', filePath);
            this.scheduleSync();
        });

        this.watcher.on('change', (filePath) => {
            console.log('[Codex] File changed:', filePath);
            this.scheduleSync();
        });

        this.watcher.on('error', (error) => {
            console.error('[Codex] Watcher error:', error);
        });

        // 3. 定时轮询（兜底，每 30 秒）
        setInterval(() => {
            this.syncNow();
        }, 30000); // 30 秒

        console.log('[Codex] Watcher started for:', this.storageDir);
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
            console.error('[Codex] Sync failed:', error);
        });
    }

    /**
     * 执行同步
     */
    private async performSync(): Promise<void> {
        console.log('[Codex] Starting sync');
        const reader = new CodexReader(this.storageDir);

        // 检查存储目录是否存在
        if (!reader.exists()) {
            console.warn('[Codex] Storage directory not found:', this.storageDir);
            return;
        }

        try {
            // 获取所有对话
            const conversations = reader.getAllConversations();

            console.log(`[Codex] Found ${conversations.length} conversations`);

            if (conversations.length === 0) {
                return;
            }

            let savedCount = 0;
            for (const conversation of conversations) {
                // 只处理属于当前工作区的对话
                if (!this.workspaceFilter.belongsToCurrentWorkspace(conversation)) {
                    continue;
                }

                // 构建对话
                const builder = new CodexConversationBuilder(this.t);
                const messages = builder.buildConversation(conversation);

                if (messages.length === 0) {
                    continue;
                }

                // 生成 Markdown
                const generator = new CodexMarkdownGenerator(this.t);
                const markdown = generator.generate(conversation, conversation.messages);

                // 保存
                const config = vscode.workspace.getConfiguration('chatHistory');
                const outputDir = config.get<string>('outputDirectory', '.llm-chat-history');

                const saver = new HistorySaver(this.workspaceRoot, outputDir);

                // 创建兼容的 composer 对象
                const composerLike = {
                    composerId: conversation.id,
                    name: conversation.title,
                    createdAt: conversation.createdAt
                };

                const savedPath = await saver.save(composerLike as any, markdown);
                console.log(`[Codex] Saved conversation ${conversation.id} to: ${savedPath}`);
                savedCount++;
            }

            // 更新侧边栏统计信息
            if (savedCount > 0) {
                const automationProvider = (global as any).__automationStatusProvider;
                if (automationProvider) {
                    const now = new Date();
                    const timeStr = now.toLocaleString();
                    automationProvider.updateStats(timeStr, savedCount);
                }
            }

            console.log('[Codex] Sync completed');
        } catch (error) {
            console.error('[Codex] Error during sync:', error);
            throw error;
        }
    }
}
