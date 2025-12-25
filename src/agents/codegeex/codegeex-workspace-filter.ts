/**
 * CodeGeeX 工作区过滤器
 */

import * as path from 'path';
import { CodeGeeXConversation } from './codegeex-types';

export class CodeGeeXWorkspaceFilter {
    constructor(private workspaceRoot: string) {}

    belongsToCurrentWorkspace(conversation: CodeGeeXConversation): boolean {
        console.log('[CodeGeeX] === belongsToCurrentWorkspace() called ===');
        console.log('[CodeGeeX] Current workspaceRoot:', this.workspaceRoot);
        console.log('[CodeGeeX] Conversation title:', conversation.title);
        console.log('[CodeGeeX] Conversation workspaceFolder:', conversation.workspaceFolder);

        if (!conversation.workspaceFolder) {
            console.log('[CodeGeeX] 📝 No workspace folder in conversation, allowing');
            return true;
        }

        try {
            const normalizedWorkspace = path.normalize(this.workspaceRoot).toLowerCase();
            const normalizedConversation = path.normalize(conversation.workspaceFolder).toLowerCase();

            console.log('[CodeGeeX] Normalized workspace:', normalizedWorkspace);
            console.log('[CodeGeeX] Normalized conversation workspace:', normalizedConversation);

            const result = normalizedConversation.includes(normalizedWorkspace) ||
                          normalizedWorkspace.includes(normalizedConversation);

            console.log('[CodeGeeX] Workspace match result:', result);
            return result;
        } catch (error) {
            console.warn('[CodeGeeX] ❌ Failed to normalize workspace path:', error);
            return false;
        }
    }

    filterConversations(conversations: CodeGeeXConversation[]): CodeGeeXConversation[] {
        return conversations.filter(conv => this.belongsToCurrentWorkspace(conv));
    }
}
