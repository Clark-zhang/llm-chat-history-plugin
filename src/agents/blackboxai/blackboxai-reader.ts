/**
 * Blackbox AI 数据读取器
 */

import * as fs from 'fs';
import * as path from 'path';
import { BlackboxConversation, BlackboxMessage } from './blackboxai-types';

export class BlackboxReader {
    private tasksDir: string;

    constructor(private storageDir: string) {
        this.tasksDir = path.join(storageDir, 'tasks');
    }

    getAllConversations(): BlackboxConversation[] {
        console.log('[BlackboxAI] getAllConversations() called');
        console.log('[BlackboxAI] Looking for tasks in:', this.tasksDir);

        if (!fs.existsSync(this.tasksDir)) {
            console.log('[BlackboxAI] Tasks directory not found:', this.tasksDir);
            return [];
        }

        const taskDirs = fs.readdirSync(this.tasksDir);
        console.log(`[BlackboxAI] Found ${taskDirs.length} task directories`);

        const conversations: BlackboxConversation[] = [];

        for (const taskDirName of taskDirs) {
            console.log(`[BlackboxAI] Processing task: ${taskDirName}`);
            const task = this.getConversation(taskDirName);
            if (task) {
                conversations.push(task);
                console.log(`[BlackboxAI] Task loaded successfully: ${taskDirName}`);
            } else {
                console.warn(`[BlackboxAI] Failed to load task: ${taskDirName}`);
            }
        }

        console.log(`[BlackboxAI] Total conversations loaded: ${conversations.length}`);
        return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    getConversation(taskId: string): BlackboxConversation | null {
        const taskDir = path.join(this.tasksDir, taskId);

        if (!fs.existsSync(taskDir)) {
            return null;
        }

        try {
            // 读取 API conversation
            const apiConvPath = path.join(taskDir, 'api_conversation_history.json');
            const apiConversation: any[] = fs.existsSync(apiConvPath)
                ? JSON.parse(fs.readFileSync(apiConvPath, 'utf-8'))
                : [];

            // 读取 UI messages
            const uiMessagesPath = path.join(taskDir, 'ui_messages.json');
            const uiMessages: any[] = fs.existsSync(uiMessagesPath)
                ? JSON.parse(fs.readFileSync(uiMessagesPath, 'utf-8'))
                : [];

            // 从UI消息中提取元数据
            const metadata = this.extractMetadataFromUIMessages(uiMessages, taskId);

            // 构建对话对象
            const conversation: BlackboxConversation = {
                id: taskId,
                title: metadata.title || `Task ${taskId}`,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
                messages: this.convertMessages(apiConversation),
                model: metadata.model,
                workspaceFolder: metadata.workspaceFolder
            };

            return conversation;
        } catch (error) {
            console.error(`[BlackboxAI] Failed to read conversation ${taskId}:`, error);
            return null;
        }
    }

    exists(): boolean {
        return fs.existsSync(this.storageDir) && fs.existsSync(this.tasksDir);
    }

    private extractMetadataFromUIMessages(uiMessages: any[], taskId: string): any {
        let title = `Task ${taskId}`;
        let createdAt = new Date().toISOString();
        let updatedAt = new Date().toISOString();
        let model = undefined;
        let workspaceFolder = undefined;

        if (uiMessages.length > 0) {
            // 找到第一个用户消息作为标题
            const firstUserMessage = uiMessages.find(msg =>
                msg.type === 'say' && msg.say === 'text' && msg.text
            );
            if (firstUserMessage) {
                const text = firstUserMessage.text;
                // 提取第一行作为标题
                const lines = text.split('\n');
                if (lines[0] && lines[0].trim()) {
                    title = lines[0].trim().substring(0, 100);
                }

                // 使用第一条消息的时间戳
                createdAt = new Date(firstUserMessage.ts).toISOString();
            }

            // 使用最后一条消息的时间戳作为更新时间
            const lastMessage = uiMessages[uiMessages.length - 1];
            if (lastMessage && lastMessage.ts) {
                updatedAt = new Date(lastMessage.ts).toISOString();
            }

            // 提取模型信息
            const modelMessage = uiMessages.find(msg => msg.selectedModel);
            if (modelMessage && modelMessage.selectedModel) {
                model = `${modelMessage.selectedModel.provider}-${modelMessage.selectedModel.model}`;
            }

            // 提取工作区路径
            workspaceFolder = this.extractWorkspaceFolder(uiMessages);
        }

        return { title, createdAt, updatedAt, model, workspaceFolder };
    }

    private extractWorkspaceFolder(uiMessages: any[]): string | undefined {
        // 查找包含工作区路径的消息
        for (const msg of uiMessages) {
            if (msg.type === 'say' && msg.say === 'api_req_started' && msg.text) {
                try {
                    const parsed = JSON.parse(msg.text);
                    if (parsed.request && typeof parsed.request === 'string') {
                        // 在请求文本中查找工作区路径
                        const cwdMatch = parsed.request.match(/Current Working Directory \(([^)]+)\)/);
                        if (cwdMatch && cwdMatch[1]) {
                            // 转换路径格式：d:/Projects/fang -> d:\Projects\fang
                            return cwdMatch[1].replace(/\//g, '\\');
                        }
                    }
                } catch (error) {
                    // 解析失败，继续查找
                }
            }
        }
        return undefined;
    }

    private convertMessages(apiMessages: any[]): BlackboxMessage[] {
        const messages: BlackboxMessage[] = [];

        for (const msg of apiMessages) {
            if (msg.role && msg.content) {
                const message: BlackboxMessage = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    role: msg.role,
                    content: this.extractTextContent(msg.content),
                    timestamp: new Date().toISOString(),
                    model: msg.model
                };
                messages.push(message);
            }
        }

        return messages;
    }

    private extractTextContent(content: any): string {
        if (typeof content === 'string') {
            return content;
        }

        if (Array.isArray(content)) {
            const parts: string[] = [];
            
            for (const item of content) {
                if (!item) continue;
                
                // 处理 text 类型
                if (item.type === 'text' && item.text) {
                    parts.push(item.text);
                }
                // 处理 thinking 类型（思考过程）
                else if (item.type === 'thinking' && item.thinking) {
                    parts.push(`💭 思考过程：\n${item.thinking}`);
                }
                // 处理 tool_use 类型（简单描述）
                else if (item.type === 'tool_use' && item.name) {
                    parts.push(`🔧 工具调用: ${item.name}`);
                }
                // 处理 tool_result 类型
                else if (item.type === 'tool_result' && item.content) {
                    const resultPreview = typeof item.content === 'string' 
                        ? item.content.substring(0, 500) 
                        : JSON.stringify(item.content).substring(0, 500);
                    parts.push(`📋 工具结果: ${resultPreview}${item.content?.length > 500 ? '...' : ''}`);
                }
                // 处理其他有 text 字段的类型
                else if (item.text) {
                    parts.push(item.text);
                }
            }
            
            return parts.join('\n\n');
        }

        // 处理对象类型（可能有 text 字段）
        if (typeof content === 'object' && content !== null && content.text) {
            return content.text;
        }

        return '';
    }
}

export function getBlackboxStoragePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    const isVSCode = process.env.VSCODE_CWD !== undefined || process.env.VSCODE_PID !== undefined;
    const isCursor = process.env.CURSOR_PID !== undefined || process.env.CURSOR_DATA_FOLDER !== undefined;

    let appName = 'Code';
    if (isCursor && !isVSCode) {
        appName = 'Cursor';
    }

    if (platform === 'win32') {
        return path.join(homeDir, `AppData/Roaming/${appName}/User/globalStorage/blackboxapp.blackboxagent`);
    } else if (platform === 'darwin') {
        return path.join(homeDir, `Library/Application Support/${appName}/User/globalStorage/blackboxapp.blackboxagent`);
    } else {
        return path.join(homeDir, `.config/${appName}/User/globalStorage/blackboxapp.blackboxagent`);
    }
}
