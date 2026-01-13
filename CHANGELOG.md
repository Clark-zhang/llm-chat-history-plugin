# Changelog

All notable changes to the "LLM Chat History" extension will be documented in this file.

## [0.5.7] - 2026-01-13
- fix copilot multiple files

## [0.5.6] - 2026-01-13
- fix sub-directory as git repo

## [0.5.5] - 2026-01-12
- Add copilot/kiro support
- UE fix


## [0.5.2/0.5.3/0.5.4] - 2026-01-12

### Changed
- fix sqlite3 compatible
- timestamp with second
- fix manually sync file format with markdown.
- fix refresh & message when no workspace open.

## [0.5.1] - 2026-01-07

### Changed
- Add logic to save no Workspace files.


## [0.5.0] - 2026-01-07

### Added
- **Manual File Sync**: New command to manually sync files to the cloud
  - Select and sync specific markdown files from your local history
  - Support for incremental or full sync options
  - Parse sessions from markdown files and sync to cloud
  - Enhanced CloudSyncManager with file selection capabilities

### Changed
- Improved cloud sync functionality with better file handling
- Enhanced markdown parser for better session extraction

## [0.4.0] - 2026-01-06

### Added
- **GitHub Integration**: Link AI conversations with Git commits
  - Auto-link: Conversations are automatically associated with GitHub commits
  - Commit message enhancement: Git commits can include LLM Chat History dashboard links (🤖 AI: URL)
  - Git Hook: Installs `prepare-commit-msg` hook to append conversation URLs to commit messages
  - View conversation context directly from GitHub/GitLab commit pages
- **Token & Cost Tracking**: Display token usage and cost estimation in exported markdown
  - Shows input/output token counts for each conversation
  - Displays estimated costs for Cline conversations

### Changed
- Enhanced telemetry request handling with token-based authentication
- Improved session management for Git commit linking

## [0.3.7] - 2026-01-02

### Changed
- Refactored telemetry request handling to improve token management
- Added token handling for telemetry requests

## [0.3.6] - 2025-12-30

### Fixed
- Fixed compatibility issues on macOS
- Fixed Ubuntu VS Code support

### Changed
- Added debug information for troubleshooting
- Package optimizations

## [0.3.2] - 2025-12-26

### Changed
- Changed default output directory to `.llm-chat-history/history`
- Updated documentation

## [0.3.1] - 2025-12-26

### Added
- Cloud sync feature with login/logout support
- JWT token authentication with 15-day validity and sliding window
- Workspace-level chat history management
- Kilo Code AI assistant support improvements

### Changed
- Updated backend URL configuration
- Removed deprecated Codex and CodeGeex telemetry

## [0.2.7] - 2025-12-24

### Fixed
- Verified and fixed compatibility for both VS Code and Cursor IDE

## [0.2.0] - 2025-12-24

### Added
- Cline AI assistant support
- Blackbox AI assistant support
- Kilo Code AI assistant support
- SEO optimizations for extension marketplace

### Changed
- Improved build process

## [0.1.2] - 2025-12-23

### Fixed
- Fixed NODE_MODULE_VERSION error by including node_modules in vsix package
- Fixed Electron version to 37.0.0 for MODULE_VERSION 136 compatibility

## [0.1.1] - 2025-12-23

### Added
- Initial release
- Cursor IDE chat history export support
- Automatic markdown file generation
- Configurable output directory
- UTC/local timezone support
- Multi-language support (English/Chinese)

