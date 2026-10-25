import { app, BaseWindow, ipcMain } from 'electron'
import { NOTIFICATION_CLICK, NOTIFICATION_WINDOW_MS } from '@shared/notifications'
import type { Id } from '@shared/schema'
import type { TabManager } from './tabs'

interface NotificationDeps {
  tabs: TabManager
  allowed: (tabId: Id, origin: string) => boolean
  reveal: (tabId: Id) => void
}

export function listenForNotificationClicks({ tabs, allowed, reveal }: NotificationDeps): void {
  let activatedAt = 0
  let used = true
  let waiting: { tabId: Id; at: number } | null = null
  const revealOnce = (tabId: Id) => {
    if (used) return
    used = true
    reveal(tabId)
  }
  app.on('did-become-active', () => {
    activatedAt = Date.now()
    used = false
    if (waiting && activatedAt - waiting.at <= NOTIFICATION_WINDOW_MS) revealOnce(waiting.tabId)
    waiting = null
  })
  ipcMain.on(NOTIFICATION_CLICK, (event) => {
    const frame = event.senderFrame
    if (!frame || frame !== event.sender.mainFrame) return
    const tabId = tabs.tabIdFor(event.sender)
    if (!tabId || !allowed(tabId, frame.origin)) return
    const now = Date.now()
    if (BaseWindow.getFocusedWindow() === null) {
      waiting = { tabId, at: now }
      return
    }
    if (now - activatedAt <= NOTIFICATION_WINDOW_MS) revealOnce(tabId)
  })
}
