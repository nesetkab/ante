import { join } from 'node:path'
import { ipcMain, type Session, type WebContents } from 'electron'
import { SWIPE_CHANNEL } from '@shared/swipe'
import type { TabManager } from './tabs'

const swipePreloadPath = join(import.meta.dirname, '../preload/swipe.cjs')

export function enableSwipes(session: Session): void {
  session.registerPreloadScript({ type: 'frame', filePath: swipePreloadPath })
}

const COOLDOWN_MS = 800

export function listenForSwipes(tabs: TabManager): void {
  const lastSwipe = new WeakMap<WebContents, number>()
  ipcMain.on(SWIPE_CHANNEL, (event, direction: unknown) => {
    const contents = event.sender
    if (event.senderFrame !== contents.mainFrame || !tabs.tabIdFor(contents)) return
    const now = Date.now()
    if (now - (lastSwipe.get(contents) ?? 0) < COOLDOWN_MS) return
    lastSwipe.set(contents, now)
    const history = contents.navigationHistory
    if (direction === 'back' && history.canGoBack()) history.goBack()
    else if (direction === 'forward' && history.canGoForward()) history.goForward()
  })
}
