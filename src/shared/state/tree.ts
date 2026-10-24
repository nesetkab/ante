import type { Container, Data, Id, Location, Split, Tab, WindowData } from '../schema'

export type Section = 'favorites' | 'pinned' | 'today'

export function getList(data: Data, container: Container): Id[] | null {
  switch (container.type) {
    case 'pinned':
      return data.spaces[container.spaceId]?.pinned ?? null
    case 'today':
      return data.spaces[container.spaceId]?.today ?? null
    case 'favorites':
      return data.favorites[container.profileId] ?? null
    case 'folder': {
      const item = data.items[container.id]
      return item?.kind === 'folder' ? item.children : null
    }
    case 'split': {
      const item = data.items[container.id]
      return item?.kind === 'split' ? item.children : null
    }
  }
}

export function locate(data: Data, id: Id): Location | null {
  for (const space of Object.values(data.spaces)) {
    const pinnedIndex = space.pinned.indexOf(id)
    if (pinnedIndex >= 0)
      return { container: { type: 'pinned', spaceId: space.id }, index: pinnedIndex }
    const todayIndex = space.today.indexOf(id)
    if (todayIndex >= 0)
      return { container: { type: 'today', spaceId: space.id }, index: todayIndex }
  }
  for (const [profileId, list] of Object.entries(data.favorites)) {
    const index = list.indexOf(id)
    if (index >= 0) return { container: { type: 'favorites', profileId }, index }
  }
  for (const item of Object.values(data.items)) {
    if (item.kind === 'tab') continue
    const index = item.children.indexOf(id)
    if (index >= 0) return { container: { type: item.kind, id: item.id }, index }
  }
  return null
}

interface Root {
  section: Section
  spaceId: Id | null
  profileId: Id | null
}

export function rootOf(data: Data, id: Id): Root | null {
  const seen = new Set<Id>()
  let current = id
  for (;;) {
    if (seen.has(current)) return null
    seen.add(current)
    const location = locate(data, current)
    if (!location) return null
    const { container } = location
    switch (container.type) {
      case 'pinned':
      case 'today': {
        const space = data.spaces[container.spaceId]
        return {
          section: container.type,
          spaceId: container.spaceId,
          profileId: space?.profileId ?? null,
        }
      }
      case 'favorites':
        return { section: 'favorites', spaceId: null, profileId: container.profileId }
      case 'folder':
      case 'split':
        current = container.id
    }
  }
}

export function sectionOf(data: Data, id: Id): Section | null {
  return rootOf(data, id)?.section ?? null
}

export function isPersistent(data: Data, id: Id): boolean {
  const section = sectionOf(data, id)
  return section === 'pinned' || section === 'favorites'
}

export function getTab(data: Data, id: Id | null | undefined): Tab | null {
  if (!id) return null
  const item = data.items[id]
  return item?.kind === 'tab' ? item : null
}

export function parentSplit(data: Data, tabId: Id): Split | null {
  const location = locate(data, tabId)
  if (location?.container.type !== 'split') return null
  const item = data.items[location.container.id]
  return item?.kind === 'split' ? item : null
}

export function flattenTabs(data: Data, ids: readonly Id[]): Id[] {
  const result: Id[] = []
  const visit = (id: Id, depth: number): void => {
    const item = data.items[id]
    if (!item || depth > 32) return
    if (item.kind === 'tab') result.push(id)
    else for (const child of item.children) visit(child, depth + 1)
  }
  for (const id of ids) visit(id, 0)
  return result
}

export function descendantIds(data: Data, id: Id): Id[] {
  const result: Id[] = []
  const visit = (current: Id, depth: number): void => {
    const item = data.items[current]
    if (!item || depth > 32) return
    result.push(current)
    if (item.kind !== 'tab') for (const child of item.children) visit(child, depth + 1)
  }
  visit(id, 0)
  return result
}

export function spaceTabOrder(data: Data, spaceId: Id): Id[] {
  const space = data.spaces[spaceId]
  if (!space) return []
  const favorites = data.favorites[space.profileId] ?? []
  return flattenTabs(data, [...favorites, ...space.pinned, ...space.today])
}

export function activeTabId(data: Data, window: WindowData): Id | null {
  if (window.kind === 'little') return getTab(data, window.littleTabId)?.id ?? null
  const id = window.activeBySpace[window.spaceId] ?? null
  return getTab(data, id)?.id ?? null
}

export function visibleTabIds(data: Data, window: WindowData): Id[] {
  const active = activeTabId(data, window)
  if (!active) return []
  const split = window.kind === 'main' ? parentSplit(data, active) : null
  if (!split) return [active]
  return split.children.filter((id) => getTab(data, id) !== null)
}

export function sameContainer(a: Container, b: Container): boolean {
  switch (a.type) {
    case 'pinned':
    case 'today':
      return b.type === a.type && b.spaceId === a.spaceId
    case 'favorites':
      return b.type === 'favorites' && b.profileId === a.profileId
    case 'folder':
    case 'split':
      return b.type === a.type && b.id === a.id
  }
}

export function sameIds(a: readonly Id[], b: readonly Id[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function displayTitle(tab: Tab): string {
  return tab.customTitle ?? (tab.title || tab.url)
}

const profileIndexes = new WeakMap<Data, Map<Id, Id>>()

export function profileIndex(data: Data): Map<Id, Id> {
  const cached = profileIndexes.get(data)
  if (cached) return cached
  const index = new Map<Id, Id>()
  const assign = (ids: readonly Id[], profileId: Id) => {
    for (const id of ids)
      for (const descendant of descendantIds(data, id)) index.set(descendant, profileId)
  }
  for (const space of Object.values(data.spaces)) {
    assign(space.pinned, space.profileId)
    assign(space.today, space.profileId)
  }
  for (const [profileId, list] of Object.entries(data.favorites)) assign(list, profileId)
  for (const window of Object.values(data.windows)) {
    const profileId = data.spaces[window.spaceId]?.profileId
    if (!profileId) continue
    for (const loose of [window.peekTabId, window.littleTabId]) {
      if (loose && !index.has(loose)) index.set(loose, profileId)
    }
  }
  if (Object.isFrozen(data)) profileIndexes.set(data, index)
  return index
}
