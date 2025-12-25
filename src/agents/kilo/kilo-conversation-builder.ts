/**
 * Kilo 对话构建器
 */

import { KiloConversation, KiloMessage } from './kilo-types';
import { Message } from '../../types';
import { Translator } from '../../i18n';

export class KiloConversationBuilder {
    constructor(private t: Translator) {}

    buildConversation(conversation: KiloConversation): Message[] {
        console.log(`[Kilo] 🔧 Building conversation: ${conversation.id} with ${conversation.messages.length} raw messages`);

        const messages: Message[] = [];

        for (const msg of conversation.messages) {
            const toolUses = this.extractToolUses(msg);
            const toolResults = this.extractToolResults(msg);

            const message: Message = {
                id: msg.id,
                type: msg.role,
                text: msg.content,
                timestamp: new Date(msg.timestamp).toISOString(),
                toolUses: toolUses,
                toolResults: toolResults
            };

            console.log(`[Kilo]   - Message ${msg.id}: ${msg.role} (${msg.content.length} chars)`);
            if (toolUses && toolUses.length > 0) {
                console.log(`[Kilo]     Tool uses: ${toolUses.length}`);
            }
            if (toolResults && toolResults.length > 0) {
                console.log(`[Kilo]     Tool results: ${toolResults.length}`);
            }

            messages.push(message);
        }

        console.log(`[Kilo] ✅ Built ${messages.length} standardized messages`);
        return messages;
    }

    private extractToolUses(msg: KiloMessage): any[] | undefined {
        if (!msg.toolCalls || msg.toolCalls.length === 0) {
            return undefined;
        }

        return msg.toolCalls.map(call => ({
            id: call.id,
            name: call.name,
            input: call.arguments
        }));
    }

    private extractToolResults(msg: KiloMessage): any[] | undefined {
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
