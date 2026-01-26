# Nightwatch - Quick Start Guide

## Installation

```bash
# Navigate to the project
cd /Users/alin/work/ai_playground/claude_session_tracker/nightwatch

# Install dependencies
npm install
```

## Development

```bash
# Start development server with hot reload
npm run electron:dev
```

This will:
1. Start Vite dev server on http://localhost:5173
2. Launch Electron app
3. Auto-install hooks to ~/.claude/hooks/nightwatch_hook.py
4. Update ~/.claude/settings.json with hook configuration

## Testing

1. **Start Nightwatch**: Run `npm run electron:dev`
2. **Verify hook installation**:
   ```bash
   ls -la ~/.claude/hooks/nightwatch_hook.py
   cat ~/.claude/settings.json | grep nightwatch
   ```
3. **Start a Claude Code session** in any directory
4. **Check Nightwatch**: Click the moon icon in your menu bar
5. **Verify session appears** in the list with:
   - Directory name (basename)
   - Status indicator (green = active)
   - Start time and duration
   - Click to reveal full path

## Build for Production

```bash
# Build TypeScript + Vite + Electron
npm run build

# Create distributable (DMG for macOS)
npm run electron:build
```

Output: `release/Nightwatch-*.dmg`

## Troubleshooting

### Hook not working?
```bash
# Reinstall manually
python3 ~/.claude/hooks/nightwatch_hook.py < /dev/null  # Test execution
# Or use "Reinstall Hooks" from app menu (right-click icon)
```

### Socket issues?
```bash
# Check socket exists
ls -la /tmp/nightwatch.sock

# Remove stale socket
rm /tmp/nightwatch.sock
# Restart app
```

### Sessions not appearing?
1. Check Electron console for errors (in dev mode)
2. Verify Claude Code is actually running
3. Test hook script directly:
   ```bash
   echo '{"session_id":"test","hook_event_name":"SessionStart","cwd":"/tmp"}' | python3 ~/.claude/hooks/nightwatch_hook.py
   ```

## Project Structure Overview

```
nightwatch/
├── electron/              # Main process (Node.js)
│   ├── main.ts           # App entry, tray, window management
│   ├── socketServer.ts   # Unix socket listener
│   ├── sessionManager.ts # Session state tracking
│   ├── hookInstaller.ts  # Hook installation logic
│   └── preload.ts        # IPC bridge (security)
├── assets/
│   ├── hooks/
│   │   └── nightwatch_hook.py  # Installed to ~/.claude/hooks/
│   └── icons/build/      # Menubar and app icons
├── src/
│   └── renderer/         # UI (React)
│       └── App.tsx       # Session list interface
├── package.json          # Dependencies and scripts
└── README.md             # Full documentation
```

## Next Steps

- Customize UI styling in `src/renderer/App.tsx`
- Add more hook events in `electron/hookInstaller.ts`
- Enhance session details in `electron/sessionManager.ts`
- Create custom app icon to replace placeholder
- Add more menu options in `electron/main.ts`

## Key Files to Modify

- **UI Changes**: `src/renderer/App.tsx`, `src/index.css`
- **Session Logic**: `electron/sessionManager.ts`
- **Hook Events**: `assets/hooks/nightwatch_hook.py`, `electron/hookInstaller.ts`
- **Menu Bar**: `electron/main.ts` (createTrayMenu function)
