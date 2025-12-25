/**
 * Kilo 类型定义
 * 基于 Kilo AI 插件的数据结构
 */

export interface KiloConversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: KiloMessage[];
    model?: string;
    workspaceFolder?: string;
}

export interface KiloMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    model?: string;
    toolCalls?: KiloToolCall[];
    toolResults?: KiloToolResult[];
    metadata?: {
        tokens?: number;
        latency?: number;
        model?: string;
    };
}

export interface KiloToolCall {
    id: string;
    name: string;
    arguments: any;
}

export interface KiloToolResult {
    toolCallId: string;
    content: string;
    success: boolean;
    error?: string;
}

/**
 * Kilo 会话数据（用于 Markdown 生成）
 */
export interface KiloSessionData {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: KiloMessage[];
    model?: string;
    workspaceFolder?: string;
}
