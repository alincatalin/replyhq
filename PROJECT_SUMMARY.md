# Nightwatch - Project Summary

## Overview

**Nightwatch** is a macOS menu bar application that automatically detects and displays active Claude Code sessions in real-time. Built with Electron, TypeScript, React, and Python, it provides a minimal interface for tracking session status, working directories, and activity.

## Implementation Complete

Total Lines of Code: **~906 lines**

### Components Delivered

#### 1. Electron Main Process (electron/)
- **main.ts** (174 lines): App orchestrator, tray icon, window management, IPC handlers
- **socketServer.ts** (89 lines): Unix domain socket server for hook communication
- **sessionManager.ts** (161 lines): Session state management with idle detection
- **hookInstaller.ts** (188 lines): Automated hook installation to ~/.claude/
- **preload.ts** (19 lines): Secure IPC bridge for renderer process

#### 2. Python Hook Script (assets/hooks/)
- **nightwatch_hook.py** (76 lines): Claude Code hook that captures session events and sends to socket

#### 3. React UI (src/)
- **App.tsx** (199 lines): Minimal session list interface with real-time updates
- **main.tsx** (8 lines): React app entry point
- **index.css** (20 lines): Base styles and Tailwind setup

#### 4. Configuration Files
- **package.json**: Dependencies and build scripts
- **tsconfig.json**: TypeScript configuration for React
- **tsconfig.electron.json**: TypeScript configuration for Electron
- **tsconfig.node.json**: TypeScript configuration for Vite
- **vite.config.ts**: Vite bundler configuration
- **tailwind.config.js**: Tailwind CSS configuration
- **postcss.config.js**: PostCSS configuration

#### 5. Documentation
- **README.md**: Complete documentation with architecture, setup, troubleshooting
- **QUICKSTART.md**: Quick start guide for developers
- **PROJECT_SUMMARY.md**: This file

## Key Features Implemented

### Session Detection
- [x] Hook installation on first launch
- [x] SessionStart event handling
- [x] SessionEnd event handling
- [x] PreToolUse/PostToolUse activity tracking
- [x] Stop event for idle detection
- [x] Unix socket IPC (/tmp/nightwatch.sock)

### Session Management
- [x] Real-time session state tracking
- [x] Automatic idle detection (5 min timeout)
- [x] Session removal on end (3s delay)
- [x] Sorting by status and activity
- [x] Directory name extraction

### User Interface
- [x] Menu bar tray icon integration
- [x] Dropdown window with session list
- [x] Status indicators (active/idle/ended)
- [x] Click to reveal full path
- [x] Session duration display
- [x] Last activity timestamp
- [x] Empty state message
- [x] Session counter in footer

### System Integration
- [x] macOS menu bar integration
- [x] Dark/light mode support (template icons)
- [x] Right-click menu (reinstall hooks, quit)
- [x] Auto-hide on blur
- [x] Window positioning near tray icon

## Technical Architecture

### Communication Flow

```
Claude Code Session
       |
       | (stdin JSON)
       v
nightwatch_hook.py
       |
       | (Unix socket)
       v
socketServer.ts
       |
       | (EventEmitter)
       v
sessionManager.ts
       |
       | (IPC)
       v
React UI (App.tsx)
```

### Data Models

**Session Interface**:
```typescript
{
  id: string              // Unique session identifier
  cwd: string            // Full working directory path
  dirName: string        // Directory basename
  status: 'active' | 'idle' | 'ended'
  startTime: number      // Unix timestamp (ms)
  lastActivity: number   // Unix timestamp (ms)
}
```

**HookEvent Interface**:
```typescript
{
  session_id: string
  cwd: string
  event: string          // Hook event name
  status: string         // Event-derived status
  timestamp?: number
  tool?: string
}
```

## Simplifications from ClawdGotchi

Nightwatch is intentionally simplified compared to ClawdGotchi:

| Feature | ClawdGotchi | Nightwatch |
|---------|-------------|------------|
| Gamification | Yes (health, energy, happiness, discipline) | No |
| Git Analysis | Yes (commits, branches, tests) | No |
| Animations | Yes (walking crab, accessories) | No |
| UI Complexity | High (multi-pet view, stats) | Low (simple list) |
| Session Data | Rich (stats, accessories, repo health) | Minimal (dir, status, time) |
| Lines of Code | ~2000+ | ~906 |

## File Structure

```
nightwatch/
├── electron/
│   ├── main.ts              # 174 lines - Main orchestrator
│   ├── socketServer.ts      # 89 lines - Unix socket IPC
│   ├── sessionManager.ts    # 161 lines - Session state
│   ├── hookInstaller.ts     # 188 lines - Hook management
│   └── preload.ts           # 19 lines - IPC bridge
├── assets/
│   ├── hooks/
│   │   └── nightwatch_hook.py  # 76 lines - Claude hook
│   └── icons/build/
│       ├── menubar-iconTemplate.png      # 16x16
│       ├── menubar-iconTemplate@2x.png   # 32x32
│       └── icon.icns                     # App icon
├── src/
│   ├── renderer/
│   │   └── App.tsx          # 199 lines - Session list UI
│   ├── main.tsx             # 8 lines - React entry
│   ├── index.css            # 20 lines - Base styles
│   └── vite-env.d.ts        # 1 line - Vite types
├── package.json             # Dependencies and scripts
├── tsconfig.json            # React TypeScript config
├── tsconfig.electron.json   # Electron TypeScript config
├── tsconfig.node.json       # Vite TypeScript config
├── vite.config.ts           # Vite bundler config
├── tailwind.config.js       # Tailwind CSS config
├── postcss.config.js        # PostCSS config
├── index.html               # App HTML entry
├── .gitignore               # Git ignore rules
├── README.md                # Full documentation
├── QUICKSTART.md            # Quick start guide
└── PROJECT_SUMMARY.md       # This file
```

## Development Workflow

### Setup
```bash
npm install
```

### Development
```bash
npm run electron:dev
```

### Build
```bash
npm run build
npm run electron:build
```

## Testing Checklist

- [ ] Install dependencies with `npm install`
- [ ] Start app with `npm run electron:dev`
- [ ] Verify tray icon appears in menu bar
- [ ] Click icon to open window
- [ ] Verify hooks installed at `~/.claude/hooks/nightwatch_hook.py`
- [ ] Start a Claude Code session
- [ ] Verify session appears in Nightwatch
- [ ] Check status indicator is green (active)
- [ ] Click session to reveal full path
- [ ] Wait 5 minutes, verify status changes to idle (yellow)
- [ ] End Claude session, verify status changes to ended (gray)
- [ ] Verify ended session auto-removes after 3 seconds
- [ ] Right-click icon, test "Reinstall Hooks"
- [ ] Right-click icon, test "Quit Nightwatch"

## Future Enhancement Ideas

- [ ] Session grouping by project
- [ ] Session history/logging
- [ ] Export session data
- [ ] Keyboard shortcuts
- [ ] Notification on session start/end
- [ ] Dark/light theme toggle
- [ ] Custom icon per project
- [ ] Session duration alerts
- [ ] Integration with other tools
- [ ] Command palette

## Dependencies

### Runtime
- React 18.2.0
- React DOM 18.2.0

### Development
- Electron 28.0.0
- TypeScript 5.3.0
- Vite 5.0.0
- Tailwind CSS 3.4.0
- Electron Builder 24.9.1
- Concurrently 8.2.2
- Wait-on 7.2.0

## License

MIT

## Acknowledgments

Built with inspiration from [ClawdGotchi](https://github.com/stevysmith/clawdgotchi) by Steve Smith, which pioneered the Claude Code hooks integration pattern.
