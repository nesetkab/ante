import type { Data, Id } from '../schema'
import { getTab, spaceTabOrder } from './tree'

export function recentTab(data: Data, spaceId: Id, currentId: Id | null): Id | null {
  let best: { id: Id; at: number } | null = null
  for (const id of spaceTabOrder(data, spaceId)) {
    const tab = getTab(data, id)
    if (!tab || id === currentId || tab.lastActiveAt === 0) continue
    if (!best || tab.lastActiveAt > best.at) best = { id, at: tab.lastActiveAt }
  }
  return best?.id ?? null
}

export const SWITCHER_LIMIT = 12

export function switcherTabs(data: Data, spaceId: Id, currentId: Id | null): Id[] {
  const others = spaceTabOrder(data, spaceId)
    .flatMap((id) => {
      const tab = getTab(data, id)
      return tab && id !== currentId ? [{ id, at: tab.lastActiveAt }] : []
    })
    .sort((a, b) => b.at - a.at)
    .map((entry) => entry.id)
  return [...(currentId ? [currentId] : []), ...others].slice(0, SWITCHER_LIMIT)
}

export function stepSwitcher(index: number, count: number, delta: 1 | -1): number {
  return count === 0 ? 0 : (index + delta + count) % count
}
