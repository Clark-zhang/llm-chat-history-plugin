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

        // 生成文件名
        const filename = this.generateFilename(composer);
        const filepath = path.join(this.historyDir, filename);
        console.log(`[HistorySaver] Target filepath: ${filepath}`);

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


