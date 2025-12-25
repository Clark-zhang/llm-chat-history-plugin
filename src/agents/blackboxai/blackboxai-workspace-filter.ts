/**
 * Blackbox AI 工作区过滤器
 */

import * as path from 'path';
import { BlackboxConversation } from './blackboxai-types';

export class BlackboxWorkspaceFilter {
    constructor(private workspaceRoot: string) {}

    belongsToCurrentWorkspace(conversation: BlackboxConversation): boolean {
        // 如果没有工作区信息，更严格地检查 - 不应该默认允许
        if (!conversation.workspaceFolder) {
            return false;
        }

        try {
            const normalizedWorkspace = path.normalize(this.workspaceRoot).toLowerCase();
            const normalizedConversation = path.normalize(conversation.workspaceFolder).toLowerCase();

            // 检查路径是否匹配或包含关系
            return normalizedConversation.includes(normalizedWorkspace) ||
                   normalizedWorkspace.includes(normalizedConversation);
        } catch (error) {
            // 路径规范化失败时，拒绝该对话
            console.warn('[BlackboxAI] Failed to normalize workspace path:', error);
            return false;
        }
    }

    filterConversations(conversations: BlackboxConversation[]): BlackboxConversation[] {
        return conversations.filter(conv => this.belongsToCurrentWorkspace(conv));
    }
}
