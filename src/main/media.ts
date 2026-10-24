import { app, type WebContents } from 'electron'
import {
  MEDIA_PROBE_SCRIPT,
  MEDIA_TOGGLE_SCRIPT,
  MEDIA_WORLD_ID,
  PIP_ENTER_SCRIPT,
  PIP_EXIT_SCRIPT,
  mediaProbeSchema,
  nextMedia,
  pipTransitions,
  sameMedia,
  shownTabIds,
  type MediaProbe,
} from '@shared/media'
import type { Id, TabMedia } from '@shared/schema'
import type { Store } from './store'
import type { TabManager } from './tabs'

const POLL_MS = 2000
const SETTLE_MS = 150

export class MediaController {
  readonly #store: Store
  readonly #tabs: TabManager
  readonly #timers = new Map<Id, NodeJS.Timeout>()
  readonly #probing = new Set<Id>()
  readonly #autoPipped = new Set<Id>()
  #shown = new Set<Id>()

  constructor(store: Store, tabs: TabManager) {
    this.#store = store
    this.#tabs = tabs
    app.on('web-contents-created', (_event, contents) => this.#watch(contents))
    setInterval(() => this.#poll(), POLL_MS).unref()
  }

  refresh(id: Id, delay = SETTLE_MS): void {
    const existing = this.#timers.get(id)
    if (existing) clearTimeout(existing)
    this.#timers.set(
      id,
      setTimeout(() => {
        this.#timers.delete(id)
        void this.#probe(id)
      }, delay),
    )
  }

  async toggle(id: Id): Promise<void> {
    await this.#run(id, MEDIA_TOGGLE_SCRIPT, true)
    this.refresh(id)
  }

  async togglePip(id: Id): Promise<void> {
    if (this.#store.state.runtime.tabs[id]?.media?.pip) await this.#exitPip(id)
    else await this.#enterPip(id, false)
  }

  sync(): void {
    const { data, runtime } = this.#store.state
    const shown = shownTabIds(data)
    const { enter, exit } = pipTransitions(
      this.#shown,
      shown,
      runtime,
      this.#autoPipped,
      data.settings.autoPip,
    )
    this.#shown = shown
    for (const id of enter) void this.#enterPip(id, true)
    for (const id of exit) void this.#exitPip(id)
  }

  #watch(contents: WebContents): void {
    const tabId = () => this.#tabs.tabIdFor(contents)
    const refresh = () => {
      const id = tabId()
      if (id) this.refresh(id)
    }
    contents.on('media-started-playing', refresh)
    contents.on('media-paused', refresh)
    contents.on('audio-state-changed', refresh)
    contents.on('did-navigate', () => {
      const id = tabId()
      if (!id) return
      this.#autoPipped.delete(id)
      this.#set(id, null)
      this.refresh(id, 600)
    })
  }

  #poll(): void {
    for (const [id, runtime] of Object.entries(this.#store.state.runtime.tabs)) {
      if (runtime.media || runtime.audible) this.refresh(id, 0)
    }
  }

  async #run(id: Id, code: string, userGesture = false): Promise<unknown> {
    const contents = this.#tabs.contents(id)
    if (!contents || contents.isCrashed()) return null
    try {
      return await contents.executeJavaScriptInIsolatedWorld(
        MEDIA_WORLD_ID,
        [{ code }],
        userGesture,
      )
    } catch {
      return null
    }
  }

  async #probe(id: Id): Promise<void> {
    if (this.#probing.has(id)) return
    this.#probing.add(id)
    try {
      const parsed = mediaProbeSchema.safeParse(await this.#run(id, MEDIA_PROBE_SCRIPT))
      const probe: MediaProbe = parsed.success ? parsed.data : null
      const runtime = this.#store.state.runtime.tabs[id]
      if (!runtime) return
      this.#set(id, nextMedia(runtime.media, probe, runtime.audible, Date.now()))
      if (probe && !probe.pip) this.#autoPipped.delete(id)
    } finally {
      this.#probing.delete(id)
    }
  }

  #set(id: Id, media: TabMedia | null): void {
    const runtime = this.#store.state.runtime.tabs[id]
    if (!runtime || sameMedia(runtime.media, media)) return
    this.#store.dispatch({ type: 'runtime/tab', id, patch: { media } })
  }

  async #enterPip(id: Id, automatic: boolean): Promise<void> {
    const entered = (await this.#run(id, PIP_ENTER_SCRIPT, true)) === true
    if (entered && automatic) this.#autoPipped.add(id)
    this.refresh(id)
  }

  async #exitPip(id: Id): Promise<void> {
    this.#autoPipped.delete(id)
    await this.#run(id, PIP_EXIT_SCRIPT, true)
    this.refresh(id)
  }
}
