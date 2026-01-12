/**
 * Kiro 对话构建器
 * 将 Kiro 的数据转换为统一的消息格式
 */

import {
    KiroStorageData,
    KiroChatMessage,
    KiroChatExecution,
    KiroSessionRecord,
    KiroSessionHistoryItem,
    KiroChatEntry
} from './kiro-types';
import { Translator } from '../../i18n';
import { KiroReader } from './kiro-reader';
import * as fs from 'fs';

export class KiroConversationBuilder {
    private reader?: KiroReader;
    
    constructor(private t: Translator, reader?: KiroReader) {
        this.reader = reader;
    }
    
    /**
     * 从 Kiro 对话数据构建消息列表
     */
    buildConversation(conversation: KiroStorageData): KiroChatMessage[] {
        const messages: KiroChatMessage[] = [];
        
        if (conversation.source === 'session' && conversation.session) {
            // 从会话记录构建
            return this.buildFromSession(conversation.session, conversation);
        } else if (conversation.source === 'execution' && conversation.execution) {
            // 从执行记录构建
            return this.buildFromExecution(conversation.execution, conversation);
        }
        
        return messages;
    }
    
    /**
     * 从会话记录构建消息
     */
    private buildFromSession(session: KiroSessionRecord, conversation: KiroStorageData): KiroChatMessage[] {
        const messages: KiroChatMessage[] = [];
        
        if (!session.history || !Array.isArray(session.history)) {
            return messages;
        }
        
        // 查找所有关联的执行日志文件
        const executionLogs = this.findExecutionLogsForSession(session, conversation);
        console.log(`[Kiro] Found ${executionLogs.length} execution logs for session ${session.sessionId}`);
        
        // 如果找到了执行日志，优先使用执行日志中的数据
        if (executionLogs.length > 0) {
            // 从执行日志中构建消息
            const executionMessages: KiroChatMessage[] = [];
            for (const executionLog of executionLogs) {
                const execAny = executionLog as any;
                const workflowType = execAny.workflowType;
                console.log(`[Kiro] Building messages from execution log: ${executionLog.executionId}, workflowType: ${workflowType}`);
                const execMessages = this.buildFromExecution(executionLog, conversation);
                console.log(`[Kiro] Built ${execMessages.length} messages from execution ${executionLog.executionId}:`, 
                    execMessages.map(m => ({ type: m.type, textLength: m.text.length })));
                executionMessages.push(...execMessages);
            }
            console.log(`[Kiro] Total execution messages: ${executionMessages.length}`);
            
            // 从会话记录中提取用户消息（用于时间戳和顺序）
            const userMessagesFromSession: Map<string, KiroChatMessage> = new Map();
            for (let i = 0; i < session.history.length; i++) {
                const historyItem = session.history[i];
                if (historyItem.message && historyItem.message.role === 'user') {
                    const content = this.extractTextContent(historyItem.message.content);
                    if (content.trim()) {
                        const id = historyItem.message.id || `user-${i}`;
                        userMessagesFromSession.set(id, {
                            id,
                            type: 'user',
                            text: content,
                            timestamp: this.getTimestamp(conversation.createdAt, i)
                        });
                    }
                }
            }
            
            // 合并消息：优先使用执行日志中的消息，用户消息从会话记录中获取
            const mergedMessages: KiroChatMessage[] = [];
            const seenUserIds = new Set<string>();
            
            for (const msg of executionMessages) {
                if (msg.type === 'user') {
                    // 用户消息：如果会话记录中有，使用会话记录的；否则使用执行日志的
                    const sessionUserMsg = userMessagesFromSession.get(msg.id);
                    if (sessionUserMsg && !seenUserIds.has(msg.id)) {
                        mergedMessages.push(sessionUserMsg);
                        seenUserIds.add(msg.id);
                    } else if (!seenUserIds.has(msg.id)) {
                        mergedMessages.push(msg);
                        seenUserIds.add(msg.id);
                    }
                } else {
                    // AI 消息：直接使用执行日志的
                    mergedMessages.push(msg);
                }
            }
            
            // 添加会话记录中未被包含的用户消息
            for (const [id, userMsg] of userMessagesFromSession) {
                if (!seenUserIds.has(id)) {
                    mergedMessages.push(userMsg);
                }
            }
            
            // 按时间戳排序
            mergedMessages.sort((a, b) => {
                return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            });
            
            return mergedMessages;
        }
        
        // 如果没有找到执行日志，使用会话记录中的数据（回退方案）
        console.warn(`[Kiro] No execution logs found for session ${session.sessionId}, using session history only`);
        for (let i = 0; i < session.history.length; i++) {
            const historyItem = session.history[i];
            
            if (!historyItem.message) {
                continue;
            }
            
            const role = historyItem.message.role;
            const content = this.extractTextContent(historyItem.message.content);
            
            if (!content.trim()) {
                continue;
            }
            
            const id = historyItem.message.id || `${role}-${i}`;
            const timestamp = this.getTimestamp(conversation.createdAt, i);
            
            messages.push({
                id,
                type: role === 'user' ? 'user' : 'assistant',
                text: content,
                timestamp
            });
        }
        
        return messages;
    }
    
    /**
     * 查找会话关联的执行日志文件
     */
    private findExecutionLogsForSession(session: KiroSessionRecord, conversation: KiroStorageData): KiroChatExecution[] {
        const executionLogs: KiroChatExecution[] = [];
        
        if (!this.reader || !session.sessionId) {
            console.warn(`[Kiro] Cannot find execution logs: reader=${!!this.reader}, sessionId=${session.sessionId}`);
            return executionLogs;
        }
        
        try {
            // 查找所有关联的执行日志文件
            console.log(`[Kiro] Searching for execution logs with sessionId: ${session.sessionId}`);
            const executionLogPaths = this.reader.findAllExecutionLogsForSession(session.sessionId);
            console.log(`[Kiro] Found ${executionLogPaths.length} execution log file(s)`);
            
            for (const logPath of executionLogPaths) {
                try {
                    const content = fs.readFileSync(logPath, 'utf-8');
                    const executionData = JSON.parse(content) as KiroChatExecution;
                    
                    // 验证执行日志是否属于该会话
                    if (executionData.chatSessionId === session.sessionId) {
                        console.log(`[Kiro] Matched execution log: ${executionData.executionId} (workflow: ${executionData.metadata?.workflow})`);
                        executionLogs.push(executionData);
                    } else {
                        console.warn(`[Kiro] Execution log chatSessionId mismatch: expected ${session.sessionId}, got ${executionData.chatSessionId}`);
                    }
                } catch (error) {
                    console.warn(`[Kiro] Failed to parse execution log ${logPath}:`, error);
                }
            }
            
            // 按开始时间排序
            executionLogs.sort((a, b) => {
                const timeA = a.metadata?.startTime || 0;
                const timeB = b.metadata?.startTime || 0;
                return timeA - timeB;
            });
            
            console.log(`[Kiro] Successfully loaded ${executionLogs.length} execution log(s) for session ${session.sessionId}`);
        } catch (error) {
            console.error(`[Kiro] Failed to find execution logs for session ${session.sessionId}:`, error);
        }
        
        return executionLogs;
    }
    
    /**
     * 从执行记录构建消息
     */
    private buildFromExecution(execution: KiroChatExecution, conversation: KiroStorageData): KiroChatMessage[] {
        const messages: KiroChatMessage[] = [];
        const execAny = execution as any;
        const workflowType = execAny.workflowType;
        
        console.log(`[Kiro] Building messages from execution ${execution.executionId}, workflowType: ${workflowType}`);
        
        // 根据 workflowType 使用不同的处理逻辑
        if (workflowType === 'chat-agent') {
            // chat-agent: 只从 input.data.messages 中提取用户消息
            if (execAny.input?.data?.messages && Array.isArray(execAny.input.data.messages)) {
                for (const msg of execAny.input.data.messages) {
                    if (msg.role === 'user' && msg.content && Array.isArray(msg.content)) {
                        // 提取 text 内容
                        const textParts: string[] = [];
                        for (const contentItem of msg.content) {
                            if (contentItem.type === 'text' && contentItem.text) {
                                textParts.push(contentItem.text);
                            }
                        }
                        const text = textParts.join('\n');
                        if (text.trim()) {
                            const timestamp = execution.metadata?.startTime 
                                ? this.getTimestampFromEpoch(execution.metadata.startTime)
                                : this.getTimestamp(conversation.createdAt, 0);
                            
                            messages.push({
                                id: `user-${execution.executionId}`,
                                type: 'user',
                                text: text,
                                timestamp
                            });
                            console.log(`[Kiro] Extracted user message from chat-agent input`);
                        }
                    }
                }
            }
            // 注意：chat-agent 不导出 graph.context.messages 的内容
            return messages;
        } else if (workflowType === 'spec-generation') {
            // spec-generation: 从 actions 中查找 AgentExecutionAction (actionType: "say") 的 output.message
            if (execAny.actions && Array.isArray(execAny.actions)) {
                for (const action of execAny.actions) {
                    if (action.type === 'AgentExecutionAction' && 
                        action.actionType === 'say' && 
                        action.output?.message) {
                        const messageText = action.output.message;
                        if (messageText.trim()) {
                            const timestamp = execution.metadata?.startTime 
                                ? this.getTimestampFromEpoch(execution.metadata.startTime)
                                : this.getTimestamp(conversation.createdAt, 0);
                            
                            messages.push({
                                id: `assistant-${execution.executionId}-${action.actionId || 'say'}`,
                                type: 'assistant',
                                text: messageText,
                                timestamp
                            });
                            
                            // 添加模型信息
                            if (execution.metadata) {
                                const lastMsg = messages[messages.length - 1];
                                lastMsg.model = execution.metadata.modelId;
                                lastMsg.workflow = execution.metadata.workflow || workflowType;
                                lastMsg.workflowId = execution.metadata.workflowId;
                            }
                            
                            console.log(`[Kiro] Extracted AI message from spec-generation action, length: ${messageText.length}`);
                        }
                    }
                }
            }
            return messages;
        }
        
        // 其他类型的执行，使用原来的逻辑（向后兼容）
        let chatArray: any[] | undefined = execution.chat;
        
        // 如果 chat 不存在，尝试从 graph.context.messages 获取
        if (!chatArray && execAny.graph?.context?.messages) {
            chatArray = execAny.graph.context.messages;
            console.log(`[Kiro] Using messages from graph.context.messages`);
        }
        
        if (!chatArray || !Array.isArray(chatArray)) {
            console.warn(`[Kiro] Execution ${execution.executionId} has no chat/messages array. workflowType: ${workflowType}`);
            return messages;
        }
        
        console.log(`[Kiro] Building messages from execution ${execution.executionId}, chat length: ${chatArray.length}`);
        
        // 打印前几个 chat 项的结构用于调试
        if (chatArray.length > 0) {
            console.log(`[Kiro] First chat item structure:`, {
                role: chatArray[0].role,
                hasContent: !!chatArray[0].content,
                hasEntries: !!chatArray[0].entries,
                entriesLength: chatArray[0].entries?.length || 0,
                contentPreview: chatArray[0].content?.substring(0, 100) || 'N/A',
                keys: Object.keys(chatArray[0])
            });
        }
        
        // 检测 System Prompt 和用户发起的会话位置
        let systemPromptIndex = -1;
        let userInitiatedIndex = -1;
        
        // 找到 System Prompt（第一条 human 消息且包含 "# System Prompt"）
        for (let i = 0; i < chatArray.length; i++) {
            const chatItem = chatArray[i];
            if (chatItem.role === 'human') {
                const content = this.extractContentText(chatItem);
                if (i === 0 && (content.includes('# System Prompt') || content.includes('System Prompt'))) {
                    systemPromptIndex = i;
                } else if (systemPromptIndex >= 0 && i > systemPromptIndex) {
                    // 找到用户发起的真实会话（System Prompt 之后的第一条 human 消息）
                    userInitiatedIndex = i;
                    break;
                } else if (systemPromptIndex < 0) {
                    // 没有 System Prompt，第一条 human 消息就是用户发起的会话
                    userInitiatedIndex = i;
                    break;
                }
            }
        }
        
        // 用于存储 toolUse 和 toolUseResponse 的映射
        const toolUseMap = new Map<string, { toolUse: KiroChatEntry; response?: KiroChatEntry }>();
        
        for (let i = 0; i < chatArray.length; i++) {
            const chatItem = chatArray[i];
            
            // 跳过 System Prompt
            if (i === systemPromptIndex) {
                continue;
            }
            
            const role = chatItem.role;
            
            // 处理用户消息（human）
            if (role === 'human') {
                const content = this.extractContentText(chatItem);
                
                if (!content.trim()) {
                    continue;
                }
                
                const id = chatItem.messageId || `${role}-${execution.executionId}-${i}`;
                const timestamp = execution.metadata?.startTime 
                    ? this.getTimestampFromEpoch(execution.metadata.startTime + (i * 1000))
                    : this.getTimestamp(conversation.createdAt, i);
                
                messages.push({
                    id,
                    type: 'user',
                    text: content,
                    timestamp
                });
            }
            // 处理 AI 消息（bot）
            else if (role === 'bot') {
                console.log(`[Kiro] Processing bot message at index ${i}, has entries: ${!!chatItem.entries}, has content: ${!!chatItem.content}`);
                const message = this.buildBotMessage(chatItem, execution, conversation, i, toolUseMap);
                if (message) {
                    console.log(`[Kiro] Built bot message: type=${message.type}, text length=${message.text.length}, toolCalls=${message.toolCalls?.length || 0}`);
                    messages.push(message);
                } else {
                    console.warn(`[Kiro] Failed to build bot message at index ${i}`);
                }
            }
            // 处理工具消息（tool）
            else if (role === 'tool' && userInitiatedIndex >= 0 && i > userInitiatedIndex) {
                // tool 消息通常会被关联到对应的 toolUse
                // 这里我们将其作为独立的工具输出消息处理
                const content = this.extractContentText(chatItem);
                
                if (!content.trim()) {
                    continue;
                }
                
                const id = `tool-${execution.executionId}-${i}`;
                const timestamp = execution.metadata?.startTime 
                    ? this.getTimestampFromEpoch(execution.metadata.startTime + (i * 1000))
                    : this.getTimestamp(conversation.createdAt, i);
                
                const message: KiroChatMessage = {
                    id,
                    type: 'assistant',
                    text: `[Tool Output]\n\n${content}`,
                    timestamp
                };
                
                // 添加模型信息
                if (execution.metadata) {
                    message.model = execution.metadata.modelId;
                    message.workflow = execution.metadata.workflow;
                    message.workflowId = execution.metadata.workflowId;
                }
                
                messages.push(message);
            }
        }
        
        return messages;
    }
    
    /**
     * 构建 bot 消息，处理 entries 数组
     */
    private buildBotMessage(
        chatItem: { role: string; content?: string; entries?: KiroChatEntry[]; messageId?: string; [key: string]: any },
        execution: KiroChatExecution,
        conversation: KiroStorageData,
        index: number,
        toolUseMap: Map<string, { toolUse: KiroChatEntry; response?: KiroChatEntry }>
    ): KiroChatMessage | null {
        const id = chatItem.messageId || `bot-${execution.executionId}-${index}`;
        const timestamp = execution.metadata?.startTime 
            ? this.getTimestampFromEpoch(execution.metadata.startTime + (index * 1000))
            : this.getTimestamp(conversation.createdAt, index);
        
        // 检查是否有 entries 数组（新格式）
        if (chatItem.entries && Array.isArray(chatItem.entries) && chatItem.entries.length > 0) {
            console.log(`[Kiro] Building bot message from entries array, length: ${chatItem.entries.length}`);
            return this.buildBotMessageFromEntries(chatItem.entries, id, timestamp, execution, toolUseMap);
        }
        
        // 旧格式：只有 content 字符串
        const content = chatItem.content || '';
        console.log(`[Kiro] Building bot message from content string, length: ${content.length}`);
        if (!content.trim()) {
            console.warn(`[Kiro] Bot message has empty content`);
            return null;
        }
        
        const message: KiroChatMessage = {
            id,
            type: 'assistant',
            text: content,
            timestamp
        };
        
        // 添加模型信息
        if (execution.metadata) {
            message.model = execution.metadata.modelId;
            message.workflow = execution.metadata.workflow;
            message.workflowId = execution.metadata.workflowId;
        }
        
        return message;
    }
    
    /**
     * 从 entries 数组构建 bot 消息
     */
    private buildBotMessageFromEntries(
        entries: KiroChatEntry[],
        id: string,
        timestamp: string,
        execution: KiroChatExecution,
        toolUseMap: Map<string, { toolUse: KiroChatEntry; response?: KiroChatEntry }>
    ): KiroChatMessage {
        const textParts: string[] = [];
        const toolCalls: Array<{ id: string; name: string; args: { [key: string]: any }; response?: { success: boolean; message: string } }> = [];
        
        // 第一遍：收集 text 和 toolUse
        for (const entry of entries) {
            if (entry.type === 'text' && entry.text) {
                textParts.push(entry.text);
            } else if (entry.type === 'toolUse' && entry.id && entry.name) {
                toolUseMap.set(entry.id, { toolUse: entry });
                toolCalls.push({
                    id: entry.id,
                    name: entry.name,
                    args: entry.args || {}
                });
            } else if (entry.type === 'toolUseResponse' && entry.id) {
                const existing = toolUseMap.get(entry.id);
                if (existing) {
                    existing.response = entry;
                    // 更新对应的 toolCall
                    const toolCall = toolCalls.find(tc => tc.id === entry.id);
                    if (toolCall) {
                        toolCall.response = {
                            success: entry.success !== false,
                            message: entry.message || ''
                        };
                    }
                }
            }
        }
        
        // 构建消息文本
        let messageText = textParts.join('\n\n');
        
        // 如果有工具调用，添加到消息文本中
        if (toolCalls.length > 0) {
            const toolCallTexts: string[] = [];
            
            for (const toolCall of toolCalls) {
                let toolText = `\n\n#### Tool Use: ${toolCall.name}\n\n`;
                toolText += `**参数**:\n\`\`\`json\n${JSON.stringify(toolCall.args, null, 2)}\n\`\`\`\n`;
                
                if (toolCall.response) {
                    toolText += `**响应**: ${toolCall.response.success ? '✅' : '❌'} ${toolCall.response.message}\n`;
                }
                
                toolCallTexts.push(toolText);
            }
            
            messageText += '\n\n' + toolCallTexts.join('\n');
        }
        
        const message: KiroChatMessage = {
            id,
            type: 'assistant',
            text: messageText,
            timestamp,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined
        };
        
        // 添加模型信息
        if (execution.metadata) {
            message.model = execution.metadata.modelId;
            message.workflow = execution.metadata.workflow;
            message.workflowId = execution.metadata.workflowId;
        }
        
        return message;
    }
    
    /**
     * 提取消息内容文本（支持旧格式和新格式）
     */
    private extractContentText(chatItem: { content?: string; entries?: KiroChatEntry[] }): string {
        // 新格式：从 entries 中提取 text
        if (chatItem.entries && Array.isArray(chatItem.entries)) {
            const textParts: string[] = [];
            for (const entry of chatItem.entries) {
                if (entry.type === 'text' && entry.text) {
                    textParts.push(entry.text);
                }
            }
            if (textParts.length > 0) {
                return textParts.join('\n\n');
            }
        }
        
        // 旧格式：直接使用 content
        return chatItem.content || '';
    }
    
    /**
     * 从消息内容数组中提取文本
     */
    private extractTextContent(content: Array<{ type: string; text: string }>): string {
        if (!Array.isArray(content)) {
            return '';
        }
        
        const textParts: string[] = [];
        
        for (const item of content) {
            if (item.type === 'text' && item.text) {
                textParts.push(item.text);
            }
        }
        
        return textParts.join('\n');
    }
    
    /**
     * 获取时间戳（基于基础时间和偏移）
     */
    private getTimestamp(baseTime: number, offsetSeconds: number): string {
        const timestamp = baseTime + (offsetSeconds * 1000); // 每条消息间隔1秒
        return new Date(timestamp).toISOString();
    }
    
    /**
     * 从 epoch 时间戳获取 ISO 字符串
     */
    private getTimestampFromEpoch(epochMs: number): string {
        return new Date(epochMs).toISOString();
    }
}
