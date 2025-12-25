/**
 * Blackbox AI 类型定义
 * 基于 Blackbox AI 的数据结构
 */

export interface BlackboxConversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: BlackboxMessage[];
    model?: string;
    workspaceFolder?: string;
}

export interface BlackboxMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    model?: string;
    toolCalls?: BlackboxToolCall[];
    toolResults?: BlackboxToolResult[];
    metadata?: {
        tokens?: number;
        processingTime?: number;
        language?: string;
    };
}

export interface BlackboxToolCall {
    id: string;
    type: string;
    function: {
        name: string;
        arguments: string;
    };
}

export interface BlackboxToolResult {
    toolCallId: string;
    content: string;
    success: boolean;
    error?: string;
}

/**
 * Blackbox 会话数据（用于 Markdown 生成）
 */
export interface BlackboxSessionData {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: BlackboxMessage[];
    model?: string;
    workspaceFolder?: string;
}
