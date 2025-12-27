/**
 * Blackbox AI 工作区过滤器
 */

import * as path from 'path';
import { BlackboxConversation } from './blackboxai-types';

export class BlackboxWorkspaceFilter {
    constructor(private workspaceRoot: string) {
        console.log('[BlackboxAI] WorkspaceFilter initialized with workspace:', workspaceRoot);
    }

    belongsToCurrentWorkspace(conversation: BlackboxConversation): boolean {
        console.log(`[BlackboxAI] Checking workspace for conversation "${conversation.title}" (id: ${conversation.id})`);
        console.log(`[BlackboxAI]   - Conversation workspaceFolder: ${conversation.workspaceFolder || '(empty/undefined)'}`);
        console.log(`[BlackboxAI]   - Current workspaceRoot: ${this.workspaceRoot}`);

        // 如果没有工作区信息，允许保存（兼容旧版本数据或无法提取工作区的情况）
        if (!conversation.workspaceFolder) {
            console.log('[BlackboxAI]   -> ALLOWED (no workspaceFolder in conversation data, defaulting to current workspace)');
            return true;
        }

        try {
            // 统一路径分隔符为正斜杠（跨平台兼容）
            const normalizedWorkspace = this.normalizePath(this.workspaceRoot);
            const normalizedConversation = this.normalizePath(conversation.workspaceFolder);

            console.log(`[BlackboxAI]   - Normalized workspace: ${normalizedWorkspace}`);
            console.log(`[BlackboxAI]   - Normalized conversation: ${normalizedConversation}`);

            // 检查路径是否匹配或包含关系
            const matches = normalizedConversation.includes(normalizedWorkspace) ||
                   normalizedWorkspace.includes(normalizedConversation);
            
            console.log(`[BlackboxAI]   -> ${matches ? 'ALLOWED' : 'FILTERED OUT'} (workspace ${matches ? 'matches' : 'does not match'})`);
            return matches;
        } catch (error) {
            // 路径规范化失败时，允许保存（宽容策略）
            console.warn('[BlackboxAI] Failed to normalize workspace path:', error);
            console.log('[BlackboxAI]   -> ALLOWED (path normalization failed, using fallback)');
            return true;
        }
    }

    /**
     * 统一路径格式：
     * - 将反斜杠转换为正斜杠
     * - 转换为小写（用于比较）
     * - 移除末尾斜杠
     */
    private normalizePath(filepath: string): string {
        if (!filepath) return '';
        
        // 统一使用正斜杠
        let normalized = filepath.replace(/\\/g, '/');
        
        // 转换为小写以便比较
        normalized = normalized.toLowerCase();
        
        // 移除末尾斜杠
        normalized = normalized.replace(/\/$/, '');
        
        return normalized;
    }

    filterConversations(conversations: BlackboxConversation[]): BlackboxConversation[] {
        return conversations.filter(conv => this.belongsToCurrentWorkspace(conv));
    }
}
