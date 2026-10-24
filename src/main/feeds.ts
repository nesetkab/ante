import { randomUUID } from 'node:crypto'
import { net } from 'electron'
import { discoverFeedUrl, parseFeed, type Feed } from '@shared/feeds'
import type { Id } from '@shared/schema'
import { getTab, rootOf } from '@shared/state/tree'
import { hostOf } from '@shared/url'
import type { Store } from './store'

const REFRESH_MS = 30 * 60 * 1000
const TIMEOUT_MS = 15_000
const MAX_BYTES = 5 * 1024 * 1024

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new Error('Response too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function fetchText(url: string): Promise<{ text: string; type: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only web feeds can be fetched')
  const response = await net.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Request failed with ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) throw new Error('Response too large')
  return { text: await readCapped(response), type: response.headers.get('content-type') ?? '' }
}

export type FollowResult = { ok: true; name: string } | { ok: false; message: string }

export class FeedManager {
  readonly #store: Store
  readonly #refreshing = new Set<Id>()

  constructor(store: Store) {
    this.#store = store
  }

  start(): () => void {
    void this.refreshAll()
    const timer = setInterval(() => void this.refreshAll(), REFRESH_MS)
    return () => clearInterval(timer)
  }

  async refreshAll(): Promise<void> {
    const folders = Object.values(this.#store.state.data.items).filter(
      (item) => item.kind === 'folder' && item.feedUrl,
    )
    await Promise.all(folders.map((folder) => this.refresh(folder.id)))
  }

  async refresh(folderId: Id): Promise<void> {
    const folder = this.#store.state.data.items[folderId]
    if (folder?.kind !== 'folder' || !folder.feedUrl || this.#refreshing.has(folderId)) return
    this.#refreshing.add(folderId)
    try {
      const { text } = await fetchText(folder.feedUrl)
      const feed = parseFeed(text, folder.feedUrl)
      if (feed) this.#sync(folderId, feed)
    } catch (error) {
      console.warn('[feeds] refresh failed', folder.feedUrl, error)
    } finally {
      this.#refreshing.delete(folderId)
    }
  }

  async follow(tabId: Id): Promise<FollowResult> {
    const data = this.#store.state.data
    const tab = getTab(data, tabId)
    const spaceId = rootOf(data, tabId)?.spaceId
    if (!tab || !spaceId || !/^https?:/.test(tab.url)) {
      return { ok: false, message: 'Open a website to follow it' }
    }
    try {
      const page = await fetchText(tab.url)
      let feedUrl = tab.url
      let feed = /xml|rss|atom/.test(page.type) ? parseFeed(page.text, tab.url) : null
      if (!feed) {
        const discovered = discoverFeedUrl(page.text, tab.url)
        if (!discovered) return { ok: false, message: 'This site has no feed to follow' }
        feedUrl = discovered
        feed = parseFeed((await fetchText(discovered)).text, discovered)
      }
      if (!feed) return { ok: false, message: 'This site has no feed to follow' }
      const existing = Object.values(this.#store.state.data.items).find(
        (item) => item.kind === 'folder' && item.feedUrl === feedUrl,
      )
      const name = feed.title || hostOf(tab.url)
      if (existing) return { ok: true, name }
      const id = randomUUID()
      this.#store.dispatch({ type: 'feed/create', id, spaceId, name, feedUrl })
      this.#sync(id, feed)
      return { ok: true, name }
    } catch (error) {
      console.warn('[feeds] follow failed', tab.url, error)
      return { ok: false, message: 'Could not reach this site' }
    }
  }

  #sync(folderId: Id, feed: Feed): void {
    this.#store.dispatch({
      type: 'feed/sync',
      id: folderId,
      entries: feed.entries.map((entry) => ({ ...entry, id: randomUUID() })),
      now: Date.now(),
    })
  }
}
