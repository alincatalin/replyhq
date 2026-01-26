import { Notification } from 'electron'
import { EventEmitter } from 'events'

export interface NotificationOptions {
  title: string
  body: string
  silent?: boolean
  sessionId?: string
}

// Global event emitter for notification clicks
export const notificationEmitter = new EventEmitter()

/**
 * Send a macOS notification
 */
export function sendNotification(options: NotificationOptions): void {
  try {
    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent || false,
      icon: undefined, // Will use app icon
    })

    console.log('Sending notification:', options.title, '-', options.body)

    notification.show()

    // Handle click events
    if (options.sessionId) {
      notification.on('click', () => {
        console.log('Notification clicked for session:', options.sessionId)
        notificationEmitter.emit('notification-clicked', options.sessionId)
      })
    }
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}

/**
 * Send "needs input" notification
 */
export function sendNeedsInputNotification(sessionName: string, sessionId: string): void {
  sendNotification({
    title: '⏸️ Claude Waiting',
    body: `Claude needs your input in ${sessionName}`,
    sessionId
  })
}

/**
 * Send task completion notification
 */
export function sendTaskCompletedNotification(sessionName: string, sessionId: string): void {
  sendNotification({
    title: '✅ Task Completed',
    body: `Claude finished working in ${sessionName}`,
    sessionId
  })
}

/**
 * Send error notification
 */
export function sendErrorNotification(sessionName: string, errorMessage: string, sessionId: string): void {
  sendNotification({
    title: '⚠️ Error',
    body: `Error in ${sessionName}: ${errorMessage}`,
    sessionId
  })
}
