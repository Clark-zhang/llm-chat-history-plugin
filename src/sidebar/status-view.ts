/**
 * Sidebar Status View
 * Displays automation and account status in the sidebar
 */

import * as vscode from 'vscode';
import { CloudSyncManager } from '../cloud/cloud-sync';
import { Translator } from '../i18n';

/**
 * Tree item for status display
 */
export class StatusItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        contextValue?: string,
        command?: vscode.Command,
        iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri },
        description?: string,
        tooltip?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.command = command;
        this.iconPath = iconPath;
        this.description = description;
        this.tooltip = tooltip;
    }
}

/**
 * Automation Status Provider
 */
export class AutomationStatusProvider implements vscode.TreeDataProvider<StatusItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatusItem | undefined | null | void> = new vscode.EventEmitter<StatusItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatusItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private lastSaveTime: string = '-';
    private chatsUpdated: number = 0;

    constructor(
        private cloudSync: CloudSyncManager,
        private t: Translator
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    updateStats(lastSaveTime: string, chatsUpdated: number): void {
        this.lastSaveTime = lastSaveTime;
        this.chatsUpdated = chatsUpdated;
        this.refresh();
    }

    getTreeItem(element: StatusItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StatusItem): Promise<StatusItem[]> {
        if (!element) {
            // Root level items
            const config = vscode.workspace.getConfiguration('chatHistory');
            const cloudSyncEnabled = config.get<boolean>('cloudSync.enabled', false);
            const autoSaveEnabled = config.get<boolean>('autoSave', true);
            const cloudSyncDebugMode = config.get<boolean>('cloudSync.debugMode', false);
            const isLoggedIn = this.cloudSync.isLoggedIn();

            const items: StatusItem[] = [];

            // Cloud Sync Status
            let cloudSyncLabel = 'Cloud Sync';
            let cloudSyncIcon: vscode.ThemeIcon;
            let cloudSyncTooltip: string;
            let cloudSyncDescription: string;

            if (cloudSyncEnabled && isLoggedIn) {
                cloudSyncIcon = new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.green'));
                cloudSyncDescription = 'On';
                cloudSyncTooltip = `Cloud sync is active${cloudSyncDebugMode ? ' (Debug Mode)' : ''}`;
            } else if (cloudSyncEnabled && !isLoggedIn) {
                cloudSyncIcon = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
                cloudSyncDescription = 'Not logged in';
                cloudSyncTooltip = 'Cloud sync enabled but not logged in';
            } else {
                cloudSyncIcon = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
                cloudSyncDescription = 'Off';
                cloudSyncTooltip = 'Cloud sync is disabled';
            }

            items.push(new StatusItem(
                cloudSyncLabel,
                vscode.TreeItemCollapsibleState.None,
                'cloudSyncStatus',
                {
                    command: 'chatHistory.openSettings',
                    title: 'Open Settings',
                    arguments: ['chatHistory.cloudSync.enabled']
                },
                cloudSyncIcon,
                cloudSyncDescription,
                cloudSyncTooltip
            ));

            // Auto-save Status
            const autoSaveIcon = autoSaveEnabled 
                ? new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'))
                : new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));

            items.push(new StatusItem(
                'Auto-save',
                vscode.TreeItemCollapsibleState.None,
                'autoSaveStatus',
                {
                    command: 'chatHistory.openSettings',
                    title: 'Open Settings',
                    arguments: ['chatHistory.autoSave']
                },
                autoSaveIcon,
                autoSaveEnabled ? 'On' : 'Off',
                autoSaveEnabled ? 'Automatically saving chat history' : 'Auto-save is disabled'
            ));

            // Last auto-save time
            items.push(new StatusItem(
                'Last auto-save',
                vscode.TreeItemCollapsibleState.None,
                'lastSaveTime',
                undefined,
                new vscode.ThemeIcon('clock'),
                this.lastSaveTime,
                `Last automatic save: ${this.lastSaveTime}`
            ));

            // Chats updated
            items.push(new StatusItem(
                'Chats updated',
                vscode.TreeItemCollapsibleState.None,
                'chatsUpdated',
                undefined,
                new vscode.ThemeIcon('comment-discussion'),
                String(this.chatsUpdated),
                `${this.chatsUpdated} chat sessions have been saved`
            ));

            return items;
        }
        return [];
    }
}

/**
 * Account Status Provider
 */
export class AccountStatusProvider implements vscode.TreeDataProvider<StatusItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatusItem | undefined | null | void> = new vscode.EventEmitter<StatusItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatusItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private cloudSync: CloudSyncManager,
        private t: Translator
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatusItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StatusItem): Promise<StatusItem[]> {
        if (!element) {
            const isLoggedIn = this.cloudSync.isLoggedIn();
            const user = this.cloudSync.getUser();
            const items: StatusItem[] = [];

            if (isLoggedIn && user) {
                // Logged in - show user info and actions
                items.push(new StatusItem(
                    user.username,
                    vscode.TreeItemCollapsibleState.None,
                    'username',
                    undefined,
                    new vscode.ThemeIcon('account'),
                    user.email,
                    `Logged in as ${user.username}\n${user.email}`
                ));

                items.push(new StatusItem(
                    'Sync Now',
                    vscode.TreeItemCollapsibleState.None,
                    'syncNow',
                    {
                        command: 'chatHistory.cloudSync',
                        title: 'Sync to Cloud Now'
                    },
                    new vscode.ThemeIcon('cloud-upload'),
                    undefined,
                    'Manually sync chat history to cloud'
                ));

                items.push(new StatusItem(
                    'Sign Out',
                    vscode.TreeItemCollapsibleState.None,
                    'signOut',
                    {
                        command: 'chatHistory.cloudLogout',
                        title: 'Logout'
                    },
                    new vscode.ThemeIcon('sign-out'),
                    undefined,
                    'Sign out from cloud sync'
                ));
            } else {
                // Not logged in - show sign in option
                items.push(new StatusItem(
                    'Sign In',
                    vscode.TreeItemCollapsibleState.None,
                    'signIn',
                    {
                        command: 'chatHistory.cloudLogin',
                        title: 'Login to Cloud'
                    },
                    new vscode.ThemeIcon('sign-in'),
                    undefined,
                    'Sign in to enable cloud sync'
                ));
            }

            return items;
        }
        return [];
    }
}

