/**
 * Kiro 数据读取器
 * 负责从 Amazon Kiro IDE 的 globalStorage 中读取对话数据
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { KiroChatExecution, KiroSessionRecord, KiroSessionIndex, KiroStorageData } from './kiro-types';

export class KiroReader {
    private storageDir: string;
    
    constructor(storageDir: string) {
        this.storageDir = storageDir;
    }
    
    /**
     * 获取所有会话
     */
    getAllConversations(): KiroStorageData[] {
        if (!fs.existsSync(this.storageDir)) {
            console.warn('[Kiro] Storage directory not found:', this.storageDir);
            return [];
        }

        const conversations: KiroStorageData[] = [];
        
        try {
            // 1. 读取 workspace-sessions 中的会话记录（优先）
            const workspaceSessionsDir = path.join(this.storageDir, 'workspace-sessions');
            if (fs.existsSync(workspaceSessionsDir)) {
                const sessionConversations = this.readWorkspaceSessions(workspaceSessionsDir);
                conversations.push(...sessionConversations);
            }
            
            // 2. 读取工作区哈希目录下的 .chat 文件（执行记录）
            const executionConversations = this.readExecutionRecords();
            conversations.push(...executionConversations);
            
        } catch (error) {
            console.error('[Kiro] Error reading conversations:', error);
        }
        
        return conversations.sort((a, b) => {
            return b.updatedAt - a.updatedAt; // 最新的在前
        });
    }
    
    /**
     * 读取 workspace-sessions 目录下的会话记录
     */
    private readWorkspaceSessions(workspaceSessionsDir: string): KiroStorageData[] {
        const conversations: KiroStorageData[] = [];
        
        try {
            const workspaceDirs = fs.readdirSync(workspaceSessionsDir);
            
            for (const workspaceDirName of workspaceDirs) {
                const workspaceDir = path.join(workspaceSessionsDir, workspaceDirName);
                const stat = fs.statSync(workspaceDir);
                
                // 跳过非目录项
                if (!stat.isDirectory()) {
                    continue;
                }
                
                // 跳过特殊目录
                if (workspaceDirName.startsWith('.')) {
                    continue;
                }
                
                // 读取 sessions.json
                const sessionsJsonPath = path.join(workspaceDir, 'sessions.json');
                if (!fs.existsSync(sessionsJsonPath)) {
                    continue;
                }
                
                try {
                    const sessionsIndex = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8')) as KiroSessionIndex[];
                    
                    if (!Array.isArray(sessionsIndex)) {
                        continue;
                    }
                    
                    // 读取每个会话文件
                    for (const sessionIndex of sessionsIndex) {
                        const sessionFilePath = path.join(workspaceDir, `${sessionIndex.sessionId}.json`);
                        
                        if (!fs.existsSync(sessionFilePath)) {
                            continue;
                        }
                        
                        try {
                            const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf-8')) as KiroSessionRecord;
                            
                            // 跳过没有历史消息的会话
                            if (!sessionData.history || !Array.isArray(sessionData.history) || sessionData.history.length === 0) {
                                continue;
                            }
                            
                            // 获取文件修改时间
                            const stat = fs.statSync(sessionFilePath);
                            const updatedAt = stat.mtimeMs;
                            
                            // 解析创建时间
                            const createdAt = sessionIndex.dateCreated 
                                ? parseInt(sessionIndex.dateCreated, 10)
                                : updatedAt;
                            
                            conversations.push({
                                id: sessionIndex.sessionId,
                                title: sessionIndex.title || sessionData.title || 'Untitled Session',
                                createdAt,
                                updatedAt,
                                workspacePath: sessionIndex.workspaceDirectory || sessionData.workspaceDirectory,
                                workspaceRoot: sessionIndex.workspaceDirectory || sessionData.workspaceDirectory,
                                session: sessionData,
                                source: 'session'
                            });
                        } catch (error) {
                            console.warn(`[Kiro] Failed to parse session file ${sessionIndex.sessionId}:`, error);
                        }
                    }
                } catch (error) {
                    console.warn(`[Kiro] Failed to parse sessions.json in ${workspaceDirName}:`, error);
                }
            }
        } catch (error) {
            console.error('[Kiro] Error reading workspace sessions:', error);
        }
        
        return conversations;
    }
    
    /**
     * 读取工作区哈希目录下的执行记录（.chat 文件）
     */
    private readExecutionRecords(): KiroStorageData[] {
        const conversations: KiroStorageData[] = [];
        
        try {
            // 遍历所有工作区哈希目录
            const entries = fs.readdirSync(this.storageDir);
            
            for (const entry of entries) {
                const entryPath = path.join(this.storageDir, entry);
                const stat = fs.statSync(entryPath);
                
                // 跳过非目录项
                if (!stat.isDirectory()) {
                    continue;
                }
                
                // 跳过特殊目录
                if (entry === 'workspace-sessions' || 
                    entry === 'sessions' || 
                    entry === 'index' || 
                    entry === 'dev_data' ||
                    entry === 'default' ||
                    entry.startsWith('.') ||
                    entry === 'config.json') {
                    continue;
                }
                
                // 检查是否是子目录（子目录不应该读取，只读取直接的 .chat 文件）
                // 如果目录下还有子目录，说明这不是工作区哈希目录，跳过
                const subEntries = fs.readdirSync(entryPath);
                const hasSubDirs = subEntries.some(e => {
                    const subPath = path.join(entryPath, e);
                    return fs.statSync(subPath).isDirectory();
                });
                
                // 如果有子目录，跳过这个目录（这些是执行记录的中间目录，不是对话文件）
                if (hasSubDirs) {
                    continue;
                }
                
                // 读取该目录下的所有 .chat 文件
                try {
                    const chatFiles = fs.readdirSync(entryPath);
                    
                    for (const fileName of chatFiles) {
                        if (!fileName.endsWith('.chat')) {
                            continue;
                        }
                        
                        const chatFilePath = path.join(entryPath, fileName);
                        
                        try {
                            const executionData = JSON.parse(fs.readFileSync(chatFilePath, 'utf-8')) as KiroChatExecution;
                            
                            // 跳过没有聊天消息的执行记录
                            if (!executionData.chat || !Array.isArray(executionData.chat) || executionData.chat.length === 0) {
                                continue;
                            }
                            
                            // 检查是否有有效的用户或AI消息（排除tool消息）
                            const hasValidMessages = executionData.chat.some(msg => 
                                msg.role === 'human' || msg.role === 'bot'
                            );
                            if (!hasValidMessages) {
                                continue;
                            }
                            
                            // 获取文件修改时间
                            const stat = fs.statSync(chatFilePath);
                            const updatedAt = stat.mtimeMs;
                            
                            // 使用 metadata 中的时间信息
                            const createdAt = executionData.metadata?.startTime || updatedAt;
                            
                            // 生成标题（使用第一条用户消息）
                            let title = 'Untitled Execution';
                            if (executionData.chat && executionData.chat.length > 0) {
                                const firstUserMessage = executionData.chat.find(msg => msg.role === 'human');
                                if (firstUserMessage && firstUserMessage.content) {
                                    const text = firstUserMessage.content.trim();
                                    title = text.substring(0, 100); // 限制长度
                                }
                            }
                            
                            conversations.push({
                                id: executionData.executionId,
                                title,
                                createdAt,
                                updatedAt,
                                execution: executionData,
                                source: 'execution'
                            });
                        } catch (error) {
                            console.warn(`[Kiro] Failed to parse chat file ${fileName}:`, error);
                        }
                    }
                } catch (error) {
                    console.warn(`[Kiro] Failed to read directory ${entry}:`, error);
                }
            }
        } catch (error) {
            console.error('[Kiro] Error reading execution records:', error);
        }
        
        return conversations;
    }
    
    /**
     * 解码 base64 编码的工作区路径
     */
    static decodeWorkspacePath(encoded: string): string | null {
        try {
            // Base64 解码
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
            return decoded;
        } catch (error) {
            console.warn(`[Kiro] Failed to decode workspace path ${encoded}:`, error);
            return null;
        }
    }
    
    /**
     * 编码工作区路径为 base64
     */
    static encodeWorkspacePath(workspacePath: string): string {
        return Buffer.from(workspacePath, 'utf-8').toString('base64');
    }
    
    /**
     * 计算工作区路径的哈希（用于匹配工作区哈希目录）
     */
    static hashWorkspacePath(workspacePath: string): string {
        return crypto.createHash('md5').update(workspacePath).digest('hex');
    }
    
    /**
     * 检查存储目录是否存在
     */
    exists(): boolean {
        return fs.existsSync(this.storageDir);
    }
    
    /**
     * 查找执行日志文件
     * 根据 sessionId 和 executionId 在 profile_hash 目录下查找
     * 
     * @param sessionId 会话ID
     * @param executionId 执行ID
     * @param profileHash 可选的profile哈希，如果不提供则遍历所有profile目录
     * @returns 执行日志文件路径，如果未找到则返回null
     */
    findExecutionLog(sessionId: string, executionId: string, profileHash?: string): string | null {
        // 如果提供了 profileHash，只在该目录下查找
        if (profileHash) {
            return this.findExecutionLogInProfile(profileHash, sessionId, executionId);
        }
        
        // 否则遍历所有可能的 profile 目录
        try {
            const entries = fs.readdirSync(this.storageDir);
            
            for (const entry of entries) {
                const entryPath = path.join(this.storageDir, entry);
                const stat = fs.statSync(entryPath);
                
                // 跳过非目录项
                if (!stat.isDirectory()) {
                    continue;
                }
                
                // 跳过特殊目录
                if (entry === 'workspace-sessions' || 
                    entry === 'sessions' || 
                    entry === 'index' || 
                    entry === 'dev_data' ||
                    entry === 'default' ||
                    entry.startsWith('.') ||
                    entry === 'config.json') {
                    continue;
                }
                
                // 检查是否是 profile_hash 目录（32位十六进制字符串）
                if (!/^[a-f0-9]{32}$/i.test(entry)) {
                    continue;
                }
                
                const result = this.findExecutionLogInProfile(entry, sessionId, executionId);
                if (result) {
                    return result;
                }
            }
        } catch (error) {
            console.error('[Kiro] Error finding execution log:', error);
        }
        
        return null;
    }
    
    /**
     * 在指定的 profile 目录下查找执行日志文件
     */
    private findExecutionLogInProfile(profileHash: string, sessionId: string, executionId: string): string | null {
        const profileDir = path.join(this.storageDir, profileHash);
        
        if (!fs.existsSync(profileDir)) {
            return null;
        }
        
        try {
            // 遍历所有子目录
            const subDirs = fs.readdirSync(profileDir);
            
            for (const subDir of subDirs) {
                const subDirPath = path.join(profileDir, subDir);
                const stat = fs.statSync(subDirPath);
                
                // 跳过非目录项
                if (!stat.isDirectory()) {
                    continue;
                }
                
                // 遍历子目录下的所有文件
                try {
                    const files = fs.readdirSync(subDirPath);
                    
                    for (const fileName of files) {
                        const filePath = path.join(subDirPath, fileName);
                        const fileStat = fs.statSync(filePath);
                        
                        if (fileStat.isDirectory()) {
                            continue;
                        }
                        
                        // 支持 .chat 扩展名和没有扩展名的文件
                        // 跳过明显不是 JSON 的文件（如 .sqlite, .json 等已知格式）
                        if (fileName.endsWith('.sqlite') || 
                            fileName.endsWith('.db') ||
                            fileName === 'config.json' ||
                            fileName === 'sessions.json') {
                            continue;
                        }
                        
                        try {
                            const content = fs.readFileSync(filePath, 'utf-8');
                            const executionData = JSON.parse(content) as KiroChatExecution;
                            
                            // 验证是否是执行日志文件（必须有 executionId）
                            if (!executionData.executionId) {
                                continue;
                            }
                            
                            // 双重验证：chatSessionId 和 executionId
                            if (executionData.chatSessionId === sessionId && 
                                executionData.executionId === executionId) {
                                return filePath;
                            }
                        } catch (error) {
                            // 文件不是有效的 JSON，跳过
                            continue;
                        }
                    }
                } catch (error) {
                    // 无法读取子目录，跳过
                    continue;
                }
            }
        } catch (error) {
            console.error(`[Kiro] Error reading profile directory ${profileHash}:`, error);
        }
        
        return null;
    }
    
    /**
     * 获取会话的所有执行日志文件路径
     * 
     * @param sessionId 会话ID
     * @param profileHash 可选的profile哈希
     * @returns 执行日志文件路径数组
     */
    findAllExecutionLogsForSession(sessionId: string, profileHash?: string): string[] {
        const results: string[] = [];
        
        // 如果提供了 profileHash，只在该目录下查找
        if (profileHash) {
            return this.findAllExecutionLogsInProfile(profileHash, sessionId);
        }
        
        // 否则遍历所有可能的 profile 目录
        try {
            const entries = fs.readdirSync(this.storageDir);
            
            for (const entry of entries) {
                const entryPath = path.join(this.storageDir, entry);
                const stat = fs.statSync(entryPath);
                
                // 跳过非目录项
                if (!stat.isDirectory()) {
                    continue;
                }
                
                // 跳过特殊目录
                if (entry === 'workspace-sessions' || 
                    entry === 'sessions' || 
                    entry === 'index' || 
                    entry === 'dev_data' ||
                    entry === 'default' ||
                    entry.startsWith('.') ||
                    entry === 'config.json') {
                    continue;
                }
                
                // 检查是否是 profile_hash 目录（32位十六进制字符串）
                if (!/^[a-f0-9]{32}$/i.test(entry)) {
                    continue;
                }
                
                const profileResults = this.findAllExecutionLogsInProfile(entry, sessionId);
                results.push(...profileResults);
            }
        } catch (error) {
            console.error('[Kiro] Error finding execution logs:', error);
        }
        
        return results;
    }
    
    /**
     * 在指定的 profile 目录下查找所有匹配 sessionId 的执行日志文件
     */
    private findAllExecutionLogsInProfile(profileHash: string, sessionId: string): string[] {
        const results: string[] = [];
        const profileDir = path.join(this.storageDir, profileHash);
        
        if (!fs.existsSync(profileDir)) {
            console.log(`[Kiro] Profile directory does not exist: ${profileDir}`);
            return results;
        }
        
        try {
            // 遍历所有子目录
            const subDirs = fs.readdirSync(profileDir);
            console.log(`[Kiro] Searching in profile ${profileHash}, found ${subDirs.length} subdirectories`);
            
            for (const subDir of subDirs) {
                const subDirPath = path.join(profileDir, subDir);
                const stat = fs.statSync(subDirPath);
                
                // 跳过非目录项
                if (!stat.isDirectory()) {
                    continue;
                }
                
                // 遍历子目录下的所有文件
                try {
                    const files = fs.readdirSync(subDirPath);
                    console.log(`[Kiro] Checking subdirectory ${subDir}, found ${files.length} files`);
                    
                    for (const fileName of files) {
                        const filePath = path.join(subDirPath, fileName);
                        const fileStat = fs.statSync(filePath);
                        
                        if (fileStat.isDirectory()) {
                            continue;
                        }
                        
                        // 支持 .chat 扩展名和没有扩展名的文件
                        // 跳过明显不是 JSON 的文件
                        if (fileName.endsWith('.sqlite') || 
                            fileName.endsWith('.db') ||
                            fileName === 'config.json' ||
                            fileName === 'sessions.json') {
                            continue;
                        }
                        
                        try {
                            const content = fs.readFileSync(filePath, 'utf-8');
                            const executionData = JSON.parse(content) as KiroChatExecution;
                            
                            // 验证是否是执行日志文件（必须有 executionId）
                            if (!executionData.executionId) {
                                continue;
                            }
                            
                            // 验证 chatSessionId
                            if (executionData.chatSessionId === sessionId) {
                                console.log(`[Kiro] Found matching execution log: ${filePath} (executionId: ${executionData.executionId})`);
                                results.push(filePath);
                            }
                        } catch (error) {
                            // 文件不是有效的 JSON，跳过
                            continue;
                        }
                    }
                } catch (error) {
                    // 无法读取子目录，跳过
                    console.warn(`[Kiro] Failed to read subdirectory ${subDir}:`, error);
                    continue;
                }
            }
        } catch (error) {
            console.error(`[Kiro] Error reading profile directory ${profileHash}:`, error);
        }
        
        return results;
    }
    
    /**
     * 从会话记录中获取 profile hash
     * 根据 selectedProfileId 计算哈希，或从配置中获取
     */
    getProfileHashFromSession(session: KiroSessionRecord): string | null {
        // 尝试从会话配置中获取 profile hash
        // 如果 selectedProfileId 是 "local"，需要计算哈希
        // 实际实现可能需要读取 config.json 来获取映射关系
        
        // 这里先返回 null，让调用者遍历所有 profile 目录
        return null;
    }
}

/**
 * 获取 Kiro 存储路径
 */
export function getKiroStoragePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    
    // 检测当前 IDE 类型
    const appName = detectIDEType();
    
    console.log('[Kiro] getKiroStoragePath:');
    console.log('[Kiro]   - platform:', platform);
    console.log('[Kiro]   - appName:', appName);
    
    let storagePath: string;
    
    if (platform === 'win32') {
        storagePath = path.join(
            homeDir,
            `AppData/Roaming/${appName}/User/globalStorage/kiro.kiroagent`
        );
    } else if (platform === 'darwin') {
        storagePath = path.join(
            homeDir,
            `Library/Application Support/${appName}/User/globalStorage/kiro.kiroagent`
        );
    } else {
        // Linux
        storagePath = path.join(
            homeDir,
            `.config/${appName}/User/globalStorage/kiro.kiroagent`
        );
    }
    
    console.log('[Kiro]   - storagePath:', storagePath);
    return storagePath;
}

/**
 * 检测当前 IDE 类型
 * 优先检测 Cursor，然后检测 Kiro
 */
function detectIDEType(): 'Code' | 'Cursor' | 'Kiro' {
    // 方法1：检查可执行路径（最可靠）
    const execPath = process.execPath?.toLowerCase() || '';
    if (execPath.includes('cursor')) {
        return 'Cursor';
    }
    if (execPath.includes('kiro')) {
        return 'Kiro';
    }
    
    // 方法2：检查环境变量
    if (process.env.CURSOR_PID || process.env.CURSOR_DATA_FOLDER) {
        return 'Cursor';
    }
    if (process.env.KIRO_PID || process.env.KIRO_DATA_FOLDER) {
        return 'Kiro';
    }
    
    // 方法3：检查当前工作目录
    const cwd = process.cwd()?.toLowerCase() || '';
    if (cwd.includes('cursor')) {
        return 'Cursor';
    }
    if (cwd.includes('kiro')) {
        return 'Kiro';
    }
    
    // 默认使用 VS Code
    return 'Code';
}
