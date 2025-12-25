/**
 * Blackbox AI 对话构建器
 */

import { BlackboxConversation, BlackboxMessage } from './blackboxai-types';
import { Message } from '../../types';
import { Translator } from '../../i18n';

export class BlackboxConversationBuilder {
    constructor(private t: Translator) {}

    buildConversation(conversation: BlackboxConversation): Message[] {
        const messages: Message[] = [];

        for (const msg of conversation.messages) {
            const message: Message = {
                id: msg.id,
                type: msg.role,
                text: msg.content,
                timestamp: new Date(msg.timestamp).toISOString(),
                toolUses: this.extractToolUses(msg),
                toolResults: this.extractToolResults(msg)
            };

            messages.push(message);
        }

        return messages;
    }

    private extractToolUses(msg: BlackboxMessage): any[] | undefined {
        if (!msg.toolCalls || msg.toolCalls.length === 0) {
            return undefined;
        }

        return msg.toolCalls.map(call => ({
            id: call.id,
            name: call.function.name,
            input: JSON.parse(call.function.arguments)
        }));
    }

    private extractToolResults(msg: BlackboxMessage): any[] | undefined {
        if (!msg.toolResults || msg.toolResults.length === 0) {
            return undefined;
        }

        return msg.toolResults.map(result => ({
            toolUseId: result.toolCallId,
            content: result.content,
            isError: !result.success
        }));
    }
}
