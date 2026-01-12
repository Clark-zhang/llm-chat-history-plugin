/**
 * Kiro Markdown 生成器
 * 将 Kiro 消息数组转换为格式化的 Markdown 文档
 */

import { KiroStorageData, KiroChatMessage } from './kiro-types';
import { Translator } from '../../i18n';

export class KiroMarkdownGenerator {
    constructor(private t: Translator) {}
    
    /**
     * 生成 Markdown 文档
     */
    generate(conversation: KiroStorageData, messages: KiroChatMessage[]): string {
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
            if (message.text.trim()) {
                markdown += message.text.trim();
                markdown += '\n\n';
            }
            
            // 如果有工具调用，单独展示
            if (message.toolCalls && message.toolCalls.length > 0) {
                markdown += this.generateToolCallsSection(message.toolCalls);
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
    private generateHeader(conversation: KiroStorageData): string {
        const locale = this.getLocale();
        const source = locale === 'zh' ? 'Amazon Kiro' : 'Amazon Kiro';
        const sessionLabel = locale === 'zh' ? 'Kiro 会话' : 'Kiro Session';
        const date = this.formatDate(new Date(conversation.createdAt).toISOString());
        
        return `<!-- ${this.t('markdown.generatedBy')} -->
<!-- ${source}: ${conversation.id} -->
<!-- ${sessionLabel} ${conversation.id} (${date}) -->`;
    }
    
    /**
     * 生成元信息
     */
    private generateMetadata(conversation: KiroStorageData, messages: KiroChatMessage[]): string {
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
        
        // 添加模型信息（如果有）
        const firstAssistantMsg = messages.find(m => m.type === 'assistant');
        if (firstAssistantMsg?.model) {
            if (locale === 'zh') {
                metadata += `  
**模型**: ${firstAssistantMsg.model}`;
            } else {
                metadata += `  
**Model**: ${firstAssistantMsg.model}`;
            }
        }
        
        // 添加工作流信息（如果有）
        if (firstAssistantMsg?.workflow) {
            if (locale === 'zh') {
                metadata += `  
**工作流**: ${firstAssistantMsg.workflow}`;
            } else {
                metadata += `  
**Workflow**: ${firstAssistantMsg.workflow}`;
            }
        }
        
        return metadata;
    }
    
    /**
     * 生成发言者标题
     */
    private generateSpeakerTitle(message: KiroChatMessage, index: number): string {
        const time = this.formatDate(message.timestamp);
        
        const locale = this.getLocale();
        
        if (message.type === 'user') {
            const prefix = locale === 'zh' ? '💬 用户' : '💬 User';
            return `## ${prefix} #${index}\n\n_${time}_`;
        } else {
            const prefix = locale === 'zh' ? '🤖 助手' : '🤖 Assistant';
            const modelInfo = message.model ? ` (${message.model})` : '';
            const workflowInfo = message.workflow ? ` [${message.workflow}]` : '';
            return `## ${prefix} #${index}${modelInfo}${workflowInfo}\n\n_${time}_`;
        }
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
    
    /**
     * 生成工具调用部分
     */
    private generateToolCallsSection(toolCalls: Array<{ id: string; name: string; args: { [key: string]: any }; response?: { success: boolean; message: string } }>): string {
        const locale = this.getLocale();
        let section = '';
        
        if (locale === 'zh') {
            section += '### 工具调用序列\n\n';
        } else {
            section += '### Tool Calls\n\n';
        }
        
        for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            
            if (locale === 'zh') {
                section += `#### Tool Use ${i + 1}: ${toolCall.name}\n\n`;
            } else {
                section += `#### Tool Use ${i + 1}: ${toolCall.name}\n\n`;
            }
            
            // 参数
            if (toolCall.args && Object.keys(toolCall.args).length > 0) {
                if (locale === 'zh') {
                    section += `**参数**:\n\`\`\`json\n${JSON.stringify(toolCall.args, null, 2)}\n\`\`\`\n\n`;
                } else {
                    section += `**Arguments**:\n\`\`\`json\n${JSON.stringify(toolCall.args, null, 2)}\n\`\`\`\n\n`;
                }
            }
            
            // 响应
            if (toolCall.response) {
                const statusIcon = toolCall.response.success ? '✅' : '❌';
                if (locale === 'zh') {
                    section += `**响应**: ${statusIcon} ${toolCall.response.message || ''}\n\n`;
                } else {
                    section += `**Response**: ${statusIcon} ${toolCall.response.message || ''}\n\n`;
                }
            }
        }
        
        return section.trim();
    }
}
