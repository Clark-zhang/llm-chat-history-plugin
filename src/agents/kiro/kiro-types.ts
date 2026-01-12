/**
 * Kiro 类型定义
 * 基于 Amazon Kiro IDE 的实际数据结构
 */

/**
 * Kiro Chat Execution Record - .chat 文件结构
 */
export interface KiroChatExecution {
    executionId: string;
    actionId: string;  // 如 "act"
    chatSessionId?: string;  // 关联的会话ID
    context: Array<{
        type: string;
        target?: number;
        expandedPaths?: string[];
        openedFiles?: string[];
        staticDirectoryView?: string;
        [key: string]: any;
    }>;
    chat: Array<{
        role: 'human' | 'bot' | 'tool';
        content?: string;  // 简单文本内容（旧格式）
        entries?: KiroChatEntry[];  // 复杂消息结构（新格式）
        messageId?: string;
        [key: string]: any;
    }>;
    metadata: {
        modelId: string;
        modelProvider: string;
        workflow: string;
        workflowId: string;
        startTime: number;
        endTime: number;
    };
    validations?: Array<{
        [key: string]: any;
    }>;
    [key: string]: any;  // 允许其他字段
}

/**
 * Kiro Chat Entry - 消息中的条目类型
 */
export interface KiroChatEntry {
    type: 'text' | 'toolUse' | 'toolUseResponse' | 'agentInvoke' | 'thinking' | string;
    text?: string;  // text 类型的内容
    id?: string;  // toolUse 的 ID
    name?: string;  // toolUse 的工具名称
    args?: {  // toolUse 的参数
        [key: string]: any;
    };
    success?: boolean;  // toolUseResponse 的成功状态
    message?: string;  // toolUseResponse 的响应消息
    executionId?: string;  // agentInvoke 的执行ID
    [key: string]: any;
}

/**
 * Kiro Session Index - sessions.json 结构
 */
export interface KiroSessionIndex {
    sessionId: string;
    title: string;
    dateCreated: string;  // timestamp as string
    workspaceDirectory: string;
}

/**
 * Kiro Session History Item - 会话历史中的单个消息项
 */
export interface KiroSessionHistoryItem {
    message: {
        role: 'user' | 'assistant';
        content: Array<{
            type: 'text';
            text: string;
        }>;
        id: string;
    };
    contextItems: Array<{
        [key: string]: any;
    }>;
    editorState?: {
        [key: string]: any;
    };
}

/**
 * Kiro Session Record - {sessionId}.json 结构
 */
export interface KiroSessionRecord {
    sessionId: string;
    title: string;
    workspaceDirectory: string;
    workspacePath?: string;
    history: KiroSessionHistoryItem[];
    contextItems?: Array<{
        [key: string]: any;
    }>;
    ttsActive?: boolean;
    active?: boolean;
    isGatheringContext?: boolean;
    hasPendingIntentClarification?: boolean;
    config?: {
        [key: string]: any;
    };
    defaultModelTitle?: string;
    selectedProfileId?: string;
    activeTabs?: Array<{
        [key: string]: any;
    }>;
    activeTabId?: string;
    autonomyMode?: string;
    sessionType?: string;
    isQueueDropdownVisible?: boolean;
    selectedModel?: {
        [key: string]: any;
    };
    isUsageSummaryEnabled?: boolean;
    contextUsagePercentageBySession?: number;
    contextUsagePercentage?: number;
    [key: string]: any;
}

/**
 * Kiro Storage Data - 用于读取器的统一数据结构
 */
export interface KiroStorageData {
    id: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    workspacePath?: string;
    workspaceRoot?: string;
    // 可以是执行记录或会话记录
    execution?: KiroChatExecution;
    session?: KiroSessionRecord;
    source: 'execution' | 'session';  // 标识数据来源
}

/**
 * Kiro Chat Message - 用于 Markdown 生成的消息格式
 */
export interface KiroChatMessage {
    id: string;
    type: 'user' | 'assistant';
    text: string;
    timestamp: string;
    model?: string;
    workflow?: string;
    workflowId?: string;
    // 工具调用相关信息
    toolCalls?: Array<{
        id: string;
        name: string;
        args: { [key: string]: any };
        response?: {
            success: boolean;
            message: string;
        };
    }>;
}

/**
 * Kiro Conversation Metadata
 */
export interface KiroConversationMetadata {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    workspacePath?: string;
    modelProvider?: string;
    modelId?: string;
    workflow?: string;
}
