# Cursor 聊天记录导出系统 - 完整实施方案

> 基于对 Cursor SQLite 数据库的实际验证和分析
> 文档版本: 1.0
> 创建日期: 2025-12-23

---

## 📋 目录

1. [项目概述](#项目概述)
2. [数据源分析](#数据源分析)
3. [核心数据结构](#核心数据结构)
4. [实施步骤](#实施步骤)
5. [代码实现示例](#代码实现示例)
6. [Markdown 生成规则](#markdown-生成规则)
7. [常见问题](#常见问题)

---

## 项目概述

### 目标

实现一个 VS Code/Cursor 扩展，自动捕获并保存用户与 AI 的对话历史为 Markdown 格式。

### 核心功能

- ✅ 自动监听 Cursor 对话数据库变化
- ✅ 读取用户输入、AI 思考过程和 AI 响应
- ✅ 转换为结构化的 Markdown 文件
- ✅ 按时间戳命名，便于版本控制
- ✅ 支持 Git 友好的格式

---

## 数据源分析

### 1. 数据库位置

**Windows:**
```
C:\Users\{用户名}\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
```

**macOS:**
```
~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
```

**Linux:**
```
~/.config/Cursor/User/globalStorage/state.vscdb
```

### 2. 数据库结构

```sql
-- 主表
CREATE TABLE cursorDiskKV (
    key TEXT UNIQUE ON CONFLICT REPLACE,
    value BLOB
);

-- 键值对存储模型
-- 键格式示例:
--   composerData:{composerId}
--   bubbleId:{composerId}:{bubbleId}
```

### 3. 关键表名

**实际验证结果**：
- ✅ 主表名：`cursorDiskKV` (不是 ItemTable)
- ✅ 包含 composerData 和 bubbleId 数据

---

## 核心数据结构

### Composer Data（对话容器）

**键格式**：`composerData:{composerId}`

**数据结构**：

```typescript
interface ComposerData {
  _v: number;                               // 版本号 (通常为 3)
  composerId: string;                       // 对话唯一 ID
  name: string;                             // 对话标题
  createdAt: string;                        // 创建时间 ISO 格式
  lastUpdatedAt?: string;                   // 最后更新时间
  
  // 对话引用列表（关键！）
  fullConversationHeadersOnly: Array<{
    bubbleId: string;                       // Bubble ID
    type: number;                           // 1=用户消息, 2=AI响应
  }>;
  
  // 其他元数据
  text: string;                             // 当前输入框文本
  richText: string;                         // 富文本格式
  modelConfig: {
    modelName: string;                      // 使用的模型
  };
  unifiedMode: number;                      // 模式 (1=Chat, 2=Agent)
  isAgentic: boolean;                       // 是否为 Agent 模式
  
  // ... 更多配置字段
}
```

**关键字段**：
- ✅ `fullConversationHeadersOnly`: 包含所有对话的 bubbleId 引用
- ✅ `composerId`: 用于关联所有相关的 bubble 数据

### Bubble Data（消息单元）

**键格式**：`bubbleId:{composerId}:{bubbleId}`

#### Type 1 - 用户消息

```typescript
interface UserBubble {
  _v: number;
  type: 1;                                  // 固定为 1
  bubbleId: string;
  requestId: string;
  createdAt: string;                        // ISO 时间戳
  
  // 💡 用户输入内容
  text: string;                             // ⭐ 用户输入的纯文本
  richText: string;                         // 富文本格式 (JSON)
  
  // 上下文信息
  modelInfo: {
    modelName: string;                      // 使用的模型
  };
  unifiedMode: number;                      // 模式
  isAgentic: boolean;                       // 是否 Agent 模式
  workspaceUris: string[];                  // 工作区路径
  
  // ... 其他字段
}
```

**关键字段**：
- ✅ `text`: **用户输入的实际内容**

#### Type 2 - AI 响应

```typescript
interface AIResponseBubble {
  _v: number;
  type: 2;                                  // 固定为 2
  bubbleId: string;
  requestId: string;                        // 关联到用户消息的 requestId
  createdAt: string;                        // ISO 时间戳
  
  // 💡 AI 响应内容
  text: string;                             // ⭐ AI 的实际响应文本
  
  // 💡 AI 思考过程（thinking models）
  thinking?: {
    text: string;                           // ⭐ AI 的思考过程
    signature: string;                      // 签名
  };
  thinkingStyle?: number;                   // 思考风格
  
  // 时间信息
  timingInfo: {
    clientStartTime: number;
    clientRpcSendTime: number;
    clientSettleTime: number;
    clientEndTime: number;
  };
  
  // 模型信息
  modelInfo: {
    modelName: string;
  };
  
  // 工具调用结果（如果有）
  toolResults: Array<{
    name: string;                           // 工具名称
    result: any;                            // 工具结果
  }>;
  
  // ... 其他字段
}
```

**关键字段**：
- ✅ `text`: **AI 的实际响应内容**（主回答）
- ✅ `thinking.text`: **AI 的思考过程**（仅 thinking models）

---

## 实施步骤

### 第 1 步：初始化扩展

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import Database from 'better-sqlite3';

export function activate(context: vscode.ExtensionContext) {
    console.log('Chat History Extension activated');
    
    // 获取数据库路径
    const dbPath = getCursorDatabasePath();
    
    // 启动监听
    const watcher = new DatabaseWatcher(dbPath);
    watcher.start();
    
    context.subscriptions.push({
        dispose: () => watcher.stop()
    });
}

function getCursorDatabasePath(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    
    if (platform === 'win32') {
        return path.join(
            homeDir,
            'AppData/Roaming/Cursor/User/globalStorage/state.vscdb'
        );
    } else if (platform === 'darwin') {
        return path.join(
            homeDir,
            'Library/Application Support/Cursor/User/globalStorage/state.vscdb'
        );
    } else {
        return path.join(
            homeDir,
            '.config/Cursor/User/globalStorage/state.vscdb'
        );
    }
}
```

### 第 2 步：数据库读取器

```typescript
import Database from 'better-sqlite3';

class CursorDatabaseReader {
    private db: Database.Database;
    
    constructor(dbPath: string) {
        // 只读模式 + WAL 模式
        this.db = new Database(dbPath, {
            readonly: true,
            fileMustExist: true
        });
        
        // 设置 WAL 模式
        this.db.pragma('journal_mode = WAL');
    }
    
    /**
     * 获取所有 Composer
     */
    getAllComposers(): ComposerData[] {
        const stmt = this.db.prepare(`
            SELECT key, value 
            FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%'
        `);
        
        const rows = stmt.all();
        const composers: ComposerData[] = [];
        
        for (const row of rows) {
            try {
                const data = JSON.parse(row.value);
                composers.push(data);
            } catch (error) {
                console.error('Failed to parse composer:', error);
            }
        }
        
        return composers;
    }
    
    /**
     * 获取指定 Composer 的所有 Bubble
     */
    getComposerBubbles(composerId: string, bubbleIds: string[]): Bubble[] {
        const bubbles: Bubble[] = [];
        
        for (const bubbleId of bubbleIds) {
            const key = `bubbleId:${composerId}:${bubbleId}`;
            const stmt = this.db.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
            const row = stmt.get(key);
            
            if (row && row.value) {
                try {
                    const bubble = JSON.parse(row.value);
                    bubbles.push(bubble);
                } catch (error) {
                    console.error(`Failed to parse bubble ${bubbleId}:`, error);
                }
            }
        }
        
        return bubbles;
    }
    
    close() {
        this.db.close();
    }
}
```

### 第 3 步：对话数据重组

```typescript
interface Message {
    id: string;
    type: 'user' | 'assistant';
    text: string;
    thinking?: string;
    timestamp: string;
    modelName?: string;
    mode?: string;
}

class ConversationBuilder {
    /**
     * 从 Composer 构建完整对话
     */
    buildConversation(
        composer: ComposerData,
        bubbles: Bubble[]
    ): Message[] {
        const messages: Message[] = [];
        const bubbleMap = new Map<string, Bubble>();
        
        // 创建 bubble 映射
        for (const bubble of bubbles) {
            bubbleMap.set(bubble.bubbleId, bubble);
        }
        
        // 按顺序处理
        const headers = composer.fullConversationHeadersOnly || [];
        
        for (const header of headers) {
            const bubble = bubbleMap.get(header.bubbleId);
            if (!bubble) continue;
            
            if (header.type === 1) {
                // 用户消息
                messages.push({
                    id: bubble.bubbleId,
                    type: 'user',
                    text: bubble.text || '',
                    timestamp: bubble.createdAt,
                    modelName: bubble.modelInfo?.modelName,
                    mode: this.getMode(bubble.unifiedMode)
                });
            } else if (header.type === 2) {
                // AI 响应
                messages.push({
                    id: bubble.bubbleId,
                    type: 'assistant',
                    text: bubble.text || '',
                    thinking: bubble.thinking?.text,
                    timestamp: bubble.createdAt,
                    modelName: bubble.modelInfo?.modelName,
                    mode: this.getMode(bubble.unifiedMode)
                });
            }
        }
        
        return messages;
    }
    
    private getMode(unifiedMode?: number): string {
        switch (unifiedMode) {
            case 1: return 'Chat';
            case 2: return 'Agent';
            default: return '';
        }
    }
}
```

### 第 4 步：Markdown 生成器

```typescript
class MarkdownGenerator {
    /**
     * 生成 Markdown 文档
     */
    generate(
        composer: ComposerData,
        messages: Message[]
    ): string {
        let markdown = '';
        
        // 文件头
        markdown += this.generateHeader(composer);
        markdown += '\n\n';
        
        // 标题
        markdown += `# ${composer.name || 'Untitled'} (${this.formatDate(composer.createdAt)})\n\n`;
        
        // 消息
        let previousSpeaker: string | null = null;
        
        for (const message of messages) {
            // 如果发言者改变，添加发言者标记
            if (message.type !== previousSpeaker) {
                markdown += this.generateSpeakerHeader(message);
                markdown += '\n\n';
            }
            
            // 思考过程（如果有）
            if (message.thinking) {
                markdown += this.generateThinking(message.thinking);
                markdown += '\n\n---\n\n';
            }
            
            // 消息内容
            markdown += message.text;
            markdown += '\n\n---\n\n';
            
            previousSpeaker = message.type;
        }
        
        return markdown;
    }
    
    private generateHeader(composer: ComposerData): string {
        return `<!-- Generated by Chat History Extension -->
<!-- Cursor Session ${composer.composerId} (${this.formatDate(composer.createdAt)}) -->`;
    }
    
    private generateSpeakerHeader(message: Message): string {
        if (message.type === 'user') {
            return `_**User (${this.formatDate(message.timestamp)})**_`;
        } else {
            const parts = [];
            if (message.modelName) {
                parts.push(`model ${message.modelName}`);
            }
            if (message.mode) {
                parts.push(`mode ${message.mode}`);
            }
            const info = parts.length > 0 ? ` (${parts.join(', ')})` : '';
            return `_**Agent${info}**_`;
        }
    }
    
    private generateThinking(thinking: string): string {
        return `<think><details><summary>Thought Process</summary>
${thinking}
</details></think>`;
    }
    
    private formatDate(isoDate: string): string {
        const date = new Date(isoDate);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hour}:${minute}Z`;
    }
}
```

### 第 5 步：文件保存器

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

class HistorySaver {
    private historyDir: string;
    
    constructor(workspaceRoot: string) {
        this.historyDir = path.join(workspaceRoot, '.llm-chat-history');
    }
    
    /**
     * 保存对话到文件
     */
    async save(composer: ComposerData, markdown: string): Promise<string> {
        // 确保目录存在
        await fs.mkdir(this.historyDir, { recursive: true });
        
        // 生成文件名
        const filename = this.generateFilename(composer);
        const filepath = path.join(this.historyDir, filename);
        
        // 检查是否需要更新
        const shouldSave = await this.shouldSave(filepath, markdown);
        
        if (shouldSave) {
            await fs.writeFile(filepath, markdown, 'utf-8');
            console.log(`Saved: ${filename}`);
        }
        
        return filepath;
    }
    
    private generateFilename(composer: ComposerData): string {
        const date = new Date(composer.createdAt);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        
        const timestamp = `${year}-${month}-${day}_${hour}-${minute}Z`;
        const title = this.sanitizeTitle(composer.name || 'untitled');
        
        return `${timestamp}-${title}.md`;
    }
    
    private sanitizeTitle(title: string): string {
        // 移除特殊字符
        return title
            .replace(/[<>:"/\\|?*]/g, '-')
            .replace(/\s+/g, '-')
            .toLowerCase()
            .substring(0, 50);
    }
    
    private async shouldSave(filepath: string, newContent: string): Promise<boolean> {
        try {
            const existingContent = await fs.readFile(filepath, 'utf-8');
            return existingContent !== newContent;
        } catch {
            // 文件不存在，需要保存
            return true;
        }
    }
}
```

### 第 6 步：监听器

```typescript
import * as chokidar from 'chokidar';

class DatabaseWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private dbPath: string;
    private lastSync: number = 0;
    private debounceTimer: NodeJS.Timeout | null = null;
    
    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }
    
    start() {
        // 1. 立即执行一次同步
        this.syncNow();
        
        // 2. 监听数据库文件变化
        this.watcher = chokidar.watch(this.dbPath, {
            persistent: true,
            ignoreInitial: true
        });
        
        this.watcher.on('change', () => {
            this.scheduleSync();
        });
        
        // 3. 定时轮询（兜底，每 2 分钟）
        setInterval(() => {
            this.syncNow();
        }, 120000); // 2 分钟
        
        console.log('Database watcher started');
    }
    
    stop() {
        if (this.watcher) {
            this.watcher.close();
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
    }
    
    private scheduleSync() {
        // 防抖：2 秒内只执行一次
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this.syncNow();
        }, 2000);
    }
    
    private async syncNow() {
        const now = Date.now();
        
        // 避免过于频繁的同步
        if (now - this.lastSync < 1000) {
            return;
        }
        
        this.lastSync = now;
        
        try {
            await this.performSync();
        } catch (error) {
            console.error('Sync failed:', error);
        }
    }
    
    private async performSync() {
        const reader = new CursorDatabaseReader(this.dbPath);
        
        try {
            // 获取所有 composer
            const composers = reader.getAllComposers();
            
            for (const composer of composers) {
                // 获取 bubble IDs
                const bubbleIds = (composer.fullConversationHeadersOnly || [])
                    .map(h => h.bubbleId);
                
                if (bubbleIds.length === 0) continue;
                
                // 获取 bubbles
                const bubbles = reader.getComposerBubbles(composer.composerId, bubbleIds);
                
                // 构建对话
                const builder = new ConversationBuilder();
                const messages = builder.buildConversation(composer, bubbles);
                
                if (messages.length === 0) continue;
                
                // 生成 Markdown
                const generator = new MarkdownGenerator();
                const markdown = generator.generate(composer, messages);
                
                // 保存
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceRoot) {
                    const saver = new HistorySaver(workspaceRoot);
                    await saver.save(composer, markdown);
                }
            }
        } finally {
            reader.close();
        }
    }
}
```

---

## Markdown 生成规则

### 标准格式

```markdown
<!-- Generated by Chat History Extension -->
<!-- Cursor Session {composerId} ({timestamp}) -->

# {对话标题} ({创建时间})

_**User ({timestamp})**_

用户的问题

---

_**Agent (model claude-4.5-sonnet-thinking, mode Agent)**_

<think><details><summary>Thought Process</summary>
AI 的思考过程（如果有）
</details></think>

---

AI 的实际回答内容

---

_**User ({timestamp})**_

用户的后续问题

---
```

### 关键规则

1. **时间戳格式**：`YYYY-MM-DD HH:MMZ` (UTC)
2. **发言者标记**：
   - 用户：`_**User (timestamp)**_`
   - AI：`_**Agent (model xxx, mode xxx)**_`
3. **思考过程**：使用 `<think><details>` 折叠
4. **分隔符**：使用 `---` 分隔消息

---

## 代码实现示例

### 完整的主函数

```typescript
// extension.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Chat History Extension activated');
    
    // 获取配置
    const config = vscode.workspace.getConfiguration('chatHistory');
    const autoSave = config.get<boolean>('autoSave', true);
    
    if (!autoSave) {
        console.log('Auto-save disabled');
        return;
    }
    
    // 获取数据库路径
    const dbPath = getCursorDatabasePath();
    
    // 检查数据库是否存在
    if (!fs.existsSync(dbPath)) {
        console.warn('Cursor database not found:', dbPath);
        return;
    }
    
    // 启动监听
    const watcher = new DatabaseWatcher(dbPath);
    watcher.start();
    
    // 注册命令：手动保存
    const saveCommand = vscode.commands.registerCommand(
        'chatHistory.saveNow',
        async () => {
            await watcher.syncNow();
            vscode.window.showInformationMessage('Chat history saved');
        }
    );
    
    context.subscriptions.push(saveCommand, {
        dispose: () => watcher.stop()
    });
}

export function deactivate() {
    console.log('Chat History Extension deactivated');
}
```

### package.json 配置

```json
{
  "name": "cursor-chat-history",
  "displayName": "Cursor Chat History",
  "description": "Save Cursor AI chat history to markdown files",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.93.0"
  },
  "main": "./dist/extension.js",
  "activationEvents": [
    "onStartupFinished"
  ],
  "contributes": {
    "configuration": {
      "title": "Chat History",
      "properties": {
        "chatHistory.autoSave": {
          "type": "boolean",
          "default": true,
          "description": "Automatically save chat history"
        },
        "chatHistory.outputDirectory": {
          "type": "string",
          "default": ".llm-chat-history",
          "description": "Directory to save chat history files"
        },
        "chatHistory.useUTC": {
          "type": "boolean",
          "default": true,
          "description": "Use UTC timezone for timestamps"
        }
      }
    },
    "commands": [
      {
        "command": "chatHistory.saveNow",
        "title": "Save Chat History Now"
      }
    ]
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "chokidar": "^3.6.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.93.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## 项目匹配机制

### 核心问题

**如何区分当前项目的聊天记录，避免导出所有 Cursor 对话？**

### 解决方案

每个 Bubble 都包含工作区信息！通过路径匹配来过滤。

#### 关键字段（已验证）

```typescript
// 每个 Bubble 都包含：
interface Bubble {
    workspaceUris?: string[];          // ← URI 格式的工作区路径
    workspaceProjectDir?: string;      // ← 文件系统绝对路径
}

// 实际数据示例：
{
    "workspaceUris": ["file:///d%3A/Projects/chat_history"],
    "workspaceProjectDir": "c:\\Users\\85786\\.cursor\\projects\\d-Projects-chat-history"
}
```

#### 实现代码

```typescript
class WorkspaceFilter {
    private currentWorkspacePath: string;
    
    constructor() {
        // 获取当前 VS Code 工作区路径
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.currentWorkspacePath = this.normalizePath(
                workspaceFolders[0].uri.fsPath
            );
        }
    }
    
    /**
     * 检查 Composer 是否属于当前工作区
     */
    async belongsToCurrentWorkspace(
        composer: ComposerData,
        reader: CursorDatabaseReader
    ): Promise<boolean> {
        if (!this.currentWorkspacePath) {
            return false;
        }
        
        // 获取第一个 bubble
        const headers = composer.fullConversationHeadersOnly || [];
        if (headers.length === 0) {
            return false;
        }
        
        const firstBubbleId = headers[0].bubbleId;
        const bubbles = reader.getComposerBubbles(
            composer.composerId,
            [firstBubbleId]
        );
        
        if (bubbles.length === 0) {
            return false;
        }
        
        const bubble = bubbles[0];
        
        // 方法 1: 使用 workspaceUris（推荐）
        if (bubble.workspaceUris && bubble.workspaceUris.length > 0) {
            const bubbleWorkspace = this.uriToPath(bubble.workspaceUris[0]);
            return this.pathsMatch(bubbleWorkspace, this.currentWorkspacePath);
        }
        
        // 方法 2: 使用 workspaceProjectDir（备选）
        if (bubble.workspaceProjectDir) {
            const bubbleWorkspace = this.normalizePath(bubble.workspaceProjectDir);
            return this.pathsMatch(bubbleWorkspace, this.currentWorkspacePath);
        }
        
        return false;
    }
    
    /**
     * 将 file:// URI 转换为文件系统路径
     */
    private uriToPath(uri: string): string {
        // file:///d%3A/Projects/chat_history → d:/Projects/chat_history
        
        try {
            // 解码 URI
            const decoded = decodeURIComponent(uri);
            
            // 移除 file:/// 前缀
            let path = decoded.replace(/^file:\/\/\//, '');
            
            // Windows: 处理盘符 (d%3A → d:)
            if (process.platform === 'win32') {
                path = path.replace(/%3A/gi, ':');
            }
            
            return this.normalizePath(path);
        } catch (error) {
            console.error('Failed to parse URI:', uri, error);
            return '';
        }
    }
    
    /**
     * 规范化路径（统一格式）
     */
    private normalizePath(filepath: string): string {
        // 统一使用正斜杠
        let normalized = filepath.replace(/\\/g, '/');
        
        // Windows: 统一盘符大小写
        if (process.platform === 'win32') {
            normalized = normalized.toLowerCase();
        }
        
        // 移除末尾的斜杠
        normalized = normalized.replace(/\/$/, '');
        
        return normalized;
    }
    
    /**
     * 比较两个路径是否匹配
     */
    private pathsMatch(path1: string, path2: string): boolean {
        return this.normalizePath(path1) === this.normalizePath(path2);
    }
}
```

#### 集成到同步流程

```typescript
async function performSync() {
    const reader = new CursorDatabaseReader(this.dbPath);
    const filter = new WorkspaceFilter();  // ← 添加过滤器
    
    try {
        // 获取所有 composer
        const allComposers = reader.getAllComposers();
        console.log(`Found ${allComposers.length} total composers`);
        
        // 过滤属于当前工作区的 composer
        const workspaceComposers: ComposerData[] = [];
        
        for (const composer of allComposers) {
            const belongs = await filter.belongsToCurrentWorkspace(composer, reader);
            if (belongs) {
                workspaceComposers.push(composer);
            }
        }
        
        console.log(`Filtered to ${workspaceComposers.length} composers for current workspace`);
        
        // 处理过滤后的 composer
        for (const composer of workspaceComposers) {
            const bubbleIds = (composer.fullConversationHeadersOnly || [])
                .map(h => h.bubbleId);
            
            if (bubbleIds.length === 0) continue;
            
            const bubbles = reader.getComposerBubbles(composer.composerId, bubbleIds);
            const builder = new ConversationBuilder();
            const messages = builder.buildConversation(composer, bubbles);
            
            if (messages.length === 0) continue;
            
            const generator = new MarkdownGenerator();
            const markdown = generator.generate(composer, messages);
            
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
                const saver = new HistorySaver(workspaceRoot);
                await saver.save(composer, markdown);
            }
        }
    } finally {
        reader.close();
    }
}
```

#### 关键点

1. ✅ **每个 Bubble 都有工作区信息**：`workspaceUris` 或 `workspaceProjectDir`
2. ✅ **URI 解码**：`file:///d%3A/...` → `d:/...`
3. ✅ **路径规范化**：统一分隔符和大小写
4. ✅ **只处理匹配的**：过滤后只保存当前工作区的对话

---

## 常见问题

### Q1: 数据库被锁定怎么办？

**A:** 使用只读模式 + 重试机制：

```typescript
function openDatabase(dbPath: string, maxRetries = 3): Database.Database {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return new Database(dbPath, { readonly: true });
        } catch (error) {
            if (i < maxRetries - 1) {
                // 等待 500ms 后重试
                await sleep(500);
                continue;
            }
            throw error;
        }
    }
}
```

### Q2: 如何处理工具调用（Tool Results）？

**A:** Type 2 bubble 中的 `toolResults` 字段包含工具调用结果：

```typescript
if (bubble.toolResults && bubble.toolResults.length > 0) {
    for (const tool of bubble.toolResults) {
        markdown += `\n<tool-use>\n`;
        markdown += `<details><summary>Tool: ${tool.name}</summary>\n\n`;
        markdown += JSON.stringify(tool.result, null, 2);
        markdown += `\n</details>\n</tool-use>\n\n`;
    }
}
```

### Q3: 如何区分 Chat 和 Agent 模式？

**A:** 通过 `unifiedMode` 字段：

```typescript
function getMode(unifiedMode?: number): string {
    switch (unifiedMode) {
        case 1: return 'Chat';
        case 2: return 'Agent';
        default: return 'Unknown';
    }
}
```

### Q4: 如何处理富文本（richText）？

**A:** richText 是 Lexical 格式的 JSON，可以解析后提取纯文本：

```typescript
function extractTextFromRichText(richText: string): string {
    try {
        const data = JSON.parse(richText);
        return extractTextFromLexical(data);
    } catch {
        return '';
    }
}

function extractTextFromLexical(node: any): string {
    if (!node) return '';
    
    if (node.text) {
        return node.text;
    }
    
    if (node.children && Array.isArray(node.children)) {
        return node.children.map(extractTextFromLexical).join('');
    }
    
    return '';
}
```

---

## 性能优化建议

### 1. 使用索引缓存

```typescript
class ComposerCache {
    private cache = new Map<string, { hash: string; markdown: string }>();
    
    shouldUpdate(composerId: string, currentHash: string): boolean {
        const cached = this.cache.get(composerId);
        return !cached || cached.hash !== currentHash;
    }
    
    update(composerId: string, hash: string, markdown: string) {
        this.cache.set(composerId, { hash, markdown });
    }
}
```

### 2. 批量处理

```typescript
async function batchProcess(composers: ComposerData[], batchSize = 10) {
    for (let i = 0; i < composers.length; i += batchSize) {
        const batch = composers.slice(i, i + batchSize);
        await Promise.all(batch.map(c => processComposer(c)));
    }
}
```

### 3. 防抖优化

```typescript
const debouncedSync = debounce(syncNow, 2000, {
    leading: false,
    trailing: true,
    maxWait: 5000
});
```

---

## 部署检查清单

- [ ] 数据库路径配置正确
- [ ] 只读模式 + WAL 模式设置
- [ ] 文件名生成规则（时间戳 + 标题）
- [ ] Markdown 格式符合规范
- [ ] 思考过程折叠显示
- [ ] 工具调用结果处理
- [ ] Git ignore 配置
- [ ] 错误处理和日志
- [ ] 性能优化（防抖、缓存）
- [ ] 跨平台兼容性测试

---

## 总结

### 关键数据位置

| 内容 | 位置 | 说明 |
|------|------|------|
| **用户输入** | Type 1 bubble 的 `text` 字段 | 用户的问题或指令 |
| **AI 思考** | Type 2 bubble 的 `thinking.text` 字段 | thinking models 的思考过程 |
| **AI 响应** | Type 2 bubble 的 `text` 字段 | AI 的实际回答内容 |
| **对话列表** | Composer 的 `fullConversationHeadersOnly` | bubble ID 和类型引用 |
| **元数据** | Composer 和 Bubble 的其他字段 | 时间戳、模型名称、模式等 |

### 实施路径

```
1. 读取数据库 (cursorDiskKV 表)
   ↓
2. 获取 Composer 数据 (composerData:{id})
   ↓
3. 提取 bubble ID 列表 (fullConversationHeadersOnly)
   ↓
4. 获取所有 Bubble 数据 (bubbleId:{composerId}:{bubbleId})
   ↓
5. 按类型分类处理：
   - Type 1: 提取 text 字段 → 用户消息
   - Type 2: 提取 text 和 thinking.text → AI 响应
   ↓
6. 按顺序组装消息
   ↓
7. 生成 Markdown
   ↓
8. 保存到文件系统
```

### 成功关键

1. ✅ 使用正确的表名：`cursorDiskKV`（不是 ItemTable）
2. ✅ 理解 Composer 和 Bubble 的关系
3. ✅ 正确提取 Type 1 和 Type 2 的数据
4. ✅ WAL 模式 + 只读访问保证稳定性
5. ✅ 防抖和缓存优化性能

---

**文档版本**: 1.0  
**最后更新**: 2025-12-23  
**验证状态**: ✅ 已通过实际数据库验证

本文档基于对 Cursor SQLite 数据库的实际查询和验证，所有数据结构和字段位置均已确认。


