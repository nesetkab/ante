import type { AppState, Id, SleepAfter } from './schema'
import { getTab, sectionOf, visibleTabIds } from './state/tree'

export const sleepThresholds: Record<SleepAfter, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  never: 0,
}

export function tabsInUse(state: AppState): Set<Id> {
  const keep = new Set<Id>()
  for (const window of Object.values(state.data.windows)) {
    for (const id of visibleTabIds(state.data, window)) keep.add(id)
    for (const id of Object.values(window.activeBySpace)) if (id) keep.add(id)
    if (window.peekTabId) keep.add(window.peekTabId)
    if (window.littleTabId) keep.add(window.littleTabId)
  }
  return keep
}

export function sleepyTabs(state: AppState, now: number, thresholdMs: number): Id[] {
  if (thresholdMs <= 0) return []
  const keep = tabsInUse(state)
  const cutoff = now - thresholdMs
  return Object.entries(state.runtime.tabs)
    .filter(([id, runtime]) => {
      const tab = getTab(state.data, id)
      if (!tab || keep.has(id) || tab.lastActiveAt >= cutoff) return false
      if (sectionOf(state.data, id) !== 'today') return false
      const busy = [
        runtime.audible,
        runtime.loading,
        runtime.media?.playing === true,
        runtime.media?.pip === true,
        runtime.devtools !== null,
        runtime.prompt !== null,
        runtime.capturing,
      ]
      return !busy.includes(true)
    })
    .map(([id]) => id)
}
