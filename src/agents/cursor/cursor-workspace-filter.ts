import { ComposerData, Bubble } from '../../types';
import { CursorDatabaseReader } from './cursor-database-reader';

/**
 * WorkspaceFilter filters composers so we only export chats
 * that belong to the currently open workspace.
 */
export class WorkspaceFilter {
    private currentWorkspacePath: string;

    constructor(workspacePath: string) {
        this.currentWorkspacePath = this.normalizePath(workspacePath || '');
    }

    /**
     * Returns true if the composer belongs to the current workspace.
     */
    belongsToCurrentWorkspace(
        composer: ComposerData,
        reader: CursorDatabaseReader
    ): boolean {
        if (!this.currentWorkspacePath) {
            return false;
        }

        const headers = composer.fullConversationHeadersOnly || [];
        if (headers.length === 0) {
            return false;
        }

        const firstBubbleId = headers[0].bubbleId;
        const bubbles = reader.getComposerBubbles(composer.composerId, [firstBubbleId]);
        if (bubbles.length === 0) {
            return false;
        }

        const bubble = bubbles[0] as Bubble & { workspaceProjectDir?: string };

        // Prefer workspaceUris when available
        if (bubble.workspaceUris && bubble.workspaceUris.length > 0) {
            const bubbleWorkspace = this.uriToPath(bubble.workspaceUris[0]);
            if (bubbleWorkspace && this.pathsMatch(bubbleWorkspace, this.currentWorkspacePath)) {
                return true;
            }
        }

        // Fallback to workspaceProjectDir
        if ((bubble as any).workspaceProjectDir) {
            const bubbleWorkspace = this.normalizePath((bubble as any).workspaceProjectDir);
            if (bubbleWorkspace && this.pathsMatch(bubbleWorkspace, this.currentWorkspacePath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Convert a file:// URI to a filesystem path.
     */
    private uriToPath(uri: string): string {
        try {
            const decoded = decodeURIComponent(uri);
            let fsPath = decoded.replace(/^file:\/\/\//, '');

            // Windows drive letters are URL encoded (e.g., d%3A)
            if (process.platform === 'win32') {
                fsPath = fsPath.replace(/%3A/gi, ':');
            }

            return this.normalizePath(fsPath);
        } catch {
            return '';
        }
    }

    /**
     * Normalize paths for reliable comparison (cross-platform compatible).
     * - Convert backslashes to forward slashes
     * - Convert to lowercase (for case-insensitive comparison across platforms)
     * - Remove trailing slash
     */
    private normalizePath(filepath: string): string {
        if (!filepath) return '';

        // 统一使用正斜杠
        let normalized = filepath.replace(/\\/g, '/');

        // 始终转换为小写（跨平台兼容：Windows 数据在 Linux 上也能正确比较）
        normalized = normalized.toLowerCase();

        // 移除末尾斜杠
        normalized = normalized.replace(/\/$/, '');

        return normalized;
    }

    private pathsMatch(path1: string, path2: string): boolean {
        return this.normalizePath(path1) === this.normalizePath(path2);
    }
}
