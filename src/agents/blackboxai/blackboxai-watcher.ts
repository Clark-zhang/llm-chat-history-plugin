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

export class BlackboxWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private storageDir: string;
    private lastSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: BlackboxWorkspaceFilter;
    private t: Translator;

    constructor(storageDir: string, workspaceRoot: string, localeSetting?: LocaleSetting) {
        this.storageDir = storageDir;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new BlackboxWorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
    }

    start(): void {
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
        });

        setInterval(() => {
            this.syncNow();
        }, 30000);

        console.log('[BlackboxAI] Watcher started for:', this.storageDir);
    }

    stop(): void {
        if (this.watcher) {
            this.watcher.close();
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
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
        if (now - this.lastSync < 1000) {
            return;
        }

        this.lastSync = now;

        this.performSync().catch(error => {
            console.error('[BlackboxAI] Sync failed:', error);
        });
    }

    private async performSync(): Promise<void> {
        console.log('[BlackboxAI] Starting sync');
        const reader = new BlackboxReader(this.storageDir);

        if (!reader.exists()) {
            console.warn('[BlackboxAI] Storage directory not found:', this.storageDir);
            return;
        }

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

                const saver = new HistorySaver(this.workspaceRoot, outputDir);

                const composerLike = {
                    composerId: conversation.id,
                    name: conversation.title,
                    createdAt: conversation.createdAt
                };

                const savedPath = await saver.save(composerLike as any, markdown);
                console.log(`[BlackboxAI] Saved conversation ${conversation.id} to: ${savedPath}`);
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

            console.log('[BlackboxAI] Sync completed');
        } catch (error) {
            console.error('[BlackboxAI] Error during sync:', error);
            throw error;
        }
    }
}
