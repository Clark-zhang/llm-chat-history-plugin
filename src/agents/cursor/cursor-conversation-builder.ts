/**
 * 对话数据重组器
 * 将 Composer 和 Bubble 数据转换为统一的消息格式
 */

import { ComposerData, Bubble, Message, AIResponseBubble, ToolUseBlock } from '../../types';
import { formatToolUse } from '../../tool-use-formatter';
import { Translator } from '../../i18n';

export class ConversationBuilder {
    constructor(private t: Translator) {}

    /**
     * 从 Composer 构建完整对话
     */
    buildConversation(
        composer: ComposerData,
        bubbles: Bubble[]
    ): Message[] {
        const messages: Message[] = [];
        const bubbleMap = new Map<string, Bubble>();

        // 创建 bubble 映射
        for (const bubble of bubbles) {
            bubbleMap.set(bubble.bubbleId, bubble);
        }

        // 按顺序处理
        const headers = composer.fullConversationHeadersOnly || [];

        for (const header of headers) {
            const bubble = bubbleMap.get(header.bubbleId);
            if (!bubble) continue;

            if (header.type === 1 && bubble.type === 1) {
                // 用户消息
                messages.push({
                    id: bubble.bubbleId,
                    type: 'user',
                    text: bubble.text || '',
                    timestamp: bubble.createdAt,
                    modelName: bubble.modelInfo?.modelName,
                    mode: this.getMode(bubble.unifiedMode)
                });
            } else if (header.type === 2 && bubble.type === 2) {
                // AI 响应
                const toolUse = this.extractToolUse(bubble);
                const toolUses: ToolUseBlock[] | undefined = toolUse ? [toolUse] : undefined;

                messages.push({
                    id: bubble.bubbleId,
                    type: 'assistant',
                    text: bubble.text || '',
                    thinking: bubble.thinking?.text,
                    timestamp: bubble.createdAt,
                    modelName: bubble.modelInfo?.modelName,
                    mode: this.getMode(bubble.unifiedMode),
                    toolResults: bubble.toolResults,
                    toolUses
                });
            }
        }

        return messages;
    }

    /**
     * 获取模式名称
     */
    private getMode(unifiedMode?: number): string {
        switch (unifiedMode) {
            case 1: return this.t('mode.chat');
            case 2: return this.t('mode.agent');
            default: return '';
        }
    }

    /**
     * 提取工具调用 Markdown
     */
    private extractToolUse(bubble: AIResponseBubble): ToolUseBlock | null {
        // Cursor 工具调用 capabilityType 为 15
        if (bubble.capabilityType !== 15) {
            return null;
        }
        return formatToolUse(bubble.toolFormerData, this.t);
    }
}
