# Claude Code Hooks - Complete Guide

This document provides a comprehensive overview of all available Claude Code hooks and how they can be used to extend Nightwatch's functionality.

## Overview

Claude Code provides a hooks system that allows external scripts to be executed in response to specific events during Claude's execution lifecycle. Hooks receive event data via stdin as JSON and can perform any action without blocking Claude Code.

## Hook Installation

Hooks are configured in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/your_hook.py"
          }
        ]
      }
    ]
  }
}
```

## Available Hooks

### 1. SessionStart
**Triggered when**: A new Claude Code session begins (user runs `claude` command)

**Use cases**:
- Track session creation
- Initialize session-specific state
- Send notifications when work begins
- Log session start time and working directory

**Event payload**:
```json
{
  "hook_event_name": "SessionStart",
  "session_id": "abc123...",
  "cwd": "/path/to/project",
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Creates a new session in the tracker with "active" status

**Potential enhancements**:
- Send desktop notification: "Claude session started in [project name]"
- Start time tracking for productivity metrics
- Automatically open relevant project documentation

---

### 2. SessionEnd
**Triggered when**: A Claude Code session terminates (user exits Claude)

**Use cases**:
- Clean up session state
- Calculate session duration
- Send session summary notifications
- Archive session logs

**Event payload**:
```json
{
  "hook_event_name": "SessionEnd",
  "session_id": "abc123...",
  "cwd": "/path/to/project",
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Marks session as "ended" and removes after 3 seconds

**Potential enhancements**:
- **Session Summary**: "Your 2-hour session completed. 47 tools used, 23 files edited."
- **Work Tracking**: Log total session time to time-tracking system
- **Backup Trigger**: Automatically commit changes or create backup

---

### 3. PreToolUse
**Triggered when**: Just BEFORE Claude executes a tool (Edit, Bash, Read, etc.)

**Use cases**:
- Track which tools are being used
- Intercept dangerous operations (write to sensitive files)
- Log tool usage patterns
- Show real-time activity indicators

**Event payload**:
```json
{
  "hook_event_name": "PreToolUse",
  "session_id": "abc123...",
  "cwd": "/path/to/project",
  "tool_name": "Edit",
  "tool_parameters": {
    "file_path": "/path/to/file.js",
    "old_string": "...",
    "new_string": "..."
  },
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Updates session activity timestamp, marks as "active"

**Potential enhancements**:
- **Activity Notifications**: "Claude is editing authentication.js"
- **File Protection**: Warn before editing production config files
- **Usage Analytics**: Track most-used tools (Edit vs Bash vs Read)
- **Smart Notifications**: Only notify for specific tools (e.g., Bash commands)

---

### 4. PostToolUse
**Triggered when**: Immediately AFTER Claude executes a tool

**Use cases**:
- Track tool execution success/failure
- Measure tool execution time (compare with PreToolUse)
- Trigger post-action workflows
- Update UI with results

**Event payload**:
```json
{
  "hook_event_name": "PostToolUse",
  "session_id": "abc123...",
  "cwd": "/path/to/project",
  "tool_name": "Bash",
  "tool_result": {
    "success": true,
    "output": "..."
  },
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Updates session activity timestamp

**Potential enhancements**:
- **Error Notifications**: Alert when Bash commands fail
- **Performance Tracking**: Log slow tool executions
- **CI/CD Integration**: Trigger builds after file edits
- **Auto-save**: Commit changes after significant edits

---

### 5. UserPromptSubmit
**Triggered when**: User sends a message to Claude

**Use cases**:
- Track user interaction frequency
- Log conversation turns
- **IMPORTANT**: Detect when Claude is waiting for user input
- Reset idle timers

**Event payload**:
```json
{
  "hook_event_name": "UserPromptSubmit",
  "session_id": "abc123...",
  "cwd": "/path/to/project",
  "prompt_length": 150,
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Updates session activity timestamp

**Potential enhancements**:
- **Waiting Notification**: "Claude needs your input in [project]" - *This is KEY for your use case!*
- **Interaction Analytics**: Track avg response time between prompts
- **Context Tracking**: Count conversation turns per session
- **Focus Mode**: Prevent interruptions during active work

---

### 6. Stop
**Triggered when**: User cancels Claude's operation (Ctrl+C or stop button)

**Use cases**:
- Mark session as idle
- Log interruption events
- Clean up partial operations
- Track user satisfaction (many stops = frustration?)

**Event payload**:
```json
{
  "hook_event_name": "Stop",
  "session_id": "abc123...",
  "cwd": "/path/to/project",
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Marks session as "idle"

**Potential enhancements**:
- **Idle Detection**: Start idle timer after Stop event
- **Quality Metrics**: Track stop frequency as quality signal
- **Session State**: Differentiate between "stopped" and "waiting for input"

---

### 7. SubagentStart
**Triggered when**: Claude spawns a subagent (using Task tool)

**Use cases**:
- Track nested work complexity
- Monitor agent spawning patterns
- Visualize agent hierarchy
- Detect performance issues (too many subagents)

**Event payload**:
```json
{
  "hook_event_name": "SubagentStart",
  "session_id": "abc123...",
  "parent_session_id": "abc123...",
  "subagent_type": "Explore",
  "subagent_id": "xyz789...",
  "cwd": "/path/to/project",
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Not currently used

**Potential enhancements**:
- **Nested View**: Show subagent hierarchy in UI
- **Complexity Alerts**: "This session has spawned 5 subagents"
- **Performance Tracking**: Measure subagent completion times
- **Resource Monitoring**: Track total agent count across all sessions

---

### 8. SubagentStop
**Triggered when**: A subagent completes its work

**Use cases**:
- Track subagent completion
- Measure subagent duration
- Trigger parent agent notifications
- Update task progress

**Event payload**:
```json
{
  "hook_event_name": "SubagentStop",
  "session_id": "abc123...",
  "subagent_id": "xyz789...",
  "parent_session_id": "abc123...",
  "result": "success",
  "cwd": "/path/to/project",
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Not currently used

**Potential enhancements**:
- **Completion Notifications**: "Background research agent completed"
- **Progress Updates**: Show subagent progress in session view
- **Failure Alerts**: Notify when subagents fail

---

### 9. Error
**Triggered when**: Claude encounters an error during execution

**Use cases**:
- Track error frequency
- Send error alerts
- Log errors for debugging
- Trigger error recovery workflows

**Event payload**:
```json
{
  "hook_event_name": "Error",
  "session_id": "abc123...",
  "error_type": "ToolExecutionError",
  "error_message": "Command failed with exit code 1",
  "cwd": "/path/to/project",
  "timestamp": 1234567890
}
```

**Nightwatch implementation**: Not currently used

**Potential enhancements**:
- **Error Notifications**: "Claude encountered an error in [project]"
- **Error Dashboard**: Show error frequency per session
- **Auto-recovery**: Suggest fixes for common errors

---

## Implementing New Features

### Feature 1: "Needs Input" Notification

**Goal**: Alert user when Claude is waiting for their response

**Implementation**:
1. Track `UserPromptSubmit` events - this means Claude received input and is now working
2. Track `Stop` events or timeout after activity - this means Claude stopped and is waiting
3. When no activity for 30 seconds after Stop, send notification: "Claude needs your input"

**Hook to use**: `UserPromptSubmit` + `Stop` + activity timeout

**Code pattern**:
```typescript
// In sessionManager.ts
private lastUserPrompt: Map<string, number> = new Map()

handleEvent(event: HookEvent) {
  if (event.event === 'UserPromptSubmit') {
    this.lastUserPrompt.set(event.session_id, Date.now())
  }

  if (event.event === 'Stop') {
    // Claude stopped, start waiting timer
    setTimeout(() => {
      if (this.isWaitingForInput(event.session_id)) {
        this.sendNotification(`Claude needs input in ${session.dirName}`)
      }
    }, 30000) // 30 seconds
  }
}
```

---

### Feature 2: Task Completion Notification

**Goal**: Notify when Claude finishes a significant task

**Implementation**:
1. Track `PreToolUse` and `PostToolUse` to measure activity bursts
2. Detect "quiet period" after high activity
3. After 60 seconds of no activity following a busy period, send: "Claude completed tasks in [project]"

**Hook to use**: `PreToolUse`, `PostToolUse`, idle detection

**Code pattern**:
```typescript
private activityBurst: Map<string, number> = new Map()

handleEvent(event: HookEvent) {
  if (event.event === 'PreToolUse' || event.event === 'PostToolUse') {
    const burst = (this.activityBurst.get(event.session_id) || 0) + 1
    this.activityBurst.set(event.session_id, burst)

    // Reset idle timer
    this.resetIdleTimer(event.session_id)
  }
}

onIdleAfterBurst(sessionId: string) {
  const burst = this.activityBurst.get(sessionId) || 0
  if (burst > 10) { // Significant work completed
    this.sendNotification(`Task completed in ${session.dirName}`)
  }
  this.activityBurst.set(sessionId, 0)
}
```

---

### Feature 3: Error Alerts

**Goal**: Get notified when Claude encounters errors

**Implementation**:
1. Subscribe to `Error` hook
2. Send desktop notification with error type
3. Show error badge in Nightwatch UI

**Hook to use**: `Error`

**Code pattern**:
```typescript
handleEvent(event: HookEvent) {
  if (event.event === 'Error') {
    const session = this.sessions.get(event.session_id)
    if (session) {
      session.errorCount = (session.errorCount || 0) + 1
      this.sendNotification(`Error in ${session.dirName}: ${event.error_message}`)
    }
  }
}
```

---

### Feature 4: Tool Usage Analytics

**Goal**: Track which tools Claude uses most frequently

**Implementation**:
1. Track all `PreToolUse` events
2. Maintain counters per tool type
3. Display stats in UI

**Hook to use**: `PreToolUse`

**Code pattern**:
```typescript
interface Session {
  toolUsage: {
    Edit: number
    Bash: number
    Read: number
    Write: number
    // ...
  }
}

handleEvent(event: HookEvent) {
  if (event.event === 'PreToolUse' && event.tool_name) {
    const session = this.sessions.get(event.session_id)
    if (session) {
      session.toolUsage[event.tool_name] =
        (session.toolUsage[event.tool_name] || 0) + 1
    }
  }
}
```

---

## Hook Configuration Patterns

### Simple Hook (No Matcher)
For session-level events that don't need filtering:
```json
{
  "SessionStart": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "python3 ~/.claude/hooks/nightwatch_hook.py"
        }
      ]
    }
  ]
}
```

### Tool Hook with Matcher
For tool-specific events:
```json
{
  "PreToolUse": [
    {
      "matcher": "*",  // All tools
      "hooks": [
        {
          "type": "command",
          "command": "python3 ~/.claude/hooks/nightwatch_hook.py"
        }
      ]
    }
  ]
}
```

### Filtered Tool Hook
For specific tools only:
```json
{
  "PreToolUse": [
    {
      "matcher": "Bash|Edit",  // Only Bash and Edit
      "hooks": [
        {
          "type": "command",
          "command": "python3 ~/.claude/hooks/nightwatch_hook.py"
        }
      ]
    }
  ]
}
```

---

## Best Practices

### 1. Performance
- Keep hook scripts under 50 lines
- Use timeouts on all I/O operations
- Fail silently - never block Claude Code
- Process data asynchronously in the app

### 2. Reliability
- Always handle JSON parse errors
- Don't assume fields exist in payloads
- Log errors to file, not stdout
- Test hooks without the desktop app running

### 3. User Experience
- Batch notifications to avoid spam
- Use priority levels (error > warning > info)
- Make notifications actionable (click to focus)
- Provide opt-out for notification types

### 4. Privacy
- Don't log sensitive data (file contents, prompts)
- Store minimal data (IDs, timestamps, counters)
- Clear old data periodically
- Respect user's privacy preferences

---

## Testing Hooks

### Manual Testing
```bash
# Send test event to your hook
echo '{"hook_event_name":"SessionStart","session_id":"test123","cwd":"/tmp"}' | \
  python3 ~/.claude/hooks/nightwatch_hook.py

# Check if socket receives data
nc -U /tmp/nightwatch.sock
```

### Automated Testing
Create a test harness that simulates hook events:
```python
#!/usr/bin/env python3
import json
import subprocess

test_events = [
    {"hook_event_name": "SessionStart", "session_id": "test1", "cwd": "/tmp"},
    {"hook_event_name": "PreToolUse", "session_id": "test1", "tool_name": "Edit"},
    {"hook_event_name": "SessionEnd", "session_id": "test1"},
]

for event in test_events:
    proc = subprocess.run(
        ['python3', '~/.claude/hooks/nightwatch_hook.py'],
        input=json.dumps(event).encode(),
        capture_output=True
    )
    print(f"Event: {event['hook_event_name']}, Exit: {proc.returncode}")
```

---

## Future Hook Possibilities

Based on Claude Code's development, potential future hooks:

- **TaskStart/TaskEnd**: When user creates/completes a task
- **FileWatch**: When specific files are modified
- **LongRunning**: When operations take > N seconds
- **MemoryWarning**: When context approaches limits
- **CostAlert**: When session costs exceed threshold
- **ModelSwitch**: When Claude switches between models

---

## Resources

- **Claude Code Hooks Docs**: https://docs.anthropic.com/en/docs/claude-code/hooks
- **Settings Guide**: https://www.eesel.ai/blog/settings-json-claude-code
- **Hooks Mastery**: https://github.com/disler/claude-code-hooks-mastery
- **ClawdGotchi Reference**: `/Users/alin/work/ai_playground/claude_session_tracker/clawdgotchi/`

---

## Current Nightwatch Hooks

**Subscribed events**:
- SessionStart
- SessionEnd
- PreToolUse
- PostToolUse
- Stop

**Not currently used** (but available):
- UserPromptSubmit ⭐ **CRITICAL for "needs input" feature**
- SubagentStart
- SubagentStop
- Error

**Recommended additions**:
1. **UserPromptSubmit** - Essential for detecting when Claude is waiting
2. **Error** - Important for user awareness of issues
3. **SubagentStart/Stop** - Useful for complexity tracking
