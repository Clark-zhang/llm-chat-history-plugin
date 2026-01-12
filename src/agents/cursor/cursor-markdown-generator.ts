/**
 * Markdown 生成器
 * 将消息数组转换为格式化的 Markdown 文档
 */

import { ComposerData, Message } from '../../types';
import { Translator } from '../../i18n';

export class MarkdownGenerator {
    constructor(private t: Translator) {}

    /**
     * 生成 Markdown 文档
     */
    generate(
        composer: ComposerData,
        messages: Message[]
    ): string {
        let markdown = '';

        // 文件头
        markdown += this.generateHeader(composer);
        markdown += '\n\n';

        // 标题
        const title = composer.name || this.t('markdown.untitled');
        markdown += `# ${title}\n\n`;

        // 元信息
        markdown += this.generateMetadata(composer, messages);
        markdown += '\n\n';

        markdown += '---\n\n';

        // 消息
        let messageIndex = 1;

        for (const message of messages) {
            // 发言者标题（使用二级标题）
            markdown += this.generateSpeakerTitle(message, messageIndex);
            markdown += '\n\n';

            // 思考过程（如果有）
            if (message.thinking) {
                markdown += this.generateThinking(message.thinking);
                markdown += '\n\n';
            }

            // 消息内容
            if (message.text.trim()) {
                markdown += message.text.trim();
                markdown += '\n\n';
            }

            // 工具调用（如果有）
            if (message.toolUses && message.toolUses.length > 0) {
                markdown += this.generateToolUsesSummary(message.toolUses.length);
                markdown += '\n\n';
                for (const toolUse of message.toolUses) {
                    markdown += toolUse.markdown;
                    markdown += '\n\n';
                }
            }

            // 工具调用结果（如果有）
            if (message.toolResults && message.toolResults.length > 0) {
                markdown += this.generateToolResults(message.toolResults);
                markdown += '\n\n';
            }

            markdown += '---\n\n';

            messageIndex++;
        }

        return markdown.trim() + '\n';
    }

    /**
     * 生成文件头
     */
    private generateHeader(composer: ComposerData): string {
        return `<!-- ${this.t('markdown.generatedBy')} -->
<!-- ${this.t('markdown.cursorSession', {
    id: composer.composerId,
    date: this.formatDate(composer.createdAt)
})} -->`;
    }

    /**
     * 生成元信息
     */
    private generateMetadata(composer: ComposerData, messages: Message[]): string {
        const userMsgCount = messages.filter(m => m.type === 'user').length;
        const assistantMsgCount = messages.filter(m => m.type === 'assistant').length;
        const createdDate = this.formatDate(composer.createdAt);

        const locale = this.getLocale();

        if (locale === 'zh') {
            return `**创建时间**: ${createdDate}  
**消息数量**: ${messages.length} 条 (用户: ${userMsgCount}, 助手: ${assistantMsgCount})  
**会话ID**: \`${composer.composerId}\``;
        } else {
            return `**Created**: ${createdDate}  
**Messages**: ${messages.length} (User: ${userMsgCount}, Assistant: ${assistantMsgCount})  
**Session ID**: \`${composer.composerId}\``;
        }
    }

    /**
     * 生成发言者标题
     */
    private generateSpeakerTitle(message: Message, index: number): string {
        const time = this.formatDate(message.timestamp);

        if (message.type === 'user') {
            const locale = this.getLocale();
            const prefix = locale === 'zh' ? '💬 用户' : '💬 User';
            return `## ${prefix} #${index}\n\n_${time}_`;
        } else {
            const parts = [];
            if (message.modelName) {
                parts.push(message.modelName);
            }
            if (message.mode) {
                parts.push(message.mode);
            }
            const info = parts.length > 0 ? ` (${parts.join(', ')})` : '';

            const locale = this.getLocale();
            const prefix = locale === 'zh' ? '🤖 助手' : '🤖 Assistant';
            return `## ${prefix} #${index}${info}\n\n_${time}_`;
        }
    }

    /**
     * 生成工具使用摘要
     */
    private generateToolUsesSummary(count: number): string {
        const locale = this.getLocale();
        if (locale === 'zh') {
            return `**🔧 工具调用** (${count} 个)`;
        } else {
            return `**🔧 Tool Uses** (${count})`;
        }
    }

    /**
     * 生成思考过程
     */
    private generateThinking(thinking: string): string {
        const locale = this.getLocale();
        const title = locale === 'zh' ? '💭 思考过程' : '💭 Thinking Process';

        // 使用 blockquote 使思考过程更易读
        const lines = thinking.split('\n');
        const quotedLines = lines.map(line => line.trim() ? `> ${line}` : '>').join('\n');

        return `<details>\n<summary><strong>${title}</strong></summary>\n\n${quotedLines}\n\n</details>`;
    }

    /**
     * 生成工具调用结果
     */
    private generateToolResults(toolResults: Array<{ name: string; result: any }>): string {
        let markdown = '';
        const locale = this.getLocale();
        const resultLabel = locale === 'zh' ? '结果' : 'Result';

        for (const tool of toolResults) {
            markdown += `<details>\n<summary><strong>📋 ${resultLabel}: ${tool.name}</strong></summary>\n\n`;
            markdown += '```json\n';
            markdown += JSON.stringify(tool.result, null, 2);
            markdown += '\n```\n';
            markdown += `</details>\n\n`;
        }

        return markdown.trim();
    }

    /**
     * 获取当前语言环境
     */
    private getLocale(): string {
        const testKey = this.t('mode.chat');
        return testKey === '对话' ? 'zh' : 'en';
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
}
