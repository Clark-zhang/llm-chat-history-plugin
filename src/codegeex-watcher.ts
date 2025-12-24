/**
 * CodeGeeX 文件监听器
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import * as path from 'path';
import { CodeGeeXReader } from './codegeex-reader';
import { CodeGeeXConversationBuilder } from './codegeex-conversation-builder';
import { CodeGeeXMarkdownGenerator } from './codegeex-markdown-generator';
import { HistorySaver } from './history-saver';
import { CodeGeeXWorkspaceFilter } from './codegeex-workspace-filter';
import { createTranslator, LocaleSetting, Translator } from './i18n';

export class CodeGeeXWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private storageDir: string;
    private lastSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: CodeGeeXWorkspaceFilter;
    private t: Translator;

    constructor(storageDir: string, workspaceRoot: string, localeSetting?: LocaleSetting) {
        this.storageDir = storageDir;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new CodeGeeXWorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
    }

    start(): void {
        console.log('[CodeGeeX] Starting watcher for:', this.storageDir);
        this.syncNow();

        const conversationsDir = path.join(this.storageDir, 'conversations');

        if (!conversationsDir) {
            console.warn('[CodeGeeX] Conversations directory not found:', conversationsDir);
            return;
        }

        this.watcher = chokidar.watch(conversationsDir, {
            persistent: true,
            ignoreInitial: true,
            depth: 1,
            awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
        });

        this.watcher.on('add', (filePath) => {
            console.log('[CodeGeeX] File added:', filePath);
            this.scheduleSync();
        });

        this.watcher.on('change', (filePath) => {
            console.log('[CodeGeeX] File changed:', filePath);
            this.scheduleSync();
        });

        this.watcher.on('error', (error) => {
            console.error('[CodeGeeX] Watcher error:', error);
        });

        setInterval(() => {
            this.syncNow();
        }, 30000);

        console.log('[CodeGeeX] Watcher started for:', this.storageDir);
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
            console.error('[CodeGeeX] Sync failed:', error);
        });
    }

    private async performSync(): Promise<void> {
        console.log('[CodeGeeX] Starting sync');
        const reader = new CodeGeeXReader(this.storageDir);

        if (!reader.exists()) {
            console.warn('[CodeGeeX] Storage directory not found:', this.storageDir);
            return;
        }

        try {
            const conversations = reader.getAllConversations();
            console.log(`[CodeGeeX] Found ${conversations.length} conversations`);

            if (conversations.length === 0) {
                return;
            }

            for (const conversation of conversations) {
                console.log(`[CodeGeeX] 🔍 Checking conversation: ${conversation.id} - ${conversation.title}`);

                const belongsToWorkspace = this.workspaceFilter.belongsToCurrentWorkspace(conversation);
                console.log(`[CodeGeeX] Workspace filter result: ${belongsToWorkspace}`);

                if (!belongsToWorkspace) {
                    console.log(`[CodeGeeX] ⏭️ Skipping conversation ${conversation.id} - not in current workspace`);
                    continue;
                }

                console.log(`[CodeGeeX] ✅ Processing conversation: ${conversation.id}`);

                const builder = new CodeGeeXConversationBuilder(this.t);
                const messages = builder.buildConversation(conversation);
                console.log(`[CodeGeeX] Built ${messages.length} messages for conversation ${conversation.id}`);

                if (messages.length === 0) {
                    console.log(`[CodeGeeX] ⚠️ No messages in conversation ${conversation.id}, skipping`);
                    continue;
                }

                const generator = new CodeGeeXMarkdownGenerator(this.t);
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
                console.log(`[CodeGeeX] Saved conversation ${conversation.id} to: ${savedPath}`);
            }

            console.log('[CodeGeeX] Sync completed');
        } catch (error) {
            console.error('[CodeGeeX] Error during sync:', error);
            throw error;
        }
    }
}
