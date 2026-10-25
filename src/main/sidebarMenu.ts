import { randomUUID } from 'node:crypto'
import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { Command } from '@shared/commands'
import type { UiEvent } from '@shared/ipc'
import type { AppState, Id } from '@shared/schema'
import type { UiAction } from '@shared/state/actions'
import { descendantIds, flattenTabs, rootOf } from '@shared/state/tree'

interface SidebarMenuDeps {
  state: AppState
  windowSpaceId: Id
  run: (command: Command) => void
  dispatch: (action: UiAction) => void
  ui: (event: UiEvent) => void
}

const separator: MenuItemConstructorOptions = { type: 'separator' }

function tabMenu(id: Id, deps: SidebarMenuDeps): MenuItemConstructorOptions[] {
  const { state, run, dispatch, ui } = deps
  const tab = state.data.items[id]
  if (tab?.kind !== 'tab') return []
  const root = rootOf(state.data, id)
  const section = root?.section ?? null
  const spaceId = root?.spaceId ?? deps.windowSpaceId
  const profileId = state.data.spaces[spaceId]?.profileId ?? 'default'
  const loaded = state.runtime.tabs[id] !== undefined
  const persistent = section === 'pinned' || section === 'favorites'
  const drifted = persistent && tab.savedUrl !== null && tab.savedUrl !== tab.url
  const spaces = state.data.spaceOrder
    .map((spaceKey) => state.data.spaces[spaceKey])
    .filter((space) => space !== undefined)
    .filter((space) => space.id !== spaceId)

  const items: MenuItemConstructorOptions[] = [
    { label: 'Rename…', click: () => ui({ type: 'rename', id }) },
    { label: 'Copy URL', click: () => run({ type: 'tab/copyUrl', tabId: id }) },
    ...(process.platform === 'darwin'
      ? [{ label: 'Share…', click: () => run({ type: 'tab/share', tabId: id }) }]
      : []),
    {
      label: 'Copy as Markdown',
      click: () => run({ type: 'tab/copyUrl', tabId: id, markdown: true }),
    },
    { label: 'Duplicate', click: () => run({ type: 'tab/duplicate', tabId: id }) },
    separator,
  ]
  if (section === 'today')
    items.push({ label: 'Pin Tab', click: () => dispatch({ type: 'tab/pin', id, spaceId }) })
  if (section === 'pinned') {
    items.push(
      { label: 'Unpin Tab', click: () => dispatch({ type: 'tab/unpin', id, spaceId }) },
      {
        label: 'Add to New Folder',
        click: () =>
          dispatch({
            type: 'folder/create',
            id: randomUUID(),
            name: 'New Folder',
            spaceId,
            children: [id],
          }),
      },
    )
  }
  if (section === 'favorites') {
    items.push({
      label: 'Remove from Favorites',
      click: () => dispatch({ type: 'tab/unfavorite', id, spaceId: deps.windowSpaceId }),
    })
  } else {
    items.push({
      label: 'Add to Favorites',
      click: () => dispatch({ type: 'tab/favorite', id, profileId }),
    })
  }
  if (drifted) {
    items.push(
      { label: 'Go Back to Pinned URL', click: () => run({ type: 'tab/resetToSaved', tabId: id }) },
      { label: 'Make This the Pinned URL', click: () => dispatch({ type: 'tab/setSavedUrl', id }) },
    )
  }
  if (section !== 'favorites')
    items.push({ label: 'Add Split View', click: () => run({ type: 'split/add', tabId: id }) })
  if (/^https?:/.test(tab.url))
    items.push({ label: 'Follow This Site', click: () => run({ type: 'feed/follow', tabId: id }) })
  if (spaces.length > 0 && section !== 'favorites') {
    items.push({
      label: 'Move to Space',
      submenu: spaces.map((space) => ({
        label: space.name,
        click: () =>
          dispatch({
            type: 'item/move',
            id,
            to: { type: section === 'pinned' ? 'pinned' : 'today', spaceId: space.id },
            index: 0,
          }),
      })),
    })
  }
  if (/^https?:/i.test(tab.url))
    items.push({ label: 'Boost This Site…', click: () => run({ type: 'boost/open', tabId: id }) })
  items.push(separator)
  if (loaded) {
    items.push({
      label: state.runtime.tabs[id]?.muted ? 'Unmute' : 'Mute',
      click: () => run({ type: 'tab/toggleMute', tabId: id }),
    })
    if (persistent)
      items.push({ label: 'Unload', click: () => run({ type: 'tab/unload', tabId: id }) })
    items.push(separator)
  }
  items.push({
    label: persistent ? 'Close and Reset' : 'Close Tab',
    click: () => run({ type: 'tab/close', tabId: id }),
  })
  if (section === 'today') {
    const space = state.data.spaces[spaceId]
    const position = space?.today.findIndex((item) => item === id || containsTab(state, item, id))
    const count = space?.today.length ?? 0
    if (position !== undefined && position >= 0 && position < count - 1)
      items.push({
        label: 'Close Tabs Below',
        click: () => run({ type: 'tab/closeMany', tabId: id, which: 'below' }),
      })
    if (count > 1)
      items.push({
        label: 'Close Other Tabs',
        click: () => run({ type: 'tab/closeMany', tabId: id, which: 'others' }),
      })
  }
  return items
}

function containsTab(state: AppState, itemId: Id, tabId: Id): boolean {
  return flattenTabs(state.data, [itemId]).includes(tabId)
}

function foldersIn(state: AppState, spaceId: Id): Id[] {
  const space = state.data.spaces[spaceId]
  if (!space) return []
  return space.pinned
    .flatMap((id) => descendantIds(state.data, id))
    .filter((id) => state.data.items[id]?.kind === 'folder')
}

function folderToggles(deps: SidebarMenuDeps, spaceId: Id): MenuItemConstructorOptions[] {
  const folders = foldersIn(deps.state, spaceId)
  if (folders.length < 2) return []
  const setAll = (open: boolean) => {
    for (const folderId of folders) deps.dispatch({ type: 'folder/toggle', id: folderId, open })
  }
  return [
    { type: 'separator' },
    { label: 'Collapse All Folders', click: () => setAll(false) },
    { label: 'Expand All Folders', click: () => setAll(true) },
  ]
}

function folderMenu(id: Id, deps: SidebarMenuDeps): MenuItemConstructorOptions[] {
  const folder = deps.state.data.items[id]
  if (folder?.kind === 'folder' && folder.feedUrl) {
    return [
      { label: 'Rename…', click: () => deps.ui({ type: 'rename', id }) },
      { label: 'Refresh', click: () => deps.run({ type: 'feed/refresh', folderId: id }) },
      { type: 'separator' },
      { label: 'Unfollow', click: () => deps.dispatch({ type: 'folder/delete', id }) },
    ]
  }
  const spaceId = rootOf(deps.state.data, id)?.spaceId ?? deps.windowSpaceId
  return [
    { label: 'Rename…', click: () => deps.ui({ type: 'rename', id }) },
    {
      label: 'Copy Links as Markdown',
      click: () => deps.run({ type: 'folder/copyLinks', folderId: id }),
    },
    { label: 'Ungroup', click: () => deps.dispatch({ type: 'folder/ungroup', id }) },
    ...folderToggles(deps, spaceId),
    { type: 'separator' },
    { label: 'Delete Folder', click: () => deps.dispatch({ type: 'folder/delete', id }) },
  ]
}

function splitMenu(id: Id, deps: SidebarMenuDeps): MenuItemConstructorOptions[] {
  const split = deps.state.data.items[id]
  if (split?.kind !== 'split') return []
  const vertical = split.direction === 'vertical'
  return [
    {
      label: vertical ? 'Arrange Side by Side' : 'Arrange Top and Bottom',
      click: () =>
        deps.dispatch({
          type: 'split/direction',
          id,
          direction: vertical ? 'horizontal' : 'vertical',
        }),
    },
    { label: 'Separate Tabs', click: () => deps.dispatch({ type: 'split/dissolve', id }) },
  ]
}

export function showSidebarMenu(id: Id, deps: SidebarMenuDeps): void {
  const item = deps.state.data.items[id]
  if (!item) return
  const template =
    item.kind === 'tab'
      ? tabMenu(id, deps)
      : item.kind === 'folder'
        ? folderMenu(id, deps)
        : splitMenu(id, deps)
  if (template.length > 0) Menu.buildFromTemplate(template).popup()
}
