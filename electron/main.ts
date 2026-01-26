import { app, BrowserWindow, Tray, nativeImage, ipcMain, Menu } from 'electron'
import * as path from 'path'
import { SocketServer } from './socketServer'
import { SessionManager, Session } from './sessionManager'
import { installHooks, uninstallHooks } from './hookInstaller'
import { focusTerminal } from './terminalFocus'
import { sendNeedsInputNotification, notificationEmitter } from './notifications'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let socketServer: SocketServer | null = null
let sessionManager: SessionManager | null = null

// Get the path to the menubar icon (Template version for auto dark/light mode)
function getTrayIconPath(): string {
  if (!app.isPackaged) {
    // In development, use the assets folder directly
    return path.join(__dirname, '../assets/icons/build/menubar-iconTemplate.png')
  } else {
    // In production, use the extraResources folder
    return path.join(process.resourcesPath, 'menubar-iconTemplate.png')
  }
}

// Create tray icon from file (macOS Template icons auto-adapt to dark/light mode)
function createTrayIcon() {
  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)
  return icon
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 500,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide()
    }
  })
}

function toggleWindow() {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    const trayBounds = tray?.getBounds()
    if (trayBounds) {
      const windowBounds = mainWindow.getBounds()
      const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
      const y = trayBounds.y + trayBounds.height + 4
      mainWindow.setPosition(x, y)
    }
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Reinstall Hooks',
      click: async () => {
        try {
          await installHooks(!app.isPackaged)
          console.log('Hooks reinstalled successfully')
        } catch (err) {
          console.error('Failed to reinstall hooks:', err)
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Nightwatch',
      click: () => {
        app.quit()
      }
    }
  ])
  return contextMenu
}

app.whenReady().then(async () => {
  try {
    // Check notification permissions
    if (process.platform === 'darwin') {
      const { Notification } = await import('electron')
      console.log('Notification support:', Notification.isSupported())
    }

    // Install Claude Code hooks (don't block on failure)
    try {
      await installHooks(!app.isPackaged)
    } catch (e) {
      console.error('Hook installation failed:', e)
    }

    // Create session manager
    sessionManager = new SessionManager()
    sessionManager.on('update', (sessions: Session[]) => {
      // Send update to renderer
      mainWindow?.webContents.send('sessions-updated', sessions)
    })

    // Listen for needs-input events
    sessionManager.on('needs-input', (data: { sessionId: string, sessionName: string, cwd: string }) => {
      console.log('Session needs input:', data)
      sendNeedsInputNotification(data.sessionName, data.sessionId)
    })

    // Handle notification clicks - focus the terminal
    notificationEmitter.on('notification-clicked', async (sessionId: string) => {
      console.log('Notification clicked, focusing session:', sessionId)

      const sessions = sessionManager?.getSessions() || []
      const session = sessions.find(s => s.id === sessionId)

      if (session) {
        const success = await focusTerminal({
          pid: session.pid,
          ppid: session.ppid,
          tty: session.tty
        })
        console.log('Terminal focus result:', success)
      } else {
        console.log('Session not found:', sessionId)
      }
    })

    // Create socket server and connect to session manager
    socketServer = new SocketServer()
    socketServer.on('event', (event) => {
      sessionManager?.handleEvent(event)
    })
    socketServer.start()

    // Create tray icon
    tray = new Tray(createTrayIcon())
    tray.setToolTip('Nightwatch - Claude Session Tracker')
    tray.on('click', toggleWindow)
    tray.on('right-click', () => {
      tray?.popUpContextMenu(createTrayMenu())
    })

    createWindow()
  } catch (e) {
    console.error('App initialization failed:', e)
  }

  // IPC handlers
  ipcMain.handle('get-sessions', () => {
    return sessionManager?.getSessions() || []
  })

  ipcMain.handle('focus-session', async (event, sessionId: string) => {
    try {
      const sessions = sessionManager?.getSessions() || []
      const session = sessions.find(s => s.id === sessionId)

      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      const success = await focusTerminal({
        pid: session.pid,
        ppid: session.ppid,
        tty: session.tty
      })

      return { success }
    } catch (err) {
      console.error('Failed to focus terminal:', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('reinstall-hooks', async () => {
    try {
      await installHooks(!app.isPackaged)
      return { success: true }
    } catch (err) {
      console.error('Hook reinstall failed:', err)
      return { success: false, error: String(err) }
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', async () => {
  // Clean up socket server
  socketServer?.stop()
  sessionManager?.stop()

  // Optionally uninstall hooks on quit (commented out for persistence)
  // await uninstallHooks()
})

app.on('activate', async () => {
  await app.whenReady()
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
