import type { Data, Id } from '../schema'
import { createInitialData, DEFAULT_PROFILE_ID } from './initial'

export function sanitize(input: Data, fallbackSpaceId: Id): Data {
  const data = structuredClone(input)
  if (Object.keys(data.spaces).length === 0) return createInitialData(fallbackSpaceId)
  data.profiles[DEFAULT_PROFILE_ID] ??= { id: DEFAULT_PROFILE_ID, name: 'Default' }
  for (const space of Object.values(data.spaces)) {
    if (!data.profiles[space.profileId]) space.profileId = DEFAULT_PROFILE_ID
  }
  for (const profileId of Object.keys(data.profiles)) data.favorites[profileId] ??= []
  for (const profileId of Object.keys(data.favorites)) {
    if (!data.profiles[profileId]) Reflect.deleteProperty(data.favorites, profileId)
  }
  data.spaceOrder = [
    ...new Set([...data.spaceOrder.filter((id) => data.spaces[id]), ...Object.keys(data.spaces)]),
  ]

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
      item.children = claimChildren(keep(item.children))
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
  for (const space of Object.values(data.spaces)) {
    space.pinned = keep(space.pinned)
    space.today = keep(space.today)
  }
  for (const profileId of Object.keys(data.favorites)) {
    data.favorites[profileId] = keep(data.favorites[profileId] ?? [])
  }
  for (const space of Object.values(data.spaces)) {
    space.pinned = claimChildren(space.pinned)
    space.today = claimChildren(space.today)
  }
  for (const [profileId, list] of Object.entries(data.favorites)) {
    data.favorites[profileId] = claimChildren(list)
  }

  for (const id of Object.keys(data.items)) {
    if (!claimed.has(id)) Reflect.deleteProperty(data.items, id)
  }

  const firstSpace = data.spaceOrder[0] ?? fallbackSpaceId
  for (const window of Object.values(data.windows)) {
    if (window.kind !== 'main') {
      Reflect.deleteProperty(data.windows, window.id)
      continue
    }
    window.peekTabId = null
    window.littleTabId = null
    if (!data.spaces[window.spaceId]) window.spaceId = firstSpace
    for (const [spaceId, tabId] of Object.entries(window.activeBySpace)) {
      if (!data.spaces[spaceId] || (tabId && data.items[tabId]?.kind !== 'tab')) {
        Reflect.deleteProperty(window.activeBySpace, spaceId)
      }
    }
  }
  return data
}
