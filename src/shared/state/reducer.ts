import {
  MAX_ARCHIVE,
  type AppState,
  type Container,
  type Data,
  type Id,
  type Item,
  type Location,
  type SyncStatus,
  type Tab,
  type TabRuntime,
  type UpdateStatus,
  type WindowData,
  type WindowRuntime,
} from '../schema'
import { applyImport } from '../importers/bundle'
import { bringToFront, easelUrl } from '../easels'
import { noteTabTitle, noteUrl } from '../notes'
import { clearSitePermission, setSitePermissions } from '../permissions'
import { applySyncInPlace } from '../sync'
import type { Action } from './actions'
import { reduceBoosts } from './boosts'
import {
  createPrivateSpace,
  isPrivateProfile,
  removePrivateProfile,
  samePrivacy,
  isPrivateSpace,
} from './private'
import {
  descendantIds,
  displayTitle,
  flattenTabs,
  getList,
  getTab,
  isPersistent,
  locate,
  rootOf,
  sameContainer,
  spaceTabOrder,
  visibleTabIds,
  type Section,
} from './tree'

function clearHover(state: AppState, window: WindowData): void {
  for (const id of visibleTabIds(state.data, window)) {
    const shown = state.runtime.tabs[id]
    if (shown?.hoverUrl) shown.hoverUrl = null
  }
}

function stampVisible(data: Data, window: WindowData, now: number): void {
  for (const id of visibleTabIds(data, window)) {
    const tab = getTab(data, id)
    if (tab) tab.lastActiveAt = now
  }
}

export const MAX_CLOSED = 50
export const MAX_SPLIT = 4

export const defaultTabRuntime: TabRuntime = {
  loading: false,
  canGoBack: false,
  canGoForward: false,
  audible: false,
  muted: false,
  zoom: 1,
  crashed: false,
  fullscreen: false,
  blocked: 0,
  prompt: null,
  find: null,
  media: null,
  devtools: null,
  error: null,
  capturing: false,
  hoverUrl: null,
}

export const defaultWindowRuntime: WindowRuntime = {
  overlay: null,
  focused: false,
  fullscreen: false,
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function sectionOfContainer(data: Data, container: Container): Section | null {
  switch (container.type) {
    case 'pinned':
    case 'today':
    case 'favorites':
      return container.type
    case 'folder':
    case 'split':
      return rootOf(data, container.id)?.section ?? null
  }
}

function isAncestor(data: Data, ancestorId: Id, id: Id): boolean {
  return descendantIds(data, ancestorId).includes(id)
}

function hasList(data: Data, container: Container): boolean {
  return container.type === 'favorites'
    ? data.profiles[container.profileId] !== undefined
    : getList(data, container) !== null
}

export function canPlace(data: Data, item: Item, container: Container): boolean {
  if (!hasList(data, container)) return false
  switch (container.type) {
    case 'favorites':
      return item.kind === 'tab'
    case 'split': {
      if (item.kind !== 'tab') return false
      const split = data.items[container.id]
      return (
        split?.kind === 'split' &&
        (split.children.length < MAX_SPLIT || split.children.includes(item.id))
      )
    }
    case 'folder': {
      const folder = data.items[container.id]
      if (folder?.kind === 'folder' && folder.feedUrl) return false
      return !isAncestor(data, item.id, container.id)
    }
    case 'today':
      return item.kind !== 'folder'
    case 'pinned':
      return true
  }
}

function insert(data: Data, container: Container, index: number, id: Id): boolean {
  if (container.type === 'favorites' && data.profiles[container.profileId])
    data.favorites[container.profileId] ??= []
  const list = getList(data, container)
  if (!list) return false
  list.splice(clamp(index, 0, list.length), 0, id)
  if (container.type === 'split') equalizeSplit(data, container.id)
  return true
}

function equalizeSplit(data: Data, splitId: Id): void {
  const split = data.items[splitId]
  if (split?.kind !== 'split') return
  split.sizes = split.children.map(() => 1 / split.children.length)
}

function replaceInParent(data: Data, id: Id, replacement: Id[]): void {
  const location = locate(data, id)
  if (!location) return
  getList(data, location.container)?.splice(location.index, 1, ...replacement)
}

function normalizeSplit(state: AppState, splitId: Id): void {
  const { data } = state
  const split = data.items[splitId]
  if (split?.kind !== 'split') return
  if (split.children.length >= 2) {
    if (split.sizes.length !== split.children.length) equalizeSplit(data, splitId)
    return
  }
  replaceInParent(data, splitId, [...split.children])
  Reflect.deleteProperty(data.items, splitId)
}

function detach(state: AppState, id: Id): Location | null {
  const { data } = state
  const location = locate(data, id)
  if (!location) return null
  getList(data, location.container)?.splice(location.index, 1)
  if (location.container.type === 'split') {
    const split = data.items[location.container.id]
    if (split?.kind === 'split') split.sizes.splice(location.index, 1)
    normalizeSplit(state, location.container.id)
  }
  return location
}

function applySection(data: Data, id: Id, section: Section | null): void {
  for (const tabId of flattenTabs(data, [id])) {
    const tab = getTab(data, tabId)
    if (!tab) continue
    if (section === 'today') {
      tab.savedUrl = null
      tab.savedTitle = null
    } else if (section && tab.savedUrl === null) {
      tab.savedUrl = tab.url
      tab.savedTitle = tab.title
    }
  }
}

function move(state: AppState, id: Id, to: Container, index: number): boolean {
  const { data } = state
  const item = data.items[id]
  if (!item || !canPlace(data, item, to)) return false
  const from = locate(data, id)
  if (from && sameContainer(from.container, to)) {
    const list = getList(data, to) ?? []
    list.splice(from.index, 1)
    list.splice(clamp(from.index < index ? index - 1 : index, 0, list.length), 0, id)
    if (to.type === 'split') equalizeSplit(data, to.id)
    return true
  }
  const displaced = activeEntriesWithin(data, id)
  const profileBefore = rootOf(data, id)?.profileId ?? null
  detach(state, id)
  if (!insert(data, to, index, id)) return false
  applySection(data, id, sectionOfContainer(data, to))
  const profileAfter = rootOf(data, id)?.profileId ?? null
  if (profileBefore && profileAfter && profileBefore !== profileAfter) unloadTabs(state, [id])
  for (const entry of displaced) {
    const root = rootOf(data, entry.activeId)
    if (root?.section !== 'favorites' && root?.spaceId !== entry.spaceId) {
      entry.window.activeBySpace[entry.spaceId] = entry.fallback
    }
  }
  return true
}

interface ActiveEntry {
  window: WindowData
  spaceId: Id
  activeId: Id
  fallback: Id | null
}

function activeEntriesWithin(data: Data, rootId: Id): ActiveEntry[] {
  const ids = new Set(descendantIds(data, rootId))
  const entries: ActiveEntry[] = []
  for (const window of Object.values(data.windows)) {
    for (const [spaceId, activeId] of Object.entries(window.activeBySpace)) {
      if (!activeId || !ids.has(activeId)) continue
      entries.push({
        window,
        spaceId,
        activeId,
        fallback: neighborAfterRemoval(data, spaceId, activeId, ids),
      })
    }
  }
  return entries
}

function unloadTabs(state: AppState, ids: readonly Id[]): void {
  for (const tabId of flattenTabs(state.data, ids))
    Reflect.deleteProperty(state.runtime.tabs, tabId)
}

function topLevelId(data: Data, id: Id): Id {
  const location = locate(data, id)
  return location?.container.type === 'split' ? location.container.id : id
}

function neighborAfterRemoval(data: Data, spaceId: Id, activeId: Id, removed: Set<Id>): Id | null {
  const order = spaceTabOrder(data, spaceId)
  const index = order.indexOf(activeId)
  if (index < 0) return null
  const after = order.slice(index + 1).find((id) => !removed.has(id))
  if (after) return after
  return [...order.slice(0, index)].reverse().find((id) => !removed.has(id)) ?? null
}

function deleteItems(state: AppState, rootId: Id): void {
  const { data, runtime } = state
  const ids = descendantIds(data, rootId)
  if (ids.length === 0) return
  const removed = new Set(ids)
  for (const window of Object.values(data.windows)) {
    for (const [spaceId, activeId] of Object.entries(window.activeBySpace)) {
      if (activeId && removed.has(activeId)) {
        window.activeBySpace[spaceId] = neighborAfterRemoval(data, spaceId, activeId, removed)
      }
    }
    if (window.peekTabId && removed.has(window.peekTabId)) window.peekTabId = null
    if (window.littleTabId && removed.has(window.littleTabId)) window.littleTabId = null
  }
  detach(state, rootId)
  for (const id of ids) {
    Reflect.deleteProperty(data.items, id)
    Reflect.deleteProperty(runtime.tabs, id)
  }
}

function archiveItem(state: AppState, id: Id, spaceId: Id, now: number): void {
  const { data } = state
  if (isPrivateSpace(data, spaceId)) {
    deleteItems(state, id)
    return
  }
  const entries = flattenTabs(data, [id])
    .map((tabId) => getTab(data, tabId))
    .filter((tab): tab is Tab => tab !== null)
    .map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: displayTitle(tab),
      favicon: tab.favicon,
      spaceId,
      archivedAt: now,
    }))
  data.archive.unshift(...entries)
  if (data.archive.length > MAX_ARCHIVE) data.archive.length = MAX_ARCHIVE
  deleteItems(state, id)
}

function createSplit(state: AppState, id: Id, tabIds: Id[], direction: 'horizontal' | 'vertical') {
  const { data } = state
  const unique = [...new Set(tabIds)].filter((tabId) => {
    const section = rootOf(data, tabId)?.section
    return getTab(data, tabId) !== null && section !== 'favorites'
  })
  if (unique.length < 2) return
  const [anchorId, ...rest] = unique as [Id, ...Id[]]
  const anchor = locate(data, anchorId)
  if (!anchor) return
  if (anchor.container.type === 'split') {
    for (const tabId of rest) move(state, tabId, anchor.container, MAX_SPLIT)
    return
  }
  data.items[id] = { kind: 'split', id, children: [], direction, sizes: [] }
  insert(data, anchor.container, anchor.index, id)
  for (const tabId of unique.slice(0, MAX_SPLIT))
    move(state, tabId, { type: 'split', id }, MAX_SPLIT)
  normalizeSplit(state, id)
}

function syncFeed(
  state: AppState,
  folderId: Id,
  entries: readonly { id: Id; url: string; title: string }[],
  now: number,
): void {
  const { data } = state
  const folder = data.items[folderId]
  if (folder?.kind !== 'folder' || !folder.feedUrl) return
  const existing = new Map<string, Tab>()
  for (const child of folder.children) {
    const tab = getTab(data, child)
    if (tab) existing.set(tab.savedUrl ?? tab.url, tab)
  }
  const next: Id[] = []
  for (const entry of entries) {
    const tab = existing.get(entry.url)
    if (tab) {
      if (tab.savedTitle !== entry.title) tab.savedTitle = entry.title
      if (tab.url === tab.savedUrl) tab.title = entry.title
      next.push(tab.id)
      continue
    }
    if (data.items[entry.id]) continue
    data.items[entry.id] = {
      kind: 'tab',
      id: entry.id,
      url: entry.url,
      title: entry.title,
      favicon: null,
      savedUrl: entry.url,
      savedTitle: entry.title,
      customTitle: null,
      createdAt: now,
      lastActiveAt: 0,
    }
    next.push(entry.id)
  }
  const inUse = new Set(Object.keys(state.runtime.tabs))
  for (const window of Object.values(data.windows)) {
    for (const active of Object.values(window.activeBySpace)) if (active) inUse.add(active)
  }
  for (const child of folder.children) {
    if (!next.includes(child) && inUse.has(child) && getTab(data, child)) next.push(child)
  }
  const kept = new Set(next)
  for (const child of [...folder.children]) {
    if (!kept.has(child) && data.items[child]?.kind === 'tab') deleteItems(state, child)
  }
  const current = data.items[folderId]
  if (current?.kind === 'folder') current.children = next
}

export function reduce(state: AppState, action: Action): void {
  const { data, runtime } = state
  switch (action.type) {
    case 'data/replace': {
      state.data = action.data
      for (const id of Object.keys(runtime.tabs)) {
        if (!getTab(action.data, id)) Reflect.deleteProperty(runtime.tabs, id)
      }
      return
    }

    case 'space/create': {
      if (!data.profiles[action.profileId] || data.spaces[action.id]) return
      if (isPrivateProfile(action.profileId)) return
      data.spaces[action.id] = {
        id: action.id,
        name: action.name,
        color: action.color,
        icon: action.icon,
        profileId: action.profileId,
        pinned: [],
        today: [],
      }
      data.spaceOrder.push(action.id)
      return
    }
    case 'space/update': {
      const space = data.spaces[action.id]
      if (!space) return
      if (action.patch.profileId && !data.profiles[action.patch.profileId]) return
      const profileChanged =
        action.patch.profileId !== undefined && action.patch.profileId !== space.profileId
      Object.assign(space, action.patch)
      if (profileChanged) unloadTabs(state, [...space.pinned, ...space.today])
      return
    }
    case 'space/delete': {
      const space = data.spaces[action.id]
      if (!space || data.spaceOrder.length <= 1) return
      for (const id of [...space.pinned, ...space.today]) deleteItems(state, id)
      data.spaceOrder = data.spaceOrder.filter((id) => id !== action.id)
      Reflect.deleteProperty(data.spaces, action.id)
      const fallback = data.spaceOrder[0]
      for (const window of Object.values(data.windows)) {
        Reflect.deleteProperty(window.activeBySpace, action.id)
        if (window.spaceId === action.id && fallback) window.spaceId = fallback
      }
      return
    }
    case 'space/move': {
      const from = data.spaceOrder.indexOf(action.id)
      if (from < 0) return
      data.spaceOrder.splice(from, 1)
      data.spaceOrder.splice(clamp(action.index, 0, data.spaceOrder.length), 0, action.id)
      return
    }

    case 'item/move':
      move(state, action.id, action.to, action.index)
      return

    case 'tab/create': {
      if (data.items[action.tab.id]) return
      data.items[action.tab.id] = { ...action.tab }
      if (!action.to) return
      if (
        !canPlace(data, action.tab, action.to) ||
        !insert(data, action.to, action.index, action.tab.id)
      ) {
        Reflect.deleteProperty(data.items, action.tab.id)
        return
      }
      applySection(data, action.tab.id, sectionOfContainer(data, action.to))
      return
    }
    case 'tab/update': {
      const tab = getTab(data, action.id)
      if (tab) Object.assign(tab, action.patch)
      return
    }
    case 'tab/rename': {
      const tab = getTab(data, action.id)
      const title = action.title?.trim()
      if (tab) tab.customTitle = title === '' ? null : (title ?? null)
      return
    }
    case 'tab/reset': {
      const tab = getTab(data, action.id)
      if (!tab?.savedUrl) return
      tab.url = tab.savedUrl
      tab.title = tab.savedTitle ?? tab.title
      return
    }
    case 'tab/setSavedUrl': {
      const tab = getTab(data, action.id)
      if (!tab || !isPersistent(data, action.id)) return
      tab.savedUrl = tab.url
      tab.savedTitle = tab.title
      return
    }
    case 'tab/pin': {
      const list = data.spaces[action.spaceId]?.pinned
      if (!list || !getTab(data, action.id)) return
      move(
        state,
        topLevelId(data, action.id),
        { type: 'pinned', spaceId: action.spaceId },
        list.length,
      )
      return
    }
    case 'tab/unpin':
    case 'tab/unfavorite': {
      if (!data.spaces[action.spaceId] || !getTab(data, action.id)) return
      move(state, topLevelId(data, action.id), { type: 'today', spaceId: action.spaceId }, 0)
      return
    }
    case 'tab/favorite': {
      if (!data.profiles[action.profileId] || !getTab(data, action.id)) return
      data.favorites[action.profileId] ??= []
      const list = data.favorites[action.profileId] ?? []
      move(state, action.id, { type: 'favorites', profileId: action.profileId }, list.length)
      return
    }
    case 'tab/remove': {
      const tab = getTab(data, action.id)
      if (!tab) return
      const location = locate(data, action.id)
      if (isPersistent(data, action.id)) return
      const isPrivate = isPrivateProfile(rootOf(data, action.id)?.profileId)
      if (location && !isPrivate) {
        data.closed.unshift({ tab: { ...tab }, location, closedAt: action.now })
        if (data.closed.length > MAX_CLOSED) data.closed.length = MAX_CLOSED
      }
      const spaceId = rootOf(data, action.id)?.spaceId
      if (action.archive && spaceId) archiveItem(state, action.id, spaceId, action.now)
      else deleteItems(state, action.id)
      return
    }
    case 'tab/restoreClosed': {
      const entry = data.closed.shift()
      if (!entry || data.items[entry.tab.id]) return
      data.archive = data.archive.filter((archived) => archived.id !== entry.tab.id)
      data.items[entry.tab.id] = entry.tab
      const { container, index } = entry.location
      const placed =
        canPlace(data, entry.tab, container) && insert(data, container, index, entry.tab.id)
      const fallback: Container = { type: 'today', spaceId: action.fallbackSpaceId }
      if (!placed && !insert(data, fallback, 0, entry.tab.id)) {
        Reflect.deleteProperty(data.items, entry.tab.id)
        return
      }
      applySection(data, entry.tab.id, sectionOfContainer(data, placed ? container : fallback))
      return
    }

    case 'folder/create': {
      const space = data.spaces[action.spaceId]
      if (!space || data.items[action.id]) return
      data.items[action.id] = {
        kind: 'folder',
        id: action.id,
        name: action.name,
        children: [],
        open: true,
        feedUrl: null,
      }
      const first = action.children[0]
      const anchor = first ? locate(data, first) : null
      if (
        anchor &&
        anchor.container.type !== 'split' &&
        anchor.container.type !== 'favorites' &&
        anchor.container.type !== 'today'
      ) {
        insert(data, anchor.container, anchor.index, action.id)
      } else {
        space.pinned.push(action.id)
      }
      for (const child of action.children) {
        move(
          state,
          topLevelId(data, child),
          { type: 'folder', id: action.id },
          Number.MAX_SAFE_INTEGER,
        )
      }
      return
    }
    case 'folder/rename': {
      const folder = data.items[action.id]
      if (folder?.kind === 'folder') folder.name = action.name
      return
    }
    case 'folder/toggle': {
      const folder = data.items[action.id]
      if (folder?.kind === 'folder') folder.open = action.open ?? !folder.open
      return
    }
    case 'folder/ungroup':
    case 'split/dissolve': {
      const item = data.items[action.id]
      const kind = action.type === 'folder/ungroup' ? 'folder' : 'split'
      if (!item || item.kind === 'tab' || item.kind !== kind) return
      replaceInParent(data, action.id, [...item.children])
      Reflect.deleteProperty(data.items, action.id)
      return
    }

    case 'split/create':
      createSplit(state, action.id, action.tabIds, action.direction)
      return
    case 'split/resize': {
      const split = data.items[action.id]
      if (split?.kind !== 'split' || action.sizes.length !== split.children.length) return
      const total = action.sizes.reduce((sum, size) => sum + size, 0)
      split.sizes = action.sizes.map((size) => size / total)
      return
    }
    case 'split/direction': {
      const split = data.items[action.id]
      if (split?.kind === 'split') split.direction = action.direction
      return
    }

    case 'today/clear': {
      const space = data.spaces[action.spaceId]
      if (!space) return
      for (const id of [...space.today]) archiveItem(state, id, space.id, action.now)
      return
    }
    case 'archive/sweep': {
      if (action.thresholdMs <= 0) return
      const keep = new Set(action.keep)
      const cutoff = action.now - action.thresholdMs
      for (const space of Object.values(data.spaces)) {
        for (const id of [...space.today]) {
          const tabs = flattenTabs(data, [id]).map((tabId) => getTab(data, tabId))
          const stale = tabs.every((tab) => tab && tab.lastActiveAt < cutoff && !keep.has(tab.id))
          if (tabs.length > 0 && stale) archiveItem(state, id, space.id, action.now)
        }
      }
      return
    }
    case 'archive/restore': {
      const index = data.archive.findIndex((entry) => entry.id === action.id)
      const entry = data.archive[index]
      const spaceId = data.spaces[action.spaceId] ? action.spaceId : data.spaceOrder[0]
      if (!entry || !spaceId || data.items[action.tabId]) return
      data.archive.splice(index, 1)
      data.closed = data.closed.filter((closed) => closed.tab.id !== entry.id)
      data.items[action.tabId] = {
        kind: 'tab',
        id: action.tabId,
        url: entry.url,
        title: entry.title,
        favicon: entry.favicon,
        savedUrl: null,
        savedTitle: null,
        customTitle: null,
        createdAt: action.now,
        lastActiveAt: action.now,
      }
      insert(data, { type: 'today', spaceId }, 0, action.tabId)
      return
    }
    case 'archive/remove':
      data.archive = data.archive.filter((entry) => entry.id !== action.id)
      return
    case 'archive/clear':
      data.archive = []
      return

    case 'settings/update':
      Object.assign(data.settings, action.patch)
      return
    case 'settings/downloadFolder':
      data.settings.downloadFolder = action.folder
      return

    case 'window/create':
      data.windows[action.window.id] = action.window
      runtime.windows[action.window.id] = { ...defaultWindowRuntime }
      return
    case 'window/remove': {
      const window = data.windows[action.id]
      if (!window) return
      for (const loose of [window.littleTabId, window.peekTabId]) {
        if (loose && !locate(data, loose)) deleteItems(state, loose)
      }
      Reflect.deleteProperty(data.windows, action.id)
      Reflect.deleteProperty(runtime.windows, action.id)
      if (!Object.values(data.windows).some((other) => other.kind === 'main')) runtime.tabs = {}
      return
    }
    case 'window/update': {
      const window = data.windows[action.id]
      if (window) Object.assign(window, action.patch)
      return
    }
    case 'window/selectSpace': {
      const window = data.windows[action.id]
      if (!window || !data.spaces[action.spaceId]) return
      if (!samePrivacy(data, window.spaceId, action.spaceId)) return
      if (action.now !== undefined) stampVisible(data, window, action.now)
      clearHover(state, window)
      window.spaceId = action.spaceId
      return
    }
    case 'window/activate': {
      const window = data.windows[action.id]
      const tab = getTab(data, action.tabId)
      if (!window || !tab) return
      const spaceId = rootOf(data, action.tabId)?.spaceId
      if (spaceId && !samePrivacy(data, window.spaceId, spaceId)) return
      stampVisible(data, window, action.now)
      clearHover(state, window)
      if (spaceId && spaceId !== window.spaceId) window.spaceId = spaceId
      window.activeBySpace[window.spaceId] = action.tabId
      tab.lastActiveAt = action.now
      return
    }

    case 'window/deactivate': {
      const window = data.windows[action.id]
      if (window) window.activeBySpace[window.spaceId] = null
      return
    }

    case 'runtime/tab': {
      if (!getTab(data, action.id)) return
      const existing = runtime.tabs[action.id]
      if (existing) Object.assign(existing, action.patch)
      else if (action.create) runtime.tabs[action.id] = { ...defaultTabRuntime, ...action.patch }
      return
    }
    case 'runtime/unload':
      Reflect.deleteProperty(runtime.tabs, action.id)
      return
    case 'runtime/window': {
      if (!data.windows[action.id]) return
      const existing = runtime.windows[action.id]
      if (existing) Object.assign(existing, action.patch)
      else runtime.windows[action.id] = { ...defaultWindowRuntime, ...action.patch }
      return
    }

    case 'data/import':
      applyImport(data, action.bundle)
      return
    case 'runtime/arcImport':
      runtime.arcImportAvailable = action.available
      return
    case 'runtime/browsers':
      runtime.browsers = [...action.browsers]
      return
    case 'profile/create': {
      if (data.profiles[action.id]) return
      data.profiles[action.id] = { id: action.id, name: action.name.trim() || 'Profile' }
      data.favorites[action.id] ??= []
      return
    }
    case 'download/add':
      runtime.downloads[action.download.id] = { ...action.download }
      return
    case 'download/update': {
      const download = runtime.downloads[action.id]
      if (download) Object.assign(download, action.patch)
      return
    }
    case 'download/remove':
      for (const id of action.ids) Reflect.deleteProperty(runtime.downloads, id)
      return
    case 'boost/create':
    case 'boost/update':
    case 'boost/delete':
    case 'boost/addZap':
    case 'boost/removeZap':
    case 'route/add':
    case 'route/update':
    case 'route/delete':
      reduceBoosts(data, action)
      return
    case 'sitePermission/set':
      setSitePermissions(data, action.profileId, action.origin, action.permissions, action.decision)
      return
    case 'sitePermission/clear':
      clearSitePermission(data, action.profileId, action.origin, action.permission)
      return
    case 'profile/rename': {
      const profile = data.profiles[action.id]
      const name = action.name.trim()
      if (profile && name && !isPrivateProfile(profile.id)) profile.name = name
      return
    }
    case 'private/create':
      createPrivateSpace(data, action.profileId, action.spaceId)
      return
    case 'private/remove':
      if (removePrivateProfile(state, action.profileId, { closeWindows: false })) {
        for (const [id, download] of Object.entries(runtime.downloads)) {
          if (download.profileId === action.profileId) Reflect.deleteProperty(runtime.downloads, id)
        }
      }
      return
    case 'feed/create': {
      const space = data.spaces[action.spaceId]
      if (!space || data.items[action.id]) return
      data.items[action.id] = {
        kind: 'folder',
        id: action.id,
        name: action.name,
        children: [],
        open: true,
        feedUrl: action.feedUrl,
      }
      space.pinned.push(action.id)
      return
    }
    case 'folder/delete':
      if (data.items[action.id]?.kind === 'folder') deleteItems(state, action.id)
      return
    case 'feed/sync':
      syncFeed(state, action.id, action.entries, action.now)
      return
    case 'easel/create':
      data.easels[action.id] ??= {
        id: action.id,
        title: '',
        elements: [],
        updatedAt: action.now,
        private: action.private ?? false,
      }
      return
    case 'page/delete': {
      const url = action.kind === 'note' ? noteUrl(action.id) : easelUrl(action.id)
      if (action.kind === 'note') Reflect.deleteProperty(data.notes, action.id)
      else Reflect.deleteProperty(data.easels, action.id)
      const tabIds = Object.values(data.items)
        .filter((item) => item.kind === 'tab' && (item.url === url || item.savedUrl === url))
        .map((item) => item.id)
      for (const id of tabIds) deleteItems(state, id)
      data.closed = data.closed.filter((entry) => entry.tab.url !== url)
      data.archive = data.archive.filter((entry) => entry.url !== url)
      return
    }
    case 'easel/rename': {
      const easel = data.easels[action.id]
      if (!easel) return
      easel.title = action.title
      easel.updatedAt = action.now
      const url = easelUrl(action.id)
      for (const item of Object.values(data.items)) {
        if (item.kind === 'tab' && item.url === url)
          item.title = action.title.trim() || 'Untitled easel'
      }
      return
    }
    case 'easel/upsert': {
      const easel = data.easels[action.id]
      if (!easel) return
      const index = easel.elements.findIndex((element) => element.id === action.element.id)
      if (index >= 0) easel.elements[index] = action.element
      else easel.elements.push(action.element)
      easel.updatedAt = action.now
      return
    }
    case 'easel/remove': {
      const easel = data.easels[action.id]
      if (!easel) return
      const removed = new Set(action.elementIds)
      easel.elements = easel.elements.filter((element) => !removed.has(element.id))
      easel.updatedAt = action.now
      return
    }
    case 'easel/front': {
      const easel = data.easels[action.id]
      if (!easel) return
      easel.elements = bringToFront(easel.elements, action.elementId)
      easel.updatedAt = action.now
      return
    }
    case 'sync/apply': {
      applySyncInPlace(data, action.entities, { dropSpaces: action.dropSpaces })
      for (const id of Object.keys(runtime.tabs)) {
        if (!getTab(data, id)) Reflect.deleteProperty(runtime.tabs, id)
      }
      return
    }
    case 'sync/configure': {
      const sync = data.settings.sync
      const { folder, deviceId, deviceName } = action.patch
      if (folder !== undefined && sync.folder !== folder) sync.folder = folder
      if (deviceId !== undefined && sync.deviceId !== deviceId) sync.deviceId = deviceId
      if (deviceName !== undefined && sync.deviceName !== deviceName) sync.deviceName = deviceName
      return
    }
    case 'runtime/update': {
      const previous = runtime.update
      const next = action.status
      const keys = Object.keys(next) as (keyof UpdateStatus)[]
      if (previous && keys.every((key) => previous[key] === next[key])) return
      runtime.update = { ...next }
      return
    }
    case 'runtime/sync': {
      const previous = runtime.sync
      const next = action.status
      const keys = Object.keys(next) as (keyof SyncStatus)[]
      if (previous && keys.every((key) => previous[key] === next[key])) return
      runtime.sync = { ...next }
      return
    }
    case 'note/create':
      data.notes[action.id] ??= {
        id: action.id,
        title: '',
        body: '',
        updatedAt: action.now,
        private: action.private ?? false,
      }
      return
    case 'note/update': {
      const note = data.notes[action.id]
      if (!note) return
      if (action.title !== undefined) note.title = action.title
      if (action.body !== undefined) note.body = action.body
      note.updatedAt = action.now
      const url = noteUrl(action.id)
      for (const item of Object.values(data.items)) {
        if (item.kind === 'tab' && item.url === url) item.title = noteTabTitle(note.title)
      }
      return
    }
  }
}
