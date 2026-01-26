# "Needs Input" Notification Feature

## Overview

Nightwatch now detects when Claude Code is waiting for your input and sends you a macOS notification after 30 seconds of inactivity.

## How It Works

### Detection Logic

1. **User Submits Prompt** → `UserPromptSubmit` hook fires
   - Session marked as "active"
   - Claude is now working on your request
   - Any waiting timers are cleared

2. **Claude Stops Working** → `Stop` hook fires
   - Session marked as "idle" immediately
   - 30-second timer starts

3. **30 Seconds Pass** → Timer expires
   - If no activity occurred during those 30 seconds
   - Session marked as "waiting"
   - Notification sent: "⏸️ Claude Waiting - Claude needs your input in [project name]"

4. **User Provides Input** → Cycle repeats
   - When you send another prompt, status returns to "active"
   - Timer is cleared

### Status States

- **🟢 Active** - Claude is actively working (using tools, processing)
- **🟡 Idle** - Claude stopped but may resume soon (< 30 seconds)
- **🟠 Needs Input** - Claude waiting for your response (> 30 seconds) - *Pulsing indicator*
- **⚫ Ended** - Session terminated

## Visual Indicators

### In Nightwatch UI

- **Active**: Green dot, "Active" label
- **Idle**: Yellow dot, "Idle" label
- **Waiting**: Orange pulsing dot, "Needs Input" label ⭐
- **Ended**: Gray dot, "Ended" label

### macOS Notification

When Claude needs input:
```
⏸️ Claude Waiting
Claude needs your input in my-project
```

## Testing the Feature

### Test Scenario 1: Basic Wait Detection

1. Start Nightwatch: `npm run electron:dev`
2. Open a Claude Code session
3. Send a prompt: "What files are in this directory?"
4. Wait for Claude to respond
5. **Do nothing for 30+ seconds**
6. **Expected**:
   - Notification appears: "Claude needs your input in [project]"
   - Session status changes to "Needs Input" (orange, pulsing)

### Test Scenario 2: Quick Response (No Notification)

1. Start Claude session
2. Send a prompt
3. Wait 10 seconds
4. Send another prompt
5. **Expected**: No notification (timer was cleared)

### Test Scenario 3: Cancel Operation

1. Send a long-running prompt
2. Press Ctrl+C to cancel
3. Wait 30+ seconds
4. **Expected**: Notification sent (Stop event triggers waiting timer)

### Test Scenario 4: Resume After Waiting

1. Trigger waiting notification (wait 30+ seconds)
2. Send a new prompt
3. **Expected**:
   - Status immediately returns to "Active"
   - Orange pulsing stops
   - Timer is cleared

## Configuration

### Adjust Waiting Timeout

In `nightwatch/electron/sessionManager.ts`:

```typescript
const WAITING_TIMEOUT = 30 * 1000 // 30 seconds (default)
```

Change to:
- `10 * 1000` for 10 seconds (more aggressive)
- `60 * 1000` for 60 seconds (more patient)
- `2 * 60 * 1000` for 2 minutes (very patient)

### Disable Notifications

If you want to track waiting state but disable notifications:

In `nightwatch/electron/main.ts`, comment out:

```typescript
// sessionManager.on('needs-input', (data) => {
//   sendNeedsInputNotification(data.sessionName, data.sessionId)
// })
```

## Implementation Details

### Files Modified

1. **`hookInstaller.ts`**: Added `UserPromptSubmit` to hook events
2. **`nightwatch_hook.py`**: Handle UserPromptSubmit event
3. **`sessionManager.ts`**:
   - Added waiting state tracking
   - Added timer-based detection
   - Emit 'needs-input' event
4. **`notifications.ts`**: Created notification utility
5. **`main.ts`**: Listen for needs-input events and send notifications
6. **`preload.ts`**: Updated Session interface
7. **`App.tsx`**: Added "waiting" status indicator with pulsing animation

### Hook Events Used

- **UserPromptSubmit**: User sent a message to Claude
- **Stop**: Claude stopped processing (user cancelled or finished)
- **PreToolUse/PostToolUse**: Claude is actively working

### State Machine

```
SessionStart → Active
              ↓
UserPromptSubmit → Active (reset timer)
              ↓
PreToolUse → Active (reset timer)
              ↓
PostToolUse → Active (reset timer)
              ↓
Stop → Idle (start 30s timer)
              ↓
        [30 seconds pass]
              ↓
          Waiting (send notification)
              ↓
UserPromptSubmit → Active (clear timer, repeat cycle)
```

## Troubleshooting

### Notification Not Appearing

1. **Check macOS Permissions**:
   - System Settings → Notifications → Nightwatch
   - Ensure notifications are enabled

2. **Check Console**:
   - Open Nightwatch
   - Right-click menu bar icon → "Quit"
   - Run with console: `npm run electron:dev`
   - Look for: "Notification sent" or error messages

3. **Verify Hook Installation**:
   ```bash
   cat ~/.claude/settings.json | grep UserPromptSubmit
   ```
   Should show hook configuration

### Status Not Changing

1. **Check Session Manager**:
   - Open dev console in Nightwatch
   - Sessions should update in real-time

2. **Verify Socket Connection**:
   ```bash
   ls -la /tmp/nightwatch.sock
   ```
   Should exist and be writable

### Timer Not Triggering

1. **Check Timeout Value**: May be set too high
2. **Verify Stop Events**: Hook may not be receiving Stop events
3. **Session State**: Ensure session isn't in "ended" state

## Future Enhancements

### 1. Configurable Timeout

Add settings UI to adjust waiting timeout per user preference.

### 2. Different Notification Tones

- Gentle notification for first wait
- More urgent for multiple ignored waits

### 3. Smart Detection

- Don't notify if user is actively typing in terminal
- Detect when user switches away from terminal app

### 4. Notification Actions

Click notification to:
- Focus terminal window automatically
- Open Nightwatch menu bar
- Dismiss and snooze for 5 minutes

### 5. Do Not Disturb Integration

Respect macOS Focus modes and quiet hours.

### 6. Multiple Session Handling

If multiple sessions waiting, batch notifications:
"Claude needs input in 3 projects"

## Related Documentation

- **HOOKS_GUIDE.md**: Complete guide to all available hooks
- **README.md**: General Nightwatch documentation
- **QUICKSTART.md**: Quick start guide

## Technical Notes

### Why 30 Seconds?

- Too short (< 15s): False positives when Claude is thinking
- Too long (> 60s): User already noticed and frustrated
- 30 seconds: Good balance for most workflows

### Why Not Use Idle Timeout?

The existing idle timeout (5 minutes) is for long-term inactivity. The waiting state is for immediate "needs attention" alerts.

### Performance Impact

- Single timer per session (low memory)
- No polling (event-driven)
- Notifications are native macOS (no performance impact)

## Debugging Commands

### Test Notification Manually

```bash
# In nightwatch directory
node -e "
const { Notification } = require('electron');
const notif = new Notification({
  title: '⏸️ Claude Waiting',
  body: 'Test notification'
});
notif.show();
"
```

### Monitor Hook Events

```bash
# Watch socket for events
while true; do
  nc -U /tmp/nightwatch.sock
done
```

### Check Timer State

In Electron dev console:
```javascript
// Access session manager state (add to window for debugging)
console.log(sessionManager.getSessions())
```
