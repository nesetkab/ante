import { app, BaseWindow, ipcMain } from 'electron'
import { NOTIFICATION_CLICK, NOTIFICATION_WINDOW_MS } from '@shared/notifications'
import type { Id } from '@shared/schema'
import type { TabManager } from './tabs'

export function listenForNotificationClicks(tabs: TabManager, reveal: (tabId: Id) => void): void {
  let activatedAt = 0
  let waiting: { tabId: Id; at: number } | null = null
  const activated = () => {
    activatedAt = Date.now()
    if (waiting && activatedAt - waiting.at <= NOTIFICATION_WINDOW_MS) reveal(waiting.tabId)
    waiting = null
  }
  app.on('did-become-active', activated)
  app.on('browser-window-focus', activated)
  ipcMain.on(NOTIFICATION_CLICK, (event) => {
    if (event.senderFrame !== event.sender.mainFrame) return
    const tabId = tabs.tabIdFor(event.sender)
    if (!tabId) return
    const now = Date.now()
    if (BaseWindow.getFocusedWindow() === null) {
      waiting = { tabId, at: now }
      return
    }
    if (now - activatedAt <= NOTIFICATION_WINDOW_MS) reveal(tabId)
  })
}
