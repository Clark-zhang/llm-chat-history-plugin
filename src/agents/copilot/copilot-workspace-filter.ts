/**
 * Copilot Chat 工作区过滤器
 * 判断对话是否属于当前工作区
 */

import { CopilotStorageData, CopilotRequest, CopilotResponseItem, CopilotInlineReferenceResponse } from './copilot-types';

export class CopilotWorkspaceFilter {
    private workspaceRoot: string;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = this.normalizePath(workspaceRoot);
    }
    
    /**
     * 判断对话是否属于当前工作区
     */
    belongsToCurrentWorkspace(conversation: CopilotStorageData): boolean {
        // 如果对话有明确的工作区路径
        if (conversation.workspaceRoot) {
            return this.isSameOrSubPath(conversation.workspaceRoot, this.workspaceRoot);
        }
        
        if (conversation.workspacePath) {
            return this.isSameOrSubPath(conversation.workspacePath, this.workspaceRoot);
        }
        
        // 尝试从会话数据中查找路径线索
        const requests = conversation.session?.requests || [];
        
        for (const request of requests) {
            // 检查响应中的文件引用
            if (request.response) {
                for (const responseItem of request.response) {
                    if ('kind' in responseItem && responseItem.kind === 'inlineReference') {
                        const refResponse = responseItem as CopilotInlineReferenceResponse;
                        if (refResponse.inlineReference) {
                            const ref = refResponse.inlineReference;
                            const filePath = ref.fsPath || ref.path || ref.external || '';
                            if (filePath && this.isSameOrSubPath(filePath, this.workspaceRoot)) {
                                return true;
                            }
                        }
                    }
                    
                    // 检查文本响应中的 baseUri
                    if ((responseItem as any).baseUri) {
                        const baseUri = (responseItem as any).baseUri;
                        const basePath = baseUri.fsPath || baseUri.path || baseUri.external || '';
                        if (basePath && this.isSameOrSubPath(basePath, this.workspaceRoot)) {
                            return true;
                        }
                    }
                    
                    // 检查 uris 对象中的路径
                    if ((responseItem as any).uris) {
                        const uris = (responseItem as any).uris;
                        for (const uri of Object.values(uris)) {
                            const uriObj = uri as any;
                            const uriPath = uriObj.fsPath || uriObj.path || uriObj.external || '';
                            if (uriPath && this.isSameOrSubPath(uriPath, this.workspaceRoot)) {
                                return true;
                            }
                        }
                    }
                }
            }
            
            // 检查消息文本中是否包含工作区路径
            if (request.message?.text) {
                const text = request.message.text;
                if (text.includes(this.workspaceRoot)) {
                    return true;
                }
            }
        }
        
        // 如果无法确定，采用包容策略（返回 true）
        // 这样可以确保对话不会被意外过滤掉
        return true;
    }
    
    /**
     * 判断路径是否相同或为子路径
     */
    private isSameOrSubPath(targetPath: string, basePath: string): boolean {
        const normalizedTarget = this.normalizePath(targetPath);
        const normalizedBase = this.normalizePath(basePath);
        
        // 完全匹配
        if (normalizedTarget === normalizedBase) {
            return true;
        }
        
        // 检查是否为子路径（使用统一的正斜杠）
        return normalizedTarget.startsWith(normalizedBase + '/');
    }
    
    /**
     * 规范化路径（跨平台兼容）：
     * - 将反斜杠转换为正斜杠
     * - 转换为小写（用于比较）
     * - 移除末尾斜杠
     */
    private normalizePath(p: string): string {
        if (!p) return '';
        
        // 统一使用正斜杠
        let normalized = p.replace(/\\/g, '/');
        
        // 转换为小写以便比较
        normalized = normalized.toLowerCase();
        
        // 移除尾部斜杠
        if (normalized.endsWith('/') && normalized.length > 1) {
            normalized = normalized.slice(0, -1);
        }
        
        return normalized;
    }
}
