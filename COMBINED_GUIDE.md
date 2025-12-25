# Combined Guide

## Contents
- FIX_SUMMARY.md
- INSTALL_NOTES.md
- INSTALL.md
- QUICK_START.md

---

# Fix Summary: NODE_MODULE_VERSION Mismatch Issue

## Problem

The extension failed to load `better-sqlite3` with the error:
```
Error: The module was compiled against a different Node.js version using
NODE_MODULE_VERSION 128. This version of Node.js requires
NODE_MODULE_VERSION 136.
```

## Root Cause

- Cursor uses **Electron 37-39** which requires **NODE_MODULE_VERSION 136**
- The installed `better-sqlite3@11.10.0` only had prebuilt binaries up to Electron 33 (NODE_MODULE_VERSION 130)
- The binary needed to be compiled specifically for the Electron version used by Cursor

## Solution

### 1. Updated better-sqlite3 to Latest Version

**Changed**: `package.json`
```json
"dependencies": {
  "better-sqlite3": "^12.5.0",  // was ^11.0.0
  "chokidar": "^3.6.0"
}
```

The newer version (12.5.0) includes prebuilt binaries for Electron 39 (NODE_MODULE_VERSION 136).

### 2. Created Automated Setup Script

**Created**: `setup-sqlite.js`
- Automatically detects the Electron version
- Tries multiple Electron versions (39, 37, 36, 33) for compatibility
- Downloads the correct prebuilt binary
- Provides helpful error messages if no prebuilt binary is available

**Added to package.json**:
```json
"scripts": {
  "postinstall": "node setup-sqlite.js",
  "setup": "node setup-sqlite.js"
}
```

### 3. Updated Documentation

**Updated files**:
- `QUICK_START.md`: Added comprehensive troubleshooting section
- `README.md`: Added installation notes with links to troubleshooting
- `INSTALL_NOTES.md`: Created detailed technical documentation

## Verification

✅ `npm install` - Successfully installs all dependencies and downloads correct binary  
✅ `npm run setup` - Manually runs setup script successfully  
✅ `npm run compile` - TypeScript compilation successful  
✅ Binary installed at: `node_modules/better-sqlite3/build/Release/better_sqlite3.node`

## How It Works Now

1. **During Installation**:
   ```bash
   npm install
   ```
   - Installs dependencies including `better-sqlite3@12.5.0`
   - `postinstall` script runs automatically
   - Detects Electron version (39.2.7 from node_modules)
   - Downloads prebuilt binary for Electron 39
   - Falls back to other versions (37, 36, 33) if needed

2. **Manual Setup** (if needed):
   ```bash
   npm run setup
   ```
   - Runs the same setup process manually
   - Useful if postinstall fails or binaries are deleted

3. **Fallback** (if no prebuilt binaries):
   - Install Visual Studio Build Tools
   - Build from source using `npm rebuild better-sqlite3 --build-from-source`

## Testing the Extension

The extension should now work correctly in Cursor/VSCode:

1. Press **F5** to launch the extension in development mode
2. Open a workspace in the development window
3. Have some conversations with Cursor AI
4. Check `.llm-chat-history/` folder for saved Markdown files

## Prevention for Future

- The setup script tries multiple Electron versions automatically
- If Cursor updates to a newer Electron version, the script will adapt
- Documentation provides clear troubleshooting steps
- Users can run `npm run setup` anytime to re-download binaries

## Technical Details

### Electron to NODE_MODULE_VERSION Mapping

| Electron Version | NODE_MODULE_VERSION | Support Status |
|-----------------|---------------------|----------------|
| 39.x | 136 | ✅ Supported (better-sqlite3@12.5.0) |
| 37.x | 136 | ✅ Supported (better-sqlite3@12.5.0) |
| 36.x | 135 | ✅ Supported |
| 33.x | 130 | ✅ Supported |
| 32.x | 128 | ✅ Supported (older better-sqlite3) |

### Files Modified

- ✏️ `package.json` - Updated better-sqlite3 version and scripts
- ✏️ `QUICK_START.md` - Added troubleshooting section
- ✏️ `README.md` - Added installation notes
- ➕ `setup-sqlite.js` - Created automated setup script
- ➕ `INSTALL_NOTES.md` - Created technical documentation
- ➕ `FIX_SUMMARY.md` - This file

## Date

Fixed: December 23, 2025

---

# Installation Notes

## About better-sqlite3 Setup

This extension uses `better-sqlite3`, a native Node.js module that needs to be compiled specifically for the Electron version used by Cursor/VSCode.

### Automatic Setup

After running `npm install`, the `postinstall` script automatically:
1. Detects the Electron version
2. Downloads the correct prebuilt binary for Electron
3. Tries multiple Electron versions (39, 37, 36, 33) to ensure compatibility

### Manual Setup

If automatic setup fails or you encounter errors like:
- "Could not locate the bindings file"
- "was compiled against a different Node.js version using NODE_MODULE_VERSION XXX"

Run the setup script manually:
```bash
npm run setup
```

### Current Configuration

- **better-sqlite3 version**: 12.5.0
- **Target Electron versions**: 39.x, 37.x, 36.x, 33.x
- **NODE_MODULE_VERSION**: 136 (Electron 37-39)

### Why Multiple Electron Versions?

Different releases of Cursor and VSCode use different Electron versions:
- Cursor typically uses Electron 37-39 (NODE_MODULE_VERSION 136)
- VSCode versions vary by release

Our setup script tries multiple versions to ensure compatibility across different environments.

### Troubleshooting

If prebuilt binaries are not available for your Electron version, you need to build from source:

**Windows:**
1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. Select "Desktop development with C++" workload
3. Run: `npm install -g node-gyp`
4. Run: `npm rebuild better-sqlite3 --build-from-source`

**macOS:**
```bash
xcode-select --install
npm rebuild better-sqlite3 --build-from-source
```

**Linux:**
```bash
sudo apt-get install build-essential
npm rebuild better-sqlite3 --build-from-source
```

## Version History

- **2025-12-23**: Updated to better-sqlite3 v12.5.0 to support Electron 39 (NODE_MODULE_VERSION 136)
- Initial version used better-sqlite3 v11.0.0

---

# 安装和使用指南

## ✅ 安装完成！

项目已成功编译，所有依赖已安装。

## 📖 使用方法

### 方法 1: 开发模式（推荐用于测试）

1. **在 VS Code/Cursor 中打开此项目**
   
2. **按 `F5` 启动扩展开发模式**
   - 这会打开一个新的 VS Code 窗口
   - 扩展会自动在这个窗口中激活

3. **在新窗口中打开一个工作区**
   - 必须打开一个文件夹作为工作区
   - 扩展需要工作区来保存历史文件

4. **使用 Cursor 进行对话**
   - 在 Cursor 的 Composer/Chat 中与 AI 对话
   - 扩展会自动监听并保存对话

5. **查看保存的历史**
- 历史文件保存在: `.llm-chat-history/` 文件夹
   - 文件命名格式: `2025-12-23_10-30Z-conversation-title.md`

### 方法 2: 打包安装

如果要在正常使用中安装扩展：

1. **安装打包工具**
   ```bash
   npm install -g @vscode/vsce
   ```

2. **打包扩展**
   ```bash
   vsce package
   ```
   这会生成 `cursor-chat-history-0.1.0.vsix` 文件

3. **安装 VSIX**
   - 在 VS Code 中: 扩展视图 → 点击 `...` → "从 VSIX 安装..."
   - 选择生成的 `.vsix` 文件

## 🎯 功能特性

### 自动保存
- ✅ 实时监听 Cursor 数据库变化
- ✅ 自动捕获所有对话
- ✅ 包含用户消息、AI 响应和思考过程

### Markdown 格式
- ✅ 清晰的对话结构
- ✅ 时间戳标记
- ✅ 思考过程折叠显示
- ✅ 工具调用结果展示

### 文件管理
- ✅ 按时间戳命名
- ✅ Git 友好格式
- ✅ 自动去重（内容相同不重复保存）

## ⚙️ 配置选项

在 VS Code 设置中搜索 "chatHistory":

```json
{
  // 启用/禁用自动保存
  "chatHistory.autoSave": true,
  
  // 输出目录（相对于工作区根目录）
  "chatHistory.outputDirectory": ".llm-chat-history",
  
  // 使用 UTC 时区
  "chatHistory.useUTC": true
}
```

## 🔧 命令

### Save Chat History Now
- **打开方式**: `Ctrl+Shift+P` / `Cmd+Shift+P`
- **搜索**: "Save Chat History Now"
- **功能**: 立即触发一次历史保存

## 📝 输出示例

保存的 Markdown 文件格式：

```markdown
<!-- Generated by Chat History Extension -->
<!-- Cursor Session abc123 (2025-12-23 10:30Z) -->

# 实现聊天记录导出插件 (2025-12-23 10:30Z)

_**User (2025-12-23 10:30Z)**_

帮我实现一个 Cursor 聊天记录导出插件

---

_**Agent (model claude-4.5-sonnet-thinking, mode Agent)**_

<think><details><summary>Thought Process</summary>
让我分析一下需求...
</details></think>

---

我来帮你实现这个插件...

---
```

## 🐛 故障排除

### 问题: 扩展未激活

**原因**: 没有打开工作区

**解决**: 
- 在 Cursor 中打开一个文件夹（不只是单个文件）
- 扩展需要工作区来保存历史文件

### 问题: 找不到数据库

**原因**: Cursor 未安装或数据库路径不正确

**解决**: 
- 确保已安装 Cursor
- 数据库位置:
  - Windows: `%APPDATA%\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb`
  - macOS: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
  - Linux: `~/.config/Cursor/User/globalStorage/state.vscdb`

### 问题: 没有生成历史文件

**可能原因**:
1. `chatHistory.autoSave` 设置为 `false`
2. Cursor 数据库中没有对话记录
3. 工作区未打开

**解决**:
1. 检查设置: `"chatHistory.autoSave": true`
2. 在 Cursor 中创建一些对话
3. 尝试手动执行 "Save Chat History Now" 命令
4. 查看输出面板的日志（选择"扩展宿主"）

### 问题: 数据库锁定错误

**原因**: 数据库被其他进程占用

**解决**: 
- 扩展使用只读模式，通常不会冲突
- 如果仍有问题，尝试重启 Cursor
- 检查是否有其他进程在访问数据库

## 📊 日志查看

1. 在开发窗口中，打开"输出"面板（`Ctrl+Shift+U`）
2. 从下拉菜单选择"扩展宿主"
3. 查看扩展的日志输出

典型日志:
```
Cursor Chat History Extension activated
Database watcher started
Found 5 composers
Saved: 2025-12-23_10-30Z-conversation-title.md
```

## 🔄 更新代码后

如果修改了扩展代码：

1. **重新编译**:
   ```bash
   npm run compile
   ```

2. **重新加载扩展**:
   - 在开发窗口中按 `Ctrl+R` / `Cmd+R`
   - 或运行命令 "重新加载窗口"

## 🌟 高级用法

### 自定义输出目录

可以为不同项目设置不同的输出目录：

```json
{
  "chatHistory.outputDirectory": "docs/ai-conversations"
}
```

### 禁用自动保存

如果只想手动保存：

```json
{
  "chatHistory.autoSave": false
}
```

然后通过命令手动触发保存。

### Git 集成

建议将历史文件加入 Git:

```bash
# .gitignore 中不要忽略 .llm-chat-history
# 这样可以跟踪 AI 对话历史

git add .llm-chat-history/
git commit -m "Add AI conversation history"
```

## 📚 技术细节

### 数据库读取
- 使用 `better-sqlite3` 只读模式
- WAL 模式确保并发访问
- 自动重试机制

### 文件监听
- 使用 `chokidar` 监听数据库变化
- 2 秒防抖避免频繁写入
- 2 分钟定时同步作为兜底

### 文件命名
- UTC 时间戳确保唯一性
- 标题自动清理特殊字符
- 限制文件名长度（最多 50 字符）

## 🎉 开始使用

现在你可以：

1. **按 F5 启动开发模式**
2. **在新窗口中打开工作区**
3. **开始与 Cursor AI 对话**
4. **查看 `.llm-chat-history/` 文件夹**

祝使用愉快！ 🚀

---

# Quick Start Guide

## 快速开始指南

### 1. 安装依赖

```bash
npm install
```

### 2. 编译项目

```bash
npm run compile
```

### 3. 开发模式

在 VS Code 中按 `F5` 启动扩展开发模式。

### 4. 测试扩展

1. 在开发窗口中打开一个工作区（必须）
2. 在 Cursor 中进行一些对话
3. 检查工作区根目录的 `.llm-chat-history/` 文件夹
4. 你会看到自动生成的 Markdown 文件

### 5. 手动触发保存

- 打开命令面板: `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS)
- 运行命令: `Save Chat History Now`

### 6. 配置扩展

在 VS Code 设置中搜索 "Chat History":

```json
{
  "chatHistory.autoSave": true,
  "chatHistory.outputDirectory": ".llm-chat-history",
  "chatHistory.useUTC": true
}
```

## 项目结构

```
llm_chat_history/
├── src/                            # 源代码目录
│   ├── types.ts                    # 类型定义
│   ├── database-reader.ts          # 数据库读取器
│   ├── conversation-builder.ts     # 对话构建器
│   ├── markdown-generator.ts       # Markdown 生成器
│   ├── history-saver.ts            # 历史保存器
│   ├── database-watcher.ts         # 数据库监听器
│   └── extension.ts                # 扩展入口
├── dist/                           # 编译输出目录
├── package.json                    # 项目配置
├── tsconfig.json                   # TypeScript 配置
├── README.md                       # 项目说明
└── LICENSE                         # 许可证
```

## 故障排除

### 问题：扩展没有启动

- 确保你在 Cursor 中打开了工作区
- 检查数据库文件是否存在

### 问题：没有生成历史文件

- 确认 `chatHistory.autoSave` 设置为 `true`
- 检查 Cursor 是否有对话记录
- 手动运行 "Save Chat History Now" 命令

### 问题：数据库锁定错误

- 关闭 Cursor 后重试
- 扩展使用只读模式，通常不会冲突

### 问题：Could not locate the bindings file (better-sqlite3)

**Windows 用户常见问题**：`better-sqlite3` 需要编译为 Electron 版本。

**解决方案 1（推荐）**：运行设置脚本
```bash
npm run setup
```

此脚本会自动检测 Electron 版本并下载对应的预编译二进制文件。

**解决方案 2**：NODE_MODULE_VERSION 不匹配错误

如果遇到 "was compiled against a different Node.js version" 错误，表示 Cursor 使用的 Electron 版本与已安装的二进制不匹配。

1. 首先尝试更新 `better-sqlite3` 到最新版本：
```bash
npm install better-sqlite3@latest
npm run setup
```

2. 如果仍然失败，手动下载对应 Electron 版本的二进制：
```bash
cd node_modules/better-sqlite3
# Cursor 通常使用 Electron 37-39
npx prebuild-install --runtime electron --target 39.0.0
```

**解决方案 3**：从源码编译（需要 Visual Studio Build Tools）

如果没有预编译二进制可用：
1. 下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. 安装时选择 "Desktop development with C++" 工作负载
3. 运行：
```bash
npm install -g node-gyp
npm rebuild better-sqlite3 --build-from-source
```

## 打包发布

构建 VSIX 包:

```bash
npm install -g @vscode/vsce
vsce package
```

这将生成 `.vsix` 文件，可以手动安装或发布到市场。

## 开发技巧

1. **查看日志**: 在开发窗口中打开"输出"面板，选择"扩展宿主"
2. **调试**: 在源代码中设置断点，使用 F5 启动调试
3. **重新加载**: 修改代码后，在开发窗口中运行"重新加载窗口"命令

## 下一步

- 自定义 Markdown 输出格式
- 添加导出功能
- 集成更多配置选项
- 优化性能和缓存策略

## Markdown 输出优化

### 设计目标

生成的 Markdown 文件优化为直接在各种 Markdown 查看器中阅读，无需额外的工具或转换。

### 格式优化

#### 1. 清晰的层级结构

```markdown
# 对话标题

**创建时间**: 2025-12-23 10:30Z
**消息数量**: 4 条 (用户: 2, 助手: 2)
**会话ID**: `abc-123`

---

## 💬 用户 #1
_2025-12-23 10:30Z_

用户消息内容

---

## 🤖 助手 #1 (claude-4.5-sonnet, Agent)
_2025-12-23 10:31Z_

助手回复内容
```

#### 2. 图标系统

- 💬 用户消息
- 🤖 AI 助手
- 💭 思考过程
- 🔧 工具调用
- 🔍 搜索工具
- 📖 读取文件
- ✏️ 编辑文件
- 💻 终端命令

#### 3. 可折叠区块

使用 `<details>` 标签实现内容折叠：

- **思考过程**：默认折叠，使用 blockquote 提升可读性
- **工具调用参数和结果**：折叠显示，避免干扰主要内容
- **大型 JSON 结果**（>500字符）：嵌套折叠

#### 4. 多语言支持

所有结构化标签自动本地化：
- 中文环境：`用户`、`助手`、`思考过程`、`工具调用`、`参数`、`结果`
- 英文环境：`User`、`Assistant`、`Thinking Process`、`Tool Uses`、`Args`、`Result`

### 兼容性

优化后的格式在以下环境中表现良好：

- ✅ **VS Code Markdown Preview**：完整支持，包括折叠区块
- ✅ **GitHub**：完美渲染，支持 `<details>` 折叠
- ✅ **Obsidian**：全功能支持，适合知识库管理
- ✅ **Typora**：优雅渲染
- ✅ **标准 Markdown 查看器**：基本功能正常，`<details>` 可能显示为普通文本

## 技术架构

```
Cursor Database (SQLite)
         ↓
DatabaseWatcher (监听变化)
         ↓
DatabaseReader (读取数据)
         ↓
ConversationBuilder (构建对话)
         ↓
MarkdownGenerator (生成 Markdown)
    ├── 元数据生成
    ├── 消息格式化
    ├── 思考过程（blockquote）
    ├── 工具调用（折叠）
    └── 多语言本地化
         ↓
HistorySaver (保存文件)
```


# 1. 安装依赖
npm install

# 2. 测试构建
npm run build

# 3. 检查混淆效果
Get-Content dist\extension.js -Head 30

# 4. 打包

## 4.1 打包生产版本
```bash
# 完整打包流程（包含编译、混淆）
npm run package

# 或手动执行
npm run build
vsce package --allow-missing-repository
```

## 4.2 打包测试版本
```bash
# 自动打包测试版（debugMode 默认开启）
npm run package:test
```

测试版特点：
- 版本号自动添加 `-test` 后缀（例如 0.3.0-test）
- `debugMode` 默认为 `true`
- 自动连接到本地服务器 `http://192.168.56.101:9999`
- `cloudSync.enabled` 仍需用户手动启用
- 打包完成后自动恢复原始配置

# 5. 安装测试
# 在 VS Code 中安装并测试所有功能

# 发布
vsce publish --allow-missing-repository


# 6. 确认源码未泄露
Expand-Archive llm-chat-history-0.1.0.vsix -DestinationPath temp -Force
Get-ChildItem temp\extension -Recurse
# 确认只有 dist/ 且代码已混淆



## 相关资源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Better SQLite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [Chokidar 文件监听](https://github.com/paulmillr/chokidar)

