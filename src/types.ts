/**
 * 类型定义文件
 * 基于 Cursor SQLite 数据库实际结构
 */

/**
 * Composer Data - 对话容器
 */
export interface ComposerData {
    _v: number;
    composerId: string;
    name: string;
    createdAt: string;
    lastUpdatedAt?: string;
    
    // 对话引用列表（关键！）
    fullConversationHeadersOnly: Array<{
        bubbleId: string;
        type: number; // 1=用户消息, 2=AI响应
    }>;
    
    // 其他元数据
    text: string;
    richText: string;
    modelConfig: {
        modelName: string;
    };
    unifiedMode: number; // 1=Chat, 2=Agent
    isAgentic: boolean;
}

/**
 * 用户消息 Bubble (Type 1)
 */
export interface UserBubble {
    _v: number;
    type: 1;
    bubbleId: string;
    requestId: string;
    createdAt: string;
    
    // 用户输入内容
    text: string;
    richText: string;
    
    // 上下文信息
    modelInfo?: {
        modelName: string;
    };
    unifiedMode?: number;
    isAgentic?: boolean;
    workspaceUris?: string[];
    workspaceProjectDir?: string;
}

/**
 * AI 响应 Bubble (Type 2)
 */
export interface AIResponseBubble {
    _v: number;
    type: 2;
    bubbleId: string;
    requestId: string;
    createdAt: string;
    capabilityType?: number;
    
    // AI 响应内容
    text: string;
    
    // AI 思考过程（thinking models）
    thinking?: {
        text: string;
        signature: string;
    };
    thinkingStyle?: number;
    
    // 时间信息
    timingInfo?: {
        clientStartTime: number;
        clientRpcSendTime: number;
        clientSettleTime: number;
        clientEndTime: number;
    };
    
    // 模型信息
    modelInfo?: {
        modelName: string;
    };
    
    // 工具调用结果
    toolResults?: Array<{
        name: string;
        result: any;
    }>;
    
    // 工具调用（capabilityType === 15）
    toolFormerData?: ToolFormerData | null;
    
    unifiedMode?: number;
    isAgentic?: boolean;
    workspaceUris?: string[];
    workspaceProjectDir?: string;
}

/**
 * Bubble 联合类型
 */
export type Bubble = UserBubble | AIResponseBubble;

/**
 * 消息结构（用于 Markdown 生成）
 */
export interface Message {
    id: string;
    type: 'user' | 'assistant' | 'system';
    text: string;
    thinking?: string;
    timestamp: string;
    modelName?: string;
    mode?: string;
    context?: any; // 上下文信息，如文件路径、代码选择等
    toolResults?: Array<{
        name: string;
        result: any;
    }>;
    toolUses?: ToolUseBlock[];
    images?: string[]; // 图片附件
}

/**
 * 数据库行结构
 */
export interface DatabaseRow {
    key: string;
    value: any; // BLOB or TEXT
}

/**
 * Cursor 工具调用原始数据
 */
export interface ToolFormerData {
    name: string;
    tool: string;
    toolCallId: string;
    toolIndex: number;
    modelCallId?: string;
    status?: string;
    rawArgs?: string;
    params?: any;
    result?: string;
    additionalData?: any;
}

export interface ToolUseBlock {
    name: string;
    markdown: string;
}


