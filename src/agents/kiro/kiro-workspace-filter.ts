/**
 * Kiro 工作区过滤器
 * 判断对话是否属于当前工作区
 */

import { KiroStorageData } from './kiro-types';

export class KiroWorkspaceFilter {
    private workspaceRoot: string;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = this.normalizePath(workspaceRoot);
    }
    
    /**
     * 判断对话是否属于当前工作区
     */
    belongsToCurrentWorkspace(conversation: KiroStorageData): boolean {
        // 如果对话有明确的工作区路径
        if (conversation.workspaceRoot) {
            return this.isSameOrSubPath(conversation.workspaceRoot, this.workspaceRoot);
        }
        
        if (conversation.workspacePath) {
            return this.isSameOrSubPath(conversation.workspacePath, this.workspaceRoot);
        }
        
        // 对于执行记录，如果没有工作区信息，采用包容策略
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
