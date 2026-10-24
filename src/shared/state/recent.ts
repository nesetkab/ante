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
