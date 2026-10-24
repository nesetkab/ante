import type { WebContents } from 'electron'
import type { FindState } from '@shared/permissions'
import type { Id } from '@shared/schema'
import type { Store } from '../store'
import type { TabManager } from '../tabs'
import { patchLoadedTab } from './runtime'

export class FindInPage {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #watched = new WeakSet<WebContents>()

  constructor(store: Store, tabs: TabManager) {
    this.#store = store
    this.#tabs = tabs
  }

  #state(tabId: Id): FindState | null {
    return this.#store.state.runtime.tabs[tabId]?.find ?? null
  }

  #set(tabId: Id, find: FindState | null): void {
    patchLoadedTab(this.#store, tabId, { find })
  }

  open(tabId: Id): void {
    const contents = this.#tabs.contents(tabId)
    if (!contents) return
    this.#watch(tabId, contents)
    const current = this.#state(tabId)
    this.#set(tabId, {
      query: current?.query ?? '',
      matches: current?.matches ?? 0,
      active: current?.active ?? 0,
      focus: (current?.focus ?? 0) + 1,
    })
  }

  query(tabId: Id, query: string): void {
    const contents = this.#tabs.contents(tabId)
    const current = this.#state(tabId)
    if (!contents || !current) return
    this.#set(tabId, { ...current, query, matches: 0, active: 0 })
    if (query) contents.findInPage(query)
    else contents.stopFindInPage('clearSelection')
  }

  step(tabId: Id, forward: boolean): void {
    const current = this.#state(tabId)
    const contents = this.#tabs.contents(tabId)
    if (!current) {
      this.open(tabId)
      return
    }
    if (contents && current.query) contents.findInPage(current.query, { forward, findNext: true })
  }

  close(tabId: Id): void {
    const contents = this.#tabs.contents(tabId)
    if (contents) contents.stopFindInPage('keepSelection')
    this.#set(tabId, null)
  }

  #watch(tabId: Id, contents: WebContents): void {
    if (this.#watched.has(contents)) return
    this.#watched.add(contents)
    contents.on('found-in-page', (_event, result) => {
      const current = this.#state(tabId)
      if (!current) return
      this.#set(tabId, { ...current, matches: result.matches, active: result.activeMatchOrdinal })
    })
  }
}
