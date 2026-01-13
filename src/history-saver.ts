/**
 * 历史记录保存器
 * 负责将 Markdown 内容保存到文件系统
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ComposerData } from './types';
import { trackEventIfLoggedIn, TelemetryEvents } from './telemetry/telemetry';

export class HistorySaver {
    private historyDir: string;
    private source: string;
    
    constructor(workspaceRoot: string, outputDir: string = '.llm-chat-history/history', source: string = 'unknown') {
        this.historyDir = path.join(workspaceRoot, outputDir);
        this.source = source;
    }
    
    /**
     * 保存对话到文件
     */
    async save(composer: ComposerData, markdown: string): Promise<string> {
        console.log(`[HistorySaver] ========== Starting save ==========`);
        console.log(`[HistorySaver] History dir: ${this.historyDir}`);
        console.log(`[HistorySaver] Source: ${this.source}`);
        console.log(`[HistorySaver] Composer ID: ${composer.composerId}`);
        console.log(`[HistorySaver] Composer name: ${composer.name || 'untitled'}`);
        
        // 确保目录存在
        try {
            await fs.mkdir(this.historyDir, { recursive: true });
            console.log(`[HistorySaver] Directory ensured: ${this.historyDir}`);
        } catch (error) {
            console.error(`[HistorySaver] Failed to create directory: ${error}`);
            throw error;
        }

        // 先根据 session id 查找已存在的文件
        const existingFile = await this.findExistingFileBySessionId(composer.composerId);
        
        let filepath: string;
        if (existingFile) {
            // 如果找到已存在的文件，使用该文件路径
            filepath = existingFile;
            console.log(`[HistorySaver] Found existing file by session ID: ${filepath}`);
        } else {
            // 如果没有找到，生成新文件名
            const filename = this.generateFilename(composer);
            filepath = path.join(this.historyDir, filename);
            console.log(`[HistorySaver] Target filepath: ${filepath}`);
        }

        // 检查是否需要更新
        const shouldSave = await this.shouldSave(filepath, markdown);
        console.log(`[HistorySaver] Should save: ${shouldSave}`);

        if (shouldSave) {
            try {
                await fs.writeFile(filepath, markdown, 'utf-8');
                console.log(`[HistorySaver] ✓ Saved successfully: ${filepath}`);
                
                // 上报文件保存事件（仅登录用户）
                trackEventIfLoggedIn(TelemetryEvents.FILE_SAVED_LOCALLY, {
                    source: this.source,
                    session_id: composer.composerId,
                });
            } catch (error) {
                console.error(`[HistorySaver] ✗ Failed to save file: ${error}`);
                throw error;
            }
        } else {
            console.log(`[HistorySaver] ⊘ Skipped (unchanged): ${filepath}`);
        }

        return filepath;
    }
    
    /**
     * 生成文件名
     */
    private generateFilename(composer: ComposerData): string {
        const date = new Date(composer.createdAt);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        const second = String(date.getUTCSeconds()).padStart(2, '0');
        
        const timestamp = `${year}-${month}-${day}_${hour}-${minute}-${second}Z`;
        const title = this.sanitizeTitle(composer.name || 'untitled');
        
        return `${timestamp}-${title}.md`;
    }
    
    /**
     * 清理标题中的特殊字符
     */
    private sanitizeTitle(title: string): string {
        // 移除特殊字符
        return title
            .replace(/[<>:"/\\|?*]/g, '-')
            .replace(/\s+/g, '-')
            .toLowerCase()
            .substring(0, 50);
    }
    
    /**
     * 根据 session id 查找已存在的文件
     * 支持所有 agent 的文件格式：
     * 1. 注释格式: <!-- source: sessionId --> 或 <!-- ... Session sessionId ... -->
     * 2. Markdown 元数据: **Session ID**: `sessionId` 或 **会话ID**: `sessionId`
     * 3. YAML front matter: id: sessionId (在 YAML 块中)
     */
    private async findExistingFileBySessionId(sessionId: string): Promise<string | null> {
        try {
            const files = await fs.readdir(this.historyDir);
            
            for (const file of files) {
                if (!file.endsWith('.md')) {
                    continue;
                }
                
                const filepath = path.join(this.historyDir, file);
                try {
                    // 读取文件内容（读取前30行应该足够包含所有头部信息）
                    const content = await fs.readFile(filepath, 'utf-8');
                    const lines = content.split('\n');
                    const headerLines = lines.slice(0, 30);
                    const headerContent = headerLines.join('\n');
                    
                    // 方法1: 匹配注释格式
                    // 支持格式：
                    // - <!-- GitHub Copilot Chat: sessionId -->
                    // - <!-- Copilot Session sessionId -->
                    // - <!-- Cursor Session sessionId -->
                    // - <!-- Cline Task: sessionId -->
                    // - <!-- Kiro Session sessionId -->
                    const colonMatch = headerContent.match(/<!--[^>]*:\s*([a-zA-Z0-9\-_]+)/);
                    const sessionMatch = headerContent.match(/<!--[^>]*Session[:\s]+([a-zA-Z0-9\-_]+)/i);
                    if ((colonMatch && colonMatch[1] === sessionId) || 
                        (sessionMatch && sessionMatch[1] === sessionId)) {
                        console.log(`[HistorySaver] Found existing file with session ID ${sessionId} (comment format): ${filepath}`);
                        return filepath;
                    }
                    
                    // 方法2: 匹配 Markdown 元数据格式
                    // 支持格式：
                    // - **Session ID**: `sessionId`
                    // - **会话ID**: `sessionId`
                    const mdMetaMatch = headerContent.match(/\*\*(?:Session\s*ID|会话ID)\*\*[:\s]*`([^`]+)`/i);
                    if (mdMetaMatch && mdMetaMatch[1] === sessionId) {
                        console.log(`[HistorySaver] Found existing file with session ID ${sessionId} (markdown metadata): ${filepath}`);
                        return filepath;
                    }
                    
                    // 方法3: 匹配 YAML front matter 格式
                    // 支持格式：
                    // ---
                    // id: sessionId
                    // ---
                    if (headerContent.includes('---')) {
                        const yamlMatch = headerContent.match(/^---[\s\S]*?id:\s*([a-zA-Z0-9\-_]+)[\s\S]*?---/m);
                        if (yamlMatch && yamlMatch[1] === sessionId) {
                            console.log(`[HistorySaver] Found existing file with session ID ${sessionId} (YAML front matter): ${filepath}`);
                            return filepath;
                        }
                    }
                } catch (error) {
                    // 读取文件失败，跳过
                    continue;
                }
            }
        } catch (error) {
            // 目录不存在或读取失败，返回 null
            console.log(`[HistorySaver] Error finding existing file: ${error}`);
        }
        
        return null;
    }
    
    /**
     * 检查是否需要保存
     */
    private async shouldSave(filepath: string, newContent: string): Promise<boolean> {
        try {
            const existingContent = await fs.readFile(filepath, 'utf-8');
            return existingContent !== newContent;
        } catch {
            // 文件不存在，需要保存
            return true;
        }
    }
}


