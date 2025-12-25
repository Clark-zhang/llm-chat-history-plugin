/**
 * CodeGeeX 类型定义
 * 基于智谱AI CodeGeeX的数据结构
 */

export interface CodeGeeXConversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: CodeGeeXMessage[];
    model?: string;
    language?: string;
    workspaceFolder?: string;
}

export interface CodeGeeXMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    model?: string;
    toolCalls?: CodeGeeXToolCall[];
    toolResults?: CodeGeeXToolResult[];
    metadata?: {
        tokens?: { input: number; output: number };
        temperature?: number;
        language?: string;
    };
}

export interface CodeGeeXToolCall {
    id: string;
    type: string;
    function: {
        name: string;
        parameters: any;
    };
}

export interface CodeGeeXToolResult {
    toolCallId: string;
    result: string;
    success: boolean;
    error?: string;
}

/**
 * CodeGeeX 会话数据（用于 Markdown 生成）
 */
export interface CodeGeeXSessionData {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: CodeGeeXMessage[];
    model?: string;
    language?: string;
    workspaceFolder?: string;
}
