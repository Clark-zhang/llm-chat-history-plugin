/**
 * 数据库读取器
 * 负责从 Cursor SQLite 数据库读取对话数据
 */

import Database from 'better-sqlite3';
import { ComposerData, Bubble, DatabaseRow } from './types';

export class CursorDatabaseReader {
    private db: Database.Database;
    
    constructor(dbPath: string) {
        // 只读模式 + WAL 模式
        this.db = new Database(dbPath, {
            readonly: true,
            fileMustExist: true
        });
        
        // 设置 WAL 模式
        this.db.pragma('journal_mode = WAL');
    }
    
    /**
     * 获取所有 Composer
     */
    getAllComposers(): ComposerData[] {
        const stmt = this.db.prepare(`
            SELECT key, value 
            FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%'
        `);
        
        const rows = stmt.all() as DatabaseRow[];
        const composers: ComposerData[] = [];
        
        for (const row of rows) {
            try {
                // 值可能是 Buffer 或字符串
                const valueStr = typeof row.value === 'string' 
                    ? row.value 
                    : row.value.toString('utf-8');
                const data = JSON.parse(valueStr) as ComposerData;
                composers.push(data);
            } catch (error) {
                console.error('Failed to parse composer:', error);
            }
        }
        
        return composers;
    }
    
    /**
     * 获取指定 Composer 的所有 Bubble
     */
    getComposerBubbles(composerId: string, bubbleIds: string[]): Bubble[] {
        const bubbles: Bubble[] = [];
        
        for (const bubbleId of bubbleIds) {
            const key = `bubbleId:${composerId}:${bubbleId}`;
            const stmt = this.db.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
            const row = stmt.get(key) as DatabaseRow | undefined;
            
            if (row && row.value) {
                try {
                    // 值可能是 Buffer 或字符串
                    const valueStr = typeof row.value === 'string' 
                        ? row.value 
                        : row.value.toString('utf-8');
                    const bubble = JSON.parse(valueStr) as Bubble;
                    bubbles.push(bubble);
                } catch (error) {
                    console.error(`Failed to parse bubble ${bubbleId}:`, error);
                }
            }
        }
        
        return bubbles;
    }
    
    /**
     * 关闭数据库连接
     */
    close(): void {
        this.db.close();
    }
}

/**
 * 带重试的数据库打开函数
 */
export async function openDatabase(dbPath: string, maxRetries = 3): Promise<CursorDatabaseReader> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return new CursorDatabaseReader(dbPath);
        } catch (error) {
            if (i < maxRetries - 1) {
                // 等待 500ms 后重试
                await sleep(500);
                continue;
            }
            throw error;
        }
    }
    throw new Error('Failed to open database after retries');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


