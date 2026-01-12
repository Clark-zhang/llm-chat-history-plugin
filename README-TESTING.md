# Markdown Parser 测试指南

## 测试用例说明

`markdown-parser.test.ts` 包含了针对 `markdown-parser.ts` 的全面测试用例，基于：

1. **实际 Markdown 文件格式** - 参考 `.llm-chat-history/history/` 目录中的文件
2. **数据库结构** - 参考 PostgreSQL `chat_messages` 表结构
3. **边界情况** - 处理各种异常和边界情况

## 测试覆盖范围

### ✅ Session ID 提取
- 注释格式提取（格式1）
- Markdown 元数据提取（格式2）
- 中文格式提取（格式3）
- 文件路径生成（fallback）

### ✅ 标题提取
- 标准标题提取
- 无标题时的默认值

### ✅ Source 识别
- Cursor、Cline、Blackbox、Kilo 识别
- 默认 source

### ✅ Workspace 信息提取
- Unix 路径解析
- Windows 路径解析
- 无 workspace 时的处理

### ✅ 消息解析
- User/Assistant 消息解析
- 模型名称和模式提取
- 多消息解析
- 中文格式支持

### ✅ 时间戳解析
- 标准格式（YYYY-MM-DD HH:MMZ）
- 带秒格式（YYYY-MM-DD HH:MM:SSZ）
- 缺失时间戳的估算
- 消息排序

### ✅ 思考过程解析
- Thinking Process 提取
- 中文思考过程支持

### ✅ 工具调用解析
- 单个工具调用解析
- 多个工具调用解析
- 转义 JSON 字符串处理
- 不同格式的工具名称
- 中文工具调用标题

### ✅ 边界情况
- 空文件处理
- 无消息文件处理
- 多行内容处理
- 特殊字符处理
- 无效时间戳处理
- 工具调用解析失败处理

### ✅ 数据库兼容性
- 字段格式验证
- JSON 字符串格式验证

## 运行测试

### 使用 Vitest（推荐）

```bash
# 安装依赖
npm install -D vitest @vitest/ui

# 运行测试
npx vitest

# 运行测试（UI 模式）
npx vitest --ui

# 运行测试（watch 模式）
npx vitest --watch

# 运行测试（覆盖率）
npx vitest --coverage
```

### 使用 Jest

```bash
# 安装依赖
npm install -D jest @types/jest ts-jest

# 运行测试
npx jest

# 运行测试（watch 模式）
npx jest --watch

# 运行测试（覆盖率）
npx jest --coverage
```

## 测试数据结构

### ParsedSession
```typescript
interface ParsedSession {
    title: string;
    session_id: string;
    source: string;
    workspace_path?: string;
    workspace_name?: string;
    messages: SyncMessage[];
}
```

### SyncMessage（对应数据库 chat_messages 表）
```typescript
interface SyncMessage {
    type: string;              // VARCHAR NOT NULL
    content: string;           // TEXT
    thinking?: string;         // TEXT
    timestamp: string;         // TIMESTAMP WITH TIME ZONE NOT NULL (ISO 8601)
    model_name?: string;       // VARCHAR
    mode?: string;            // VARCHAR
    context?: string;         // TEXT (JSON string)
    tool_results?: string;    // TEXT (JSON string)
    tool_uses?: string;       // TEXT (JSON string)
    images?: string;         // TEXT (JSON string)
}
```

## 添加新测试

在 `markdown-parser.test.ts` 中添加新的测试用例：

```typescript
describe('新功能测试', () => {
    it('应该处理新场景', () => {
        const content = `...`;
        const result = parseMarkdown(content, '/test/path.md');
        expect(result?.someField).toBe('expectedValue');
    });
});
```

## 注意事项

1. **时间戳格式**：所有时间戳必须是 ISO 8601 格式（`YYYY-MM-DDTHH:mm:ss.sssZ`）
2. **JSON 字符串**：`tool_uses`、`tool_results`、`images`、`context` 必须是有效的 JSON 字符串
3. **消息排序**：消息必须按时间戳升序排序
4. **工具调用格式**：工具调用必须解析为 JSON 数组格式

## 参考文件

- 实际 Markdown 文件：`.llm-chat-history/history/`
- 数据库结构：PostgreSQL `chat_messages` 表
- 解析器实现：`src/markdown-parser.ts`
