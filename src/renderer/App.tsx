import { useState, useEffect } from 'react'

interface Session {
  id: string
  cwd: string
  dirName: string
  status: 'active' | 'idle' | 'ended' | 'waiting'
  startTime: number
  lastActivity: number
  pid?: number
  ppid?: number
  tty?: string
}

interface ElectronAPI {
  getSessions: () => Promise<Session[]>
  onSessionsUpdate: (callback: (sessions: Session[]) => void) => () => void
  focusSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>
  reinstallHooks: () => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}

function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ago`
  }
  if (minutes > 0) {
    return `${minutes}m ago`
  }
  return 'just now'
}

function StatusIndicator({ status }: { status: Session['status'] }) {
  const colors = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    ended: 'bg-gray-500',
    waiting: 'bg-orange-500'
  }

  const labels = {
    active: 'Active',
    idle: 'Idle',
    ended: 'Ended',
    waiting: 'Needs Input'
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[status]} ${status === 'waiting' ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-gray-400">{labels[status]}</span>
    </div>
  )
}

function SessionItem({ session, onClick }: { session: Session; onClick: () => void }) {
  const [showFullPath, setShowFullPath] = useState(false)
  const duration = Date.now() - session.startTime

  return (
    <div
      className="px-4 py-3 border-b border-gray-700 hover:bg-gray-700/50 transition-colors cursor-pointer"
      onClick={() => {
        setShowFullPath(!showFullPath)
        onClick()
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white text-sm truncate">
            {session.dirName}
          </div>
          {showFullPath && (
            <div className="text-xs text-gray-400 mt-1 break-all">
              {session.cwd}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>Started {formatTimestamp(session.startTime)}</span>
            <span>•</span>
            <span>Duration: {formatDuration(duration)}</span>
          </div>
        </div>
        <StatusIndicator status={session.status} />
      </div>
    </div>
  )
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!window.electronAPI) {
      setIsLoading(false)
      return
    }

    // Get initial sessions
    window.electronAPI.getSessions().then((initialSessions) => {
      setSessions(initialSessions)
      setIsLoading(false)
    }).catch((err) => {
      console.error('Failed to get sessions:', err)
      setIsLoading(false)
    })

    // Subscribe to session updates
    const unsubscribe = window.electronAPI.onSessionsUpdate((updatedSessions) => {
      setSessions(updatedSessions)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const handleSessionClick = async (sessionId: string) => {
    if (!window.electronAPI) return

    try {
      const result = await window.electronAPI.focusSession(sessionId)
      if (!result.success) {
        console.error('Failed to focus terminal:', result.error)
      }
    } catch (err) {
      console.error('Error focusing session:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="w-full h-full bg-gray-800 rounded-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading sessions...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-700">
        <h1 className="text-lg font-semibold text-white">Nightwatch</h1>
        <p className="text-xs text-gray-400 mt-0.5">Active Claude Code Sessions</p>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="text-4xl mb-3">🌙</div>
            <p className="text-sm text-gray-400 mb-1">No active sessions</p>
            <p className="text-xs text-gray-500">
              Start a Claude Code session to see it here
            </p>
          </div>
        ) : (
          <div>
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                onClick={() => handleSessionClick(session.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-900 border-t border-gray-700 text-center">
        <p className="text-xs text-gray-500">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} tracked
        </p>
      </div>
    </div>
  )
}
