#!/usr/bin/env python3
"""
Nightwatch hook - sends Claude Code session events to the desktop app.
Installed to ~/.claude/hooks/ by the Nightwatch app.
"""

import json
import os
import socket
import sys
import subprocess

SOCKET_PATH = "/tmp/nightwatch.sock"
TIMEOUT_SECONDS = 2


def get_tty():
    """Get the TTY of the current terminal."""
    try:
        return os.ttyname(sys.stdin.fileno())
    except (OSError, AttributeError):
        return None


def get_terminal_pid():
    """Get the PID of the terminal process."""
    try:
        # Get parent process ID (the Claude process)
        ppid = os.getppid()
        # Get the terminal session ID
        result = subprocess.run(
            ['ps', '-o', 'pid,ppid,tty,command', '-p', str(ppid)],
            capture_output=True,
            text=True,
            timeout=1
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                parts = lines[1].split(None, 3)
                return {
                    'pid': ppid,
                    'ppid': int(parts[1]) if len(parts) > 1 else None,
                    'tty': parts[2] if len(parts) > 2 else None
                }
    except (subprocess.TimeoutExpired, ValueError, IndexError):
        pass
    return {'pid': os.getppid(), 'ppid': None, 'tty': None}


def send_to_app(state):
    """Send state to Nightwatch app via Unix socket."""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(TIMEOUT_SECONDS)
        sock.connect(SOCKET_PATH)
        sock.sendall(json.dumps(state).encode() + b'\n')
        sock.close()
        return True
    except (socket.error, OSError):
        # App may not be running - fail silently
        return False


def main():
    try:
        # Read hook event from stdin
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    # Extract key fields from hook payload
    session_id = data.get("session_id", "unknown")
    event = data.get("hook_event_name", "")
    cwd = data.get("cwd", "")
    tool_name = data.get("tool_name")

    # Get process and terminal info
    terminal_info = get_terminal_pid()
    tty = get_tty()

    # Build state object
    state = {
        "session_id": session_id,
        "cwd": cwd,
        "event": event,
        "timestamp": int(os.times().elapsed * 1000),  # milliseconds since process start
        "pid": terminal_info.get('pid'),
        "ppid": terminal_info.get('ppid'),
        "tty": tty or terminal_info.get('tty'),
    }

    # Add event-specific fields
    if event == "SessionStart":
        state["status"] = "started"

    elif event == "SessionEnd":
        state["status"] = "ended"

    elif event == "PreToolUse":
        state["status"] = "active"
        state["tool"] = tool_name

    elif event == "PostToolUse":
        state["status"] = "active"
        state["tool"] = tool_name

    elif event == "UserPromptSubmit":
        state["status"] = "active"
        state["user_input"] = True

    elif event == "Stop":
        state["status"] = "idle"

    else:
        # Unknown event - still send it
        state["status"] = "active"

    # Send to app
    send_to_app(state)

    # Always allow Claude to continue
    sys.exit(0)


if __name__ == "__main__":
    main()
