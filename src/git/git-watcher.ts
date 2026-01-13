/**
 * Git Watcher Module
 * Monitors git events (commits, pushes, etc.) using VS Code Git API
 * and reports them to the cloud server for auto-linking with chat sessions.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
    private discoveredRepos: Set<string> = new Set(); // Track manually discovered repos
    private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map(); // File watchers for discovered repos
    private pollIntervals: Map<string, NodeJS.Timeout> = new Map(); // Poll intervals for discovered repos

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

            // Watch existing repositories from VS Code Git API
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

            // Scan for Git repositories in subdirectories
            await this.scanForSubdirectoryRepos();

            this.isInitialized = true;
            const totalRepos = this.gitApi.repositories.length + this.discoveredRepos.size;
            console.log(`[GitWatcher] Initialized, watching ${totalRepos} repositories (${this.gitApi.repositories.length} from VS Code API, ${this.discoveredRepos.size} discovered)`);
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
        const apiRepos = this.gitApi?.repositories?.length || 0;
        return apiRepos + this.discoveredRepos.size;
    }

    /**
     * Scan for Git repositories in workspace subdirectories
     * This finds repos that VS Code Git API might not automatically discover
     */
    private async scanForSubdirectoryRepos(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        for (const folder of workspaceFolders) {
            const rootPath = folder.uri.fsPath;
            
            // Check if root itself is a git repo (already handled by VS Code API)
            const rootIsGit = fs.existsSync(path.join(rootPath, '.git'));
            if (rootIsGit) {
                continue; // Skip, already handled
            }

            // Scan subdirectories for Git repositories
            const foundRepos = this.findGitReposInDirectory(rootPath, 0, 3); // Max depth 3, max 3 levels deep
            
            for (const repoPath of foundRepos) {
                if (!this.discoveredRepos.has(repoPath)) {
                    console.log('[GitWatcher] Discovered Git repository in subdirectory:', repoPath);
                    this.discoveredRepos.add(repoPath);
                    await this.watchDiscoveredRepo(repoPath);
                    this.emitNewRepository(repoPath);
                }
            }
        }
    }

    /**
     * Recursively find Git repositories in a directory
     */
    private findGitReposInDirectory(dirPath: string, currentDepth: number, maxDepth: number): string[] {
        const repos: string[] = [];
        
        if (currentDepth >= maxDepth) {
            return repos;
        }

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                // Skip hidden directories and common ignore patterns
                if (entry.name.startsWith('.') && entry.name !== '.git') {
                    continue;
                }
                
                // Skip common directories that shouldn't contain repos
                const skipDirs = ['node_modules', 'dist', 'build', 'target', 'out', '.vscode', '.idea'];
                if (skipDirs.includes(entry.name)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    const subPath = path.join(dirPath, entry.name);
                    
                    // Check if this directory is a Git repository
                    const gitDir = path.join(subPath, '.git');
                    if (fs.existsSync(gitDir)) {
                        const gitStat = fs.statSync(gitDir);
                        if (gitStat.isDirectory()) {
                            repos.push(subPath);
                            // Don't recurse into a Git repo's subdirectories
                            continue;
                        }
                    }
                    
                    // Recursively search subdirectories
                    const subRepos = this.findGitReposInDirectory(subPath, currentDepth + 1, maxDepth);
                    repos.push(...subRepos);
                }
            }
        } catch (error) {
            // Ignore permission errors or other filesystem errors
            console.debug('[GitWatcher] Error scanning directory:', dirPath, error);
        }

        return repos;
    }

    /**
     * Watch a discovered Git repository (not found by VS Code Git API)
     */
    private async watchDiscoveredRepo(repoPath: string): Promise<void> {
        // Try to get the repository from VS Code Git API
        // Sometimes VS Code might discover it later, so we check
        let repo: any = null;
        if (this.gitApi?.repositories) {
            repo = this.gitApi.repositories.find((r: any) => r.rootUri.fsPath === repoPath);
        }

        if (repo) {
            // VS Code API found it, use the standard watch method
            this.watchRepository(repo);
            return;
        }

        // VS Code API doesn't have it, use file system watching + polling
        console.log('[GitWatcher] Watching discovered repo with file system watcher:', repoPath);
        
        // Get initial HEAD
        const initialHead = this.getCurrentHead(repoPath);
        if (initialHead) {
            this.lastHeadCommit.set(repoPath, initialHead);
        }

        // Watch .git/HEAD file for changes
        const headFile = path.join(repoPath, '.git', 'HEAD');
        if (fs.existsSync(headFile)) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.Uri.file(repoPath), '.git/HEAD')
            );
            
            watcher.onDidChange(async () => {
                await this.checkDiscoveredRepoChanges(repoPath);
            });
            
            this.fileWatchers.set(repoPath, watcher);
            this.disposables.push(watcher);
        }

        // Also poll periodically (every 5 seconds) as a fallback
        const pollInterval = setInterval(async () => {
            await this.checkDiscoveredRepoChanges(repoPath);
        }, 5000);
        
        this.pollIntervals.set(repoPath, pollInterval);
    }

    /**
     * Check for changes in a discovered repository
     */
    private async checkDiscoveredRepoChanges(repoPath: string): Promise<void> {
        const currentHead = this.getCurrentHead(repoPath);
        const lastHead = this.lastHeadCommit.get(repoPath);

        if (currentHead && currentHead !== lastHead) {
            console.log('[GitWatcher] HEAD changed in discovered repo:', repoPath, lastHead?.substring(0, 7), '->', currentHead.substring(0, 7));
            
            if (lastHead) {
                // Check if this is a new commit
                const isNewCommit = await this.isNewCommit(repoPath, lastHead, currentHead);
                
                if (isNewCommit) {
                    const event = await this.buildCommitEvent(repoPath, currentHead);
                    if (event) {
                        this.emitEvent(event);
                    }
                }
            }
            
            this.lastHeadCommit.set(repoPath, currentHead);
        }
    }

    /**
     * Get current HEAD commit SHA from a repository
     */
    private getCurrentHead(repoPath: string): string | null {
        try {
            // Try reading .git/HEAD directly
            const headFile = path.join(repoPath, '.git', 'HEAD');
            if (fs.existsSync(headFile)) {
                const headContent = fs.readFileSync(headFile, 'utf8').trim();
                
                // If it's a ref, resolve it
                if (headContent.startsWith('ref: ')) {
                    const refPath = headContent.substring(5);
                    const refFile = path.join(repoPath, '.git', refPath);
                    if (fs.existsSync(refFile)) {
                        return fs.readFileSync(refFile, 'utf8').trim();
                    }
                } else {
                    // Direct SHA
                    return headContent;
                }
            }
            
            // Fallback to git command
            return execSync(
                'git rev-parse HEAD',
                { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim();
        } catch {
            return null;
        }
    }

    /**
     * Dispose the watcher
     */
    dispose(): void {
        console.log('[GitWatcher] Disposing...');
        
        // Dispose VS Code disposables
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        
        // Dispose file watchers
        for (const watcher of this.fileWatchers.values()) {
            watcher.dispose();
        }
        this.fileWatchers.clear();
        
        // Clear poll intervals
        for (const interval of this.pollIntervals.values()) {
            clearInterval(interval);
        }
        this.pollIntervals.clear();
        
        // Clear discovered repos
        this.discoveredRepos.clear();
        this.lastHeadCommit.clear();
        
        this.isInitialized = false;
    }
}

