/**
 * Cline 工作区过滤器
 * 判断任务是否属于当前工作区
 */

import * as path from 'path';
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
        console.log('[DEBUG] ClineWorkspaceFilter.belongsToCurrentWorkspace()');
        console.log('[DEBUG] Task ID:', task.id);
        console.log('[DEBUG] Task workspaceRoot:', task.workspaceRoot);
        console.log('[DEBUG] Current workspaceRoot:', this.workspaceRoot);
        
        // 如果任务有明确的工作区路径
        if (task.workspaceRoot) {
            const belongs = this.isSameOrSubPath(task.workspaceRoot, this.workspaceRoot);
            console.log('[DEBUG] Task has explicit workspaceRoot, belongs:', belongs);
            return belongs;
        }
        
        console.log('[DEBUG] Task has no explicit workspaceRoot, checking UI messages');
        
        // 尝试从 UI messages 中查找路径线索
        const uiMessages = task.uiMessages.messages || [];
        console.log('[DEBUG] UI messages count:', uiMessages.length);
        
        for (const msg of uiMessages) {
            // 检查文件路径
            if (msg.path) {
                const normalizedPath = this.normalizePath(msg.path);
                console.log('[DEBUG] Checking message path:', msg.path, '-> normalized:', normalizedPath);
                if (this.isSameOrSubPath(normalizedPath, this.workspaceRoot)) {
                    console.log('[DEBUG] Found matching path in UI messages');
                    return true;
                }
            }
            
            // 检查命令执行路径
            if (msg.command && typeof msg.command === 'string') {
                // 命令可能包含路径信息
                if (msg.command.includes(this.workspaceRoot)) {
                    console.log('[DEBUG] Found matching path in command');
                    return true;
                }
            }
        }
        
        // 如果无法确定，采用包容策略（返回 true）
        // 这样可以确保任务不会被意外过滤掉
        console.log('[DEBUG] No explicit workspace match found, using inclusive policy (returning true)');
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
        
        // 检查是否为子路径
        return normalizedTarget.startsWith(normalizedBase + path.sep);
    }
    
    /**
     * 规范化路径
     */
    private normalizePath(p: string): string {
        // 转换为绝对路径并规范化
        let normalized = path.resolve(p);
        
        // 统一路径分隔符（Windows）
        normalized = normalized.replace(/\\/g, '/');
        
        // 移除尾部斜杠
        if (normalized.endsWith('/') && normalized.length > 1) {
            normalized = normalized.slice(0, -1);
        }
        
        return normalized.toLowerCase();
    }
}

