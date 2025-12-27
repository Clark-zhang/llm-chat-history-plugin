/**
 * Cline 工作区过滤器
 * 判断任务是否属于当前工作区
 */

import { ClineTask } from './cline-types';

export class ClineWorkspaceFilter {
    private workspaceRoot: string;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = this.normalizePath(workspaceRoot);
    }
    
    /**
     * 判断任务是否属于当前工作区
     */
    belongsToCurrentWorkspace(task: ClineTask): boolean {
        // 如果任务有明确的工作区路径
        if (task.workspaceRoot) {
            return this.isSameOrSubPath(task.workspaceRoot, this.workspaceRoot);
        }

        // 尝试从 UI messages 中查找路径线索
        const uiMessages = task.uiMessages.messages || [];

        for (const msg of uiMessages) {
            // 检查文件路径
            if (msg.path && this.isSameOrSubPath(msg.path, this.workspaceRoot)) {
                return true;
            }

            // 检查命令执行路径（使用规范化路径比较）
            if (msg.command && typeof msg.command === 'string') {
                const normalizedCommand = this.normalizePath(msg.command);
                if (normalizedCommand.includes(this.workspaceRoot)) {
                    return true;
                }
            }
        }

        // 如果无法确定，采用包容策略（返回 true）
        // 这样可以确保任务不会被意外过滤掉
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

