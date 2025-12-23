# LLM Chat History

A VS Code extension that automatically saves your LLM chat history to Markdown files. Perfect for tracking AI conversations, building knowledge bases, and maintaining conversation archives.

> ⚠️ **IMPORTANT COMPATIBILITY NOTICE**
> 
> **Currently Tested Environment:**
> - ✅ **Platform**: Windows 10/11
> - ✅ **Application**: Cursor IDE (specific version tested)
> - ❌ **NOT tested on**: macOS, Linux, standard VS Code, other Cursor versions
> 
> **This is a beta version.** The extension is specifically designed for Cursor IDE and may not work with:
> - Standard VS Code
> - Other AI coding assistants (Cline, Continue, etc.)
> - macOS or Linux systems (untested)
> 
> Please verify compatibility before installing. We are actively working on broader support.

## Features

- ✅ **Automatic Monitoring**: Watches Cursor's database for changes
- ✅ **Complete History**: Captures user messages, AI responses, and thinking processes
- ✅ **Markdown Format**: Saves conversations in readable, version-control-friendly Markdown
- ✅ **Timestamped Files**: Organizes files by date and conversation title
- ✅ **Git Friendly**: Perfect for tracking AI conversations over time
- ✅ **Multi-language**: UI and exported Markdown support English and Chinese

## Installation

### ⚠️ Before Installing

**Please read the compatibility notice at the top of this page!**

This extension is currently in **beta** and only tested on:
- ✅ Windows 10/11 + Cursor IDE

If you're using a different setup, it may not work correctly.

### From VS Code Marketplace

1. **Verify** you're using Cursor IDE on Windows
2. Open Cursor
3. Go to Extensions (Ctrl+Shift+X)
4. Search for "LLM Chat History"
5. Click Install

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


