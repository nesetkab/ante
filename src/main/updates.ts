import { app, net } from 'electron'
import type { UpdateStatus } from '@shared/schema'
import { isNewer, parseRelease, RELEASES_URL, type Release } from '@shared/updates'
import type { Store } from './store'

const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const TIMEOUT_MS = 15_000

async function latestRelease(): Promise<Release | null> {
  const response = await net.fetch(RELEASES_URL, {
    headers: { accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
  return parseRelease(await response.json())
}

export class UpdateChecker {
  readonly #store: Store
  readonly #announce: (version: string) => void
  #timer: NodeJS.Timeout | null = null
  #announced: string | null = null
  #checking = false

  constructor(store: Store, announce: (version: string) => void) {
    this.#store = store
    this.#announce = announce
    this.#set({
      state: 'idle',
      current: app.getVersion(),
      version: null,
      url: null,
      checkedAt: null,
    })
  }

  start(): void {
    this.#timer = setTimeout(() => {
      void this.#automatic()
      this.#timer = setInterval(() => void this.#automatic(), CHECK_EVERY_MS)
    }, FIRST_CHECK_MS)
  }

  stop(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
  }

  get release(): Release | null {
    const status = this.#store.state.runtime.update
    return status?.state === 'available' && status.version && status.url
      ? { version: status.version, url: status.url }
      : null
  }

  async check(): Promise<UpdateStatus> {
    const previous = this.#store.state.runtime.update
    if (this.#checking && previous) return previous
    this.#checking = true
    const current = app.getVersion()
    this.#set({
      state: 'checking',
      current,
      version: previous?.version ?? null,
      url: previous?.url ?? null,
      checkedAt: previous?.checkedAt ?? null,
    })
    let status: UpdateStatus
    try {
      const release = await latestRelease()
      const available = release !== null && isNewer(release.version, current)
      status = {
        state: available ? 'available' : 'current',
        current,
        version: available ? release.version : null,
        url: available ? release.url : null,
        checkedAt: Date.now(),
      }
    } catch (error) {
      console.warn('[updates] check failed', error)
      status = {
        state: 'error',
        current,
        version: null,
        url: null,
        checkedAt: previous?.checkedAt ?? null,
      }
    } finally {
      this.#checking = false
    }
    this.#set(status)
    return status
  }

  async #automatic(): Promise<void> {
    if (!app.isPackaged || !this.#store.state.data.settings.checkUpdates) return
    const status = await this.check()
    if (status.state !== 'available' || !status.version) return
    if (this.#announced === status.version) return
    this.#announced = status.version
    this.#announce(status.version)
  }

  #set(status: UpdateStatus): void {
    this.#store.dispatch({ type: 'runtime/update', status })
  }
}
