import { ToolFormerData, ToolUseBlock } from './types';
import { Translator } from './i18n';

/**
 * 将 toolFormerData 转换为 Markdown 块
 */
export function formatToolUse(toolData: ToolFormerData | null | undefined, t: Translator): ToolUseBlock | null {
    if (!toolData || !toolData.name) return null;

    const args = parseJson(toolData.rawArgs, toolData.params ?? {});
    const result = parseJson(toolData.result, undefined);
    const toolType = mapToolType(toolData.name);
    const summary = buildSummary(toolData.name, args, result, t);
    const icon = getToolIcon(toolType);

    // 构建简洁的标题
    const title = summary 
        ? `${icon} **${toolData.name}** — ${summary}`
        : `${icon} **${toolData.name}**`;

    let markdown = `<details>\n<summary>${title}</summary>\n\n`;

    if (toolData.status) {
        markdown += `_${t('toolUse.status', { status: toolData.status })}_\n\n`;
    }

    // 参数部分
    if (args && Object.keys(args).length > 0) {
        markdown += `**${t('toolUse.args')}**\n\n`;
        markdown += '```json\n';
        markdown += JSON.stringify(args, null, 2);
        markdown += '\n```\n\n';
    }

    // 结果部分
    if (result !== undefined) {
        markdown += `**${t('toolUse.result')}**\n\n`;
        
        // 如果结果很大，折叠显示
        const resultStr = JSON.stringify(result, null, 2);
        if (resultStr.length > 500) {
            markdown += '<details>\n<summary><em>展开查看结果 / View Result</em></summary>\n\n';
            markdown += '```json\n';
            markdown += resultStr;
            markdown += '\n```\n\n';
            markdown += '</details>\n';
        } else {
            markdown += '```json\n';
            markdown += resultStr;
            markdown += '\n```\n';
        }
    }

    markdown += '</details>';

    return { name: toolData.name, markdown };
}

function getToolIcon(toolType: string): string {
    const icons: Record<string, string> = {
        search: '🔍',
        read: '📖',
        write: '✏️',
        edit: '✏️',
        terminal: '💻',
        todo: '✅',
        memory: '🧠',
        generic: '🔧'
    };
    return icons[toolType] || '🔧';
}

function parseJson<T = any>(raw: any, fallback: any = {}): T {
    if (raw === undefined || raw === null) return fallback as T;
    if (typeof raw !== 'string') return (raw as T) ?? fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback as T;
    }
}

function mapToolType(name: string): string {
    const mapping: Record<string, string> = {
        grep: 'search',
        codebase_search: 'search',
        web_search: 'search',
        glob_file_search: 'search',
        list_dir: 'generic',
        read_file: 'read',
        run_terminal_cmd: 'terminal',
        write: 'write',
        search_replace: 'edit',
        todo_write: 'todo',
        memory: 'memory',
    };
    return mapping[name] || 'generic';
}

function buildSummary(name: string, args: any, result: any, t: Translator): string {
    switch (name) {
        case 'grep':
            return t('toolUse.summary.grep', {
                pattern: args?.pattern ?? '',
                path: args?.path ?? '',
                matches: result?.matches ?? 0
            });
        case 'list_dir':
            return t('toolUse.summary.list_dir', {
                dir: args?.target_directory ?? '',
                count: result?.count ?? (result?.items?.length ?? 0) ?? 0
            });
        case 'read_file':
            return t('toolUse.summary.read_file', { file: args?.target_file ?? '' });
        case 'web_search':
            return t('toolUse.summary.web_search', {
                query: args?.query ?? '',
                count: (result?.results?.length ?? 0)
            });
        case 'codebase_search':
            return t('toolUse.summary.codebase_search', { query: args?.query ?? '' });
        case 'run_terminal_cmd':
            return t('toolUse.summary.run_terminal_cmd', { command: args?.command ?? '' });
        case 'glob_file_search':
            return t('toolUse.summary.glob_file_search', {
                pattern: args?.glob_pattern ?? '',
                count: (result?.files?.length ?? 0)
            });
        case 'write':
            return args?.target_file ? t('toolUse.summary.write', { file: args.target_file }) : '';
        case 'search_replace':
            return t('toolUse.summary.search_replace', { file: args?.target_file ?? '' });
        default:
            return '';
    }
}


