# LLM Chat History

A VS Code extension that automatically saves your LLM chat history to Markdown files. Perfect for tracking AI conversations, building knowledge bases, and maintaining conversation archives.

**Now supports both Cursor IDE and Cline extension!**

## Compatibility

### ✅ Supported Platforms

| Platform | Cursor IDE | Cline Extension |
|----------|------------|-----------------|
| Windows  | ✅ Tested  | ✅ Supported    |
| macOS    | ✅ Supported | ✅ Supported  |
| Linux    | ✅ Supported | ✅ Supported  |

### Supported Chat Sources

- **Cursor IDE**: Reads from Cursor's SQLite database (`state.vscdb`)
- **Cline Extension**: Reads from Cline's JSON task files (`saoudrizwan.claude-dev`)

The extension automatically detects which sources are available and monitors them simultaneously!

## Features

- ✅ **Automatic Monitoring**: Watches both Cursor and Cline for changes
- ✅ **Complete History**: Captures user messages, AI responses, thinking processes, and tool calls
- ✅ **Markdown Format**: Saves conversations in readable, version-control-friendly Markdown
- ✅ **Timestamped Files**: Organizes files by date and conversation title
- ✅ **Git Friendly**: Perfect for tracking AI conversations over time
- ✅ **Multi-language**: UI and exported Markdown support English and Chinese
- ✅ **Workspace Filtering**: Only saves chats related to the current workspace

## Installation

### From VS Code Marketplace

1. Open Cursor IDE or VS Code (with Cline installed)
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "LLM Chat History"
4. Click Install

The extension will automatically configure itself upon installation.

> **Note**: This extension uses `better-sqlite3`, a native module. The installation script automatically handles downloading the correct prebuilt binaries for Electron. If you encounter installation issues, run `npm run setup` manually.

### From VSIX

1. Download the `.vsix` file from releases
2. In VS Code, go to Extensions view
3. Click the `...` menu and select "Install from VSIX..."
4. Select the downloaded file

## Usage

The extension activates automatically when you open a workspace in Cursor.

### Automatic Saving

By default, the extension automatically monitors your LLM chat history and saves it to `.llm-chat-history/history/` in your workspace root.

### Manual Save

You can manually trigger a save by:
1. Opening the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Running the command: "LLMChatHistory: Save Chat History Now"

### Viewing History

The generated Markdown files are optimized for direct viewing:

- **VS Code**: Open `.md` files directly with full Markdown preview support
- **GitHub**: View with rich formatting and collapsible sections
- **Obsidian/Notion**: Import for knowledge management
- **Any Markdown Editor**: Standard Markdown with enhanced readability

## Configuration

Configure the extension in your VS Code settings:

```json
{
  "chatHistory.autoSave": true,
  "chatHistory.outputDirectory": ".llm-chat-history/history",
  "chatHistory.useUTC": true,
  "chatHistory.locale": "auto"
}
```

### Settings

- `chatHistory.autoSave` (default: `true`): Enable automatic saving of chat history
- `chatHistory.outputDirectory` (default: `.llm-chat-history/history`): Directory to save history files
- `chatHistory.useUTC` (default: `true`): Use UTC timezone for timestamps
- `chatHistory.locale` (default: `auto`): Language for UI/Markdown (`auto`, `en`, `zh`)

## Output Format

Conversations are saved as beautifully formatted Markdown files:

```markdown
# Conversation Title

**Created**: 2025-12-23 10:30Z
**Messages**: 4 (User: 2, Assistant: 2)
**Session ID**: `abc-123`

---

## 💬 User #1

_2025-12-23 10:30Z_

User's question here

---

## 🤖 Assistant #1 (claude-4.5-sonnet, Agent)

_2025-12-23 10:31Z_

<details>
<summary><strong>💭 Thinking Process</strong></summary>

> AI's internal thinking process
> appears as a blockquote for easy reading

</details>

AI's response here

**🔧 Tool Uses** (2)

<details>
<summary>🔍 **grep** — Grep for "pattern" in "path" • 5 matches</summary>

**Args**

```json
{
  "pattern": "search term",
  "path": "src/"
}
```

**Result**

```json
{
  "matches": 5
}
```

</details>

---
```

### Key Features

- ✨ **Clear Structure**: Hierarchical headings with emoji indicators
- 📊 **Metadata**: Session info, message counts, timestamps
- 💭 **Collapsible Sections**: Thinking processes and tool results fold away
- 🎨 **Icon System**: Visual indicators for users (💬), assistants (🤖), tools (🔧), etc.
- 📝 **Readable**: Optimized for direct viewing in any Markdown renderer
- 🌐 **Bilingual**: All labels automatically localized to English or Chinese

### File Naming

Files are named with the pattern: `YYYY-MM-DD_HH-MMZ-{title}.md`

Example: `2025-12-23_10-30Z-implementing-chat-history.md`

## System Requirements

### ✅ Tested & Supported
- **OS**: Windows 10/11
- **Application**: Cursor IDE
- **VS Code Version**: 1.93.0 or higher

### ⚠️ Untested (Use at Your Own Risk)
- macOS
- Linux
- Standard VS Code (without Cursor)
- Other AI coding assistants (Cline, Continue, GitHub Copilot Chat, etc.)

### Prerequisites
- Active Cursor installation with chat history
- Workspace folder must be open

## Database Location

The extension reads from Cursor's SQLite database:

- **Windows**: `%APPDATA%\Roaming\Cursor\User\globalStorage\state.vscdb`
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- **Linux**: `~/.config/Cursor/User/globalStorage/state.vscdb`

## Known Issues

- The extension requires a workspace to be open
- Database must be accessible (not locked by another process)
- **Windows**: Native module installation is handled automatically

### NODE_MODULE_VERSION Errors

If you encounter errors like:

```
Error: The module 'better_sqlite3.node' was compiled against a different Node.js version
using NODE_MODULE_VERSION 127. This version requires NODE_MODULE_VERSION 136.
```

**Quick Fix**:

```bash
npm run setup
npm run verify
```

Then restart Cursor/VS Code completely.

**Why does this happen?**
- VS Code/Cursor runs on Electron (which includes its own Node.js version)
- Native modules must be compiled for the specific Electron version
- Your system Node.js version is different from Electron's version

**For detailed explanation and solutions**:
- 📖 See `开发者完全指南.md` - Complete developer guide
- 📖 See `QUICK_FIX.md` - Quick reference
- 🔧 Run `npm run fix` for interactive troubleshooting

## Roadmap

We are continuously improving this extension. Upcoming features include:

### 🚀 Coming Soon
- ☁️ **Cloud Sync**: Sync your chat history across all devices
- 👥 **Team Collaboration**: Share and collaborate on conversations
- 📊 **Advanced Analytics**: Insights and statistics about your AI usage
- 🔍 **Advanced Search**: Full-text search across all conversations
- 🏷️ **Tags & Organization**: Better ways to organize your history
- 📤 **Export Options**: PDF, HTML, and more export formats

## Pricing

### Free Version (Current)
- ✅ Unlimited local chat history saving
- ✅ Markdown export
- ✅ Multi-language support
- ✅ Auto-save functionality

### Pro Version (Coming Soon)
- ☁️ Cloud sync across devices
- 👥 Team collaboration features
- 📊 Advanced analytics
- 🎯 Priority support
- 🔄 Auto-backup

Stay tuned for updates!

## License

This software is proprietary and confidential. Unauthorized copying, distribution, 
modification, or use is strictly prohibited.

**Copyright (c) 2025 ClarkZhang (Solo). All rights reserved.**

## Support

Need help or have feedback?

- 📧 **Email**: 857867503@qq.com
- 🌐 **GitHub**: https://github.com/Clark-zhang
- 💬 **Feedback**: We'd love to hear from you!

---

**Note**: This extension is not officially affiliated with Cursor or Anysphere.


