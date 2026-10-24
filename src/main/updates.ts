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
  #known: Release | null = null
  #inflight: Promise<UpdateStatus> | null = null

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
    return this.#known
  }

  check(): Promise<UpdateStatus> {
    this.#inflight ??= this.#run().finally(() => {
      this.#inflight = null
    })
    return this.#inflight
  }

  async #run(): Promise<UpdateStatus> {
    const previous = this.#store.state.runtime.update
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
      this.#known = release !== null && isNewer(release.version, current) ? release : null
      status = this.#status(current, Date.now())
    } catch (error) {
      console.warn('[updates] check failed', error)
      status = this.#known
        ? this.#status(current, previous?.checkedAt ?? null)
        : {
            state: 'error',
            current,
            version: null,
            url: null,
            checkedAt: previous?.checkedAt ?? null,
          }
    }
    this.#set(status)
    return status
  }

  #status(current: string, checkedAt: number | null): UpdateStatus {
    const known = this.#known
    return {
      state: known ? 'available' : 'current',
      current,
      version: known?.version ?? null,
      url: known?.url ?? null,
      checkedAt,
    }
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
