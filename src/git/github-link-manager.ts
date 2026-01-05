/**
 * GitHub Link Manager
 * Manages the integration between Git events and chat sessions,
 * handles cloud sync of git events for auto-linking.
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { GitWatcher, GitEvent } from './git-watcher';
import { GitCommitLinkManager, isGitCommitLinkEnabled } from './git-commit-link';

export interface GitHubLink {
    id: string;
    sessionId: string;
    linkType: 'commit' | 'pull_request' | 'issue' | 'branch';
    repoFullName: string;
    githubNumber?: number;
    githubSha?: string;
    githubRef?: string;
    githubUrl?: string;
    title?: string;
    state?: string;
    author?: string;
    linkMethod: 'auto' | 'manual';
    confidence?: number;
    additions?: number;
    deletions?: number;
    changedFilesCount?: number;
    linkedAt: string;
}

export interface LinkSuggestion {
    type: 'commit' | 'pull_request' | 'issue';
    confidence: number;
    data: Record<string, any>;
    reason: string;
}

export interface GitHubLinkStats {
    totalCommits: number;
    totalPRs: number;
    totalIssues: number;
    additions: number;
    deletions: number;
    filesChanged: number;
}

export class GitHubLinkManager implements vscode.Disposable {
    private gitWatcher: GitWatcher;
    private commitLinkManager: GitCommitLinkManager;
    private disposables: vscode.Disposable[] = [];
    private static readonly OFFICIAL_SERVER_URL = 'https://llm-chat-history.com';

    constructor(private context: vscode.ExtensionContext) {
        // Initialize Git Watcher with callback
        this.gitWatcher = new GitWatcher({
            onGitEvent: (event) => this.handleGitEvent(event)
        });
        
        // Initialize Git Commit Link Manager
        this.commitLinkManager = new GitCommitLinkManager(context);
    }

    /**
     * Initialize the manager
     */
    async init(): Promise<boolean> {
        const success = await this.gitWatcher.init();
        if (success) {
            this.disposables.push(this.gitWatcher);
            console.log('[GitHubLinkManager] Initialized successfully');
            
            // Install hooks for newly opened repositories
            this.gitWatcher.onNewRepository((repoPath: string) => {
                this.commitLinkManager.installHookForRepo(repoPath);
            });
        }
        
        // Initialize commit link manager (independent of git watcher)
        await this.commitLinkManager.init();
        this.disposables.push(this.commitLinkManager);
        
        return success;
    }

    /**
     * Handle incoming git events
     */
    private async handleGitEvent(event: GitEvent): Promise<void> {
        console.log('[GitHubLinkManager] Received git event:', event.eventType, event.commitSha?.substring(0, 7));

        // Get current session from watcher
        const sessionId = this.gitWatcher.getCurrentSessionId();

        // Only report to cloud if logged in
        if (this.isLoggedIn()) {
            try {
                await this.reportGitEvent(event, sessionId);
            } catch (error) {
                console.error('[GitHubLinkManager] Failed to report git event:', error);
            }
        } else {
            console.log('[GitHubLinkManager] Not logged in, skipping cloud report');
        }
    }

    /**
     * Report a git event to the backend
     */
    private async reportGitEvent(event: GitEvent, sessionId?: string): Promise<void> {
        const token = this.getToken();
        if (!token) {
            return;
        }

        const body = {
            session_id: sessionId,
            event_type: event.eventType,
            repo_path: event.repoPath,
            repo_name: event.repoName,
            branch_name: event.branchName,
            commit_sha: event.commitSha,
            commit_message: event.commitMessage,
            commit_author: event.commitAuthor,
            commit_time: event.commitTime,
            files_changed: event.filesChanged,
            insertions: event.insertions,
            deletions: event.deletions,
            changed_files: event.changedFiles,
            remote_url: event.remoteUrl,
            remote_name: event.remoteName
        };

        try {
            const result = await this.request<{ event: any; auto_link?: GitHubLink }>(
                'POST',
                '/api/git/events',
                body,
                token
            );

            if (result.auto_link) {
                console.log('[GitHubLinkManager] Auto-linked commit to session:', result.auto_link.id);
                
                // Show notification for auto-link
                vscode.window.showInformationMessage(
                    `🔗 Commit linked to conversation`,
                    'View Dashboard'
                ).then(selection => {
                    if (selection === 'View Dashboard') {
                        const serverUrl = this.getServerUrl();
                        vscode.env.openExternal(vscode.Uri.parse(`${serverUrl}/dashboard`));
                    }
                });
            }
        } catch (error) {
            console.error('[GitHubLinkManager] Failed to report git event:', error);
            throw error;
        }
    }

    /**
     * Manually create a GitHub link
     */
    async createLink(params: {
        sessionId: string;
        messageId?: string;
        linkType: 'commit' | 'pull_request' | 'issue' | 'branch';
        repoFullName: string;
        githubNumber?: number;
        githubSha?: string;
        githubRef?: string;
    }): Promise<GitHubLink> {
        const token = this.getToken();
        if (!token) {
            throw new Error('Not logged in');
        }

        const result = await this.request<{ link: GitHubLink }>(
            'POST',
            '/api/github/links',
            {
                session_id: params.sessionId,
                message_id: params.messageId,
                link_type: params.linkType,
                repo_full_name: params.repoFullName,
                github_number: params.githubNumber,
                github_sha: params.githubSha,
                github_ref: params.githubRef
            },
            token
        );

        return result.link;
    }

    /**
     * Get link suggestions for a session
     */
    async getSuggestions(sessionId: string): Promise<LinkSuggestion[]> {
        const token = this.getToken();
        if (!token) {
            return [];
        }

        try {
            const result = await this.request<{ suggestions: LinkSuggestion[] }>(
                'GET',
                `/api/github/links/suggestions?session_id=${sessionId}`,
                undefined,
                token
            );
            return result.suggestions || [];
        } catch {
            return [];
        }
    }

    /**
     * Get links for a session
     */
    async getLinksForSession(sessionId: string): Promise<GitHubLink[]> {
        const token = this.getToken();
        if (!token) {
            return [];
        }

        try {
            const result = await this.request<{ links: GitHubLink[] }>(
                'GET',
                `/api/github/links?session_id=${sessionId}`,
                undefined,
                token
            );
            return result.links || [];
        } catch {
            return [];
        }
    }

    /**
     * Get stats for a session
     */
    async getStatsForSession(sessionId: string): Promise<GitHubLinkStats | null> {
        const token = this.getToken();
        if (!token) {
            return null;
        }

        try {
            const result = await this.request<{ stats: GitHubLinkStats }>(
                'GET',
                `/api/github/links/stats?session_id=${sessionId}`,
                undefined,
                token
            );
            return result.stats;
        } catch {
            return null;
        }
    }

    /**
     * Delete a link
     */
    async deleteLink(linkId: string): Promise<void> {
        const token = this.getToken();
        if (!token) {
            throw new Error('Not logged in');
        }

        await this.request<{ message: string }>(
            'DELETE',
            `/api/github/links/${linkId}`,
            undefined,
            token
        );
    }

    /**
     * Set the current active session for auto-linking
     */
    setCurrentSession(sessionId?: string, workspacePath?: string): void {
        this.gitWatcher.setCurrentSession(sessionId);
        
        // Also update commit link manager for hook-based linking
        this.commitLinkManager.setCurrentSession(sessionId, workspacePath);
    }

    /**
     * Get current session ID
     */
    getCurrentSessionId(): string | undefined {
        return this.gitWatcher.getCurrentSessionId();
    }

    /**
     * Check if git watcher is ready
     */
    isGitWatcherReady(): boolean {
        return this.gitWatcher.isReady();
    }

    /**
     * Get watched repos count
     */
    getWatchedReposCount(): number {
        return this.gitWatcher.getWatchedReposCount();
    }

    /**
     * Check if user is logged in
     */
    private isLoggedIn(): boolean {
        return !!this.getToken();
    }

    /**
     * Get auth token from cloud sync manager
     */
    private getToken(): string | undefined {
        // Access the global cloud sync manager
        const cloudSync = (global as any).__cloudSyncManager;
        return cloudSync?.getToken();
    }

    /**
     * Get server URL
     */
    private getServerUrl(): string {
        const config = vscode.workspace.getConfiguration('chatHistory');
        const debugMode = config.get<boolean>('cloudSync.debugMode', false);
        
        if (debugMode) {
            const debugUrl = config.get<string>('cloudSync.debugServerUrl', '');
            if (debugUrl) {
                return debugUrl;
            }
        }
        
        return GitHubLinkManager.OFFICIAL_SERVER_URL;
    }

    /**
     * Make HTTP request
     */
    private async request<T>(
        method: string,
        path: string,
        body?: any,
        token?: string
    ): Promise<T> {
        const serverUrl = this.getServerUrl();
        const url = new URL(path, serverUrl);
        const isHttps = url.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const requestBody = body ? JSON.stringify(body) : undefined;

        return new Promise<T>((resolve, reject) => {
            const req = httpModule.request(
                {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + url.search,
                    method,
                    headers,
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(json as T);
                            } else {
                                reject(new Error(json.error || `Request failed with status ${res.statusCode}`));
                            }
                        } catch {
                            reject(new Error('Failed to parse response'));
                        }
                    });
                }
            );

            req.on('error', reject);

            if (requestBody) {
                req.write(requestBody);
            }
            req.end();
        });
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}

