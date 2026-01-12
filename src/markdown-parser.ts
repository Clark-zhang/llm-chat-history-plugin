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
        if (line.includes('Copilot')) return 'copilot';
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
    let messageIndex = 0; // 用于为没有时间戳的消息生成递增时间戳
    
    // 尝试从文件中提取第一个有效时间戳作为基准
    let baseTimestamp: Date | null = null;
    for (const line of lines) {
        const timeMatch = line.match(/^_(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?Z?)_$/);
        if (timeMatch) {
            try {
                baseTimestamp = parseTimestamp(timeMatch[1]);
                break;
            } catch {
                // 继续查找
            }
        }
    }
    
    /**
     * 解析工具调用内容，提取结构化数据
     */
    const parseToolUses = (content: string): string | undefined => {
        if (!content || !content.trim()) return undefined;
        
        const tools: any[] = [];
        const toolBlocks = content.split(/<details>/);
        
        for (const block of toolBlocks) {
            if (!block.trim()) continue;
            
            // 提取工具名称（从 <summary> 中）
            // 支持多种格式：
            // 1. <summary>🔧 **tool_name**</summary>
            // 2. <summary><strong>tool_name</strong></summary>
            // 3. <summary>tool_name</summary>
            const summaryMatch = block.match(/<summary>([\s\S]*?)<\/summary>/);
            if (!summaryMatch) continue;
            
            let toolName = summaryMatch[1].trim();
            // 移除 HTML 标签
            toolName = toolName.replace(/<[^>]+>/g, '');
            // 移除 markdown 格式标记
            toolName = toolName.replace(/\*\*/g, '').replace(/\*/g, '');
            // 移除 emoji 和多余字符
            toolName = toolName.replace(/^🔧\s*/, '').trim();
            // 移除多余的空格和换行
            toolName = toolName.replace(/\s+/g, ' ').trim();
            
            if (!toolName) continue;
            
            // 提取状态
            const statusMatch = block.match(/_Status:\s*(\w+)_/);
            const status = statusMatch ? statusMatch[1] : undefined;
            
            // 提取参数（Args 部分的 JSON）
            const argsMatch = block.match(/\*\*Args?\*\*\s*```json\s*([\s\S]*?)```/i);
            let args: any = undefined;
            if (argsMatch) {
                try {
                    const argsJson = argsMatch[1].trim();
                    // 处理可能是转义的 JSON 字符串
                    if (argsJson.startsWith('"') && argsJson.endsWith('"')) {
                        const unescaped = JSON.parse(argsJson);
                        if (typeof unescaped === 'string') {
                            args = JSON.parse(unescaped);
                        } else {
                            args = unescaped;
                        }
                    } else {
                        args = JSON.parse(argsJson);
                    }
                } catch (e) {
                    // 解析失败，尝试作为字符串
                    args = argsMatch[1].trim();
                }
            }
            
            // 提取结果（Result 部分的 JSON）
            const resultMatch = block.match(/\*\*Result\*\*\s*```json\s*([\s\S]*?)```/i);
            let result: any = undefined;
            if (resultMatch) {
                try {
                    const resultJson = resultMatch[1].trim();
                    if (resultJson.startsWith('"') && resultJson.endsWith('"')) {
                        const unescaped = JSON.parse(resultJson);
                        if (typeof unescaped === 'string') {
                            result = JSON.parse(unescaped);
                        } else {
                            result = unescaped;
                        }
                    } else {
                        result = JSON.parse(resultJson);
                    }
                } catch (e) {
                    result = resultMatch[1].trim();
                }
            }
            
            tools.push({
                name: toolName,
                ...(status && { status }),
                ...(args !== undefined && { input: args }),
                ...(result !== undefined && { result }),
            });
        }
        
        return tools.length > 0 ? JSON.stringify(tools) : undefined;
    };
    
    /**
     * 解析工具结果内容
     */
    const parseToolResults = (content: string): string | undefined => {
        if (!content || !content.trim()) return undefined;
        
        // 工具结果通常已经在 tool_uses 中包含了
        // 这里可以提取独立的工具结果（如果有的话）
        // 暂时返回原始内容，后续可以优化
        return content.trim() || undefined;
    };
    
    const flushMessage = () => {
        if (currentMessage && currentMessage.type) {
            currentMessage.content = currentContent.join('\n').trim();
            if (thinkingContent.length > 0) {
                currentMessage.thinking = thinkingContent.join('\n').trim();
            }
            if (toolUseContent.length > 0) {
                // 解析工具调用为 JSON 数组
                const toolUsesJson = parseToolUses(toolUseContent.join('\n'));
                if (toolUsesJson) {
                    currentMessage.tool_uses = toolUsesJson;
                }
            }
            if (toolResultContent.length > 0) {
                // 解析工具结果
                const toolResultsJson = parseToolResults(toolResultContent.join('\n'));
                if (toolResultsJson) {
                    currentMessage.tool_results = toolResultsJson;
                }
            }
            
            // 确保有 timestamp
            if (!currentMessage.timestamp) {
                // 如果没有时间戳，使用基准时间戳 + 消息索引的秒数
                // 这样可以保持消息的顺序
                if (baseTimestamp) {
                    const estimatedTime = new Date(baseTimestamp.getTime() + messageIndex * 1000);
                    currentMessage.timestamp = estimatedTime.toISOString();
                } else {
                    // 如果没有基准时间戳，使用一个很早的时间 + 索引
                    // 使用 1970-01-01 作为基准，每消息间隔1秒
                    const estimatedTime = new Date('1970-01-01T00:00:00Z');
                    estimatedTime.setSeconds(messageIndex);
                    currentMessage.timestamp = estimatedTime.toISOString();
                }
            } else {
                // 确保时间戳格式是 ISO 8601
                try {
                    const date = new Date(currentMessage.timestamp);
                    if (isNaN(date.getTime())) {
                        // 如果无法解析，使用估算时间
                        if (baseTimestamp) {
                            const estimatedTime = new Date(baseTimestamp.getTime() + messageIndex * 1000);
                            currentMessage.timestamp = estimatedTime.toISOString();
                        } else {
                            const estimatedTime = new Date('1970-01-01T00:00:00Z');
                            estimatedTime.setSeconds(messageIndex);
                            currentMessage.timestamp = estimatedTime.toISOString();
                        }
                    } else {
                        currentMessage.timestamp = date.toISOString();
                    }
                } catch {
                    // 解析失败，使用估算时间
                    if (baseTimestamp) {
                        const estimatedTime = new Date(baseTimestamp.getTime() + messageIndex * 1000);
                        currentMessage.timestamp = estimatedTime.toISOString();
                    } else {
                        const estimatedTime = new Date('1970-01-01T00:00:00Z');
                        estimatedTime.setSeconds(messageIndex);
                        currentMessage.timestamp = estimatedTime.toISOString();
                    }
                }
            }
            
            messages.push(currentMessage as SyncMessage);
            messageIndex++;
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
                // 更新基准时间戳（如果这是第一个）
                if (!baseTimestamp) {
                    baseTimestamp = date;
                }
            } catch {
                // 如果解析失败，不设置时间戳，让 flushMessage 处理
                // 这样可以使用估算时间戳保持顺序
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
        
        // 检测工具调用开始（**🔧 Tool Uses** 或 **🔧 工具调用**）
        if (line.match(/\*\*🔧\s*(Tool Uses?|工具调用)\*\*/i)) {
            inToolUse = true;
            continue;
        }
        
        // 检测工具调用块开始（<details> 包含工具名称）
        if (line.includes('<details>') && !inThinking && !inToolUse) {
            // 检查是否是工具调用块（summary 中包含工具名称或 🔧）
            const nextLine = lines[i + 1] || '';
            if (nextLine.match(/<summary>.*🔧|Tool|工具/i)) {
                inToolUse = true;
                toolUseContent.push(line);
                continue;
            }
        }
        
        // 检测工具结果开始（在工具调用块内的 Result 部分）
        if (inToolUse && (line.match(/<summary>.*Result.*<\/summary>/i) || 
            line.match(/<summary>.*结果.*<\/summary>/i))) {
            inToolResult = true;
            toolUseContent.push(line); // 仍然收集到 toolUseContent
            continue;
        }
        
        // 检测工具调用块结束
        if (inToolUse && line.includes('</details>')) {
            toolUseContent.push(line);
            inToolUse = false;
            inToolResult = false;
            continue;
        }
        
        // 检测分隔线（消息结束标记）
        if (line.match(/^---\s*$/)) {
            // 不立即 flush，因为可能是文档内的分隔线
            continue;
        }
        
        // 收集内容
        if (currentMessage) {
            if (inThinking) {
                // 移除 blockquote 前缀
                const cleanLine = line.replace(/^>\s?/, '');
                thinkingContent.push(cleanLine);
            } else if (inToolUse) {
                // 收集工具调用内容（包括 details 标签、summary、JSON 代码块等）
                toolUseContent.push(line);
            } else if (inToolResult) {
                // 工具结果内容（现在也收集到 toolUseContent 中）
                toolResultContent.push(line);
            } else {
                currentContent.push(line);
            }
        }
    }
    
    // 保存最后一个消息
    flushMessage();
    
    // 按时间戳排序消息，确保顺序正确
    messages.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
    });
    
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
