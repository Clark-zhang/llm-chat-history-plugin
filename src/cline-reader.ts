/**
 * Cline 数据读取器
 * 负责从 Cline 的 JSON 文件读取任务数据
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    ClineTask,
    ClineTaskHistory,
    ClineTaskMetadata,
    ClineApiConversation,
    ClineUIMessages
} from './cline-types';

export class ClineReader {
    private tasksDir: string;
    
    constructor(private storageDir: string) {
        this.tasksDir = path.join(storageDir, 'tasks');
    }
    
    /**
     * 获取所有任务
     */
    getAllTasks(): ClineTask[] {
        // 读取任务历史索引
        const historyPath = path.join(this.storageDir, 'state', 'taskHistory.json');
        
        console.log('[DEBUG] ClineReader.getAllTasks()');
        console.log('[DEBUG] Looking for taskHistory at:', historyPath);
        
        if (!fs.existsSync(historyPath)) {
            console.warn('[DEBUG] Task history file not found:', historyPath);
            
            // 尝试列出 state 目录的内容
            const stateDir = path.join(this.storageDir, 'state');
            if (fs.existsSync(stateDir)) {
                const files = fs.readdirSync(stateDir);
                console.log('[DEBUG] Files in state directory:', files);
            } else {
                console.warn('[DEBUG] State directory does not exist:', stateDir);
            }
            
            return [];
        }
        
        console.log('[DEBUG] Task history file found');
        
        let taskItems: ClineTaskHistory['tasks'];
        try {
            const content = fs.readFileSync(historyPath, 'utf-8');
            console.log('[DEBUG] Task history content length:', content.length);
            
            const parsed = JSON.parse(content);
            
            // 支持两种格式：
            // 1. 直接是数组: [{id, task, ...}, ...]
            // 2. 包装在对象中: {tasks: [{id, task, ...}, ...]}
            if (Array.isArray(parsed)) {
                console.log('[DEBUG] Task history is a direct array');
                taskItems = parsed;
            } else if (parsed.tasks && Array.isArray(parsed.tasks)) {
                console.log('[DEBUG] Task history has tasks property');
                taskItems = parsed.tasks;
            } else {
                console.warn('[DEBUG] Unexpected task history format:', typeof parsed);
                return [];
            }
            
            console.log('[DEBUG] Task history parsed, tasks count:', taskItems.length);
        } catch (error) {
            console.error('[DEBUG] Failed to parse task history:', error);
            return [];
        }
        
        if (!taskItems || taskItems.length === 0) {
            console.log('[DEBUG] No tasks in task history');
            return [];
        }
        
        const tasks: ClineTask[] = [];
        
        for (const taskItem of taskItems) {
            console.log('[DEBUG] Reading task:', taskItem.id);
            const task = this.getTask(taskItem.id);
            if (task) {
                tasks.push(task);
                console.log('[DEBUG] Task loaded successfully:', taskItem.id);
            } else {
                console.warn('[DEBUG] Failed to load task:', taskItem.id);
            }
        }
        
        console.log(`[DEBUG] Total tasks loaded: ${tasks.length}`);
        
        return tasks;
    }
    
    /**
     * 获取指定任务
     */
    getTask(taskId: string): ClineTask | null {
        const taskDir = path.join(this.tasksDir, taskId);
        
        if (!fs.existsSync(taskDir)) {
            return null;
        }
        
        try {
            // 首先读取 UI messages（因为metadata处理需要用到它）
            const uiMessagesPath = path.join(taskDir, 'ui_messages.json');
            const uiMessages: ClineUIMessages = fs.existsSync(uiMessagesPath)
                ? this.parseClineDataFile(uiMessagesPath)
                : { messages: [] };

            // 读取 metadata
            const metadataPath = path.join(taskDir, 'task_metadata.json');
            const rawMetadata = fs.existsSync(metadataPath)
                ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
                : {};

            // 处理cline的metadata格式，转换为标准格式
            const metadata: ClineTaskMetadata = this.processClineMetadata(rawMetadata, taskId, uiMessages);

            // 读取 API conversation
            const apiConvPath = path.join(taskDir, 'api_conversation_history.json');
            const apiConversation: ClineApiConversation = fs.existsSync(apiConvPath)
                ? this.parseClineDataFile(apiConvPath)
                : { messages: [] };
            
            // 尝试读取工作区路径（可能在 UI messages 中）
            const workspaceRoot = this.extractWorkspaceRoot(uiMessages);
            
            return {
                id: taskId,
                metadata,
                apiConversation,
                uiMessages,
                workspaceRoot
            };
        } catch (error) {
            console.error(`Failed to read task ${taskId}:`, error);
            return null;
        }
    }
    
    /**
     * 处理cline的metadata格式，转换为标准格式
     */
    private processClineMetadata(rawMetadata: any, taskId: string, uiMessages: ClineUIMessages): ClineTaskMetadata {
        // 从model_usage中获取时间戳
        const ts = rawMetadata.model_usage?.[0]?.ts || Date.now();

        // 从UI消息中尝试提取任务名称
        let taskName = 'Untitled Task';
        if (uiMessages.messages && uiMessages.messages.length > 0) {
            const firstMessage = uiMessages.messages[0];
            if (firstMessage.text && typeof firstMessage.text === 'string') {
                // 提取第一行作为任务名称
                const lines = firstMessage.text.split('\n');
                if (lines[0] && lines[0].trim()) {
                    taskName = lines[0].trim().substring(0, 100); // 限制长度
                }
            }
        }

        // 从UI消息中提取token信息
        let tokensIn = 0;
        let tokensOut = 0;
        let totalCost = 0;

        if (uiMessages.messages) {
            for (const msg of uiMessages.messages) {
                if (msg.metrics?.tokens) {
                    tokensIn += msg.metrics.tokens.prompt || 0;
                    tokensOut += msg.metrics.tokens.completion || 0;
                }
            }
        }

        return {
            version: '1.0',
            id: taskId,
            ts: ts,
            task: taskName,
            tokensIn: tokensIn,
            tokensOut: tokensOut,
            totalCost: totalCost
        };
    }

    /**
     * 创建默认元数据
     */
    private createDefaultMetadata(taskId: string): ClineTaskMetadata {
        return {
            version: '1.0',
            id: taskId,
            ts: Date.now(),
            task: 'Untitled Task',
            tokensIn: 0,
            tokensOut: 0,
            totalCost: 0
        };
    }
    
    /**
     * 解析cline数据文件（支持直接数组和包装对象格式）
     */
    private parseClineDataFile(filePath: string): any {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        // 处理直接数组格式（cline的实际格式）
        if (Array.isArray(parsed)) {
            return { messages: parsed };
        }

        // 处理包装对象格式（兼容旧格式）
        return parsed;
    }

    /**
     * 从 UI messages 中提取工作区路径
     */
    private extractWorkspaceRoot(uiMessages: ClineUIMessages): string | undefined {
        // 尝试从 UI messages 中找到包含路径信息的消息
        for (const msg of uiMessages.messages) {
            // 检查path字段
            if (msg.path) {
                const dirPath = path.dirname(msg.path);
                if (dirPath && dirPath !== '.') {
                    return dirPath;
                }
            }

            // 检查text字段中的环境信息（cline格式）
            if (msg.text && typeof msg.text === 'string') {
                const cwdMatch = msg.text.match(/Current Working Directory \(([^)]+)\)/);
                if (cwdMatch && cwdMatch[1]) {
                    return cwdMatch[1];
                }
            }

            // 检查command字段
            if (msg.command && typeof msg.command === 'string') {
                // 如果command包含当前工作区路径，返回该路径
                if (msg.command.includes(this.storageDir)) {
                    return this.storageDir;
                }
            }
        }
        return undefined;
    }
    
    /**
     * 检查存储目录是否存在
     */
    exists(): boolean {
        return fs.existsSync(this.storageDir) && fs.existsSync(this.tasksDir);
    }
}

/**
 * 获取 Cline 存储路径
 */
export function getClineStoragePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    // 检测当前运行环境
    // 优先检查VSCode环境变量，然后检查Cursor环境变量
    const isVSCode = process.env.VSCODE_CWD !== undefined || process.env.VSCODE_PID !== undefined;
    const isCursor = process.env.CURSOR_PID !== undefined || process.env.CURSOR_DATA_FOLDER !== undefined;

    // 默认使用VSCode路径，因为cline插件主要在VSCode中运行
    let appName = 'Code'; // VSCode

    // 如果明确检测到Cursor环境，使用Cursor路径
    if (isCursor && !isVSCode) {
        appName = 'Cursor';
    }
    
    console.log('[DEBUG] getClineStoragePath:');
    console.log('  - platform:', platform);
    console.log('  - homeDir:', homeDir);
    console.log('  - VSCODE_CWD:', process.env.VSCODE_CWD);
    console.log('  - VSCODE_PID:', process.env.VSCODE_PID);
    console.log('  - CURSOR_PID:', process.env.CURSOR_PID);
    console.log('  - CURSOR_DATA_FOLDER:', process.env.CURSOR_DATA_FOLDER);
    console.log('  - isVSCode:', isVSCode);
    console.log('  - isCursor:', isCursor);
    console.log('  - appName:', appName);
    
    let storagePath: string;
    
    if (platform === 'win32') {
        storagePath = path.join(
            homeDir,
            `AppData/Roaming/${appName}/User/globalStorage/saoudrizwan.claude-dev`
        );
    } else if (platform === 'darwin') {
        storagePath = path.join(
            homeDir,
            `Library/Application Support/${appName}/User/globalStorage/saoudrizwan.claude-dev`
        );
    } else {
        // Linux
        storagePath = path.join(
            homeDir,
            `.config/${appName}/User/globalStorage/saoudrizwan.claude-dev`
        );
    }
    
    console.log('  - storagePath:', storagePath);
    
    return storagePath;
}

