import type { Id } from '@shared/schema'
import { archiveThresholds } from '@shared/state/initial'
import { visibleTabIds } from '@shared/state/tree'
import type { Store } from './store'

const SWEEP_INTERVAL_MS = 10 * 60 * 1000

export function sweepArchive(store: Store, now = Date.now()): void {
  const { data, runtime } = store.state
  const thresholdMs = archiveThresholds[data.settings.archiveAfter]
  if (thresholdMs <= 0) return
  const keep = new Set<Id>()
  for (const window of Object.values(data.windows)) {
    for (const id of visibleTabIds(data, window)) keep.add(id)
    for (const id of Object.values(window.activeBySpace)) if (id) keep.add(id)
  }
  for (const [id, tab] of Object.entries(runtime.tabs)) if (tab.audible) keep.add(id)
  store.dispatch({ type: 'archive/sweep', now, thresholdMs, keep: [...keep] })
}

export function startArchiveSweeper(store: Store): () => void {
  sweepArchive(store)
  const timer = setInterval(() => sweepArchive(store), SWEEP_INTERVAL_MS)
  return () => clearInterval(timer)
}
