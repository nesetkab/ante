import type { Container, Data, Id } from '../schema'
import { canPlace } from './reducer'
import { locate, rootOf, sameContainer } from './tree'

export interface Placement {
  to: Container
  index: number
}

export type RowZone = 'before' | 'after' | 'into'

export function isNoopMove(data: Data, id: Id, placement: Placement): boolean {
  const from = locate(data, id)
  if (!from || !sameContainer(from.container, placement.to)) return false
  return placement.index === from.index || placement.index === from.index + 1
}

export function canDrop(data: Data, id: Id, placement: Placement): boolean {
  const item = data.items[id]
  if (!item) return false
  return canPlace(data, item, placement.to) && !isNoopMove(data, id, placement)
}

function placementAfter(data: Data, targetId: Id, outdent: number): Placement | null {
  let location = locate(data, targetId)
  let levels = outdent
  while (location && levels > 0) {
    const { container, index } = location
    if (container.type !== 'folder') break
    const folder = data.items[container.id]
    if (folder?.kind !== 'folder' || index !== folder.children.length - 1) break
    location = locate(data, container.id)
    levels -= 1
  }
  return location ? { to: location.container, index: location.index + 1 } : null
}

export function rowPlacement(
  data: Data,
  targetId: Id,
  zone: RowZone,
  outdent = 0,
): Placement | null {
  const item = data.items[targetId]
  if (!item) return null
  if (zone === 'into') {
    if (item.kind !== 'folder') return null
    return { to: { type: 'folder', id: item.id }, index: item.children.length }
  }
  if (zone === 'after') {
    if (item.kind === 'folder' && item.open && item.children.length > 0)
      return { to: { type: 'folder', id: item.id }, index: 0 }
    return placementAfter(data, targetId, outdent)
  }
  const location = locate(data, targetId)
  return location ? { to: location.container, index: location.index } : null
}

export function spacePlacement(data: Data, id: Id, spaceId: Id): Placement | null {
  if (!data.spaces[spaceId] || !data.items[id]) return null
  const root = rootOf(data, id)
  const type = root?.section === 'today' || root === null ? 'today' : 'pinned'
  if (root?.spaceId === spaceId && root.section === type) return null
  const placement: Placement = { to: { type, spaceId }, index: 0 }
  return canDrop(data, id, placement) ? placement : null
}

export function spaceMoveIndex(order: readonly Id[], id: Id, beforeIndex: number): number | null {
  const from = order.indexOf(id)
  if (from < 0) return null
  const index = beforeIndex > from ? beforeIndex - 1 : beforeIndex
  return index === from ? null : index
}
