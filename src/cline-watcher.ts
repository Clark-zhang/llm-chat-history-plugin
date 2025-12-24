/**
 * Cline 文件监听器
 * 监听 Cline 任务文件变化并自动同步
 */

import * as chokidar from 'chokidar';
import * as vscode from 'vscode';
import * as path from 'path';
import { ClineReader } from './cline-reader';
import { ClineConversationBuilder } from './cline-conversation-builder';
import { ClineMarkdownGenerator } from './cline-markdown-generator';
import { HistorySaver } from './history-saver';
import { ClineWorkspaceFilter } from './cline-workspace-filter';
import { createTranslator, LocaleSetting, Translator } from './i18n';

export class ClineWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private storageDir: string;
    private lastSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    private workspaceRoot: string;
    private workspaceFilter: ClineWorkspaceFilter;
    private t: Translator;
    
    constructor(storageDir: string, workspaceRoot: string, localeSetting?: LocaleSetting) {
        this.storageDir = storageDir;
        this.workspaceRoot = workspaceRoot;
        this.workspaceFilter = new ClineWorkspaceFilter(workspaceRoot);
        this.t = createTranslator(localeSetting);
    }
    
    /**
     * 启动监听
     */
    start(): void {
        console.log('[DEBUG] ClineWatcher.start() called');
        console.log('[DEBUG] Storage dir:', this.storageDir);
        console.log('[DEBUG] Workspace root:', this.workspaceRoot);
        
        // 1. 立即执行一次同步
        console.log('[DEBUG] Calling syncNow() immediately');
        this.syncNow();
        
        // 2. 监听任务目录变化
        const tasksDir = path.join(this.storageDir, 'tasks');
        const stateDir = path.join(this.storageDir, 'state');
        
        console.log('[DEBUG] Watching directories:', { tasksDir, stateDir });
        
        this.watcher = chokidar.watch(
            [tasksDir, stateDir],
            {
                persistent: true,
                ignoreInitial: true,
                depth: 2, // 监听子目录
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 100
                }
            }
        );
        
        this.watcher.on('add', (filePath) => {
            console.log('Cline file added:', filePath);
            this.scheduleSync();
        });
        
        this.watcher.on('change', (filePath) => {
            console.log('Cline file changed:', filePath);
            this.scheduleSync();
        });
        
        this.watcher.on('error', (error) => {
            console.error('[DEBUG] Cline watcher error:', error);
        });
        
        // 3. 定时轮询（兜底，每 2 分钟）
        setInterval(() => {
            console.log('[DEBUG] Periodic sync triggered');
            this.syncNow();
        }, 120000); // 2 分钟
        
        console.log('Cline watcher started for:', this.storageDir);
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
            console.error('Cline sync failed:', error);
        });
    }
    
    /**
     * 执行同步
     */
    private async performSync(): Promise<void> {
        console.log('[DEBUG] performSync() started');
        const reader = new ClineReader(this.storageDir);
        
        // 检查存储目录是否存在
        if (!reader.exists()) {
            console.warn('[DEBUG] Cline storage directory not found:', this.storageDir);
            return;
        }
        
        console.log('[DEBUG] Cline storage directory exists');
        
        try {
            // 获取所有任务
            const tasks = reader.getAllTasks();
            
            console.log(`[DEBUG] Found ${tasks.length} Cline tasks`);
            
            if (tasks.length === 0) {
                console.log('[DEBUG] No tasks found, skipping sync');
                return;
            }
            
            for (const task of tasks) {
                console.log(`[DEBUG] Processing task: ${task.id}`);
                console.log(`[DEBUG] Task workspace: ${task.workspaceRoot}`);
                console.log(`[DEBUG] Current workspace: ${this.workspaceRoot}`);
                
                // 只处理属于当前工作区的任务
                const belongsToWorkspace = this.workspaceFilter.belongsToCurrentWorkspace(task);
                
                console.log(`[DEBUG] Task belongs to workspace: ${belongsToWorkspace}`);
                
                if (!belongsToWorkspace) {
                    console.log(`[DEBUG] Skipping task ${task.id} - not in current workspace`);
                    continue;
                }
                
                // 构建对话
                const builder = new ClineConversationBuilder(this.t);
                const messages = builder.buildConversation(task);
                
                console.log(`[DEBUG] Built ${messages.length} messages for task ${task.id}`);
                
                if (messages.length === 0) {
                    console.log(`[DEBUG] No messages in task ${task.id}, skipping`);
                    continue;
                }
                
                // 生成 Markdown
                const generator = new ClineMarkdownGenerator(this.t);
                const markdown = generator.generate(task, messages);
                
                console.log(`[DEBUG] Generated markdown (${markdown.length} chars) for task ${task.id}`);
                
                // 保存
                const config = vscode.workspace.getConfiguration('chatHistory');
                const outputDir = config.get<string>('outputDirectory', '.llm-chat-history');
                
                console.log(`[DEBUG] Output directory: ${outputDir}`);
                
                const saver = new HistorySaver(this.workspaceRoot, outputDir);
                
                // 使用任务元数据创建 composer 兼容对象
                const composerLike = {
                    composerId: task.id,
                    name: task.metadata.task,
                    createdAt: new Date(task.metadata.ts).toISOString()
                };
                
                console.log(`[DEBUG] Saving task ${task.id} as: ${composerLike.name}`);
                const savedPath = await saver.save(composerLike as any, markdown);
                console.log(`[DEBUG] Saved to: ${savedPath}`);
            }
            
            console.log('[DEBUG] Cline sync completed successfully');
        } catch (error) {
            console.error('[DEBUG] Error during Cline sync:', error);
            console.error('[DEBUG] Stack trace:', (error as Error).stack);
            throw error;
        }
    }
}

