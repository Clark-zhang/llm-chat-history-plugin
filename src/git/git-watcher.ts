/**
 * Git Watcher Module
 * Monitors git events (commits, pushes, etc.) using VS Code Git API
 * and reports them to the cloud server for auto-linking with chat sessions.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

export interface GitEvent {
    eventType: 'commit' | 'push' | 'checkout' | 'merge';
    repoPath: string;
    repoName?: string;
    branchName?: string;
    commitSha?: string;
    commitMessage?: string;
    commitAuthor?: string;
    commitTime?: string;
    filesChanged?: number;
    insertions?: number;
    deletions?: number;
    changedFiles?: string[];
    remoteUrl?: string;
    remoteName?: string;
}

export interface GitWatcherOptions {
    onGitEvent?: (event: GitEvent) => void;
    onNewRepository?: (repoPath: string) => void;
}

export class GitWatcher implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private gitApi: any;
    private lastHeadCommit: Map<string, string> = new Map();
    private currentSessionId?: string;
    private onGitEventCallback?: (event: GitEvent) => void;
    private onNewRepositoryCallback?: (repoPath: string) => void;
    private newRepoCallbacks: ((repoPath: string) => void)[] = [];
    private isInitialized = false;

    constructor(options?: GitWatcherOptions) {
        this.onGitEventCallback = options?.onGitEvent;
        this.onNewRepositoryCallback = options?.onNewRepository;
    }

    /**
     * Initialize the Git Watcher
     */
    async init(): Promise<boolean> {
        try {
            // Get VS Code Git Extension API
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                console.log('[GitWatcher] Git extension not found, feature disabled');
                return false;
            }

            // Ensure extension is activated
            if (!gitExtension.isActive) {
                await gitExtension.activate();
            }

            const exports = gitExtension.exports;
            if (!exports) {
                console.log('[GitWatcher] Git extension exports not available');
                return false;
            }

            this.gitApi = exports.getAPI(1);
            if (!this.gitApi) {
                console.log('[GitWatcher] Could not get Git API');
                return false;
            }

            // Watch existing repositories
            for (const repo of this.gitApi.repositories) {
                this.watchRepository(repo);
            }

            // Watch for new repositories
            this.disposables.push(
                this.gitApi.onDidOpenRepository((repo: any) => {
                    const repoPath = repo.rootUri.fsPath;
                    console.log('[GitWatcher] New repository opened:', repoPath);
                    this.watchRepository(repo);
                    
                    // Notify listeners about new repository
                    this.emitNewRepository(repoPath);
                })
            );

            this.isInitialized = true;
            console.log(`[GitWatcher] Initialized, watching ${this.gitApi.repositories.length} repositories`);
            return true;
        } catch (error) {
            console.error('[GitWatcher] Failed to initialize:', error);
            return false;
        }
    }

    /**
     * Watch a git repository for changes
     */
    private watchRepository(repo: any): void {
        const repoPath = repo.rootUri.fsPath;
        
        // Store initial HEAD
        const currentHead = repo.state?.HEAD?.commit;
        if (currentHead) {
            this.lastHeadCommit.set(repoPath, currentHead);
        }

        // Watch for state changes (HEAD changes, etc.)
        const stateDisposable = repo.state.onDidChange(() => {
            this.detectGitChanges(repo);
        });

        this.disposables.push(stateDisposable);
        console.log('[GitWatcher] Watching repository:', repoPath);
    }

    /**
     * Detect git changes in a repository
     */
    private async detectGitChanges(repo: any): Promise<void> {
        const repoPath = repo.rootUri.fsPath;
        const currentHead = repo.state?.HEAD?.commit;
        const lastHead = this.lastHeadCommit.get(repoPath);

        if (currentHead && currentHead !== lastHead) {
            // HEAD changed - could be a new commit or checkout
            console.log('[GitWatcher] HEAD changed:', lastHead?.substring(0, 7), '->', currentHead.substring(0, 7));
            
            if (lastHead) {
                // Determine if this is a new commit (HEAD moved forward by one commit)
                const isNewCommit = await this.isNewCommit(repoPath, lastHead, currentHead);
                
                if (isNewCommit) {
                    // This is a new commit
                    const event = await this.buildCommitEvent(repoPath, currentHead);
                    if (event) {
                        this.emitEvent(event);
                    }
                } else {
                    // This could be a checkout or merge
                    console.log('[GitWatcher] HEAD changed but not a new commit (checkout/rebase/etc.)');
                }
            }
            
            this.lastHeadCommit.set(repoPath, currentHead);
        }
    }

    /**
     * Check if the HEAD change represents a new commit
     */
    private async isNewCommit(repoPath: string, oldHead: string, newHead: string): Promise<boolean> {
        try {
            // Check if oldHead is the parent of newHead
            const parentOutput = execSync(
                `git log -1 --format="%P" ${newHead}`,
                { cwd: repoPath, encoding: 'utf8' }
            ).trim();

            const parents = parentOutput.split(' ').filter(p => p);
            
            // If oldHead is a parent of newHead, this is a new commit
            if (parents.includes(oldHead)) {
                return true;
            }

            // Also check if this commit was just created (within last 10 seconds)
            const commitTime = execSync(
                `git log -1 --format="%ct" ${newHead}`,
                { cwd: repoPath, encoding: 'utf8' }
            ).trim();
            
            const commitTimestamp = parseInt(commitTime, 10) * 1000;
            const now = Date.now();
            const timeDiff = now - commitTimestamp;
            
            // If commit was made within last 60 seconds, consider it new
            return timeDiff < 60000;
        } catch {
            return false;
        }
    }

    /**
     * Build a commit event from repository information
     */
    private async buildCommitEvent(repoPath: string, sha: string): Promise<GitEvent | null> {
        try {
            // Get commit details
            const logOutput = execSync(
                `git log -1 --format="%H|%s|%an|%aI" ${sha}`,
                { cwd: repoPath, encoding: 'utf8' }
            ).trim();

            const [commitSha, message, author, time] = logOutput.split('|');

            // Get file change statistics
            let stats = { files: 0, insertions: 0, deletions: 0 };
            try {
                const statOutput = execSync(
                    `git diff --shortstat ${sha}^..${sha}`,
                    { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
                ).trim();
                stats = this.parseGitStat(statOutput);
            } catch {
                // First commit has no parent, try different approach
                try {
                    const statOutput = execSync(
                        `git diff --shortstat --cached ${sha}`,
                        { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
                    ).trim();
                    stats = this.parseGitStat(statOutput);
                } catch {
                    // Ignore stat errors
                }
            }

            // Get changed files list
            let changedFiles: string[] = [];
            try {
                const filesOutput = execSync(
                    `git diff --name-only ${sha}^..${sha}`,
                    { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
                ).trim();
                changedFiles = filesOutput.split('\n').filter(f => f);
            } catch {
                // First commit
                try {
                    const filesOutput = execSync(
                        `git show --name-only --format="" ${sha}`,
                        { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
                    ).trim();
                    changedFiles = filesOutput.split('\n').filter(f => f);
                } catch {
                    // Ignore
                }
            }

            // Get remote URL
            let remoteUrl = '';
            try {
                remoteUrl = execSync(
                    'git remote get-url origin',
                    { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
                ).trim();
            } catch {
                // No remote
            }

            // Get current branch
            const branchName = this.getCurrentBranch(repoPath);

            const event: GitEvent = {
                eventType: 'commit',
                repoPath,
                repoName: path.basename(repoPath),
                branchName,
                commitSha,
                commitMessage: message,
                commitAuthor: author,
                commitTime: time,
                filesChanged: stats.files,
                insertions: stats.insertions,
                deletions: stats.deletions,
                changedFiles,
                remoteUrl,
                remoteName: 'origin'
            };

            console.log('[GitWatcher] Built commit event:', {
                sha: commitSha?.substring(0, 7),
                message: message?.substring(0, 50),
                files: stats.files,
                additions: stats.insertions,
                deletions: stats.deletions
            });

            return event;
        } catch (error) {
            console.error('[GitWatcher] Failed to build commit event:', error);
            return null;
        }
    }

    /**
     * Get current branch name
     */
    private getCurrentBranch(repoPath: string): string {
        try {
            return execSync(
                'git rev-parse --abbrev-ref HEAD',
                { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim();
        } catch {
            return '';
        }
    }

    /**
     * Parse git diff --shortstat output
     */
    private parseGitStat(stat: string): { files: number; insertions: number; deletions: number } {
        const result = { files: 0, insertions: 0, deletions: 0 };
        
        const filesMatch = stat.match(/(\d+) files? changed/);
        const insertMatch = stat.match(/(\d+) insertions?\(\+\)/);
        const deleteMatch = stat.match(/(\d+) deletions?\(-\)/);

        if (filesMatch) result.files = parseInt(filesMatch[1], 10);
        if (insertMatch) result.insertions = parseInt(insertMatch[1], 10);
        if (deleteMatch) result.deletions = parseInt(deleteMatch[1], 10);

        return result;
    }

    /**
     * Emit a git event
     */
    private emitEvent(event: GitEvent): void {
        console.log('[GitWatcher] Emitting event:', event.eventType, event.commitSha?.substring(0, 7));
        
        if (this.onGitEventCallback) {
            this.onGitEventCallback(event);
        }
    }
    
    /**
     * Register a callback for new repository events
     */
    onNewRepository(callback: (repoPath: string) => void): void {
        this.newRepoCallbacks.push(callback);
    }
    
    /**
     * Emit new repository event
     */
    private emitNewRepository(repoPath: string): void {
        if (this.onNewRepositoryCallback) {
            this.onNewRepositoryCallback(repoPath);
        }
        for (const callback of this.newRepoCallbacks) {
            callback(repoPath);
        }
    }

    /**
     * Set the current chat session ID for auto-linking
     */
    setCurrentSession(sessionId?: string): void {
        this.currentSessionId = sessionId;
        console.log('[GitWatcher] Current session set:', sessionId);
    }

    /**
     * Get the current chat session ID
     */
    getCurrentSessionId(): string | undefined {
        return this.currentSessionId;
    }

    /**
     * Check if watcher is initialized
     */
    isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Get watched repositories count
     */
    getWatchedReposCount(): number {
        return this.gitApi?.repositories?.length || 0;
    }

    /**
     * Dispose the watcher
     */
    dispose(): void {
        console.log('[GitWatcher] Disposing...');
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.isInitialized = false;
    }
}

