import type { Id, Runtime, WindowData, Data } from './schema'
import { activeTabId, visibleTabIds } from './state/tree'

export function dockedDevtoolsTabId(data: Data, runtime: Runtime, window: WindowData): Id | null {
  if (window.kind !== 'main') return null
  const docked = (id: Id | null) => id !== null && runtime.tabs[id]?.devtools === 'docked'
  const active = activeTabId(data, window)
  if (docked(active)) return active
  return visibleTabIds(data, window).find(docked) ?? null
}

export function canDockDevtools(data: Data, tabId: Id): boolean {
  return Object.values(data.windows).some(
    (window) => window.kind === 'main' && visibleTabIds(data, window).includes(tabId),
  )
}
