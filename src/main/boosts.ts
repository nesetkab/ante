import { app, type WebContents } from 'electron'
import {
  BOOST_WORLD_ID,
  composeCssForUrl,
  hostnameOf,
  domainMatches,
  scriptsForUrl,
} from '@shared/boosts'
import type { Boost } from '@shared/schema'
import type { Store } from './store'
import type { TabManager } from './tabs'

interface BoostedDocument {
  ready: boolean
  generation: number
  key: string | null
  css: string
  queue: Promise<void>
}

export class BoostManager {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #documents = new Map<WebContents, BoostedDocument>()

  constructor(store: Store, tabs: TabManager) {
    this.#store = store
    this.#tabs = tabs
  }

  start(): void {
    app.on('web-contents-created', (_event, contents) => this.#watch(contents))
    this.#store.subscribe((change) => {
      if (change.prev.data.boosts !== change.state.data.boosts) this.refresh()
    })
  }

  refresh(): void {
    for (const [contents, document] of this.#documents) this.#schedule(contents, document)
  }

  appliedCss(contents: WebContents): string | null {
    return this.#documents.get(contents)?.css ?? null
  }

  tabsMatching(boost: Boost): WebContents[] {
    return [...this.#documents.keys()].filter((contents) => {
      if (contents.isDestroyed()) return false
      const host = hostnameOf(contents.getURL())
      return host !== null && domainMatches(host, boost.domain)
    })
  }

  #watch(contents: WebContents): void {
    contents.on('did-navigate', () => {
      const document = this.#documents.get(contents)
      if (!document) return
      document.ready = false
      document.generation += 1
      document.key = null
      document.css = ''
    })
    contents.on('dom-ready', () => this.#onDomReady(contents))
    contents.once('destroyed', () => this.#documents.delete(contents))
  }

  #onDomReady(contents: WebContents): void {
    if (this.#tabs.tabIdFor(contents) === null) return
    const existing = this.#documents.get(contents)
    const document: BoostedDocument = existing ?? {
      ready: false,
      generation: 0,
      key: null,
      css: '',
      queue: Promise.resolve(),
    }
    document.ready = true
    document.generation += 1
    document.key = null
    document.css = ''
    this.#documents.set(contents, document)
    this.#schedule(contents, document)
    for (const code of scriptsForUrl(this.#store.state.data.boosts, contents.getURL())) {
      contents
        .executeJavaScriptInIsolatedWorld(BOOST_WORLD_ID, [{ code }])
        .catch((error: unknown) => {
          console.warn('[boosts] script failed', error)
        })
    }
  }

  #schedule(contents: WebContents, document: BoostedDocument): void {
    document.queue = document.queue
      .then(() => this.#sync(contents, document))
      .catch((error: unknown) => {
        console.warn('[boosts] failed to apply css', error)
      })
  }

  async #sync(contents: WebContents, document: BoostedDocument): Promise<void> {
    if (contents.isDestroyed() || !document.ready) return
    const generation = document.generation
    const css = composeCssForUrl(this.#store.state.data.boosts, contents.getURL())
    if (css === document.css) return
    if (document.key) {
      const key = document.key
      document.key = null
      document.css = ''
      await contents.removeInsertedCSS(key).catch(() => undefined)
    }
    if (!css || generation !== document.generation || contents.isDestroyed()) return
    const key = await contents.insertCSS(css)
    if (generation !== document.generation) return
    document.key = key
    document.css = css
  }
}
