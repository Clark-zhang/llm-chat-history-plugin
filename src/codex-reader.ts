/**
 * Codex 数据读取器
 * 负责从 GitHub Copilot Chat 的存储文件读取对话数据
 */

import * as fs from 'fs';
import * as path from 'path';
import { CodexConversation, CodexSessionData } from './codex-types';

export class CodexReader {
    private storageDir: string;

    constructor(private globalStorageDir: string) {
        this.storageDir = path.join(globalStorageDir, 'GitHub.copilot-chat');
    }

    /**
     * 获取所有对话
     */
    getAllConversations(): CodexConversation[] {
        const conversationsDir = path.join(this.storageDir, 'conversations');

        if (!fs.existsSync(conversationsDir)) {
            console.log('[Codex] Conversations directory not found:', conversationsDir);
            return [];
        }

        const conversations: CodexConversation[] = [];
        const files = fs.readdirSync(conversationsDir);

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(conversationsDir, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const conversation = JSON.parse(content) as CodexConversation;
                    conversations.push(conversation);
                } catch (error) {
                    console.error(`[Codex] Failed to parse conversation file ${file}:`, error);
                }
            }
        }

        // 按更新时间排序
        return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    /**
     * 获取指定对话
     */
    getConversation(id: string): CodexConversation | null {
        const conversationsDir = path.join(this.storageDir, 'conversations');
        const filePath = path.join(conversationsDir, `${id}.json`);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content) as CodexConversation;
        } catch (error) {
            console.error(`[Codex] Failed to read conversation ${id}:`, error);
            return null;
        }
    }

    /**
     * 检查存储目录是否存在
     */
    exists(): boolean {
        return fs.existsSync(this.storageDir);
    }
}

/**
 * 获取 Codex 存储路径
 */
export function getCodexStoragePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';

    // 检测当前运行环境
    const isVSCode = process.env.VSCODE_CWD !== undefined || process.env.VSCODE_PID !== undefined;
    const isCursor = process.env.CURSOR_PID !== undefined || process.env.CURSOR_DATA_FOLDER !== undefined;

    let appName = 'Code'; // VSCode

    // 如果明确检测到Cursor环境，使用Cursor路径
    if (isCursor && !isVSCode) {
        appName = 'Cursor';
    }

    if (platform === 'win32') {
        return path.join(
            homeDir,
            `AppData/Roaming/${appName}/User/globalStorage/GitHub.copilot-chat`
        );
    } else if (platform === 'darwin') {
        return path.join(
            homeDir,
            `Library/Application Support/${appName}/User/globalStorage/GitHub.copilot-chat`
        );
    } else {
        // Linux
        return path.join(
            homeDir,
            `.config/${appName}/User/globalStorage/GitHub.copilot-chat`
        );
    }
}
