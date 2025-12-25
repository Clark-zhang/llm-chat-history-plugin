/**
 * Codex 对话构建器
 * 将 Codex 会话数据转换为标准消息格式
 */

import { CodexConversation, CodexMessage } from './codex-types';
import { Message } from '../../types';
import { Translator } from '../../i18n';

export class CodexConversationBuilder {
    constructor(private t: Translator) {}

    /**
     * 构建对话
     */
    buildConversation(conversation: CodexConversation): Message[] {
        const messages: Message[] = [];

        for (const msg of conversation.messages) {
            const message: Message = {
                id: msg.id,
                type: msg.role,
                text: msg.content,
                timestamp: new Date(msg.timestamp).toISOString(),
                thinking: this.extractThinking(msg),
                toolUses: this.extractToolUses(msg),
                toolResults: this.extractToolResults(msg),
                context: msg.context
            };

            messages.push(message);
        }

        return messages;
    }

    /**
     * 提取思考过程（如果有）
     */
    private extractThinking(msg: CodexMessage): string | undefined {
        // Codex 可能在消息内容中包含思考标记
        const thinkingMatch = msg.content.match(/<thinking>([\s\S]*?)<\/thinking>/);
        if (thinkingMatch) {
            return thinkingMatch[1].trim();
        }

        // 或者检查是否有专门的思考字段
        if (msg.context?.selection && msg.role === 'assistant') {
            // 如果是assistant消息且有代码选择，可能包含思考
            return undefined; // 暂时不处理
        }

        return undefined;
    }

    /**
     * 提取工具调用
     */
    private extractToolUses(msg: CodexMessage): any[] | undefined {
        if (!msg.toolCalls || msg.toolCalls.length === 0) {
            return undefined;
        }

        return msg.toolCalls.map(call => ({
            id: call.id,
            name: call.function.name,
            input: call.function.arguments
        }));
    }

    /**
     * 提取工具结果
     */
    private extractToolResults(msg: CodexMessage): any[] | undefined {
        if (!msg.toolResults || msg.toolResults.length === 0) {
            return undefined;
        }

        return msg.toolResults.map(result => ({
            toolUseId: result.toolCallId,
            content: result.content,
            isError: result.isError
        }));
    }
}
