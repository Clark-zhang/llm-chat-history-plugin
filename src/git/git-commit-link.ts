/**
 * Git Commit Link Module
 * Manages Git hooks to automatically append AI conversation links to commit messages.
 * 
 * Features:
 * - Installs prepare-commit-msg hook in repositories
 * - Tracks current session via temporary file for IPC with hook script
 * - Validates login status before enabling
 * - Generates URLs based on debug/production configuration
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface SessionInfo {
    sessionId: string;
    url: string;
    timestamp: number;
}

const HOOK_SCRIPT_NAME = 'prepare-commit-msg';
const CONFIG_DIR_NAME = 'config';
const SESSION_FILE_NAME = 'current-session.json';

// Session expiry time: 30 minutes
const SESSION_EXPIRY_MS = 30 * 60 * 1000;

/**
 * Get the path to the session config directory for a workspace
 * Path: <workspace>/.llm-chat-history/config/
 */
export function getConfigDir(workspacePath: string): string {
    return path.join(workspacePath, '.llm-chat-history', CONFIG_DIR_NAME);
}

/**
 * Get the path to the session info file for a workspace
 * Path: <workspace>/.llm-chat-history/config/current-session.json
 */
export function getSessionFilePath(workspacePath: string): string {
    return path.join(getConfigDir(workspacePath), SESSION_FILE_NAME);
}

/**
 * Get the dashboard URL based on configuration
 */
export function getDashboardUrl(sessionId: string): string {
    const config = vscode.workspace.getConfiguration('chatHistory');
    const debugMode = config.get<boolean>('cloudSync.debugMode', false);
    
    let baseUrl = 'https://llm-chat-history.com';
    
    if (debugMode) {
        const debugUrl = config.get<string>('cloudSync.debugServerUrl', '');
        if (debugUrl) {
            baseUrl = debugUrl;
        }
    }
    
    // Use standard dashboard URL format
    return `${baseUrl}/dashboard?session=${sessionId}`;
}

/**
 * Get the server base URL
 */
export function getServerBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('chatHistory');
    const debugMode = config.get<boolean>('cloudSync.debugMode', false);
    
    if (debugMode) {
        const debugUrl = config.get<string>('cloudSync.debugServerUrl', '');
        if (debugUrl) {
            return debugUrl;
        }
    }
    
    return 'https://llm-chat-history.com';
}

/**
 * Check if Git commit link feature is enabled
 */
export function isGitCommitLinkEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('chatHistory');
    return config.get<boolean>('gitCommit.linkEnabled', false);
}

/**
 * Write current session info to file for IPC with Git hook
 * Writes to: <workspacePath>/.llm-chat-history/config/current-session.json
 */
export function writeSessionInfo(sessionId: string, workspacePath: string): void {
    const sessionInfo: SessionInfo = {
        sessionId,
        url: getDashboardUrl(sessionId),
        timestamp: Date.now()
    };
    
    try {
        const configDir = getConfigDir(workspacePath);
        const filePath = getSessionFilePath(workspacePath);
        
        // Ensure config directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, JSON.stringify(sessionInfo, null, 2), 'utf8');
        console.log('[GitCommitLink] Session info written:', sessionId, 'at', filePath);
    } catch (error) {
        console.error('[GitCommitLink] Failed to write session info:', error);
    }
}

/**
 * Read current session info from file
 */
export function readSessionInfo(workspacePath: string): SessionInfo | null {
    try {
        const filePath = getSessionFilePath(workspacePath);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        const info = JSON.parse(content) as SessionInfo;
        
        // Check if session is expired
        if (Date.now() - info.timestamp > SESSION_EXPIRY_MS) {
            console.log('[GitCommitLink] Session expired, clearing');
            clearSessionInfo(workspacePath);
            return null;
        }
        
        return info;
    } catch (error) {
        console.error('[GitCommitLink] Failed to read session info:', error);
        return null;
    }
}

/**
 * Clear session info file
 */
export function clearSessionInfo(workspacePath: string): void {
    try {
        const filePath = getSessionFilePath(workspacePath);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('[GitCommitLink] Session info cleared');
        }
    } catch (error) {
        console.error('[GitCommitLink] Failed to clear session info:', error);
    }
}

/**
 * Generate the Git hook script content
 * The hook reads session info from the project's .llm-chat-history/config/current-session.json
 */
function generateHookScript(): string {
    // Session file is now relative to the repo root
    const sessionFileRelPath = `.llm-chat-history/${CONFIG_DIR_NAME}/${SESSION_FILE_NAME}`;
    
    return `#!/bin/bash
# LLM Chat History - Auto-link AI conversations to commits
# This hook appends AI conversation links to commit messages
# Installed by: LLM Chat History VS Code Extension
# WARNING: Do not edit manually. Re-enable the feature in VS Code settings to update.

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Only process for regular commits (not merge, squash, etc.)
if [ "$COMMIT_SOURCE" = "merge" ] || [ "$COMMIT_SOURCE" = "squash" ]; then
    exit 0
fi

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
    exit 0
fi

# Session file is in the project's .llm-chat-history/config/ directory
SESSION_FILE="$REPO_ROOT/${sessionFileRelPath}"

# Check if session file exists
if [ ! -f "$SESSION_FILE" ]; then
    exit 0
fi

# Read session info (using basic shell parsing to avoid jq dependency)
SESSION_DATA=$(cat "$SESSION_FILE")

# Extract values using grep and sed
SESSION_URL=$(echo "$SESSION_DATA" | grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"url"[[:space:]]*:[[:space:]]*"\\([^"]*\\)"/\\1/')
TIMESTAMP=$(echo "$SESSION_DATA" | grep -o '"timestamp"[[:space:]]*:[[:space:]]*[0-9]*' | sed 's/"timestamp"[[:space:]]*:[[:space:]]*//')

# Validate data
if [ -z "$SESSION_URL" ] || [ -z "$TIMESTAMP" ]; then
    exit 0
fi

# Check if session is not too old (30 minutes = 1800000 ms)
CURRENT_TIME=$(($(date +%s) * 1000))
TIME_DIFF=$((CURRENT_TIME - TIMESTAMP))
if [ $TIME_DIFF -gt 1800000 ]; then
    exit 0
fi

# Check if link already exists in commit message (avoid duplicates)
if grep -q "🤖 AI:" "$COMMIT_MSG_FILE" 2>/dev/null; then
    exit 0
fi

# Append AI link to commit message
echo "" >> "$COMMIT_MSG_FILE"
echo "🤖 AI: $SESSION_URL" >> "$COMMIT_MSG_FILE"

exit 0
`;
}

/**
 * Get the path to the Git hooks directory for a repository
 */
function getHooksDir(repoPath: string): string {
    return path.join(repoPath, '.git', 'hooks');
}

/**
 * Check if hook is installed in a repository
 */
export function isHookInstalled(repoPath: string): boolean {
    const hookPath = path.join(getHooksDir(repoPath), HOOK_SCRIPT_NAME);
    
    if (!fs.existsSync(hookPath)) {
        return false;
    }
    
    try {
        const content = fs.readFileSync(hookPath, 'utf8');
        return content.includes('LLM Chat History');
    } catch {
        return false;
    }
}

/**
 * Install the Git hook in a repository
 */
export async function installHook(repoPath: string): Promise<{ success: boolean; message: string }> {
    const hooksDir = getHooksDir(repoPath);
    const hookPath = path.join(hooksDir, HOOK_SCRIPT_NAME);
    
    try {
        // Check if .git directory exists
        const gitDir = path.join(repoPath, '.git');
        if (!fs.existsSync(gitDir)) {
            return { 
                success: false, 
                message: 'Not a git repository' 
            };
        }
        
        // Create hooks directory if it doesn't exist
        if (!fs.existsSync(hooksDir)) {
            fs.mkdirSync(hooksDir, { recursive: true });
        }
        
        // Check for existing hook
        if (fs.existsSync(hookPath)) {
            const existingContent = fs.readFileSync(hookPath, 'utf8');
            
            if (existingContent.includes('LLM Chat History')) {
                // Our hook, update it
                fs.writeFileSync(hookPath, generateHookScript(), 'utf8');
                fs.chmodSync(hookPath, '755');
                return { 
                    success: true, 
                    message: 'Hook updated' 
                };
            } else {
                // Different hook exists, warn user
                return { 
                    success: false, 
                    message: `A different ${HOOK_SCRIPT_NAME} hook already exists. Please backup and remove it first.`
                };
            }
        }
        
        // Install new hook
        fs.writeFileSync(hookPath, generateHookScript(), 'utf8');
        fs.chmodSync(hookPath, '755');
        
        console.log('[GitCommitLink] Hook installed at:', hookPath);
        return { 
            success: true, 
            message: 'Hook installed successfully' 
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[GitCommitLink] Failed to install hook:', error);
        return { 
            success: false, 
            message: `Failed to install hook: ${errorMsg}` 
        };
    }
}

/**
 * Uninstall the Git hook from a repository
 */
export function uninstallHook(repoPath: string): { success: boolean; message: string } {
    const hookPath = path.join(getHooksDir(repoPath), HOOK_SCRIPT_NAME);
    
    try {
        if (!fs.existsSync(hookPath)) {
            return { 
                success: true, 
                message: 'Hook not found (already uninstalled)' 
            };
        }
        
        const content = fs.readFileSync(hookPath, 'utf8');
        if (!content.includes('LLM Chat History')) {
            return { 
                success: false, 
                message: 'Cannot uninstall: hook was not installed by this extension' 
            };
        }
        
        fs.unlinkSync(hookPath);
        console.log('[GitCommitLink] Hook uninstalled from:', hookPath);
        
        return { 
            success: true, 
            message: 'Hook uninstalled successfully' 
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[GitCommitLink] Failed to uninstall hook:', error);
        return { 
            success: false, 
            message: `Failed to uninstall hook: ${errorMsg}` 
        };
    }
}

/**
 * Git Commit Link Manager
 * Handles the lifecycle of commit linking feature
 */
export class GitCommitLinkManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private currentSessionId?: string;
    private currentWorkspacePath?: string;
    private sessionUpdateInterval?: NodeJS.Timeout;
    private installedRepos: Set<string> = new Set();
    
    constructor(private context: vscode.ExtensionContext) {}
    
    /**
     * Initialize the manager
     */
    async init(): Promise<void> {
        // Watch for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(async (e) => {
                if (e.affectsConfiguration('chatHistory.gitCommit.linkEnabled')) {
                    await this.handleConfigChange();
                }
            })
        );
        
        // Check initial state
        await this.handleConfigChange();
        
        console.log('[GitCommitLinkManager] Initialized');
    }
    
    /**
     * Handle configuration change for the feature toggle
     */
    private async handleConfigChange(): Promise<void> {
        const enabled = isGitCommitLinkEnabled();
        
        if (enabled) {
            // Validate login
            const isLoggedIn = this.checkLogin();
            if (!isLoggedIn) {
                // Show error and disable
                vscode.window.showErrorMessage(
                    '⚠️ Git Commit Link requires login. Please login first.',
                    'Login Now',
                    'Disable Feature'
                ).then(async selection => {
                    if (selection === 'Login Now') {
                        vscode.commands.executeCommand('chatHistory.cloudLogin');
                    } else if (selection === 'Disable Feature') {
                        await this.disableFeature();
                    }
                });
                
                // Revert setting
                await this.disableFeature();
                return;
            }
            
            // Install hooks for all open workspaces
            await this.installHooksForWorkspaces();
            
            // Start session tracking
            this.startSessionTracking();
            
            vscode.window.showInformationMessage(
                '✅ Git Commit Link enabled! Your commits will now include AI conversation links.'
            );
        } else {
            // Stop session tracking
            this.stopSessionTracking();
            
            // Optionally uninstall hooks (ask user)
            if (this.installedRepos.size > 0) {
                vscode.window.showInformationMessage(
                    'Git Commit Link disabled. Remove installed hooks from repositories?',
                    'Remove Hooks',
                    'Keep Hooks'
                ).then(selection => {
                    if (selection === 'Remove Hooks') {
                        this.uninstallAllHooks();
                    }
                });
            }
        }
    }
    
    /**
     * Check if user is logged in
     */
    private checkLogin(): boolean {
        const cloudSync = (global as any).__cloudSyncManager;
        return cloudSync?.isLoggedIn() ?? false;
    }
    
    /**
     * Disable the feature in settings
     */
    private async disableFeature(): Promise<void> {
        const config = vscode.workspace.getConfiguration('chatHistory');
        await config.update('gitCommit.linkEnabled', false, vscode.ConfigurationTarget.Global);
    }
    
    /**
     * Install hooks for all open workspace folders
     */
    private async installHooksForWorkspaces(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }
        
        let successCount = 0;
        let failureCount = 0;
        const failures: string[] = [];
        
        for (const folder of workspaceFolders) {
            const repoPath = folder.uri.fsPath;
            
            // Check if it's a git repository
            if (!fs.existsSync(path.join(repoPath, '.git'))) {
                continue;
            }
            
            const result = await installHook(repoPath);
            
            if (result.success) {
                this.installedRepos.add(repoPath);
                successCount++;
            } else {
                failureCount++;
                failures.push(`${path.basename(repoPath)}: ${result.message}`);
            }
        }
        
        if (failureCount > 0) {
            vscode.window.showWarningMessage(
                `Hook installation: ${successCount} success, ${failureCount} failed. ${failures.join('; ')}`
            );
        }
    }
    
    /**
     * Uninstall hooks from all tracked repositories
     */
    private uninstallAllHooks(): void {
        for (const repoPath of this.installedRepos) {
            uninstallHook(repoPath);
            clearSessionInfo(repoPath);
        }
        this.installedRepos.clear();
    }
    
    /**
     * Start tracking session for commit linking
     */
    private startSessionTracking(): void {
        // Update session file periodically to keep it fresh
        this.sessionUpdateInterval = setInterval(() => {
            if (this.currentSessionId && this.currentWorkspacePath) {
                writeSessionInfo(this.currentSessionId, this.currentWorkspacePath);
            }
        }, 60000); // Update every minute
        
        // Initial write if session exists
        if (this.currentSessionId && this.currentWorkspacePath) {
            writeSessionInfo(this.currentSessionId, this.currentWorkspacePath);
        }
    }
    
    /**
     * Stop session tracking
     */
    private stopSessionTracking(): void {
        if (this.sessionUpdateInterval) {
            clearInterval(this.sessionUpdateInterval);
            this.sessionUpdateInterval = undefined;
        }
        // Clear session files for all tracked repos
        for (const repoPath of this.installedRepos) {
            clearSessionInfo(repoPath);
        }
    }
    
    /**
     * Update current session (called when chat session changes)
     */
    setCurrentSession(sessionId: string | undefined, workspacePath: string | undefined): void {
        // If workspace changed and had a session, clear the old one
        if (this.currentWorkspacePath && this.currentWorkspacePath !== workspacePath) {
            clearSessionInfo(this.currentWorkspacePath);
        }
        
        this.currentSessionId = sessionId;
        this.currentWorkspacePath = workspacePath;
        
        if (isGitCommitLinkEnabled() && sessionId && workspacePath) {
            writeSessionInfo(sessionId, workspacePath);
            console.log('[GitCommitLinkManager] Session updated:', sessionId, 'for workspace:', workspacePath);
        } else if (!sessionId && workspacePath) {
            clearSessionInfo(workspacePath);
        }
    }
    
    /**
     * Get current session ID
     */
    getCurrentSessionId(): string | undefined {
        return this.currentSessionId;
    }
    
    /**
     * Install hook for a specific repository (called when new repo is opened)
     */
    async installHookForRepo(repoPath: string): Promise<void> {
        if (!isGitCommitLinkEnabled()) {
            return;
        }
        
        if (!this.checkLogin()) {
            return;
        }
        
        const result = await installHook(repoPath);
        if (result.success) {
            this.installedRepos.add(repoPath);
        }
    }
    
    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopSessionTracking();
        
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}


