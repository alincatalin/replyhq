import { EventEmitter } from 'events'
import * as path from 'path'
import type { HookEvent } from './socketServer'

export interface Session {
  id: string
  cwd: string
  dirName: string
  status: 'active' | 'idle' | 'ended' | 'waiting'
  startTime: number
  lastActivity: number
  lastUserInput?: number
  pid?: number
  ppid?: number
  tty?: string
  waitingTimer?: NodeJS.Timeout
}

const IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes
const ENDED_REMOVAL_DELAY = 3000 // 3 seconds before removal
const WAITING_TIMEOUT = 30 * 1000 // 30 seconds after activity stops

function getDirName(cwd: string): string {
  return path.basename(cwd) || cwd
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map()
  private idleCheckInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    // Check for idle sessions periodically
    this.idleCheckInterval = setInterval(() => this.checkIdleSessions(), 30000)
  }

  handleEvent(event: HookEvent): void {
    const { session_id, cwd, status, pid, ppid, tty } = event

    if (!session_id || !cwd) return

    switch (event.event) {
      case 'SessionStart':
        this.createSession(session_id, cwd, pid, ppid, tty)
        break

      case 'SessionEnd':
        this.endSession(session_id)
        break

      case 'UserPromptSubmit':
        // User provided input - Claude is now working
        this.handleUserInput(session_id, cwd, pid, ppid, tty)
        break

      case 'PreToolUse':
      case 'PostToolUse':
        this.updateActivity(session_id, cwd, pid, ppid, tty)
        break

      case 'Stop':
        // Claude stopped - might be waiting for input
        this.handleStop(session_id)
        break

      default:
        // Update activity for any other event
        if (this.sessions.has(session_id)) {
          this.updateActivity(session_id, cwd, pid, ppid, tty)
        }
    }
  }

  private createSession(id: string, cwd: string, pid?: number, ppid?: number, tty?: string): void {
    if (this.sessions.has(id)) {
      // Session already exists, just update activity
      this.updateActivity(id, cwd, pid, ppid, tty)
      return
    }

    const session: Session = {
      id,
      cwd,
      dirName: getDirName(cwd),
      status: 'active',
      startTime: Date.now(),
      lastActivity: Date.now(),
      pid,
      ppid,
      tty
    }

    this.sessions.set(id, session)
    this.emitUpdate()
  }

  private updateActivity(id: string, cwd: string, pid?: number, ppid?: number, tty?: string): void {
    let session = this.sessions.get(id)

    if (!session) {
      // Session doesn't exist, create it
      this.createSession(id, cwd, pid, ppid, tty)
      return
    }

    // Update session
    session.lastActivity = Date.now()
    session.status = 'active'
    if (pid !== undefined) session.pid = pid
    if (ppid !== undefined) session.ppid = ppid
    if (tty !== undefined) session.tty = tty
    this.emitUpdate()
  }

  private handleUserInput(id: string, cwd: string, pid?: number, ppid?: number, tty?: string): void {
    let session = this.sessions.get(id)

    if (!session) {
      this.createSession(id, cwd, pid, ppid, tty)
      session = this.sessions.get(id)
    }

    if (session) {
      // Clear waiting timer if exists
      if (session.waitingTimer) {
        clearTimeout(session.waitingTimer)
        session.waitingTimer = undefined
      }

      // Update session state
      session.lastUserInput = Date.now()
      session.lastActivity = Date.now()
      session.status = 'active'
      this.emitUpdate()
    }
  }

  private handleStop(id: string): void {
    const session = this.sessions.get(id)
    if (!session || session.status === 'ended') return

    // Clear any existing waiting timer
    if (session.waitingTimer) {
      clearTimeout(session.waitingTimer)
    }

    // Set up waiting timer
    session.waitingTimer = setTimeout(() => {
      const s = this.sessions.get(id)
      if (s && s.status !== 'ended') {
        s.status = 'waiting'
        // Emit event so main process can send notification
        this.emit('needs-input', {
          sessionId: s.id,
          sessionName: s.dirName,
          cwd: s.cwd
        })
        this.emitUpdate()
      }
    }, WAITING_TIMEOUT)

    // Set status to idle immediately
    session.status = 'idle'
    this.emitUpdate()
  }

  private setIdle(id: string): void {
    const session = this.sessions.get(id)
    if (session && session.status !== 'ended') {
      session.status = 'idle'
      this.emitUpdate()
    }
  }

  private endSession(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return

    // Clear waiting timer if exists
    if (session.waitingTimer) {
      clearTimeout(session.waitingTimer)
      session.waitingTimer = undefined
    }

    session.status = 'ended'
    this.emitUpdate()

    // Remove after delay
    setTimeout(() => {
      this.sessions.delete(id)
      this.emitUpdate()
    }, ENDED_REMOVAL_DELAY)
  }

  private checkIdleSessions(): void {
    const now = Date.now()
    let changed = false

    for (const session of this.sessions.values()) {
      if (session.status === 'active' && now - session.lastActivity > IDLE_TIMEOUT) {
        session.status = 'idle'
        changed = true
      }
    }

    if (changed) {
      this.emitUpdate()
    }
  }

  private emitUpdate(): void {
    this.emit('update', this.getSessions())
  }

  getSessions(): Session[] {
    return Array.from(this.sessions.values())
      .map(session => {
        // Remove non-serializable fields before sending to renderer
        const { waitingTimer, ...serializableSession } = session
        return serializableSession as Session
      })
      .sort((a, b) => {
        // Sort by status (active first), then by last activity
        if (a.status !== b.status) {
          if (a.status === 'active') return -1
          if (b.status === 'active') return 1
          if (a.status === 'idle') return -1
          return 1
        }
        return b.lastActivity - a.lastActivity
      })
  }

  stop(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval)
      this.idleCheckInterval = null
    }
  }
}
