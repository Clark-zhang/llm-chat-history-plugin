/**
 * 聊天历史搜索功能
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createTranslator, Translator } from './i18n';

/**
 * 搜索结果项
 */
export interface SearchResult {
    filePath: string;
    fileName: string;
    title: string;
    createdDate: Date;
    messageCount: number;
    sessionId: string;
    matchedLines: Array<{
        lineNumber: number;
        content: string;
        context: string;
        type: 'title' | 'user' | 'assistant' | 'tool' | 'metadata';
    }>;
    relevanceScore: number;
}

/**
 * 聊天历史搜索器
 */
export class ChatHistorySearcher {
    private translator: Translator;

    constructor(locale: string = 'auto') {
        this.translator = createTranslator(locale as any);
    }

    /**
     * 在工作区中搜索聊天历史
     */
    async searchInWorkspace(query: string, workspaceRoot: string): Promise<SearchResult[]> {
        const outputDir = vscode.workspace.getConfiguration('chatHistory').get<string>('outputDirectory', '.llm-chat-history/history');
        const historyPath = path.join(workspaceRoot, outputDir);

        if (!fs.existsSync(historyPath)) {
            return [];
        }

        const results: SearchResult[] = [];
        const files = fs.readdirSync(historyPath)
            .filter(file => file.endsWith('.md'))
            .map(file => path.join(historyPath, file));

        for (const filePath of files) {
            try {
                const result = await this.searchInFile(filePath, query);
                if (result) {
                    results.push(result);
                }
            } catch (error) {
                console.warn(`Error searching file ${filePath}:`, error);
            }
        }

        // 按相关性得分排序
        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * 在单个文件中搜索
     */
    private async searchInFile(filePath: string, query: string): Promise<SearchResult | null> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // 解析文件元数据
        const metadata = this.parseMetadata(lines);
        if (!metadata) {
            return null;
        }

        // 搜索匹配的行
        const matchedLines: SearchResult['matchedLines'] = [];
        const queryLower = query.toLowerCase();

        lines.forEach((line, index) => {
            const lineLower = line.toLowerCase();
            if (lineLower.includes(queryLower)) {
                const type = this.determineLineType(line, index, lines);
                const context = this.getContext(lines, index);

                matchedLines.push({
                    lineNumber: index + 1,
                    content: line.trim(),
                    context: context,
                    type: type
                });
            }
        });

        if (matchedLines.length === 0) {
            return null;
        }

        // 计算相关性得分
        const relevanceScore = this.calculateRelevanceScore(matchedLines, query);

        return {
            filePath,
            fileName: path.basename(filePath),
            title: metadata.title,
            createdDate: metadata.createdDate,
            messageCount: metadata.messageCount,
            sessionId: metadata.sessionId,
            matchedLines,
            relevanceScore
        };
    }

    /**
     * 解析文件元数据
     */
    private parseMetadata(lines: string[]): { title: string; createdDate: Date; messageCount: number; sessionId: string } | null {
        let title = '';
        let createdDate: Date | null = null;
        let messageCount = 0;
        let sessionId = '';

        for (const line of lines) {
            // 标题行
            if (line.startsWith('# ')) {
                title = line.substring(2).trim();
            }
            // 创建时间
            else if (line.includes('**Created**:') || line.includes('**创建时间**:')) {
                const dateMatch = line.match(/\*\*.*?\*\*\s*(.+)/);
                if (dateMatch) {
                    createdDate = new Date(dateMatch[1].trim());
                }
            }
            // 消息数量
            else if (line.includes('**Messages**:') || line.includes('**消息**:')) {
                const countMatch = line.match(/\*\*.*?\*\*\s*(\d+)/);
                if (countMatch) {
                    messageCount = parseInt(countMatch[1]);
                }
            }
            // 会话ID
            else if (line.includes('**Session ID**:') || line.includes('**会话ID**:')) {
                const idMatch = line.match(/\*\*.*?\*\*\s*(.+)/);
                if (idMatch) {
                    sessionId = idMatch[1].trim();
                }
            }
        }

        if (!title || !createdDate) {
            return null;
        }

        return { title, createdDate, messageCount, sessionId };
    }

    /**
     * 判断行的类型
     */
    private determineLineType(line: string, index: number, lines: string[]): SearchResult['matchedLines'][0]['type'] {
        // 标题
        if (line.startsWith('# ')) {
            return 'title';
        }
        // 用户消息
        if (line.includes('💬 User') || line.includes('💬 用户')) {
            return 'user';
        }
        // 助手消息
        if (line.includes('🤖 Assistant') || line.includes('🤖 助手')) {
            return 'assistant';
        }
        // 工具使用
        if (line.includes('🔧 Tool Uses') || line.includes('🔧 工具使用')) {
            return 'tool';
        }
        // 元数据
        if (line.includes('**Created**:') || line.includes('**Messages**:') || line.includes('**Session ID**:')) {
            return 'metadata';
        }

        // 检查上下文来确定类型
        for (let i = Math.max(0, index - 5); i < Math.min(lines.length, index + 5); i++) {
            const contextLine = lines[i];
            if (contextLine.includes('💬 User') || contextLine.includes('💬 用户')) {
                return 'user';
            }
            if (contextLine.includes('🤖 Assistant') || contextLine.includes('🤖 助手')) {
                return 'assistant';
            }
        }

        return 'metadata';
    }

    /**
     * 获取上下文
     */
    private getContext(lines: string[], index: number): string {
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length, index + 3);
        return lines.slice(start, end)
            .filter(line => line.trim())
            .join(' ')
            .substring(0, 200);
    }

    /**
     * 计算相关性得分
     */
    private calculateRelevanceScore(matchedLines: SearchResult['matchedLines'], query: string): number {
        let score = 0;
        const queryLower = query.toLowerCase();

        for (const match of matchedLines) {
            // 标题匹配权重更高
            if (match.type === 'title') {
                score += 10;
            }
            // 用户和助手消息权重中等
            else if (match.type === 'user' || match.type === 'assistant') {
                score += 5;
            }
            // 其他类型权重较低
            else {
                score += 1;
            }

            // 精确匹配权重更高
            if (match.content.toLowerCase().includes(queryLower)) {
                score += 2;
            }

            // 多个匹配增加得分
            score += matchedLines.length * 0.1;
        }

        return score;
    }
}

/**
 * 显示搜索界面
 */
export async function showSearchInterface(context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const config = vscode.workspace.getConfiguration('chatHistory');
    const locale = config.get<string>('locale', 'auto') as any;
    const t = createTranslator(locale);

    // 输入搜索查询
    const query = await vscode.window.showInputBox({
        placeHolder: t('search.placeholder'),
        prompt: t('search.prompt'),
        ignoreFocusOut: true
    });

    if (!query || !query.trim()) {
        return;
    }

    // 显示进度
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: t('search.searching'),
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: 'Searching chat history...' });

        const searcher = new ChatHistorySearcher(locale);
        const results = await searcher.searchInWorkspace(query.trim(), workspaceRoot);

        progress.report({ increment: 100 });

        if (results.length === 0) {
            vscode.window.showInformationMessage(t('search.noResults'));
            return;
        }

        // 显示结果
        await showSearchResults(results, query, t as any);
    });
}

/**
 * 显示搜索结果
 */
async function showSearchResults(results: SearchResult[], query: string, t: (key: string) => string) {
    const items = results.map(result => ({
        label: result.title,
        description: `${result.fileName} (${result.matchedLines.length} matches)`,
        detail: `Created: ${result.createdDate.toLocaleDateString()} | Messages: ${result.messageCount}`,
        result: result
    }));

    const selected = await vscode.window.showQuickPick(items, {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: `Found ${results.length} conversation(s) matching "${query}"`
    });

    if (selected) {
        await showDetailedResult(selected.result, query, t);
    }
}

/**
 * 显示详细结果
 */
async function showDetailedResult(result: SearchResult, query: string, t: Translator) {
    // 打开文件
    const document = await vscode.workspace.openTextDocument(result.filePath);
    const editor = await vscode.window.showTextDocument(document);

    // 如果有匹配行，跳转到第一个匹配
    if (result.matchedLines.length > 0) {
        const firstMatch = result.matchedLines[0];
        const position = new vscode.Position(firstMatch.lineNumber - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }

    // 显示匹配详情
    const matchDetails = result.matchedLines.map(match => {
        const typeIcon = {
            title: '📝',
            user: '💬',
            assistant: '🤖',
            tool: '🔧',
            metadata: '📊'
        }[match.type];

        return `${typeIcon} Line ${match.lineNumber}: ${match.content}`;
    }).join('\n');

    const message = `Found ${result.matchedLines.length} match(es) in "${result.title}"\n\n${matchDetails}`;

    const openFile = t('search.openFile');
    const selection = await vscode.window.showInformationMessage(message, openFile);

    if (selection === openFile) {
        // 文件已经在前面打开了，这里可以添加额外的操作
    }
}
