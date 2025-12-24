/**
 * Cline Markdown 生成器
 * 将 Cline 消息数组转换为格式化的 Markdown 文档
 */

import { ClineTask, ClineMessage } from './cline-types';
import { Translator } from './i18n';

export class ClineMarkdownGenerator {
    constructor(private t: Translator) {}
    
    /**
     * 生成 Markdown 文档
     */
    generate(task: ClineTask, messages: ClineMessage[]): string {
        let markdown = '';
        
        // 文件头
        markdown += this.generateHeader(task);
        markdown += '\n\n';
        
        // 标题
        const title = task.metadata.task || this.t('markdown.untitled');
        markdown += `# ${title}\n\n`;
        
        // 元信息
        markdown += this.generateMetadata(task, messages);
        markdown += '\n\n';
        
        markdown += '---\n\n';
        
        // 消息
        let messageIndex = 1;
        
        for (const message of messages) {
            // 发言者标题
            markdown += this.generateSpeakerTitle(message, messageIndex);
            markdown += '\n\n';
            
            // 消息内容
            if (message.text.trim()) {
                markdown += message.text.trim();
                markdown += '\n\n';
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
    private generateHeader(task: ClineTask): string {
        const locale = this.getLocale();
        const source = locale === 'zh' ? 'Cline 任务' : 'Cline Task';
        
        return `<!-- ${this.t('markdown.generatedBy')} -->
<!-- ${source}: ${task.id} -->
<!-- ${this.t('markdown.cursorSession', {
    id: task.id,
    date: this.formatDate(new Date(task.metadata.ts).toISOString())
})} -->`;
    }
    
    /**
     * 生成元信息
     */
    private generateMetadata(task: ClineTask, messages: ClineMessage[]): string {
        const userMsgCount = messages.filter(m => m.type === 'user').length;
        const assistantMsgCount = messages.filter(m => m.type === 'assistant').length;
        const createdDate = this.formatDate(new Date(task.metadata.ts).toISOString());
        
        const locale = this.getLocale();
        
        if (locale === 'zh') {
            return `**创建时间**: ${createdDate}  
**消息数量**: ${messages.length} 条 (用户: ${userMsgCount}, 助手: ${assistantMsgCount})  
**Token 使用**: 输入 ${task.metadata.tokensIn}, 输出 ${task.metadata.tokensOut}  
**总费用**: $${task.metadata.totalCost.toFixed(4)}  
**任务ID**: \`${task.id}\``;
        } else {
            return `**Created**: ${createdDate}  
**Messages**: ${messages.length} (User: ${userMsgCount}, Assistant: ${assistantMsgCount})  
**Tokens**: In ${task.metadata.tokensIn}, Out ${task.metadata.tokensOut}  
**Total Cost**: $${task.metadata.totalCost.toFixed(4)}  
**Task ID**: \`${task.id}\``;
        }
    }
    
    /**
     * 生成发言者标题
     */
    private generateSpeakerTitle(message: ClineMessage, index: number): string {
        const time = this.formatDate(message.timestamp);
        
        const locale = this.getLocale();
        
        if (message.type === 'user') {
            const prefix = locale === 'zh' ? '💬 用户' : '💬 User';
            return `## ${prefix} #${index}\n\n_${time}_`;
        } else {
            const prefix = locale === 'zh' ? '🤖 助手' : '🤖 Assistant';
            return `## ${prefix} #${index}\n\n_${time}_`;
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
            markdown += `<details>\n<summary><strong>${tool.name}</strong></summary>\n\n`;
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
        
        return `${year}-${month}-${day} ${hour}:${minute}Z`;
    }
}


