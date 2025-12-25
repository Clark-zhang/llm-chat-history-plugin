/**
 * CodeGeeX Markdown 生成器
 */

import { CodeGeeXConversation, CodeGeeXMessage } from './codegeex-types';
import { Translator } from '../../i18n';

export class CodeGeeXMarkdownGenerator {
    constructor(private t: Translator) {}

    generate(conversation: CodeGeeXConversation, messages: CodeGeeXMessage[]): string {
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

    private generateHeader(conversation: CodeGeeXConversation): string {
        let header = `---
title: "${conversation.title}"
created: ${new Date(conversation.createdAt).toISOString()}
updated: ${new Date(conversation.updatedAt).toISOString()}
source: "CodeGeeX"
`;

        if (conversation.model) {
            header += `model: "${conversation.model}"\n`;
        }
        if (conversation.language) {
            header += `language: "${conversation.language}"\n`;
        }

        header += '---';
        return header;
    }

    private generateMetadata(conversation: CodeGeeXConversation, messages: CodeGeeXMessage[]): string {
        const userMessages = messages.filter(m => m.role === 'user').length;
        const assistantMessages = messages.filter(m => m.role === 'assistant').length;
        const createdDate = new Date(conversation.createdAt).toLocaleString();

        let metadata = `**${this.t('markdown.created')}**: ${createdDate}\n`;
        metadata += `**${this.t('markdown.messages')}**: ${messages.length} (${this.t('markdown.user')}: ${userMessages}, ${this.t('markdown.assistant')}: ${assistantMessages})\n`;
        metadata += `**${this.t('markdown.sessionId')}**: \`${conversation.id}\`\n`;

        if (conversation.model) {
            metadata += `**Model**: ${conversation.model}\n`;
        }
        if (conversation.language) {
            metadata += `**Language**: ${conversation.language}\n`;
        }

        return metadata;
    }

    private generateSpeakerTitle(message: CodeGeeXMessage, index: number): string {
        const role = message.role;
        const icon = role === 'user' ? '💬' : role === 'assistant' ? '🤖' : '⚙️';
        const timestamp = new Date(message.timestamp).toLocaleString();

        return `## ${icon} ${this.t(`markdown.${role}`)} #${index}\n\n_${timestamp}_`;
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
