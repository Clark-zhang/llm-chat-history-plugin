/**
 * Copilot Chat Markdown 生成器
 * 将 Copilot Chat 消息数组转换为格式化的 Markdown 文档
 */

import { CopilotStorageData, CopilotChatMessage } from './copilot-types';
import { Translator } from '../../i18n';

export class CopilotMarkdownGenerator {
    constructor(private t: Translator) {}
    
    /**
     * 生成 Markdown 文档
     */
    generate(conversation: CopilotStorageData, messages: CopilotChatMessage[]): string {
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
            
            // 思考过程（如果有，在消息内容之前显示）
            if (message.thinking) {
                markdown += '**💭 思考过程**\n\n';
                markdown += message.thinking;
                markdown += '\n\n';
            }
            
            // 消息内容
            if (message.text.trim()) {
                markdown += message.text.trim();
                markdown += '\n\n';
            }
            
            // 文件引用（如果有）
            if (message.fileReferences && message.fileReferences.length > 0) {
                markdown += '**📁 相关文件**\n\n';
                for (const ref of message.fileReferences) {
                    markdown += `- \`${ref.path}\`\n`;
                }
                markdown += '\n';
            }
            
            // 代码块（如果有）
            if (message.codeBlocks && message.codeBlocks.length > 0) {
                for (const codeBlock of message.codeBlocks) {
                    const lang = codeBlock.language || '';
                    markdown += '```' + lang + '\n';
                    markdown += codeBlock.code;
                    markdown += '\n```\n\n';
                }
            }
            
            // 图片（如果有）
            if (message.images && message.images.length > 0) {
                for (const img of message.images) {
                    markdown += `${img}\n\n`;
                }
            }
            
            // 工具调用（如果有）
            if (message.toolUses && message.toolUses.length > 0) {
                markdown += this.generateToolUses(message.toolUses);
                markdown += '\n\n';
            }
            
            // 工具结果（如果有）
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
    private generateHeader(conversation: CopilotStorageData): string {
        const locale = this.getLocale();
        const source = locale === 'zh' ? 'GitHub Copilot Chat' : 'GitHub Copilot Chat';
        const sessionLabel = locale === 'zh' ? 'Copilot 会话' : 'Copilot Session';
        const date = this.formatDate(new Date(conversation.createdAt).toISOString());
        
        return `<!-- ${this.t('markdown.generatedBy')} -->
<!-- ${source}: ${conversation.id} -->
<!-- ${sessionLabel} ${conversation.id} (${date}) -->`;
    }
    
    /**
     * 生成元信息
     */
    private generateMetadata(conversation: CopilotStorageData, messages: CopilotChatMessage[]): string {
        const userMsgCount = messages.filter(m => m.type === 'user').length;
        const assistantMsgCount = messages.filter(m => m.type === 'assistant').length;
        const createdDate = this.formatDate(new Date(conversation.createdAt).toISOString());
        
        const locale = this.getLocale();
        
        let metadata = '';
        
        if (locale === 'zh') {
            metadata = `**创建时间**: ${createdDate}  
**消息数量**: ${messages.length} 条 (用户: ${userMsgCount}, 助手: ${assistantMsgCount})  
**对话ID**: \`${conversation.id}\``;
        } else {
            metadata = `**Created**: ${createdDate}  
**Messages**: ${messages.length} (User: ${userMsgCount}, Assistant: ${assistantMsgCount})  
**Conversation ID**: \`${conversation.id}\``;
        }
        
        // 添加工作区路径（如果有）
        if (conversation.workspacePath) {
            if (locale === 'zh') {
                metadata += `  
**工作区**: \`${conversation.workspacePath}\``;
            } else {
                metadata += `  
**Workspace**: \`${conversation.workspacePath}\``;
            }
        }
        
        return metadata;
    }
    
    /**
     * 生成发言者标题
     */
    private generateSpeakerTitle(message: CopilotChatMessage, index: number): string {
        const time = this.formatDate(message.timestamp);
        
        const locale = this.getLocale();
        
        if (message.type === 'user') {
            const prefix = locale === 'zh' ? '💬 用户' : '💬 User';
            return `## ${prefix} #${index}\n\n_${time}_`;
        } else {
            const prefix = locale === 'zh' ? '🤖 助手' : '🤖 Assistant';
            const modelInfo = message.model ? ` (${message.model})` : '';
            return `## ${prefix} #${index}${modelInfo}\n\n_${time}_`;
        }
    }
    
    /**
     * 生成工具调用
     */
    private generateToolUses(toolUses: any[]): string {
        let markdown = '';
        const locale = this.getLocale();
        const title = locale === 'zh' ? '🔧 工具调用' : '🔧 Tool Uses';
        
        markdown += `**${title}** (${toolUses.length})\n\n`;
        
        for (const tool of toolUses) {
            const toolTitle = tool.title || tool.name;
            markdown += `<details>\n<summary><strong>${toolTitle || tool.name}</strong></summary>\n\n`;
            markdown += '```json\n';
            markdown += JSON.stringify(tool.input, null, 2);
            markdown += '\n```\n';
            markdown += `</details>\n\n`;
        }
        
        return markdown.trim();
    }
    
    /**
     * 生成工具结果
     */
    private generateToolResults(toolResults: any[]): string {
        let markdown = '';
        const locale = this.getLocale();
        const resultLabel = locale === 'zh' ? '📋 结果' : '📋 Result';
        
        for (const result of toolResults) {
            const errorTag = result.isError ? ' ❌ ERROR' : '';
            markdown += `<details>\n<summary><strong>${resultLabel}${errorTag}</strong></summary>\n\n`;
            
            if (result.content) {
                markdown += '```\n';
                markdown += result.content;
                markdown += '\n```\n';
            }
            
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
