/**
 * Copilot Chat 对话构建器
 * 将 Copilot Chat 的数据转换为统一的消息格式
 */

import {
    CopilotStorageData,
    CopilotChatMessage,
    CopilotRequest,
    CopilotResponseItem,
    CopilotTextResponse,
    CopilotThinkingResponse,
    CopilotInlineReferenceResponse,
    CopilotToolInvocationResponse,
    CopilotPrepareToolInvocationResponse,
    CopilotToolUse,
    CopilotToolResult
} from './copilot-types';
import { Translator } from '../../i18n';

export class CopilotConversationBuilder {
    constructor(private t: Translator) {}
    
    /**
     * 从 Copilot 对话数据构建消息列表
     */
    buildConversation(conversation: CopilotStorageData): CopilotChatMessage[] {
        const messages: CopilotChatMessage[] = [];
        
        const requests = conversation.session.requests || [];
        
        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            
            // 添加用户消息
            const userMessage = this.convertUserMessage(request, i, conversation);
            if (userMessage) {
                messages.push(userMessage);
            }
            
            // 添加助手响应
            const assistantMessage = this.convertAssistantResponse(request, i, conversation);
            if (assistantMessage) {
                messages.push(assistantMessage);
            }
        }
        
        return messages;
    }
    
    /**
     * 转换用户消息
     */
    private convertUserMessage(
        request: CopilotRequest,
        index: number,
        conversation: CopilotStorageData
    ): CopilotChatMessage | null {
        if (!request.message || !request.message.text) {
            return null;
        }
        
        const id = `user-${request.requestId}`;
        const text = request.message.text.trim();
        
        if (!text) {
            return null;
        }
        
        // 获取时间戳（使用会话创建时间 + 偏移）
        const timestamp = this.getTimestamp(conversation.createdAt, index * 2);
        
        return {
            id,
            type: 'user',
            text,
            timestamp
        };
    }
    
    /**
     * 转换助手响应
     */
    private convertAssistantResponse(
        request: CopilotRequest,
        index: number,
        conversation: CopilotStorageData
    ): CopilotChatMessage | null {
        if (!request.response || request.response.length === 0) {
            return null;
        }
        
        const id = `assistant-${request.requestId}`;
        let text = '';
        const toolUses: CopilotToolUse[] = [];
        const toolResults: CopilotToolResult[] = [];
        let thinking: string | undefined;
        const fileReferences: Array<{ path: string; scheme: string }> = [];
        
        // 处理响应项
        let currentToolCallId: string | undefined;
        let currentToolName: string | undefined;
        
        for (const item of request.response) {
            // 使用类型守卫来区分不同的响应类型
            if ('kind' in item) {
                switch (item.kind) {
                    case 'thinking':
                        // 思考过程
                        const thinkingResponse = item as CopilotThinkingResponse;
                        if (typeof thinkingResponse.value === 'string' && thinkingResponse.value) {
                            if (thinking) {
                                thinking += '\n\n' + thinkingResponse.value;
                            } else {
                                thinking = thinkingResponse.value;
                            }
                        }
                        break;
                        
                    case 'inlineReference':
                        // 内联文件引用
                        const refResponse = item as CopilotInlineReferenceResponse;
                        if (refResponse.inlineReference) {
                            const ref = refResponse.inlineReference;
                            const filePath = ref.fsPath || ref.path || ref.external || '';
                            if (filePath) {
                                fileReferences.push({
                                    path: filePath,
                                    scheme: ref.scheme || 'file'
                                });
                                // 在文本中添加文件引用标记
                                text += `\n\n[📁 ${filePath}]`;
                            }
                        }
                        break;
                        
                    case 'prepareToolInvocation':
                        // 准备工具调用
                        const prepareResponse = item as CopilotPrepareToolInvocationResponse;
                        currentToolName = prepareResponse.toolName;
                        break;
                        
                    case 'toolInvocationSerialized':
                        // 工具调用
                        const toolResponse = item as CopilotToolInvocationResponse;
                        if (toolResponse.toolId && toolResponse.toolCallId) {
                            toolUses.push({
                                id: toolResponse.toolCallId,
                                name: toolResponse.toolId,
                                input: {
                                    invocationMessage: toolResponse.invocationMessage?.value,
                                    pastTenseMessage: toolResponse.pastTenseMessage?.value
                                },
                                title: toolResponse.generatedTitle
                            });
                            
                            // 如果有调用消息，添加到文本中
                            if (toolResponse.invocationMessage?.value) {
                                text += '\n\n' + toolResponse.invocationMessage.value;
                            }
                            
                            // 如果有过去时消息，添加到文本中
                            if (toolResponse.pastTenseMessage?.value) {
                                text += '\n\n' + toolResponse.pastTenseMessage.value;
                            }
                        }
                        break;
                        
                    default:
                        // 其他类型，尝试提取文本
                        if ((item as any).value && typeof (item as any).value === 'string') {
                            text += (item as any).value;
                        }
                        break;
                }
            } else if ('value' in item) {
                // 文本内容（没有 kind 字段）
                const textResponse = item as CopilotTextResponse;
                if (textResponse.value) {
                    text += textResponse.value;
                }
            }
        }
        
        if (!text.trim() && !thinking && toolUses.length === 0) {
            return null;
        }
        
        // 获取时间戳（用户消息之后）
        const timestamp = this.getTimestamp(conversation.createdAt, index * 2 + 1);
        
        return {
            id,
            type: 'assistant',
            text: text.trim(),
            timestamp,
            thinking,
            toolUses: toolUses.length > 0 ? toolUses : undefined,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
            fileReferences: fileReferences.length > 0 ? fileReferences : undefined
        };
    }
    
    /**
     * 获取时间戳
     */
    private getTimestamp(baseTime: number, offsetSeconds: number): string {
        const timestamp = baseTime + (offsetSeconds * 1000); // 每条消息间隔1秒
        return new Date(timestamp).toISOString();
    }
}
