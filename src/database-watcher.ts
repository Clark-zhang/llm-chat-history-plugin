/**
 * 数据库监听器
 * 监听 Cursor 数据库变化并自动同步
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import { CursorDatabaseReader } from './database-reader';
import { ConversationBuilder } from './conversation-builder';
import { MarkdownGenerator } from './markdown-generator';
import { HistorySaver } from './history-saver';
import { WorkspaceFilter } from './workspace-filter';
import { createTranslator, LocaleSetting, Translator } from './i18n';

export class DatabaseWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private dbPath: string;
    private lastSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: WorkspaceFilter;
    private t: Translator;
    
    constructor(dbPath: string, workspaceRoot: string, localeSetting?: LocaleSetting) {
        this.dbPath = dbPath;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new WorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
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
        
        // 3. 定时轮询（兜底，每 2 分钟）
        setInterval(() => {
            this.syncNow();
        }, 120000); // 2 分钟
        
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
        const reader = new CursorDatabaseReader(this.dbPath);
        
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


