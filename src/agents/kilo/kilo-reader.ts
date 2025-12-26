/**
 * Kilo 数据读取器
 */

import * as fs from 'fs';
import * as path from 'path';
import { KiloConversation, KiloMessage } from './kilo-types';

export class KiloReader {
    private tasksDir: string;

    constructor(private storageDir: string) {
        this.tasksDir = path.join(storageDir, 'tasks');
    }

    getAllConversations(): KiloConversation[] {
        console.log('[Kilo] === getAllConversations() called ===');
        console.log('[Kilo] Looking for tasks in:', this.tasksDir);

        if (!fs.existsSync(this.tasksDir)) {
            console.log('[Kilo] ❌ Tasks directory not found:', this.tasksDir);
            return [];
        }

        const taskDirs = fs.readdirSync(this.tasksDir);
        console.log(`[Kilo] 📁 Found ${taskDirs.length} task directories:`, taskDirs);

        const conversations: KiloConversation[] = [];

        for (const taskDirName of taskDirs) {
            console.log(`[Kilo] 🔄 Processing task: ${taskDirName}`);
            const task = this.getConversation(taskDirName);
            if (task) {
                conversations.push(task);
                console.log(`[Kilo] ✅ Task loaded successfully: ${taskDirName}`);
                console.log(`[Kilo]   - Title: ${task.title}`);
                console.log(`[Kilo]   - Messages: ${task.messages.length}`);
                console.log(`[Kilo]   - Workspace: ${task.workspaceFolder || 'undefined'}`);
            } else {
                console.warn(`[Kilo] ❌ Failed to load task: ${taskDirName}`);
            }
        }

        console.log(`[Kilo] 📊 Total conversations loaded: ${conversations.length}`);
        return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    getConversation(taskId: string): KiloConversation | null {
        const taskDir = path.join(this.tasksDir, taskId);
        console.log(`[Kilo] 📂 Reading task: ${taskId} from ${taskDir}`);

        if (!fs.existsSync(taskDir)) {
            console.log(`[Kilo] ❌ Task directory not found: ${taskDir}`);
            return null;
        }

        try {
            // 读取 API conversation
            const apiConvPath = path.join(taskDir, 'api_conversation_history.json');
            console.log(`[Kilo] 📄 Reading API conversation from: ${apiConvPath}`);
            const apiConversation: any[] = fs.existsSync(apiConvPath)
                ? JSON.parse(fs.readFileSync(apiConvPath, 'utf-8'))
                : [];
            console.log(`[Kilo] 📊 API conversation has ${apiConversation.length} messages`);

            // 读取 UI messages
            const uiMessagesPath = path.join(taskDir, 'ui_messages.json');
            console.log(`[Kilo] 📄 Reading UI messages from: ${uiMessagesPath}`);
            const uiMessages: any[] = fs.existsSync(uiMessagesPath)
                ? JSON.parse(fs.readFileSync(uiMessagesPath, 'utf-8'))
                : [];
            console.log(`[Kilo] 📊 UI messages has ${uiMessages.length} entries`);

            // 从UI消息中提取元数据
            const metadata = this.extractMetadataFromUIMessages(uiMessages, apiConversation, taskId);

            // 构建对话对象
            const conversation: KiloConversation = {
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
            console.error(`[Kilo] Failed to read conversation ${taskId}:`, error);
            return null;
        }
    }

    exists(): boolean {
        return fs.existsSync(this.storageDir) && fs.existsSync(this.tasksDir);
    }

    private extractMetadataFromUIMessages(uiMessages: any[], apiMessages: any[], taskId: string): any {
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
            // Kilo可能在不同的地方存储模型信息
            const modelMessage = uiMessages.find(msg => msg.selectedModel);
            if (modelMessage && modelMessage.selectedModel) {
                model = `${modelMessage.selectedModel.provider}-${modelMessage.selectedModel.model}`;
            }

            // 提取工作区路径
            workspaceFolder = this.extractWorkspaceFolder(apiMessages);
        }

        return { title, createdAt, updatedAt, model, workspaceFolder };
    }

    private extractWorkspaceFolder(apiMessages: any[]): string | undefined {
        // 从API conversation中查找工作区路径
        for (const msg of apiMessages) {
            if (msg.content && Array.isArray(msg.content)) {
                for (const content of msg.content) {
                    if (content.type === 'text' && content.text) {
                        // 在文本内容中查找工作区路径
                        const cwdMatch = content.text.match(/Current Workspace Directory \(([^)]+)\)/);
                        if (cwdMatch && cwdMatch[1]) {
                            // 转换路径格式：d:/Projects/fang -> d:\Projects\fang
                            return cwdMatch[1].replace(/\//g, '\\');
                        }
                    }
                }
            }
        }
        return undefined;
    }

    private convertMessages(apiMessages: any[]): KiloMessage[] {
        const messages: KiloMessage[] = [];

        for (const msg of apiMessages) {
            if (msg.role && msg.content) {
                const message: KiloMessage = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    role: msg.role,
                    content: this.extractTextContent(msg.content),
                    timestamp: msg.ts ? new Date(msg.ts).toISOString() : new Date().toISOString(),
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
                // 处理 thinking 类型（Kilo/Cline 的思考过程）
                else if (item.type === 'thinking' && item.thinking) {
                    parts.push(`💭 思考过程：\n${item.thinking}`);
                }
                // 处理 tool_use 类型（简单描述）
                else if (item.type === 'tool_use' && item.name) {
                    parts.push(`🔧 工具调用: ${item.name}`);
                }
                // 处理 tool_result 类型
                else if (item.type === 'tool_result' && item.content) {
                    // tool_result 内容可能很长，只取摘要
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

export function getKiloStoragePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    const isVSCode = process.env.VSCODE_CWD !== undefined || process.env.VSCODE_PID !== undefined;
    const isCursor = process.env.CURSOR_PID !== undefined || process.env.CURSOR_DATA_FOLDER !== undefined;

    let appName = 'Code';
    if (isCursor && !isVSCode) {
        appName = 'Cursor';
    }

    if (platform === 'win32') {
        return path.join(homeDir, `AppData/Roaming/${appName}/User/globalStorage/kilocode.kilo-code`);
    } else if (platform === 'darwin') {
        return path.join(homeDir, `Library/Application Support/${appName}/User/globalStorage/kilocode.kilo-code`);
    } else {
        return path.join(homeDir, `.config/${appName}/User/globalStorage/kilocode.kilo-code`);
    }
}
