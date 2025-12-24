/**
 * Kilo 工作区过滤器
 */

import * as path from 'path';
import { KiloConversation } from './kilo-types';

export class KiloWorkspaceFilter {
    constructor(private workspaceRoot: string) {}

    belongsToCurrentWorkspace(conversation: KiloConversation): boolean {
        console.log('[Kilo] === belongsToCurrentWorkspace() called ===');
        console.log('[Kilo] Current workspaceRoot:', this.workspaceRoot);
        console.log('[Kilo] Conversation title:', conversation.title);
        console.log('[Kilo] Conversation workspaceFolder:', conversation.workspaceFolder);

        // 对于Kilo，精确匹配工作区路径
        if (!conversation.workspaceFolder) {
            console.log('[Kilo] 📝 No workspace folder in conversation');
            // 如果没有工作区信息，检查当前工作区是否为Kilo数据目录
            // 如果是Kilo数据目录，说明用户希望在这里管理所有Kilo对话
            const normalizedWorkspace = path.normalize(this.workspaceRoot).toLowerCase();
            console.log('[Kilo] Normalized workspace:', normalizedWorkspace);
            if (normalizedWorkspace.includes('kilo') || normalizedWorkspace.includes('kilocode')) {
                console.log('[Kilo] ✅ Saving because workspace contains "kilo" keyword');
                return true;
            }
            // 否则不保存（避免在非相关工作区保存对话）
            console.log('[Kilo] ❌ Not saving because workspace does not contain "kilo" keyword');
            return false;
        }

        try {
            const normalizedWorkspace = path.normalize(this.workspaceRoot).toLowerCase();
            const normalizedConversation = path.normalize(conversation.workspaceFolder).toLowerCase();

            console.log('[Kilo] Normalized workspace:', normalizedWorkspace);
            console.log('[Kilo] Normalized conversation workspace:', normalizedConversation);

            // 精确匹配：对话的工作区路径必须与当前工作区匹配
            const isExactMatch = normalizedConversation === normalizedWorkspace;
            const isSubPath = normalizedConversation.startsWith(normalizedWorkspace + path.sep) ||
                             normalizedWorkspace.startsWith(normalizedConversation + path.sep);

            console.log('[Kilo] Exact match:', isExactMatch);
            console.log('[Kilo] Sub path match:', isSubPath);
            console.log('[Kilo] Final result:', isExactMatch || isSubPath);

            return isExactMatch || isSubPath;
        } catch (error) {
            // 路径规范化失败时，采用保守策略
            console.warn('[Kilo] ❌ Failed to normalize workspace path:', error);
            return false; // 出错时不保存，避免错误保存
        }
    }

    filterConversations(conversations: KiloConversation[]): KiloConversation[] {
        return conversations.filter(conv => this.belongsToCurrentWorkspace(conv));
    }
}
