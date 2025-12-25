/**
 * Codex (GitHub Copilot Chat) 类型定义
 * 基于 GitHub Copilot Chat 的数据结构
 */

export interface CodexConversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: CodexMessage[];
    workspaceFolder?: string;
}

export interface CodexMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    context?: {
        file?: string;
        line?: number;
        selection?: string;
    };
    toolCalls?: CodexToolCall[];
    toolResults?: CodexToolResult[];
}

export interface CodexToolCall {
    id: string;
    function: {
        name: string;
        arguments: any;
    };
}

export interface CodexToolResult {
    toolCallId: string;
    content: string;
    isError?: boolean;
}

/**
 * Codex 会话数据（用于 Markdown 生成）
 */
export interface CodexSessionData {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: CodexMessage[];
    workspaceFolder?: string;
}
