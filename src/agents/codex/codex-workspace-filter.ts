/**
 * Codex 工作区过滤器
 * 过滤出属于当前工作区的对话
 */

import * as path from 'path';
import { CodexConversation } from './codex-types';

export class CodexWorkspaceFilter {
    constructor(private workspaceRoot: string) {}

    /**
     * 检查对话是否属于当前工作区
     */
    belongsToCurrentWorkspace(conversation: CodexConversation): boolean {
        // 如果没有工作区信息，默认为属于当前工作区
        if (!conversation.workspaceFolder) {
            return true;
        }

        // 检查工作区路径是否匹配
        const normalizedWorkspace = path.normalize(this.workspaceRoot).toLowerCase();
        const normalizedConversation = path.normalize(conversation.workspaceFolder).toLowerCase();

        return normalizedConversation.includes(normalizedWorkspace) ||
               normalizedWorkspace.includes(normalizedConversation);
    }

    /**
     * 获取工作区相关的对话
     */
    filterConversations(conversations: CodexConversation[]): CodexConversation[] {
        return conversations.filter(conv => this.belongsToCurrentWorkspace(conv));
    }
}
