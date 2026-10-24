import type { AppState, Id } from '@shared/schema'
import { activeTabId } from '@shared/state/tree'
import { windowId } from '../ante'

export function selectActiveId(state: AppState): Id | null {
  const window = state.data.windows[windowId]
  return window ? activeTabId(state.data, window) : null
}
