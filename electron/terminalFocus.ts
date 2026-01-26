import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface TerminalInfo {
  pid?: number
  ppid?: number
  tty?: string
}

/**
 * Focus the terminal window for a given session
 * Uses multiple strategies to find and activate the correct terminal
 */
export async function focusTerminal(terminalInfo: TerminalInfo): Promise<boolean> {
  const { pid, ppid, tty } = terminalInfo

  console.log('Focusing terminal with info:', { pid, ppid, tty })

  try {
    // Strategy 1: Find terminal app by process tree (most reliable)
    if (pid) {
      const terminalApp = await findTerminalAppByPid(pid)
      if (terminalApp) {
        console.log('Found terminal app:', terminalApp)
        const success = await activateApp(terminalApp)
        if (success) return true
      }
    }

    // Strategy 2: Find by parent PID
    if (ppid) {
      const terminalApp = await findTerminalAppByPid(ppid)
      if (terminalApp) {
        console.log('Found terminal app via ppid:', terminalApp)
        const success = await activateApp(terminalApp)
        if (success) return true
      }
    }

    // Strategy 3: Find by TTY
    if (tty) {
      const terminalApp = await findTerminalAppByTty(tty)
      if (terminalApp) {
        console.log('Found terminal app via TTY:', terminalApp)
        const success = await activateApp(terminalApp)
        if (success) return true
      }
    }

    // Strategy 4: Fallback - activate any running terminal
    console.log('Falling back to activating any running terminal')
    return await activateAnyTerminal()
  } catch (error) {
    console.error('Error focusing terminal:', error)
    return false
  }
}

/**
 * Find which terminal app owns a given PID by traversing process tree
 */
async function findTerminalAppByPid(pid: number): Promise<string | null> {
  try {
    // Get the full process tree for this PID
    const { stdout } = await execAsync(`ps -o pid,ppid,comm -p ${pid}`)
    const lines = stdout.trim().split('\n')

    if (lines.length < 2) return null

    // Parse the process info
    const parts = lines[1].trim().split(/\s+/)
    if (parts.length < 3) return null

    const currentPid = parseInt(parts[0])
    const parentPid = parseInt(parts[1])
    const command = parts.slice(2).join(' ')

    // Check if this process is a terminal
    const terminalApp = getTerminalAppFromCommand(command)
    if (terminalApp) {
      return terminalApp
    }

    // Recursively check parent process
    if (parentPid > 1) {
      return await findTerminalAppByPid(parentPid)
    }

    return null
  } catch (error) {
    console.error('Error finding terminal by PID:', error)
    return null
  }
}

/**
 * Find terminal app by TTY device
 */
async function findTerminalAppByTty(tty: string): Promise<string | null> {
  try {
    // Clean up TTY path (remove /dev/ prefix if present)
    const ttyName = tty.replace('/dev/', '')

    // Get all processes on this TTY
    const { stdout } = await execAsync(`ps -t ${ttyName} -o comm`)
    const lines = stdout.trim().split('\n').slice(1) // Skip header

    // Check each process
    for (const line of lines) {
      const terminalApp = getTerminalAppFromCommand(line.trim())
      if (terminalApp) {
        return terminalApp
      }
    }

    return null
  } catch (error) {
    console.error('Error finding terminal by TTY:', error)
    return null
  }
}

/**
 * Extract terminal app name from command string
 */
function getTerminalAppFromCommand(command: string): string | null {
  const terminalApps = [
    { pattern: /ghostty/i, name: 'Ghostty' },
    { pattern: /iTerm/i, name: 'iTerm' },
    { pattern: /Terminal\.app/i, name: 'Terminal' },
    { pattern: /alacritty/i, name: 'Alacritty' },
    { pattern: /kitty/i, name: 'kitty' },
    { pattern: /warp/i, name: 'Warp' },
    { pattern: /hyper/i, name: 'Hyper' },
    { pattern: /rio/i, name: 'Rio' },
    { pattern: /wezterm/i, name: 'WezTerm' },
    { pattern: /tabby/i, name: 'Tabby' },
  ]

  for (const { pattern, name } of terminalApps) {
    if (pattern.test(command)) {
      return name
    }
  }

  return null
}

/**
 * Activate a specific app by name
 */
async function activateApp(appName: string): Promise<boolean> {
  try {
    // First check if app is running
    const { stdout: isRunning } = await execAsync(
      `osascript -e 'tell application "System Events" to (name of processes) contains "${appName}"'`
    )

    if (isRunning.trim() !== 'true') {
      console.log(`App ${appName} is not running`)
      return false
    }

    // Activate the app (bring all windows to front)
    await execAsync(`osascript -e 'tell application "${appName}" to activate'`)

    console.log(`Successfully activated ${appName}`)
    return true
  } catch (error) {
    console.error(`Error activating ${appName}:`, error)
    return false
  }
}

/**
 * Fallback: activate any running terminal app
 */
async function activateAnyTerminal(): Promise<boolean> {
  const apps = [
    'Ghostty',
    'iTerm',
    'Terminal',
    'Alacritty',
    'kitty',
    'Warp',
    'Hyper',
    'Rio',
    'WezTerm',
    'Tabby'
  ]

  for (const app of apps) {
    try {
      const success = await activateApp(app)
      if (success) return true
    } catch {
      continue
    }
  }

  console.log('Could not find any running terminal app')
  return false
}
