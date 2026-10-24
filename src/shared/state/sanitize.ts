import type { Data, Id } from '../schema'
import { referencedNoteIds } from '../notes'
import { createInitialData, DEFAULT_PROFILE_ID } from './initial'
import { isPrivateSpace, stripPrivate } from './private'

const sameIds = (a: readonly Id[], b: readonly Id[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index])

function repairTree(data: Data, loose: ReadonlySet<Id>): void {
  data.profiles[DEFAULT_PROFILE_ID] ??= { id: DEFAULT_PROFILE_ID, name: 'Default' }
  for (const space of Object.values(data.spaces)) {
    if (!data.profiles[space.profileId]) space.profileId = DEFAULT_PROFILE_ID
  }
  for (const profileId of Object.keys(data.profiles)) data.favorites[profileId] ??= []
  for (const profileId of Object.keys(data.favorites)) {
    if (!data.profiles[profileId]) Reflect.deleteProperty(data.favorites, profileId)
  }
  const spaceOrder = [
    ...new Set([
      ...data.spaceOrder.filter((id) => data.spaces[id]),
      ...Object.keys(data.spaces).filter((id) => !isPrivateSpace(data, id)),
    ]),
  ]
  if (!sameIds(spaceOrder, data.spaceOrder)) data.spaceOrder = spaceOrder

  const claimed = new Set<Id>()
  const keep = (list: Id[]): Id[] =>
    list.filter((id) => {
      if (!data.items[id] || claimed.has(id)) return false
      claimed.add(id)
      return true
    })
  const claimChildren = (list: Id[]): Id[] =>
    list.flatMap((id) => {
      const item = data.items[id]
      if (!item || item.kind === 'tab') return [id]
      const children = claimChildren(keep(item.children))
      if (!sameIds(children, item.children)) item.children = children
      if (item.kind === 'folder') return [id]
      if (item.children.length < 2) {
        claimed.delete(id)
        return item.children
      }
      if (item.sizes.length !== item.children.length) {
        item.sizes = item.children.map(() => 1 / item.children.length)
      }
      return [id]
    })
  const replace = (list: Id[], next: Id[], assign: (next: Id[]) => void) => {
    if (!sameIds(list, next)) assign(next)
  }
  for (const space of Object.values(data.spaces)) {
    replace(space.pinned, keep(space.pinned), (next) => (space.pinned = next))
    replace(space.today, keep(space.today), (next) => (space.today = next))
  }
  for (const [profileId, list] of Object.entries(data.favorites)) {
    replace(list, keep(list), (next) => (data.favorites[profileId] = next))
  }
  for (const space of Object.values(data.spaces)) {
    replace(space.pinned, claimChildren(space.pinned), (next) => (space.pinned = next))
    replace(space.today, claimChildren(space.today), (next) => (space.today = next))
  }
  for (const [profileId, list] of Object.entries(data.favorites)) {
    replace(list, claimChildren(list), (next) => (data.favorites[profileId] = next))
  }
  for (const id of loose) if (data.items[id]?.kind === 'tab') claimed.add(id)

  for (const id of Object.keys(data.items)) {
    if (!claimed.has(id)) Reflect.deleteProperty(data.items, id)
  }

  const notes = referencedNoteIds(data)
  for (const id of Object.keys(data.notes)) {
    if (!notes.has(id)) Reflect.deleteProperty(data.notes, id)
  }
}

function repairWindowSpaces(data: Data, fallbackSpaceId: Id): void {
  const firstSpace = data.spaceOrder[0] ?? fallbackSpaceId
  for (const window of Object.values(data.windows)) {
    if (!data.spaces[window.spaceId]) window.spaceId = firstSpace
    for (const [spaceId, tabId] of Object.entries(window.activeBySpace)) {
      if (!data.spaces[spaceId] || (tabId && data.items[tabId]?.kind !== 'tab')) {
        Reflect.deleteProperty(window.activeBySpace, spaceId)
      }
    }
  }
}

export function sanitize(input: Data, fallbackSpaceId: Id): Data {
  const data = structuredClone(stripPrivate(input))
  if (Object.keys(data.spaces).length === 0) return createInitialData(fallbackSpaceId)
  repairTree(data, new Set())
  for (const window of Object.values(data.windows)) {
    if (window.kind !== 'main') {
      Reflect.deleteProperty(data.windows, window.id)
      continue
    }
    window.peekTabId = null
    window.littleTabId = null
  }
  repairWindowSpaces(data, fallbackSpaceId)
  return data
}

export function repairLive(data: Data): void {
  const fallbackSpaceId = data.spaceOrder[0] ?? Object.keys(data.spaces)[0]
  if (!fallbackSpaceId) return
  const loose = new Set<Id>()
  for (const window of Object.values(data.windows)) {
    if (window.peekTabId) loose.add(window.peekTabId)
    if (window.littleTabId) loose.add(window.littleTabId)
  }
  repairTree(data, loose)
  for (const window of Object.values(data.windows)) {
    if (window.peekTabId && data.items[window.peekTabId]?.kind !== 'tab') window.peekTabId = null
    if (window.littleTabId && data.items[window.littleTabId]?.kind !== 'tab') {
      window.littleTabId = null
    }
  }
  repairWindowSpaces(data, fallbackSpaceId)
}
