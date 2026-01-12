/**
 * Kilo Markdown 生成器
 */

import { KiloConversation, KiloMessage } from './kilo-types';
import { Translator } from '../../i18n';

export class KiloMarkdownGenerator {
    constructor(private t: Translator) {}

    generate(conversation: KiloConversation, messages: KiloMessage[]): string {
        let markdown = '';

        // 文件头
        markdown += this.generateHeader(conversation);
        markdown += '\n\n';

        // 标题
        const title = conversation.title || this.t('markdown.untitled');
        markdown += `# ${title}\n\n`;

        // 元信息
        markdown += this.generateMetadata(conversation, messages);
        markdown += '\n\n';

        markdown += '---\n\n';

        // 消息
        let messageIndex = 1;

        for (const message of messages) {
            // 发言者标题
            markdown += this.generateSpeakerTitle(message, messageIndex);
            markdown += '\n\n';

            // 消息内容
            if (message.content.trim()) {
                markdown += this.formatMessageContent(message.content);
                markdown += '\n\n';
            }

            // 工具调用
            if (message.toolCalls && message.toolCalls.length > 0) {
                markdown += this.generateToolCalls(message.toolCalls);
                markdown += '\n\n';
            }

            // 工具结果
            if (message.toolResults && message.toolResults.length > 0) {
                markdown += this.generateToolResults(message.toolResults);
                markdown += '\n\n';
            }

            messageIndex++;
        }

        return markdown;
    }

    private generateHeader(conversation: KiloConversation): string {
        return `---
title: "${conversation.title}"
created: ${new Date(conversation.createdAt).toISOString()}
updated: ${new Date(conversation.updatedAt).toISOString()}
source: "Kilo"
model: "${conversation.model || 'Unknown'}"
---`;
    }

    private generateMetadata(conversation: KiloConversation, messages: KiloMessage[]): string {
        const userMessages = messages.filter(m => m.role === 'user').length;
        const assistantMessages = messages.filter(m => m.role === 'assistant').length;
        const createdDate = new Date(conversation.createdAt).toLocaleString();

        let metadata = `**${this.t('markdown.created')}**: ${createdDate}\n`;
        metadata += `**${this.t('markdown.messages')}**: ${messages.length} (${this.t('markdown.user')}: ${userMessages}, ${this.t('markdown.assistant')}: ${assistantMessages})\n`;
        metadata += `**${this.t('markdown.sessionId')}**: \`${conversation.id}\`\n`;

        if (conversation.model) {
            metadata += `**Model**: ${conversation.model}\n`;
        }

        return metadata;
    }

    private generateSpeakerTitle(message: KiloMessage, index: number): string {
        const role = message.role;
        const icon = role === 'user' ? '💬' : role === 'assistant' ? '🤖' : '⚙️';
        const timestamp = this.formatDate(message.timestamp);

        return `## ${icon} ${this.t(`markdown.${role}`)} #${index}\n\n_${timestamp}_`;
    }

    /**
     * 格式化日期为 UTC
     */
    private formatDate(isoDate: string): string {
        const date = new Date(isoDate);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        const second = String(date.getUTCSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hour}:${minute}:${second}Z`;
    }

    private formatMessageContent(content: string): string {
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            return `\`\`\`${lang || ''}\n${code.trim()}\n\`\`\``;
        });
        content = content.replace(/`([^`]+)`/g, '`$1`');
        return content;
    }

    private generateToolCalls(toolCalls: any[]): string {
        let result = `**🔧 ${this.t('markdown.toolUses')}** (${toolCalls.length})\n\n`;

        for (let i = 0; i < toolCalls.length; i++) {
            const call = toolCalls[i];
            result += `<details>\n<summary>🔍 **${call.name}** — Tool Call ${i + 1}</summary>\n\n`;
            result += `**ID**: \`${call.id}\`\n\n`;
            result += `**Args**\n\n\`\`\`json\n${JSON.stringify(call.input, null, 2)}\n\`\`\`\n\n`;
            result += '</details>\n\n';
        }

        return result.trim();
    }

    private generateToolResults(toolResults: any[]): string {
        let result = `**📋 ${this.t('markdown.toolResults')}** (${toolResults.length})\n\n`;

        for (const toolResult of toolResults) {
            const status = toolResult.isError ? '❌ Error' : '✅ Success';
            result += `<details>\n<summary>${status} — Tool Result</summary>\n\n`;
            result += `**Tool Call ID**: \`${toolResult.toolCallId}\`\n\n`;
            if (toolResult.content) {
                result += `**Output**\n\n\`\`\`\n${toolResult.content}\n\`\`\`\n\n`;
            }
            result += '</details>\n\n';
        }

        return result.trim();
    }
}
