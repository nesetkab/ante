import { join } from 'node:path'
import type { Session } from 'electron'
import type { Store } from '../store'

const pagePreloadPath = join(import.meta.dirname, '../preload/page.cjs')
const WEB_URLS = ['http://*/*', 'https://*/*']

export class PrivacySignals {
  readonly #store: Store
  readonly #preloads = new Map<Session, string | null>()

  constructor(store: Store) {
    this.#store = store
  }

  get #enabled(): boolean {
    return this.#store.state.data.settings.globalPrivacyControl
  }

  attach(session: Session): void {
    session.webRequest.onBeforeSendHeaders({ urls: WEB_URLS }, (details, callback) => {
      if (!this.#enabled) {
        callback({})
        return
      }
      callback({ requestHeaders: { ...details.requestHeaders, 'Sec-GPC': '1' } })
    })
    this.#preloads.set(session, null)
    this.#apply(session)
  }

  sync(): void {
    for (const session of this.#preloads.keys()) this.#apply(session)
  }

  #apply(session: Session): void {
    const id = this.#preloads.get(session) ?? null
    if (this.#enabled && id === null) {
      this.#preloads.set(
        session,
        session.registerPreloadScript({ type: 'frame', filePath: pagePreloadPath }),
      )
    } else if (!this.#enabled && id !== null) {
      session.unregisterPreloadScript(id)
      this.#preloads.set(session, null)
    }
  }
}
