/**
 * Copilot Chat 类型定义
 * 基于 GitHub Copilot Chat 扩展的实际数据结构
 */

/**
 * Copilot Chat Session - 聊天会话文件结构
 */
export interface CopilotChatSession {
    version: number;
    responderUsername: string;
    responderAvatarIconUri?: {
        id: string;
    };
    initialLocation?: string;
    requests: CopilotRequest[];
}

/**
 * Copilot Request - 单个请求
 */
export interface CopilotRequest {
    requestId: string;
    message: CopilotMessage;
    variableData?: {
        variables: any[];
    };
    response: CopilotResponseItem[];
}

/**
 * Copilot Message - 用户消息
 */
export interface CopilotMessage {
    text: string;
    parts?: CopilotMessagePart[];
}

/**
 * Copilot Message Part - 消息部分
 */
export interface CopilotMessagePart {
    range?: {
        start: number;
        endExclusive: number;
    };
    editorRange?: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    };
    text: string;
    kind: string;
}

/**
 * Copilot Response Item - 响应项（联合类型）
 */
export type CopilotResponseItem =
    | CopilotTextResponse
    | CopilotThinkingResponse
    | CopilotInlineReferenceResponse
    | CopilotToolInvocationResponse
    | CopilotPrepareToolInvocationResponse
    | CopilotMcpServersStartingResponse
    | CopilotOtherResponse;

/**
 * 文本响应
 */
export interface CopilotTextResponse {
    kind?: 'value' | never; // 可选 kind，用于类型区分
    value: string;
    supportThemeIcons?: boolean;
    supportHtml?: boolean;
    supportAlertSyntax?: boolean;
    baseUri?: CopilotUri;
    uris?: Record<string, CopilotUri>;
}

/**
 * 思考响应
 */
export interface CopilotThinkingResponse {
    kind: 'thinking';
    value: string | any[];
    id?: string;
    metadata?: {
        vscodeReasoningDone?: boolean;
        stopReason?: string;
    };
    generatedTitle?: string;
}

/**
 * 内联引用响应
 */
export interface CopilotInlineReferenceResponse {
    kind: 'inlineReference';
    inlineReference: CopilotUri;
}

/**
 * 工具调用响应
 */
export interface CopilotToolInvocationResponse {
    kind: 'toolInvocationSerialized';
    invocationMessage?: CopilotTextResponse;
    pastTenseMessage?: CopilotTextResponse;
    isConfirmed?: {
        type: number;
    };
    isComplete?: boolean;
    source?: {
        type: string;
        label: string;
    };
    toolCallId?: string;
    toolId?: string;
    generatedTitle?: string;
}

/**
 * 准备工具调用响应
 */
export interface CopilotPrepareToolInvocationResponse {
    kind: 'prepareToolInvocation';
    toolName: string;
}

/**
 * MCP 服务器启动响应
 */
export interface CopilotMcpServersStartingResponse {
    kind: 'mcpServersStarting';
    didStartServerIds: string[];
}

/**
 * 其他响应类型
 */
export interface CopilotOtherResponse {
    kind: string;
    [key: string]: any;
}

/**
 * Copilot URI
 */
export interface CopilotUri {
    $mid?: number;
    fsPath?: string;
    external?: string;
    path?: string;
    scheme?: string;
}

/**
 * Copilot Chat 消息格式（用于 Markdown 生成）
 */
export interface CopilotChatMessage {
    id: string;
    type: 'user' | 'assistant';
    text: string;
    timestamp: string;
    model?: string;
    toolUses?: CopilotToolUse[];
    toolResults?: CopilotToolResult[];
    images?: string[];
    codeBlocks?: Array<{
        language?: string;
        code: string;
    }>;
    thinking?: string;
    fileReferences?: Array<{
        path: string;
        scheme: string;
    }>;
}

export interface CopilotToolUse {
    id: string;
    name: string;
    input: any;
    title?: string;
}

export interface CopilotToolResult {
    id: string;
    toolUseId: string;
    content?: string;
    isError?: boolean;
}

/**
 * Copilot Conversation Metadata
 */
export interface CopilotConversationMetadata {
    version: string;
    id: string;
    ts: number;
    title: string;
    messageCount: number;
    tokensIn?: number;
    tokensOut?: number;
    totalCost?: number;
    workspacePath?: string;
}

/**
 * Copilot Storage Data - 用于读取器
 */
export interface CopilotStorageData {
    id: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    session: CopilotChatSession;
    workspacePath?: string;
    workspaceRoot?: string;
}
