/**
 * Cline 类型定义
 * 基于 Cline 的 JSON 文件结构
 */

/**
 * Task History 索引文件结构
 */
export interface ClineTaskHistory {
    tasks: ClineTaskItem[];
}

export interface ClineTaskItem {
    id: string;
    ts: number;
    task: string;
    tokensIn: number;
    tokensOut: number;
    cacheWrites?: number;
    cacheReads?: number;
    totalCost: number;
}

/**
 * Task Metadata
 */
export interface ClineTaskMetadata {
    version: string;
    id: string;
    ts: number;
    task: string;
    tokensIn: number;
    tokensOut: number;
    cacheWrites?: number;
    cacheReads?: number;
    totalCost: number;
}

/**
 * API Conversation History
 */
export interface ClineApiConversation {
    messages: ClineApiMessage[];
}

export interface ClineApiMessage {
    role: 'user' | 'assistant';
    content: ClineApiContent | string;
}

export type ClineApiContent = Array<
    | ClineTextContent
    | ClineImageContent
    | ClineToolUseContent
    | ClineToolResultContent
    | ClineThinkingContent
>;

export interface ClineTextContent {
    type: 'text';
    text: string;
}

export interface ClineImageContent {
    type: 'image';
    source: {
        type: 'base64';
        media_type: string;
        data: string;
    };
}

export interface ClineToolUseContent {
    type: 'tool_use';
    id: string;
    name: string;
    input: any;
}

export interface ClineToolResultContent {
    type: 'tool_result';
    tool_use_id: string;
    content?: string;
    is_error?: boolean;
}

export interface ClineThinkingContent {
    type: 'thinking';
    thinking: string;
}

/**
 * UI Messages
 */
export interface ClineUIMessages {
    messages: ClineUIMessage[];
}

export interface ClineUIMessage {
    ts: number;
    type: 'ask' | 'say';
    ask?: 'followup' | 'command' | 'completion_result' | 'tool' | 'api_req_failed' | 'resume_task' | 'resume_completed_task';
    say?: 'task' | 'error' | 'api_req_started' | 'api_req_finished' | 'text' | 'completion_result' | 'user_feedback' | 'user_feedback_diff' | 'api_req_retried' | 'command_output' | 'completion_result' | 'tool';
    text?: string;
    images?: string[];
    tool?: string;
    command?: string;
    path?: string;
    diff?: string;
    question?: string;
    [key: string]: any;
}

/**
 * Task 数据整体
 */
export interface ClineTask {
    id: string;
    metadata: ClineTaskMetadata;
    apiConversation: ClineApiConversation;
    uiMessages: ClineUIMessages;
    workspaceRoot?: string;
}

/**
 * Cline 消息格式（用于 Markdown 生成）
 */
export interface ClineMessage {
    id: string;
    type: 'user' | 'assistant';
    text: string;
    timestamp: string;
    thinking?: string;
    toolUses?: ClineToolUse[];
    toolResults?: ClineToolResult[];
    images?: string[];
}

export interface ClineToolUse {
    id: string;
    name: string;
    input: any;
}

export interface ClineToolResult {
    id: string;
    toolUseId: string;
    content?: string;
    isError?: boolean;
}





