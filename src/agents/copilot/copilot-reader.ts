/**
 * Copilot Chat 数据读取器
 * 负责从 GitHub Copilot Chat 的 workspaceStorage 中读取对话数据
 */

import * as fs from 'fs';
import * as path from 'path';
import { CopilotChatSession, CopilotStorageData } from './copilot-types';

export class CopilotReader {
    private workspaceStorageDir: string;
    
    constructor(workspaceStorageDir: string) {
        this.workspaceStorageDir = workspaceStorageDir;
    }
    
    /**
     * 获取所有会话
     */
    getAllConversations(): CopilotStorageData[] {
        if (!fs.existsSync(this.workspaceStorageDir)) {
            console.warn('[Copilot] Workspace storage directory not found:', this.workspaceStorageDir);
            return [];
        }

        const conversations: CopilotStorageData[] = [];
        
        try {
            // 遍历所有 sessionId 目录
            const sessionDirs = fs.readdirSync(this.workspaceStorageDir);
            
            for (const sessionId of sessionDirs) {
                const sessionDir = path.join(this.workspaceStorageDir, sessionId);
                const stat = fs.statSync(sessionDir);
                
                // 跳过非目录项
                if (!stat.isDirectory()) {
                    continue;
                }
                
                // 跳过特殊目录
                if (sessionId === 'ext-dev' || sessionId.startsWith('.')) {
                    continue;
                }
                
                // 读取该 session 下的所有对话
                const sessionConversations = this.readConversationsFromSession(sessionDir, sessionId);
                conversations.push(...sessionConversations);
            }
            
        } catch (error) {
            console.error('[Copilot] Error reading conversations:', error);
        }
        
        return conversations.sort((a, b) => {
            return b.updatedAt - a.updatedAt; // 最新的在前
        });
    }
    
    /**
     * 从单个 session 目录读取所有对话
     */
    private readConversationsFromSession(sessionDir: string, sessionId: string): CopilotStorageData[] {
        const conversations: CopilotStorageData[] = [];
        
        try {
            // 读取工作区信息
            const workspaceJsonPath = path.join(sessionDir, 'workspace.json');
            let workspacePath: string | undefined;
            
            if (fs.existsSync(workspaceJsonPath)) {
                try {
                    const workspaceData = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf-8'));
                    if (workspaceData.folder) {
                        // 提取文件路径（去除 file:// 前缀）
                        workspacePath = workspaceData.folder.replace(/^file:\/\//, '');
                    }
                } catch (error) {
                    console.warn(`[Copilot] Failed to parse workspace.json in ${sessionId}:`, error);
                }
            }
            
            // 读取 chatSessions 目录下的所有 JSON 文件
            const chatSessionsDir = path.join(sessionDir, 'chatSessions');
            if (fs.existsSync(chatSessionsDir)) {
                const chatSessionFiles = fs.readdirSync(chatSessionsDir);
                
                for (const fileName of chatSessionFiles) {
                    if (!fileName.endsWith('.json')) {
                        continue;
                    }
                    
                    const chatSessionId = fileName.replace('.json', '');
                    const chatSessionPath = path.join(chatSessionsDir, fileName);
                    
                    try {
                        const sessionData = JSON.parse(fs.readFileSync(chatSessionPath, 'utf-8')) as CopilotChatSession;
                        
                        // 获取文件修改时间作为更新时间
                        const stat = fs.statSync(chatSessionPath);
                        const updatedAt = stat.mtimeMs;
                        
                        // 尝试从第一个请求获取创建时间
                        const createdAt = sessionData.requests && sessionData.requests.length > 0
                            ? updatedAt - (sessionData.requests.length * 60000) // 估算：每个请求间隔1分钟
                            : updatedAt;
                        
                        // 生成标题（使用第一个请求的文本）
                        let title = 'Untitled Conversation';
                        if (sessionData.requests && sessionData.requests.length > 0) {
                            const firstRequest = sessionData.requests[0];
                            if (firstRequest.message && firstRequest.message.text) {
                                const text = firstRequest.message.text.trim();
                                title = text.substring(0, 100); // 限制长度
                            }
                        }
                        
                        conversations.push({
                            id: chatSessionId,
                            title,
                            createdAt,
                            updatedAt,
                            session: sessionData,
                            workspacePath,
                            workspaceRoot: workspacePath
                        });
                    } catch (error) {
                        console.warn(`[Copilot] Failed to parse chat session ${chatSessionId}:`, error);
                    }
                }
            }
            
        } catch (error) {
            console.warn(`[Copilot] Failed to read session ${sessionId}:`, error);
        }
        
        return conversations;
    }
    
    /**
     * 检查存储目录是否存在
     */
    exists(): boolean {
        return fs.existsSync(this.workspaceStorageDir);
    }
}

/**
 * 获取 Copilot Chat workspaceStorage 路径
 */
export function getCopilotStoragePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    
    // 检测当前运行环境
    const appName = detectIDEType();
    
    console.log('[Copilot] getCopilotStoragePath:');
    console.log('[Copilot]   - platform:', platform);
    console.log('[Copilot]   - appName:', appName);
    
    let storagePath: string;
    
    if (platform === 'win32') {
        storagePath = path.join(
            homeDir,
            `AppData/Roaming/${appName}/User/workspaceStorage`
        );
    } else if (platform === 'darwin') {
        storagePath = path.join(
            homeDir,
            `Library/Application Support/${appName}/User/workspaceStorage`
        );
    } else {
        // Linux
        storagePath = path.join(
            homeDir,
            `.config/${appName}/User/workspaceStorage`
        );
    }
    
    console.log('[Copilot]   - storagePath:', storagePath);
    return storagePath;
}

/**
 * 检测当前 IDE 类型
 * 优先检测 Cursor（因为 Cursor 基于 VS Code，会同时设置 VS Code 的环境变量）
 */
function detectIDEType(): 'Code' | 'Cursor' {
    // 方法1：检查可执行路径（最可靠）
    const execPath = process.execPath?.toLowerCase() || '';
    if (execPath.includes('cursor')) {
        return 'Cursor';
    }
    
    // 方法2：检查 Cursor 特有的环境变量
    if (process.env.CURSOR_PID || process.env.CURSOR_DATA_FOLDER) {
        return 'Cursor';
    }
    
    // 方法3：检查当前工作目录
    const cwd = process.cwd()?.toLowerCase() || '';
    if (cwd.includes('cursor')) {
        return 'Cursor';
    }
    
    // 默认使用 VS Code
    return 'Code';
}
