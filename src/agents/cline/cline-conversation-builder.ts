/**
 * Cline 对话构建器
 * 将 Cline 的 API conversation 转换为统一的消息格式
 */

import {
    ClineTask,
    ClineMessage,
    ClineApiMessage,
    ClineApiContent,
    ClineToolUse,
    ClineToolResult,
    ClineToolUseContent,
    ClineToolResultContent
} from './cline-types';
import { Translator } from '../../i18n';

export class ClineConversationBuilder {
    constructor(private t: Translator) {}
    
    /**
     * 从 Cline Task 构建完整对话
     */
    buildConversation(task: ClineTask): ClineMessage[] {
        const messages: ClineMessage[] = [];
        let messageIndex = 0;
        
        const apiMessages = task.apiConversation.messages || [];
        
        const uiMessages = task.uiMessages.messages || [];

        for (const apiMsg of apiMessages) {
            const message = this.convertApiMessage(apiMsg, messageIndex, task);
            if (message) {
                // 增强消息内容，添加UI消息中的额外信息
                const enhancedMessage = this.enhanceMessageContent(message, apiMsg, uiMessages[messageIndex]);
                messages.push(enhancedMessage);
                messageIndex++;
            }
        }
        
        return messages;
    }
    
    /**
     * 转换单个 API 消息
     */
    private convertApiMessage(
        apiMsg: ClineApiMessage,
        index: number,
        task: ClineTask
    ): ClineMessage | null {
        // 生成消息 ID
        const id = `${task.id}-${index}`;
        
        // 处理简单字符串内容
        if (typeof apiMsg.content === 'string') {
            return {
                id,
                type: apiMsg.role,
                text: apiMsg.content,
                timestamp: this.getTimestamp(index, task)
            };
        }
        
        // 处理复杂内容数组
        if (Array.isArray(apiMsg.content)) {
            return this.convertComplexMessage(
                id,
                apiMsg.role,
                apiMsg.content,
                index,
                task
            );
        }
        
        return null;
    }
    
    /**
     * 转换复杂消息（包含多种内容类型）
     */
    private convertComplexMessage(
        id: string,
        role: 'user' | 'assistant',
        content: ClineApiContent,
        index: number,
        task: ClineTask
    ): ClineMessage {
        let text = '';
        const toolUses: ClineToolUse[] = [];
        const toolResults: ClineToolResult[] = [];
        const images: string[] = [];
        
        for (const item of content) {
            switch (item.type) {
                case 'text':
                    text += item.text + '\n';
                    break;

                case 'thinking':
                    // cline的推理过程，添加到text中作为思考内容
                    if (item.thinking) {
                        text += `💭 思考过程：\n${item.thinking}\n\n`;
                    }
                    break;

                case 'image':
                    // 保存图片数据引用（实际可能需要单独处理）
                    images.push(`[Image: ${item.source?.media_type || 'unknown'}]`);
                    break;

                case 'tool_use':
                    toolUses.push({
                        id: item.id,
                        name: item.name,
                        input: item.input
                    });
                    break;

                case 'tool_result':
                    toolResults.push({
                        id: `result-${item.tool_use_id}`,
                        toolUseId: item.tool_use_id,
                        content: item.content,
                        isError: item.is_error
                    });
                    break;

                default:
                    // 处理其他未知类型，尝试提取文本内容
                    if ((item as any).text) {
                        text += (item as any).text + '\n';
                    }
                    break;
            }
        }
        
        return {
            id,
            type: role,
            text: text.trim(),
            timestamp: this.getTimestamp(index, task),
            toolUses: toolUses.length > 0 ? toolUses : undefined,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
            images: images.length > 0 ? images : undefined
        };
    }
    
    /**
     * 获取消息时间戳
     */
    private getTimestamp(index: number, task: ClineTask): string {
        // 尝试从 UI messages 获取精确时间戳
        const uiMessages = task.uiMessages.messages || [];

        if (uiMessages[index] && uiMessages[index].ts) {
            return new Date(uiMessages[index].ts).toISOString();
        }

        // 否则使用任务创建时间 + 偏移
        const baseTime = task.metadata.ts || Date.now();
        const offset = index * 1000; // 每条消息间隔 1 秒
        return new Date(baseTime + offset).toISOString();
    }

    /**
     * 增强消息内容处理，支持cline特有的格式
     */
    private enhanceMessageContent(message: ClineMessage, apiMsg: any, uiMsg?: any): ClineMessage {
        // 如果UI消息包含额外信息，添加到消息中
        if (uiMsg) {
            // 添加模型信息
            if (uiMsg.modelInfo) {
                message.text += `\n\n🤖 模型: ${uiMsg.modelInfo.modelId}`;
            }

            // 添加token使用信息
            if (uiMsg.metrics?.tokens) {
                const tokens = uiMsg.metrics.tokens;
                message.text += `\n📊 Token: 输入 ${tokens.prompt || 0}, 输出 ${tokens.completion || 0}`;
            }
        }

        return message;
    }
}





