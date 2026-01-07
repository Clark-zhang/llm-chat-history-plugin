/**
 * Markdown 解析器
 * 从 Markdown 文件中提取会话数据，用于手动文件同步
 */

import { SyncMessage } from './cloud/cloud-sync';

export interface ParsedSession {
    title: string;
    session_id: string;
    source: string;
    workspace_path?: string;
    workspace_name?: string;
    messages: SyncMessage[];
}

/**
 * 从 Markdown 内容解析会话数据
 */
export function parseMarkdown(content: string, filePath: string): ParsedSession | null {
    try {
        const lines = content.split('\n');
        
        // 提取 session_id（从注释或元数据）
        let sessionId = extractSessionId(lines);
        if (!sessionId) {
            // 如果没有找到 session_id，使用文件路径生成一个
            sessionId = generateSessionIdFromPath(filePath);
        }
        
        // 提取标题
        const title = extractTitle(lines);
        
        // 提取 source
        const source = extractSource(lines) || 'cursor';
        
        // 提取 workspace 信息
        const workspaceInfo = extractWorkspaceInfo(filePath);
        
        // 解析消息
        const messages = parseMessages(lines);
        
        if (messages.length === 0) {
            console.warn('[MarkdownParser] No messages found in file:', filePath);
            return null;
        }
        
        return {
            title: title || 'Untitled',
            session_id: sessionId,
            source,
            workspace_path: workspaceInfo.path,
            workspace_name: workspaceInfo.name,
            messages,
        };
    } catch (error) {
        console.error('[MarkdownParser] Failed to parse markdown:', error);
        return null;
    }
}

/**
 * 从注释中提取 session_id
 * 格式: <!-- Cursor Session: abc123 | 2025-01-07 10:30Z -->
 * 或: **Session ID**: `abc123`
 */
function extractSessionId(lines: string[]): string | null {
    for (const line of lines) {
        // 格式1: 注释中的 Session ID
        const commentMatch = line.match(/<!--.*Session[:\s]+([a-zA-Z0-9-_]+)/i);
        if (commentMatch) {
            return commentMatch[1];
        }
        
        // 格式2: Markdown 元数据中的 Session ID
        const metaMatch = line.match(/\*\*Session\s*ID\*\*[:\s]*`([^`]+)`/i);
        if (metaMatch) {
            return metaMatch[1];
        }
        
        // 格式3: 会话ID 中文格式
        const zhMatch = line.match(/\*\*会话ID\*\*[:\s]*`([^`]+)`/i);
        if (zhMatch) {
            return zhMatch[1];
        }
    }
    return null;
}

/**
 * 从文件路径生成 session_id
 */
function generateSessionIdFromPath(filePath: string): string {
    // 使用文件名（不含扩展名）作为 session_id
    const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
    const nameWithoutExt = fileName.replace(/\.md$/i, '');
    // 添加前缀避免与原始 session_id 冲突
    return `file-${nameWithoutExt}`;
}

/**
 * 提取标题（第一个 # 标题）
 */
function extractTitle(lines: string[]): string | null {
    for (const line of lines) {
        const match = line.match(/^#\s+(.+)$/);
        if (match) {
            return match[1].trim();
        }
    }
    return null;
}

/**
 * 从注释中提取 source
 */
function extractSource(lines: string[]): string | null {
    for (const line of lines) {
        // 检查注释中的 source 信息
        if (line.includes('Cursor')) return 'cursor';
        if (line.includes('Cline')) return 'cline';
        if (line.includes('Blackbox')) return 'blackboxai';
        if (line.includes('Kilo')) return 'kilo';
    }
    return null;
}

/**
 * 从文件路径提取 workspace 信息
 */
function extractWorkspaceInfo(filePath: string): { path?: string; name?: string } {
    // 查找 .llm-chat-history 目录的父目录作为 workspace
    const llmHistoryIndex = filePath.indexOf('.llm-chat-history');
    if (llmHistoryIndex > 0) {
        const workspacePath = filePath.substring(0, llmHistoryIndex - 1);
        const parts = workspacePath.split(/[/\\]/);
        const workspaceName = parts[parts.length - 1];
        return { path: workspacePath, name: workspaceName };
    }
    return {};
}

/**
 * 解析消息列表
 */
function parseMessages(lines: string[]): SyncMessage[] {
    const messages: SyncMessage[] = [];
    let currentMessage: Partial<SyncMessage> | null = null;
    let currentContent: string[] = [];
    let inThinking = false;
    let thinkingContent: string[] = [];
    let inToolUse = false;
    let toolUseContent: string[] = [];
    let inToolResult = false;
    let toolResultContent: string[] = [];
    
    const flushMessage = () => {
        if (currentMessage && currentMessage.type) {
            currentMessage.content = currentContent.join('\n').trim();
            if (thinkingContent.length > 0) {
                currentMessage.thinking = thinkingContent.join('\n').trim();
            }
            if (toolUseContent.length > 0) {
                currentMessage.tool_uses = toolUseContent.join('\n').trim();
            }
            if (toolResultContent.length > 0) {
                currentMessage.tool_results = toolResultContent.join('\n').trim();
            }
            
            // 确保有 timestamp
            if (!currentMessage.timestamp) {
                currentMessage.timestamp = new Date().toISOString();
            }
            
            messages.push(currentMessage as SyncMessage);
        }
        currentMessage = null;
        currentContent = [];
        thinkingContent = [];
        toolUseContent = [];
        toolResultContent = [];
        inThinking = false;
        inToolUse = false;
        inToolResult = false;
    };
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 检测消息标题（## User 或 ## Assistant）
        const userMatch = line.match(/^##\s*(💬\s*)?(User|用户)/i);
        const assistantMatch = line.match(/^##\s*(🤖\s*)?(Assistant|助手)/i);
        
        if (userMatch || assistantMatch) {
            // 保存前一个消息
            flushMessage();
            
            // 开始新消息
            currentMessage = {
                type: userMatch ? 'user' : 'assistant',
            };
            
            // 尝试从标题中提取模型名称和模式
            if (assistantMatch) {
                const infoMatch = line.match(/\(([^)]+)\)/);
                if (infoMatch) {
                    const parts = infoMatch[1].split(',').map(p => p.trim());
                    for (const part of parts) {
                        if (part.toLowerCase().includes('agent') || part.toLowerCase().includes('chat')) {
                            currentMessage.mode = part;
                        } else if (part && !part.startsWith('#')) {
                            currentMessage.model_name = part;
                        }
                    }
                }
            }
            
            continue;
        }
        
        // 检测时间戳行
        const timeMatch = line.match(/^_(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?Z?)_$/);
        if (timeMatch && currentMessage) {
            const timeStr = timeMatch[1];
            try {
                // 尝试解析时间
                const date = parseTimestamp(timeStr);
                currentMessage.timestamp = date.toISOString();
            } catch {
                // 如果解析失败，使用原始字符串
                currentMessage.timestamp = timeStr;
            }
            continue;
        }
        
        // 检测思考过程开始（<details> 包含 Thinking）
        if (line.includes('<details>') && lines[i + 1]?.includes('Thinking') || 
            line.includes('<details>') && lines[i + 1]?.includes('思考')) {
            inThinking = true;
            continue;
        }
        
        // 检测思考过程结束
        if (inThinking && line.includes('</details>')) {
            inThinking = false;
            continue;
        }
        
        // 检测工具调用开始
        if (line.match(/\*\*🔧\s*(Tool Uses?|工具调用)\*\*/i)) {
            inToolUse = true;
            continue;
        }
        
        // 检测工具结果开始
        if (line.match(/<summary>.*Result.*<\/summary>/i) || 
            line.match(/<summary>.*结果.*<\/summary>/i)) {
            inToolResult = true;
            inToolUse = false;
            continue;
        }
        
        // 检测分隔线（消息结束标记）
        if (line.match(/^---\s*$/)) {
            // 不立即 flush，因为可能是文档内的分隔线
            continue;
        }
        
        // 跳过 summary 行
        if (line.includes('<summary>') || line.includes('</summary>')) {
            continue;
        }
        
        // 收集内容
        if (currentMessage) {
            if (inThinking) {
                // 移除 blockquote 前缀
                const cleanLine = line.replace(/^>\s?/, '');
                thinkingContent.push(cleanLine);
            } else if (inToolUse) {
                toolUseContent.push(line);
            } else if (inToolResult) {
                if (line.includes('</details>')) {
                    inToolResult = false;
                } else {
                    toolResultContent.push(line);
                }
            } else {
                currentContent.push(line);
            }
        }
    }
    
    // 保存最后一个消息
    flushMessage();
    
    return messages;
}

/**
 * 解析时间戳字符串
 */
function parseTimestamp(timeStr: string): Date {
    // 格式: 2025-01-07 10:30Z 或 2025-01-07 10:30:00Z
    const match = timeStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?Z?/);
    if (match) {
        const [, year, month, day, hour, minute, second = '00'] = match;
        return new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
        ));
    }
    // 如果解析失败，返回当前时间
    return new Date();
}
