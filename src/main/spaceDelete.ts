import { dialog } from 'electron'
import type { Id } from '@shared/schema'
import { activeTabId } from '@shared/state/tree'
import type { Store } from './store'
import type { AppWindow, WindowManager } from './windows'

interface SpaceDeleteDeps {
  store: Store
  windows: WindowManager
  window: AppWindow
}

export async function deleteSpaceWithConfirm(deps: SpaceDeleteDeps, spaceId: Id): Promise<void> {
  const { store, windows, window } = deps
  const space = store.state.data.spaces[spaceId]
  if (!space || store.state.data.spaceOrder.length <= 1) return
  const { response } = await dialog.showMessageBox(window.win, {
    type: 'warning',
    buttons: ['Delete Space', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `Delete “${space.name || 'Untitled'}”?`,
    detail: 'Its pinned and today tabs will be closed. This cannot be undone.',
  })
  if (response !== 0 || !store.state.data.spaces[spaceId]) return
  store.dispatch({ type: 'space/delete', id: spaceId })
  windows.syncNow()
  const data = window.data
  if (data && !window.win.isDestroyed()) window.focusContent(activeTabId(store.state.data, data))
}
