import type { Data, Id } from '../schema'
import { createInitialData, DEFAULT_PROFILE_ID } from './initial'
import { stripPrivate } from './private'

function reachable(data: Data): Set<Id> {
  const seen = new Set<Id>()
  const visit = (id: Id): void => {
    const item = data.items[id]
    if (!item || seen.has(id)) return
    seen.add(id)
    if (item.kind !== 'tab') item.children.forEach(visit)
  }
  for (const space of Object.values(data.spaces)) {
    space.pinned.forEach(visit)
    space.today.forEach(visit)
  }
  for (const list of Object.values(data.favorites)) list.forEach(visit)
  return seen
}

export function sanitize(input: Data, fallbackSpaceId: Id): Data {
  const data = structuredClone(stripPrivate(input))
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
  for (const space of Object.values(data.spaces)) {
    space.pinned = keep(space.pinned)
    space.today = keep(space.today)
  }
  for (const profileId of Object.keys(data.favorites)) {
    data.favorites[profileId] = keep(data.favorites[profileId] ?? [])
  }
  for (const item of Object.values(data.items)) {
    if (item.kind === 'tab') continue
    item.children = keep(item.children)
    if (item.kind === 'split' && item.sizes.length !== item.children.length) {
      item.sizes = item.children.map(() => 1 / item.children.length)
    }
  }

  const live = reachable(data)
  for (const id of Object.keys(data.items)) {
    if (!live.has(id)) Reflect.deleteProperty(data.items, id)
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
