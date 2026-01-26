import { contextBridge, ipcRenderer } from 'electron'

export interface Session {
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

contextBridge.exposeInMainWorld('electronAPI', {
  getSessions: () => ipcRenderer.invoke('get-sessions') as Promise<Session[]>,
  onSessionsUpdate: (callback: (sessions: Session[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessions: Session[]) => callback(sessions)
    ipcRenderer.on('sessions-updated', handler)
    // Return cleanup function
    return () => ipcRenderer.removeListener('sessions-updated', handler)
  },
  focusSession: (sessionId: string) => ipcRenderer.invoke('focus-session', sessionId),
  reinstallHooks: () => ipcRenderer.invoke('reinstall-hooks')
})
