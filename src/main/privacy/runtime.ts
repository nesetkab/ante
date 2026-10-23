import type { Id, TabRuntime } from '@shared/schema'
import type { Store } from '../store'

export function patchLoadedTab(store: Store, id: Id, patch: Partial<TabRuntime>): void {
  if (!store.state.runtime.tabs[id]) return
  store.dispatch({ type: 'runtime/tab', id, patch })
}
